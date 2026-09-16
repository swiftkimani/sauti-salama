import { SmsService } from '../src/common/sms.service';

describe("SMS via Africa's Talking", () => {
  const env = { ...process.env };
  const realFetch = global.fetch;
  const reply = (status: number, body: unknown) => jest.fn().mockResolvedValue({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

  beforeEach(() => { process.env.AT_API_KEY = 'test-key'; process.env.AT_USERNAME = 'sandbox'; });
  afterEach(() => { process.env = { ...env }; global.fetch = realFetch; });

  it('records the message id when the recipient is accepted, then applies the delivery report', async () => {
    global.fetch = reply(201, { SMSMessageData: { Message: 'Sent to 1/1', Recipients: [{ statusCode: 101, number: '+254711000111', status: 'Success', cost: 'KES 0.8000', messageId: 'ATXid_1' }] } }) as any;
    const sms = new SmsService();
    const m = await sms.send('+254711000111', 'hello', 'survivor');
    expect(m).toMatchObject({ mode: 'sandbox', status: 'sent', messageId: 'ATXid_1', cost: 'KES 0.8000' });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.sandbox.africastalking.com/version1/messaging');
    expect(init.headers.apiKey).toBe('test-key');

    expect(sms.markDelivery({ id: 'ATXid_1', status: 'Failed', failureReason: 'AbsentSubscriber' })).toBe(true);
    expect(m).toMatchObject({ status: 'failed', failureReason: 'AbsentSubscriber' });
    expect(sms.markDelivery({ id: 'unknown', status: 'Success' })).toBe(false);
  });

  it('marks the message failed when Africa\'s Talking accepts the request but rejects the recipient', async () => {
    global.fetch = reply(201, { SMSMessageData: { Message: 'Sent to 0/1', Recipients: [{ statusCode: 405, number: '+254711000111', status: 'InsufficientBalance', cost: '0', messageId: 'None' }] } }) as any;
    const m = await new SmsService().send('+254711000111', 'hello');
    expect(m).toMatchObject({ status: 'failed', failureReason: 'InsufficientBalance' });
  });

  it('stays offline and only logs when no API key is configured', async () => {
    delete process.env.AT_API_KEY;
    global.fetch = jest.fn() as any;
    const m = await new SmsService().send('+254711000111', 'hello');
    expect(m).toMatchObject({ mode: 'console', status: 'logged' });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
