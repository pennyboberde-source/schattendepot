import { describe, expect, it } from 'vitest';
import { etnWert, hebelWert, inEuro, instrumentKurs } from './bewertung.ts';
import type { Hebel, OrderPlan } from './typen.ts';

const daxLong: Hebel = {
  typ: 'knockout',
  richtung: 'long',
  emittent: 'Beispielbank',
  basiswert: { name: 'Beispiel-Index', kursbasis: { markt: 'eu', symbol: 'IDX', waehrung: 'EUR' } },
  basispreis: 20000,
  koSchwelle: 20000,
  bezugsverhaeltnis: 0.01,
};

describe('Knock-out/Turbo', () => {
  it('Long: innerer Wert × Bezugsverhältnis, Hebel', () => {
    const w = hebelWert(daxLong, 22000);
    expect(w).toEqual({ wert: 20, knockout: false, hebel: 11 });
  });
  it('Long: Knock-out bei Berührung der Schwelle → 0', () => {
    expect(hebelWert(daxLong, 20000)).toMatchObject({ wert: 0, knockout: true });
    expect(hebelWert(daxLong, 19950).knockout).toBe(true);
  });
  it('Short spiegelbildlich', () => {
    const s: Hebel = { ...daxLong, richtung: 'short', basispreis: 24000, koSchwelle: 24000 };
    expect(hebelWert(s, 22000)).toMatchObject({ wert: 20, knockout: false });
    expect(hebelWert(s, 24010).knockout).toBe(true);
  });
  it('USD-Basiswert wird in Euro umgerechnet', () => {
    const us: Hebel = { ...daxLong, basiswert: { name: 'US-Aktie', kursbasis: { markt: 'us', symbol: 'XYZ', waehrung: 'USD' } }, basispreis: 100, koSchwelle: 100, bezugsverhaeltnis: 0.1 };
    expect(hebelWert(us, 120, 1.25).wert).toBe(1.6);
    expect(() => hebelWert(us, 120)).toThrow(/Wechselkurs/);
  });
});

describe('Krypto-ETN', () => {
  it('Basiswert × Anteil, abzüglich Kosten pro rata', () => {
    const etn = { basiswert: { markt: 'krypto' as const, symbol: 'BTC', waehrung: 'EUR' as const }, anteilProStueck: 0.001, kostenProzentJahr: 1 };
    const t0 = new Date('2026-01-01T00:00:00Z');
    expect(etnWert(etn, 60000, t0, t0)).toBe(60);
    expect(etnWert(etn, 60000, t0, new Date(t0.getTime() + 365.25 * 86400000))).toBe(59.4);
  });
});

describe('Umrechnung und Instrumentkurs', () => {
  it('USD → EUR inkl. Geld/Brief und Vortag, gekennzeichnet', () => {
    const k = inEuro({ wert: 108, geld: 107.9, brief: 108.1, vortag: 100, zeit: 'x', quelle: 'q' }, 'USD', 1.08);
    expect(k).toMatchObject({ wert: 100, geld: 99.907, brief: 100.093, vortag: 92.593, synthetisch: true });
  });
  it('Aktie mit EUR-Kursbasis bleibt direkt, Tagesveränderung aus Vortag', () => {
    const p = { wertpapier: { name: 'A', kursbasis: { markt: 'eu', symbol: 'A.DE', waehrung: 'EUR' } } } as unknown as OrderPlan;
    const r = instrumentKurs(p, { wert: 105, vortag: 100, zeit: 'x', quelle: 'q' }, undefined, new Date());
    expect(r).toMatchObject({ kurs: { wert: 105 }, knockout: false, tagesProzent: 5 });
  });
});
