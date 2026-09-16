import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TranscriptionService } from '../ai/transcription.service';
import { TriageService } from '../ai/triage.service';
import { Lang, TriageHints, TriageResult } from '../ai/triage.types';
import { CryptoService } from '../common/crypto.service';
import { maskPhone, normalizePhone } from '../common/phone';
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
  pathway: Case['pathway']; urgency: string; status: string; acknowledgedBy: string;
  callbackWindow: string; createdAt: Date; updatedAt: Date;
}

@Injectable()
export class CasesService {
  private readonly logger = new Logger(CasesService.name);
  erasedCount = 0;

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
    const c = this.cases.create({ ref: await this.newRef(), channel: input.channel, language: input.language, status: 'PROCESSING', urgency: 'medium' });
    this.attachPhone(c, input.phone);
    await this.cases.save(c);
    await this.events.add(c.id, 'CREATED', input.channel, 'Call in progress; recording pending');
    return c;
  }

  async processRecording(id: string, recordingUrl: string, mockTranscript?: string): Promise<void> {
    const c = await this.cases.findOne({ where: { id } });
    if (!c) return;
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
      pathway: c.pathway, urgency: c.urgency, status: c.status, acknowledgedBy: c.acknowledgedBy,
      callbackWindow: c.callbackWindow, createdAt: c.createdAt, updatedAt: c.updatedAt,
    };
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
