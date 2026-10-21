import { describe, expect, it } from 'vitest';
import gebuehrenDatei from '../config/gebuehren.json';
import spreadDatei from '../config/spreads.json';
import { euro, prozent } from './geld.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import { ergebnis, kaufen, stueckFuerBetrag, verkaufen, zielkurs } from './rendite.ts';
import { geldBrief, type SpreadConfig } from './spreads.ts';

const cfg = gebuehrenDatei as unknown as GebuehrenConfig;
const spreads = spreadDatei as unknown as SpreadConfig;

describe('Stückzahl', () => {
  it('ganze Stücke, Kurswert ≤ 1.000 €', () => {
    expect(stueckFuerBetrag(238.1, 1000)).toBe(4);
    expect(stueckFuerBetrag(0.1, 1000)).toBe(10000);
    expect(stueckFuerBetrag(1200, 1000)).toBe(0);
  });
});

describe('Kauf, Verkauf, Ergebnis', () => {
  it('Beispiel SAP: 4 Stk. à 238,10 €, Verkauf zu 251,00 €', () => {
    const k = kaufen(4, 238.1, cfg);
    expect(k).toMatchObject({ kurswert: 952.4, betrag: 963.3 });
    const v = verkaufen(4, 251, cfg);
    expect(v).toMatchObject({ kurswert: 1004, betrag: 993.1 });
    const e = ergebnis(k, v);
    expect(e.netto).toBe(29.8);
    expect(e.nettoProzent).toBe(3.09);
    expect(e.kursProzent).toBe(5.42);
    expect(e.gebuehren).toBe(21.8);
  });

  it('Knock-out ohne Restwert: Totalverlust, keine Verkaufsgebühr', () => {
    const k = kaufen(500, 1.9, cfg);
    const v = verkaufen(500, 0, cfg);
    expect(v.betrag).toBe(0);
    expect(ergebnis(k, v).netto).toBe(-k.betrag);
  });
});

describe('Zielkurs nach Gebühren', () => {
  it('Gewinnschwelle und +5 % netto werden exakt erreicht', () => {
    const k = kaufen(4, 238.1, cfg);
    for (const ziel of [0, 5]) {
      const z = zielkurs(k, ziel, cfg);
      const soll = k.betrag * (1 + ziel / 100);
      expect(verkaufen(4, z, cfg).betrag).toBeGreaterThanOrEqual(soll - 1e-9);
      expect(verkaufen(4, z - 0.01, cfg).betrag).toBeLessThan(soll);
    }
    // Gewinnschwelle SAP-Beispiel: (963,30 + 10,90) / 4 = 243,55
    expect(zielkurs(k, 0, cfg)).toBe(243.55);
  });
});

describe('Geld-/Briefkurs', () => {
  it('echter Geld-/Briefkurs hat Vorrang', () => {
    expect(geldBrief({ wert: 100, geld: 99.9, brief: 100.1 }, 'aktie_dax', spreads)).toEqual({ geld: 99.9, brief: 100.1, synthetisch: false });
  });
  it('synthetisch aus Mittelkurs und Spread der Klasse', () => {
    expect(geldBrief({ wert: 100 }, 'aktie_dax', spreads)).toEqual({ geld: 99.96, brief: 100.04, synthetisch: true });
    expect(geldBrief({ wert: 2 }, 'hebel', spreads)).toEqual({ geld: 1.99, brief: 2.01, synthetisch: true });
  });
});

describe('Formatierung', () => {
  it('deutsches Format mit geschütztem Leerzeichen', () => {
    const n = (s: string) => s.replace(/ /g, ' ');
    expect(n(euro(1234.5))).toBe('1.234,50 €');
    expect(n(euro(29.86, { vorzeichen: true }))).toBe('+29,86 €');
    expect(n(euro(-3))).toBe('−3,00 €');
    expect(n(euro(0.5312))).toBe('0,5312 €');
    expect(n(prozent(5.4))).toBe('+5,4 %');
    expect(n(prozent(-3))).toBe('−3,0 %');
  });
});
