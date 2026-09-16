import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TranscriptionService } from '../ai/transcription.service';
import { TriageService } from '../ai/triage.service';
import { Lang, TriageHints, TriageResult, URGENCY_RANK, Urgency } from '../ai/triage.types';
import { CryptoService } from '../common/crypto.service';
import { maskPhone, normalizePhone } from '../common/phone';
import { RateLimiter } from '../common/rate-limiter';
import { genRef } from '../common/ref';
import { SmsService } from '../common/sms.service';
import { Case } from '../entities/case.entity';
import { SMS, STATUS_TEXT } from '../i18n/messages';
import { CaseEventsService } from './case-events.service';
import { NotifyService } from './notify.service';
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
  callbackWindow: string; createdAt: Date; updatedAt: Date;
}

const CLOSED = ['RESOLVED', 'FALSE_ALARM'];

@Injectable()
export class CasesService {
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
    const c = this.cases.create({ ref: await this.newRef(), channel: input.channel, language: input.language, status: 'PROCESSING', urgency: 'medium' });
    this.attachPhone(c, input.phone);
    await this.cases.save(c);
    await this.events.add(c.id, 'CREATED', input.channel, 'Call in progress; recording pending');
    return c;
  }

  async processRecording(id: string, recordingUrl: string, mockTranscript?: string): Promise<void> {
    const c = await this.cases.findOne({ where: { id } });
    if (!c) return;
    if (c.status !== 'PROCESSING') {
      // Over the per-phone limit: the call was attached to an existing case.
      try {
        const { text } = await this.transcription.transcribe(recordingUrl, { language: c.language as Lang, mockTranscript });
        await this.addFollowUp(c, { channel: c.channel, language: c.language as Lang, narrative: text });
      } catch (e) {
        await this.events.add(c.id, 'TRIAGE_FAILED', 'system', `Follow-up recording could not be processed: ${String(e).slice(0, 200)}`);
      }
      return;
    }
    try {
      const { text, provider } = await this.transcription.transcribe(recordingUrl, { language: c.language as Lang, mockTranscript });
      c.narrativeEnc = this.crypto.encrypt(text);
      if (recordingUrl) c.recordingUrlEnc = this.crypto.encrypt(recordingUrl);
      await this.events.add(c.id, 'TRANSCRIBED', provider, `${text.length} characters`);
      const triage = await this.triage.triage({ text, language: c.language as Lang, channel: c.channel, hints: { ward: c.ward || undefined } });
      if (!c.ward && triage.location_mentions?.length) c.ward = triage.location_mentions[0];
      this.applyTriage(c, triage);
      c.status = 'OPEN';
      await this.cases.save(c);
      await this.events.add(c.id, 'TRIAGED', triage.provider, `Urgency ${c.urgency}. ${triage.summary_en}`);
    } catch (e) {
      this.logger.error(`processRecording failed for ${c.ref}: ${e}`);
      c.status = 'OPEN';
      await this.cases.save(c);
      await this.events.add(c.id, 'TRIAGE_FAILED', 'system', String(e).slice(0, 300));
    }
    this.dispatch(c);
  }

  // ---------------------------------------------------------------- updates

  async setConsent(ref: string, safeToContact: boolean): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    c.safeToContact = safeToContact;
    if (c.triage) c.pathway = this.referral.build(c.triage, { ward: c.ward, safeToContact, consentSharePolice: c.consentSharePolice, channel: c.channel });
    await this.cases.save(c);
    await this.events.add(c.id, 'CONSENT', 'survivor', safeToContact ? 'Safe to call/text this phone' : 'Phone NOT safe: no calls or SMS');
    if (safeToContact && c.status !== 'PROCESSING') await this.notify.notifySurvivor(c);
    return c;
  }

  async acknowledge(ref: string, actor: string): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    if (['RESOLVED', 'FALSE_ALARM'].includes(c.status)) return c;
    c.status = 'ACKNOWLEDGED';
    c.acknowledgedBy = actor;
    c.acknowledgedAt = c.acknowledgedAt || new Date();
    await this.cases.save(c);
    this.notify.cancelEscalation(ref);
    await this.events.add(c.id, 'ACKNOWLEDGED', actor, 'Responder accepted the case');
    if (c.safeToContact && c.phoneEnc) {
      await this.sms.send(this.crypto.decrypt(c.phoneEnc), SMS.acknowledged(c.language as Lang, c.ref, actor), 'survivor');
    }
    return c;
  }

  async resolve(ref: string, actor: string, outcome: 'RESOLVED' | 'FALSE_ALARM' = 'RESOLVED', note?: string): Promise<Case | null> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return null;
    c.status = outcome;
    await this.cases.save(c);
    this.notify.cancelEscalation(ref);
    await this.events.add(c.id, outcome, actor, note || '');
    return c;
  }

  /** Right to erasure (Kenya DPA 2019 s.40): hard-delete the case and its audit trail. */
  async erase(ref: string, opts: { actor: string; phoneHash?: string }): Promise<boolean> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return false;
    if (opts.phoneHash && c.phoneHash !== opts.phoneHash) return false; // only the reporting phone can erase via USSD/SMS
    this.notify.cancelEscalation(ref);
    await this.events.deleteForCase(c.id);
    await this.cases.delete({ id: c.id });
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
    const events = await this.events.list(c.id);
    return { ...this.view(c), narrative: c.narrativeEnc ? this.crypto.decrypt(c.narrativeEnc) : null, hasRecording: !!c.recordingUrlEnc, events };
  }

  /** Reveal the survivor's phone only with consent; logged. */
  async revealContact(ref: string, actor: string): Promise<{ phone: string } | { error: string }> {
    const c = await this.cases.findOne({ where: { ref } });
    if (!c) return { error: 'not found' };
    if (!c.safeToContact) return { error: 'The survivor said this phone is not safe to contact.' };
    if (!c.phoneEnc) return { error: 'No phone number on this case.' };
    await this.events.add(c.id, 'CONTACT_REVEALED', actor, 'Phone number revealed to responder');
    return { phone: this.crypto.decrypt(c.phoneEnc) };
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
      callbackWindow: c.callbackWindow, createdAt: c.createdAt, updatedAt: c.updatedAt,
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
      const previous = c.narrativeEnc ? this.crypto.decrypt(c.narrativeEnc) : '';
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
