import { fallbackQuestion, missingSlots, validateQuestion } from '../src/ai/conversation';
import { rulesTriage } from '../src/ai/rules';
import { TranscriptionService } from '../src/ai/transcription.service';
import { CasesService } from '../src/cases/cases.service';
import { CALL } from '../src/i18n/call';
import { VoiceService } from '../src/channels/voice/voice.service';
import { buildHarness, eventsOf, eventually, Harness, SURVIVOR, TIER1 } from './harness';
const BEATEN = 'My husband beat me again tonight in Kayole and he is still here with a knife';
describe('generated questions are only questions', () => {
  it.each([
    ['a phone number', 'Call 999 now, are you safe?'],
    ['any digit at all', 'Are you safe? Press 1 for yes'],
    ['a link', 'Are you safe? See https://example.com'],
    ['an empty answer', '  '],
    ['a speech', `Are you safe ${'and calm '.repeat(40)}?`],
    ['a non-string', 42],
    ['a phone number in words', 'Call nine nine nine now, are you safe?'],
    ['an unsupported promise', 'A responder is coming to your home.'],
    ['advice disguised as a question', 'Can you confront him and take the knife?'],
    ['an unreviewed question', 'What is your full name?'],
  ])('refuses %s', (_name, value) => {
    expect(validateQuestion(value)).toBeNull();
  });
  it('refuses a reviewed question in the wrong language, so the fallback supplies the right one', () => {
    expect(validateQuestion(CALL.questions.location.en, 'sw')).toBeNull();
    expect(validateQuestion(CALL.questions.location.sw, 'sw')).toBe(CALL.questions.location.sw);
    expect(validateQuestion(CALL.questions.location.en, 'en')).toBe(CALL.questions.location.en);
  });

  it('keeps a plain question and tidies it', () => {
    expect(validateQuestion(`  "${CALL.questions.location.en}"  `)).toBe(CALL.questions.location.en);
    expect(validateQuestion(CALL.questions.location.sw)).toBe(CALL.questions.location.sw);
  });
  it('asks for what a responder is missing, most important first', () => {
    const unclear = rulesTriage({ text: 'he hit me', language: 'en', channel: 'voice' });
    expect(missingSlots(unclear, [])[0]).toBe('danger_now');
    expect(missingSlots(unclear, [])).toEqual(expect.arrayContaining(['location', 'who', 'children']));
    expect(fallbackQuestion(unclear, [], 'sw').text).toMatch(/Uko salama sasa/);
    const knowsDanger = rulesTriage({ text: 'my husband is here now and he hit me', language: 'en', channel: 'voice' });
    expect(missingSlots(knowsDanger, [])[0]).toBe('location');
    expect(fallbackQuestion(knowsDanger, ['location'], 'en').text).not.toMatch(/Where are you/);
  });
});
describe('the call line', () => {
  let h: Harness;
  let voice: VoiceService;
  let cases: CasesService;
  const env = { ...process.env };
  const realFetch = global.fetch;
  const call = { sessionId: 'ATVId_test', callerNumber: SURVIVOR, destinationNumber: '+254711082000' };
  beforeEach(async () => {
    h = await buildHarness();
    voice = h.app.get(VoiceService);
    cases = h.app.get(CasesService);
  });
  afterEach(async () => { await h.close(); process.env = { ...env }; global.fetch = realFetch; jest.restoreAllMocks(); });
  const said = (text: string) => voice.turn({ ...call, recordingUrl: 'simulator://r', mockTranscript: text });
  const latest = async () => (await h.cases.find({ order: { createdAt: 'DESC' }, take: 1 }))[0];
  const spoken = (xml: string) => [...xml.matchAll(/<Say[^>]*>([^<]*)<\/Say>/g)].map((m) => m[1]).join(' ');
  /** One of the reviewed fallback questions, in either language. */
  const isReviewedQuestion = (text: string) => Object.values(CALL.questions).some((q) => text.includes(q.en) || text.includes(q.sw));
  /** A caller whose words are transcribed as nothing: heard, but silent. */
  const hearsNothing = () => {
    jest.spyOn(h.app.get(TranscriptionService), 'available', 'get').mockReturnValue(true);
    jest.spyOn(h.app.get(TranscriptionService), 'transcribe').mockResolvedValue({ text: '', provider: 'groq-whisper' });
    return voice.turn({ ...call, recordingUrl: 'https://voice.africastalking.com/a.mp3' });
  };
  it('greets and listens, with no menu and no key presses', async () => {
    const xml = await voice.entry(call);
    expect(xml).toMatch(/<Record[^>]+callbackUrl="[^"]*\/webhooks\/voice\/turn"/);
    expect(xml).not.toMatch(/GetDigits|press \d/i);
    expect(spoken(xml)).toMatch(/Tell me what is happening.*Niambie kinachoendelea/);
  });
  it('opens the case the moment the phone connects, so a caller who hangs up is still followed up', async () => {
    await voice.entry(call);
    const c = await latest();
    expect(c.status).toBe('PROCESSING');
    expect(c.escalateAt).not.toBeNull();
    expect(c.phoneMasked).toBe('+2547*****678');
  });
  it('alerts responders from the first sentence, before the call has ended', async () => {
    await voice.entry(call);
    const xml = await said(BEATEN);
    const c = await latest();
    expect(c.status).toBe('OPEN');
    expect(c.urgency).toBe('critical');
    expect(c.ward).toBe('Kayole');
    await eventually(async () => (await eventsOf(h, c.id)).some((e) => e.type === 'NOTIFIED_TIER1'));
    expect(h.sms.sentTo(TIER1)[0].message).toMatch(/SAUTI SALAMA ALERT \[CRITICAL\]/);
    expect(xml).toMatch(/<Record/); // still listening
  });
  it('asks a reviewed question when there is no AI key, then takes consent in the caller\'s own words', async () => {
    process.env.CALL_MAX_QUESTIONS = '1';
    await voice.entry(call);
    const first = await said(BEATEN);
    expect(isReviewedQuestion(spoken(first))).toBe(true);
    const consent = await said('I am in Kayole near the church');
    expect(spoken(consent)).toMatch(/A trusted responder in your area has been alerted/);
    expect(spoken(consent)).toMatch(/Your reference number is S S dash/);
    expect(spoken(consent)).toMatch(/safe for us to call or send an S M S/);
    const police = await said('yes it is safe');
    expect(spoken(police)).toMatch(/help you report to the police/);
    const closing = await said('hapana');
    expect(spoken(closing)).toMatch(/1 1 9 5/);
    expect(closing).not.toMatch(/<Record/); // the call is over
    const c = await latest();
    expect(c.safeToContact).toBe(true);
    expect(c.consentSharePolice).toBe(false);
    expect((await eventsOf(h, c.id)).map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'TRIAGED', 'CALL_UPDATED', 'CONSENT', 'CONSENT_POLICE']));
  });
  it('treats anything unclear as "no" for consent', async () => {
    process.env.CALL_MAX_QUESTIONS = '1';
    await voice.entry(call);
    await said(BEATEN);
    await said('Kayole');
    await said('mmm I do not know');
    expect((await latest()).safeToContact).toBe(false);
  });
  it('says the reviewed emergency and 72-hour lines when they apply, and nothing else factual', async () => {
    process.env.CALL_MAX_QUESTIONS = '1';
    await voice.entry(call);
    await said('I was raped tonight by my neighbour in Kibra, he is outside the door with a knife');
    await said('Kibra');
    await said('no');
    const closing = await said('no');
    const text = spoken(closing);
    expect(text).toMatch(/9 9 9 or 1 1 2/);
    expect(text).toMatch(/7 2 hours/);
    expect(text).toMatch(/Nobody will call or send an S M S/);
  });
  it('treats a caller who cannot speak as an emergency', async () => {
    await voice.entry(call);
    const again = await hearsNothing();
    expect(spoken(again)).toMatch(/could not hear you/);
    expect(again).toMatch(/<Record/);
    const alert = await hearsNothing();
    expect(spoken(alert)).toMatch(/alerted a responder for your area/);
    expect(spoken(alert)).toMatch(/9 9 9 or 1 1 2/);
    const c = await latest();
    expect(c).toMatchObject({ status: 'OPEN', urgency: 'critical', channel: 'voice_silent' });
    expect(c.triage.immediate_danger).toBe(true);
  });
  it('does not pretend to converse when there is no transcription provider', async () => {
    await voice.entry(call);
    const xml = await voice.turn({ ...call, recordingUrl: 'https://voice.africastalking.com/r.mp3' });
    expect(spoken(xml)).toMatch(/A trusted responder in your area has been alerted/);
    const c = await latest();
    expect(c.urgency).toBe('high');
    expect(c.triage.provider).toBe('untranscribed');
    expect(c.narrativeEnc).toBeNull();
  });
  describe('with a counsellor line configured', () => {
    beforeEach(() => { process.env.COUNSELLOR_NUMBERS = '+254700111222'; });
    it('rings the counsellor first', async () => {
      const xml = await voice.entry(call);
      expect(xml).toMatch(/<Dial phoneNumbers="\+254700111222"/);
      expect(spoken(xml)).toMatch(/Connecting you to a counsellor/);
    });
    it('lets the AI take over when nobody answers', async () => {
      await voice.entry(call);
      const xml = await voice.entry({ ...call, durationInSeconds: '0' });
      expect(spoken(xml)).toMatch(/Tell me what is happening/);
      expect(xml).toMatch(/<Record/);
    });
    it('records who took the call when a counsellor answers', async () => {
      await voice.entry(call);
      await voice.entry({ ...call, durationInSeconds: '64', destinationNumber: '+254700111222' });
      const c = await latest();
      expect(c.status).toBe('ACKNOWLEDGED');
      expect(c.acknowledgedBy).toMatch(/counsellor \+2547\*+222/);
    });
  });
  describe('with an AI key', () => {
    const brief = (over: Record<string, unknown> = {}) => ({
      violence_types: ['physical'], urgency: 'high', immediate_danger: true, perpetrator_present: true,
      perpetrator_relationship: 'intimate_partner', survivor_age_group: 'adult', hours_since_incident: 1,
      location_mentions: ['Kayole'], needs: ['medical'], language_detected: 'sw',
      summary_en: 'The caller is being beaten by her husband, who is present with a knife.', summary_sw: 'Mpigaji anapigwa na mumewe, ambaye yuko na kisu.',
      risk_flags: ['weapon'], confidence: 0.9, next_question: CALL.questions.location.sw, enough_information: false, reply_language: 'sw', ...over,
    });
    const groqReplies = (...bodies: unknown[]) => {
      const fn = jest.fn();
      for (const b of bodies) fn.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(b) } }] }), text: async () => '' });
      global.fetch = fn as any;
      return fn;
    };
    beforeEach(() => { process.env.GROQ_API_KEY = 'gsk_test'; });
    it('asks the model\'s question, in the caller\'s language', async () => {
      const fetchMock = groqReplies(brief());
      await voice.entry(call);
      const xml = await said(BEATEN);
      expect(spoken(xml)).toBe(CALL.questions.location.sw);
      const sent = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
      expect(sent.messages[0].content).toMatch(/You are the intake voice of Sauti Salama/);
      expect(sent.messages[1].content).toMatch(/<call>[\s\S]*husband beat me[\s\S]*<\/call>/);
    });
    it('refuses a question with digits in it and asks a reviewed one instead', async () => {
      groqReplies(brief({ next_question: 'Call 999 now. Where are you?' }));
      await voice.entry(call);
      const xml = await said(BEATEN);
      expect(spoken(xml)).not.toMatch(/999/);
      expect(isReviewedQuestion(spoken(xml))).toBe(true);
    });
    it('stops asking when the model has enough, and keeps the rules floor over its brief', async () => {
      groqReplies(brief({ enough_information: true, next_question: '', urgency: 'low', immediate_danger: false, location_mentions: ['Kayole'] }));
      await voice.entry(call);
      const xml = await said(BEATEN);
      expect(spoken(xml)).toMatch(/ameshaarifiwa/); // the caller spoke Kiswahili, so the line answers in Kiswahili
      const c = await latest();
      expect(c.urgency).toBe('critical'); // the rules saw the knife and "still here"
      expect(c.triage.safety_floor.join(' ')).toMatch(/Immediate danger kept/);
    });
    it('falls back to the reviewed questions when the model call fails', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as any;
      await voice.entry(call);
      const xml = await said(BEATEN);
      expect(isReviewedQuestion(spoken(xml))).toBe(true);
      expect((await latest()).urgency).toBe('critical');
    });
  });
  it('keeps the whole call in one case and appends each answer', async () => {
    process.env.CALL_MAX_QUESTIONS = '2';
    await voice.entry(call);
    await said(BEATEN);
    await said('I am near Kayole market');
    const c = await latest();
    const detail = await cases.detail(c.ref, 'test');
    expect(detail.narrative).toMatch(/\[Call \d\d:\d\d UTC\]/);
    expect(detail.narrative).toMatch(/husband beat me/);
    expect(detail.narrative).toMatch(/near Kayole market/);
    expect(await h.cases.count()).toBe(1);
  });
  it('never calls a paid model when the caller says nothing', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    const fetchMock = jest.fn();
    global.fetch = fetchMock as any;
    jest.spyOn(h.app.get(TranscriptionService), 'available', 'get').mockReturnValue(true);
    jest.spyOn(h.app.get(TranscriptionService), 'transcribe').mockResolvedValue({ text: '', provider: 'groq-whisper' });
    await voice.entry(call);
    await voice.turn({ ...call, recordingUrl: 'https://voice.africastalking.com/a.mp3' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
