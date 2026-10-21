import { describe, expect, it } from 'vitest';
import cfgDatei from '../config/steuern.json';
import { berlinJahr, steuernBerechnen, steuersatz, type SteuerConfig, type SteuerFall } from './steuern.ts';

const cfg = cfgDatei as unknown as SteuerConfig;
const fall = (id: string, zeit: string, ergebnis: number, topf: SteuerFall['topf'] = 'aktien', tfs?: number): SteuerFall => ({
  id,
  zeit,
  ergebnis,
  topf,
  teilfreistellung: tfs,
});

describe('Steuersatz', () => {
  it('Abgeltungsteuer + Soli = 26,375 %', () => {
    expect(steuersatz(cfg)).toBeCloseTo(0.26375, 10);
  });
  it('mit 9 % Kirchensteuer ≈ 27,99 %', () => {
    expect(steuersatz({ ...cfg, kirchensteuer: 0.09 })).toBeCloseTo(0.279951, 5);
  });
});

describe('Verlustverrechnung', () => {
  it('einfacher Gewinn wird mit 26,375 % besteuert', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', 100)], cfg);
    expect(r.proFall.a).toEqual({ steuer: 26.38, nachSteuern: 73.62 });
  });

  it('späterer Aktienverlust erstattet bereits gezahlte Steuer', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', 100), fall('b', '2026-10-22T10:00:00Z', -40)], cfg);
    expect(r.proFall.b.steuer).toBe(-10.55);
    expect(r.proFall.b.nachSteuern).toBe(-29.45);
    expect(r.jahre[0].steuer).toBe(15.83);
  });

  it('Aktienverluste mindern keine sonstigen Gewinne', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', -100), fall('b', '2026-10-22T10:00:00Z', 100, 'sonstige')], cfg);
    expect(r.proFall.a.steuer).toBe(0);
    expect(r.proFall.b.steuer).toBe(26.38);
    expect(r.jahre[0].vortragAktien).toBe(-100);
  });

  it('sonstige Verluste mindern Aktiengewinne', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', -100, 'sonstige'), fall('b', '2026-10-22T10:00:00Z', 150)], cfg);
    expect(r.proFall.b.steuer).toBe(13.19);
  });

  it('Verlustvortrag ins nächste Jahr', () => {
    const r = steuernBerechnen([fall('a', '2026-12-30T10:00:00Z', -80), fall('b', '2027-01-05T10:00:00Z', 100)], cfg);
    expect(r.proFall.b.steuer).toBe(5.28);
    expect(r.jahre.map((j) => j.jahr)).toEqual([2026, 2027]);
  });

  it('Teilfreistellung 30 % bei Aktien-ETFs', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', 100, 'sonstige', 0.3)], cfg);
    expect(r.proFall.a.steuer).toBe(18.46);
  });

  it('Sparerpauschbetrag wird zuerst verbraucht', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', 100), fall('b', '2026-10-22T10:00:00Z', 100)], {
      ...cfg,
      sparerpauschbetrag: 150,
    });
    expect(r.proFall.a.steuer).toBe(0);
    expect(r.proFall.b.steuer).toBe(13.19);
  });

  it('Steuern aus → nach Steuern = Ergebnis', () => {
    const r = steuernBerechnen([fall('a', '2026-10-21T10:00:00Z', 100)], { ...cfg, aktiv: false });
    expect(r.proFall.a).toEqual({ steuer: 0, nachSteuern: 100 });
  });

  it('Jahreswechsel nach Berliner Zeit', () => {
    expect(berlinJahr('2026-12-31T23:30:00Z')).toBe(2027);
  });
});
