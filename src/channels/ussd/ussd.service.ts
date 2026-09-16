import { Injectable, Logger } from '@nestjs/common';
import { Lang } from '../../ai/triage.types';
import { CasesService } from '../../cases/cases.service';
import { CryptoService } from '../../common/crypto.service';
import { normalizePhone } from '../../common/phone';
import { normalizeRef } from '../../common/ref';
import { ResourcesService } from '../../resources/resources.service';
import { USSD, t } from '../../i18n/messages';

const VT = ['physical', 'sexual', 'emotional', 'economic', 'harassment', 'other'];
const WHEN: Array<'recent' | 'week' | 'older'> = ['recent', 'week', 'older'];

/**
 * USSD: works on any phone, needs no airtime on most Kenyan networks for short codes, leaves no
 * trace in the call log or inbox, and is silent. The whole session is a sequence of digits the
 * survivor can enter in seconds, even with the abuser in the next room.
 */
@Injectable()
export class UssdService {
  private readonly logger = new Logger(UssdService.name);

  constructor(private readonly cases: CasesService, private readonly crypto: CryptoService, private readonly resources: ResourcesService) {}

  async handle(body: Record<string, string>): Promise<string> {
    const phone = body.phoneNumber || '';
    const parts = String(body.text || '').split('*').filter((p) => p !== '');
    if (parts.length === 0) return USSD.langMenu;
    const lang: Lang = parts[0] === '2' ? 'sw' : parts[0] === '1' ? 'en' : null;
    if (!lang) return USSD.langMenu;
    if (parts.length === 1) return t(lang, USSD.main);
    const args = parts.slice(2); // answers after the main-menu choice
    try {
      switch (parts[1]) {
        case '1': return this.report(lang, phone, args);
        case '2': return this.danger(lang, phone, args);
        case '3': return this.info(lang, args);
        case '4': return this.callback(lang, phone, args);
        case '5': return this.status(lang, phone, args);
        case '6': return this.erase(lang, phone, args);
        default: return t(lang, USSD.invalid);
      }
    } catch (e) {
      this.logger.error(`USSD error: ${e}`);
      return t(lang, USSD.invalid);
    }
  }

  private async report(lang: Lang, phone: string, a: string[]): Promise<string> {
    if (a.length === 0) return t(lang, USSD.type);
    if (a.length === 1) return t(lang, USSD.when);
    if (a.length === 2) return t(lang, USSD.present);
    if (a.length === 3) return t(lang, USSD.area);
    if (a.length === 4) return t(lang, USSD.safe);
    const [type, when, present, area, safe] = a;
    const c = await this.cases.createCase({
      channel: 'ussd', language: lang, phone, ward: area.slice(0, 40),
      hints: { violence_type: VT[Number(type) - 1] || 'other', when: WHEN[Number(when) - 1] || 'older', perpetrator_present: present === '1' },
      safeToContact: safe === '1',
    });
    return USSD.created(lang, c.ref, this.cases.survivorSteps(c, lang, 1));
  }

  private async danger(lang: Lang, phone: string, a: string[]): Promise<string> {
    if (a.length === 0) return t(lang, USSD.dangerArea);
    const area = a[0] === '0' ? undefined : a[0].slice(0, 40);
    const c = await this.cases.createCase({ channel: 'ussd_silent', language: lang, phone, ward: area, silent: true });
    return USSD.danger(lang, c.ref);
  }

  private info(lang: Lang, a: string[]): string {
    if (a.length === 0) return t(lang, USSD.infoMenu);
    const legal = this.resources.pick('legal')?.phone || '1195';
    const gvrc = this.resources.pick('medical')?.phone || '1195';
    switch (a[0]) {
      case '1': return t(lang, USSD.info.medical);
      case '2': return t(lang, USSD.info.police);
      case '3': return t(lang, USSD.info.legal(legal));
      case '4': return t(lang, USSD.info.shelter(gvrc));
      case '5': return t(lang, USSD.info.counselling);
      case '6': return t(lang, USSD.info.child);
      default: return t(lang, USSD.invalid);
    }
  }

  private async callback(lang: Lang, phone: string, a: string[]): Promise<string> {
    if (a.length === 0) return t(lang, USSD.callbackWhen);
    const idx = Number(a[0]) - 1;
    const window = USSD.callbackWindows.en[idx] || USSD.callbackWindows.en[0];
    const c = await this.cases.createCase({ channel: 'ussd', language: lang, phone, hints: { callback: true }, safeToContact: true, callbackWindow: window });
    return USSD.callbackDone(lang, c.ref, (lang === 'sw' ? USSD.callbackWindows.sw : USSD.callbackWindows.en)[idx] || '');
  }

  private async status(lang: Lang, phone: string, a: string[]): Promise<string> {
    if (a.length === 0) return t(lang, USSD.refPrompt);
    const ref = normalizeRef(a[0]);
    const text = ref ? await this.cases.statusFor(ref, this.crypto.hash(normalizePhone(phone)), lang) : null;
    return text ? USSD.status(lang, ref, text) : t(lang, USSD.notFound);
  }

  private async erase(lang: Lang, phone: string, a: string[]): Promise<string> {
    if (a.length === 0) return t(lang, USSD.refPrompt);
    const ref = normalizeRef(a[0]);
    const ok = ref ? await this.cases.erase(ref, { actor: 'survivor (ussd)', phoneHash: this.crypto.hash(normalizePhone(phone)) }) : false;
    return ok ? USSD.deleted(lang, ref) : t(lang, USSD.notFound);
  }
}
