import { describe, expect, it } from 'vitest';
import cfgDatei from '../config/gebuehren.json';
import { orderentgelt, type GebuehrenConfig } from './gebuehren.ts';

const cfg = cfgDatei as unknown as GebuehrenConfig;

describe('Orderentgelt Consorsbank (immer Standardpreis)', () => {
  it('Rechenbeispiel aus dem Auftrag: 1.000 € über Tradegate = 9,95 € + 0,95 €', () => {
    const e = orderentgelt(1000, cfg);
    expect(e).toEqual({ provision: 9.95, handelsplatz: 0.95, gesamt: 10.9 });
    // Kauf + Verkauf = 21,80 € = 2,18 % Hürde
    expect(e.gesamt * 2).toBeCloseTo(21.8, 10);
  });

  it('prozentualer Anteil ab 2.000 € über dem Minimum', () => {
    // 4,95 + 0,25 % von 4.000 = 14,95
    expect(orderentgelt(4000, cfg).provision).toBe(14.95);
  });

  it('Maximum 69 € greift bei großen Kurswerten', () => {
    expect(orderentgelt(30000, cfg)).toEqual({ provision: 69, handelsplatz: 0.95, gesamt: 69.95 });
  });

  it('Handelsplatz-Entgelte je Platz', () => {
    expect(orderentgelt(1000, cfg, { handelsplatz: 'GTX' }).gesamt).toBe(11.9);
    expect(orderentgelt(1000, cfg, { handelsplatz: 'FRA' }).gesamt).toBe(12.9);
  });

  it('unbekannter Handelsplatz und Kurswert 0 werfen Fehler', () => {
    expect(() => orderentgelt(1000, cfg, { handelsplatz: 'XYZ' })).toThrow(/Handelsplatz/);
    expect(() => orderentgelt(0, cfg)).toThrow(/positiv/);
  });

  it('keine Stufen, keine Freetrades: jede Order kostet gleich', () => {
    const eins = orderentgelt(1000, cfg);
    for (let i = 0; i < 300; i++) expect(orderentgelt(1000, cfg)).toEqual(eins);
  });
});
