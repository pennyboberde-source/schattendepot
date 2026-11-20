import { describe, expect, it } from 'vitest';
import { abdeckungBerechnen } from './abdeckung.ts';
import type { JagdFall } from './jagd.ts';

const fall = (wert: string, stichtag: string, art: JagdFall['art'], extra: Partial<JagdFall> = {}): JagdFall => ({
  muster: 'm',
  wertung: 0,
  wert,
  markt: 'aktie',
  stichtag,
  einstieg: art === 'lauert' ? null : stichtag,
  ende: art === 'offen' || art === 'lauert' ? null : stichtag,
  art,
  netto: art === 'treffer' ? 400 : -150,
  tag: 1,
  fenster: 5,
  spielart: 'x',
  ...extra,
});

describe('abdeckungBerechnen', () => {
  it('zählt erkannt, richtig, gejagt, sichtbar und die Treffsicherheit ab Beginn des Vorwärtstests', () => {
    const vorwaerts = [fall('AAA', '2026-11-16', 'treffer'), fall('BBB', '2026-11-16', 'niete'), fall('CCC', '2026-11-18', 'niete'), fall('DDD', '2026-11-19', 'lauert')];
    const buch = [
      { datum: '2026-11-16', wert: 'AAA', markt: 'aktie' as const },
      { datum: '2026-11-17', wert: 'BBB', markt: 'aktie' as const },
      { datum: '2026-11-17', wert: 'EEE', markt: 'aktie' as const },
      { datum: '2026-11-10', wert: 'FFF', markt: 'aktie' as const },
    ];
    const a = abdeckungBerechnen(buch, vorwaerts, [vorwaerts[0]], [], 7);
    expect(a.ab).toBe('2026-11-16');
    expect(a.volltreffer).toBe(3); // FFF liegt vor dem Vorwärtstest
    expect(a.erkannt).toBe(2); // AAA am selben Tag, BBB einen Tag vorher
    expect(a.richtig).toBe(1);
    expect(a.gejagt).toBe(1);
    expect(a.sichtbar).toBe(0);
    expect(a.anteilRichtig).toBe(33.3);
    expect(a.vorwaerts).toEqual({ faelle: 3, treffer: 1, quote: 33.3, tage: 2 });
    expect(a.jeTag[0]).toEqual({ datum: '2026-11-17', volltreffer: 2, erkannt: 1, richtig: 0 });
  });

  it('erkennt nur Fälle vor dem Sprung, nicht danach, und trennt die Märkte', () => {
    const vorwaerts = [fall('AAA', '2026-11-20', 'niete'), fall('AAA', '2026-11-12', 'niete', { markt: 'krypto' })];
    const a = abdeckungBerechnen([{ datum: '2026-11-18', wert: 'AAA', markt: 'aktie' }], vorwaerts, [], [], 7);
    expect(a.erkannt).toBe(0);
  });

  it('ohne Vorwärts-Fälle ist nichts relevant', () => {
    expect(abdeckungBerechnen([{ datum: '2026-11-18', wert: 'A', markt: 'aktie' }], [], [], []).volltreffer).toBe(0);
  });
});
