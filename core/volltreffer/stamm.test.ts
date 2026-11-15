import { describe, expect, it } from 'vitest';
import { figiArt, figiEinordnen, handelbarkeitsKarte } from './stamm.ts';

describe('Stammdaten aus OpenFIGI', () => {
  // gekürzte Antwortform wie im gettex-Scanner (aufgezeichnet)
  const isins = ['US0000000001', 'US0000000002', 'DE000HS000A1', 'IE00B4L5Y983', 'DE0007164600', 'XX0000000009'];
  const antwort = [
    { data: [{ name: 'BEISPIEL CORP', ticker: 'BSPL', exchCode: 'US', marketSector: 'Equity', securityType: 'Common Stock', securityType2: 'Common Stock' }] },
    { data: [{ name: 'BEISPIEL ADR', ticker: 'BADR', exchCode: 'US', marketSector: 'Equity', securityType: 'ADR', securityType2: 'Depositary Receipt' }] },
    { data: [{ name: 'HSBC TRINKAUS TURBO', ticker: 'HS0A1', exchCode: 'GR', marketSector: 'Equity', securityType: 'Equity WRT', securityType2: 'Warrant' }] },
    { data: [{ name: 'ISHARES CORE MSCI WORLD', ticker: 'EUNL', exchCode: 'GR', marketSector: 'Equity', securityType: 'ETP', securityType2: 'Mutual Fund' }] },
    { data: [{ name: 'SAP SE', ticker: 'SAP', exchCode: 'GR', marketSector: 'Equity', securityType: 'Common Stock', securityType2: 'Common Stock' }, { name: 'SAP SE', ticker: 'SAPGF', exchCode: 'US', securityType2: 'Common Stock' }] },
    { warning: 'No identifier found.' },
  ];

  it('ordnet Aktie, ADR, Hebelprodukt, ETF ein und bevorzugt das US-Kürzel', () => {
    const s = figiEinordnen(isins, antwort, '2026-11-15');
    expect(s.US0000000001).toMatchObject({ usTicker: 'BSPL', art: 'aktie' });
    expect(s.US0000000002).toMatchObject({ usTicker: 'BADR', art: 'aktie' });
    expect(s.DE000HS000A1).toMatchObject({ ticker: 'HS0A1', art: 'hebel' });
    expect(s.IE00B4L5Y983).toMatchObject({ art: 'etf' });
    expect(s.DE0007164600).toMatchObject({ usTicker: 'SAPGF', art: 'aktie' });
    expect(s.XX0000000009).toEqual({ name: '', art: 'unbekannt', geholt: '2026-11-15' });
  });

  it('Anleihen und Fonds', () => {
    expect(figiArt({ marketSector: 'Corp', securityType2: 'Corp' })).toBe('anleihe');
    expect(figiArt({ securityType2: 'Mutual Fund', securityType: 'Open-End Fund' })).toBe('fonds');
    expect(figiArt(undefined)).toBe('unbekannt');
  });
});

describe('Handelbarkeits-Karte', () => {
  const tag = (datum: string, eintraege: [string, number][]) => ({ datum, umsatz: new Map(eintraege) });
  it('handelbar = Umsatz an mindestens 10 der letzten 20 Tage', () => {
    const tage = Array.from({ length: 20 }, (_, n) =>
      tag(`2026-12-${String(n + 1).padStart(2, '0')}`, [
        ['A', 1000 + n],
        ...(n % 2 === 0 ? ([['B', 500]] as [string, number][]) : []),
        ...(n < 9 ? ([['C', 50]] as [string, number][]) : []),
      ]),
    );
    const k = handelbarkeitsKarte(tage);
    expect([...k.keys()].sort()).toEqual(['A', 'B']);
    expect(k.get('A')).toEqual({ tage: 20, umsatzMedian: 1010 });
  });
  it('bei wenigen Tagen gilt der Anteil (die Hälfte der vorhandenen Tage)', () => {
    const k = handelbarkeitsKarte([tag('2026-11-16', [['A', 10], ['B', 5]]), tag('2026-11-17', [['A', 12]])]);
    expect([...k.keys()].sort()).toEqual(['A', 'B']);
    expect(handelbarkeitsKarte([]).size).toBe(0);
  });
});
