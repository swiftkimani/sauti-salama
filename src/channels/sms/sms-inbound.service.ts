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
 * A survivor keyword only counts as a command when it is the whole message, optionally followed by a
 * reference. "Help me he is beating me", "Stop him" and "Yes he is still here" are reports: matching
 * them as commands would throw away the sentence that matters and, for STOP, delete the case it
 * belongs to. Returns null for anything that is not a bare command, so it falls through to triage.
 */
export function wholeCommand(upper: string, verbs: string[]): { verb: string; ref: string | null } | null {
  const m = upper.match(new RegExp(`^(${verbs.join('|')})(?:\\s+(\\S+))?[\\s.,!]*$`));
  if (!m) return null;
  const ref = m[2] ? normalizeRef(m[2]) : null;
  if (m[2] && !ref) return null;
  return { verb: m[1], ref };
}

/**
 * Inbound SMS (survivors AND responders share the shortcode):
 *   responder:  ACK SS-XXXX | RESOLVE SS-XXXX           (registered responder phones only)
 * Survivor keywords must be the WHOLE message (wholeCommand); anything longer is a report.
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

    // Responder verbs keep prefix matching, so "ACK SS-4K2F on my way" works for a trained responder.
    let m: RegExpMatchArray | null;
    if ((m = upper.match(/^(ACK|ACCEPT|RESOLVE|RESOLVED|SAFE)\s+(\S+)/))) {
      const verb = m[1];
      const ref = normalizeRef(m[2]);
      const accepting = verb === 'ACK' || verb === 'ACCEPT';
      // Accepting or closing a case stops its escalation, so only a vetted responder may do it.
      if (responder) {
        let reply = SMS.unknownRef;
        if (ref) {
          const c = accepting
            ? await this.cases.acknowledge(ref, responder.name, responder)
            : await this.cases.resolve(ref, responder.name, 'RESOLVED', 'via SMS');
          if (c) reply = accepting ? SMS.ackConfirm(ref, responder.name) : SMS.resolveConfirm(ref);
        }
        await this.sms.send(from, reply, 'system');
        return;
      }
      // Not a registered responder: only a well-formed reference is someone probing the line.
      // "Safe me please, he is coming back" is a report and must never be dropped.
      if (ref) { this.refuseResponderCommand(from, verb); return; }
    }

    const cmd = wholeCommand(upper, ['HELP', 'MSAADA', 'INFO', 'MAELEZO', 'STOP', 'FUTA', 'DELETE', 'YES', 'NDIYO']);
    if (cmd && ['HELP', 'MSAADA', 'INFO', 'MAELEZO'].includes(cmd.verb)) {
      if (!this.infoLimiter.take(phoneHash)) { this.logger.warn(`Help-info limit reached for ${maskPhone(from)}`); return; }
      await this.sms.send(from, SMS.info(cmd.verb === 'MSAADA' || cmd.verb === 'MAELEZO' ? 'sw' : 'en'), 'survivor');
      return;
    }
    if (cmd && ['STOP', 'FUTA', 'DELETE'].includes(cmd.verb)) {
      // A hard delete has no undo, so a bare STOP asks for the reference instead of acting on the newest case.
      if (!cmd.ref) {
        const latest = await this.cases.findLatestByPhoneHash(phoneHash);
        await this.reply(from, phoneHash, latest ? SMS.confirmDelete(lang, latest.ref) : SMS.unknownRef, 'system');
        return;
      }
      const ok = await this.cases.erase(cmd.ref, { actor: 'survivor (sms)', phoneHash });
      await this.reply(from, phoneHash, ok ? SMS.deleted(lang, cmd.ref) : SMS.unknownRef, 'system');
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
    if (cmd && ['YES', 'NDIYO'].includes(cmd.verb)) {
      const ref = cmd.ref || (await this.cases.findLatestByPhoneHash(phoneHash))?.ref;
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
