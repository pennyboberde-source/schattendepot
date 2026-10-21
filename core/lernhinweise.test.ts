import { describe, expect, it } from 'vitest';
import { lernhinweise, wirksamesRisikoBudget } from './lernhinweise.ts';
import { statistikBerechnen } from './statistik.ts';
import type { Order } from './typen.ts';

function order(id: string, konfidenz: number, nettoProzent: number, extra: Partial<Order['plan']> = {}, grund: 'ziel' | 'stop' | 'termin' = 'ziel'): Order {
  const kaufZeit = '2026-10-01T08:00:00Z';
  const netto = (nettoProzent / 100) * 1000;
  return {
    id,
    status: 'geschlossen',
    vorgemerktUm: kaufZeit,
    vorgemerktVon: 'morgenlauf',
    plan: { wertpapier: { name: id, isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien' }, strategie: 'insider_kauf', these: '', ausloeser: '', signalIds: [], quellen: [], konfidenz, pflichtOrder: false, erwarteteRenditeNetto: 3, zielNettoProzent: 5, stopProzent: -3, verkaufstermin: kaufZeit, risiken: [], einflussLektionen: '', ...extra },
    verkaufstermin: kaufZeit,
    kauf: { zeit: kaufZeit, stueck: 10, kurs: 100, kurswert: 1000, entgelt: { provision: 9.95, handelsplatz: 0.95, gesamt: 10.9 }, betrag: 1000, kursquelle: 't', synthetisch: false },
    verkauf: { zeit: '2026-10-03T08:00:00Z', stueck: 10, kurs: 101, kurswert: 1010, entgelt: { provision: 9.95, handelsplatz: 0.95, gesamt: 10.9 }, betrag: 1000 + netto, kursquelle: 't', synthetisch: false, grund },
    anpassungen: [],
    ergebnis: { kursProzent: 1, netto, nettoProzent, gebuehren: 21.8, steuer: 0, nachSteuern: netto },
  };
}

const basis = { maxSpekulativJeLauf: 1, maxAnteilSpekulativ: 0.3, stopMinProzent: -25, mindestKursEuro: 0.01 };

describe('Lern-Hinweise ohne menschliches Urteil', () => {
  it('zu optimistische Konfidenz und zu viele Stops werden erkannt', () => {
    const orders = Array.from({ length: 10 }, (_, i) => order(`o${i}`, 85, i < 4 ? 3 : -2, {}, i < 4 ? 'ziel' : 'stop'));
    const h = lernhinweise(statistikBerechnen(orders, [], 's'));
    expect(h.some((x) => x.startsWith('Konfidenz 80–100 % zu optimistisch'))).toBe(true);
    expect(h.some((x) => x.includes('der Verkäufe waren Stops'))).toBe(true);
    expect(h.some((x) => x.startsWith('Erwartete Renditen zu hoch angesetzt'))).toBe(true);
  });
  it('ohne genug Fälle keine voreiligen Schlüsse', () => {
    expect(lernhinweise(statistikBerechnen([order('a', 85, -5, {}, 'stop')], [], 's'))).toEqual([]);
  });
});

describe('Mitlernendes Risiko-Budget', () => {
  const mix = (spekNetto: number) => [
    ...Array.from({ length: 10 }, (_, i) => order(`s${i}`, 30, spekNetto, { risikoklasse: 'spekulativ' })),
    ...Array.from({ length: 10 }, (_, i) => order(`n${i}`, 60, 1)),
  ];
  it('wächst, wenn Spekulation besser ist (Leitplanke 50 %, 2 je Lauf)', () => {
    const b = wirksamesRisikoBudget(basis, statistikBerechnen(mix(6), [], 's'));
    expect(b).toMatchObject({ maxSpekulativJeLauf: 2, maxAnteilSpekulativ: 0.45 });
  });
  it('schrumpft, wenn Spekulation verliert (Leitplanke 10 %)', () => {
    const b = wirksamesRisikoBudget(basis, statistikBerechnen(mix(-8), [], 's'));
    expect(b).toMatchObject({ maxSpekulativJeLauf: 1, maxAnteilSpekulativ: 0.15 });
  });
  it('unter 10 spekulativen Orders bleibt die Grundeinstellung', () => {
    expect(wirksamesRisikoBudget(basis, statistikBerechnen([order('x', 30, 50, { risikoklasse: 'spekulativ' })], [], 's'))).toMatchObject({ maxAnteilSpekulativ: 0.3 });
  });
});
