import { Resource } from '../entities/resource.entity';

/**
 * Verified support directory. `verified: true` = confirmed against the source listed on
 * 16 Sep 2026. Entries marked false must be confirmed before the demo video.
 * Add county-level entries (coverage: 'Nairobi', 'Kisumu', ...) as partners are onboarded.
 */
export const SEED_RESOURCES: Partial<Resource>[] = [
  { category: 'helpline', name: 'National GBV Helpline 1195 (Healthcare Assistance Kenya)', coverage: 'national', phone: '1195', hours: '24/7', free: true, verified: true, source: 'migecah.go.ke; UN Women Kenya',
    noteEn: 'Toll-free tele-counselling, referrals to shelters, legal aid, health facilities and rescue.', noteSw: 'Ushauri wa simu bila malipo, rufaa kwa makazi salama, msaada wa kisheria, vituo vya afya na uokoaji.' },
  { category: 'counselling', name: 'LVCT Health One2One line 1190', coverage: 'national', phone: '1190', hours: '24/7', free: true, verified: true, source: 'help.unhcr.org/kenya',
    noteEn: 'Youth-friendly counselling and sexual & reproductive health information.', noteSw: 'Ushauri kwa vijana na maelezo ya afya ya uzazi.' },
  { category: 'child', name: 'Childline Kenya 116', coverage: 'national', phone: '116', hours: '24/7', free: true, verified: true, source: 'childlinekenya.co.ke',
    noteEn: 'Child protection helpline; any adult can report on behalf of a child.', noteSw: 'Simu ya ulinzi wa mtoto; mtu yeyote mzima anaweza kuripoti kwa niaba ya mtoto.' },
  { category: 'emergency', name: 'Kenya Police emergency 999 / 112', coverage: 'national', phone: '999 / 112', hours: '24/7', free: true, verified: true, source: 'help.unhcr.org/kenya',
    noteEn: 'Immediate danger. Gender Desks exist at police stations for GBV reports.', noteSw: 'Hatari ya sasa. Vituo vya polisi vina Gender Desk kwa ripoti za dhuluma.' },
  { category: 'emergency', name: 'Kenya Red Cross emergency 1199', coverage: 'national', phone: '1199', hours: '24/7', free: true, verified: false, source: 'confirm at redcross.or.ke before demo',
    noteEn: 'Ambulance and rescue support (dispatched via 1195 in FGM/violence rescues).', noteSw: 'Ambulance na uokoaji.' },
  { category: 'medical', name: 'Gender Violence Recovery Centre (GVRC), Nairobi Women\'s Hospital', coverage: 'national', phone: '0800 720 565', hours: '24/7', free: true, verified: true, source: 'gvrc.or.ke',
    noteEn: 'Free medical treatment, PEP, emergency contraception, PRC documentation and counselling for survivors. Branches in Nairobi, Nakuru, Naivasha, Mombasa.', noteSw: 'Matibabu ya bure, PEP, kuzuia mimba, fomu ya PRC na ushauri kwa waathiriwa. Matawi Nairobi, Nakuru, Naivasha, Mombasa.' },
  { category: 'medical', name: 'Kenyatta National Hospital GBV Recovery Centre', coverage: 'Nairobi', phone: null, hours: '24/7', free: true, verified: false, source: 'confirm at knh.or.ke',
    noteEn: 'Public one-stop GBV recovery centre.', noteSw: 'Kituo cha umma cha huduma zote kwa waathiriwa wa dhuluma.' },
  { category: 'police', name: 'Police Gender Desk (any police station)', coverage: 'national', phone: '999 / 112', hours: '24/7', free: true, verified: true, source: 'National Police Service',
    noteEn: 'Reporting and the free P3 form (medical-legal evidence). You may go with a responder or friend.', noteSw: 'Kuripoti na fomu ya P3 bila malipo (ushahidi wa kimatibabu na kisheria). Unaweza kwenda na mhudumu au rafiki.' },
  { category: 'police', name: 'Policare one-stop GBV centre', coverage: 'Laikipia', phone: null, hours: '24/7', free: true, verified: false, source: 'confirm current Policare centres with NPS',
    noteEn: 'Police, medical, counselling and legal services under one roof.', noteSw: 'Polisi, matibabu, ushauri na huduma za kisheria mahali pamoja.' },
  { category: 'legal', name: 'FIDA Kenya (Federation of Women Lawyers)', coverage: 'national', phone: '0800 720 501', hours: 'Office hours', free: true, verified: false, source: 'confirm at fidakenya.org before demo',
    noteEn: 'Free legal aid: protection orders (PADVA 2015), maintenance, representation.', noteSw: 'Msaada wa kisheria bila malipo: Amri ya Ulinzi (PADVA 2015), matunzo, uwakilishi.' },
  { category: 'shelter', name: 'Safe shelter placement (via 1195 / GVRC)', coverage: 'national', phone: '1195', hours: '24/7', free: true, verified: true, source: 'HAK 1195 referral network',
    noteEn: 'Shelter locations are never published; placement is arranged by the helpline or a responder.', noteSw: 'Mahali pa makazi salama hapatangazwi; hupangwa na simu ya msaada au mhudumu.' },
];
