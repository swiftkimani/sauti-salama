import { Injectable } from '@nestjs/common';
import { Lang, NextStep, TriageResult } from '../ai/triage.types';
import { ResourcesService } from '../resources/resources.service';

export interface PathwayContext {
  ward?: string;
  safeToContact?: boolean;
  consentSharePolice?: boolean;
  channel: string;
}

/**
 * Referral pathway engine: deterministic rules that turn a triage result into an ordered,
 * bilingual list of next steps with deadlines and the verified service for each.
 * Rules encode Kenya's GBV response standards (72h PEP / 120h EC window, PRC form MOH 363,
 * P3 form, PADVA 2015 protection orders, Childline 116, mandatory child-protection referral).
 */
@Injectable()
export class ReferralService {
  constructor(private readonly resources: ResourcesService) {}

  build(tr: TriageResult, ctx: PathwayContext): NextStep[] {
    const steps: NextStep[] = [];
    const svc = (cat: string) => {
      const r = this.resources.pick(cat, ctx.ward);
      return r ? { name: r.name, phone: r.phone || undefined, category: cat } : undefined;
    };
    const has = (x: string) => tr.violence_types.includes(x);
    const child = tr.survivor_age_group === 'child';
    const sexual = has('sexual');
    const h = tr.hours_since_incident;
    let p = 1;

    if (tr.immediate_danger) {
      steps.push({
        key: 'safety_now', priority: p++,
        title: { en: 'Get to safety now', sw: 'Nenda mahali salama sasa' },
        short: { en: 'Move to a safe place; a responder is coming', sw: 'Nenda mahali salama; mhudumu anakuja' },
        detail: { en: 'A trusted community responder for your area has been alerted. If you can, move to a neighbour, a shop or any public place. If your life is in danger call 999 or 112.', sw: 'Mhudumu wa jamii wa eneo lako ameshaarifiwa. Ukiweza, nenda kwa jirani, duka au mahali pa umma. Ikiwa maisha yako yako hatarini piga 999 au 112.' },
        service: svc('emergency'),
      });
    }
    if (child) {
      steps.push({
        key: 'child_protection', priority: p++,
        title: { en: 'Child protection', sw: 'Ulinzi wa mtoto' },
        short: { en: 'Childline 116 (free, 24hrs)', sw: 'Childline 116 (bure, saa 24)' },
        detail: { en: 'Childline Kenya 116 is free, 24/7. The child must not be returned to the abuser. A Children\'s Officer will be involved by the responder (mandatory under the Children Act 2022).', sw: 'Childline Kenya 116 ni bure, saa 24. Mtoto asirudishwe kwa mdhalimu. Mhudumu atamhusisha Afisa wa Watoto (ni lazima chini ya Sheria ya Watoto 2022).' },
        service: svc('child'),
      });
    }
    if (sexual && (h === null || h <= 72)) {
      steps.push({
        key: 'medical_72h', priority: p++,
        deadline: { en: 'Within 72 hours of the incident', sw: 'Ndani ya saa 72 tangu tukio' },
        title: { en: 'Go to a health facility for free post-rape care', sw: 'Nenda kituo cha afya kwa huduma ya bure baada ya ubakaji' },
        short: { en: 'Go to a health facility within 72hrs for free care (PEP)', sw: 'Nenda kituo cha afya ndani ya saa 72 kwa matibabu ya bure (PEP)' },
        detail: { en: 'Any public hospital or GBV Recovery Centre: HIV prevention (PEP) within 72 hours, emergency contraception within 120 hours, treatment, and the free PRC form (MOH 363) that records evidence. If possible do not bathe or change clothes before going.', sw: 'Hospitali yoyote ya umma au Kituo cha GBV: PEP kuzuia HIV ndani ya saa 72, kuzuia mimba ndani ya saa 120, matibabu, na fomu ya PRC (MOH 363) bila malipo inayoweka ushahidi. Ukiweza usioge wala kubadilisha nguo kabla ya kwenda.' },
        service: svc('medical'),
      });
    } else if (sexual && h <= 120) {
      steps.push({
        key: 'medical_120h', priority: p++,
        deadline: { en: 'Within 120 hours of the incident', sw: 'Ndani ya saa 120 tangu tukio' },
        title: { en: 'Go to a health facility today', sw: 'Nenda kituo cha afya leo' },
        short: { en: 'Go to a health facility today (free care, PRC form)', sw: 'Nenda kituo cha afya leo (matibabu bure, fomu ya PRC)' },
        detail: { en: 'Emergency contraception is still possible within 120 hours. Treatment, STI care and the free PRC form (MOH 363) are available at any public hospital or GBV Recovery Centre.', sw: 'Kuzuia mimba bado kunawezekana ndani ya saa 120. Matibabu, huduma ya magonjwa ya zinaa na fomu ya PRC (MOH 363) bila malipo zinapatikana hospitali yoyote ya umma au Kituo cha GBV.' },
        service: svc('medical'),
      });
    } else if (sexual) {
      steps.push({
        key: 'medical_care', priority: p++,
        title: { en: 'Medical care and documentation', sw: 'Matibabu na uthibitisho' },
        short: { en: 'Free medical care and PRC form at any health facility', sw: 'Matibabu ya bure na fomu ya PRC kituo chochote cha afya' },
        detail: { en: 'It is not too late for care: STI screening, treatment and the free PRC form (MOH 363), which documents what happened for any case you may choose to bring.', sw: 'Bado si kuchelewa: uchunguzi wa magonjwa ya zinaa, matibabu na fomu ya PRC (MOH 363) bila malipo, inayoandikisha kilichotokea kwa kesi yoyote utakayoamua kufungua.' },
        service: svc('medical'),
      });
    } else if (has('physical') || has('fgm')) {
      steps.push({
        key: 'medical_p3', priority: p++,
        title: { en: 'Get treated and have injuries recorded', sw: 'Pata matibabu na majeraha yaandikwe' },
        short: { en: 'Get treated; ask for injuries to be recorded (P3 form)', sw: 'Pata matibabu; omba majeraha yaandikwe (fomu ya P3)' },
        detail: { en: 'Treatment at any health facility. Ask for your injuries to be recorded. A P3 form (free from any police station) records injuries for a court case, if you ever want one.', sw: 'Matibabu kituo chochote cha afya. Omba majeraha yako yaandikwe. Fomu ya P3 (bure kutoka kituo chochote cha polisi) huandikisha majeraha kwa kesi kortini, ukitaka.' },
        service: svc('medical'),
      });
    }
    if (tr.needs.includes('shelter')) {
      steps.push({
        key: 'shelter', priority: p++,
        title: { en: 'Safe shelter', sw: 'Makazi salama' },
        short: { en: 'Safe shelter via 1195 or your responder', sw: 'Makazi salama kupitia 1195 au mhudumu wako' },
        detail: { en: 'Shelter placement is arranged through 1195 or the GBV Recovery Centre. Locations are never published; your responder can help you get there safely.', sw: 'Makazi salama hupangwa kupitia 1195 au Kituo cha GBV. Mahali hapatangazwi; mhudumu wako anaweza kukusaidia kufika salama.' },
        service: svc('shelter'),
      });
    }
    if (has('physical') || sexual || has('fgm') || has('child_marriage')) {
      steps.push({
        key: 'police_report', priority: p++,
        title: { en: child ? 'Police report (responder will assist)' : 'Report to the police (your choice)', sw: child ? 'Ripoti kwa polisi (mhudumu atasaidia)' : 'Ripoti kwa polisi (ni uamuzi wako)' },
        short: { en: 'Police Gender Desk + free P3 form (your choice)', sw: 'Gender Desk ya polisi + fomu ya P3 bure (uamuzi wako)' },
        detail: { en: 'Any police station has a Gender Desk. You can go with your responder or a friend. Reporting is your decision; medical care does not depend on it.', sw: 'Kituo chochote cha polisi kina Gender Desk. Unaweza kwenda na mhudumu wako au rafiki. Kuripoti ni uamuzi wako; matibabu hayategemei hilo.' },
        service: svc('police'),
      });
    }
    if (tr.needs.includes('legal')) {
      steps.push({
        key: 'legal', priority: p++,
        title: { en: 'Legal help and a Protection Order', sw: 'Msaada wa kisheria na Amri ya Ulinzi' },
        short: { en: 'Free legal aid: FIDA Kenya; Protection Order possible', sw: 'Msaada wa kisheria bure: FIDA Kenya; Amri ya Ulinzi inawezekana' },
        detail: { en: 'FIDA Kenya gives free legal aid. A court can issue a Protection Order under the Protection Against Domestic Violence Act 2015 to keep the abuser away from you and your children.', sw: 'FIDA Kenya hutoa msaada wa kisheria bila malipo. Korti inaweza kutoa Amri ya Ulinzi chini ya Sheria ya Kuzuia Ukatili wa Kinyumbani 2015 kumzuia mdhalimu kukukaribia wewe na watoto wako.' },
        service: svc('legal'),
      });
    }
    steps.push({
      key: 'counselling', priority: p++,
      title: { en: 'Talk to a counsellor', sw: 'Zungumza na mshauri' },
      short: { en: 'Free counselling 24hrs: 1195', sw: 'Ushauri bure saa 24: 1195' },
      detail: { en: 'Free, confidential, 24/7 on 1195. Youth-friendly line: 1190.', sw: 'Bure, siri, saa 24 kwa 1195. Simu ya vijana: 1190.' },
      service: svc('helpline'),
    });
    steps.push({
      key: 'follow_up', priority: p++,
      title: { en: 'Follow-up from your responder', sw: 'Ufuatiliaji kutoka kwa mhudumu wako' },
      short: ctx.safeToContact
        ? { en: 'Your responder will contact you on this phone', sw: 'Mhudumu wako atawasiliana nawe kwa simu hii' }
        : { en: 'No calls/SMS to this phone; dial again to check status', sw: 'Hakuna simu/SMS kwa simu hii; piga tena kuangalia hali' },
      detail: ctx.safeToContact
        ? { en: 'You said this phone is safe. Your responder will call or text this number.', sw: 'Ulisema simu hii ni salama. Mhudumu wako atapiga simu au kutuma SMS kwa nambari hii.' }
        : { en: 'You said this phone is not safe: nobody will call or text it. Dial the line again any time and use your reference number to check progress or to speak to someone.', sw: 'Ulisema simu hii si salama: hakuna atakayepiga au kutuma SMS. Piga simu hii tena wakati wowote na utumie nambari yako ya rejeleo kuangalia maendeleo au kuzungumza na mtu.' },
    });
    return steps;
  }

  /** The 1-2 most important steps as one short sentence, for USSD / voice / SMS. */
  survivorSteps(pathway: NextStep[], lang: Lang, max = 2): string {
    return pathway
      .filter((s) => !['follow_up', 'counselling'].includes(s.key))
      .slice(0, max)
      .map((s) => (lang === 'sw' ? s.short.sw : s.short.en))
      .join('. ');
  }
}
