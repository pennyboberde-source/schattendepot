// Plattformwahl für Depot-Orders (17.11.2026): gettex → andere deutsche Börse → US-Broker → nicht handelbar.
import { describe, expect, it } from 'vitest';
import sbDatei from '../config/gebuehren-smartbroker.json';
import spreadDatei from '../config/spreads.json';
import { gebuehrenUmrechnen, ordersAusEreignissen } from './ableiten.ts';
import { orderentgelt, type GebuehrenConfig } from './gebuehren.ts';
import { depotPlattform, hebelJeKuerzel } from './plattform.ts';
import type { SpreadConfig } from './spreads.ts';
import type { Ereignis, Kurs, OrderPlan } from './typen.ts';
import type { HebelStand } from './volltreffer/firds.ts';
import { waechterLauf } from './waechter.ts';

const sb = sbDatei as unknown as GebuehrenConfig;
const plan = (extra: Partial<OrderPlan> = {}, wp: Partial<OrderPlan['wertpapier']> = {}): OrderPlan => ({
  wertpapier: { name: 'Acme Inc', isin: 'US0000000001', ticker: 'ACME', anlageklasse: 'aktie', spreadKlasse: 'aktie_neben', handelsplatz: 'GTX', steuertopf: 'aktien', kursbasis: { markt: 'us', symbol: 'ACME', waehrung: 'USD' }, ...wp },
  strategie: 'sonstige', these: 'These mit genug Länge', ausloeser: 'x', signalIds: [], quellen: [], konfidenz: 65, pflichtOrder: false, erwarteteRenditeNetto: 10, zielNettoProzent: 20, stopProzent: -20, verkaufstermin: '2026-11-20T15:00:00Z', risiken: ['r'], einflussLektionen: '',
  ...extra,
});
const je = (st: Record<string, HebelStand>) => new Map(Object.entries(st));

describe('Plattformwahl Depot', () => {
  it('Wunsch-Hebel: gettex → andere Börse → US-Broker bis Hebel 2 → nicht handelbar', () => {
    const long = (h: number) => plan({ hebelWunsch: { richtung: 'long', hebel: h } });
    const short = (h: number) => plan({ hebelWunsch: { richtung: 'short', hebel: h } });
    expect(depotPlattform(long(5), je({ ACME: { l: [3, 1], s: [0, 0] } }), 2)).toMatchObject({ art: 'platz', platz: 'gettex', handelsplatz: 'GTX' });
    expect(depotPlattform(short(5), je({ ACME: { l: [3, 1], s: [0, 4] } }), 2)).toMatchObject({ art: 'platz', platz: 'boerse', handelsplatz: 'SBX' });
    expect(depotPlattform(short(2), je({ ACME: { l: [3, 1], s: [0, 0] } }), 2)).toMatchObject({ art: 'platz', platz: 'us', handelsplatz: 'USB' });
    // Nutzer 17.11.: lieber kaufen und als ungeprüft vermerken – CFD-Stufe statt verwerfen
    expect(depotPlattform(short(5), je({}), 2)).toMatchObject({ art: 'platz', platz: 'cfd', handelsplatz: 'CFD', ungeprueft: true });
    expect((depotPlattform(short(5), je({}), 2) as { grund: string }).grund).toMatch(/Privatkunde bis 5:1.*NICHT geprüft/);
    expect((depotPlattform(long(10), je({}), 2) as { grund: string }).grund).toMatch(/Profikunde bis 20:1/);
    expect((depotPlattform(long(50), je({}), 2) as { grund: string }).grund).toMatch(/unrealistisch/);
    // ohne frische Liste, Krypto, EU-Werte: unverändert
    expect(depotPlattform(short(5), null, 2)).toEqual({ art: 'unveraendert' });
    expect(depotPlattform(plan({ hebelWunsch: { richtung: 'long', hebel: 5 } }, { kursbasis: { markt: 'eu', symbol: 'SAP.DE', waehrung: 'EUR' } }), je({}), 2)).toEqual({ art: 'unveraendert' });
    expect(depotPlattform(plan({}, { anlageklasse: 'krypto', handelsplatz: 'TRK', kursbasis: { markt: 'krypto', symbol: 'BTC', waehrung: 'EUR' } }), je({}), 2)).toEqual({ art: 'unveraendert' });
  });

  it('Direktkauf: US-Aktie ohne ISIN → Smartbroker+ an der US-Börse, mit ISIN unverändert', () => {
    expect(depotPlattform(plan({}, { isin: '' }), null, 2)).toMatchObject({ art: 'platz', platz: 'ausland', handelsplatz: 'USA' });
    expect(depotPlattform(plan(), null, 2)).toEqual({ art: 'unveraendert' });
  });

  it('Gebühren je Plattform', () => {
    expect(orderentgelt(1000, sb, { handelsplatz: 'GTX' }).gesamt).toBe(0);
    expect(orderentgelt(1000, sb, { handelsplatz: 'SBX', emittent: 'Vontobel' }).gesamt).toBe(5.5);
    expect(orderentgelt(1000, sb, { handelsplatz: 'USA' }).gesamt).toBe(6.5);
    expect(orderentgelt(1000, sb, { handelsplatz: 'USB' }).gesamt).toBe(3);
    expect(orderentgelt(1000, sb, { handelsplatz: 'CFD' }).gesamt).toBe(1);
  });

  it('FIRDS-Liste je Kürzel: zusammengeführt, frisch und vollständig', () => {
    const liste = { quelle: '2026-11-14', basiswerte: { US1: { l: [1, 0], s: [0, 2] } as HebelStand, US2: { l: [0, 1], s: [1, 0] } as HebelStand } };
    const r = hebelJeKuerzel(liste, { US1: 'ACME', US2: 'ACME' }, '2026-11-17', { maxAlterTage: 21, mindestZugeordnet: 0.9 });
    expect(r.vollstaendig).toBe(true);
    expect(r.je.get('ACME')).toEqual({ l: [1, 1], s: [1, 2] });
    expect(hebelJeKuerzel(liste, { US1: 'ACME' }, '2026-11-17', { maxAlterTage: 21, mindestZugeordnet: 0.9 }).vollstaendig).toBe(false);
    expect(hebelJeKuerzel(liste, { US1: 'ACME', US2: null }, '2026-12-17', { maxAlterTage: 21, mindestZugeordnet: 0.9 }).vollstaendig).toBe(false);
  });

  it('Kurswächter kauft über die gewählte Plattform, Gebühren bleiben beim Ableiten', () => {
    const cfg = { gebuehren: sb, spreads: spreadDatei as unknown as SpreadConfig, einstellungen: { orderBetrag: 1000, hebelMax: 20, haltedauerMinMinuten: 15, ereignisSchwelleProzent: 50, ereignisLaeufeProTag: 1, ausfallWarnungUhrzeit: '10:00' } };
    const kurs = (wert: number, zeit: string): Kurs => ({ wert, zeit, quelle: 'test' });
    const heute = { ereignisLaeufe: 0, ereignislaufOrders: [], ausfallWarnung: false, vorgemerkt: true };
    const vor = (p: OrderPlan): Ereignis[] => [{ id: 'v', zeit: '2026-11-17T14:00:00Z', typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: 'a', daten: { plan: p, verkaufstermin: '2026-11-20T15:00:00Z' } }];
    const lauf = (ev: Ereignis[], st: Map<string, HebelStand>) =>
      waechterLauf({ jetzt: new Date('2026-11-17T15:00:00Z'), orders: ordersAusEreignissen(ev), basisKurse: { a: kurs(100, '2026-11-17T14:59:00Z') }, eurUsd: 1, cfg, heute, hebelJe: st, usMaxHebel: 2 });

    const evShort = vor(plan({ hebelWunsch: { richtung: 'short', hebel: 5 } }));
    const r = lauf(evShort, je({ ACME: { l: [1, 0], s: [0, 3] } }));
    expect(r.hinweise).toEqual([]);
    expect(r.ereignisse[0].typ).toBe("gekauft");
    const d = r.ereignisse[0].daten as { handelsplatz: string; plattform: string; kauf: { entgelt: { gesamt: number } } };
    expect(d.handelsplatz).toBe('SBX');
    expect(d.plattform).toMatch(/anderer deutscher Börse/);
    expect(d.kauf.entgelt.gesamt).toBe(5.5);
    const o = gebuehrenUmrechnen(ordersAusEreignissen([...evShort, ...r.ereignisse]), sb)[0];
    expect(o.plan.wertpapier.handelsplatz).toBe('SBX');
    expect(o.kauf!.entgelt.gesamt).toBe(5.5);

    const evCfd = vor(plan({ hebelWunsch: { richtung: 'short', hebel: 5 } }));
    const cfd = lauf(evCfd, je({}));
    expect(cfd.ereignisse[0]).toMatchObject({ typ: 'gekauft', daten: { handelsplatz: 'CFD', ungeprueft: true } });
    const oc = ordersAusEreignissen([...evCfd, ...cfd.ereignisse])[0];
    expect(oc.plan.wertpapier).toMatchObject({ handelsplatz: 'CFD', handelbarkeitUngeprueft: true });
    expect(oc.plan.wertpapier.plattform).toMatch(/^⚠️ CFD-Broker/);
  });
});
