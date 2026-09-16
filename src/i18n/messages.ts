import { Lang } from '../ai/triage.types';

/**
 * Every word a survivor sees or hears comes from here: reviewed, fixed templates in
 * English and Kiswahili. The AI never writes survivor-facing text.
 * USSD screens are kept under ~160 characters.
 */
type LT = { en: string; sw: string };
export const t = (lang: Lang, x: LT) => (lang === 'sw' ? x.sw : x.en);

export const USSD = {
  langMenu: 'CON Sauti Salama\n1. English\n2. Kiswahili',
  main: {
    en: 'CON Sauti Salama - you are safe here.\n1. Report what happened\n2. I am in danger NOW\n3. Get help info\n4. Request a call back\n5. Case status\n6. Delete my report',
    sw: 'CON Sauti Salama - uko salama hapa.\n1. Ripoti kilichotokea\n2. Niko hatarini SASA\n3. Maelezo ya msaada\n4. Omba tupigie simu\n5. Hali ya kesi\n6. Futa ripoti yangu',
  },
  type: {
    en: 'CON What happened?\n1. Physical violence\n2. Sexual violence\n3. Threats / emotional abuse\n4. Economic abuse\n5. Harassment / online\n6. Other',
    sw: 'CON Nini kilitokea?\n1. Kupigwa/kimwili\n2. Dhuluma ya kingono\n3. Vitisho/kihisia\n4. Dhuluma ya kiuchumi\n5. Unyanyasaji/mtandaoni\n6. Nyingine',
  },
  when: {
    en: 'CON When did it happen?\n1. Today or within 3 days\n2. This week\n3. Longer ago',
    sw: 'CON Ilitokea lini?\n1. Leo au ndani ya siku 3\n2. Wiki hii\n3. Muda mrefu uliopita',
  },
  present: {
    en: 'CON Is the person who hurt you with you now?\n1. Yes\n2. No',
    sw: 'CON Aliyekudhuru yuko nawe sasa?\n1. Ndiyo\n2. Hapana',
  },
  area: { en: 'CON Type your area or ward (e.g. Kayole):', sw: 'CON Andika eneo lako (mfano Kayole):' },
  safe: { en: 'CON Is it safe to send SMS to this phone?\n1. Yes\n2. No', sw: 'CON Ni salama kutuma SMS kwa simu hii?\n1. Ndiyo\n2. Hapana' },
  created: (lang: Lang, ref: string, step: string) => t(lang, {
    en: `END Ref ${ref}. A trusted responder has been alerted. ${step}. Free help 24hrs: 1195.`,
    sw: `END Nambari ${ref}. Mhudumu wa kuaminika ameshaarifiwa. ${step}. Msaada bila malipo saa 24: 1195.`,
  }),
  dangerArea: { en: 'CON Type your area, or 0 to skip:', sw: 'CON Andika eneo lako, au 0 kuruka:' },
  danger: (lang: Lang, ref: string) => t(lang, {
    en: `END Alert sent (${ref}). A responder has been alerted. If you can, move to a safe place. Emergency: 999 / 112.`,
    sw: `END Arifa imetumwa (${ref}). Mhudumu ameshaarifiwa. Ukiweza, nenda mahali salama. Dharura: 999 / 112.`,
  }),
  infoMenu: {
    en: 'CON Help information:\n1. Medical (72hr window)\n2. Police & P3 form\n3. Legal aid\n4. Shelter\n5. Counselling\n6. Child abuse',
    sw: 'CON Maelezo ya msaada:\n1. Matibabu (saa 72)\n2. Polisi na fomu ya P3\n3. Msaada wa kisheria\n4. Makazi salama\n5. Ushauri\n6. Dhuluma kwa mtoto',
  },
  info: {
    medical: { en: 'END After sexual violence go to ANY health facility within 72hrs: free HIV prevention (PEP), pregnancy prevention (120hrs) and a PRC form. Do not bathe if possible.', sw: 'END Baada ya dhuluma ya kingono nenda kituo chochote cha afya ndani ya saa 72: PEP ya bure kuzuia HIV, kuzuia mimba (saa 120) na fomu ya PRC. Usioge ukiweza.' },
    police: { en: 'END Report at any police station Gender Desk. Ask for a free P3 form. Emergency: 999 / 112. You can go with a friend or a responder.', sw: 'END Ripoti kituo chochote cha polisi (Gender Desk). Omba fomu ya P3 bila malipo. Dharura: 999 / 112. Unaweza kwenda na rafiki au mhudumu.' },
    legal: (phone: string) => ({ en: `END Free legal aid: FIDA Kenya ${phone}. Any court can give you a Protection Order under the Domestic Violence Act 2015.`, sw: `END Msaada wa kisheria bila malipo: FIDA Kenya ${phone}. Korti yoyote inaweza kukupa Amri ya Ulinzi chini ya sheria ya 2015.` }),
    shelter: (phone: string) => ({ en: `END Safe shelter is arranged through 1195 (free, 24hrs) or GVRC ${phone}. Locations are kept private.`, sw: `END Makazi salama hupangwa kupitia 1195 (bure, saa 24) au GVRC ${phone}. Mahali hapatangazwi.` }),
    counselling: { en: 'END Free confidential counselling: 1195 (24hrs). Youth line: 1190. You are not alone.', sw: 'END Ushauri wa siri bila malipo: 1195 (saa 24). Vijana: 1190. Hauko peke yako.' },
    child: { en: 'END Child abuse: call Childline Kenya 116 (free, 24hrs) or 1195. Any adult can report. Do not send the child back to the abuser.', sw: 'END Dhuluma kwa mtoto: piga Childline Kenya 116 (bure, saa 24) au 1195. Mtu yeyote mzima anaweza kuripoti. Usimrudishe mtoto kwa mdhalimu.' },
  },
  callbackWhen: {
    en: 'CON When is it safe to call you?\n1. Now\n2. In 1 hour\n3. This evening\n4. Tomorrow morning',
    sw: 'CON Ni lini salama kukupigia?\n1. Sasa\n2. Baada ya saa 1\n3. Jioni hii\n4. Kesho asubuhi',
  },
  callbackWindows: { en: ['now', 'within 1 hour', 'this evening', 'tomorrow morning'], sw: ['sasa', 'ndani ya saa 1', 'jioni hii', 'kesho asubuhi'] },
  callbackDone: (lang: Lang, ref: string, window: string) => t(lang, {
    en: `END Ref ${ref}. A trusted responder will call you ${window}. If you do not answer, we will not leave a message.`,
    sw: `END Nambari ${ref}. Mhudumu atakupigia ${window}. Usipopokea, hatutaacha ujumbe.`,
  }),
  refPrompt: { en: 'CON Enter your reference (e.g. SS-4K2F):', sw: 'CON Andika nambari yako ya rejeleo (mfano SS-4K2F):' },
  status: (lang: Lang, ref: string, status: string) => t(lang, { en: `END ${ref}: ${status}. Free help 24hrs: 1195.`, sw: `END ${ref}: ${status}. Msaada saa 24: 1195.` }),
  notFound: { en: 'END We could not find a report with that reference for this phone.', sw: 'END Hatukupata ripoti yenye nambari hiyo kwa simu hii.' },
  deleted: (lang: Lang, ref: string) => t(lang, { en: `END Report ${ref} and all its data have been permanently deleted.`, sw: `END Ripoti ${ref} na data yake yote imefutwa kabisa.` }),
  invalid: { en: 'END Invalid choice. Dial again to start over. Free help: 1195.', sw: 'END Chaguo si sahihi. Piga tena kuanza upya. Msaada: 1195.' },
};

export const VOICE = {
  welcome: 'Welcome to Sauti Salama. This is a safe and confidential line. For English, press 1. Kwa Kiswahili, bonyeza 2.',
  main: {
    en: 'Press 1 to tell us what happened. Press 2 to hear urgent help information. Press 3 to speak with a counsellor. If you cannot talk safely, press 9 now and we will alert a responder quietly.',
    sw: 'Bonyeza 1 kutuambia kilichotokea. Bonyeza 2 kusikia maelezo ya msaada wa dharura. Bonyeza 3 kuzungumza na mshauri. Ikiwa huwezi kuongea kwa usalama, bonyeza 9 sasa na tutamjulisha mhudumu kimya kimya.',
  },
  recordPrompt: {
    en: 'Take your time. After the beep, tell us what happened, where you are, and whether you are safe right now. Press the hash key when you are done.',
    sw: 'Chukua muda wako. Baada ya mlio, tuambie kilichotokea, uko wapi, na kama uko salama sasa hivi. Bonyeza alama ya reli ukimaliza.',
  },
  afterRecord: (lang: Lang, refSpelled: string) => t(lang, {
    en: `Thank you. Your reference number is ${refSpelled}. A trusted responder in your area is being alerted. Is it safe for us to call or text this phone? Press 1 for yes, or 2 for no.`,
    sw: `Asante. Nambari yako ya rejeleo ni ${refSpelled}. Mhudumu wa kuaminika katika eneo lako anaarifiwa. Ni salama kwetu kupiga simu au kutuma SMS kwa simu hii? Bonyeza 1 kwa ndiyo, au 2 kwa hapana.`,
  }),
  consentYes: {
    en: 'Thank you. Your responder will contact you on this number. If it stops being safe, dial this line again and press 9. Free help any time on 1 1 9 5. Stay safe.',
    sw: 'Asante. Mhudumu wako atawasiliana nawe kwa nambari hii. Ikiwa haitakuwa salama tena, piga simu hii tena na ubonyeze 9. Msaada wa bure wakati wowote: 1 1 9 5. Uwe salama.',
  },
  consentNo: {
    en: 'Understood. Nobody will call or text this phone. Your responder will use your reference number, and you can dial this line again any time to check progress. You may want to delete this call from your call log. Free help any time on 1 1 9 5.',
    sw: 'Sawa. Hakuna atakayepiga au kutuma SMS kwa simu hii. Mhudumu wako atatumia nambari yako ya rejeleo, na unaweza kupiga simu hii tena wakati wowote kuangalia maendeleo. Unaweza kufuta simu hii kwenye orodha ya simu zako. Msaada wa bure wakati wowote: 1 1 9 5.',
  },
  info: {
    en: 'If sexual violence happened, go to any health facility within 72 hours for free H I V prevention and emergency contraception, and ask for the P R C form. If you are in danger now, call 9 9 9 or 1 1 2. Free counselling any time on 1 1 9 5. For a child, call Childline on 1 1 6.',
    sw: 'Ikiwa kumetokea dhuluma ya kingono, nenda kituo chochote cha afya ndani ya saa 72 kwa dawa ya bure ya kuzuia HIV na mimba, na uombe fomu ya PRC. Ikiwa uko hatarini sasa, piga 9 9 9 au 1 1 2. Ushauri wa bure wakati wowote: 1 1 9 5. Kwa mtoto, piga Childline 1 1 6.',
  },
  infoMenu: { en: 'Press 1 to hear that again, 2 to leave a report, or hang up.', sw: 'Bonyeza 1 kusikia tena, 2 kuacha ripoti, au kata simu.' },
  transfer: { en: 'Connecting you to a counsellor now. Please hold.', sw: 'Tunakuunganisha na mshauri sasa. Tafadhali subiri.' },
  callbackLogged: (lang: Lang, refSpelled: string) => t(lang, {
    en: `All counsellors are busy right now. We have logged your request, reference ${refSpelled}, and a trusted responder will call you back. Is it safe to call this phone? Press 1 for yes, 2 for no.`,
    sw: `Washauri wote wako na simu nyingine sasa. Tumeandikisha ombi lako, nambari ${refSpelled}, na mhudumu wa kuaminika atakupigia. Ni salama kupiga simu hii? Bonyeza 1 kwa ndiyo, 2 kwa hapana.`,
  }),
  goodbye: { en: 'Free help any time on 1 1 9 5. Goodbye, and stay safe.', sw: 'Msaada wa bure wakati wowote: 1 1 9 5. Kwaheri, uwe salama.' },
  invalid: { en: 'Sorry, that is not a valid choice.', sw: 'Samahani, hicho si chaguo sahihi.' },
};

export const SMS = {
  received: (lang: Lang, ref: string) => t(lang, {
    en: `Sauti Salama ${ref}: received. A trusted responder has been alerted. Reply YES if it is safe to text this number. Free help 24hrs: 1195. Delete this SMS if needed.`,
    sw: `Sauti Salama ${ref}: imepokelewa. Mhudumu wa kuaminika ameshaarifiwa. Jibu NDIYO ikiwa ni salama kutuma SMS hapa. Msaada saa 24: 1195. Futa SMS hii ukihitaji.`,
  }),
  nextSteps: (lang: Lang, ref: string, steps: string) => t(lang, {
    en: `Sauti Salama ${ref}: ${steps}. Free help 24hrs: 1195. Reply STOP ${ref} to delete your report.`,
    sw: `Sauti Salama ${ref}: ${steps}. Msaada saa 24: 1195. Jibu FUTA ${ref} kufuta ripoti yako.`,
  }),
  info: (lang: Lang) => t(lang, {
    en: 'Sauti Salama: free help 24hrs on 1195. After sexual violence go to any health facility within 72hrs (free PEP + PRC form). Danger now: 999/112. Child: 116. Delete this SMS if needed.',
    sw: 'Sauti Salama: msaada wa bure saa 24 kwa 1195. Baada ya dhuluma ya kingono nenda kituo cha afya ndani ya saa 72 (PEP na PRC bure). Hatari sasa: 999/112. Mtoto: 116. Futa SMS hii ukihitaji.',
  }),
  acknowledged: (lang: Lang, ref: string, name: string) => t(lang, {
    en: `Sauti Salama ${ref}: responder ${name} has accepted your case and will follow up as agreed. Free help 24hrs: 1195.`,
    sw: `Sauti Salama ${ref}: mhudumu ${name} amekubali kesi yako na atafuatilia kama ilivyokubaliwa. Msaada saa 24: 1195.`,
  }),
  ackConfirm: (ref: string, name: string) => `Sauti Salama: ACK recorded for ${ref} by ${name}. Open the console for details. Reply RESOLVE ${ref} when the survivor is safe.`,
  resolveConfirm: (ref: string) => `Sauti Salama: ${ref} marked resolved. Thank you.`,
  deleted: (lang: Lang, ref: string) => t(lang, { en: `Sauti Salama: report ${ref} and all its data were permanently deleted.`, sw: `Sauti Salama: ripoti ${ref} na data yake yote imefutwa kabisa.` }),
  unknownRef: 'Sauti Salama: reference not found for this number.',
};

export const STATUS_TEXT = (lang: Lang, status: string, actor?: string) => {
  const m: Record<string, LT> = {
    PROCESSING: { en: 'received, being processed', sw: 'imepokelewa, inashughulikiwa' },
    OPEN: { en: 'received, waiting for a responder to accept', sw: 'imepokelewa, inasubiri mhudumu akubali' },
    ACKNOWLEDGED: { en: `responder ${actor || ''} has accepted your case`.replace('  ', ' '), sw: `mhudumu ${actor || ''} amekubali kesi yako`.replace('  ', ' ') },
    ESCALATED: { en: 'escalated to the GBV Recovery Centre desk', sw: 'imepelekwa kwa dawati la Kituo cha GBV' },
    RESOLVED: { en: 'closed - you reported you are safe', sw: 'imefungwa - uliripoti uko salama' },
    FALSE_ALARM: { en: 'closed', sw: 'imefungwa' },
  };
  return t(lang, m[status] || m.OPEN);
};
