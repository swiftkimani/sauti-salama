import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, LessThanOrEqual, Repository } from 'typeorm';
import { Lang } from '../ai/triage.types';
import { CryptoService } from '../common/crypto.service';
import { OutboxMessage, SmsService } from '../common/sms.service';
import { Case, CaseStatus } from '../entities/case.entity';
import { Responder } from '../entities/responder.entity';
import { SMS } from '../i18n/messages';
import { RespondersService } from '../responders/responders.service';
import { CaseEventsService } from './case-events.service';
import { ReferralService } from './referral.service';

/** Statuses that still need somebody to accept the case. */
export const AWAITING: CaseStatus[] = ['OPEN', 'PROCESSING'];
/**
 * Everything nobody has accepted yet - including a case Tier 2 has been told about. "Nobody answered
 * the alert" is the normal failure in community response, not an edge case, so an escalated case stays
 * in the sweeper's sight until a person accepts it or a coordinator is told plainly that none did.
 */
export const UNACCEPTED: CaseStatus[] = [...AWAITING, 'ESCALATED'];
/** How often due escalations are looked for, and how long a claimed escalation waits before it is retried. */
const SWEEP_MS = 15 * 1000;
export const ESCALATION_RETRY_MS = 2 * 60 * 1000;

export const escalationMinutes = () => Math.max(0, Number(process.env.ESCALATION_MINUTES ?? 10));
export const escalationDeadline = (now = Date.now()) => new Date(now + escalationMinutes() * 60 * 1000);
/**
 * How long to wait for a Tier-2 acknowledgement before repeating the alert, one entry per repeat.
 * After the last one the case is marked UNANSWERED: there is nobody left to page automatically.
 * Set ESCALATION_REPEAT_MINUTES to an empty string to alert Tier 2 once and stop.
 */
export const escalationRepeats = (): number[] =>
  (process.env.ESCALATION_REPEAT_MINUTES ?? '10,20').split(',')
    .map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0).map((m) => m * 60 * 1000);

interface FanOut { sent: number; detail: string }

/**
 * Tiered routing: Tier 1 (community responders for the ward) first; if nobody acknowledges
 * within ESCALATION_MINUTES the case escalates to the Tier 2 institutional desk.
 * The survivor only ever receives an SMS if they said this phone is safe.
 *
 * The escalation deadline lives on the case row (escalateAt) and a sweeper acts on it, so it survives
 * restarts and works across instances: an escalation is claimed with a conditional update before
 * anything is sent, and a claim whose alerts all fail is retried.
 */
@Injectable()
export class NotifyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotifyService.name);
  private sweeper?: NodeJS.Timeout;
  private sweeping = false;

  constructor(
    @InjectRepository(Case) private readonly cases: Repository<Case>,
    private readonly responders: RespondersService,
    private readonly sms: SmsService,
    private readonly events: CaseEventsService,
    private readonly crypto: CryptoService,
    private readonly referral: ReferralService,
  ) {}

  async onModuleInit() {
    await this.backfillDeadlines();
    this.sweeper = setInterval(() => this.sweep().catch((e) => this.logger.error(`escalation sweep failed: ${e}`)), SWEEP_MS);
    this.sweeper.unref?.();
  }

  onModuleDestroy() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  /**
   * Cases waiting for a responder but without a deadline were created before deadlines were stored, when the
   * escalation timer lived in memory and died with the process. They are overdue by definition.
   */
  async backfillDeadlines(now = new Date()): Promise<number> {
    const orphaned = await this.cases.update({ status: In(AWAITING), escalateAt: IsNull() }, { escalateAt: now });
    if (orphaned.affected) this.logger.warn(`${orphaned.affected} open case(s) had no escalation deadline; escalating them now`);
    return orphaned.affected || 0;
  }

  async notifyTier1(c: Case): Promise<void> {
    // The deadline is stored before anything is sent: whatever fails below, the case still escalates.
    await this.setEscalation(c, escalationDeadline());
    const list = this.responders.forWard(c.ward, 1);
    const out = await this.fanOut(list, this.responderSms(c, 1));
    if (out.sent === 0) {
      // Nobody in Tier 1 was reached, so there is nobody to wait for.
      await this.setEscalation(c, new Date());
      await this.events.add(c.id, 'NOTIFIED_TIER1', 'system', `${out.detail}; escalating to Tier 2 now`);
    } else {
      await this.events.add(c.id, 'NOTIFIED_TIER1', 'system', out.detail);
    }
    if (c.safeToContact) await this.notifySurvivor(c).catch((e) => this.logger.error(`survivor SMS failed for ${c.ref}: ${e}`));
  }

  async notifySurvivor(c: Case): Promise<void> {
    if (!c.safeToContact || !c.phoneEnc || !c.pathway) return;
    const phone = this.crypto.tryDecrypt(c.phoneEnc, `phone of ${c.ref}`);
    if (!phone) {
      await this.events.add(c.id, 'SURVIVOR_SMS_FAILED', 'system', 'Next steps not sent: the stored phone number could not be decrypted');
      return;
    }
    const steps = this.referral.survivorSteps(c.pathway, c.language as Lang);
    const m = await this.sms.send(phone, SMS.nextSteps(c.language as Lang, c.ref, steps), 'survivor');
    await this.events.add(c.id, delivered(m) ? 'SURVIVOR_SMS' : 'SURVIVOR_SMS_FAILED', 'system',
      delivered(m) ? 'Next steps sent to survivor (consented)' : `Next steps not accepted by the SMS gateway: ${m.failureReason || m.status}`);
  }

  /** Escalates every case whose deadline has passed. Runs on a timer; also callable directly (tests, ops). */
  async sweep(now = new Date()): Promise<number> {
    if (this.sweeping) return 0;
    this.sweeping = true;
    try {
      const due = await this.cases.find({ select: { id: true }, where: { status: In(UNACCEPTED), escalateAt: LessThanOrEqual(now) }, order: { escalateAt: 'ASC' }, take: 50 });
      let escalated = 0;
      for (const { id } of due) {
        if (await this.escalate(id, now).catch((e) => { this.logger.error(`escalation of case ${id} failed: ${e}`); return false; })) escalated++;
      }
      return escalated;
    } finally {
      this.sweeping = false;
    }
  }

  /** Returns true when Tier 2 was alerted. False when the case no longer needs it, another instance has it, or every alert failed (it is retried). */
  async escalate(id: string, now = new Date()): Promise<boolean> {
    // Claim: push the deadline out by the retry interval. Only one caller can win this update.
    const claim = await this.cases.update({ id, status: In(UNACCEPTED), escalateAt: LessThanOrEqual(now) }, { escalateAt: new Date(now.getTime() + ESCALATION_RETRY_MS) });
    if (!claim.affected) return false;
    const c = await this.cases.findOne({ where: { id } });
    if (!c) return false;
    // How many times Tier 2 has already been told, so a repeat is numbered and eventually stops.
    const sent = (await this.events.list(c.id)).filter((e) => e.type === 'ESCALATED' || e.type === 'ESCALATION_REPEATED').length;
    const why = c.status === 'ESCALATED' ? `Still not accepted after Tier-2 alert ${sent}` :
      c.status === 'PROCESSING' ? 'Recording still unprocessed at the deadline' : 'No Tier-1 acknowledgement before the deadline';
    const out = await this.fanOut(this.responders.forWard(c.ward, 2), this.responderSms(c, 2, sent + 1));
    if (out.sent === 0) {
      this.logger.error(`Escalation of ${c.ref} reached no Tier-2 desk; retrying in ${ESCALATION_RETRY_MS / 60000} min`);
      await this.events.add(c.id, 'ESCALATION_FAILED', 'system', `${why}; ${out.detail}; retrying in ${ESCALATION_RETRY_MS / 60000} min`);
      return false;
    }
    const repeats = escalationRepeats();
    const wait = repeats[sent];
    await this.cases.update({ id, status: In(UNACCEPTED) }, { status: 'ESCALATED', escalateAt: wait ? new Date(now.getTime() + wait) : null });
    await this.events.add(c.id, sent ? 'ESCALATION_REPEATED' : 'ESCALATED', 'system',
      `${why}; Tier 2: ${out.detail}${wait ? `; repeating in ${wait / 60000} min if nobody accepts` : ''}`);
    if (!wait) {
      // Nothing is paged automatically from here. Say so loudly: a survivor is still waiting.
      this.logger.error(`Case ${c.ref} was alerted to Tier 2 ${sent + 1} time(s) and nobody accepted it`);
      await this.events.add(c.id, 'UNANSWERED', 'system', `Tier 2 alerted ${sent + 1} time(s); nobody accepted. A coordinator must act.`);
    }
    return true;
  }

  private async setEscalation(c: Case, at: Date | null): Promise<void> {
    c.escalateAt = at;
    await this.cases.update({ id: c.id }, { escalateAt: at });
  }

  /** Sends to every responder at once, so one slow or failing number never holds up the others. */
  private async fanOut(list: Responder[], msg: string): Promise<FanOut> {
    if (!list.length) return { sent: 0, detail: 'no responders configured' };
    const results = await Promise.allSettled(list.map((r) => this.sms.send(r.phone, msg, 'responder')));
    const ok: string[] = [], failed: string[] = [];
    results.forEach((res, i) => {
      if (res.status === 'fulfilled' && delivered(res.value)) ok.push(list[i].name);
      else failed.push(`${list[i].name} (${res.status === 'fulfilled' ? res.value.failureReason || res.value.status : String(res.reason).slice(0, 80)})`);
    });
    const detail = [`${ok.length} of ${list.length} alert(s) accepted by the SMS gateway`, ok.length ? `sent to ${ok.join(', ')}` : '', failed.length ? `FAILED: ${failed.join(', ')}` : '']
      .filter(Boolean).join('; ');
    return { sent: ok.length, detail };
  }

  /**
   * The first 160 characters are one whole SMS segment, and a multipart alert can reach a feature
   * phone with its later parts missing. So everything needed to act - urgency, reference, area,
   * whether the phone may be called, and how to accept - fits in that first segment; detail follows.
   * The free-text brief is fenced and last: it is derived from what the caller said, not written by us.
   */
  private responderSms(c: Case, tier: 1 | 2, round = 1): string {
    const label = tier === 1 ? 'ALERT' : round > 1 ? `ESCALATION x${round}` : 'ESCALATION';
    const head = [
      `SAUTI SALAMA ${label} [${c.urgency.toUpperCase()}] ${c.ref}`,
      `Area: ${(c.ward || 'not stated').slice(0, 20)} | ${c.channel.replace('_', ' ')} | ${c.language}`,
      `Phone: ${c.safeToContact ? 'consented, reveal in console' : 'DO NOT call or text'}`,
      `Reply ACK ${c.ref} to accept.`,
    ].join('\n');
    const detail = [
      `Next: ${c.pathway ? this.referral.survivorSteps(c.pathway, 'en', 1) : 'see console'}`,
      // On a call the alert can go out before the caller has answered; the console always shows the latest answers.
      `Police: ${c.consentSharePolice ? 'survivor asked for help reporting' : 'not requested (check console first)'}`,
      `Brief: ${(c.triage?.summary_en || 'Report received, details pending.').slice(0, 200)}`,
    ].join('\n');
    return `${head}\n--\n${detail}`;
  }
}

/** "logged" is the offline console mode, where nothing leaves the machine but the demo must still flow. */
const delivered = (m: OutboxMessage) => m.status === 'sent' || m.status === 'logged';
