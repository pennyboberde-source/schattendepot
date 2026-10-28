// Depot auf Smartbroker+ (Nutzer 28.10.2026): alles wie über gettex gerechnet, auch rückwirkend.
import { describe, expect, it } from 'vitest';
import prozentDatei from './testdaten/gebuehren-prozentmodell.json';
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
const prozent = prozentDatei as unknown as GebuehrenConfig;

describe('Smartbroker+ als Depot-Modell', () => {
  it('0 € ab 500 € über gettex, auch für Tradegate-Orders; darunter 1 €; Krypto 1 €', () => {
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT' }).gesamt).toBe(0);
    expect(orderentgelt(400, sb, { handelsplatz: 'TGT' }).gesamt).toBe(1);
    expect(orderentgelt(1000, sb, { handelsplatz: 'TRK' }).gesamt).toBe(1);
    // Modelle ohne Fallback bleiben streng: unbekannter Handelsplatz ist ein Fehler
    expect(() => orderentgelt(1000, prozent, { handelsplatz: 'XYZ' })).toThrow(/Handelsplatz/);
  });

  it('Hebelprodukte: UniCredit/HVB 0 €, andere Emittenten 4 €', () => {
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT', emittent: 'UniCredit onemarkets' }).gesamt).toBe(0);
    expect(orderentgelt(1000, sb, { handelsplatz: 'TGT', emittent: 'Société Générale' }).gesamt).toBe(4);
  });

  it('rechnet eine mit einem Prozentmodell gebuchte Order rückwirkend um (Protokoll bleibt unverändert)', () => {
    const plan = {
      wertpapier: { name: 'Alt AG', isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'ALT.DE', waehrung: 'EUR' } },
      strategie: 'sonstige', these: 'x', ausloeser: 'x', signalIds: [], quellen: [], konfidenz: 50, pflichtOrder: false, erwarteteRenditeNetto: 3, zielNettoProzent: 5, stopProzent: -5, verkaufstermin: '2026-10-30T15:00:00Z', risiken: [], einflussLektionen: '',
    } as OrderPlan;
    const k = kaufen(10, 100, prozent, { handelsplatz: 'TGT' });
    const v = verkaufen(10, 103, prozent, { handelsplatz: 'TGT' });
    const ausf = (s: typeof k, zeit: string) => ({ zeit, stueck: s.stueck, kurs: s.kurs, kurswert: s.kurswert, entgelt: s.entgelt, betrag: s.betrag, kursquelle: 't', synthetisch: false });
    const ev: Ereignis[] = [
      { id: '1', zeit: '2026-10-20T07:00:00Z', typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: 'a', daten: { plan, verkaufstermin: plan.verkaufstermin } },
      { id: '2', zeit: '2026-10-20T08:00:00Z', typ: 'gekauft', quelle: 'waechter', orderId: 'a', daten: { kauf: ausf(k, '2026-10-20T08:00:00Z'), zielkurs: 106, stopkurs: 95 } },
      { id: '3', zeit: '2026-10-22T08:00:00Z', typ: 'verkauft', quelle: 'waechter', orderId: 'a', daten: { verkauf: { ...ausf(v, '2026-10-22T08:00:00Z'), grund: 'ziel' }, ergebnis: ergebnis(k, v) } },
      { id: '4', zeit: '2026-10-22T08:00:00Z', typ: 'etfVergleich', quelle: 'waechter', orderId: 'a', daten: { netto: -20, nettoProzent: -2, etfKauf: 100, etfVerkauf: 101 } },
    ];
    expect(ergebnis(k, v).netto).toBe(8.2); // gebucht im Prozentmodell: 30 € Kursgewinn − 21,80 € Gebühren
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
    expect(ableiten(ev, {}, { ...cfg, gebuehren: prozent }, 'x').kennzahlen.netto).toBe(8.2);
  });
});

describe('Alte Berichte einmal neu schreiben (veraltete Gebührenzahlen)', async () => {
  const { entscheidungUebernehmen } = await import('./entscheidung.ts');
  const { ordersAusEreignissen } = await import('./ableiten.ts');
  const plan = { wertpapier: { name: 'Alt AG', isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'GTX', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'ALT.DE', waehrung: 'EUR' } }, strategie: 'sonstige', these: 'x', ausloeser: 'x', signalIds: [], quellen: [], konfidenz: 50, pflichtOrder: false, erwarteteRenditeNetto: 3, zielNettoProzent: 5, stopProzent: -5, verkaufstermin: '2026-10-30T15:00:00Z', risiken: [], einflussLektionen: '' } as OrderPlan;
  const s = kaufen(10, 100, sb);
  const a = { zeit: '2026-10-20T08:00:00Z', stueck: 10, kurs: 100, kurswert: s.kurswert, entgelt: s.entgelt, betrag: s.betrag, kursquelle: 't', synthetisch: false };
  const ev = (berichtZeit: string): Ereignis[] => [
    { id: '1', zeit: '2026-10-20T07:00:00Z', typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: 'a', daten: { plan, verkaufstermin: plan.verkaufstermin } },
    { id: '2', zeit: '2026-10-20T08:00:00Z', typ: 'gekauft', quelle: 'waechter', orderId: 'a', daten: { kauf: a, zielkurs: 106, stopkurs: 95 } },
    { id: '3', zeit: '2026-10-21T08:00:00Z', typ: 'verkauft', quelle: 'waechter', orderId: 'a', daten: { verkauf: { ...a, zeit: '2026-10-21T08:00:00Z', grund: 'ziel' }, ergebnis: { kursProzent: 0, netto: 0, nettoProzent: 0, gebuehren: 0 } } },
    { id: '4', zeit: berichtZeit, typ: 'bericht', quelle: 'abendlauf', orderId: 'a', daten: { text: 'alt', learnings: ['l'] } },
  ];
  const e = (ersetzt?: boolean) => ({ typ: 'abendlauf' as const, datum: '2026-10-29', erstellt: '2026-10-29T21:20:00Z', berichte: [{ orderId: 'a', text: 'neu '.repeat(20), learnings: ['l'], ...(ersetzt ? { ersetzt } : {}) }] });
  const cfg = { haltedauerMinMinuten: 15, haltedauerMaxTage: 31, hebelMax: 20, berichteNeuVor: '2026-10-28T21:30:00Z' };
  it('ersetzt nur Berichte von vor der Umstellung und nur mit ersetzt: true', () => {
    const alt = ordersAusEreignissen(ev('2026-10-27T21:20:00Z'));
    expect(entscheidungUebernehmen(e(true), alt, new Date('2026-10-29T21:25:00Z'), cfg).ereignisse.filter((x) => x.typ === 'bericht')).toHaveLength(1);
    expect(entscheidungUebernehmen(e(), alt, new Date('2026-10-29T21:25:00Z'), cfg).hinweise.join()).toMatch(/existiert bereits/);
    const neu = ordersAusEreignissen(ev('2026-10-29T21:20:00Z'));
    expect(entscheidungUebernehmen(e(true), neu, new Date('2026-10-29T21:25:00Z'), cfg).hinweise.join()).toMatch(/existiert bereits/);
  });
});
