import { Injectable, Logger } from '@nestjs/common';
import { Lang } from '../../ai/triage.types';
import { CasesService } from '../../cases/cases.service';
import { spellRef } from '../../common/ref';
import { VOICE, t } from '../../i18n/messages';
import { withWebhookKey } from '../webhook.guard';
import { dial, getDigits, play, record, response, say } from './xml';

interface Session { lang: Lang; caseRef?: string; caseId?: string; retries: number; startedAt: number; }

/**
 * The call line (IVR). One call = one Africa's Talking session; every step posts back to us.
 *   entry -> language -> menu -> (record | info | counsellor | silent alert) -> consent -> goodbye
 * Recordings are transcribed and triaged in the background; the caller gets a reference at once.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly cases: CasesService) {
    const t = setInterval(() => this.sweep(), 10 * 60 * 1000);
    t.unref?.();
  }

  private get base(): string { return (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, ''); }
  private url(path: string): string { return withWebhookKey(`${this.base}/webhooks/voice/${path}`); }
  private session(id: string): Session {
    let s = this.sessions.get(id);
    if (!s) { s = { lang: 'en', retries: 0, startedAt: Date.now() }; this.sessions.set(id, s); }
    return s;
  }
  private sweep() { const cutoff = Date.now() - 60 * 60 * 1000; for (const [k, v] of this.sessions) if (v.startedAt < cutoff) this.sessions.delete(k); }

  /** Kiswahili prompts can be pre-recorded (SW_AUDIO_BASE_URL/<key>.mp3); otherwise text-to-speech. */
  private prompt(lang: Lang, key: string, text: string): string {
    const base = process.env.SW_AUDIO_BASE_URL;
    return lang === 'sw' && base ? play(`${base.replace(/\/$/, '')}/${key}.mp3`) : say(text);
  }

  entry(body: Record<string, string>): string {
    if (body.isActive === '0') { this.finish(body); return ''; }
    this.session(body.sessionId);
    return response(getDigits({ callbackUrl: this.url('lang'), prompt: say(VOICE.welcome), timeout: 8 }));
  }

  language(body: Record<string, string>): string {
    const s = this.session(body.sessionId);
    const d = (body.dtmfDigits || '').trim();
    if (d === '2') s.lang = 'sw'; else if (d === '1') s.lang = 'en';
    else if (!d && s.retries++ < 1) return this.entry(body);
    return this.menu(s);
  }

  private menu(s: Session): string {
    return response(getDigits({ callbackUrl: this.url('menu'), prompt: this.prompt(s.lang, 'main', t(s.lang, VOICE.main)), timeout: 10 }));
  }

  async menuChoice(body: Record<string, string>): Promise<string> {
    const s = this.session(body.sessionId);
    const d = (body.dtmfDigits || '').trim();
    switch (d) {
      case '1':
        return response(record({ callbackUrl: this.url('recording'), prompt: this.prompt(s.lang, 'record', t(s.lang, VOICE.recordPrompt)) }));
      case '2':
        return this.info(s);
      case '3':
        return this.counsellor(s, body);
      case '9': {
        // Silent alert: create a critical case and hang up at once. The call log shows only a short call.
        const c = await this.cases.createCase({ channel: 'voice_silent', language: s.lang, phone: body.callerNumber, silent: true });
        s.caseRef = c.ref;
        this.logger.warn(`Silent voice alert ${c.ref}`);
        return response();
      }
      default:
        if (s.retries++ < 1) return response(this.prompt(s.lang, 'invalid', t(s.lang, VOICE.invalid)), getDigits({ callbackUrl: this.url('menu'), prompt: this.prompt(s.lang, 'main', t(s.lang, VOICE.main)) }));
        return response(this.prompt(s.lang, 'goodbye', t(s.lang, VOICE.goodbye)));
    }
  }

  private info(s: Session): string {
    return response(
      this.prompt(s.lang, 'info', t(s.lang, VOICE.info)),
      getDigits({ callbackUrl: this.url('info'), prompt: this.prompt(s.lang, 'infoMenu', t(s.lang, VOICE.infoMenu)), timeout: 6 }),
    );
  }

  infoChoice(body: Record<string, string>): string {
    const s = this.session(body.sessionId);
    const d = (body.dtmfDigits || '').trim();
    if (d === '1') return this.info(s);
    if (d === '2') return response(record({ callbackUrl: this.url('recording'), prompt: this.prompt(s.lang, 'record', t(s.lang, VOICE.recordPrompt)) }));
    return response(this.prompt(s.lang, 'goodbye', t(s.lang, VOICE.goodbye)));
  }

  private async counsellor(s: Session, body: Record<string, string>): Promise<string> {
    const numbers = (process.env.COUNSELLOR_NUMBERS || '').split(',').map((x) => x.trim()).filter(Boolean);
    if (numbers.length) return response(this.prompt(s.lang, 'transfer', t(s.lang, VOICE.transfer)), dial(numbers, body.destinationNumber));
    const c = await this.cases.createCase({ channel: 'voice', language: s.lang, phone: body.callerNumber, hints: { callback: true }, callbackWindow: 'as soon as possible' });
    s.caseRef = c.ref;
    return response(getDigits({ callbackUrl: this.url('consent'), prompt: this.prompt(s.lang, 'callback', VOICE.callbackLogged(s.lang, spellRef(c.ref))), timeout: 8 }));
  }

  async recording(body: Record<string, string>): Promise<string> {
    const s = this.session(body.sessionId);
    const c = await this.cases.createPending({ channel: 'voice', language: s.lang, phone: body.callerNumber });
    s.caseRef = c.ref;
    s.caseId = c.id;
    // Background: transcribe -> AI triage -> pathway -> notify responders. The caller is not kept waiting.
    const mock = process.env.NODE_ENV !== 'production' ? body.mockTranscript : undefined;
    this.cases.processRecording(c.id, body.recordingUrl || '', mock).catch((e) => this.logger.error(`processing ${c.ref}: ${e}`));
    return response(getDigits({ callbackUrl: this.url('consent'), prompt: this.prompt(s.lang, 'afterRecord', VOICE.afterRecord(s.lang, spellRef(c.ref))), timeout: 8 }));
  }

  async consent(body: Record<string, string>): Promise<string> {
    const s = this.session(body.sessionId);
    const yes = (body.dtmfDigits || '').trim() === '1';
    if (s.caseRef) await this.cases.setConsent(s.caseRef, yes);
    return response(this.prompt(s.lang, yes ? 'consentYes' : 'consentNo', t(s.lang, yes ? VOICE.consentYes : VOICE.consentNo)));
  }

  private finish(body: Record<string, string>) {
    this.logger.log(`Call ${body.sessionId} ended (${body.durationInSeconds || '?'}s, ${body.callSessionState || ''})`);
    this.sessions.delete(body.sessionId);
  }
}
