import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConversationService } from '../../ai/conversation.service';
import { CallTurn } from '../../ai/conversation';
import { TranscriptionService } from '../../ai/transcription.service';
import { TriageService } from '../../ai/triage.service';
import { Lang, TriageResult } from '../../ai/triage.types';
import { CasesService } from '../../cases/cases.service';
import { maskPhone } from '../../common/phone';
import { spellRef } from '../../common/ref';
import { CALL, saidYes, t } from '../../i18n/call';
import { VoiceCallbackDto } from '../webhook.dto';
import { withWebhookKey } from '../webhook.guard';
import { dial, record, response, say } from './xml';

type Phase = 'intake' | 'contact' | 'police' | 'done';

interface Session {
  lang: Lang;
  caseId?: string;
  caseRef?: string;
  turns: CallTurn[];
  asked: string[];
  phase: Phase;
  pendingLine?: string;
  safeToContact: boolean;
  silences: number;
  notified: boolean;
  dialled: boolean;
  startedAt: number;
}

/** How long one answer may be, and how long the line waits for the caller to start or to pause. */
const TURN_MAX_SECONDS = 45;
const TURN_SILENCE_SECONDS = 5;

/**
 * The call line. There is no menu: the line greets, listens, and asks one question at a time, the way an
 * emergency call is taken. Responders are alerted from the caller's first sentence, not at the end of the call.
 *
 *   call -> (counsellor rings, if configured) -> greeting -> [listen -> question]* -> consent -> closing
 *
 * A case exists from the moment the phone connects, so a caller who hangs up, says nothing, or is cut off is
 * still followed up. The wording of everything factual comes from src/i18n/call.ts; only questions are generated.
 */
@Injectable()
export class VoiceService implements OnModuleDestroy {
  private readonly logger = new Logger(VoiceService.name);
  private readonly sessions = new Map<string, Session>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(
    private readonly cases: CasesService,
    private readonly conversation: ConversationService,
    private readonly transcription: TranscriptionService,
    private readonly triage: TriageService,
  ) {
    this.sweeper = setInterval(() => this.sweep(), 10 * 60 * 1000);
    this.sweeper.unref?.();
  }

  onModuleDestroy() { clearInterval(this.sweeper); }

  private get base(): string { return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''); }
  private url(path: string): string { return withWebhookKey(`${this.base}/webhooks/voice/${path}`); }
  private sweep() { const cutoff = Date.now() - 60 * 60 * 1000; for (const [k, v] of this.sessions) if (v.startedAt < cutoff) this.sessions.delete(k); }

  private session(id: string): Session {
    let s = this.sessions.get(id);
    if (!s) { s = { lang: 'en', turns: [], asked: [], phase: 'intake', safeToContact: false, silences: 0, notified: false, dialled: false, startedAt: Date.now() }; this.sessions.set(id, s); }
    return s;
  }

  /** Says something and listens for the answer. */
  private ask(s: Session, line: string): string {
    s.pendingLine = line;
    return response(record({ callbackUrl: this.url('turn'), prompt: say(line), maxLength: TURN_MAX_SECONDS, timeout: TURN_SILENCE_SECONDS, playBeep: false }));
  }

  /** What the console shows about the call line's setup. */
  readiness(): { counsellors: number; transcription: string; warnings: string[] } {
    const counsellors = counsellorNumbers().length;
    const warnings: string[] = [];
    if (!counsellors) warnings.push('COUNSELLOR_NUMBERS is empty: the AI answers every call and a responder calls back.');
    if (!this.transcription.available) warnings.push('No transcription provider: the call line cannot hold a conversation, so a call becomes one untranscribed urgent case.');
    if (!this.triage.model) warnings.push('No AI key: the call line asks the reviewed fallback questions only.');
    return { counsellors, transcription: this.transcription.provider, warnings };
  }

  /**
   * The call connects. A counsellor is rung first when numbers are configured; Africa's Talking calls back here
   * when that dial ends, and the AI takes over if nobody answered.
   */
  async entry(body: VoiceCallbackDto): Promise<string> {
    if (body.isActive === '0') { this.finish(body); return ''; }
    const s = this.session(body.sessionId);
    if (s.dialled) return this.afterDial(s, body);
    if (!s.caseId) await this.openCase(s, body);

    const numbers = counsellorNumbers();
    if (numbers.length) {
      s.dialled = true;
      return response(say(t(s.lang, CALL.connecting)), dial(numbers, body.destinationNumber));
    }
    return this.ask(s, CALL.greeting);
  }

  /** A counsellor picked up (nothing more for us to do) or did not (the AI greets). */
  private async afterDial(s: Session, body: VoiceCallbackDto): Promise<string> {
    const seconds = Number(body.durationInSeconds || 0);
    if (seconds > 0 && s.caseRef) {
      await this.cases.acknowledge(s.caseRef, `counsellor ${maskPhone(body.destinationNumber || '')}`.trim());
      this.logger.log(`Call ${body.sessionId}: a counsellor answered; ${s.caseRef} acknowledged`);
      return response();
    }
    return this.ask(s, CALL.greeting);
  }

  /**
   * One turn: what the caller just said. Everything is decided here - the brief, the next question, consent,
   * and when to let the caller go.
   */
  async turn(body: VoiceCallbackDto): Promise<string> {
    const s = this.session(body.sessionId);
    if (!s.caseId) await this.openCase(s, body);
    const heard = await this.hear(s, body);

    if (heard === null) return this.unheard(s);
    if (heard === false) return this.untranscribable(s);
    s.silences = 0;

    if (s.phase === 'contact') {
      s.safeToContact = saidYes(heard);
      await this.cases.setConsent(s.caseRef, s.safeToContact);
      s.phase = 'police';
      return this.ask(s, t(s.lang, CALL.consentPolice));
    }
    if (s.phase === 'police') {
      await this.cases.setPoliceConsent(s.caseRef, saidYes(heard));
      return this.close(s);
    }

    const decision = await this.conversation.next({ lang: s.lang, turns: s.turns, asked: s.asked });
    s.lang = decision.lang;
    await this.update(s, decision.triage);
    if (decision.question) {
      s.asked.push(decision.questionKey || decision.question);
      return this.ask(s, decision.question);
    }
    return this.startConsent(s);
  }

  /** Transcribes the answer. null = nothing heard, false = no transcription available at all. */
  private async hear(s: Session, body: VoiceCallbackDto): Promise<string | false | null> {
    if (!this.transcription.available && !body.mockTranscript) return false;
    try {
      const { text } = await this.transcription.transcribe(body.recordingUrl || '', { language: s.lang, mockTranscript: body.mockTranscript });
      const said = text.trim();
      if (!said) return null;
      s.turns.push({ line: s.pendingLine, caller: said });
      return said;
    } catch (e) {
      this.logger.warn(`Call ${s.caseRef}: turn not transcribed (${(e as Error)?.message || e})`);
      return null;
    }
  }

  /** Nothing was heard. Asked once more, then treated as someone who cannot speak safely. */
  private async unheard(s: Session): Promise<string> {
    if (s.phase === 'contact' || s.phase === 'police') {
      if (s.phase === 'contact') { s.phase = 'police'; return this.ask(s, t(s.lang, CALL.consentPolice)); }
      return this.close(s);
    }
    if (++s.silences < 2) return this.ask(s, t(s.lang, CALL.didNotHear));
    await this.update(s, this.triage.silent({ language: s.lang, channel: 'voice_silent' }), 'voice_silent');
    return response(say(t(s.lang, CALL.silent)), say(t(s.lang, CALL.facts.emergency)), ...this.reference(s), say(t(s.lang, CALL.facts.helpline)));
  }

  /** No transcription provider: keep the recording, alert responders, and do not pretend to converse. */
  private async untranscribable(s: Session): Promise<string> {
    await this.update(s, this.triage.untranscribed({ language: s.lang, channel: 'voice' }));
    return response(say(t(s.lang, CALL.alerted)), ...this.reference(s), say(t(s.lang, CALL.facts.helpline)));
  }

  private startConsent(s: Session): string {
    s.phase = 'contact';
    const lines = [say(t(s.lang, CALL.alerted)), ...this.reference(s)].join('');
    s.pendingLine = t(s.lang, CALL.consentContact);
    return response(lines, record({ callbackUrl: this.url('turn'), prompt: say(s.pendingLine), maxLength: 15, timeout: TURN_SILENCE_SECONDS, playBeep: false }));
  }

  private reference(s: Session): string[] {
    return s.caseRef ? [say(CALL.reference(s.lang, spellRef(s.caseRef)))] : [];
  }

  /** The closing: the facts that apply to this case, from reviewed text only. */
  private async close(s: Session): Promise<string> {
    s.phase = 'done';
    const c = s.caseRef ? await this.cases.findByRef(s.caseRef) : null;
    const tr = c?.triage;
    const facts: string[] = [];
    if (tr?.immediate_danger) facts.push(t(s.lang, CALL.facts.emergency));
    if (tr?.violence_types?.includes('sexual') && (tr.hours_since_incident === null || tr.hours_since_incident <= 72)) facts.push(t(s.lang, CALL.facts.medical72));
    if (tr?.survivor_age_group === 'child') facts.push(t(s.lang, CALL.facts.child));
    facts.push(t(s.lang, CALL.facts.helpline));
    return response(...facts.map(say), say(CALL.closing(s.lang, s.safeToContact)));
  }

  /** Opens the case as soon as the phone connects, so a dropped or silent call is still followed up. */
  private async openCase(s: Session, body: VoiceCallbackDto): Promise<void> {
    const c = await this.cases.createPending({ channel: 'voice', language: s.lang, phone: body.callerNumber });
    s.caseId = c.id;
    s.caseRef = c.ref;
  }

/** Writes the latest exchange to the case and alerts responders the first time. */
  private async update(s: Session, triage: TriageResult, channel?: string): Promise<void> {
    if (!s.caseId) return;
    const last = s.turns[s.turns.length - 1];
    const turn = last ? `${last.line ? `[line] ${last.line}\n` : ''}${last.caller}` : '';
    const header = turn && !s.notified ? `[Call ${new Date().toISOString().slice(11, 16)} UTC]` : undefined;
    await this.cases.applyCallTurn(s.caseId, { turn, header, triage, channel });
    s.notified = true;
  }

  private finish(body: VoiceCallbackDto) {
    const s = this.sessions.get(body.sessionId);
    this.logger.log(`Call ${body.sessionId} ended (${body.durationInSeconds || '?'}s, ${body.callSessionState || ''})${s && !s.notified ? ' before anything was said' : ''}`);
    this.sessions.delete(body.sessionId);
  }
}

const counsellorNumbers = () => (process.env.COUNSELLOR_NUMBERS || '').split(',').map((x) => x.trim()).filter(Boolean);
