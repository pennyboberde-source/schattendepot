import { describe, expect, it } from 'vitest';
import { nurNeue, reaktionMinuten, schnellZeit } from './schnell.ts';
import type { Signal } from './signale.ts';

const sig = (id: string, zeit = '2026-11-20T14:00:00Z') => ({ id, typ: 'verwaesserung', zeit, wertpapier: { name: 'X' }, quellen: [], staerke: 0.6, richtung: -1 }) as unknown as Signal;

describe('Schnell-SEC (19.11.2026)', () => {
  it('nur werktags von 7 bis 21 Uhr UTC', () => {
    expect(schnellZeit(6, true)).toBe(false);
    expect(schnellZeit(7, true)).toBe(true);
    expect(schnellZeit(20, true)).toBe(true);
    expect(schnellZeit(21, true)).toBe(false);
    expect(schnellZeit(14, false)).toBe(false);
  });
  it('lässt schon gesehene Meldungen weg und beginnt jeden Tag neu', () => {
    const a = nurNeue([sig('a'), sig('b'), sig('a')], null, '2026-11-20');
    expect(a.neu.map((s) => s.id)).toEqual(['a', 'b']);
    const b = nurNeue([sig('a'), sig('c')], a.gesehen, '2026-11-20');
    expect(b.neu.map((s) => s.id)).toEqual(['c']);
    expect(nurNeue([sig('a')], b.gesehen, '2026-11-21').neu.map((s) => s.id)).toEqual(['a']);
  });
  it('Reaktionszeit als Median in Minuten', () => {
    expect(reaktionMinuten([sig('a', '2026-11-20T14:00:00Z'), sig('b', '2026-11-20T14:10:00Z'), sig('c', '2026-11-20T14:20:00Z')], new Date('2026-11-20T14:30:00Z'))).toBe(20);
    expect(reaktionMinuten([], new Date())).toBeNull();
  });
});
