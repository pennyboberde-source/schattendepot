import { describe, expect, it } from 'vitest';
import { figiAuswerten, ohneHebelprodukte, type Figi } from './gettexscanner.ts';

// Aufgezeichnete OpenFIGI-Antwort (gekürzt): Aktie, ADR, HSBC-Turbo, Goldman-Optionsschein, unbekannte ISIN.
const isins = ['US0000000001', 'US0000000002', 'DE000HS000A1', 'DE000GQ000B2', 'XX0000000009'];
const antwort: Figi[] = [
  { data: [{ name: 'BEISPIEL CORP', ticker: 'BSPL', exchCode: 'US', securityType: 'Common Stock', securityType2: 'Common Stock' }] },
  { data: [{ name: 'BEISPIEL ADR', ticker: 'BADR', exchCode: 'US', securityType: 'ADR', securityType2: 'Depositary Receipt' }] },
  { data: [{ name: 'HSBC TRINKAUS TURBO', ticker: 'HS0A1', exchCode: 'GR', securityType: 'Equity WRT', securityType2: 'Warrant' }] },
  { data: [{ name: 'GOLDMAN SACHS OS', ticker: 'GQ0B2', exchCode: 'GR', securityType: 'Equity WRT', securityType2: 'Warrant' }] },
  {},
];

describe('gettex-Scanner: Hebelprodukte aussortieren', () => {
  it('ordnet die OpenFIGI-Antwort je ISIN ein', () => {
    const n = figiAuswerten(isins, antwort);
    expect(n.get('US0000000001')).toEqual({ name: 'BEISPIEL CORP', ticker: 'BSPL', aktie: true });
    expect(n.get('US0000000002')?.aktie).toBe(true);
    expect(n.get('DE000HS000A1')).toEqual({ name: 'HSBC TRINKAUS TURBO', ticker: undefined, aktie: false });
    expect(n.has('XX0000000009')).toBe(false);
  });

  it('meldet keine Turbos und Optionsscheine, behält Aktien und Unbekannte', () => {
    const n = figiAuswerten(isins, antwort);
    const treffer = isins.map((isin) => ({ isin }));
    expect(ohneHebelprodukte(treffer, n).map((t) => t.isin)).toEqual(['US0000000001', 'US0000000002', 'XX0000000009']);
  });

  it('ohne OpenFIGI-Antwort bleibt alles drin, aber höchstens max Treffer', () => {
    const treffer = Array.from({ length: 15 }, (_, i) => ({ isin: `DE000HS${String(i).padStart(5, '0')}` }));
    expect(ohneHebelprodukte(treffer, new Map())).toHaveLength(10);
    expect(ohneHebelprodukte(treffer, new Map(), 3)).toHaveLength(3);
  });
});
