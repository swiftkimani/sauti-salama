import { TriageService } from '../src/ai/triage.service';
import { CasesService } from '../src/cases/cases.service';
import { RetentionService } from '../src/cases/retention.service';
import { CryptoService } from '../src/common/crypto.service';
import { buildHarness, eventsOf, eventually, Harness, SURVIVOR } from './harness';

const DAY = 24 * 60 * 60 * 1000;

describe('case lifecycle', () => {
  let h: Harness;
  let cases: CasesService;
  const env = { ...process.env };

  beforeEach(async () => {
    h = await buildHarness();
    cases = h.app.get(CasesService);
  });
  afterEach(async () => { await h.close(); process.env = { ...env }; jest.restoreAllMocks(); });

  const notified = (id: string) => eventually(async () => (await eventsOf(h, id)).some((e) => e.type === 'NOTIFIED_TIER1'));

  it('create -> acknowledge -> resolve -> erase removes the case and its whole audit trail', async () => {
    const c = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'My husband beat me last night in Kayole', safeToContact: true });
    expect(c.ref).toMatch(/^SS-[A-Z2-9]{4}$/);
    expect(c.phoneEnc).not.toContain('712345678');
    await notified(c.id);

    await cases.acknowledge(c.ref, 'Amina');
    expect(h.sms.sentTo(SURVIVOR).some((m) => /accepted your case/.test(m.message))).toBe(true);
    const resolved = await cases.resolve(c.ref, 'Amina', 'RESOLVED', 'safe with family');
    expect(resolved.status).toBe('RESOLVED');
    expect((await eventsOf(h, c.id)).map((e) => e.type)).toEqual(expect.arrayContaining(['CREATED', 'TRIAGED', 'NOTIFIED_TIER1', 'ACKNOWLEDGED', 'RESOLVED']));

    expect(await cases.erase(c.ref, { actor: 'test', phoneHash: 'someone-else' })).toBe(false);
    expect(await cases.erase(c.ref, { actor: 'test' })).toBe(true);
    expect(await h.cases.findOneBy({ id: c.id })).toBeNull();
    expect(await eventsOf(h, c.id)).toEqual([]);
  });

  it('adds reports over the per-phone limit to the latest case instead of opening new ones', async () => {
    process.env.RATE_LIMIT_REPORTS_PER_HOUR = '1';
    const first = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He shouts at me' });
    const second = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'Now he has a knife and says he will kill me' });
    expect(second.id).toBe(first.id);
    expect(second.urgency).toBe('critical');
    expect((await eventsOf(h, first.id)).map((e) => e.type)).toContain('FOLLOW_UP');
  });

  describe('live calls', () => {
    it('adds each turn to one case and alerts responders on the first one', async () => {
      const pending = await cases.createPending({ channel: 'voice', language: 'en', phone: SURVIVOR });
      const triage = h.app.get(TriageService).rulesOnly({ text: 'He beat me in Kayole', language: 'en', channel: 'voice' });
      await cases.applyCallTurn(pending.id, { turn: 'He beat me in Kayole', header: '[Call 10:00 UTC]', triage });
      await notified(pending.id);
      await cases.applyCallTurn(pending.id, { turn: 'He has a knife and is still here', triage: h.app.get(TriageService).rulesOnly({ text: 'He has a knife and is still here', language: 'en', channel: 'voice' }) });

      const c = await h.cases.findOneByOrFail({ id: pending.id });
      expect(c.status).toBe('OPEN');
      expect(c.urgency).toBe('critical');
      const detail = await cases.detail(c.ref, 'test');
      expect(detail.narrative).toMatch(/\[Call 10:00 UTC\][\s\S]*He beat me[\s\S]*knife/);
      expect((await eventsOf(h, c.id)).map((e) => e.type)).toEqual(expect.arrayContaining(['TRIAGED', 'NOTIFIED_TIER1', 'CALL_UPDATED']));
    });

    it('does not undo an acknowledgement made while the call was still going', async () => {
      const pending = await cases.createPending({ channel: 'voice', language: 'en', phone: SURVIVOR });
      const triage = h.app.get(TriageService).rulesOnly({ text: 'He beat me', language: 'en', channel: 'voice' });
      await cases.applyCallTurn(pending.id, { turn: 'He beat me', triage });
      await cases.acknowledge(pending.ref, 'Amina');
      await cases.applyCallTurn(pending.id, { turn: 'I am in Kayole', triage });
      expect((await h.cases.findOneByOrFail({ id: pending.id })).status).toBe('ACKNOWLEDGED');
    });
  });

  describe('unreadable ciphertext', () => {
    it('shows the console an unreadable narrative instead of failing', async () => {
      const c = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He hit me' });
      await h.cases.update({ id: c.id }, { narrativeEnc: 'v1.AAAA.BBBB.CCCC' });
      const d = await cases.detail(c.ref, 'tester');
      expect(d.narrative).toBeNull();
      expect(d.narrativeUnreadable).toBe(true);
      expect(d.events.map((e) => e.type)).toContain('DECRYPT_FAILED');
    });

    it('still acknowledges when the phone cannot be decrypted, and says why no SMS went out', async () => {
      const c = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He hit me', safeToContact: true });
      await notified(c.id);
      await h.cases.update({ id: c.id }, { phoneEnc: 'v1.AAAA.BBBB.CCCC' });
      const acked = await cases.acknowledge(c.ref, 'Amina');
      expect(acked.status).toBe('ACKNOWLEDGED');
      expect((await eventsOf(h, c.id)).map((e) => e.type)).toContain('SURVIVOR_SMS_FAILED');
      expect(await cases.revealContact(c.ref, 'Amina')).toEqual({ error: 'The stored phone number could not be decrypted.' });
    });

    it('refuses to start when ENCRYPTION_KEY does not match the stored data', async () => {
      await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He hit me' });
      process.env.ENCRYPTION_KEY = 'c'.repeat(64);
      const withOtherKey = new CasesService(h.cases, new CryptoService(), null, null, null, null, null, null);
      await expect(withOtherKey.onModuleInit()).rejects.toThrow(/ENCRYPTION_KEY does not match/);
    });
  });

  it('only lets the reporting phone change consent when a phone is given', async () => {
    const c = await cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He hit me' });
    const crypto = h.app.get(CryptoService);
    expect(await cases.setConsent(c.ref, true, crypto.hash('+254799999999'))).toBeNull();
    expect(await cases.setPoliceConsent(c.ref, true, crypto.hash('+254799999999'))).toBeNull();
    const row = await h.cases.findOneByOrFail({ id: c.id });
    expect(row.safeToContact).toBe(false);
    expect(row.consentSharePolice).toBe(false);
    expect((await cases.setPoliceConsent(c.ref, true, crypto.hash(SURVIVOR))).consentSharePolice).toBe(true);
  });

  describe('retention', () => {
    it('purges closed cases after RETENTION_DAYS and never-closed ones after RETENTION_OPEN_DAYS', async () => {
      const closed = await cases.createCase({ channel: 'sms', language: 'en', phone: '+254711000001', narrative: 'He hit me' });
      await cases.resolve(closed.ref, 'Amina');
      const open = await cases.createCase({ channel: 'sms', language: 'en', phone: '+254711000002', narrative: 'He hit me' });
      const retention = h.app.get(RetentionService);

      expect(await retention.purge(Date.now() + 30 * DAY)).toEqual({ closed: 0, stale: 0 });
      expect(await retention.purge(Date.now() + 91 * DAY)).toEqual({ closed: 1, stale: 0 });
      expect(await h.cases.findOneBy({ id: open.id })).not.toBeNull();

      process.env.RETENTION_OPEN_DAYS = '0';
      expect(await retention.purge(Date.now() + 1000 * DAY)).toEqual({ closed: 0, stale: 0 });
      delete process.env.RETENTION_OPEN_DAYS;
      expect(await retention.purge(Date.now() + 366 * DAY)).toEqual({ closed: 0, stale: 1 });
      expect(await eventsOf(h, open.id)).toEqual([]);
    });
  });
});
