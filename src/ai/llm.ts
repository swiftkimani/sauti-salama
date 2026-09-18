import { Logger } from '@nestjs/common';
import { aiBudget } from './ai-budget';

export const GROQ_DEFAULT_MODEL = 'openai/gpt-oss-120b';
const logger = new Logger('Llm');

/** groq (default when GROQ_API_KEY is set) | anthropic | rules (no model available). AI_PROVIDER overrides. */
export function aiProvider(): string {
  const p = (process.env.AI_PROVIDER || '').toLowerCase();
  if (p) return p;
  if (process.env.GROQ_API_KEY) return 'groq';
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'rules';
}

export function aiModel(): string | null {
  const p = aiProvider();
  if (p === 'groq') return process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  if (p === 'anthropic') return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
  return null;
}

export const aiAvailable = () => ['groq', 'anthropic'].includes(aiProvider());

export interface JsonRequest {
  system: string;
  user: string;
  schema: unknown;
  schemaName: string;
  maxTokens?: number;
}

/**
 * One JSON object from the configured model. Throws when no model is configured, the budget is used up, the call
 * fails or the output is not JSON; every caller has an offline fallback for that case.
 */
export async function completeJson(req: JsonRequest): Promise<{ data: any; provider: string }> {
  const provider = aiProvider();
  if (!aiAvailable()) throw new Error('no AI provider is configured');
  if (!aiBudget.take('ai')) throw new Error('AI_MAX_CALLS_PER_MINUTE reached');
  const data = provider === 'groq' ? await callGroq(req) : await callAnthropic(req);
  return { data, provider };
}

/**
 * Groq's OpenAI-compatible chat API. Models with constrained decoding (gpt-oss, qwen) get the strict
 * JSON schema; others get JSON mode. If a model rejects the schema, retry once in JSON mode.
 */
async function callGroq(req: JsonRequest): Promise<any> {
  if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY is not set');
  const model = process.env.GROQ_MODEL || GROQ_DEFAULT_MODEL;
  const strict = /gpt-oss|qwen/i.test(model);
  const body = (schema: boolean) => ({
    model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.user },
    ],
    response_format: schema
      ? { type: 'json_schema', json_schema: { name: req.schemaName, strict: true, schema: req.schema } }
      : { type: 'json_object' },
    max_completion_tokens: req.maxTokens ?? 2000,
    ...(/gpt-oss/i.test(model) ? { reasoning_effort: 'low', include_reasoning: false } : { temperature: 0 }),
  });
  let res = await post('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, body(strict));
  if (!res.ok && strict && res.status === 400) {
    logger.warn(`Groq rejected the JSON schema for ${model}; retrying in JSON mode`);
    res = await post('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, body(false));
  }
  if (!res.ok) throw new Error(`Groq API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return parseJsonObject(String(data?.choices?.[0]?.message?.content || ''));
}

async function callAnthropic(req: JsonRequest): Promise<any> {
  const res = await post('https://api.anthropic.com/v1/messages', null, {
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
    max_tokens: req.maxTokens ?? 900,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  }, { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  const text = (data.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  return parseJsonObject(text);
}

async function post(url: string, bearer: string | null, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(process.env.AI_TIMEOUT_MS || 12000));
  try {
    return await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), ...headers },
      body: JSON.stringify(body),
    });
  } finally {
    clearTimeout(timer);
  }
}

export function parseJsonObject(text: string): any {
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('No JSON object in model output');
  return JSON.parse(cleaned.slice(start, end + 1));
}
