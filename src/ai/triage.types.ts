export type Urgency = 'critical' | 'high' | 'medium' | 'low';
export type Lang = 'en' | 'sw';

export const VIOLENCE_TYPES = ['physical', 'sexual', 'emotional', 'economic', 'harassment', 'fgm', 'child_marriage', 'other'] as const;
export const NEEDS = ['medical', 'police', 'shelter', 'legal', 'counselling', 'child_protection'] as const;
export const RELATIONSHIPS = ['intimate_partner', 'family', 'acquaintance', 'authority', 'stranger', 'unknown'] as const;
export const RISK_FLAGS = ['weapon', 'strangulation', 'children_present', 'escalating', 'suicidal', 'pregnant', 'disability', 'repeat_incident'] as const;
export const URGENCY_RANK: Record<Urgency, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Structured output of triage: what a responder needs in one glance. Never contains direct identifiers. */
export interface TriageResult {
  violence_types: string[];
  urgency: Urgency;
  immediate_danger: boolean;
  perpetrator_present: boolean | null;
  perpetrator_relationship: string;
  survivor_age_group: 'child' | 'adult' | 'unknown';
  hours_since_incident: number | null;
  location_mentions: string[];
  needs: string[];
  language_detected: string;
  summary_en: string;
  summary_sw: string;
  risk_flags: string[];
  confidence: number;
  provider: string;
  /** Where the rules floor overrode the AI (shown to responders so the brief is explainable). */
  safety_floor?: string[];
}

/** Facts already collected from menus (USSD / IVR keypad), so the AI does not have to guess them. */
export interface TriageHints {
  ward?: string;
  violence_type?: string;
  when?: 'recent' | 'week' | 'older';
  perpetrator_present?: boolean;
  immediate_danger?: boolean;
  callback?: boolean;
}

export interface TriageInput {
  text?: string;
  language: Lang;
  channel: string;
  hints?: TriageHints;
}

export interface LocalizedText { en: string; sw: string; }

export interface NextStep {
  key: string;
  priority: number;
  title: LocalizedText;
  short: LocalizedText;
  detail: LocalizedText;
  deadline?: LocalizedText;
  service?: { name: string; phone?: string; category: string };
}
