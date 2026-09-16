import { normalizeTriage, rulesTriage } from '../src/ai/rules';
import { GROQ_DEFAULT_MODEL, TriageService } from '../src/ai/triage.service';
import { RateLimiter } from '../src/common/rate-limiter';

const SHENG_KNIFE = 'Manze msee wangu amenichapa vibaya sana leo. Ako na kisu na anasema ataniua nikitoka. Niko Umoja, watoto wako hapa.';

const aiBrief = (over: Record<string, unknown> = {}) => ({
  violence_types: ['physical'], urgency: 'medium', immediate_danger: false, perpetrator_present: true,
  perpetrator_relationship: 'intimate_partner', survivor_age_group: 'adult', hours_since_incident: 3,
  location_mentions: ['Umoja'], needs: ['medical'], language_detected: 'sheng',
  summary_en: 'The caller was beaten by her partner today in Umoja.', summary_sw: 'Mpigaji amepigwa na mpenzi wake leo Umoja.',
  risk_flags: [], confidence: 0.8, ...over,
});

describe('Groq triage', () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  const chat = (content: unknown) => reply(200, { choices: [{ message: { content: JSON.stringify(content) } }] });

  beforeEach(() => { delete process.env.AI_PROVIDER; delete process.env.ANTHROPIC_API_KEY; delete process.env.GROQ_MODEL; process.env.GROQ_API_KEY = 'gsk_test'; });
  afterEach(() => { process.env = { ...env }; global.fetch = realFetch; });

  it('is the default provider when GROQ_API_KEY is set and sends a strict JSON-schema request', async () => {
    global.fetch = jest.fn().mockResolvedValue(chat(aiBrief({ urgency: 'critical', immediate_danger: true, risk_flags: ['weapon', 'children_present'] }))) as any;
    const svc = new TriageService();
    expect(svc.provider).toBe('groq');
    expect(svc.model).toBe(GROQ_DEFAULT_MODEL);

    const r = await svc.triage({ text: SHENG_KNIFE, language: 'sw', channel: 'sms' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.authorization).toBe('Bearer gsk_test');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.reasoning_effort).toBe('low');
    expect(r.provider).toBe('groq+rules');
    expect(r.urgency).toBe('critical');
    expect(r.summary_sw).toMatch(/Umoja/);
  });

  it('never lets the AI lower danger the rules detected, and says so', async () => {
    global.fetch = jest.fn().mockResolvedValue(chat(aiBrief())) as any;
    const r = await new TriageService().triage({ text: SHENG_KNIFE, language: 'sw', channel: 'sms' });
    expect(r.urgency).toBe('critical');
    expect(r.immediate_danger).toBe(true);
    expect(r.risk_flags).toEqual(expect.arrayContaining(['weapon', 'children_present']));
    expect(r.safety_floor.join(' ')).toMatch(/Immediate danger kept/);
    expect(r.safety_floor).toEqual(expect.arrayContaining(['Risk flag kept: weapon']));
  });

  it('retries in JSON mode when the model rejects the schema', async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(reply(400, { error: { message: 'json_schema not supported' } }))
      .mockResolvedValueOnce(chat(aiBrief({ urgency: 'critical', immediate_danger: true }))) as any;
    const r = await new TriageService().triage({ text: SHENG_KNIFE, language: 'sw', channel: 'sms' });
    const second = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(second.response_format).toEqual({ type: 'json_object' });
    expect(r.provider).toBe('groq+rules');
  });

  it('falls back to the offline rules when Groq is unreachable', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
    const r = await new TriageService().triage({ text: SHENG_KNIFE, language: 'sw', channel: 'sms' });
    expect(r.provider).toBe('rules');
    expect(r.urgency).toBe('critical');
  });

  it('reports no overrides when the AI and the rules agree', () => {
    const input = { text: 'My husband took my salary again this month', language: 'en' as const, channel: 'sms' };
    const floor = rulesTriage(input);
    const r = normalizeTriage({ ...aiBrief(), violence_types: floor.violence_types, urgency: floor.urgency, immediate_danger: false, risk_flags: floor.risk_flags }, input, floor, 'groq');
    expect(r.safety_floor).toEqual([]);
  });
});

describe('per-phone rate limiter', () => {
  it('allows the configured number of reports per window, then refuses until the window passes', () => {
    const limiter = new RateLimiter(() => 3, () => 60_000);
    const t0 = 1_000_000;
    expect([0, 1, 2].map((i) => limiter.take('phone', t0 + i))).toEqual([true, true, true]);
    expect(limiter.take('phone', t0 + 10)).toBe(false);
    expect(limiter.take('other-phone', t0 + 10)).toBe(true);
    expect(limiter.take('phone', t0 + 60_001)).toBe(true);
  });

  it('is disabled with a limit of 0', () => {
    const limiter = new RateLimiter(() => 0, () => 60_000);
    expect(Array.from({ length: 10 }, () => limiter.take('phone')).every(Boolean)).toBe(true);
  });
});
