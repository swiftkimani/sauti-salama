import { getRepositoryToken } from '@nestjs/typeorm';
import { CaseEventsService } from '../src/cases/case-events.service';
import { CasesService } from '../src/cases/cases.service';
import { ESCALATION_RETRY_MS, NotifyService } from '../src/cases/notify.service';
import { ReferralService } from '../src/cases/referral.service';
import { CryptoService } from '../src/common/crypto.service';
import { Case } from '../src/entities';
import { RespondersService } from '../src/responders/responders.service';
import { buildHarness, eventsOf, eventually, Harness, minutes, SURVIVOR, TIER1, TIER2 } from './harness';

describe('escalation (stored deadline + sweeper)', () => {
  let h: Harness;
  let cases: CasesService;
  let notify: NotifyService;

  beforeEach(async () => {
    process.env.ESCALATION_MINUTES = '10';
    h = await buildHarness();
    cases = h.app.get(CasesService);
    notify = h.app.get(NotifyService);
  });
  afterEach(async () => { await h.close(); delete process.env.ESCALATION_REPEAT_MINUTES; });

  const report = async (over: Partial<Parameters<CasesService['createCase']>[0]> = {}) => {
    const c = await cases.createCase({ channel: 'ussd', language: 'en', phone: SURVIVOR, ward: 'Kayole', hints: { violence_type: 'physical', when: 'recent' }, ...over });
    await eventually(async () => (await eventsOf(h, c.id)).some((e) => e.type === 'NOTIFIED_TIER1'));
    return h.cases.findOneByOrFail({ id: c.id });
  };

  it('stores the deadline when Tier 1 is alerted and records who was reached', async () => {
    const c = await report();
    expect(c.escalateAt.getTime()).toBeGreaterThan(Date.now() + minutes(9));
    const tier1 = (await eventsOf(h, c.id)).find((e) => e.type === 'NOTIFIED_TIER1');
    expect(tier1.detail).toMatch(/1 of 1 alert\(s\) accepted by the SMS gateway; sent to Amina W/);
    expect(h.sms.sentTo(TIER1)).toHaveLength(1);
  });

  it('escalates once the deadline passes, even from a fresh service instance (nothing lives in memory)', async () => {
    const c = await report();
    expect(await notify.sweep(new Date(Date.now() + minutes(5)))).toBe(0);
    // A restart: a new NotifyService with no timers of its own.
    const afterRestart = new NotifyService(h.cases, h.app.get(RespondersService), h.sms, h.app.get(CaseEventsService), h.app.get(CryptoService), h.app.get(ReferralService));
    expect(await afterRestart.sweep(new Date(Date.now() + minutes(11)))).toBe(1);
    const escalated = await h.cases.findOneByOrFail({ id: c.id });
    expect(escalated.status).toBe('ESCALATED');
    // Still waiting for a person: the alert repeats rather than the case going quiet.
    expect(escalated.escalateAt).not.toBeNull();
    expect(h.sms.sentTo(TIER2)[0].message).toMatch(/ESCALATION/);
  });

  it('repeats the Tier-2 alert and finally marks the case unanswered', async () => {
    process.env.ESCALATION_REPEAT_MINUTES = '10,20';
    // A long ward and a consented phone are the longest the first segment can get.
    const c = await report({ ward: 'Mukuru kwa Njenga, Viwandani ward, Embakasi South', safeToContact: true });
    const at = (m: number) => new Date(Date.now() + minutes(m));

    expect(await notify.sweep(at(11))).toBe(1);                       // Tier 2 told
    expect(await notify.sweep(at(15))).toBe(0);                       // not yet due again
    expect(await notify.sweep(at(22))).toBe(1);                       // repeat 1, after 10 min
    expect(await notify.sweep(at(43))).toBe(1);                       // repeat 2, after a further 20 min
    expect(await notify.sweep(at(120))).toBe(0);                      // nothing left to send automatically

    const row = await h.cases.findOneByOrFail({ id: c.id });
    expect(row.status).toBe('ESCALATED');
    expect(row.escalateAt).toBeNull();
    const types = (await eventsOf(h, c.id)).map((e) => e.type);
    expect(types.filter((t) => t === 'ESCALATION_REPEATED')).toHaveLength(2);
    expect(types).toContain('UNANSWERED');
    expect(h.sms.sentTo(TIER2)).toHaveLength(3);
    expect(h.sms.sentTo(TIER2)[0].message).toMatch(/ESCALATION x3/);  // newest first in the outbox
    // Whatever the round or the ward, the part that says what to do survives on its own.
    for (const m of h.sms.sentTo(TIER2)) {
      const first = m.message.split('\n--\n')[0];
      expect(first.length).toBeLessThanOrEqual(160);
      expect(first).toContain(`Reply ACK ${c.ref} to accept.`);
    }
  });

  it('stops repeating as soon as a responder accepts', async () => {
    process.env.ESCALATION_REPEAT_MINUTES = '10,20';
    const c = await report();
    expect(await notify.sweep(new Date(Date.now() + minutes(11)))).toBe(1);
    await cases.acknowledge(c.ref, 'GBV Recovery Centre desk');
    expect(await notify.sweep(new Date(Date.now() + minutes(60)))).toBe(0);
    expect(h.sms.sentTo(TIER2)).toHaveLength(1);
    expect((await eventsOf(h, c.id)).map((e) => e.type)).not.toContain('UNANSWERED');
  });

  it('does not escalate an acknowledged case', async () => {
    const c = await report();
    await cases.acknowledge(c.ref, 'Amina');
    expect((await h.cases.findOneByOrFail({ id: c.id })).escalateAt).toBeNull();
    expect(await notify.sweep(new Date(Date.now() + minutes(60)))).toBe(0);
    expect(h.sms.sentTo(TIER2)).toHaveLength(0);
  });

  it('escalates at once when no Tier-1 alert could be sent', async () => {
    h.sms.failing.add(TIER1);
    const c = await report();
    expect(c.escalateAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect((await eventsOf(h, c.id)).find((e) => e.type === 'NOTIFIED_TIER1').detail).toMatch(/0 of 1.*FAILED: Amina W.*InsufficientBalance.*escalating to Tier 2 now/);
    expect(await notify.sweep()).toBe(1);
    expect((await h.cases.findOneByOrFail({ id: c.id })).status).toBe('ESCALATED');
  });

  it('keeps retrying when the Tier-2 alert fails, instead of marking the case escalated', async () => {
    h.sms.failing.add(TIER2);
    const c = await report();
    const now = new Date(Date.now() + minutes(11));
    expect(await notify.sweep(now)).toBe(0);
    let row = await h.cases.findOneByOrFail({ id: c.id });
    expect(row.status).toBe('OPEN');
    expect(row.escalateAt.getTime()).toBe(now.getTime() + ESCALATION_RETRY_MS);
    expect((await eventsOf(h, c.id)).map((e) => e.type)).toContain('ESCALATION_FAILED');

    h.sms.failing.delete(TIER2);
    expect(await notify.sweep(new Date(now.getTime() + ESCALATION_RETRY_MS))).toBe(1);
    row = await h.cases.findOneByOrFail({ id: c.id });
    expect(row.status).toBe('ESCALATED');
  });

  it('lets only one of two concurrent sweepers escalate a case', async () => {
    const c = await report();
    const later = new Date(Date.now() + minutes(11));
    const results = await Promise.all([notify.escalate(c.id, later), notify.escalate(c.id, later)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(h.sms.sentTo(TIER2)).toHaveLength(1);
  });

  it('gives open cases from before stored deadlines one on start-up', async () => {
    const c = await report();
    await h.app.get(getRepositoryToken(Case)).update({ id: c.id }, { escalateAt: null });
    expect(await notify.backfillDeadlines()).toBe(1);
    expect(await notify.sweep()).toBe(1);
  });

  it('sets a deadline on a voice case before its recording is processed', async () => {
    const pending = await cases.createPending({ channel: 'voice', language: 'sw', phone: SURVIVOR });
    expect(pending.escalateAt.getTime()).toBeGreaterThan(Date.now());
    expect(await notify.sweep(new Date(Date.now() + minutes(11)))).toBe(1);
    const events = await eventsOf(h, pending.id);
    expect(events.find((e) => e.type === 'ESCALATED').detail).toMatch(/Recording still unprocessed/);
  });

  it('still schedules escalation when the survivor SMS cannot be sent', async () => {
    const c = await report({ safeToContact: true });
    await h.cases.update({ id: c.id }, { phoneEnc: 'v1.broken.cipher.text' });
    const broken = await h.cases.findOneByOrFail({ id: c.id });
    await expect(notify.notifyTier1(broken)).resolves.toBeUndefined();
    expect((await h.cases.findOneByOrFail({ id: c.id })).escalateAt).not.toBeNull();
    expect((await eventsOf(h, c.id)).map((e) => e.type)).toContain('SURVIVOR_SMS_FAILED');
  });
});
