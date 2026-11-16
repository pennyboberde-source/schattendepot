import { describe, expect, it } from 'vitest';
import type { Kerze } from './etikett.ts';
import { groessenKlasse, signalMessen, startIndex, verdichten } from './sammelmessung.ts';

// Erfundene Tageskerzen: Start 10 €, danach jeden Tag +1 € Schluss
const k: Kerze[] = Array.from({ length: 25 }, (_, i) => ({ datum: `2026-10-${String(i + 1).padStart(2, '0')}`, o: 10 + i, h: 11.5 + i, l: 9.5 + i, c: 11 + i, v: 1000 }));

describe('Schattenbuch auf Sammelkursen', () => {
  it('Start ist die Eröffnung des ersten Handelstags NACH dem Signaltag', () => {
    expect(startIndex(k, '2026-10-01')).toBe(1);
    // Signal an einem Tag ohne Kerze (Wochenende) → erster Tag danach
    expect(startIndex([k[0], k[3]], '2026-10-02')).toBe(1);
    // Reihe deckt den Signaltag nicht ab (beginnt später) → keine Messung
    expect(startIndex(k, '2026-09-20')).toBeNull();
    // kein Folgetag
    expect(startIndex(k, '2026-10-25')).toBeNull();
  });

  it('misst Schlusskurse, Hoch/Tief und die Vergleichsgruppe', () => {
    const m = signalMessen(k, '2026-10-01', () => 1, (d) => (d === '2026-10-02' ? null : 0.5))!;
    // Start = Eröffnung 2.10. = 11 €; nach 1 Tag Schluss 12 € → +9,1 %
    expect(m.r.r1T).toBe(9.1);
    // nach 3 Tagen Schluss 14 € → +27,3 %
    expect(m.r.r3T).toBe(27.3);
    expect(m.r.r1M).toBe(Math.round((32 / 11 - 1) * 1000) / 10);
    // Markt +1 % je Tag → Überrendite r1T = 9,1 − 1
    expect(m.ueberMarkt.r1T).toBe(8.1);
    // Klasse am Starttag unbekannt → keine Überrendite gegen die Klasse
    expect(m.ueberKlasse.r1T).toBeUndefined();
    // Hoch über 21 Tage: höchstes Hoch 11,5 + 21 = 32,5 → +195,5 %; Tief = 10,5 → −4,5 %
    expect(m.hoch).toBe(195.5);
    expect(m.tief).toBe(-4.5);
  });

  it('nur fertige Messpunkte', () => {
    const m = signalMessen(k, '2026-10-20', () => 0, () => 0)!;
    // Start 21.10., noch 5 Kerzen → 1, 3 und 5 Tage fertig, 10 und 21 noch nicht
    expect(Object.keys(m.r)).toEqual(['r1T', 'r3T', 'r1W']);
  });

  it('Größenklasse und Verdichtung', () => {
    expect([1e6, 6e6, 30e6, 80e6].map(groessenKlasse)).toEqual([0, 1, 2, 3]);
    const a = signalMessen(k, '2026-10-01', () => 0, () => 0)!;
    const b = signalMessen(k, '2026-10-20', () => 0, () => 0)!;
    const v = verdichten([a, b]);
    expect(v.faelle).toBe(2);
    expect(v.punkte.r1T.n).toBe(2);
    expect(v.punkte.r1M.n).toBe(1);
    expect(v.punkte.r1T.imPlus).toBe(100);
  });
});
