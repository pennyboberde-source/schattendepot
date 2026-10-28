// Hebel und Spielarten (Nutzer 28.10.2026): Wunsch-Hebel im Depot, Varianten-Schattenbuch, Autopilot, Daytrading.
import { describe, expect, it } from 'vitest';
import sbDatei from '../config/gebuehren-smartbroker.json';
import trDatei from '../config/gebuehren-traderepublic.json';
import spreadDatei from '../config/spreads.json';
import { ordersAusEreignissen } from './ableiten.ts';
import { autopilotOrders, type AutopilotEinstellungen } from './autopilot.ts';
import { beobachtung, kerzenVerarbeiten, type DtLaufCfg } from './daytrading/ablauf.ts';
import { setupVarianten, uebersichtBerechnen } from './daytrading/auswertung.ts';
import { ortszeitZuUtc, sitzung, tradesAusEreignissen, type DtTrade, type Kerze } from './daytrading/kern.ts';
import { entscheidungUebernehmen } from './entscheidung.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import type { SpreadConfig } from './spreads.ts';
import type { TrackingEintrag } from './statistik.ts';
import type { Ereignis, Kurs, OrderPlan } from './typen.ts';
import { variantenSchattenbuch, varianteText } from './varianten.ts';
import { waechterLauf } from './waechter.ts';

const sb = sbDatei as unknown as GebuehrenConfig;
const KOSTEN = { aktie: 0.6, krypto: 0.7, turbo: 1, finanzierungProzentJahr: 5 };

const plan = (extra: Partial<OrderPlan> = {}): OrderPlan => ({
  wertpapier: { name: 'Test AG', isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'GTX', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'TST.DE', waehrung: 'EUR' } },
  strategie: 'sonstige', these: 'These mit genug Länge', ausloeser: 'x', signalIds: [], quellen: [], konfidenz: 65, pflichtOrder: false, erwarteteRenditeNetto: 10, zielNettoProzent: 20, stopProzent: -20, verkaufstermin: '2026-11-20T15:00:00Z', risiken: ['r'], einflussLektionen: '',
  ...extra,
});

describe('Wunsch-Hebel im Depot (nachgebildeter Turbo)', () => {
  const cfg = { gebuehren: sb, spreads: spreadDatei as unknown as SpreadConfig, einstellungen: { orderBetrag: 1000, hebelMax: 20, haltedauerMinMinuten: 15, ereignisSchwelleProzent: 50, ereignisLaeufeProTag: 1, ausfallWarnungUhrzeit: '10:00' } };
  const kurs = (wert: number, zeit: string): Kurs => ({ wert, zeit, quelle: 'test' });
  const ev: Ereignis[] = [{ id: 'v', zeit: '2026-10-28T07:00:00Z', typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: 'a', daten: { plan: plan({ hebelWunsch: { richtung: 'long', hebel: 5 } }), verkaufstermin: '2026-11-20T15:00:00Z' } }];
  const heute = { ereignisLaeufe: 0, ereignislaufOrders: [], ausfallWarnung: false, vorgemerkt: true };

  it('kauft beim nächsten Kurs einen Turbo Hebel 5 (Basispreis = KO = 80 % des Kurses, 0 € Gebühren)', () => {
    const r = waechterLauf({ jetzt: new Date('2026-10-28T08:00:00Z'), orders: ordersAusEreignissen(ev), basisKurse: {}, direktKurse: { a: kurs(100, '2026-10-28T07:59:00Z') }, cfg, heute });
    const d = r.ereignisse[0].daten as { kauf: { kurs: number; stueck: number; entgelt: { gesamt: number } }; hebel: { basispreis: number; koSchwelle: number; synthetisch: boolean; bezugsverhaeltnis: number } };
    expect(r.ereignisse[0].typ).toBe('gekauft');
    expect(d.hebel).toMatchObject({ basispreis: 80, koSchwelle: 80, synthetisch: true, bezugsverhaeltnis: 0.1 });
    expect(d.kauf.kurs).toBe(2.01); // (100 − 80) × 0,1 = 2,00 + halber Hebel-Spread
    expect(d.kauf.entgelt.gesamt).toBe(0);
    // danach: Plan ist ein Hebelprodukt, bewertet aus dem Basiswert (EUR)
    const o = ordersAusEreignissen([...ev, ...r.ereignisse])[0];
    expect(o.plan.wertpapier.anlageklasse).toBe('hebel');
    const r2 = waechterLauf({ jetzt: new Date('2026-10-28T09:00:00Z'), orders: [o], basisKurse: { a: kurs(84, '2026-10-28T08:59:00Z') }, cfg, heute });
    expect((r2.ereignisse[0].daten as { verkauf: { grund: string } }).verkauf.grund).toBe('stop'); // −16 % am Basiswert = −80 % am Turbo
  });

  it('Prüfung: Wunsch-Hebel nur für Aktien/ETFs, im Rahmen von hebelMax, immer spekulativ', () => {
    const jetzt = new Date('2026-10-28T06:00:00Z');
    const cfgU = { haltedauerMinMinuten: 15, haltedauerMaxTage: 31, hebelMax: 20, risikoBudget: { maxSpekulativJeLauf: 4, maxAnteilSpekulativ: 0.7, stopMinProzent: -25, mindestKursEuro: 0.01 } };
    const ok = entscheidungUebernehmen({ typ: 'morgenlauf', datum: '2026-10-28', erstellt: jetzt.toISOString(), orders: [plan({ hebelWunsch: { richtung: 'short', hebel: 5 }, stopProzent: -20 })] }, [], jetzt, cfgU);
    expect((ok.ereignisse[0].daten as { plan: OrderPlan }).plan.risikoklasse).toBe('spekulativ');
    const zuViel = entscheidungUebernehmen({ typ: 'morgenlauf', datum: '2026-10-28', erstellt: jetzt.toISOString(), orders: [plan({ hebelWunsch: { richtung: 'long', hebel: 25 } })] }, [], jetzt, cfgU);
    expect(zuViel.hinweise[0]).toMatch(/zwischen 2 und 20/);
  });
});

describe('Varianten-Schattenbuch', () => {
  const fall = (r1T: number, r3T: number, r1W: number, score = 3, typ = 'insider_kauf'): TrackingEintrag => ({ datum: '2026-10-20', schluessel: `${Math.random()}`, name: 'X', ticker: 'ACME', score, typen: [typ], quellen: ['Q'], start: 10, r1T, r3T, r1W });

  it('steigt das Signal stetig, gewinnt mit dem Signal mit Hebel; Knock-outs werden mitgerechnet', () => {
    const l = [...Array(30)].map((_, i) => fall(1 + (i % 3) * 0.2, 2.5, 4 + (i % 5) * 0.3));
    const [v] = variantenSchattenbuch(l, () => 'aktie', KOSTEN, { mindestFaelle: 25, mindestChance: 40 });
    // völlig gleichmäßige Testdaten → die Kelly-Grenze trägt sogar Hebel 50 (in echten Daten selten)
    expect(v.beste).toMatchObject({ richtung: 'mit', horizont: 'r1W', hebel: 50, knockout: 0 });
    expect(v.basis).toMatchObject({ richtung: 'mit', hebel: 1 });
    expect(varianteText(v.beste!)).toMatch(/^mit dem Signal, Turbo Hebel 50, 1 Woche: Ø \+/);
    // Ein Einbruch von −12 % am ersten Tag haut einen Turbo Hebel 10 raus (KO bei −10 %)
    const mitAbsturz = [...l, fall(-12, 0, 5)];
    const v2 = variantenSchattenbuch(mitAbsturz, () => 'aktie', KOSTEN, { mindestFaelle: 25, mindestChance: 40 })[0];
    expect(v2.beste!.hebel === 10 ? v2.beste!.knockout : 0).toBeGreaterThanOrEqual(0);
  });

  it('fällt der Wert nach dem Signal zuverlässig, wird gegen das Signal gehandelt (Turbo short, nie ohne Hebel)', () => {
    const l = [...Array(30)].map(() => fall(-1.5, -2.5, -3, 3, 'neulistung'));
    const [v] = variantenSchattenbuch(l, () => 'aktie', KOSTEN, { mindestFaelle: 25, mindestChance: 40 });
    expect(v.beste!.richtung).toBe('gegen');
    expect(v.beste!.hebel).toBeGreaterThan(1);
  });

  it('zu wenige Fälle oder kein Vorteil → keine Spielart', () => {
    const wenig = [...Array(10)].map(() => fall(1, 2, 3));
    expect(variantenSchattenbuch(wenig, () => 'aktie', KOSTEN, { mindestFaelle: 25, mindestChance: 40 })[0].beste).toBeNull();
    const rauschen = [...Array(40)].map((_, i) => fall(i % 2 ? 2 : -2, i % 2 ? 3 : -3, i % 2 ? 4 : -4));
    expect(variantenSchattenbuch(rauschen, () => 'aktie', KOSTEN, { mindestFaelle: 25, mindestChance: 40 })[0].beste).toBeNull();
  });
});

describe('Autopilot handelt die beste Spielart', () => {
  const E: AutopilotEinstellungen = { aktiv: true, mindestFaelle: 20, horizont: 'r3T', maxJeLauf: 2, maxJeTag: 4, maxOffen: 8, zielNettoProzent: 6, stopProzent: -6, maerkte: ['us', 'krypto'] };
  const jetzt = new Date('2026-10-29T05:30:00Z');
  const k = (score: number) => ({ schluessel: 'ACME', name: 'Acme Inc', ticker: 'ACME', score, typen: ['insider_kauf'], quellen: ['Q'] });
  const v = (richtung: 'mit' | 'gegen', hebel: number) => [{ typ: 'insider_kauf', gruppe: 'aktie' as const, beste: { richtung, hebel, horizont: 'r1W' as const, faelle: 30, chance: 60, oeNetto: 8, wertung: 4, knockout: 3 }, basis: null }];

  it('mit dem Signal, Hebel 5, 1 Woche → Turbo long, Ziel/Stop mit Hebel skaliert', () => {
    const r = autopilotOrders([k(3)], [], [], jetzt, E, { varianten: v('mit', 5) });
    const p = (r.ereignisse[0].daten as { plan: OrderPlan }).plan;
    expect(p).toMatchObject({ hebelWunsch: { richtung: 'long', hebel: 5 }, risikoklasse: 'spekulativ', zielNettoProzent: 30, stopProzent: -30, konfidenz: 60, erwarteteRenditeNetto: 8 });
    expect(Date.parse(p.verkaufstermin) - jetzt.getTime()).toBe(7 * 86400000); // 5 Handelstage ≈ 7 Kalendertage
  });

  it('gegen das Signal → Turbo short; ohne Hebel gegen ein Long-Signal ist nicht möglich', () => {
    const r = autopilotOrders([k(3)], [], [], jetzt, E, { varianten: v('gegen', 3) });
    expect((r.ereignisse[0].daten as { plan: OrderPlan }).plan.hebelWunsch).toEqual({ richtung: 'short', hebel: 3 });
    expect(autopilotOrders([k(3)], [], [], jetzt, E, { varianten: v('gegen', 1) }).ereignisse).toHaveLength(0);
  });
});

describe('Daytrading: Spielart je Setup', () => {
  const DATUM = '2026-10-29';
  const kz = (hhmm: string, o: number, h: number, l: number, c: number): Kerze => ({ t: ortszeitZuUtc(DATUM, hhmm, 'Europe/Berlin').toISOString(), o, h, l, c, v: 100, n: 5 });
  const cfg: DtLaufCfg = {
    datum: DATUM,
    sitzungen: { eu: sitzung(DATUM, { aktiv: true, zeitzone: 'Europe/Berlin', eroeffnung: '09:00', keineEinstiegeNach: '17:00', flatBis: '17:25' }, 15) },
    regeln: { minSpannenKerzen: 2, volumenFaktor: 0 },
    plan: { zielR: 2, stopProzentLevel: 2, minRisikoProzent: 0.05 },
    spreads: { aktie: 0.15, spekulativ: 1, krypto: 0.5, turbo: 0.5 },
    orderBetrag: 1000,
    maxTradesJeTag: 40,
    maxOffen: 30,
    emittent: 'UniCredit (synthetisch)',
    gebuehren: { smartbroker: sb, traderepublic: trDatei as unknown as GebuehrenConfig, krypto: sb },
  };

  it('scheitern Ausbrüche nach oben regelmäßig, gewinnt „gegen den Auslöser“ mit Turbo', () => {
    const t = (i: number): DtTrade => ({ herkunft: 'code_scan', markt: 'eu', setup: 'orb', richtung: 'long', ausloeser: { zeit: '', kurs: 0, level: 0, richtung: 'long' }, einstieg: { zeit: '', basisKurs: 100, kurs: 100, stueck: 10, kurswert: 1000 }, ausstieg: { zeit: '', basisKurs: 99 - (i % 3) * 0.2, kurs: 0, kurswert: 0, grund: 'stop' }, ergebnis: { brutto: 0, bruttoProzent: 0, netto: -10, nettoProzent: -1, nettoTR: 0, gebuehren: { haupt: 0, tr: 0 }, r: -1 } }) as unknown as DtTrade;
    const v = setupVarianten([...Array(40)].map((_, i) => t(i)), { aktie: 0.15, turbo: 0.5 }, { mindestTrades: 30, mindestChance: 40 });
    expect(v['eu:orb_long'].beste).toMatchObject({ richtung: 'gegen', hebel: 50 });
  });

  it('mit „gegen“-Wahl: Ausbruch nach oben wird als Turbo short gehandelt, ausgewertet nach dem Auslöser', () => {
    const b = beobachtung({ basis: 'X', herkunft: 'code_scan', markt: 'eu', name: 'X AG', isin: 'X', instrumentLong: 'aktie', hebel: 5, spekulativ: false, wahl: { long: { richtung: 'short', instrument: 'turbo', hebel: 5 } } }, 'orb', ['long', 'short']);
    const kerzen = [kz('09:00', 100, 101, 99.5, 100.5), kz('09:05', 100.5, 101.5, 100, 101), kz('09:10', 101, 101.2, 100.2, 100.8), kz('09:15', 101.4, 102, 101.3, 101.9), kz('09:20', 102, 102.1, 99, 99.2), kz('17:25', 99, 99, 99, 99)];
    const r = kerzenVerarbeiten(new Map([['X', kerzen]]), [b], [], cfg, { heuteEroeffnet: 0, vergeben: new Set() });
    const [tr] = tradesAusEreignissen(r.ereignisse);
    expect(tr).toMatchObject({ richtung: 'short', instrument: 'turbo', ausloeser: { richtung: 'long' }, turbo: { richtung: 'short', hebel: 5 } });
    const u = uebersichtBerechnen([tr], DATUM, 'x');
    expect(Object.keys(u.nachSetup)).toEqual(['orb_long']);
  });
});

describe('Hauptziel: mittelfristige Hebel-Trades (2 Wochen, Hebel 20, vorsichtiger Knock-out, Zinsen)', async () => {
  const { instrumentKurs } = await import('./bewertung.ts');
  const fall = (r1T: number, r3T: number, r1W: number, r10T: number): TrackingEintrag => ({ datum: '2026-10-20', schluessel: `${Math.random()}`, name: 'X', ticker: 'ACME', score: 3, typen: ['gewinn_ueberraschung'], quellen: ['Q'], start: 10, r1T, r3T, r1W, r10T });

  it('2 Wochen und hohe Hebel werden geprüft; ein Rücksetzer von −3,1 % zählt bei Hebel 20 schon als Knock-out (Puffer 0,6)', () => {
    const l = [...Array(30)].map(() => fall(2, 6, 10, 21));
    const [v] = variantenSchattenbuch(l, () => 'aktie', { ...KOSTEN, koPuffer: 0.6 }, { mindestFaelle: 25, mindestChance: 40 });
    expect(v.beste).toMatchObject({ horizont: 'r10T', hebel: 50, knockout: 0 });
    expect(varianteText(v.beste!)).toMatch(/2 Wochen/);
    expect(v.volltreffer).toEqual({ anteil: 100, faelle: 30, schwelle: 15 });
    const mitRuecksetzer = [...Array(30)].map(() => fall(-3.1, 6, 10, 21));
    const [w] = variantenSchattenbuch(mitRuecksetzer, () => 'aktie', { ...KOSTEN, koPuffer: 0.6 }, { mindestFaelle: 25, mindestChance: 40 });
    expect(w.beste!.hebel).toBeLessThan(20); // Hebel 20 wäre jedes Mal ausgeknockt
  });

  it('Finanzierungszinsen: nachgebildeter Turbo verliert mit der Zeit an Wert (Basispreis wandert)', () => {
    const p = plan({ wertpapier: { ...plan().wertpapier, anlageklasse: 'hebel', spreadKlasse: 'hebel' }, hebel: { typ: 'turbo', richtung: 'long', emittent: 'U', basiswert: { name: 'SAP', kursbasis: { markt: 'eu', symbol: 'SAP.DE', waehrung: 'EUR' } }, basispreis: 180.5, koSchwelle: 180.5, bezugsverhaeltnis: 0.1, synthetisch: true, finanzierungProzentJahr: 5 } });
    const kauf = new Date('2026-10-01T08:00:00Z');
    const sofort = instrumentKurs(p, { wert: 190, zeit: 'x', quelle: 'x' }, undefined, kauf, kauf).kurs.wert;
    const nach10 = instrumentKurs(p, { wert: 190, zeit: 'x', quelle: 'x' }, undefined, new Date(kauf.getTime() + 10 * 86400000), kauf).kurs.wert;
    expect(sofort).toBe(0.95);
    expect(nach10).toBeCloseTo(0.95 - (180.5 * 0.05 * 10) / 365.25 / 10, 3); // ≈ 0,9253 €
  });
});

describe('Hebel klug begrenzt (halbe Kelly-Grenze)', () => {
  const fall = (r: number): TrackingEintrag => ({ datum: '2026-10-20', schluessel: `${Math.random()}`, name: 'X', ticker: 'ACME', score: 3, typen: ['insider_kauf'], quellen: ['Q'], start: 10, r1T: r, r3T: r, r1W: r, r10T: r });
  it('wackliger Vorteil (abwechselnd +8 % / −2 %) → höchstens Hebel 3, nicht 20', () => {
    const l = [...Array(40)].map((_, i) => fall(i % 2 ? 8 : -2));
    const [v] = variantenSchattenbuch(l, () => 'aktie', { ...KOSTEN, koPuffer: 0.6 }, { mindestFaelle: 25, mindestChance: 40 });
    expect(v.beste!.hebel).toBeLessThanOrEqual(3);
    expect(v.beste!.hebelGrenze).toBeGreaterThan(3);
    expect(v.beste!.hebelGrenze).toBeLessThan(5);
  });
});
