// Lösung B (14.11.2026): öffentlich nur Veränderungen in Prozent, keine Kurse.
import { describe, expect, it } from 'vitest';
import { ohneTagesstand, positionsStand } from './ableiten.ts';
import { statistikBerechnen, type TrackingEintrag } from './statistik.ts';
import type { Order } from './typen.ts';
import { istVerlaufProzent, verlaufInProzent, verlaufPunkt, type VerlaufAlt } from './verlauf.ts';

describe('Verlauf in Prozent seit Kauf', () => {
  it('rechnet eine alte Kursreihe in Euro um (eine Nachkommastelle)', () => {
    const alt: VerlaufAlt = [
      ['2026-11-10T08:00:00Z', 100],
      ['2026-11-10T09:00:00Z', 112.345],
      ['2026-11-10T10:00:00Z', 95],
    ];
    const v = verlaufInProzent(alt, 100);
    expect(v).toEqual({
      einheit: 'prozent',
      punkte: [
        ['2026-11-10T08:00:00Z', 0],
        ['2026-11-10T09:00:00Z', 12.3],
        ['2026-11-10T10:00:00Z', -5],
      ],
    });
    expect(istVerlaufProzent(v)).toBe(true);
    expect(istVerlaufProzent(alt)).toBe(false);
  });

  it('verwirft unbrauchbare Punkte und braucht einen Kaufkurs', () => {
    const alt = [['a', 0], ['b', -3], ['c', 'x'], ['d', 110]] as unknown as VerlaufAlt;
    expect(verlaufInProzent(alt, 100).punkte).toEqual([['d', 10]]);
    expect(verlaufInProzent(alt, 0)).toEqual({ einheit: 'prozent', punkte: [] });
    expect(verlaufInProzent(null, 100)).toEqual({ einheit: 'prozent', punkte: [] });
  });

  it('lässt einen Verlauf im neuen Format unverändert', () => {
    const neu = { einheit: 'prozent' as const, punkte: [['z', 4.2]] as [string, number][] };
    expect(verlaufInProzent(neu, 123)).toBe(neu);
  });

  it('hängt je Kurszeit einen Punkt an und kürzt auf die Höchstzahl', () => {
    let v = verlaufInProzent([], 50);
    v = verlaufPunkt(v, 't1', 55, 50);
    const gleich = verlaufPunkt(v, 't1', 60, 50);
    expect(gleich).toBe(v);
    v = verlaufPunkt(v, 't2', 45, 50);
    expect(v.punkte).toEqual([
      ['t1', 10],
      ['t2', -10],
    ]);
    expect(verlaufPunkt(v, 't3', 0, 50)).toBe(v);
    expect(verlaufPunkt(v, 't3', 51, 0)).toBe(v);
    expect(verlaufPunkt(v, 't3', 51, 50, 2).punkte.map((p) => p[0])).toEqual(['t2', 't3']);
  });
});

describe('Positionen ohne Tagesstand in Euro', () => {
  const basis = {
    id: 'o1',
    status: 'offen',
    kauf: { zeit: '2026-11-10T08:00:00Z', stueck: 10, kurs: 80, kurswert: 800, entgelt: { provision: 0, handelsplatz: 0, gesamt: 0 }, betrag: 800, kursquelle: 'gettex', synthetisch: false },
    letzterKurs: { wert: 92, vortag: 88, geld: 91.9, brief: 92.1, zeit: '2026-11-13T15:00:00Z', quelle: 'gettex', verzoegertMin: 15 },
  } as unknown as Order;

  it('rechnet den Stand in Prozent seit Kauf und gegenüber dem Vortag', () => {
    expect(positionsStand(basis)).toEqual({ prozent: 15, tagProzent: 4.55, zeit: '2026-11-13T15:00:00Z', quelle: 'gettex', verzoegertMin: 15 });
  });

  it('entfernt den Kurs und behält nur den Stand', () => {
    const o = ohneTagesstand(basis);
    expect(o).not.toHaveProperty('letzterKurs');
    expect(o.stand?.prozent).toBe(15);
    // nichts im Ergebnis darf den Tageskurs, Geld-/Briefkurs oder Vortageskurs verraten
    const text = JSON.stringify(o);
    for (const kurs of ['92', '88', '91.9', '92.1']) expect(text).not.toMatch(new RegExp(`:${kurs.replace('.', '\\.')}[,}]`));
  });

  it('ohne Tagesstand gibt es keinen Stand (vorgemerkt oder ohne Kurs)', () => {
    const { letzterKurs: _k, ...ohne } = basis;
    expect(positionsStand(ohne as Order)).toBeUndefined();
    expect(ohneTagesstand(ohne as Order)).not.toHaveProperty('stand');
    const vorgemerkt = { ...basis, kauf: undefined } as unknown as Order;
    expect(positionsStand(vorgemerkt)).toBeUndefined();
    expect(ohneTagesstand(vorgemerkt)).not.toHaveProperty('letzterKurs');
    expect(positionsStand({ ...basis, letzterKurs: { ...basis.letzterKurs!, vortag: undefined, synthetisch: true } })).toEqual({ prozent: 15, zeit: '2026-11-13T15:00:00Z', quelle: 'gettex', verzoegertMin: 15, synthetisch: true });
  });
});

describe('Statistik, wenn das Schattenbuch nicht erreichbar ist', () => {
  const eintrag = (i: number, r1W: number): TrackingEintrag => ({ datum: '2026-10-01', schluessel: `T:A${i}`, name: `A${i}`, ticker: `A${i}`, score: 5, typen: ['insider_kauf'], quellen: ['OpenInsider'], start: 10, r1T: r1W, r1W });

  it('behält die Kennzahlen der vorigen Statistik statt sie mit leeren Daten zu überschreiben', () => {
    const vorher = statistikBerechnen([], [eintrag(1, 5), eintrag(2, -2), eintrag(3, 8)], 's1');
    expect(vorher.kandidaten.gesamt.eintraege).toBe(3);
    const ohne = statistikBerechnen([], [], 's2', {}, { schattenbuchAus: vorher });
    expect(ohne.kandidaten).toEqual(vorher.kandidaten);
    expect(ohne.stand).toBe('s2');
    // ohne vorige Statistik wird ehrlich leer gerechnet
    expect(statistikBerechnen([], [], 's3', {}, { schattenbuchAus: null }).kandidaten.gesamt.eintraege).toBe(0);
  });
});
