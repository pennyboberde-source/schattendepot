import { describe, expect, it } from 'vitest';
import type { Kerze } from './etikett.ts';
import { istUsAktie, kryptoPaar, median, splitBereinigen, unbekannteSplitsTeilen } from './reihen.ts';

const k = (datum: string, c: number, v = 100): Kerze => ({ datum, o: c, h: c, l: c, c, v });

describe('Kursreihen', () => {
  it('nur gewöhnliche US-Aktien', () => {
    expect(['AAPL', 'BRK.B', 'ZETA', 'NVDA'].every(istUsAktie)).toBe(true);
    expect(['ACAHW', 'ABCDU', 'XYZWR', 'ABC.PRA', 'abc', 'TOOLONG'].some(istUsAktie)).toBe(false);
  });

  it('Split 1:10 – frühere Kurse werden umgerechnet, kein Sprung', () => {
    const r = splitBereinigen([k('2025-06-09', 1000, 10), k('2025-06-10', 101, 100)], [{ datum: '2025-06-10', von: 1, zu: 10 }]);
    expect(r[0]).toMatchObject({ c: 100, v: 100 });
    expect(r[1].c).toBe(101);
  });

  it('Zusammenlegung 20:1 – frühere Kurse × 20', () => {
    const r = splitBereinigen([k('2025-07-01', 0.5), k('2025-07-02', 10.2)], [{ datum: '2025-07-02', von: 20, zu: 1 }]);
    expect(r[0].c).toBe(10);
  });

  it('nicht gemeldeter Split: Reihe wird an der Lücke geteilt, echte Sprünge bleiben', () => {
    const reihe = [k('a', 10), k('b', 10.5), k('c', 105.3), k('d', 106), k('e', 150)];
    expect(unbekannteSplitsTeilen(reihe).map((t) => t.length)).toEqual([2, 3]);
    expect(unbekannteSplitsTeilen([k('a', 10), k('b', 14), k('c', 30)]).length).toBe(1);
  });

  it('Krypto-Paar und Median', () => {
    expect(kryptoPaar('XBT/EUR')).toEqual({ basis: 'XBT', quote: 'EUR' });
    expect(kryptoPaar('kaputt')).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });
});
