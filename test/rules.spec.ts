import { extractPlaces, normalizeTriage, rulesTriage, silentTriage, structuredTriage } from '../src/ai/rules';

describe('rules-based triage (offline floor)', () => {
  it('detects sexual violence within the 72h window from Kiswahili', () => {
    const r = rulesTriage({ text: 'Jana usiku nilibakwa na jirani hapa Kibra, naogopa', language: 'sw', channel: 'sms' });
    expect(r.violence_types).toContain('sexual');
    expect(r.hours_since_incident).toBeLessThanOrEqual(72);
    expect(r.urgency).toBe('high');
    expect(r.perpetrator_relationship).toBe('acquaintance');
    expect(r.location_mentions).toContain('Kibra');
    expect(r.language_detected).toBe('sw');
  });

  it('flags immediate danger, weapons and a child survivor', () => {
    const r = rulesTriage({ text: 'My boyfriend hit me and choked me tonight, he has a knife and will kill me. I am 16 years old.', language: 'en', channel: 'voice' });
    expect(r.immediate_danger).toBe(true);
    expect(r.urgency).toBe('critical');
    expect(r.risk_flags).toEqual(expect.arrayContaining(['weapon', 'strangulation']));
    expect(r.survivor_age_group).toBe('child');
    expect(r.needs).toContain('child_protection');
  });

  it('reads Sheng', () => {
    const r = rulesTriage({ text: 'Manze msee wangu amenichapa vibaya sana leo, ako na kisu, ako hapa nje ya mlango', language: 'en', channel: 'sms' });
    expect(r.language_detected).toBe('sheng');
    expect(r.immediate_danger).toBe(true);
    expect(r.perpetrator_relationship).toBe('intimate_partner');
  });

  it('keeps economic/harassment-only reports at low urgency', () => {
    const r = rulesTriage({ text: 'He keeps posting my photos online and following me from work', language: 'en', channel: 'sms' });
    expect(r.violence_types).toEqual(['harassment']);
    expect(r.urgency).toBe('low');
    expect(r.needs).toContain('legal');
  });

  it('builds a triage from USSD menu answers only', () => {
    const r = structuredTriage({ language: 'sw', channel: 'ussd', hints: { violence_type: 'sexual', when: 'recent', perpetrator_present: false, ward: 'Kayole' } });
    expect(r.provider).toBe('structured');
    expect(r.urgency).toBe('high');
    expect(r.location_mentions).toEqual(['Kayole']);
  });

  it('silent alerts are always critical', () => {
    const r = silentTriage({ language: 'en', channel: 'ussd_silent', hints: { ward: 'Dandora' } });
    expect(r.urgency).toBe('critical');
    expect(r.immediate_danger).toBe(true);
  });

  it('never lets the AI lower a danger signal the rules found', () => {
    const input = { text: 'He is here with a panga and says he will kill me', language: 'en' as const, channel: 'sms' };
    const floor = rulesTriage(input);
    const merged = normalizeTriage({ urgency: 'low', immediate_danger: false, violence_types: [], summary_en: 'ok', summary_sw: 'sawa', confidence: 0.9 }, input, floor);
    expect(merged.immediate_danger).toBe(true);
    expect(merged.urgency).toBe('critical');
    expect(merged.risk_flags).toContain('weapon');
  });

  it('ignores garbage from the model', () => {
    const input = { text: 'my husband beat me yesterday in Umoja', language: 'en' as const, channel: 'sms' };
    const merged = normalizeTriage({ urgency: 'ultra', violence_types: 'physical', needs: ['pizza'], perpetrator_relationship: 'alien' }, input, rulesTriage(input));
    expect(merged.urgency).toBe('medium');
    expect(merged.violence_types).toEqual(['physical']);
    expect(merged.needs).not.toContain('pizza');
    expect(merged.perpetrator_relationship).toBe('intimate_partner');
  });

  it('extracts Kenyan place names', () => {
    expect(extractPlaces('hiding in Mukuru kwa Njenga near Pipeline')).toEqual(['Mukuru Kwa Njenga', 'Pipeline']);
  });
});
