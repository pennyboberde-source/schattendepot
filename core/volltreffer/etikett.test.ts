// Volltreffer-Etikett: Richtwerte aus dem Konzept (Abschnitt 3), Reihenfolge Stop vor Ziel, Kurslücken, Knock-out,
// Episoden und der Pflichttest gegen Rückschaufehler.
import { describe, expect, it } from 'vitest';
import { etikett, spielartModell, spielarten, spielartText, sprungEpisoden, type EtikettKosten, type Kerze } from './etikett.ts';
import { spielartSchluessel } from './pruefung.ts';

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

describe('Nachziehstop ab +200 € (Plan V4)', () => {
  const k = KOSTEN(0.15);
  const ohne = { hebel: 1, richtung: 'long' as const, stopEuro: 150 };
  const mit = { ...ohne, nachziehAb: 200, nachziehAnteil: 0.5 };

  it('sichert ab dem Folgetag die Hälfte des besten Stands', () => {
    // Tag 1: Hoch 13 → bester Stand ≈ +298 €; Tag 2 fällt bis 11 → der Stop bei ≈ +149 € greift
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 12.5], [12.4, 12.6, 11, 11.2]);
    const [a] = etikett(kz, 0, mit, k, [2]);
    expect(a).toMatchObject({ art: 'gesichert', tag: 2, beinahe: true });
    expect(a!.netto).toBeCloseTo(149, 0);
    // ohne Nachziehstop läuft dieselbe Order bis zum Schluss von Tag 2 und bringt weniger
    const [b] = etikett(kz, 0, ohne, k, [2]);
    expect(b).toMatchObject({ art: 'zeit', tag: 2 });
    expect(b!.netto).toBeLessThan(a!.netto);
  });

  it('am Tag des besten Stands wird noch nicht nachgezogen (erst nach dem Schluss)', () => {
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 10.2]);
    expect(etikett(kz, 0, mit, k, [1])[0]).toMatchObject({ art: 'zeit', tag: 1 });
  });

  it('unter +200 € bleibt der normale Stop', () => {
    const kz = reihe([10, 10, 10, 10], [10, 11.8, 9.95, 11.5], [11.5, 11.6, 10.5, 10.6]);
    expect(etikett(kz, 0, mit, k, [2])).toEqual(etikett(kz, 0, ohne, k, [2]));
  });

  it('Kurslücke unter den Nachziehstop: Ausstieg zur Eröffnung', () => {
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 12.5], [11, 11.2, 10.9, 11.1]);
    const [a] = etikett(kz, 0, mit, k, [3]);
    expect(a).toMatchObject({ art: 'gesichert', tag: 2 });
    expect(a!.netto).toBeCloseTo(98.4, 0);
  });

  it('das Ziel bleibt: Volltreffer wie ohne Nachziehstop', () => {
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 12.5], [12.5, 14.5, 12.4, 14]);
    expect(etikett(kz, 0, mit, k, [3])[0]).toMatchObject({ art: 'treffer', tag: 2, netto: 400 });
  });

  it('Turbo short: der Nachziehstop folgt der fallenden Richtung', () => {
    // Hebel 5 short: Tag 1 Tief 92 → bester Stand ≈ +390 €; Tag 2 steigt bis 97 → der Stop bei ≈ +195 € greift
    const kz = reihe([100, 100, 100, 100], [100, 100.2, 92, 93], [93, 97, 92.5, 96.5]);
    const [a] = etikett(kz, 0, { hebel: 5, richtung: 'short', stopEuro: 150, nachziehAb: 200, nachziehAnteil: 0.5 }, k, [3]);
    expect(a).toMatchObject({ art: 'gesichert', tag: 2 });
    expect(a!.netto).toBeGreaterThan(180);
    expect(a!.netto).toBeLessThan(200);
  });

  it('kein Rückschaufehler: eine Kerze nach dem Ausstieg ändert nichts', () => {
    const kz = reihe([10, 10, 10, 10], [10, 13, 9.95, 12.5], [12.4, 12.6, 11, 11.2], [11.2, 20, 11, 19]);
    const vorher = etikett(kz.slice(0, 3), 0, mit, k, [2]);
    expect(etikett(kz, 0, mit, k, [2])).toEqual(vorher);
  });

  it('Spielarten, Schlüssel und Text mit Nachziehstop', () => {
    const sp = spielarten([1], [100, 150], { ab: 200, anteil: 0.5, stops: [150] });
    expect(sp).toEqual([
      { hebel: 1, richtung: 'long', stopEuro: 100 },
      { hebel: 1, richtung: 'long', stopEuro: 150 },
      { hebel: 1, richtung: 'long', stopEuro: 150, nachziehAb: 200, nachziehAnteil: 0.5 },
    ]);
    expect(sp.map(spielartSchluessel)).toEqual(['1L100', '1L150', '1L150N']);
    expect(spielartText(sp[2])).toBe('direkt, Stop 150 €, Nachziehstop ab 200 €');
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
