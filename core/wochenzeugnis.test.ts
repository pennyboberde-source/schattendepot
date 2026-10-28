import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../schema/entscheidung.schema.json';
import { arbeitswoche } from '../jobs/lib/wochenzeugnis.ts';
import { kalenderwoche, noteAus, notenText, wochenzeugnis } from './wochenzeugnis.ts';

describe('Wochenzeugnis', () => {
  it('Noten über Schwellen, Text auf Deutsch', () => {
    expect(noteAus(2.5, [2, 1, 0, -1, -2])).toBe(1);
    expect(noteAus(-0.5, [2, 1, 0, -1, -2])).toBe(4);
    expect(noteAus(-9, [2, 1, 0, -1, -2])).toBe(6);
    expect(notenText(2.3)).toBe('2,3 (gut)');
    expect(notenText(null)).toMatch(/keine Note/);
  });

  it('gewichtet Depot (3), Daytrading (2) und weitere Fächer; zu wenig Daten = keine Note', () => {
    const z = wochenzeugnis(
      { depot: { anzahl: 4, netto: 60, etfNetto: 20, treffer: 3, konfidenzSchnitt: 55 }, daytrading: { anzahl: 20, netto: -30, treffer: 8 }, prognose: { n: 10, quote: 60 }, schattenbuch: { n: 40, quote: 52 } },
      '2026-10-26',
      '2026-10-30',
    );
    // Depot +1 % je Order → 2; Daytrading −0,15 % je Trade → 4; Treffer 11/24 = 45,8 % → 3; Kalibrierung |55−75| = 20 → 4; Prognose 60 % → 2; Schattenbuch 52 % → 3
    expect(z.faecher.map((f) => [f.fach, f.note])).toEqual([
      ['Depot gegen MSCI World', 2],
      ['Daytrading nach Gebühren', 4],
      ['Trefferquote', 3],
      ['Ehrliche Chancen (Kalibrierung)', 4],
      ['Claudes Tagesprognose', 2],
      ['Schattenbuch (Signale nach 1 Tag)', 3],
    ]);
    expect(z.note).toBe(2.9);
    expect(z.kw).toBe(44);
    expect(wochenzeugnis({ depot: { anzahl: 0, netto: 0, etfNetto: 0, treffer: 0, konfidenzSchnitt: 0 }, daytrading: { anzahl: 0, netto: 0, treffer: 0 } }, 'a', 'b').note).toBeNull();
  });

  it('Arbeitswoche: Samstag → Montag bis Freitag davor; Kalenderwoche', () => {
    expect(arbeitswoche('2026-10-31')).toEqual({ von: '2026-10-26', bis: '2026-10-30' });
    expect(arbeitswoche('2026-10-28')).toEqual({ von: '2026-10-26', bis: '2026-10-30' });
    expect(kalenderwoche('2027-01-01')).toBe(53);
  });
});

describe('Schema S4', () => {
  const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  const pruefe = ajv.compile(schema);
  it('Abendlauf mit „Heute gelernt“, Wochenrückblick mit Monatsprüfung', () => {
    expect(pruefe({ typ: 'abendlauf', datum: '2026-10-28', erstellt: '2026-10-28T21:20:00Z', heuteGelernt: ['Insider-Cluster heute 3/3 im Plus'] })).toBe(true);
    expect(pruefe({ typ: 'abendlauf', datum: '2026-10-28', erstellt: '2026-10-28T21:20:00Z', heuteGelernt: ['a', 'b', 'c', 'd'] })).toBe(false);
    const mp = { text: 'x'.repeat(120), vorschlaege: [{ bereich: 'daytrading', vorschlag: 'ORB short bei Nebenwerten aus', begruendung: 'n=40, Ø −0,6 R' }] };
    expect(pruefe({ typ: 'wochenrueckblick', datum: '2026-11-07', erstellt: '2026-11-07T09:10:00Z', wochenrueckblick: { push: 'Woche', text: 'Text' }, monatspruefung: mp })).toBe(true);
    expect(pruefe({ typ: 'wochenrueckblick', datum: '2026-11-07', erstellt: '2026-11-07T09:10:00Z', monatspruefung: { ...mp, vorschlaege: [{ bereich: 'egal', vorschlag: 'xxxxx', begruendung: 'yyyyy' }] } })).toBe(false);
  });
});
