import { Lang } from '../ai/triage.types';

/**
 * Everything the call line may state as fact, reviewed in English and Kiswahili. The AI on a call may write its
 * own short questions, but never these: numbers, deadlines, what happens next and every promise come from here.
 * Numbers are spelled digit by digit because they are read by text-to-speech.
 */
type LT = { en: string; sw: string };

export const CALL = {
  /** Said before the caller's language is known, so both languages, and short: the caller may be in danger now. */
  greeting: 'Sauti Salama. You are safe here. Tell me what is happening. Sauti Salama. Uko salama hapa. Niambie kinachoendelea.',

  /** Asked when a turn comes back empty. After the second one the call is treated as a silent alert. */
  didNotHear: { en: 'I could not hear you. Speak when you are ready. If you cannot speak, stay on the line.', sw: 'Sikuweza kukusikia. Ongea ukiwa tayari. Kama huwezi kuongea, endelea kusubiri.' } as LT,

  /** Fallback questions, used when no AI is configured or the model fails. Ordered by what a responder needs first. */
  questions: {
    danger_now: { en: 'Are you safe right now? Is the person still with you?', sw: 'Uko salama sasa hivi? Mtu huyo bado yuko na wewe?' } as LT,
    location: { en: 'Where are you now? Tell me the area or the estate.', sw: 'Uko wapi sasa? Niambie eneo au mtaa.' } as LT,
    what_happened: { en: 'Tell me what happened to you.', sw: 'Niambie kilichokutokea.' } as LT,
    who: { en: 'Who did this to you?', sw: 'Nani amekufanyia hivi?' } as LT,
    injuries: { en: 'Are you hurt? Do you need to see a doctor?', sw: 'Umeumia? Unahitaji kuonana na daktari?' } as LT,
    children: { en: 'Are there children with you?', sw: 'Kuna watoto pamoja nawe?' } as LT,
  } as Record<string, LT>,

  /** Consent, asked in the caller's own words at the end of the call. Both default to no when unclear. */
  consentContact: { en: 'Is it safe for us to call or send an S M S to this phone? Please say yes or no.', sw: 'Ni salama kwetu kupiga simu au kutuma S M S kwa simu hii? Tafadhali sema ndiyo au hapana.' } as LT,
  consentPolice: { en: 'Do you want a responder to help you report to the police? Say yes or no. You can decide later.', sw: 'Unataka mhudumu akusaidie kuripoti kwa polisi? Sema ndiyo au hapana. Unaweza kuamua baadaye.' } as LT,

  /** Facts. The model is never allowed to produce these, and any generated text containing digits is refused. */
  facts: {
    emergency: { en: 'If your life is in danger right now, call 9 9 9 or 1 1 2.', sw: 'Ikiwa maisha yako yako hatarini sasa hivi, piga 9 9 9 au 1 1 2.' } as LT,
    medical72: { en: 'After sexual violence, go to any health facility within 7 2 hours for free care, and ask for the P R C form.', sw: 'Baada ya dhuluma ya kingono, nenda kituo chochote cha afya ndani ya saa 7 2 kwa matibabu ya bure, na uombe fomu ya P R C.' } as LT,
    child: { en: 'For a child, Childline 1 1 6 is free at any time.', sw: 'Kwa mtoto, Childline 1 1 6 ni bure wakati wowote.' } as LT,
    helpline: { en: 'Free help any time on 1 1 9 5.', sw: 'Msaada wa bure wakati wowote kwa 1 1 9 5.' } as LT,
  } as Record<string, LT>,

  /** Said as soon as responders have been alerted, so the caller knows help is moving before the call ends. */
  alerted: { en: 'A trusted responder in your area has been alerted.', sw: 'Mhudumu wa kuaminika katika eneo lako ameshaarifiwa.' } as LT,

  reference: (lang: Lang, refSpelled: string) => t(lang, {
    en: `Your reference number is ${refSpelled}. Keep it. You can call this line again any time to check it.`,
    sw: `Nambari yako ya rejeleo ni ${refSpelled}. Ihifadhi. Unaweza kupiga simu hii tena wakati wowote kuiangalia.`,
  }),

  /** Closing, matching the contact answer. */
  closing: (lang: Lang, safeToContact: boolean) => t(lang, safeToContact
    ? { en: 'Your responder will contact you on this number. If it stops being safe, call this line again. Stay safe.', sw: 'Mhudumu wako atawasiliana nawe kwa nambari hii. Ikiwa haitakuwa salama tena, piga simu hii tena. Uwe salama.' }
    : { en: 'Nobody will call or send an S M S to this phone. Your responder will use your reference number. You may want to delete this call from your call log. Stay safe.', sw: 'Hakuna atakayepiga simu au kutuma S M S kwa simu hii. Mhudumu wako atatumia nambari yako ya rejeleo. Unaweza kufuta simu hii kwenye orodha ya simu zako. Uwe salama.' }),

  /** The caller said nothing at all: treated as someone who cannot speak safely. */
  silent: { en: 'I could not hear you, so I have alerted a responder for your area. If you can, move to a safe place.', sw: 'Sikuweza kukusikia, kwa hiyo nimemwarifu mhudumu wa eneo lako. Ukiweza, nenda mahali salama.' } as LT,

  connecting: { en: 'Connecting you to a counsellor now. Please hold.', sw: 'Tunakuunganisha na mshauri sasa. Tafadhali subiri.' } as LT,

  failure: { en: 'Something went wrong on our side, but your call has been recorded and a responder will be alerted. Call this line again any time.', sw: 'Kuna tatizo upande wetu, lakini simu yako imeandikishwa na mhudumu ataarifiwa. Piga simu hii tena wakati wowote.' } as LT,
};

export const t = (lang: Lang, x: LT) => (lang === 'sw' ? x.sw : x.en);

/** "yes/ndiyo/eeh" vs "no/hapana". Anything unclear is treated as no: consent is never assumed. */
export function saidYes(text: string): boolean {
  const t = ` ${String(text || '').toLowerCase().replace(/[^a-z\s']/g, ' ')} `;
  if (/\b(no|hapana|la|sitaki|siwezi|usifanye|don't|dont|do not)\b/.test(t)) return false;
  return /\b(yes|yeah|yep|sure|ok|okay|ndiyo|ndio|eeh|eh|sawa|naweza|nataka|poa)\b/.test(t);
}
