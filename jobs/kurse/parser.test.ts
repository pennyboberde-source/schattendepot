import { describe, expect, it } from 'vitest';
import { parseAlphaVantage, parseFinnhub, parseFmp, parseFrankfurter, parseKraken, parseTwelveData, symbolFuer } from './parser.ts';

// Aufgezeichnete (gekürzte) Beispielantworten – keine echten Abrufe in Tests.
describe('Parser der Kursanbieter', () => {
  it('Finnhub', () => {
    expect(parseFinnhub({ c: 231.5, d: 1.2, dp: 0.52, h: 232, l: 229, o: 230, pc: 230.3, t: 1792598400 })).toEqual({
      wert: 231.5,
      vortag: 230.3,
      zeit: new Date(1792598400 * 1000).toISOString(),
      quelle: 'Finnhub',
    });
    expect(parseFinnhub({ c: 0, d: null as unknown as number, pc: 0, t: 0 })).toBeNull();
  });

  it('Twelve Data inkl. Fehlerantwort', () => {
    expect(parseTwelveData({ close: '1.08420', previous_close: '1.08100', timestamp: 1792598400 })).toMatchObject({ wert: 1.0842, vortag: 1.081 });
    expect(parseTwelveData({ code: 404, message: '**symbol** not found' } as never)).toBeNull();
  });

  it('FMP', () => {
    expect(parseFmp([{ symbol: 'SAP.DE', price: 238.1, previousClose: 236, timestamp: 1792598400 }])).toMatchObject({ wert: 238.1, vortag: 236, quelle: 'FMP' });
    expect(parseFmp([])).toBeNull();
    expect(parseFmp({ 'Error Message': 'Limit Reach' })).toBeNull();
  });

  it('Alpha Vantage: Tageskurs mit Zeit 17:30 Berlin', () => {
    const k = parseAlphaVantage({ 'Global Quote': { '01. symbol': 'SAP.DEX', '05. price': '238.1000', '07. latest trading day': '2026-10-20', '08. previous close': '236.0000' } });
    expect(k).toMatchObject({ wert: 238.1, vortag: 236, zeit: '2026-10-20T15:30:00.000Z' });
    expect(parseAlphaVantage({ Information: 'rate limit' } as never)).toBeNull();
  });

  it('Kraken mit echtem Geld-/Briefkurs', () => {
    const k = parseKraken({ error: [], result: { XXBTZEUR: { a: ['61000.1', '1', '1.0'], b: ['60990.0', '2', '2.0'], c: ['60995.5', '0.01'], o: '60000.0' } } }, new Date('2026-10-21T10:00:00Z'));
    expect(k).toMatchObject({ wert: 60995.5, geld: 60990, brief: 61000.1, vortag: 60000, quelle: 'Kraken' });
    expect(parseKraken({ error: ['EQuery:Unknown asset pair'] }, new Date())).toBeNull();
  });

  it('Frankfurter (EZB)', () => {
    expect(parseFrankfurter({ rates: { USD: 1.0842 } })).toBe(1.0842);
  });

  it('Symbolumsetzung', () => {
    expect(symbolFuer('alphavantage', 'SAP.DE')).toBe('SAP.DEX');
    expect(symbolFuer('kraken', 'BTC')).toBe('XBTEUR');
  });
});
