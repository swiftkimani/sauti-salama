import { CasesService } from '../src/cases/cases.service';
import { SmsInboundService } from '../src/channels/sms/sms-inbound.service';
import { UssdService } from '../src/channels/ussd/ussd.service';
import { SMS, USSD } from '../src/i18n/messages';
import { buildHarness, eventsOf, Harness, SURVIVOR, TIER1 } from './harness';

const STRANGER = '+254799999999';

describe('channels', () => {
  let h: Harness;
  let cases: CasesService;
  const env = { ...process.env };

  beforeEach(async () => {
    h = await buildHarness();
    cases = h.app.get(CasesService);
  });
  afterEach(async () => { await h.close(); process.env = { ...env }; });

  const latestCase = async () => (await h.cases.find({ order: { createdAt: 'DESC' }, take: 1 }))[0];

  describe('USSD', () => {
    let ussd: UssdService;
    const dial = (text: string, phoneNumber = SURVIVOR) => ussd.handle({ sessionId: 's1', phoneNumber, text });
    beforeEach(() => { ussd = h.app.get(UssdService); });

    it('walks the report menu, asks about police last, and records every answer', async () => {
      expect(await dial('')).toMatch(/^CON Sauti Salama\n1. English/);
      expect(await dial('2')).toMatch(/Ripoti kilichotokea/);
      expect(await dial('1*1')).toMatch(/What happened/);
      expect(await dial('1*1*2*1*2*Kayole')).toMatch(/safe to send SMS/);
      expect(await dial('1*1*2*1*2*Kayole*1')).toMatch(/help you report to the police/);
      const done = await dial('1*1*2*1*2*Kayole*1*1');
      expect(done).toMatch(/^END Ref SS-[A-Z2-9]{4}\. A trusted responder has been alerted/);
      const c = await latestCase();
      expect(c).toMatchObject({ channel: 'ussd', ward: 'Kayole', safeToContact: true, consentSharePolice: true, urgency: 'high' });
      expect(c.triage.violence_types).toContain('sexual');
    });

    it('defaults police involvement to no', async () => {
      await dial('1*1*1*3*2*Umoja*2*2');
      expect((await latestCase()).consentSharePolice).toBe(false);
    });

    it('raises a critical silent alert in two key presses', async () => {
      expect(await dial('1*2*0')).toMatch(/^END Alert sent/);
      expect(await latestCase()).toMatchObject({ channel: 'ussd_silent', urgency: 'critical' });
    });

    it('shows status and allows erasure only from the reporting phone', async () => {
      const ref = (await dial('1*1*1*3*2*Umoja*2*2')).match(/SS-[A-Z2-9]{4}/)[0];
      expect(await dial(`1*5*${ref}`, STRANGER)).toMatch(/could not find/);
      expect(await dial(`1*5*${ref}`)).toMatch(new RegExp(`END ${ref}: received`));
      expect(await dial(`1*6*${ref}`, STRANGER)).toMatch(/could not find/);
      expect(await dial(`1*6*${ref}`)).toMatch(/permanently deleted/);
      expect(await cases.findByRef(ref)).toBeNull();
    });
  });

  describe('SMS keywords', () => {
    let inbound: SmsInboundService;
    const text = (from: string, body: string) => inbound.handle({ from, text: body });
    beforeEach(() => { inbound = h.app.get(SmsInboundService); });
    const report = async (over = {}) => cases.createCase({ channel: 'sms', language: 'en', phone: SURVIVOR, narrative: 'He beat me in Kayole', ...over });

    it('refuses ACK and RESOLVE from a phone that is not a registered responder', async () => {
      const c = await report();
      await text(STRANGER, `ACK ${c.ref}`);
      await text(STRANGER, `RESOLVE ${c.ref}`);
      const row = await h.cases.findOneByOrFail({ id: c.id });
      expect(row.status).toBe('OPEN');
      expect(row.escalateAt).not.toBeNull();
      expect(h.sms.outbox.some((m) => m.to === STRANGER)).toBe(false);
    });

    it('lets a registered responder accept a case, linked to their record', async () => {
      const c = await report();
      await text(TIER1, `ack ${c.ref.toLowerCase()}`);
      const row = await h.cases.findOne({ where: { id: c.id }, relations: { acknowledgedByResponder: true } });
      expect(row.status).toBe('ACKNOWLEDGED');
      expect(row.acknowledgedByResponder.phone).toBe(TIER1);
      expect(h.sms.sentTo(TIER1).some((m) => /ACK recorded/.test(m.message))).toBe(true);
    });

    it('does not let another phone switch on texts to the survivor', async () => {
      const c = await report();
      await text(STRANGER, `YES ${c.ref}`);
      expect((await h.cases.findOneByOrFail({ id: c.id })).safeToContact).toBe(false);
      await text(SURVIVOR, `YES ${c.ref}`);
      expect((await h.cases.findOneByOrFail({ id: c.id })).safeToContact).toBe(true);
    });

    it('records the police choice from the reporting phone, and only confirms where texting is safe', async () => {
      const c = await report();
      await text(SURVIVOR, 'POLICE YES');
      expect((await h.cases.findOneByOrFail({ id: c.id })).consentSharePolice).toBe(true);
      expect(h.sms.sentTo(SURVIVOR).some((m) => /police/i.test(m.message))).toBe(false);

      await cases.setConsent(c.ref, true);
      await text(SURVIVOR, `POLISI HAPANA ${c.ref}`);
      expect((await h.cases.findOneByOrFail({ id: c.id })).consentSharePolice).toBe(false);
      expect(h.sms.sentTo(SURVIVOR)[0].message).toMatch(/Hakuna atakayehusisha polisi/);
      expect((await eventsOf(h, c.id)).filter((e) => e.type === 'CONSENT_POLICE')).toHaveLength(2);

      await text(STRANGER, `POLICE YES ${c.ref}`);
      expect((await h.cases.findOneByOrFail({ id: c.id })).consentSharePolice).toBe(false);
    });

    it('treats a sentence that starts like a police command as a report', async () => {
      await text(SURVIVOR, 'Polisi hapana kunisaidia, mume wangu amenipiga tena');
      const c = await latestCase();
      expect(c.channel).toBe('sms');
      expect(c.triage.violence_types).toContain('physical');
    });

    it('caps replies to any one number', async () => {
      process.env.RATE_LIMIT_REPLIES_PER_HOUR = '3';
      for (let i = 0; i < 6; i++) await text(STRANGER, 'STOP SS-ZZZZ');
      expect(h.sms.outbox.filter((m) => m.to === STRANGER)).toHaveLength(3);
    });

    it('erases only a case reported from the sending phone', async () => {
      const c = await report();
      await text(STRANGER, `STOP ${c.ref}`);
      expect(await cases.findByRef(c.ref)).not.toBeNull();
      await text(SURVIVOR, `FUTA ${c.ref}`);
      expect(await cases.findByRef(c.ref)).toBeNull();
    });
  });

});

describe('survivor-facing templates', () => {
  it('never leave an empty sentence when there is no next step', () => {
    expect(SMS.nextSteps('en', 'SS-AAAA', '')).toBe('Sauti Salama SS-AAAA: Free help 24hrs: 1195. Reply STOP SS-AAAA to delete your report.');
    expect(SMS.nextSteps('sw', 'SS-AAAA', 'Nenda kituo cha afya')).toMatch(/^Sauti Salama SS-AAAA: Nenda kituo cha afya\. Msaada/);
    expect(USSD.created('en', 'SS-AAAA', '')).not.toMatch(/\. \./);
  });
});
