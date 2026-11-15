import { describe, expect, it } from 'vitest';
import type { Ausgang, Kerze } from './etikett.ts';
import { merkmale } from './merkmale.ts';
import { HYPOTHESEN, hypothesenFaelle, pruefen, Zaehlwerk, type Kennzahl } from './pruefung.ts';

const a = (art: Ausgang['art'], netto: number, extra: Partial<Ausgang> = {}): Ausgang => ({ art, tag: 1, netto, bestNetto: netto, ...extra });
const kz = (n: number, ev: number, se: number, treffer = 0): Kennzahl => ({ n, treffer, beinahe: 0, quote: n ? (treffer / n) * 100 : 0, ev, se, knockout: 0 });

describe('Zählwerk', () => {
  it('zählt Fälle, Treffer, Beinahe-Treffer, Ø netto und Standardfehler je Zeitraum', () => {
    const z = new Zaehlwerk(2, 1, 1, 2);
    z.add(1, 0, 0, 0, a('treffer', 400));
    z.add(1, 0, 0, 0, a('niete', -150));
    z.add(1, 0, 0, 0, a('zeit', 50, { beinahe: true }));
    z.add(1, 0, 0, 1, a('niete', -1000, { knockout: true }));
    const k = z.werte(1, 0, 0, 0);
    expect(k).toMatchObject({ n: 3, treffer: 1, beinahe: 1, quote: 33.33, ev: 100 });
    expect(k.se).toBeCloseTo(Math.sqrt(((300 ** 2 + 250 ** 2 + 50 ** 2) / 2) / 3), 0);
    expect(z.gesamt(1, 0, 0)).toMatchObject({ n: 4, knockout: 1, ev: -175 });
    expect(z.werte(0, 0, 0, 0).n).toBe(0);
  });
});

describe('Bestehens-Regel', () => {
  const basis = kz(10000, -50, 2, 100);
  it('besteht nur mit je 100 Fällen und Ø über null in BEIDEN Zeiträumen', () => {
    expect(pruefen('g', 's', 10, [kz(150, 30, 10, 6), kz(120, 12, 8, 4)], basis).bestanden).toBe(true);
    expect(pruefen('g', 's', 10, [kz(150, 30, 10, 6), kz(99, 12, 8, 4)], basis).bestanden).toBe(false);
    expect(pruefen('g', 's', 10, [kz(150, 30, 10, 6), kz(120, -1, 8, 4)], basis).bestanden).toBe(false);
  });
  it('Wertung = schwächerer Zeitraum minus Standardfehler; Lift und Erfassung gegen die Grundrate', () => {
    const p = pruefen('g', 's', 10, [kz(150, 30, 10, 6), kz(120, 12, 8, 4)], basis);
    expect(p.wertung).toBe(4);
    expect(p.gesamt.n).toBe(270);
    expect(p.lift).toBeCloseTo(((10 / 270) * 100) / 1, 1);
    expect(p.erfassung).toBe(10);
  });
});

const tag = (n: number) => new Date(Date.UTC(2025, 0, 1) + n * 86400000).toISOString().slice(0, 10);
function ruhig(n: number, kurs = 10, v = 1000): Kerze[] {
  return Array.from({ length: n }, (_, j) => ({ datum: tag(j), o: kurs, h: kurs * 1.01, l: kurs * 0.99, c: kurs, v }));
}
const hyp = (nr: string) => HYPOTHESEN.find((h) => h.nr === nr)!;
const alleMerkmale = (k: Kerze[]) => k.map((_, i) => merkmale(k, i));

describe('Hypothesen als Kerzen-Regeln', () => {
  it('C9k: Rückprall nach Ausverkauf – nur der erste höhere Schluss nach dem Absturz', () => {
    const k = ruhig(30);
    k.push({ datum: tag(30), o: 9, h: 9, l: 6.5, c: 7, v: 9000 }); // −30 %
    k.push({ datum: tag(31), o: 7, h: 7.1, l: 6.6, c: 6.8, v: 4000 }); // tiefer
    k.push({ datum: tag(32), o: 6.8, h: 7.4, l: 6.8, c: 7.3, v: 3000 }); // erster höherer Schluss → Auslöser
    k.push({ datum: tag(33), o: 7.3, h: 7.6, l: 7.2, c: 7.5, v: 2000 }); // zweiter höherer Schluss → kein neuer Fall
    const m = alleMerkmale(k);
    expect(hypothesenFaelle(hyp('C9k'), k, m)).toEqual([32]);
  });

  it('C1k: Fortsetzung – Auslöser erst, wenn ein Folgetag über dem Hoch des Anlass-Tags schließt', () => {
    const k = ruhig(30);
    k.push({ datum: tag(30), o: 10, h: 11.6, l: 10, c: 11.5, v: 8000 }); // +15 %, 8-facher Umsatz, Schluss oben
    k.push({ datum: tag(31), o: 11.5, h: 11.7, l: 11.2, c: 11.4, v: 3000 }); // noch nicht
    k.push({ datum: tag(32), o: 11.4, h: 12.2, l: 11.4, c: 12, v: 3000 }); // Schluss über 11,6 → Auslöser
    const m = alleMerkmale(k);
    expect(hypothesenFaelle(hyp('C1k'), k, m)).toEqual([32]);
  });

  it('C7k: Krypto-Ausbruch aus enger Spanne mit dreifachem Umsatz', () => {
    const k = ruhig(30, 100);
    k.push({ datum: tag(30), o: 100, h: 106, l: 100, c: 105, v: 4000 });
    expect(hypothesenFaelle(hyp('C7k'), k, alleMerkmale(k))).toEqual([30]);
  });

  it('ehrliche Fallzahl: derselbe Wert zählt erst nach 10 Handelstagen wieder', () => {
    const k = ruhig(40);
    for (const j of [20, 22, 33]) k[j] = { ...k[j], c: k[j - 1].c * 1.25, h: k[j - 1].c * 1.26 };
    const m = alleMerkmale(k);
    expect(hypothesenFaelle(hyp('C10'), k, m)).toEqual([20, 33]);
  });

  it('jede Hypothese hat Nummer, Regel in Worten und Richtung', () => {
    for (const h of HYPOTHESEN) {
      expect(h.nr).toMatch(/^C\d+k?$/);
      expect(h.regel.length).toBeGreaterThan(30);
    }
    expect(new Set(HYPOTHESEN.map((h) => h.nr)).size).toBe(HYPOTHESEN.length);
  });
});
