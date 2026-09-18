import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { TranscriptionService } from '../ai/transcription.service';
import { TriageService } from '../ai/triage.service';
import { Lang, TriageHints, TriageResult, URGENCY_RANK, Urgency } from '../ai/triage.types';
import { CryptoService } from '../common/crypto.service';
import { maskPhone, normalizePhone } from '../common/phone';
import { RateLimiter } from '../common/rate-limiter';
import { genRef } from '../common/ref';
import { SmsService } from '../common/sms.service';
import { Case } from '../entities/case.entity';
import { Responder } from '../entities/responder.entity';
import { SMS, STATUS_TEXT } from '../i18n/messages';
import { CaseEventsService } from './case-events.service';
import { escalationDeadline, NotifyService } from './notify.service';
import { ReferralService } from './referral.service';

export interface CreateCaseInput {
  channel: string;
  language: Lang;
  phone?: string;
  ward?: string;
  narrative?: string;
  hints?: TriageHints;
  silent?: boolean;
  safeToContact?: boolean;
  consentSharePolice?: boolean;
  callbackWindow?: string;
}

/** Fields safe to show in the responder console (nothing encrypted, nothing identifying). */
export interface CaseView {
  id: string; ref: string; channel: string; language: string; phoneMasked: string;
  safeToContact: boolean; consentSharePolice: boolean; ward: string; triage: TriageResult;
  pathway: Case['pathway']; urgency: string; status: string; acknowledgedBy: string; acknowledgedAt: Date;
  escalateAt: Date; callbackWindow: string; createdAt: Date; updatedAt: Date;
}

export const CLOSED = ['RESOLVED', 'FALSE_ALARM'];

@Injectable()
export class CasesService implements OnModuleInit {
  private readonly logger = new Logger(CasesService.name);
  erasedCount = 0;
  /** New cases per phone per hour. Beyond this, reports are attached to that phone's latest case instead of opening new ones. */
  private readonly reportLimiter = new RateLimiter(() => Number(process.env.RATE_LIMIT_REPORTS_PER_HOUR ?? 3), () => 60 * 60 * 1000);

  constructor(
    @InjectRepository(Case) private readonly cases: Repository<Case>,
    private readonly crypto: CryptoService,
    private readonly triage: TriageService,
    private readonly transcription: TranscriptionService,
    private readonly referral: ReferralService,
    private readonly notify: NotifyService,
    private readonly events: CaseEventsService,
    private readonly sms: SmsService,
  ) {}

  /**
   * Fail fast on the wrong ENCRYPTION_KEY: if none of the most recent encrypted fields can be read, every
   * decrypt would fail later, mid-request, and new reports would be written under a key the old ones do not share.
   */
  async onModuleInit() {
    const recent = await this.cases.find({ where: [{ phoneEnc: Not(IsNull()) }, { narrativeEnc: Not(IsNull()) }], order: { createdAt: 'DESC' }, take: 5 });
    const samples = recent.map((c) => c.phoneEnc || c.narrativeEnc);
    if (!samples.length) return;
    const readable = samples.filter((s) => { try { this.crypto.decrypt(s); return true; } catch { return false; } }).length;
    if (readable === 0) {
      throw new Error('ENCRYPTION_KEY does not match the data already in the database: none of the latest encrypted fields can be decrypted. '
        + 'Set the key that wrote this data, or start from an empty database (locally: delete data/sauti-salama.sqlite).');
    }
    if (readable < samples.length) this.logger.error(`${samples.length - readable} of the ${samples.length} latest encrypted fields cannot be decrypted`);
  }

  // ---------------------------------------------------------------- creation

  /** USSD / SMS / silent alerts: triage now, notify, return the case with its reference. */
  async createCase(input: CreateCaseInput): Promise<Case> {
    const existing = await this.overReportLimit(input.phone);
    if (existing) return this.addFollowUp(existing, input);
    const c = this.cases.create({
      ref: await this.newRef(),
      channel: input.channel,
      language: input.language,
      ward: input.ward || null,
      safeToContact: !!input.safeToContact,
      consentSharePolice: !!input.consentSharePolice,
      callbackWindow: input.callbackWindow || null,
      status: 'OPEN',
    });
    this.attachPhone(c, input.phone);
    if (input.narrative) c.narrativeEnc = this.crypto.encrypt(input.narrative);

    const tInput = { text: input.narrative, language: input.language, channel: input.channel, hints: { ...(input.hints || {}), ward: input.ward } };
    let triage: TriageResult;
    if (input.silent) triage = this.triage.silent(tInput);
    else if (input.narrative) triage = await this.triage.triage(tInput);
    else triage = this.triage.structured(tInput);
    if (!c.ward && triage.location_mentions?.length) c.ward = triage.location_mentions[0];
    this.applyTriage(c, triage);

    await this.cases.save(c);
    await this.events.add(c.id, 'CREATED', input.channel, `Report received via ${input.channel}`);
    await this.events.add(c.id, 'TRIAGED', triage.provider, `Urgency ${c.urgency}. ${triage.summary_en}`);
    this.dispatch(c);
    return c;
  }

  /** Voice line: give the caller a reference immediately, process the recording in the background. */
  async createPending(input: { channel: string; language: Lang; phone?: string; hints?: TriageHints }): Promise<Case> {
    const existing = await this.overReportLimit(input.phone);
    if (existing) return existing; // processRecording() attaches the recording to it as a follow-up
    // escalateAt is set now so that a crash before the recording is processed still reaches Tier 2.
    const c = this.cases.create({ ref: await this.newRef(), channel: input.channel, language: input.language, status: 'PROCESSING', urgency: 'medium', escalateAt: escalationDeadline() });
    this.attachPhone(c, input.phone);
    await this.cases.save(c);
    await this.events.add(c.id, 'CREATED', input.channel, 'Call in progress; recording pending');
    return c;
  }

  /**
   * One turn of a live call. Each turn appends what was said to the case and refreshes the brief; the first turn
   * alerts responders, because a caller must never have to finish the call before help is on its way. Later turns
   * only re-alert when the urgency has risen.
   */
  async applyCallTurn(id: string, opts: { turn: string; triage: TriageResult; header?: string; channel?: string }): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { id } });
    if (!c) return null;
    const first = c.status === 'PROCESSING';
    const previousUrgency = (c.urgency || 'low') as Urgency;
    if (opts.channel) c.channel = opts.channel;
    if (opts.turn) {
      let previous = c.narrativeEnc ? this.crypto.tryDecrypt(c.narrativeEnc, `narrative of ${c.ref}`) : '';
      if (previous === null) previous = '[Earlier text could not be decrypted]';
      const addition = [opts.header, opts.turn].filter(Boolean).join('\n');
      c.narrativeEnc = this.crypto.encrypt(`${previous ? `${previous}\n\n` : ''}${addition}`.slice(-8000));
    }
    if (!c.ward && opts.triage.location_mentions?.length) c.ward = opts.triage.location_mentions[0];
    this.applyTriage(c, opts.triage);
    if (first) c.status = 'OPEN';
    else if (CLOSED.includes(c.status)) c.status = 'OPEN';
    await this.cases.save(c);

    const raised = URGENCY_RANK[c.urgency as Urgency] > URGENCY_RANK[previousUrgency];
    if (first) {
      await this.events.add(c.id, 'TRIAGED', opts.triage.provider, `Urgency ${c.urgency}. ${opts.triage.summary_en}`);
      this.dispatch(c);
    } else {
      await this.events.add(c.id, 'CALL_UPDATED', opts.triage.provider, `Urgency ${c.urgency}${raised ? ` (raised from ${previousUrgency})` : ''}. ${opts.triage.summary_en}`);
      if (raised) this.dispatch(c);
    }
    return c;
  }

  // ---------------------------------------------------------------- updates

  /**
   * Contact consent. By SMS a phoneHash is passed and must match the reporting phone: otherwise anyone who
   * learned a reference could switch on texts to a phone the survivor said is watched.
   */
  async setConsent(ref: string, safeToContact: boolean, phoneHash?: string): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c || (phoneHash !== undefined && c.phoneHash !== phoneHash)) return null;
    c.safeToContact = safeToContact;
    if (c.triage) c.pathway = this.referral.build(c.triage, { ward: c.ward, safeToContact, consentSharePolice: c.consentSharePolice, channel: c.channel });
    await this.cases.save(c);
    await this.events.add(c.id, 'CONSENT', 'survivor', safeToContact ? 'Safe to call/text this phone' : 'Phone NOT safe: no calls or SMS');
    if (safeToContact && c.status !== 'PROCESSING') await this.notify.notifySurvivor(c);
    return c;
  }

  /** Police involvement is the survivor's choice. Same phone rule as setConsent(). */
  async setPoliceConsent(ref: string, consent: boolean, phoneHash?: string): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c || (phoneHash !== undefined && c.phoneHash !== phoneHash)) return null;
    c.consentSharePolice = consent;
    if (c.triage) c.pathway = this.referral.build(c.triage, { ward: c.ward, safeToContact: c.safeToContact, consentSharePolice: consent, channel: c.channel });
    await this.cases.save(c);
    await this.events.add(c.id, 'CONSENT_POLICE', 'survivor', consent ? 'Survivor asked for help reporting to the police' : 'Survivor does not want police involvement');
    return c;
  }

  async acknowledge(ref: string, actor: string, responder?: Responder): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    if (CLOSED.includes(c.status)) return c;
    c.status = 'ACKNOWLEDGED';
    c.acknowledgedBy = actor;
    if (responder) c.acknowledgedByResponder = responder;
    c.acknowledgedAt = c.acknowledgedAt || new Date();
    c.escalateAt = null;
    await this.cases.save(c);
    await this.events.add(c.id, 'ACKNOWLEDGED', actor, 'Responder accepted the case');
    if (c.safeToContact && c.phoneEnc) {
      const phone = this.crypto.tryDecrypt(c.phoneEnc, `phone of ${c.ref}`);
      if (phone) await this.sms.send(phone, SMS.acknowledged(c.language as Lang, c.ref, actor), 'survivor');
      else await this.events.add(c.id, 'SURVIVOR_SMS_FAILED', 'system', 'Acceptance SMS not sent: the stored phone number could not be decrypted');
    }
    return c;
  }

  async resolve(ref: string, actor: string, outcome: 'RESOLVED' | 'FALSE_ALARM' = 'RESOLVED', note?: string): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    c.status = outcome;
    c.escalateAt = null;
    await this.cases.save(c);
    await this.events.add(c.id, outcome, actor, note || '');
    return c;
  }

  /** Right to erasure (Kenya DPA 2019 s.40): hard-delete the case and its audit trail, together or not at all. */
  async erase(ref: string, opts: { actor: string; phoneHash?: string }): Promise<boolean> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return false;
    if (opts.phoneHash && c.phoneHash !== opts.phoneHash) return false; // only the reporting phone can erase via USSD/SMS
    await deleteCase(this.cases, c.id);
    this.erasedCount++;
    this.logger.log(`Case ${ref} erased by ${opts.actor}`);
    return true;
  }

  // ---------------------------------------------------------------- reads

  findByRef(ref: string): Promise<Case | null> { return this.cases.findOne({ where: { ref } }); }

  async list(limit = 100): Promise<CaseView[]> {
    const rows = await this.cases.find({ order: { createdAt: 'DESC' }, take: limit });
    return rows.map((c) => this.view(c));
  }

  /** Full detail for the console. Decrypting the narrative is an audited action. */
  async detail(ref: string, actor: string) {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    await this.events.add(c.id, 'ACCESSED', actor, 'Narrative viewed in console');
    const narrative = c.narrativeEnc ? this.crypto.tryDecrypt(c.narrativeEnc, `narrative of ${c.ref}`) : null;
    const narrativeUnreadable = !!c.narrativeEnc && narrative === null;
    if (narrativeUnreadable) await this.events.add(c.id, 'DECRYPT_FAILED', 'system', 'Narrative could not be decrypted');
    const events = await this.events.list(c.id);
    return { ...this.view(c), narrative, narrativeUnreadable, hasRecording: !!c.recordingUrlEnc, events };
  }

  /** Reveal the survivor's phone only with consent; logged. */
  async revealContact(ref: string, actor: string): Promise<{ phone: string } | { error: string } | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    if (!c.safeToContact) return { error: 'The survivor said this phone is not safe to contact.' };
    if (!c.phoneEnc) return { error: 'No phone number on this case.' };
    const phone = this.crypto.tryDecrypt(c.phoneEnc, `phone of ${c.ref}`);
    if (!phone) {
      await this.events.add(c.id, 'DECRYPT_FAILED', 'system', 'Phone number could not be decrypted');
      return { error: 'The stored phone number could not be decrypted.' };
    }
    await this.events.add(c.id, 'CONTACT_REVEALED', actor, 'Phone number revealed to responder');
    return { phone };
  }

  /** Survivor-facing status; only the reporting phone can query it. */
  async statusFor(ref: string, phoneHash: string, lang: Lang): Promise<string | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c || c.phoneHash !== phoneHash) return null;
    return STATUS_TEXT(lang, c.status, c.acknowledgedBy);
  }

  async findLatestByPhoneHash(phoneHash: string): Promise<Case | null> {
    return this.cases.findOne({ where: { phoneHash }, order: { createdAt: 'DESC' } });
  }

  survivorSteps(c: Case, lang: Lang, max = 2): string {
    return c.pathway ? this.referral.survivorSteps(c.pathway, lang, max) : '';
  }

  // ---------------------------------------------------------------- helpers

  private view(c: Case): CaseView {
    return {
      id: c.id, ref: c.ref, channel: c.channel, language: c.language, phoneMasked: c.phoneMasked,
      safeToContact: c.safeToContact, consentSharePolice: c.consentSharePolice, ward: c.ward, triage: c.triage,
      pathway: c.pathway, urgency: c.urgency, status: c.status, acknowledgedBy: c.acknowledgedBy, acknowledgedAt: c.acknowledgedAt,
      escalateAt: c.escalateAt, callbackWindow: c.callbackWindow, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
  }

  /** Returns the phone's latest case when the phone has used up its new-report allowance, otherwise null. */
  private async overReportLimit(phone?: string): Promise<Case | null> {
    if (!phone) return null;
    const hash = this.crypto.hash(normalizePhone(phone));
    if (this.reportLimiter.take(hash)) return null;
    return this.cases.findOne({ where: { phoneHash: hash }, order: { createdAt: 'DESC' } });
  }

  /**
   * A report beyond the limit is never thrown away: it is added to the phone's latest case. Only offline
   * rules triage runs (no AI cost), responders are re-alerted only if urgency rises or a closed case reopens,
   * and the most restrictive contact choice wins.
   */
  private async addFollowUp(c: Case, input: CreateCaseInput): Promise<Case> {
    const tInput = { text: input.narrative, language: input.language, channel: input.channel, hints: { ...(input.hints || {}), ward: input.ward || c.ward || undefined } };
    const quick = input.silent ? this.triage.silent(tInput) : input.narrative ? this.triage.rulesOnly(tInput) : this.triage.structured(tInput);
    if (input.narrative) {
      let previous = c.narrativeEnc ? this.crypto.tryDecrypt(c.narrativeEnc, `narrative of ${c.ref}`) : '';
      if (previous === null) previous = '[Earlier text could not be decrypted]';
      const note = `[Follow-up ${new Date().toISOString().slice(11, 16)} UTC via ${input.channel.replace('_', ' ')}] ${input.narrative}`;
      c.narrativeEnc = this.crypto.encrypt(`${previous ? `${previous}\n\n` : ''}${note}`.slice(-8000));
    }
    if (input.safeToContact === false) c.safeToContact = false;
    const reopened = CLOSED.includes(c.status);
    const raised = URGENCY_RANK[quick.urgency as Urgency] > URGENCY_RANK[(c.urgency || 'low') as Urgency];
    if (raised) {
      const t = c.triage || quick;
      const union = (a: string[] = [], b: string[] = []) => Array.from(new Set([...a, ...b]));
      c.triage = {
        ...t,
        urgency: quick.urgency,
        immediate_danger: t.immediate_danger || quick.immediate_danger,
        violence_types: union(t.violence_types, quick.violence_types),
        risk_flags: union(t.risk_flags, quick.risk_flags),
        needs: union(t.needs, quick.needs),
      };
      this.applyTriage(c, c.triage);
    }
    if (reopened) c.status = 'OPEN';
    await this.cases.save(c);
    const what = input.silent ? 'Danger alert' : input.narrative ? 'Message' : 'Menu report';
    await this.events.add(c.id, 'FOLLOW_UP', input.channel, `${what} from the same phone added to this case (limit of new reports reached)${raised ? `; urgency raised to ${c.urgency}` : ''}${reopened ? '; case reopened' : ''}`);
    if (raised || reopened) this.dispatch(c);
    return c;
  }

  private applyTriage(c: Case, triage: TriageResult): void {
    c.triage = triage;
    c.urgency = triage.urgency;
    c.pathway = this.referral.build(triage, { ward: c.ward, safeToContact: c.safeToContact, consentSharePolice: c.consentSharePolice, channel: c.channel });
  }

  private attachPhone(c: Case, phone?: string): void {
    if (!phone) return;
    const n = normalizePhone(phone);
    c.phoneEnc = this.crypto.encrypt(n);
    c.phoneHash = this.crypto.hash(n);
    c.phoneMasked = maskPhone(n);
  }

  private dispatch(c: Case): void {
    this.notify.notifyTier1(c).catch((e) => this.logger.error(`notify failed for ${c.ref}: ${e}`));
  }

  private async newRef(): Promise<string> {
    for (let i = 0; i < 10; i++) {
      const ref = genRef();
      if (!(await this.cases.findOne({ where: { ref } }))) return ref;
    }
    throw new Error('Could not allocate a unique case reference');
  }
}

/**
 * Deletes a case and its audit trail (erasure requests and retention). case_events.caseId cascades on delete, so
 * both go in one statement: there is never a moment with the case gone and its trail left, or the reverse.
 */
export async function deleteCase(cases: Repository<Case>, id: string): Promise<void> {
  await cases.delete({ id });
}
