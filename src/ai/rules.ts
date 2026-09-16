import { NEEDS, RELATIONSHIPS, RISK_FLAGS, TriageInput, TriageResult, Urgency, URGENCY_RANK, VIOLENCE_TYPES } from './triage.types';

/**
 * Deterministic, offline triage. Two jobs:
 *  1. the fallback when no AI key is configured or the AI call fails (the line must never depend on a third party), and
 *  2. a safety floor under the AI: the AI may raise urgency or add detail, it can never lower danger signals the rules found.
 * Keyword lists cover English, Kiswahili and common Sheng phrasing.
 */
const KW: Record<string, string[]> = {
  sexual: ['rape', 'raped', 'sexual', 'sexually', 'defil', 'molest', 'forced me', 'forced her', 'touched me', 'touching me', 'bakwa', 'kubakwa', 'alinibaka', 'amenibaka', 'kunibaka', 'ngono', 'kulazimish', 'alinilazimisha', 'kingono', 'aliniingilia'],
  physical: ['beat', 'beaten', 'beating', 'hit me', 'hits me', 'punch', 'slap', 'kick', 'strangl', 'chok', 'burn', 'stab', 'injur', 'bleed', 'blood', 'wound', 'alinipiga', 'amenipiga', 'kupigwa', 'ananipiga', 'kichapo', 'alinichoma', 'kunyonga', 'kukaba', 'jeraha', 'majeraha', 'damu', 'kuchapa', 'amenichapa'],
  emotional: ['threat', 'threaten', 'insult', 'humiliat', 'controls me', 'isolat', 'shout', 'scream', 'afraid', 'scared', 'fear', 'vitisho', 'tishio', 'anatishia', 'ananitisha', 'matusi', 'kutukan', 'ananitukana', 'kudhalilish', 'naogopa', 'hofu'],
  economic: ['my money', 'my salary', 'refuses to pay', 'withhold', 'took my phone', 'took my id', 'pesa zangu', 'mshahara', 'anakataa kulipa', 'chakula cha watoto', 'amechukua simu', 'hela zangu'],
  harassment: ['harass', 'stalk', 'following me', 'follows me', 'nudes', 'photos of me', 'pictures of me', 'my photos', 'online', 'whatsapp', 'facebook', 'tiktok', 'instagram', 'kunifuata', 'ananifuata', 'kunisumbua', 'ananisumbua', 'picha zangu', 'mtandaoni'],
  fgm: ['fgm', 'circumcis', 'genital mutilation', 'ukeketaji', 'kukeketwa', 'tohara', 'kumkeketa', 'kunikeketa'],
  child_marriage: ['marry me off', 'married off', 'forced marriage', 'early marriage', 'ndoa ya lazima', 'kuolewa kwa lazima', 'kuniozesha', 'aniozeshe', 'kumuozesha'],
};
const STRONG_DANGER = ['still here', 'is here', 'he is here', 'yuko hapa', 'ako hapa', 'coming back', 'anarudi', 'anakuja', 'outside the door', 'nje ya mlango', 'locked me', 'locked in', 'amenifungia', "can't leave", 'cannot leave', "can't get out", 'siwezi kutoka', 'going to kill', 'will kill', 'kill me', 'ataniua', 'kuniua', 'anataka kuniua', 'knife', 'kisu', 'panga', 'gun', 'bunduki', 'machete', 'in danger', 'hatarini', 'help me now', 'nisaidie sasa', 'naomba msaada sasa'];
const NOW = ['right now', 'sasa hivi', 'just now', 'sasa', ' now', 'tonight', 'usiku huu'];
const WEAPON = ['knife', 'kisu', 'panga', 'gun', 'bunduki', 'machete', 'rungu', 'club'];
const STRANGLE = ['strangl', 'chok', 'kunyonga', 'kukaba', 'my throat', 'my neck', 'shingo'];
const CHILDREN_PRESENT = ['children', 'kids', 'watoto', 'wanangu', 'my baby', 'mtoto wangu', 'the baby'];
const ESCALATING = ['getting worse', 'worse', 'more and more', 'every day', 'kila siku', 'inazidi', 'again and again', 'tena na tena', 'not the first', 'si mara ya kwanza'];
const SUICIDAL = ['kill myself', 'end my life', 'kujiua', 'nijiue', 'sitaki kuishi', 'want to die'];
const PREGNANT = ['pregnant', 'mjamzito', 'nina mimba', 'nimebeba'];
const SHELTER = ['nowhere to go', 'sina pa kwenda', 'kicked me out', 'threw me out', 'amenifukuza', 'sleep outside', 'nalala nje', 'shelter', 'makazi'];
const CHILD = ['i am a student', 'form 1', 'form 2', 'form 3', 'form 4', 'class 8', 'class 7', 'class 6', 'class 5', 'niko form', 'my daughter', 'my son', 'binti yangu', 'mwanangu', 'mtoto wangu', 'msichana mdogo', 'mvulana mdogo', 'my niece', 'my pupil', 'mwanafunzi', 'shuleni', 'primary school', 'secondary school', 'my little sister', 'dada yangu mdogo'];
const REL: [string, string[]][] = [
  ['intimate_partner', ['husband', 'my hubby', 'boyfriend', 'my partner', 'my wife', 'my ex', 'ex-boyfriend', 'ex husband', 'mume wangu', 'mume', 'mpenzi wangu', 'bwana wangu', 'mchumba', 'boyfie', 'my man', 'baba watoto', 'baby daddy', 'msee wangu', 'chali wangu', 'mdem wangu', 'dem wangu']],
  ['family', ['my father', 'my dad', 'my uncle', 'my brother', 'stepfather', 'step father', 'my mother', 'my cousin', 'my grandfather', 'baba yangu', 'mjomba', 'kaka yangu', 'mama yangu', 'baba wa kambo', 'babu', 'shemeji', 'binamu']],
  ['acquaintance', ['neighbour', 'neighbor', 'my friend', 'my boss', 'my teacher', 'landlord', 'pastor', 'coach', 'jirani', 'rafiki', 'bosi wangu', 'mwalimu', 'mwenye nyumba', 'mchungaji', 'kocha']],
  ['authority', ['police', 'polisi', 'chief', 'chifu', 'officer', 'askari', 'soldier', 'mkuu']],
  ['stranger', ['stranger', 'unknown man', 'unknown person', 'a man i', 'mtu nisiyemjua', 'sijui ni nani', 'mgeni']],
];
const TIME: { re: RegExp; hours: number }[] = [
  { re: /(right now|sasa hivi|just now|dakika chache|minutes ago|happening now|inaendelea sasa)/i, hours: 0.5 },
  { re: /(today|leo|tonight|usiku huu|this morning|asubuhi ya leo|hours ago|saa (chache|mbili|tatu) zilizopita)/i, hours: 6 },
  { re: /(yesterday|jana|last night|jana usiku)/i, hours: 30 },
  { re: /(two days ago|juzi|siku mbili zilizopita)/i, hours: 50 },
  { re: /(this week|wiki hii|days ago|siku (tatu|nne|tano|sita) zilizopita)/i, hours: 96 },
  { re: /(last week|wiki iliyopita|wiki jana|two weeks|last month|mwezi uliopita|months|miezi|years|miaka|since \d{4})/i, hours: 400 },
];
const SW_WORDS = ['na', 'ni', 'ya', 'wa', 'kwa', 'mimi', 'yeye', 'sasa', 'leo', 'jana', 'nyumbani', 'niko', 'nina', 'sina', 'hapa', 'wangu', 'yangu', 'msaada', 'tafadhali', 'naomba', 'alinipiga', 'amenipiga', 'ananipiga', 'mume', 'lakini', 'kwa sababu'];
const EN_WORDS = ['the', 'and', 'is', 'he', 'she', 'my', 'me', 'was', 'are', 'help', 'please', 'husband', 'home', 'with', 'because', 'but', 'they'];
const SHENG = ['manze', 'msee', 'buda', 'mdem', 'dem', 'kubaya', 'chali', 'mbogi', 'kuchapa', 'mathee', 'fathee', 'mbaya sana', 'form', 'vibaya', 'noma', 'ile'];

/** Small Kenyan gazetteer so the offline triage can still pull an area out of free text. Extend per county. */
const PLACES = ['kayole', 'kayole soweto', 'dandora', 'kibra', 'kibera', 'laini saba', 'makina', 'lindi', 'mathare', 'mukuru', 'mukuru kwa njenga', 'mukuru kwa reuben', 'kwa njenga', 'kwa reuben', 'viwandani', 'kawangware', 'githurai', 'umoja', 'embakasi', 'huruma', 'korogocho', 'kariobangi', 'kasarani', 'roysambu', 'zimmerman', 'pipeline', 'donholm', 'buruburu', 'eastleigh', 'pangani', 'kangemi', 'dagoretti', 'kikuyu', 'ruaka', 'ongata rongai', 'rongai', 'kitengela', 'athi river', 'mlolongo', 'ruiru', 'juja', 'thika', 'kiambu', 'machakos', 'nakuru', 'naivasha', 'kisumu', 'mombasa', 'eldoret', 'kakamega', 'nyeri', 'meru', 'embu', 'garissa', 'kisii', 'kericho', 'bungoma', 'busia', 'kilifi', 'malindi', 'lamu', 'isiolo', 'marsabit', 'lodwar', 'turkana', 'kajiado', 'narok', 'samburu', 'west pokot', 'kapenguria', 'migori', 'homa bay', 'siaya', 'vihiga', 'nandi', 'kitale', 'bomet', 'nyandarua', "murang'a", 'kirinyaga', 'kitui', 'makueni', 'wote', 'voi', 'kwale', 'ukunda', 'wajir', 'mandera', 'laikipia', 'nanyuki', 'baringo', 'uasin gishu', 'ngong', 'karen', 'langata', 'south b', 'south c', 'madaraka', 'nairobi west', 'parklands', 'westlands', 'kilimani', 'kileleshwa', 'lavington', 'ruai', 'utawala', 'makadara', 'jericho', 'kaloleni', 'mbotela', 'starehe', 'majengo', 'kamukunji', 'mwiki', 'kahawa west', 'kahawa sukari', 'kahawa', 'komarock', 'njiru', 'saika', 'tassia', 'fedha', 'imara daima', 'syokimau', 'kitisuru', 'runda', 'gigiri', 'muthaiga', 'garden estate', 'lucky summer', 'baba dogo', 'ngara', 'kariokor', 'shauri moyo', 'ziwani', 'bahati', 'maringo', 'uhuru estate', 'harambee estate', 'industrial area', 'kianda', 'olympic', 'ayany', 'gatwekera', 'soweto', 'nairobi', 'cbd'];
const PLACES_SORTED = [...PLACES].sort((a, b) => b.length - a.length);

export function extractPlaces(text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  const out: string[] = [];
  for (const place of PLACES_SORTED) {
    if (new RegExp(`[^a-z']${place.replace(/'/g, "'")}[^a-z']`).test(t)) {
      const title = place.replace(/\b\w/g, (c) => c.toUpperCase());
      if (!out.some((o) => o.toLowerCase().includes(place) || place.includes(o.toLowerCase()))) out.push(title);
    }
    if (out.length >= 3) break;
  }
  return out;
}

const has = (t: string, list: string[]) => list.some((k) => t.includes(k));
const found = (t: string, list: string[]) => list.filter((k) => t.includes(k));

export function detectLanguage(text: string, fallback: string): string {
  const tokens = ` ${text.toLowerCase()} `.split(/[^a-z']+/).filter(Boolean);
  const sw = tokens.filter((w) => SW_WORDS.includes(w)).length;
  const en = tokens.filter((w) => EN_WORDS.includes(w)).length;
  const sheng = tokens.filter((w) => SHENG.includes(w)).length;
  if (sheng >= 2 || (sheng >= 1 && sw && en)) return 'sheng';
  if (sw && en && Math.abs(sw - en) <= 1) return 'mixed';
  if (sw > en) return 'sw';
  if (en > sw) return 'en';
  return fallback;
}

export function hoursFromText(text: string): number | null {
  for (const t of TIME) if (t.re.test(text)) return t.hours;
  return null;
}

export function urgencyFrom(o: { types: string[]; immediate: boolean; hours: number | null; child: boolean; flags: string[] }): Urgency {
  if (o.immediate) return 'critical';
  const sexual = o.types.includes('sexual');
  if (sexual && (o.hours === null || o.hours <= 72)) return 'high';
  if (o.child && (sexual || o.types.includes('physical') || o.types.includes('fgm') || o.types.includes('child_marriage'))) return 'high';
  if (o.flags.includes('weapon') || o.flags.includes('strangulation') || o.flags.includes('suicidal')) return 'high';
  if (sexual || o.types.includes('physical') || o.types.includes('fgm') || o.types.includes('child_marriage')) return 'medium';
  return 'low';
}

export function needsFrom(o: { types: string[]; immediate: boolean; child: boolean; rel: string; flags: string[]; shelter: boolean }): string[] {
  const n = new Set<string>();
  if (o.types.includes('sexual') || o.types.includes('physical') || o.types.includes('fgm')) n.add('medical');
  if (o.immediate || o.flags.includes('weapon') || o.types.includes('sexual') || o.types.includes('physical')) n.add('police');
  if (o.immediate || o.shelter || o.types.includes('child_marriage') || o.types.includes('fgm')) n.add('shelter');
  if (['intimate_partner', 'family'].includes(o.rel) || o.types.includes('economic') || o.types.includes('harassment') || o.types.includes('child_marriage')) n.add('legal');
  n.add('counselling');
  if (o.child) n.add('child_protection');
  return Array.from(n);
}

export const TYPE_LABEL: Record<string, { en: string; sw: string }> = {
  physical: { en: 'physical violence', sw: 'dhuluma ya kimwili' },
  sexual: { en: 'sexual violence', sw: 'dhuluma ya kingono' },
  emotional: { en: 'threats / emotional abuse', sw: 'vitisho / dhuluma ya kihisia' },
  economic: { en: 'economic abuse', sw: 'dhuluma ya kiuchumi' },
  harassment: { en: 'harassment', sw: 'unyanyasaji' },
  fgm: { en: 'FGM risk', sw: 'hatari ya ukeketaji' },
  child_marriage: { en: 'forced / child marriage', sw: 'ndoa ya lazima au ya mtoto' },
  other: { en: 'unspecified abuse', sw: 'dhuluma isiyobainishwa' },
};
const REL_LABEL: Record<string, { en: string; sw: string }> = {
  intimate_partner: { en: 'intimate partner', sw: 'mwenzi wa karibu' },
  family: { en: 'family member', sw: 'mwanafamilia' },
  acquaintance: { en: 'someone known to the caller', sw: 'mtu anayemjua' },
  authority: { en: 'person in authority', sw: 'mtu mwenye mamlaka' },
  stranger: { en: 'stranger', sw: 'mgeni' },
  unknown: { en: 'not stated', sw: 'haijatajwa' },
};
export function timeLabel(hours: number | null): { en: string; sw: string } {
  if (hours === null || hours === undefined) return { en: 'time not stated', sw: 'muda haujatajwa' };
  if (hours <= 1) return { en: 'happening now', sw: 'inatokea sasa' };
  if (hours <= 24) return { en: 'within the last day', sw: 'ndani ya siku moja' };
  if (hours <= 72) return { en: 'within the last 3 days', sw: 'ndani ya siku 3' };
  if (hours <= 168) return { en: 'within the last week', sw: 'ndani ya wiki hii' };
  return { en: 'more than a week ago', sw: 'zaidi ya wiki moja iliyopita' };
}

function summaries(o: { channel: string; types: string[]; rel: string; hours: number | null; where: string; immediate: boolean; child: boolean; flags: string[]; present: boolean | null }) {
  const types = o.types.length ? o.types : ['other'];
  const t = timeLabel(o.hours);
  const en = [
    `Report via ${o.channel.replace('_', ' ')}: ${types.map((x) => TYPE_LABEL[x]?.en || x).join(', ')}`,
    `perpetrator: ${REL_LABEL[o.rel]?.en || o.rel}${o.present === true ? ' (present now)' : ''}`,
    `incident: ${t.en}`,
    `location: ${o.where || 'not stated'}`,
    `immediate danger: ${o.immediate ? 'YES' : 'no'}`,
    o.child ? 'survivor is a child' : null,
    o.flags.length ? `risk flags: ${o.flags.join(', ')}` : null,
  ].filter(Boolean).join('; ') + '.';
  const sw = [
    `Ripoti kupitia ${o.channel.replace('_', ' ')}: ${types.map((x) => TYPE_LABEL[x]?.sw || x).join(', ')}`,
    `mhalifu: ${REL_LABEL[o.rel]?.sw || o.rel}${o.present === true ? ' (yuko hapo sasa)' : ''}`,
    `tukio: ${t.sw}`,
    `eneo: ${o.where || 'halijatajwa'}`,
    `hatari ya sasa: ${o.immediate ? 'NDIYO' : 'hapana'}`,
    o.child ? 'mhusika ni mtoto' : null,
    o.flags.length ? `dalili za hatari: ${o.flags.join(', ')}` : null,
  ].filter(Boolean).join('; ') + '.';
  return { en, sw };
}

/** Free-text triage without any AI. */
export function rulesTriage(input: TriageInput): TriageResult {
  const text = ` ${(input.text || '').toLowerCase().replace(/\s+/g, ' ')} `;
  const h = input.hints || {};
  const types = new Set<string>();
  for (const [type, list] of Object.entries(KW)) if (has(text, list)) types.add(type);
  if (h.violence_type && VIOLENCE_TYPES.includes(h.violence_type as any)) types.add(h.violence_type);

  const flags: string[] = [];
  if (has(text, WEAPON)) flags.push('weapon');
  if (has(text, STRANGLE)) flags.push('strangulation');
  if (has(text, CHILDREN_PRESENT)) flags.push('children_present');
  if (has(text, ESCALATING)) flags.push('escalating');
  if (has(text, SUICIDAL)) flags.push('suicidal');
  if (has(text, PREGNANT)) flags.push('pregnant');

  const ageMatch = text.match(/(\d{1,2})\s*(years old|yrs|year old|yr old|miaka)/);
  const child = has(text, CHILD) || (ageMatch ? Number(ageMatch[1]) < 18 : false) || types.has('child_marriage');

  let rel = 'unknown';
  for (const [name, list] of REL) if (has(text, list)) { rel = name; break; }

  let hours = hoursFromText(text);
  if (h.when === 'recent') hours = hours !== null ? Math.min(hours, 72) : 24;
  else if (h.when === 'week') hours = hours ?? 96;
  else if (h.when === 'older') hours = hours ?? 400;

  const present = h.perpetrator_present ?? (has(text, ['is here', 'yuko hapa', 'ako hapa', 'still here', 'next to me', 'kando yangu']) ? true : null);
  const immediate = !!h.immediate_danger || present === true || has(text, STRONG_DANGER) || (has(text, NOW) && types.size > 0 && (hours ?? 99) <= 1);
  const shelter = has(text, SHELTER);
  const typeList = Array.from(types);
  const places = extractPlaces(input.text || '');
  const where = h.ward || places[0] || '';
  const s = summaries({ channel: input.channel, types: typeList, rel, hours, where, immediate, child, flags, present });
  return {
    violence_types: typeList,
    urgency: urgencyFrom({ types: typeList, immediate, hours, child, flags }),
    immediate_danger: immediate,
    perpetrator_present: present,
    perpetrator_relationship: rel,
    survivor_age_group: child ? 'child' : typeList.length ? 'adult' : 'unknown',
    hours_since_incident: hours,
    location_mentions: Array.from(new Set([...(h.ward ? [h.ward] : []), ...places])),
    needs: needsFrom({ types: typeList, immediate, child, rel, flags, shelter }),
    language_detected: detectLanguage(input.text || '', input.language),
    summary_en: s.en,
    summary_sw: s.sw,
    risk_flags: flags,
    confidence: typeList.length ? 0.55 : 0.3,
    provider: 'rules',
  };
}

/** USSD menu answers -> triage, no free text involved. */
export function structuredTriage(input: TriageInput): TriageResult {
  const r = rulesTriage({ ...input, text: '' });
  r.provider = 'structured';
  r.confidence = 0.8;
  r.language_detected = input.language;
  if (input.hints?.callback) {
    r.summary_en = `Call-back request via ${input.channel.replace('_', ' ')}: the caller asked to be phoned by a responder${input.hints.ward ? ` (area: ${input.hints.ward})` : ''}; no details given yet.`;
    r.summary_sw = `Ombi la kupigiwa simu kupitia ${input.channel.replace('_', ' ')}: mpigaji ameomba mhudumu amupigie${input.hints.ward ? ` (eneo: ${input.hints.ward})` : ''}; hakuna maelezo bado.`;
  }
  return r;
}

/** "I am in danger now" with no narrative at all. */
export function silentTriage(input: TriageInput): TriageResult {
  const r = rulesTriage({ ...input, text: '', hints: { ...(input.hints || {}), immediate_danger: true } });
  r.urgency = 'critical';
  r.immediate_danger = true;
  r.needs = Array.from(new Set(['police', 'shelter', 'counselling', ...r.needs]));
  r.summary_en = `SILENT ALERT via ${input.channel.replace('_', ' ')}: the caller indicated they are in danger right now and could not speak or type more. Location: ${input.hints?.ward || 'not stated'}.`;
  r.summary_sw = `ARIFA YA KIMYA kupitia ${input.channel.replace('_', ' ')}: mpigaji ameonyesha yuko hatarini sasa hivi na hakuweza kuongea au kuandika zaidi. Eneo: ${input.hints?.ward || 'halijatajwa'}.`;
  r.provider = 'silent';
  r.confidence = 0.9;
  return r;
}

/** Validate/clean the AI's JSON and apply the rules floor. */
export function normalizeTriage(raw: any, input: TriageInput, floor: TriageResult): TriageResult {
  const arr = (v: any, allowed?: readonly string[]) => (Array.isArray(v) ? v.map(String).filter((x) => !allowed || allowed.includes(x)) : []);
  const str = (v: any, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const urgency: Urgency = (['critical', 'high', 'medium', 'low'] as Urgency[]).includes(raw?.urgency) ? raw.urgency : floor.urgency;
  const immediate = !!raw?.immediate_danger || floor.immediate_danger;
  const finalUrgency: Urgency = URGENCY_RANK[urgency] >= URGENCY_RANK[floor.urgency] ? urgency : floor.urgency;
  const hours = typeof raw?.hours_since_incident === 'number' && raw.hours_since_incident >= 0 ? raw.hours_since_incident : floor.hours_since_incident;
  const flags = Array.from(new Set([...arr(raw?.risk_flags, RISK_FLAGS), ...floor.risk_flags]));
  const types = Array.from(new Set([...arr(raw?.violence_types, VIOLENCE_TYPES), ...floor.violence_types]));
  return {
    violence_types: types,
    urgency: immediate ? 'critical' : finalUrgency,
    immediate_danger: immediate,
    perpetrator_present: typeof raw?.perpetrator_present === 'boolean' ? raw.perpetrator_present : floor.perpetrator_present,
    perpetrator_relationship: RELATIONSHIPS.includes(raw?.perpetrator_relationship) ? raw.perpetrator_relationship : floor.perpetrator_relationship,
    survivor_age_group: ['child', 'adult', 'unknown'].includes(raw?.survivor_age_group) ? raw.survivor_age_group : floor.survivor_age_group,
    hours_since_incident: hours,
    location_mentions: Array.from(new Set([...arr(raw?.location_mentions).slice(0, 5), ...floor.location_mentions])),
    needs: Array.from(new Set([...arr(raw?.needs, NEEDS), ...floor.needs])),
    language_detected: str(raw?.language_detected, 10) || floor.language_detected,
    summary_en: str(raw?.summary_en) || floor.summary_en,
    summary_sw: str(raw?.summary_sw) || floor.summary_sw,
    risk_flags: flags,
    confidence: typeof raw?.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : floor.confidence,
    provider: 'anthropic+rules',
  };
}
