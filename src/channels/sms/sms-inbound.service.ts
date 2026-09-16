import { Injectable, Logger } from '@nestjs/common';
import { Lang } from '../../ai/triage.types';
import { CasesService } from '../../cases/cases.service';
import { CryptoService } from '../../common/crypto.service';
import { normalizePhone } from '../../common/phone';
import { RateLimiter } from '../../common/rate-limiter';
import { normalizeRef } from '../../common/ref';
import { SmsService } from '../../common/sms.service';
import { RespondersService } from '../../responders/responders.service';
import { SMS } from '../../i18n/messages';

const SW_HINT = /\b(msaada|nisaidie|naomba|mume|alinipiga|amenipiga|nimebakwa|hatarini|ndiyo|futa)\b/i;

/**
 * Inbound SMS (survivors AND responders share the shortcode):
 *   responder:  ACK SS-XXXX | RESOLVE SS-XXXX
 *   survivor :  HELP / MSAADA / INFO  -> vetted information
 *               YES / NDIYO [ref]    -> consent to be texted on this phone
 *               STOP / FUTA SS-XXXX  -> erase the report
 *               anything else        -> a report: AI triage, responders alerted, one neutral reply
 */
@Injectable()
export class SmsInboundService {
  private readonly logger = new Logger(SmsInboundService.name);
  private readonly infoLimiter = new RateLimiter(() => Number(process.env.RATE_LIMIT_INFO_PER_HOUR ?? 5), () => 60 * 60 * 1000);

  constructor(private readonly cases: CasesService, private readonly sms: SmsService, private readonly crypto: CryptoService, private readonly responders: RespondersService) {}

  async handle(body: Record<string, string>): Promise<void> {
    const from = normalizePhone(body.from || '');
    const text = String(body.text || '').trim();
    if (!from || !text) return;
    const upper = text.toUpperCase();
    const phoneHash = this.crypto.hash(from);
    const lang: Lang = SW_HINT.test(text) ? 'sw' : 'en';
    const responder = this.responders.all().find((r) => normalizePhone(r.phone) === from);

    let m: RegExpMatchArray | null;
    if ((m = upper.match(/^(ACK|ACCEPT)\s+(\S+)/))) {
      const ref = normalizeRef(m[2]);
      const name = responder?.name || `responder ${from.slice(-4)}`;
      const c = ref ? await this.cases.acknowledge(ref, name) : null;
      await this.sms.send(from, c ? SMS.ackConfirm(ref, name) : SMS.unknownRef, 'system');
      return;
    }
    if ((m = upper.match(/^(RESOLVE|RESOLVED|SAFE)\s+(\S+)/))) {
      const ref = normalizeRef(m[2]);
      const c = ref ? await this.cases.resolve(ref, responder?.name || from, 'RESOLVED', 'via SMS') : null;
      await this.sms.send(from, c ? SMS.resolveConfirm(ref) : SMS.unknownRef, 'system');
      return;
    }
    if (/^(HELP|MSAADA|INFO|MAELEZO)\b/.test(upper)) {
      if (!this.infoLimiter.take(phoneHash)) { this.logger.warn(`Help-info limit reached for ${from.slice(0, 5)}***`); return; }
      await this.sms.send(from, SMS.info(upper.startsWith('MSAADA') || upper.startsWith('MAELEZO') ? 'sw' : 'en'), 'survivor');
      return;
    }
    if ((m = upper.match(/^(STOP|FUTA|DELETE)\s*(\S*)/))) {
      const ref = normalizeRef(m[2]) || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
      const ok = ref ? await this.cases.erase(ref, { actor: 'survivor (sms)', phoneHash }) : false;
      await this.sms.send(from, ok ? SMS.deleted(lang, ref) : SMS.unknownRef, 'system');
      return;
    }
    if ((m = upper.match(/^(YES|NDIYO)\b\s*(\S*)/))) {
      const ref = normalizeRef(m[2]) || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
      if (ref) await this.cases.setConsent(ref, true); // setConsent sends the next steps
      return;
    }
    // A free-text report. One short, neutral reply; nothing else until the survivor says the phone is safe.
    const c = await this.cases.createCase({ channel: 'sms', language: lang, phone: from, narrative: text });
    await this.sms.send(from, SMS.received(c.language as Lang, c.ref), 'survivor');
    this.logger.log(`SMS report ${c.ref} (${c.urgency})`);
  }
}
