import { ReferralService } from '../src/cases/referral.service';
import { rulesTriage } from '../src/ai/rules';

const resources: any = { pick: (category: string) => ({ name: `${category} service`, phone: '1195', coverage: 'national' }) };
const referral = new ReferralService(resources);

describe('referral pathway engine', () => {
  it('puts the 72h medical step first after recent sexual violence', () => {
    const tr = rulesTriage({ text: 'I was raped last night by a stranger', language: 'en', channel: 'sms' });
    const steps = referral.build(tr, { channel: 'sms', safeToContact: false });
    expect(steps[0].key).toBe('medical_72h');
    expect(steps[0].deadline.en).toMatch(/72 hours/);
    expect(steps.map((s) => s.key)).toContain('police_report');
    expect(steps[steps.length - 1].short.en).toMatch(/No calls\/SMS/);
  });

  it('leads with safety and child protection when a child is in danger', () => {
    const tr = rulesTriage({ text: 'My daughter is 13, her uncle is beating her right now and he has a knife', language: 'en', channel: 'voice' });
    const keys = referral.build(tr, { channel: 'voice' }).map((s) => s.key);
    expect(keys.slice(0, 2)).toEqual(['safety_now', 'child_protection']);
    expect(keys).toContain('shelter');
  });

  it('offers legal aid and counselling for economic abuse by a partner', () => {
    const tr = rulesTriage({ text: 'My husband took my salary and my phone and refuses to pay for food for the children', language: 'en', channel: 'ussd' });
    const keys = referral.build(tr, { channel: 'ussd' }).map((s) => s.key);
    expect(keys).toEqual(expect.arrayContaining(['legal', 'counselling', 'follow_up']));
    expect(keys).not.toContain('medical_72h');
  });

  it('produces short bilingual survivor steps', () => {
    const tr = rulesTriage({ text: 'Nilibakwa jana', language: 'sw', channel: 'ussd' });
    const steps = referral.build(tr, { channel: 'ussd' });
    expect(referral.survivorSteps(steps, 'sw', 1)).toMatch(/saa 72/);
    expect(referral.survivorSteps(steps, 'en', 1).length).toBeLessThan(80);
  });
});
