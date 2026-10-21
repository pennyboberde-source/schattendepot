import { describe, expect, it } from 'vitest';
import cfgDatei from '../config/gebuehren.json';
import { orderentgelt, stufeFuer, type GebuehrenConfig } from './gebuehren.ts';

const cfg = cfgDatei as unknown as GebuehrenConfig;
const mitStatus: GebuehrenConfig = { ...cfg, statusSimulation: true };

describe('Orderentgelt Consorsbank (Standard)', () => {
  it('Rechenbeispiel aus dem Auftrag: 1.000 € über Tradegate = 9,95 € + 0,95 €', () => {
    const e = orderentgelt(1000, cfg);
    expect(e).toMatchObject({ provision: 9.95, handelsplatz: 0.95, gesamt: 10.9, stufe: 'Silver', freetrade: false });
    // Kauf + Verkauf = 21,80 € = 2,18 % Hürde
    expect(e.gesamt * 2).toBeCloseTo(21.8, 10);
  });

  it('prozentualer Anteil ab 2.000 € über dem Minimum', () => {
    // 4,95 + 0,25 % von 4.000 = 14,95
    expect(orderentgelt(4000, cfg).provision).toBe(14.95);
  });

  it('Maximum 69 € greift bei großen Kurswerten', () => {
    expect(orderentgelt(30000, cfg)).toMatchObject({ provision: 69, gesamt: 69.95 });
  });

  it('Handelsplatz-Entgelte je Platz', () => {
    expect(orderentgelt(1000, cfg, { handelsplatz: 'GTX' }).gesamt).toBe(11.9);
    expect(orderentgelt(1000, cfg, { handelsplatz: 'FRA' }).gesamt).toBe(12.9);
  });

  it('unbekannter Handelsplatz und Kurswert 0 werfen Fehler', () => {
    expect(() => orderentgelt(1000, cfg, { handelsplatz: 'XYZ' })).toThrow(/Handelsplatz/);
    expect(() => orderentgelt(0, cfg)).toThrow(/positiv/);
  });

  it('ohne Status-Simulation bleibt es immer Silver', () => {
    expect(orderentgelt(1000, cfg, { bisherigeOrdersImJahr: 300 }).stufe).toBe('Silver');
    expect(orderentgelt(1000, cfg, { bisherigeOrdersImJahr: 10 }).freetrade).toBe(false);
  });
});

describe('Status-Simulation', () => {
  it('Gold ab 26 bisherigen Orders: 3,95 € + 0,25 %, mind. 8,95 €', () => {
    expect(stufeFuer(mitStatus, 25).name).toBe('Silver');
    expect(stufeFuer(mitStatus, 26).name).toBe('Gold');
    expect(orderentgelt(1000, mitStatus, { bisherigeOrdersImJahr: 30 })).toMatchObject({ provision: 8.95, gesamt: 9.9 });
    expect(orderentgelt(30000, mitStatus, { bisherigeOrdersImJahr: 30 }).provision).toBe(59);
  });

  it('Freetrade nach der 10., 100. und 250. Order: nur Handelsplatzentgelt', () => {
    for (const n of [10, 100, 250]) {
      expect(orderentgelt(1000, mitStatus, { bisherigeOrdersImJahr: n })).toMatchObject({ provision: 0, gesamt: 0.95, freetrade: true });
    }
    expect(orderentgelt(1000, mitStatus, { bisherigeOrdersImJahr: 11 }).freetrade).toBe(false);
  });

  it('ab Platinum 4 ist Tradegate provisionsfrei, andere Plätze nicht', () => {
    expect(orderentgelt(1000, mitStatus, { bisherigeOrdersImJahr: 3001 })).toMatchObject({ provision: 0, gesamt: 0.95 });
    expect(orderentgelt(1000, mitStatus, { bisherigeOrdersImJahr: 3001, handelsplatz: 'GTX' }).provision).toBe(6.95);
  });
});
