import { Injectable, Logger } from '@nestjs/common';
import { buildCallMessage, CALL_JSON_SCHEMA, CALL_SYSTEM_PROMPT, CallTurn, fallbackQuestion, missingSlots, validateQuestion } from './conversation';
import { aiAvailable, completeJson } from './llm';
import { normalizeTriage, rulesTriage } from './rules';
import { Lang, TriageResult } from './triage.types';

export interface CallState {
  lang: Lang;
  turns: CallTurn[];
  /** Question keys, or the reviewed question text already asked, so nothing is asked twice. */
  asked: string[];
}

export interface CallDecision {
  triage: TriageResult;
  /** The next question to ask, or null when there is enough for a responder to act. */
  question: string | null;
  questionKey: string | null;
  lang: Lang;
}

export const maxQuestions = () => Math.max(1, Number(process.env.CALL_MAX_QUESTIONS ?? 5));

/**
 * The brain of the call line, one turn at a time: it keeps the responder brief current and picks the next
 * question. It knows nothing about Africa's Talking, so the same decisions can drive a real-time voice agent.
 */
@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  async next(state: CallState): Promise<CallDecision> {
    const transcript = state.turns.map((t) => t.caller).join('\n');
    const input = { text: transcript, language: state.lang, channel: 'voice' };
    const floor = rulesTriage(input);
    const asked = state.asked;
    let triage = floor;
    let question: string | null = null;
    let questionKey: string | null = null;
    let lang = state.lang;
    let enough = false;

    if (aiAvailable() && transcript.trim()) {
      try {
        const { data, provider } = await completeJson({
          system: CALL_SYSTEM_PROMPT,
          user: buildCallMessage(state.turns, asked),
          schema: CALL_JSON_SCHEMA,
          schemaName: 'call_turn',
        });
        triage = normalizeTriage(data, input, floor, provider);
        lang = data?.reply_language === 'sw' ? 'sw' : data?.reply_language === 'en' ? 'en' : lang;
        enough = !!data?.enough_information;
        const generated = validateQuestion(data?.next_question, lang);
        if (!enough) {
          question = generated;
          questionKey = generated;
          if (!generated) this.logger.warn('The model\'s question was refused; using the reviewed question bank');
        }
      } catch (e) {
        this.logger.warn(`Call turn AI failed (${(e as Error)?.message || e}); using the rules and the reviewed question bank`);
      }
    }

    if (!question && !enough) {
      const fb = fallbackQuestion(triage, asked, lang);
      if (fb) { question = fb.text; questionKey = fb.key; }
    }
    // A responder cannot be sent anywhere without an area, so ask for it even when the model is satisfied.
    if (!question && missingSlots(triage, asked).includes('location') && asked.length < maxQuestions()) {
      const fb = fallbackQuestion({ ...triage, location_mentions: [] }, asked.filter((a) => a !== 'location'), lang);
      if (fb?.key === 'location') { question = fb.text; questionKey = fb.key; }
    }
    if (asked.length >= maxQuestions()) { question = null; questionKey = null; }

    return { triage, question, questionKey, lang };
  }
}
