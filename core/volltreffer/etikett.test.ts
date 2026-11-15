// Volltreffer-Etikett: Richtwerte aus dem Konzept (Abschnitt 3), Reihenfolge Stop vor Ziel, Kurslücken, Knock-out,
// Episoden und der Pflichttest gegen Rückschaufehler.
import { describe, expect, it } from 'vitest';
import { etikett, spielartModell, spielarten, sprungEpisoden, type EtikettKosten, type Kerze } from './etikett.ts';

const KOSTEN = (spreadProzent: number, entgeltDirekt = 0): EtikettKosten => ({ einsatz: 1000, ziel: 400, beinahe: 200, spreadProzent, entgeltDirekt, turboSpreadProzent: 1, entgeltTurbo: 0, finanzierungProzentJahr: 5 });
const tag = (n: number) => new Date(Date.UTC(2026, 0, 5) + n * 86400000).toISOString().slice(0, 10);
/** Kerzen ab Tag 0; Stichtag ist Kerze 0, Einstieg zur Eröffnung von Kerze 1 */
const reihe = (...k: [number, number, number, number][]): Kerze[] => k.map(([o, h, l, c], n) => ({ datum: tag(n), o, h, l, c }));

describe('Richtwerte: nötige Bewegung für +400 € netto', () => {
  const noetig = (hebel: number, spread: number, entgelt = 0, tage = 0) => {
    const m = spielartModell({ hebel, richtung: 'long', stopEuro: 150 }, KOSTEN(spread, entgelt));
    return Math.round(m.bewegung(400, tage) * 1000) / 10;
  };
  it('direkt: großer Wert 40,2 %, Nebenwert 40,8 %, spekulativ 44,3 %, Krypto direkt 40,9 %', () => {
    expect(noetig(1, 0.15)).toBe(40.2);
    expect(noetig(1, 0.6)).toBe(40.8);
    expect(noetig(1, 3)).toBe(44.3);
    expect(noetig(1, 0.5, 1)).toBe(40.9);
  });
  it('Turbo nach 10 Tagen: Hebel 2 → 20,7 %, Hebel 5 → 8,4 %, Hebel 10 → 4,3 %', () => {
    expect(noetig(2, 0.15, 0, 10)).toBe(20.8);
    expect(noetig(5, 0.15, 0, 10)).toBe(8.4);
    expect(noetig(10, 0.15, 0, 10)).toBe(4.3);
  });
  it('short nur über Turbos', () => {
    expect(() => spielartModell({ hebel: 1, richtung: 'short', stopEuro: 150 }, KOSTEN(0.15))).toThrow(/short/);
  });
});

describe('Ausgang je Fenster', () => {
  const k = KOSTEN(0.15);
  const direkt = { hebel: 1, richtung: 'long' as const, stopEuro: 150 };

  it('Treffer, sobald das Tageshoch das Ziel erreicht – Netto genau 400 €', () => {
    const kz = reihe([10, 10, 10, 10], [10, 11, 9.9, 11], [11, 12, 10.8, 12], [12, 14.5, 11.9, 14]);
    const [f1, f3] = etikett(kz, 0, direkt, k, [1, 3]);
    expect(f1).toMatchObject({ art: 'zeit', tag: 1 });
    expect(f3).toMatchObject({ art: 'treffer', tag: 3, netto: 400 });
  });

  it('Stop und Ziel am selben Tag: der Stop zählt', () => {
    const kz = reihe([10, 10, 10, 10], [10, 14.5, 8, 12]);
    expect(etikett(kz, 0, direkt, k, [1])[0]).toMatchObject({ art: 'niete', netto: -150 });
  });

  it('Eröffnung jenseits des Stops: Ausstieg zum Eröffnungskurs (schlechter als der Stop)', () => {
    const kz = reihe([10, 10, 10, 10], [10, 10.2, 9.9, 10], [7, 7.5, 6.5, 7]);
    const [a] = etikett(kz, 0, direkt, k, [5]);
    expect(a?.art).toBe('niete');
    expect(a?.tag).toBe(2);
    expect(a!.netto).toBeLessThan(-290);
  });

  it('Eröffnung jenseits des Ziels: Treffer zum Eröffnungskurs (mehr als 400 €)', () => {
    const kz = reihe([10, 10, 10, 10], [10, 10.5, 9.9, 10.4], [15, 15.5, 14.8, 15]);
    const [a] = etikett(kz, 0, direkt, k, [3]);
    expect(a).toMatchObject({ art: 'treffer', tag: 2 });
    expect(a!.netto).toBeGreaterThan(490);
  });

  it('Zeitablauf zum Schlusskurs, Beinahe-Treffer ab 200 €', () => {
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 12.5], [12.5, 12.6, 11.8, 12]);
    const [a] = etikett(kz, 0, direkt, k, [2]);
    expect(a).toMatchObject({ art: 'zeit', tag: 2, beinahe: true });
    expect(a!.netto).toBe(198.2);
    expect(a!.bestNetto).toBeGreaterThan(290);
  });

  it('Turbo short Hebel 10: fallender Kurs ist der Treffer', () => {
    const kz = reihe([100, 100, 100, 100], [100, 100.5, 99, 99.5], [99.5, 99.6, 95, 95.5]);
    expect(etikett(kz, 0, { hebel: 10, richtung: 'short', stopEuro: 250 }, k, [2])[0]).toMatchObject({ art: 'treffer', tag: 2, netto: 400 });
  });

  it('Knock-out bei einer Kurslücke über die Schwelle: Totalverlust', () => {
    const kz = reihe([100, 100, 100, 100], [100, 100.5, 99.5, 100], [78, 79, 77, 78]);
    const [a] = etikett(kz, 0, { hebel: 5, richtung: 'long', stopEuro: 150 }, k, [3]);
    expect(a).toMatchObject({ art: 'niete', knockout: true, tag: 2 });
    expect(a!.netto).toBeLessThanOrEqual(-1000);
  });

  it('zu wenige Kerzen für ein Fenster: kein Etikett', () => {
    const kz = reihe([10, 10, 10, 10], [10, 10.1, 9.9, 10]);
    expect(etikett(kz, 0, direkt, k, [1, 3])).toEqual([expect.objectContaining({ art: 'zeit' }), null]);
    expect(etikett(kz, 1, direkt, k, [1])).toEqual([null]);
  });
});

describe('Pflichttest gegen Rückschaufehler', () => {
  const k = KOSTEN(0.6);
  const basis = reihe([10, 10.5, 9.8, 10.2], [10.3, 10.6, 10.1, 10.5], [10.5, 11, 10.4, 10.9], [10.9, 11.2, 10.7, 11], [11, 11.4, 10.9, 11.3], [11.3, 16, 11.2, 15.5]);
  it('eine veränderte Kerze nach dem Fenster ändert den Ausgang nicht', () => {
    const vorher = etikett(basis, 0, { hebel: 1, richtung: 'long', stopEuro: 150 }, k, [3]);
    const geaendert = basis.map((x, n) => (n === 5 ? { ...x, o: 30, h: 40, l: 1, c: 2 } : x));
    expect(etikett(geaendert, 0, { hebel: 1, richtung: 'long', stopEuro: 150 }, k, [3])).toEqual(vorher);
  });
  it('der Stichtag selbst bestimmt den Einstieg nicht (Einstieg erst zur Eröffnung des Folgetags)', () => {
    const vorher = etikett(basis, 0, { hebel: 3, richtung: 'long', stopEuro: 100 }, k, [5]);
    const geaendert = basis.map((x, n) => (n === 0 ? { ...x, o: 5, h: 50, l: 1, c: 30 } : x));
    expect(etikett(geaendert, 0, { hebel: 3, richtung: 'long', stopEuro: 100 }, k, [5])).toEqual(vorher);
  });
});

describe('Episoden und Spielarten', () => {
  it('ein Sprung beginnt nach mindestens 10 Tagen ohne Treffer', () => {
    const t = Array(40).fill(false);
    for (const i of [3, 4, 5, 12, 20, 31]) t[i] = true;
    // 12 und 20 folgen binnen 10 Tagen auf den vorigen Treffer → dieselbe Episode; 31 kommt nach 11 Tagen Pause
    expect(sprungEpisoden(t, 10)).toEqual([3, 31]);
  });
  it('direkt nur long, Turbos long und short', () => {
    const sp = spielarten([1, 5], [150]);
    expect(sp).toEqual([
      { hebel: 1, richtung: 'long', stopEuro: 150 },
      { hebel: 5, richtung: 'long', stopEuro: 150 },
      { hebel: 5, richtung: 'short', stopEuro: 150 },
    ]);
  });
});
