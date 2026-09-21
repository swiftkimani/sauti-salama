import { Injectable, Logger } from '@nestjs/common';
import { aiAvailable, aiModel, aiProvider, completeJson, GROQ_DEFAULT_MODEL } from './llm';
import { buildTriageUserMessage, TRIAGE_JSON_SCHEMA, TRIAGE_SYSTEM_PROMPT } from './prompts';
import { normalizeTriage, rulesTriage, silentTriage, structuredTriage, untranscribedTriage } from './rules';
import { TriageInput, TriageResult } from './triage.types';

export { GROQ_DEFAULT_MODEL };
export { parseJsonObject } from './llm';

/**
 * AI structures, humans decide. The model turns a raw narrative (voice transcript or SMS,
 * in English/Kiswahili/Sheng) into the responder-facing structure. On the call line the model also
 * asks the caller questions (see ConversationService); everything factual it says comes from src/i18n.
 */
@Injectable()
export class TriageService {
  private readonly logger = new Logger(TriageService.name);

  get provider(): string { return aiProvider(); }
  get model(): string | null { return aiModel(); }

  async triage(input: TriageInput): Promise<TriageResult> {
    const floor = rulesTriage(input);
    if (!input.text || !aiAvailable()) return floor;
    try {
      const { data, provider } = await completeJson({
        system: TRIAGE_SYSTEM_PROMPT,
        user: buildTriageUserMessage(input),
        schema: TRIAGE_JSON_SCHEMA,
        schemaName: 'triage',
      });
      return normalizeTriage(data, input, floor, provider);
    } catch (e) {
      this.logger.warn(`AI triage failed (${(e as Error)?.message || e}); falling back to rules-based triage`);
      return floor;
    }
  }

  /** Offline keyword triage only, e.g. for follow-up messages that must not cost an AI call. */
  rulesOnly(input: TriageInput): TriageResult { return rulesTriage(input); }
  structured(input: TriageInput): TriageResult { return structuredTriage(input); }
  silent(input: TriageInput): TriageResult { return silentTriage(input); }
  untranscribed(input: TriageInput): TriageResult { return untranscribedTriage(input); }
}
