import { describe, expect, it } from 'vitest';
import { bewerten, gegenTag, mitSperre, schwelleFuer, tagesAuswahl, tagesRang, trainieren, wichtigkeit, type ModellEinstellungen } from './modell.ts';

const E: ModellEinstellungen = { baeume: 60, tiefe: 3, lernrate: 0.2, minBlatt: 20, anteil: 0.5, kappe: 500, lambda: 10, start: 3 };

/** Künstliche Daten: Gewinn nur, wenn Merkmal 0 = 2 UND Merkmal 1 = 3 (Zusammenspiel), sonst Verlust; Merkmal 2 ist Rauschen */
function daten(n: number, start: number) {
  let a = start;
  const r = () => ((a = (a * 1103515245 + 12345) % 2147483648) / 2147483648);
  const p = 3;
  const X = new Uint8Array(n * p);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    X[i * p] = Math.floor(r() * 4);
    X[i * p + 1] = Math.floor(r() * 5);
    X[i * p + 2] = Math.floor(r() * 6);
    y[i] = (X[i * p] === 2 && X[i * p + 1] === 3 ? 200 : -20) + (r() - 0.5) * 40;
  }
  return { X, y, p };
}

describe('Gesamtmodell (Gradient Boosting)', () => {
  it('findet ein Zusammenspiel zweier Merkmale und wertet es außerhalb der Trainingsdaten richtig', () => {
    const { X, y, p } = daten(4000, 11);
    const train = Int32Array.from({ length: 2000 }, (_, i) => i);
    const m = trainieren(X, p, y, train, E);
    expect(m.baeume.length).toBe(60);
    // Testhälfte: die obersten 5 % müssen fast nur Gewinner sein
    const test = Array.from({ length: 2000 }, (_, i) => i + 2000);
    const b = test.map((i) => bewerten(m, X, i));
    const s = schwelleFuer(b, 5);
    const gew = test.filter((_, k) => b[k] >= s);
    const quote = gew.filter((i) => y[i] > 100).length / gew.length;
    expect(quote).toBeGreaterThan(0.9);
    // Wichtigkeit: Merkmal 0 und 1 vor dem Rauschen
    const w = wichtigkeit(m);
    expect(w[0]).toBeGreaterThan(w[2]);
    expect(w[1]).toBeGreaterThan(w[2]);
  });

  it('ist deterministisch (gleicher Start → gleiches Modell)', () => {
    const { X, y, p } = daten(1000, 5);
    const z = Int32Array.from({ length: 1000 }, (_, i) => i);
    expect(JSON.stringify(trainieren(X, p, y, z, E))).toBe(JSON.stringify(trainieren(X, p, y, z, E)));
  });

  it('teilt nicht unter der Mindestzahl je Blatt', () => {
    const { X, y, p } = daten(30, 9);
    const m = trainieren(X, p, y, Int32Array.from({ length: 30 }, (_, i) => i), E);
    expect(m.baeume.every((b) => b.merkmal.length === 1)).toBe(true);
  });

  it('nicht erlaubte Merkmale teilen nie', () => {
    const { X, y, p } = daten(3000, 13);
    const m = trainieren(X, p, y, Int32Array.from({ length: 3000 }, (_, i) => i), E, [false, true, true]);
    expect(wichtigkeit(m)[0]).toBe(0);
    expect(wichtigkeit(m)[1]).toBeGreaterThan(0);
  });

  it('Auswahl je Tag und Ziel gegen den Tagesdurchschnitt', () => {
    // Zeilen 0–5: Tag 1 (drei Fälle) und Tag 2 (drei Fälle)
    const tag = (z: number) => (z < 3 ? 1 : 2);
    expect(tagesAuswahl([0, 1, 2, 3, 4, 5], [5, 9, 1, 0, -1, 3], tag, 10).sort()).toEqual([1, 5]);
    const y = Float32Array.from([10, 20, 30, -10, -10, -40]);
    expect([...gegenTag(y, [0, 1, 2, 3, 4, 5], tag)]).toEqual([-10, 0, 10, 10, 10, -20]);
    // Rang je Tag: Tag 1 Bewertungen 5, 9, 1 → 0,5 / 1 / 0; Tag 2 nur zwei Fälle → 0 / 1; ein Fall allein → 1
    expect([...tagesRang([0, 1, 2, 3, 5], [5, 9, 1, 0, 3], tag)]).toEqual([0.5, 1, 0, 0, 1]);
    expect([...tagesRang([4], [7], tag)]).toEqual([1]);
  });

  it('Schwelle der obersten q Prozent und Sperre je Wert', () => {
    expect(schwelleFuer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 20)).toBe(9);
    expect(schwelleFuer([], 1)).toBe(Infinity);
    const f = [
      { wert: 1, tag: 5 },
      { wert: 1, tag: 9 },
      { wert: 1, tag: 16 },
      { wert: 2, tag: 9 },
    ];
    expect(mitSperre(f, 10)).toEqual([
      { wert: 1, tag: 5 },
      { wert: 1, tag: 16 },
      { wert: 2, tag: 9 },
    ]);
  });
});
