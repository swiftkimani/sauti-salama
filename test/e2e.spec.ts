import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UssdService } from '../src/channels/ussd/ussd.service';
import { SmsService } from '../src/common/sms.service';
import { FakeSms, SURVIVOR } from './harness';

const TOKEN = 'e2e-console-token-0123456789abcdef';
const SECRET = 'e2e-webhook-secret-0123456789abcdef';

/** The whole application over HTTP: global validation, guards, throttling and the exception filter. */
describe('HTTP (e2e)', () => {
  let app: INestApplication;
  const env = { ...process.env };

  beforeAll(async () => {
    process.env.DASHBOARD_TOKEN = TOKEN;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SmsService).useClass(FakeSms).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });
  afterAll(async () => { await app.close(); process.env = { ...env }; });
  afterEach(() => {
    for (const k of ['WEBHOOK_SECRET', 'NODE_ENV', 'API_RATE_LIMIT_PER_MINUTE']) delete process.env[k];
    process.env.NODE_ENV = 'test';
    jest.restoreAllMocks();
  });

  const http = () => request(app.getHttpServer());
  const ussd = (text: string) => ({ sessionId: 'e2e', phoneNumber: SURVIVOR, text });

  it('exposes only liveness on the public health check', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('keeps configuration details behind the console token', async () => {
    await http().get('/api/status').expect(401);
    const res = await http().get('/api/status').set('x-dashboard-token', TOKEN).expect(200);
    expect(res.body).toMatchObject({ ok: true, db: 'sqljs (up)', ai: 'rules' });
    expect(Array.isArray(res.body.warnings)).toBe(true);
  });

  it('validates query, route parameters and bodies', async () => {
    const auth = { 'x-dashboard-token': TOKEN };
    expect((await http().get('/api/cases?limit=0').set(auth).expect(400)).body.message).toEqual(expect.arrayContaining([expect.stringMatching(/limit/)]));
    await http().get('/api/cases?limit=abc').set(auth).expect(400);
    await http().get('/api/cases/not-a-ref').set(auth).expect(400);
    await http().post('/api/cases/SS-AAAA/resolve').set(auth).send({ outcome: 'DELETED' }).expect(400);
    await http().post('/api/cases/SS-AAAA/ack').set(auth).send({ actor: 'x'.repeat(81) }).expect(400);
    await http().post('/api/cases/SS-AAAA/ack').set(auth).send({ actor: 'Amina' }).expect(404);
    await http().post('/webhooks/ussd').type('form').send({ text: '1' }).expect(400); // no sessionId / phoneNumber
  });

  it('runs a USSD report end to end and shows only masked numbers in the outbox', async () => {
    let res;
    for (const t of ['', '1', '1*1', '1*1*1', '1*1*1*1', '1*1*1*1*2', '1*1*1*1*2*Kibra', '1*1*1*1*2*Kibra*1']) {
      res = await http().post('/webhooks/ussd').type('form').send(ussd(t)).expect(200);
      expect(res.text).toMatch(/^CON /);
    }
    res = await http().post('/webhooks/ussd').type('form').send(ussd('1*1*1*1*2*Kibra*1*2')).expect(200);
    expect(res.text).toMatch(/^END Ref SS-/);
    const outbox = await http().get('/api/outbox').set('x-dashboard-token', TOKEN).expect(200);
    expect(outbox.body.length).toBeGreaterThan(0);
    for (const m of outbox.body) {
      expect(m.to).toMatch(/\*{2,}/);
      expect(m).not.toHaveProperty('providerResponse');
    }
  });

  it('refuses webhooks without the key once WEBHOOK_SECRET is set, and the console token only outside production', async () => {
    process.env.WEBHOOK_SECRET = SECRET;
    await http().post('/webhooks/ussd').type('form').send(ussd('')).expect(401);
    await http().post(`/webhooks/ussd?key=${SECRET}`).type('form').send(ussd('')).expect(200);
    await http().post('/webhooks/ussd').set('x-dashboard-token', TOKEN).type('form').send(ussd('')).expect(200);
    process.env.NODE_ENV = 'production';
    await http().post('/webhooks/ussd').set('x-dashboard-token', TOKEN).type('form').send(ussd('')).expect(401);
  });

  it('turns an unexpected USSD failure into a message the caller can act on', async () => {
    jest.spyOn(app.get(UssdService), 'handle').mockRejectedValue(new Error('database gone'));
    const res = await http().post('/webhooks/ussd').type('form').send(ussd('1')).expect(200);
    expect(res.text).toMatch(/^END Sorry, something went wrong/);
    expect(res.text).toMatch(/1195/);
    expect(res.text).not.toMatch(/database/);
  });

  it('rate-limits the console API per client', async () => {
    process.env.API_RATE_LIMIT_PER_MINUTE = '2';
    await http().get('/api/resources').expect(200);
    await http().get('/api/resources').expect(200);
    await http().get('/api/resources').expect(429);
  });
});
