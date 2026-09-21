import { CasesService } from '../src/cases/cases.service';
import { SmsInboundService } from '../src/channels/sms/sms-inbound.service';
import { UssdService } from '../src/channels/ussd/ussd.service';
import { SMS, USSD } from '../src/i18n/messages';
import { buildHarness, eventsOf, eventually, Harness, SURVIVOR, TIER1 } from './harness';

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

    // A survivor's first word is not an instruction. Every case below used to be swallowed by a
    // keyword and lose the report - and, for STOP, delete the case the report belonged to.
    describe('a keyword at the start of a sentence is a report, not a command', () => {
      it('triages "Help me ..." instead of answering with the information leaflet', async () => {
        await text(SURVIVOR, 'Help me my husband is beating me right now and he has a knife');
        const c = await latestCase();
        expect(c.channel).toBe('sms');
        expect(c.urgency).toBe('critical');
        expect(c.triage.risk_flags).toContain('weapon');
        await eventually(async () => h.sms.sentTo(TIER1).find((m) => m.message.includes(c.ref)));
      });

      it('triages "Msaada ..." in Kiswahili', async () => {
        await text(SURVIVOR, 'Msaada mume wangu ananipiga sasa hivi, yuko na kisu');
        const c = await latestCase();
        expect(c.channel).toBe('sms');
        expect(c.triage.violence_types).toContain('physical');
        expect(c.urgency).toBe('critical');
      });

      it('does NOT erase a case because a message starts with STOP', async () => {
        const c = await report();
        await text(SURVIVOR, 'Stop him he is going to kill me tonight please');
        expect(await cases.findByRef(c.ref)).not.toBeNull(); // her report is still there
        const [fresh] = (await h.cases.find()).filter((x) => x.id !== c.id);
        expect(fresh.channel).toBe('sms');
        expect(fresh.triage.immediate_danger).toBe(true); // and the new danger was triaged
      });

      it('keeps the danger in "Yes he is still here" instead of reading it as consent', async () => {
        const c = await report();
        await text(SURVIVOR, 'Yes he is still here with a knife and the children are crying');
        expect((await h.cases.findOneByOrFail({ id: c.id })).safeToContact).toBe(false); // consent was never given
        const [fresh] = (await h.cases.find()).filter((x) => x.id !== c.id);
        expect(fresh.urgency).toBe('critical');
        expect(fresh.triage.risk_flags).toEqual(expect.arrayContaining(['weapon', 'children_present']));
      });

      it('does not drop a report from an unregistered phone that starts with SAFE', async () => {
        await text(STRANGER, 'Safe place please, he is outside the door and I cannot leave');
        const c = await latestCase();
        expect(c.channel).toBe('sms');
        expect(c.triage.immediate_danger).toBe(true);
      });
    });

    describe('bare keywords still work', () => {
      it('answers a bare HELP with information and no case', async () => {
        await text(SURVIVOR, 'HELP');
        expect(await h.cases.count()).toBe(0);
        expect(h.sms.sentTo(SURVIVOR)[0].message).toMatch(/free help 24hrs on 1195/);
      });

      it('asks for the reference before erasing when STOP arrives alone', async () => {
        const c = await report();
        await text(SURVIVOR, 'STOP');
        expect(await cases.findByRef(c.ref)).not.toBeNull();
        expect(h.sms.sentTo(SURVIVOR).some((m) => m.message.includes(`reply STOP ${c.ref}`))).toBe(true);
        await text(SURVIVOR, `STOP ${c.ref}`);
        expect(await cases.findByRef(c.ref)).toBeNull();
      });

      it('takes a bare YES as consent to be texted', async () => {
        const c = await report();
        await text(SURVIVOR, 'YES');
        expect((await h.cases.findOneByOrFail({ id: c.id })).safeToContact).toBe(true);
      });
    });

    // A multipart alert can reach a feature phone with its later parts missing, so everything a
    // responder needs to act has to survive truncation at the first segment boundary.
    it('puts urgency, reference, area, contact rule and ACK in the first SMS segment', async () => {
      await text(SURVIVOR, 'He beat me again last night in Kayole with a panga, he is still here and says he will kill me');
      const c = await latestCase();
      const alert = await eventually(async () => h.sms.sentTo(TIER1).find((m) => m.message.includes(c.ref)));
      const first = alert.message.split('\n--\n')[0];
      expect(first.length).toBeLessThanOrEqual(160);
      expect(first).toContain('[CRITICAL]');
      expect(first).toContain(c.ref);
      expect(first).toContain('Kayole');
      expect(first).toContain('DO NOT call or text');
      expect(first).toContain(`Reply ACK ${c.ref} to accept.`);
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
