import { describe, expect, it } from 'vitest';
import { schwaerzen } from './schwaerzen.ts';

describe('Schwärzen von Geheimnissen', () => {
  it('echte Secret-Werte werden überall ersetzt', () => {
    const env = { FINNHUB_API_KEY: 'abc123geheim', ROUTINE_FIRE_TOKEN: 'sk-ant-oat01-xyz' };
    expect(schwaerzen('Fehler bei https://finnhub.io/api/v1/quote?symbol=X&token=abc123geheim: 500', env)).toBe('Fehler bei https://finnhub.io/api/v1/quote?symbol=X&token=***: 500');
    expect(schwaerzen('Wert abc123geheim im Text', env)).toBe('Wert *** im Text');
  });
  it('Teile der Push-Anmeldung (Endpoint, Schlüssel) werden mitgeschwärzt', () => {
    const env = { PUSH_SUBSCRIPTION: JSON.stringify({ endpoint: 'https://web.push.apple.com/QGeheimerPfad123', keys: { p256dh: 'BKschluessel456', auth: 'authgeheim789' } }) };
    expect(schwaerzen('410 Gone für https://web.push.apple.com/QGeheimerPfad123 (authgeheim789)', env)).toBe('410 Gone für *** (***)');
  });
  it('auch die Anmeldungen weiterer Geräte (iPhone) und Listen in einem Secret werden geschwärzt', () => {
    const env = {
      PUSH_SUBSCRIPTION_2: JSON.stringify({ endpoint: 'https://web.push.apple.com/QiPhonePfad42', keys: { p256dh: 'BKiphone4711', auth: 'authiphone99' } }),
      PUSH_SUBSCRIPTION_3: JSON.stringify([{ endpoint: 'https://fcm.googleapis.com/fcm/send/AndroidPfad7', keys: { auth: 'authandroid11' } }]),
    };
    expect(schwaerzen('410 für https://web.push.apple.com/QiPhonePfad42 und authiphone99', env)).toBe('410 für *** und ***');
    expect(schwaerzen('Fehler https://fcm.googleapis.com/fcm/send/AndroidPfad7 authandroid11', env)).toBe('Fehler *** ***');
  });
  it('typische URL-Parameter und Bearer-Token auch ohne bekannte Werte', () => {
    expect(schwaerzen('https://x/y?apikey=A1&api_key=B2&key=C3&z=1', {})).toBe('https://x/y?apikey=***&api_key=***&key=***&z=1');
    expect(schwaerzen('Authorization: Bearer sk-ant-oat01-abc', {})).toBe('Authorization: Bearer ***');
  });
});
