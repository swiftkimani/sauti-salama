import { RateLimiter } from '../common/rate-limiter';

/**
 * One process-wide ceiling on paid AI calls (triage + transcription), so a flood of fake reports cannot run up
 * the bill. Over the ceiling nothing is dropped: triage falls back to the offline rules and a recording is
 * handled like any other that could not be transcribed. 0 disables the ceiling.
 */
export const aiBudget = new RateLimiter(() => Number(process.env.AI_MAX_CALLS_PER_MINUTE ?? 60), () => 60 * 1000);
