import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lang } from '../ai/triage.types';
import { CryptoService } from '../common/crypto.service';
import { SmsService } from '../common/sms.service';
import { Case } from '../entities/case.entity';
import { SMS } from '../i18n/messages';
import { RespondersService } from '../responders/responders.service';
import { CaseEventsService } from './case-events.service';
import { ReferralService } from './referral.service';

/**
 * Tiered routing: Tier 1 (community responders for the ward) first; if nobody acknowledges
 * within ESCALATION_MINUTES the case escalates to the Tier 2 institutional desk.
 * The survivor only ever receives an SMS if they said this phone is safe.
 */
@Injectable()
export class NotifyService {
  private readonly logger = new Logger(NotifyService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(Case) private readonly cases: Repository<Case>,
    private readonly responders: RespondersService,
    private readonly sms: SmsService,
    private readonly events: CaseEventsService,
    private readonly crypto: CryptoService,
    private readonly referral: ReferralService,
  ) {}

  async notifyTier1(c: Case): Promise<void> {
    const list = this.responders.forWard(c.ward, 1);
    const msg = this.responderSms(c, 1);
    for (const r of list) await this.sms.send(r.phone, msg, 'responder');
    await this.events.add(c.id, 'NOTIFIED_TIER1', 'system', `${list.length} responder(s): ${list.map((r) => r.name).join(', ') || 'none configured'}`);
    if (c.safeToContact) await this.notifySurvivor(c);
    this.scheduleEscalation(c.ref);
  }

  async notifySurvivor(c: Case): Promise<void> {
    if (!c.safeToContact || !c.phoneEnc || !c.pathway) return;
    const phone = this.crypto.decrypt(c.phoneEnc);
    const steps = this.referral.survivorSteps(c.pathway, c.language as Lang);
    await this.sms.send(phone, SMS.nextSteps(c.language as Lang, c.ref, steps), 'survivor');
    await this.events.add(c.id, 'SURVIVOR_SMS', 'system', 'Next steps sent to survivor (consented)');
  }

  scheduleEscalation(ref: string): void {
    const minutes = Number(process.env.ESCALATION_MINUTES ?? 10);
    this.cancelEscalation(ref);
    const timer = setTimeout(() => this.escalate(ref).catch((e) => this.logger.error(`escalation failed: ${e}`)), Math.max(1, minutes * 60 * 1000));
    timer.unref?.();
    this.timers.set(ref, timer);
  }

  cancelEscalation(ref: string): void {
    const t = this.timers.get(ref);
    if (t) clearTimeout(t);
    this.timers.delete(ref);
  }

  async escalate(ref: string): Promise<void> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c || !['OPEN', 'PROCESSING'].includes(c.status)) return;
    const list = this.responders.forWard(c.ward, 2);
    const msg = this.responderSms(c, 2);
    for (const r of list) await this.sms.send(r.phone, msg, 'responder');
    c.status = 'ESCALATED';
    await this.cases.save(c);
    await this.events.add(c.id, 'ESCALATED', 'system', `No Tier-1 acknowledgement in ${process.env.ESCALATION_MINUTES ?? 10} min; ${list.length} Tier-2 desk(s) notified`);
  }

  private responderSms(c: Case, tier: 1 | 2): string {
    const summary = (c.triage?.summary_en || 'Report received, details pending.').slice(0, 220);
    const next = c.pathway ? this.referral.survivorSteps(c.pathway, 'en', 1) : 'see console';
    return [
      `SAUTI SALAMA ${tier === 2 ? 'ESCALATION' : 'ALERT'} [${c.urgency.toUpperCase()}] ${c.ref}`,
      summary,
      `Area: ${c.ward || 'not stated'} | Via: ${c.channel.replace('_', ' ')} | Lang: ${c.language}`,
      `Next: ${next}`,
      `Survivor phone: ${c.safeToContact ? 'consented - reveal in console' : 'NOT SAFE - do not call or text'}`,
      `Reply ACK ${c.ref} to accept.`,
    ].join('\n');
  }
}
