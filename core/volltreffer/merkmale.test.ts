import { describe, expect, it } from 'vitest';
import type { Kerze } from './etikett.ts';
import { klasse, klassenName, merkmale } from './merkmale.ts';

const tag = (n: number) => new Date(Date.UTC(2025, 0, 1) + n * 86400000).toISOString().slice(0, 10);
/** 30 ruhige Tage um 10, dann ein lauter Stichtag */
function reihe(): Kerze[] {
  const k: Kerze[] = [];
  for (let n = 0; n < 30; n++) k.push({ datum: tag(n), o: 10, h: 10.2, l: 9.8, c: 10 + (n % 2) * 0.1, v: 1000 });
  k.push({ datum: tag(30), o: 10.5, h: 12.2, l: 10.4, c: 12, v: 6000 });
  k.push({ datum: tag(31), o: 12.1, h: 15, l: 11.5, c: 14.5, v: 9000 });
  return k;
}

describe('Merkmale zum Stichtag', () => {
  it('Rendite, Umsatz, Spanne, Lage, Lücke, Abstand zum Hoch', () => {
    const m = merkmale(reihe(), 30)!;
    // Vortag (Tag 29) schloss bei 10,1
    expect(m.r1).toBeCloseTo((12 / 10.1 - 1) * 100, 5);
    expect(m.relVolumen).toBeCloseTo(6, 5);
    expect(m.relSpanne).toBeGreaterThan(3.5);
    expect(m.lageSchluss).toBeCloseTo(1.6 / 1.8, 5);
    expect(m.luecke).toBeCloseTo((10.5 / 10.1 - 1) * 100, 5);
    expect(m.abstandHoch20).toBeCloseTo((12 / 12.2 - 1) * 100, 5);
    expect(m.abstandHoch250).toBeNull();
    expect(m.umsatz20).toBeGreaterThan(0);
    expect(m.historie).toBe(31);
  });

  it('eine Zukunftskerze ändert kein Merkmal', () => {
    const a = reihe();
    const b = reihe().map((x, n) => (n === 31 ? { ...x, o: 1, h: 100, l: 0.5, c: 99, v: 1e9 } : x));
    expect(merkmale(b, 30)).toEqual(merkmale(a, 30));
  });

  it('zu wenig Geschichte: was sie braucht, ist null', () => {
    const m = merkmale(reihe(), 3)!;
    expect(m.r20).toBeNull();
    expect(m.relVolumen).toBeNull();
    expect(m.schwankung20).toBeNull();
    expect(merkmale(reihe(), 0)).toBeNull();
  });
});

describe('Klassen', () => {
  it('teilt Werte ein und benennt die Klassen', () => {
    const e = { merkmal: 'relVolumen' as const, grenzen: [1, 2, 5] };
    expect([0.5, 1, 1.9, 2, 7].map((x) => klasse(x, e.grenzen))).toEqual([0, 1, 1, 2, 3]);
    expect(klasse(null, e.grenzen)).toBeNull();
    expect([0, 1, 3].map((n) => klassenName(e, n))).toEqual(['unter 1', '1 bis 2', 'ab 5']);
  });
});
