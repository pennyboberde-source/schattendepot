import { describe, expect, it } from 'vitest';
import gebuehrenDatei from '../config/gebuehren.json';
import spreadDatei from '../config/spreads.json';
import steuerDatei from '../config/steuern.json';
import { ableiten, ordersAusEreignissen } from './ableiten.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import { termineIcs } from './ics.ts';
import { pushGekauft, zustellen } from './push.ts';
import type { SpreadConfig } from './spreads.ts';
import type { SteuerConfig } from './steuern.ts';
import type { Ereignis, Kurs, Order, OrderPlan } from './typen.ts';
import { pushesFuerEreignisse, waechterLauf, type WaechterKontext } from './waechter.ts';

const cfg = {
  gebuehren: gebuehrenDatei as unknown as GebuehrenConfig,
  spreads: spreadDatei as unknown as SpreadConfig,
  einstellungen: { orderBetrag: 1000, hebelMax: 10, haltedauerMinMinuten: 15, ereignisSchwelleProzent: 5, ereignisLaeufeProTag: 1, ausfallWarnungUhrzeit: '10:00' },
};
const steuern = steuerDatei as unknown as SteuerConfig;

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
  zielNettoProzent: 5,
  stopProzent: -3,
  verkaufstermin: '2026-10-29T15:00:00Z',
  risiken: [],
  einflussLektionen: '',
  ...extra,
});

const vormerkung = (id: string, zeit: string, p = plan()): Ereignis => ({
  id: `${zeit}-vorgemerkt-${id}`,
  zeit,
  typ: 'vorgemerkt',
  quelle: 'morgenlauf',
  orderId: id,
  daten: { plan: p, verkaufstermin: p.verkaufstermin },
});

const kurs = (wert: number, zeit: string, vortag?: number): Kurs => ({ wert, zeit, quelle: 'test', vortag });

function lauf(ereignisse: Ereignis[], jetzt: string, basisKurse: Record<string, Kurs>, heute: Partial<WaechterKontext['heute']> = {}) {
  return waechterLauf({
    jetzt: new Date(jetzt),
    orders: ordersAusEreignissen(ereignisse),
    basisKurse,
    cfg,
    heute: { ereignisLaeufe: 0, ereignislaufOrders: [], ausfallWarnung: false, vorgemerkt: true, ...heute },
  });
}

// Mittwoch, 21.10.2026: 07:35 Berlin = 05:35 UTC (Sommerzeit bis 25.10.)
const VORGEMERKT = '2026-10-21T05:35:00Z';

describe('Ausführung ohne Rückschaufehler', () => {
  it('kauft erst mit einem Kurs, der nach der Vormerkung entstand, zum Briefkurs', () => {
    const ev = [vormerkung('a', VORGEMERKT)];
    // Kurs von vor der Entscheidung → kein Kauf
    expect(lauf(ev, '2026-10-21T06:00:00Z', { a: kurs(100, '2026-10-21T05:30:00Z') }).ereignisse).toEqual([]);
    // Vor Handelsbeginn (07:45 Berlin) → kein Kauf, obwohl neuer Kurs
    expect(lauf(ev, '2026-10-21T05:45:00Z', { a: kurs(100, '2026-10-21T05:40:00Z') }).ereignisse).toEqual([]);
    // 08:00 Berlin mit neuem Kurs → Kauf zum Brief (100 + 0,04 %) = 100,04 → 9 Stück
    const r = lauf(ev, '2026-10-21T06:00:00Z', { a: kurs(100, '2026-10-21T05:59:00Z') });
    expect(r.ereignisse).toHaveLength(1);
    const d = r.ereignisse[0].daten as { kauf: { stueck: number; kurs: number; betrag: number }; zielkurs: number; stopkurs: number };
    expect(r.ereignisse[0].typ).toBe('gekauft');
    expect(d.kauf).toMatchObject({ stueck: 9, kurs: 100.04, betrag: 911.26 });
    expect(d.stopkurs).toBe(97.04);
    expect(d.zielkurs).toBeGreaterThan(100.04 * 1.05);
  });

  it('verwirft, wenn ein Stück mehr als 1.000 € kostet oder nach 26 h kein Kurs kam', () => {
    const ev = [vormerkung('a', VORGEMERKT)];
    const teuer = lauf(ev, '2026-10-21T06:00:00Z', { a: kurs(1500, '2026-10-21T05:59:00Z') });
    expect(teuer.ereignisse[0]).toMatchObject({ typ: 'verworfen' });
    // EU-Wert (nur Tagesschlusskurs): Frist 64 h statt 26 h
    expect(lauf(ev, '2026-10-22T08:00:00Z', {}).ereignisse).toEqual([]);
    expect(lauf(ev, '2026-10-23T22:00:00Z', {}).ereignisse[0]).toMatchObject({ typ: 'verworfen', daten: { grund: 'kein Kurs verfügbar' } });
    // US-Wert: Frist 26 h
    const us = plan({ wertpapier: { ...plan().wertpapier, kursbasis: { markt: 'us', symbol: 'TST', waehrung: 'USD' } } });
    const alt = lauf([vormerkung('u', VORGEMERKT, us)], '2026-10-22T08:00:00Z', {});
    expect(alt.ereignisse[0]).toMatchObject({ typ: 'verworfen', daten: { grund: 'kein Kurs verfügbar' } });
  });
});

describe('Verkaufsregeln', () => {
  const gekauft = (() => {
    const ev = [vormerkung('a', VORGEMERKT)];
    return [...ev, ...lauf(ev, '2026-10-21T06:00:00Z', { a: kurs(100, '2026-10-21T05:59:00Z') }).ereignisse];
  })();

  it('Stop zum Geldkurs, auch bei Kurslücke (kein Wunschkurs)', () => {
    const r = lauf(gekauft, '2026-10-21T08:00:00Z', { a: kurs(95, '2026-10-21T07:59:00Z') });
    expect(r.ereignisse[0]).toMatchObject({ typ: 'verkauft', daten: { verkauf: { grund: 'stop', kurs: 94.962 } } });
  });

  it('Ziel erreicht', () => {
    const r = lauf(gekauft, '2026-10-21T08:00:00Z', { a: kurs(110, '2026-10-21T07:59:00Z') });
    expect(r.ereignisse[0]).toMatchObject({ typ: 'verkauft', daten: { verkauf: { grund: 'ziel' } } });
  });

  it('keine Verkaufsprüfung vor Ablauf der Mindesthaltedauer', () => {
    const r = lauf(gekauft, '2026-10-21T06:10:00Z', { a: kurs(110, '2026-10-21T06:09:00Z') });
    expect(r.ereignisse).toEqual([]);
    expect(r.kurse.a.wert).toBe(110);
  });

  it('Verkaufstermin erreicht → Verkauf, aber nur in der Handelszeit', () => {
    expect(lauf(gekauft, '2026-10-29T22:00:00Z', { a: kurs(101, '2026-10-29T21:59:00Z') }).ereignisse).toEqual([]); // 23:00 Berlin
    const r = lauf(gekauft, '2026-10-30T07:00:00Z', { a: kurs(101, '2026-10-30T06:59:00Z') }); // 08:00 Berlin (Winterzeit)
    expect(r.ereignisse[0]).toMatchObject({ typ: 'verkauft', daten: { verkauf: { grund: 'termin' } } });
  });

  it('Kursausschlag ≥ 5 % löst einen Ereignislauf aus – höchstens einen pro Tag', () => {
    const r = lauf(gekauft, '2026-10-21T08:00:00Z', { a: kurs(102, '2026-10-21T07:59:00Z', 96) });
    expect(r.ereignislauf?.orderId).toBe('a');
    const zweiter = lauf(gekauft, '2026-10-21T08:15:00Z', { a: kurs(102, '2026-10-21T08:14:00Z', 96) }, { ereignisLaeufe: 1 });
    expect(zweiter.ereignislauf).toBeUndefined();
  });
});

describe('Knock-out', () => {
  it('Berührung der Schwelle = Totalverlust, ohne Verkaufsgebühr', () => {
    const p = plan({
      wertpapier: { name: 'Turbo Long', isin: 'DE000TURBO01', anlageklasse: 'hebel', spreadKlasse: 'hebel', handelsplatz: 'TGT', steuertopf: 'sonstige' },
      hebel: { typ: 'knockout', richtung: 'long', emittent: 'Bank', basiswert: { name: 'Basis', kursbasis: { markt: 'eu', symbol: 'B.DE', waehrung: 'EUR' } }, basispreis: 90, koSchwelle: 90, bezugsverhaeltnis: 0.1 },
    });
    const ev = [vormerkung('k', VORGEMERKT, p)];
    const kauf = lauf(ev, '2026-10-21T06:00:00Z', { k: kurs(100, '2026-10-21T05:59:00Z') });
    expect(kauf.ereignisse[0].typ).toBe('gekauft');
    const alle = [...ev, ...kauf.ereignisse];
    const ko = lauf(alle, '2026-10-21T06:05:00Z', { k: kurs(89.5, '2026-10-21T06:04:00Z') });
    expect(ko.ereignisse[0]).toMatchObject({ typ: 'verkauft', daten: { verkauf: { grund: 'knockout', kurs: 0, betrag: 0 } } });
  });

  it('Hebel über dem Limit wird nicht gekauft', () => {
    const p = plan({
      wertpapier: { name: 'Turbo', isin: 'DE000TURBO02', anlageklasse: 'hebel', spreadKlasse: 'hebel', handelsplatz: 'TGT', steuertopf: 'sonstige' },
      hebel: { typ: 'knockout', richtung: 'long', emittent: 'Bank', basiswert: { name: 'Basis', kursbasis: { markt: 'eu', symbol: 'B.DE', waehrung: 'EUR' } }, basispreis: 95, koSchwelle: 95, bezugsverhaeltnis: 0.1 },
    });
    const r = lauf([vormerkung('k', VORGEMERKT, p)], '2026-10-21T06:00:00Z', { k: kurs(100, '2026-10-21T05:59:00Z') });
    expect(r.ereignisse[0]).toMatchObject({ typ: 'verworfen' });
  });
});

describe('ETF-Vergleich', () => {
  it('ETF-Kurs beim Kauf gemerkt, beim Verkauf Vergleich mit gleichen Gebühren', () => {
    const ev = [vormerkung('a', VORGEMERKT)];
    const ctx = (jetzt: string, basis: Kurs, etf: number): WaechterKontext => ({
      jetzt: new Date(jetzt),
      orders: ordersAusEreignissen(alle),
      basisKurse: { a: basis },
      etfKurs: { wert: etf, zeit: jetzt, quelle: 'test' },
      cfg,
      heute: { ereignisLaeufe: 0, ereignislaufOrders: [], ausfallWarnung: false, vorgemerkt: true },
    });
    let alle = ev;
    const k = waechterLauf(ctx('2026-10-21T06:00:00Z', kurs(100, '2026-10-21T05:59:00Z'), 110)).ereignisse;
    expect((k[0].daten as { etf: Kurs }).etf.wert).toBe(110);
    alle = [...ev, ...k];
    const v = waechterLauf(ctx('2026-10-21T08:00:00Z', kurs(110, '2026-10-21T07:59:00Z'), 112)).ereignisse;
    expect(v.map((e) => e.typ)).toEqual(['verkauft', 'etfVergleich']);
    const etf = v[1].daten as { netto: number; nettoProzent: number };
    // 9 Stück zu 110,066 € (Brief) = 990,59 € → Verkauf zu 111,933 € (Geld) = 1.007,40 €; je Seite 10,90 € Gebühren
    expect(etf.netto).toBe(-4.99);
    const a = ableiten([...alle, ...v], {}, { steuern, gebuehren: cfg.gebuehren, spreads: cfg.spreads }, 's');
    expect(a.kennzahlen.etfNetto).toBe(-4.99);
  });
});

describe('Ausfallsicherung', () => {
  it('ab 10:00 ohne Vormerkung genau eine Warnung', () => {
    const r = lauf([], '2026-10-21T08:00:00Z', {}, { vorgemerkt: false });
    expect(r.ereignisse[0]).toMatchObject({ typ: 'warnung', daten: { art: 'ausfall' } });
    expect(lauf([], '2026-10-21T07:59:00Z', {}, { vorgemerkt: false }).ereignisse).toEqual([]);
    expect(lauf([], '2026-10-21T08:15:00Z', {}, { vorgemerkt: false, ausfallWarnung: true }).ereignisse).toEqual([]);
    expect(lauf([], '2026-10-24T08:00:00Z', {}, { vorgemerkt: false }).ereignisse).toEqual([]); // Samstag
  });
});

describe('Ableitung, Push-Texte, Kalender', () => {
  const ev = [vormerkung('a', VORGEMERKT)];
  const k = lauf(ev, '2026-10-21T06:00:00Z', { a: kurs(100, '2026-10-21T05:59:00Z') }).ereignisse;
  const v = lauf([...ev, ...k], '2026-10-21T08:00:00Z', { a: kurs(110, '2026-10-21T07:59:00Z') }).ereignisse;

  it('Ereignisse → abgeschlossene Order mit Steuern und Kennzahlen', () => {
    const a = ableiten([...ev, ...k, ...v], {}, { steuern, gebuehren: cfg.gebuehren, spreads: cfg.spreads }, 'stand');
    expect(a.kennzahlen.anzahlGeschlossen).toBe(1);
    const o = a.abgeschlossen.orders[0];
    expect(o.ergebnis!.netto).toBeGreaterThan(0);
    expect(o.ergebnis!.steuer).toBeCloseTo(o.ergebnis!.netto * 0.26375, 1);
    expect(a.kennzahlen.trefferquote).toBe(100);
    expect(a.kennzahlen.kurve.length).toBe(2);
  });

  it('Kauf-Push mit Erfolgschance', () => {
    const orders = ordersAusEreignissen([...ev, ...k]);
    const p = pushesFuerEreignisse(k, orders);
    expect(p[0].titel).toBe('🟢 Gekauft: Test AG');
    expect(p[0].text.replace(/ /g, ' ')).toBe('9 Stk. à 100,04 € · Ziel +5,0 % nach Gebühren bis Do 29.10. · Stop −3,0 % · Chance ~60 %');
    const kalibriert = pushGekauft(orders[0], 'x', { quote: 52, faelle: 12 });
    expect(kalibriert.text).toContain('Chance ~60 % (bisher 52 % Treffer)');
  });

  it('Ruhezeit hält zurück, danach Sammelnachricht ab 4 Stück', () => {
    const n = { typ: 'gekauft' as const, titel: 't', text: 'x', ziel: '#', erstellt: 'x' };
    const e = { ruhezeit: { von: '22:30', bis: '07:00' }, pushTypen: { gekauft: true, bericht: false } };
    const nachts = zustellen([n, n], [], new Date('2026-10-21T21:00:00Z'), e);
    expect(nachts).toEqual({ senden: [], warteschlange: [n, n] });
    const morgens = zustellen([n, n], nachts.warteschlange, new Date('2026-10-22T05:30:00Z'), e);
    expect(morgens.senden).toHaveLength(1);
    expect(morgens.senden[0].titel).toBe('📬 4 Nachrichten');
    expect(zustellen([{ ...n, typ: 'bericht' }], [], new Date('2026-10-22T10:00:00Z'), e).senden).toEqual([]);
  });

  it('Kalender-Abo enthält offene Orders mit stabiler UID', () => {
    const orders: Order[] = ordersAusEreignissen([...ev, ...k]);
    const ics = termineIcs(orders, '2026-10-21T06:00:00Z', 'https://example.org/app/');
    expect(ics).toContain('UID:a@schattendepot');
    expect(ics).toContain('DTSTART:20261029T150000Z');
    expect(ics).toContain('SUMMARY:Verkauf geplant: Test AG');
    expect(ics.split('\r\n').every((z) => Buffer.byteLength(z, 'utf8') <= 75)).toBe(true);
  });
});
