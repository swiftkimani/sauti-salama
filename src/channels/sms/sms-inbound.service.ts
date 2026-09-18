import { Injectable, Logger } from '@nestjs/common';
import { Lang } from '../../ai/triage.types';
import { CasesService } from '../../cases/cases.service';
import { CryptoService } from '../../common/crypto.service';
import { maskPhone, normalizePhone } from '../../common/phone';
import { RateLimiter } from '../../common/rate-limiter';
import { normalizeRef } from '../../common/ref';
import { OutboxMessage, SmsService } from '../../common/sms.service';
import { RespondersService } from '../../responders/responders.service';
import { SMS } from '../../i18n/messages';
import { SmsInboundDto } from '../webhook.dto';

const SW_HINT = /\b(msaada|nisaidie|naomba|mume|alinipiga|amenipiga|nimebakwa|hatarini|ndiyo|futa)\b/i;
const HOUR = 60 * 60 * 1000;

/**
 * Inbound SMS (survivors AND responders share the shortcode):
 *   responder:  ACK SS-XXXX | RESOLVE SS-XXXX           (registered responder phones only)
 *   survivor :  HELP / MSAADA / INFO                    -> vetted information
 *               YES / NDIYO [ref]                       -> consent to be texted on this phone
 *               POLICE YES|NO [ref] / POLISI NDIYO|HAPANA [ref] -> the survivor's choice about police involvement
 *               STOP / FUTA SS-XXXX                     -> erase the report
 *               anything else                           -> a report: AI triage, responders alerted, one neutral reply
 * Every survivor command only acts on cases reported from the sending phone.
 */
@Injectable()
export class SmsInboundService {
  private readonly logger = new Logger(SmsInboundService.name);
  private readonly infoLimiter = new RateLimiter(() => Number(process.env.RATE_LIMIT_INFO_PER_HOUR ?? 5), () => HOUR);
  /** Caps what any one unregistered number can make us send, so the shortcode cannot be used to spam or run up costs. */
  private readonly replyLimiter = new RateLimiter(() => Number(process.env.RATE_LIMIT_REPLIES_PER_HOUR ?? 10), () => HOUR);

  constructor(private readonly cases: CasesService, private readonly sms: SmsService, private readonly crypto: CryptoService, private readonly responders: RespondersService) {}

  async handle(body: SmsInboundDto): Promise<void> {
    const from = normalizePhone(body.from || '');
    const text = String(body.text || '').trim();
    if (!from || !text) return;
    const upper = text.toUpperCase();
    const phoneHash = this.crypto.hash(from);
    const lang: Lang = SW_HINT.test(text) ? 'sw' : 'en';
    const responder = this.responders.all().find((r) => r.active && normalizePhone(r.phone) === from);

    let m: RegExpMatchArray | null;
    if ((m = upper.match(/^(ACK|ACCEPT)\s+(\S+)/))) {
      // Accepting a case stops its escalation, so only a vetted responder may do it.
      if (!responder) return this.refuseResponderCommand(from, m[1]);
      const ref = normalizeRef(m[2]);
      const c = ref ? await this.cases.acknowledge(ref, responder.name, responder) : null;
      await this.sms.send(from, c ? SMS.ackConfirm(ref, responder.name) : SMS.unknownRef, 'system');
      return;
    }
    if ((m = upper.match(/^(RESOLVE|RESOLVED|SAFE)\s+(\S+)/))) {
      if (!responder) return this.refuseResponderCommand(from, m[1]);
      const ref = normalizeRef(m[2]);
      const c = ref ? await this.cases.resolve(ref, responder.name, 'RESOLVED', 'via SMS') : null;
      await this.sms.send(from, c ? SMS.resolveConfirm(ref) : SMS.unknownRef, 'system');
      return;
    }
    if (/^(HELP|MSAADA|INFO|MAELEZO)\b/.test(upper)) {
      if (!this.infoLimiter.take(phoneHash)) { this.logger.warn(`Help-info limit reached for ${maskPhone(from)}`); return; }
      await this.sms.send(from, SMS.info(upper.startsWith('MSAADA') || upper.startsWith('MAELEZO') ? 'sw' : 'en'), 'survivor');
      return;
    }
    if ((m = upper.match(/^(STOP|FUTA|DELETE)\s*(\S*)/))) {
      const ref = normalizeRef(m[2]) || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
      const ok = ref ? await this.cases.erase(ref, { actor: 'survivor (sms)', phoneHash }) : false;
      await this.reply(from, phoneHash, ok ? SMS.deleted(lang, ref) : SMS.unknownRef, 'system');
      return;
    }
    // The whole message must be the command, so "Polisi hapana kunisaidia..." stays a report.
    if ((m = upper.match(/^(POLICE|POLISI)\s+(YES|NO|NDIYO|HAPANA)(?:\s+(SS-?[A-Z2-9]{4}))?\s*$/))) {
      const consent = m[2] === 'YES' || m[2] === 'NDIYO';
      const pLang: Lang = m[1] === 'POLISI' ? 'sw' : 'en';
      const ref = normalizeRef(m[3]) || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
      const c = ref ? await this.cases.setPoliceConsent(ref, consent, phoneHash) : null;
      // Confirm only where texting is known to be safe; otherwise the choice is recorded silently.
      if (!c) await this.reply(from, phoneHash, SMS.unknownRef, 'system');
      else if (c.safeToContact) await this.reply(from, phoneHash, SMS.policeChoice(pLang, c.ref, consent), 'survivor');
      return;
    }
    if ((m = upper.match(/^(YES|NDIYO)\b\s*(\S*)/))) {
      const ref = normalizeRef(m[2]) || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
      if (ref) await this.cases.setConsent(ref, true, phoneHash); // setConsent sends the next steps
      return;
    }
    // A free-text report. One short, neutral reply; nothing else until the survivor says the phone is safe.
    const c = await this.cases.createCase({ channel: 'sms', language: lang, phone: from, narrative: text });
    await this.reply(from, phoneHash, SMS.received(c.language as Lang, c.ref), 'survivor');
    this.logger.log(`SMS report ${c.ref} (${c.urgency})`);
  }

  private async reply(to: string, phoneHash: string, message: string, kind: OutboxMessage['kind']): Promise<void> {
    if (!this.replyLimiter.take(phoneHash)) {
      this.logger.warn(`Reply limit reached for ${maskPhone(to)}; not replying`);
      return;
    }
    await this.sms.send(to, message, kind);
  }

  private refuseResponderCommand(from: string, verb: string): void {
    // No reply: telling an unknown number that the command exists helps nobody but someone probing the line.
    this.logger.warn(`${verb} from ${maskPhone(from)} ignored: not a registered responder phone`);
  }
}
