// Depot auf Smartbroker+ (Nutzer 28.10.2026): alles wie über gettex gerechnet, auch rückwirkend.
import { describe, expect, it } from 'vitest';
import consorsDatei from '../config/gebuehren.json';
import sbDatei from '../config/gebuehren-smartbroker.json';
import spreadDatei from '../config/spreads.json';
import steuerDatei from '../config/steuern.json';
import { ableiten } from './ableiten.ts';
import { orderentgelt, type GebuehrenConfig } from './gebuehren.ts';
import { ergebnis, kaufen, verkaufen } from './rendite.ts';
import type { SpreadConfig } from './spreads.ts';
import type { SteuerConfig } from './steuern.ts';
import type { Ereignis, OrderPlan } from './typen.ts';

const sb = sbDatei as unknown as GebuehrenConfig;
const consors = consorsDatei as unknown as GebuehrenConfig;

describe('Smartbroker+ als Depot-Modell', () => {
  it('0 € ab 500 € über gettex, auch für Tradegate-Orders; darunter 1 €; Krypto 1 €', () => {
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT' }).gesamt).toBe(0);
    expect(orderentgelt(400, sb, { handelsplatz: 'TGT' }).gesamt).toBe(1);
    expect(orderentgelt(1000, sb, { handelsplatz: 'TRK' }).gesamt).toBe(1);
    // Consorsbank bleibt streng: unbekannter Handelsplatz ist ein Fehler
    expect(() => orderentgelt(1000, consors, { handelsplatz: 'XYZ' })).toThrow(/Handelsplatz/);
  });

  it('Hebelprodukte: UniCredit/HVB 0 €, andere Emittenten 4 €', () => {
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT', emittent: 'UniCredit onemarkets' }).gesamt).toBe(0);
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT', emittent: 'Société Générale' }).gesamt).toBe(4);
  });

  it('rechnet eine mit Consorsbank gebuchte Order rückwirkend um (Protokoll bleibt unverändert)', () => {
    const plan = {
      wertpapier: { name: 'Alt AG', isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'ALT.DE', waehrung: 'EUR' } },
      strategie: 'sonstige', these: 'x', ausloeser: 'x', signalIds: [], quellen: [], konfidenz: 50, pflichtOrder: false, erwarteteRenditeNetto: 3, zielNettoProzent: 5, stopProzent: -5, verkaufstermin: '2026-10-30T15:00:00Z', risiken: [], einflussLektionen: '',
    } as OrderPlan;
    const k = kaufen(10, 100, consors, { handelsplatz: 'TGT' });
    const v = verkaufen(10, 103, consors, { handelsplatz: 'TGT' });
    const ausf = (s: typeof k, zeit: string) => ({ zeit, stueck: s.stueck, kurs: s.kurs, kurswert: s.kurswert, entgelt: s.entgelt, betrag: s.betrag, kursquelle: 't', synthetisch: false });
    const ev: Ereignis[] = [
      { id: '1', zeit: '2026-10-20T07:00:00Z', typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: 'a', daten: { plan, verkaufstermin: plan.verkaufstermin } },
      { id: '2', zeit: '2026-10-20T08:00:00Z', typ: 'gekauft', quelle: 'waechter', orderId: 'a', daten: { kauf: ausf(k, '2026-10-20T08:00:00Z'), zielkurs: 106, stopkurs: 95 } },
      { id: '3', zeit: '2026-10-22T08:00:00Z', typ: 'verkauft', quelle: 'waechter', orderId: 'a', daten: { verkauf: { ...ausf(v, '2026-10-22T08:00:00Z'), grund: 'ziel' }, ergebnis: ergebnis(k, v) } },
      { id: '4', zeit: '2026-10-22T08:00:00Z', typ: 'etfVergleich', quelle: 'waechter', orderId: 'a', daten: { netto: -20, nettoProzent: -2, etfKauf: 100, etfVerkauf: 101 } },
    ];
    expect(ergebnis(k, v).netto).toBe(8.2); // gebucht bei Consorsbank: 30 € Kursgewinn − 21,80 € Gebühren
    const cfg = { steuern: steuerDatei as unknown as SteuerConfig, spreads: spreadDatei as unknown as SpreadConfig, einstellungen: { orderBetrag: 1000 } };
    const sbAb = ableiten(ev, {}, { ...cfg, gebuehren: sb }, 'x');
    const o = sbAb.abgeschlossen.orders[0];
    expect(o.kauf!.entgelt.gesamt).toBe(0);
    expect(o.verkauf!.entgelt.gesamt).toBe(0);
    expect(o.ergebnis).toMatchObject({ netto: 30, gebuehren: 0, nettoProzent: 3, kursProzent: 3 });
    expect(sbAb.kennzahlen.netto).toBe(30);
    // ETF-Vergleich mit denselben (Smartbroker-)Gebühren neu gerechnet
    expect(o.etfVergleich!.netto).toBeGreaterThan(-20);
    // mit dem alten Modell ergibt sich die ursprüngliche Buchung
    expect(ableiten(ev, {}, { ...cfg, gebuehren: consors }, 'x').kennzahlen.netto).toBe(8.2);
  });
});
