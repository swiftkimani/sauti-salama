import { checkRecordingUrl, SAMPLE_LABEL, TranscriptionService } from '../src/ai/transcription.service';

describe('recording URL allow-list (SSRF)', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });

  it('accepts https recordings from Africa\'s Talking hosts', () => {
    expect(checkRecordingUrl('https://voice.africastalking.com/recordings/a1.mp3').hostname).toBe('voice.africastalking.com');
    expect(checkRecordingUrl('https://africastalking.com/r.mp3').hostname).toBe('africastalking.com');
  });

  it.each([
    ['plain http', 'http://voice.africastalking.com/a.mp3', /https/],
    ['cloud metadata IP', 'https://169.254.169.254/latest/meta-data', /IP address/],
    ['IPv6 loopback', 'https://[::1]/a.mp3', /IP address/],
    ['another host', 'https://evil.example.com/a.mp3', /not in RECORDING_URL_HOSTS/],
    ['look-alike host', 'https://africastalking.com.evil.example/a.mp3', /not in RECORDING_URL_HOSTS/],
    ['suffix without a dot', 'https://notafricastalking.com/a.mp3', /not in RECORDING_URL_HOSTS/],
    ['another port', 'https://voice.africastalking.com:8443/a.mp3', /port/],
    ['credentials', 'https://user:pw@voice.africastalking.com/a.mp3', /credentials/],
    ['a local file', 'file:///etc/passwd', /https/],
    ['garbage', 'not a url', /valid URL/],
  ])('refuses %s', (_name, url, message) => {
    expect(() => checkRecordingUrl(url)).toThrow(message);
  });

  it('uses RECORDING_URL_HOSTS when set', () => {
    process.env.RECORDING_URL_HOSTS = 'media.example.org, *.cdn.example.net';
    expect(() => checkRecordingUrl('https://media.example.org/a.mp3')).not.toThrow();
    expect(() => checkRecordingUrl('https://eu.cdn.example.net/a.mp3')).not.toThrow();
    expect(() => checkRecordingUrl('https://voice.africastalking.com/a.mp3')).toThrow();
  });
});

describe('TranscriptionService', () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  afterEach(() => { process.env = { ...env }; global.fetch = realFetch; });
  const audio = (init: { ok?: boolean; status?: number; length?: number } = {}) => ({
    ok: init.ok ?? true, status: init.status ?? 200,
    headers: new Headers(init.length ? { 'content-length': String(init.length) } : {}),
    body: null, arrayBuffer: async () => new ArrayBuffer(8),
  });
  const whisper = (text: string) => ({ ok: true, status: 200, json: async () => ({ text }), text: async () => '' });
  const REC = 'https://voice.africastalking.com/recordings/a1.mp3';

  it('uses the simulator transcript outside production only', async () => {
    const svc = new TranscriptionService();
    expect((await svc.transcribe('', { mockTranscript: 'He hit me' })).provider).toBe('simulator');
    process.env.NODE_ENV = 'production';
    await expect(svc.transcribe('', { mockTranscript: 'He hit me' })).rejects.toThrow(/no transcription provider/);
  });

  it('labels sample text when no provider is configured (dev)', async () => {
    const r = await new TranscriptionService().transcribe(REC, { language: 'sw' });
    expect(r.provider).toBe('mock');
    expect(r.text.startsWith(SAMPLE_LABEL)).toBe(true);
  });

  it('never substitutes sample text when a real transcription fails', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    global.fetch = jest.fn().mockResolvedValue(audio({ ok: false, status: 404 })) as any;
    await expect(new TranscriptionService().transcribe(REC, { language: 'en' })).rejects.toThrow(/could not download/);
  });

  it('does not fetch a URL outside the allow-list', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    global.fetch = jest.fn() as any;
    await expect(new TranscriptionService().transcribe('https://169.254.169.254/latest/meta-data', {})).rejects.toThrow(/IP address/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('downloads without following redirects, then transcribes', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    global.fetch = jest.fn().mockResolvedValueOnce(audio()).mockResolvedValueOnce(whisper(' Nisaidie ')) as any;
    const r = await new TranscriptionService().transcribe(REC, { language: 'sw' });
    expect(r).toEqual({ text: 'Nisaidie', provider: 'groq-whisper' });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.redirect).toBe('error');
    expect(init.signal).toBeDefined();
  });

  it('refuses oversized recordings and silent ones', async () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    global.fetch = jest.fn().mockResolvedValue(audio({ length: 100 * 1024 * 1024 })) as any;
    await expect(new TranscriptionService().transcribe(REC, {})).rejects.toThrow(/too large/);
    global.fetch = jest.fn().mockResolvedValueOnce(audio()).mockResolvedValueOnce(whisper('   ')) as any;
    await expect(new TranscriptionService().transcribe(REC, {})).rejects.toThrow(/no recognisable speech/);
  });
});
