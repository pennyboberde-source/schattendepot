// S2: schlaue Verkaufsregeln im Wächter und Krypto direkt rund um die Uhr.
import { describe, expect, it } from 'vitest';
import gebuehrenDatei from '../config/gebuehren.json';
import spreadDatei from '../config/spreads.json';
import steuerDatei from '../config/steuern.json';
import { ableiten, ordersAusEreignissen, restStueck } from './ableiten.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import type { SpreadConfig } from './spreads.ts';
import type { SteuerConfig } from './steuern.ts';
import type { Ereignis, Kurs, OrderPlan } from './typen.ts';
import { pushesFuerEreignisse, waechterLauf, type Gegensignal, type Verkaufsregeln, type WaechterKontext } from './waechter.ts';

const REGELN: Verkaufsregeln = {
  nachziehenderStop: { aktivAbProzent: 4, abstandProzent: 5, aktivAbHebelProzent: 10, abstandHebelProzent: 12 },
  teilverkauf: { beiZielAnteil: 0.5, anteil: 0.5, mindestKurswert: 300 },
  gegensignal: true,
  zeitAusstieg: { nachTagen: 6, spekulativNachTagen: 2, bandProzent: 2 },
};
const cfg = {
  gebuehren: gebuehrenDatei as unknown as GebuehrenConfig,
  spreads: spreadDatei as unknown as SpreadConfig,
  einstellungen: { orderBetrag: 1000, hebelMax: 20, haltedauerMinMinuten: 15, ereignisSchwelleProzent: 50, ereignisLaeufeProTag: 1, ausfallWarnungUhrzeit: '10:00', verkaufsregeln: REGELN },
};

const plan = (extra: Partial<OrderPlan> = {}): OrderPlan => ({
  wertpapier: { name: 'Test AG', isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'TST.DE', waehrung: 'EUR' } },
  strategie: 'insider_kauf',
  these: 'These',
  ausloeser: 'Auslöser',
  signalIds: [],
  quellen: [],
  konfidenz: 60,
  pflichtOrder: false,
  erwarteteRenditeNetto: 3,
  zielNettoProzent: 10,
  stopProzent: -5,
  verkaufstermin: '2026-11-20T15:00:00Z',
  risiken: [],
  einflussLektionen: '',
  ...extra,
});

const BTC = plan({
  wertpapier: { name: 'Bitcoin', isin: '', ticker: 'BTC', anlageklasse: 'krypto', spreadKlasse: 'krypto', handelsplatz: 'TRK', steuertopf: 'sonstige', kursbasis: { markt: 'krypto', symbol: 'BTC', waehrung: 'EUR' } },
});

const kurs = (wert: number, zeit: string): Kurs => ({ wert, zeit, quelle: 'test' });

function vorgemerkt(id: string, zeit: string, p = plan()): Ereignis {
  return { id: `${zeit}-vorgemerkt-${id}`, zeit, typ: 'vorgemerkt', quelle: 'morgenlauf', orderId: id, daten: { plan: p, verkaufstermin: p.verkaufstermin } };
}

function lauf(ev: Ereignis[], jetzt: string, basis: Record<string, Kurs>, extra: Partial<WaechterKontext> = {}) {
  return waechterLauf({
    jetzt: new Date(jetzt),
    orders: ordersAusEreignissen(ev),
    basisKurse: basis,
    cfg,
    heute: { ereignisLaeufe: 0, ereignislaufOrders: [], ausfallWarnung: false, vorgemerkt: true },
    ...extra,
  });
}

/** Kauft Test AG zu 100 € Mittelkurs (Brief 100,04) am Mi 28.10.2026 09:00 Berlin. */
function gekauft(p = plan()): Ereignis[] {
  const ev = [vorgemerkt('a', '2026-10-28T07:00:00Z', p)];
  const r = lauf(ev, '2026-10-28T08:00:00Z', { a: kurs(100, '2026-10-28T07:59:00Z') });
  expect(r.ereignisse[0].typ).toBe('gekauft');
  return [...ev, ...r.ereignisse];
}

describe('Nachziehender Stop', () => {
  it('zieht den Stop ab +4 % nach, nur nach oben, und verkauft dann als „nachziehstop“', () => {
    let ev = gekauft();
    const r1 = lauf(ev, '2026-10-28T09:00:00Z', { a: kurs(106, '2026-10-28T08:59:00Z') });
    const anp = r1.ereignisse.find((e) => e.typ === 'angepasst')!;
    expect(anp).toBeDefined();
    expect((anp.daten as { anpassung: { neu: number; quelle: string } }).anpassung).toMatchObject({ quelle: 'waechter', neu: 100.66 });
    ev = [...ev, ...r1.ereignisse];
    // leicht fallend → Stop bleibt, keine neue Anpassung
    const r2 = lauf(ev, '2026-10-28T09:15:00Z', { a: kurs(105, '2026-10-28T09:14:00Z') });
    expect(r2.ereignisse).toEqual([]);
    // unter den nachgezogenen Stop → Verkauf mit Grund nachziehstop
    const r3 = lauf(ev, '2026-10-28T09:30:00Z', { a: kurs(100.5, '2026-10-28T09:29:00Z') });
    expect(r3.ereignisse[0].typ).toBe('verkauft');
    expect((r3.ereignisse[0].daten as { verkauf: { grund: string } }).verkauf.grund).toBe('nachziehstop');
  });

  it('sendet für automatische Stop-Anpassungen keinen Push', () => {
    const ev = gekauft();
    const r = lauf(ev, '2026-10-28T09:00:00Z', { a: kurs(106, '2026-10-28T08:59:00Z') });
    const orders = ordersAusEreignissen([...ev, ...r.ereignisse]);
    expect(pushesFuerEreignisse(r.ereignisse, orders)).toEqual([]);
  });
});

describe('Teilverkauf am 1. Ziel', () => {
  it('verkauft die Hälfte bei halbem Weg zum Ziel, setzt den Stop auf Einstand und rechnet das Ergebnis zusammen', () => {
    let ev = gekauft();
    const o = ordersAusEreignissen(ev)[0];
    const halbweg = o.kauf!.kurs + 0.5 * (o.zielkurs! - o.kauf!.kurs);
    const r1 = lauf(ev, '2026-10-29T09:00:00Z', { a: kurs(halbweg + 0.2, '2026-10-29T08:59:00Z') });
    const typen = r1.ereignisse.map((e) => e.typ);
    expect(typen).toContain('teilverkauft');
    expect(typen).toContain('angepasst');
    const pushes = pushesFuerEreignisse(r1.ereignisse, ordersAusEreignissen([...ev, ...r1.ereignisse]));
    expect(pushes.map((p) => p.titel)).toEqual(['💰 Teilverkauf: Test AG']);
    ev = [...ev, ...r1.ereignisse];
    const offen = ordersAusEreignissen(ev)[0];
    expect(offen.status).toBe('offen');
    expect(offen.teilverkaeufe).toHaveLength(1);
    expect(restStueck(offen)).toBe(o.kauf!.stueck - offen.teilverkaeufe![0].stueck);
    expect(offen.stopkurs).toBeGreaterThanOrEqual(o.kauf!.kurs);
    // kein zweiter Teilverkauf
    const r2 = lauf(ev, '2026-10-29T09:15:00Z', { a: kurs(halbweg + 0.3, '2026-10-29T09:14:00Z') });
    expect(r2.ereignisse.some((e) => e.typ === 'teilverkauft')).toBe(false);
    // Rest fällt auf Einstand → verkauft, Ergebnis über beide Verkäufe
    ev = [...ev, ...r2.ereignisse];
    const r3 = lauf(ev, '2026-10-29T10:00:00Z', { a: kurs(99, '2026-10-29T09:59:00Z') });
    const vk = r3.ereignisse.find((e) => e.typ === 'verkauft')!;
    const d = vk.daten as { verkauf: { stueck: number; grund: string }; ergebnis: { netto: number } };
    expect(d.verkauf.stueck).toBe(restStueck(offen));
    expect(d.verkauf.grund).toBe('nachziehstop');
    const zu = ordersAusEreignissen([...ev, ...r3.ereignisse])[0];
    const erloes = zu.teilverkaeufe![0].betrag + zu.verkauf!.betrag;
    expect(d.ergebnis.netto).toBeCloseTo(erloes - zu.kauf!.betrag, 2);
    // Ableitung: unrealisiert berücksichtigt den Teilverkauf, abgeschlossen enthält ihn
    const a = ableiten([...ev, ...r3.ereignisse], {}, { steuern: steuerDatei as unknown as SteuerConfig, gebuehren: cfg.gebuehren, spreads: cfg.spreads }, 'x');
    expect(a.abgeschlossen.orders[0].teilverkaeufe).toHaveLength(1);
  });
});

describe('Starkes Gegensignal', () => {
  const gegen = (erkannt: string, typ = 'shortreport'): Record<string, Gegensignal> => ({ a: { typ, zeit: erkannt, erkannt, text: 'Short-Report von XY' } });

  it('verkauft sofort – aber nur zu einem Kurs nach dem Erkennen', () => {
    const ev = gekauft();
    // Kurs älter als das Erkennen → warten
    expect(lauf(ev, '2026-10-28T08:20:00Z', { a: kurs(99.5, '2026-10-28T08:05:00Z') }, { gegensignale: gegen('2026-10-28T08:10:00Z') }).ereignisse).toEqual([]);
    const r = lauf(ev, '2026-10-28T08:20:00Z', { a: kurs(99.5, '2026-10-28T08:15:00Z') }, { gegensignale: gegen('2026-10-28T08:10:00Z') });
    expect((r.ereignisse[0].daten as { verkauf: { grund: string } }).verkauf.grund).toBe('gegensignal');
    expect(pushesFuerEreignisse(r.ereignisse, ordersAusEreignissen([...ev, ...r.ereignisse]))[0].titel).toContain('Gegensignal');
  });

  it('ignoriert Signale vor dem Kauf und Pro-Signale (Prognoseerhöhung bei Long)', () => {
    const ev = gekauft();
    expect(lauf(ev, '2026-10-28T09:00:00Z', { a: kurs(99.5, '2026-10-28T08:59:00Z') }, { gegensignale: gegen('2026-10-28T07:30:00Z') }).ereignisse).toEqual([]);
    expect(lauf(ev, '2026-10-28T09:00:00Z', { a: kurs(99.5, '2026-10-28T08:59:00Z') }, { gegensignale: gegen('2026-10-28T08:30:00Z', 'prognose_erhoehung') }).ereignisse).toEqual([]);
  });
});

describe('Zeit-Ausstieg', () => {
  it('verkauft nach 6 Tagen ohne Bewegung (spekulativ nach 2 Tagen)', () => {
    const ev = gekauft();
    expect(lauf(ev, '2026-11-02T09:00:00Z', { a: kurs(100.5, '2026-11-02T08:59:00Z') }).ereignisse).toEqual([]);
    const r = lauf(ev, '2026-11-03T09:00:00Z', { a: kurs(100.5, '2026-11-03T08:59:00Z') });
    expect((r.ereignisse[0].daten as { verkauf: { grund: string } }).verkauf.grund).toBe('zeit');
    // bewegt (+3 %) → kein Zeit-Ausstieg
    expect(lauf(ev, '2026-11-03T09:00:00Z', { a: kurs(103, '2026-11-03T08:59:00Z') }).ereignisse.some((e) => e.typ === 'verkauft')).toBe(false);
    const spek = gekauft(plan({ risikoklasse: 'spekulativ' }));
    const r2 = lauf(spek, '2026-10-30T09:00:00Z', { a: kurs(100.5, '2026-10-30T08:59:00Z') });
    expect((r2.ereignisse[0].daten as { verkauf: { grund: string } }).verkauf.grund).toBe('zeit');
  });
});

describe('Krypto direkt rund um die Uhr', () => {
  // Sa 31.10.2026 03:00 UTC – Börsen zu
  it('kauft Bruchstücke nachts zum Trade-Republic-Preis (1 € + Spread), Aktien werden übersprungen', () => {
    const ev = [vorgemerkt('btc', '2026-10-31T02:30:00Z', BTC), vorgemerkt('a', '2026-10-31T02:30:00Z')];
    const r = lauf(ev, '2026-10-31T03:00:00Z', { btc: { ...kurs(60000, '2026-10-31T02:59:00Z'), geld: 59990, brief: 60010 }, a: kurs(100, '2026-10-31T02:59:00Z') }, { nurKrypto: true });
    expect(r.ereignisse).toHaveLength(1);
    const d = r.ereignisse[0].daten as { kauf: { stueck: number; kurs: number; entgelt: { gesamt: number; provision: number } } };
    expect(d.kauf.kurs).toBe(60150); // 0,5 % Spread (halb = 0,25 %), nicht der enge Kraken-Brief
    expect(d.kauf.stueck).toBe(0.016625);
    expect(d.kauf.entgelt).toMatchObject({ provision: 0, gesamt: 1 });
  });

  it('verkauft Krypto am Wochenende bei Stop', () => {
    const ev0 = [vorgemerkt('btc', '2026-10-31T02:30:00Z', BTC)];
    const ev = [...ev0, ...lauf(ev0, '2026-10-31T03:00:00Z', { btc: kurs(60000, '2026-10-31T02:59:00Z') }, { nurKrypto: true }).ereignisse];
    const r = lauf(ev, '2026-11-01T12:00:00Z', { btc: kurs(56000, '2026-11-01T11:59:00Z') }, { nurKrypto: true });
    expect(r.ereignisse[0].typ).toBe('verkauft');
    const vk = r.ereignisse[0].daten as { verkauf: { entgelt: { gesamt: number } }; ergebnis: { gebuehren: number } };
    expect(vk.verkauf.entgelt.gesamt).toBe(1);
    expect(vk.ergebnis.gebuehren).toBe(2);
  });
});
