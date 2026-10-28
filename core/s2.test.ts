// S2 „Jederzeit handeln“: Autopilot, Ziel/Stop-Optimierung, Gegensignale, Claude-Orders (Krypto, Gegenprüfung, Tagesprognose).
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import gebuehrenDatei from '../config/gebuehren.json';
import schema from '../schema/entscheidung.schema.json';
import { ordersAusEreignissen } from './ableiten.ts';
import { autopilotOrders, kostenHuerdeProzent, kursbasisAusTicker, signalBeweise, type AutopilotEinstellungen, type AutopilotKandidat } from './autopilot.ts';
import { entscheidungUebernehmen, type Entscheidung } from './entscheidung.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import { gegensignaleFinden, istStarkesGegensignal } from './gegensignal.ts';
import { wirksamesRisikoBudget } from './lernhinweise.ts';
import type { Signal } from './signale.ts';
import { statistikBerechnen, type Statistik, type TrackingEintrag } from './statistik.ts';
import type { Ereignis, Order, OrderPlan } from './typen.ts';
import { simuliereAusstieg, zielStopVorschlaege } from './zielstop.ts';

const gebuehren = gebuehrenDatei as unknown as GebuehrenConfig;
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const pruefe = ajv.compile(schema);

const HUERDEN = { aktie: 2.78, krypto: 0.7 };

function fall(typ: string, r3T: number, extra: Partial<TrackingEintrag> = {}): TrackingEintrag {
  return { datum: '2026-10-20', schluessel: `${typ}-${r3T}-${Math.random()}`, name: 'X', ticker: 'ACME', score: 3, typen: [typ], quellen: ['Q'], start: 10, r3T, ...extra };
}

describe('Kostenhürde', () => {
  it('Consorsbank ≈ 2,2 % hin und zurück, Trade Republic Krypto 0,2 % (+ Spread)', () => {
    expect(kostenHuerdeProzent(1000, gebuehren, 'TGT', 0.6)).toBe(2.78);
    expect(kostenHuerdeProzent(1000, gebuehren, 'TRK', 0.5)).toBe(0.7);
  });
});

describe('Autopilot: Beweis im Schattenbuch', () => {
  const e = { horizont: 'r3T' as const, mindestFaelle: 20, mindestChance: 40 };

  it('bewiesen erst ab Mindestfallzahl, Chance ≥ 40 % nach Gebühren und positivem Erwartungswert', () => {
    // 20 Fälle: 10× +8 %, 10× −1 % → Chance 50 % über Hürde, Ø 3,5 − 2,78 > 0
    const gut = [...Array(10)].map(() => fall('insider_kauf', 8)).concat([...Array(10)].map(() => fall('insider_kauf', -1)));
    const b = signalBeweise(gut, e, HUERDEN);
    expect(b[0]).toMatchObject({ typ: 'insider_kauf', gruppe: 'aktie', faelle: 20, chance: 50, bewiesen: true });
    // 19 Fälle → nicht bewiesen
    expect(signalBeweise(gut.slice(1), e, HUERDEN)[0].bewiesen).toBe(false);
    // im Schnitt positiv, aber nach Gebühren nicht → nicht bewiesen
    const knapp = [...Array(20)].map(() => fall('kursrakete', 2));
    expect(signalBeweise(knapp, e, HUERDEN)[0]).toMatchObject({ chance: 0, bewiesen: false });
  });

  it('zählt nur Long-Fälle ohne Pump-Verdacht und trennt Krypto (niedrigere Hürde)', () => {
    const l = [...Array(20)].map(() => fall('neulistung', 1.5, { ticker: 'PEPE', markt: 'krypto' }));
    l.push(...[...Array(20)].map(() => fall('neulistung', 9, { score: -2 })), ...[...Array(20)].map(() => fall('neulistung', 9, { pump: true })));
    const b = signalBeweise(l, e, HUERDEN);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ gruppe: 'krypto', faelle: 20, bewiesen: true });
  });
});

describe('Autopilot: Vormerkungen', () => {
  const E: AutopilotEinstellungen = { aktiv: true, mindestFaelle: 20, horizont: 'r3T', maxJeLauf: 2, maxJeTag: 4, maxOffen: 8, zielNettoProzent: 6, stopProzent: -6, maerkte: ['us', 'krypto'] };
  const beweise = signalBeweise([...Array(20)].map(() => fall('insider_kauf', 8)).concat([...Array(20)].map(() => fall('neulistung', 3, { ticker: 'SOL', markt: 'krypto' }))), { horizont: 'r3T', mindestFaelle: 20, mindestChance: 40 }, HUERDEN);
  const k = (name: string, ticker: string, typen: string[], extra: Partial<AutopilotKandidat> = {}): AutopilotKandidat => ({ schluessel: ticker, name, ticker, score: 4, typen, quellen: ['OpenInsider'], ...extra });
  const jetzt = new Date('2026-10-29T05:30:00Z');

  it('merkt nur bewiesene Typen vor (Aktie TGT, Krypto direkt TRK), gekennzeichnet als Autopilot', () => {
    const r = autopilotOrders([k('Acme Inc', 'ACME', ['insider_kauf']), k('Foo', 'FOO', ['kursrakete']), k('Solana', 'SOL', ['neulistung'], { markt: 'krypto' })], beweise, [], jetzt, E);
    expect(r.ereignisse).toHaveLength(2);
    const [a, s] = r.ereignisse.map((x) => (x.daten as { plan: OrderPlan }).plan);
    expect(r.ereignisse[0].quelle).toBe('autopilot');
    expect(a).toMatchObject({ herkunft: 'autopilot', konfidenz: 100, strategie: 'insider_kauf', wertpapier: { handelsplatz: 'TGT', anlageklasse: 'aktie', kursbasis: { markt: 'us', symbol: 'ACME' } } });
    expect(s.wertpapier).toMatchObject({ anlageklasse: 'krypto', handelsplatz: 'TRK', isin: '', spreadKlasse: 'krypto' });
    const orders = ordersAusEreignissen(r.ereignisse);
    expect(orders[0].vorgemerktVon).toBe('autopilot');
  });

  it('beachtet Grenzen: je Lauf, bereits gehaltene Werte, Pump, Short-Kandidaten, aus', () => {
    const viele = ['A', 'B', 'C'].map((t) => k(t, t, ['insider_kauf']));
    expect(autopilotOrders(viele, beweise, [], jetzt, E).ereignisse).toHaveLength(2);
    expect(autopilotOrders([k('P', 'P', ['insider_kauf'], { pump: true }), k('S', 'S', ['insider_kauf'], { score: -3 })], beweise, [], jetzt, E).ereignisse).toHaveLength(0);
    expect(autopilotOrders(viele, beweise, [], jetzt, { ...E, aktiv: false }).ereignisse).toHaveLength(0);
    const erste = autopilotOrders([k('Acme Inc', 'ACME', ['insider_kauf'])], beweise, [], jetzt, E).ereignisse;
    const gehalten = ordersAusEreignissen(erste);
    expect(autopilotOrders([k('Acme Inc', 'ACME', ['insider_kauf'])], beweise, gehalten, new Date('2026-10-29T08:00:00Z'), E).ereignisse).toHaveLength(0);
  });

  it('ohne bewiesene Signale: keine Order, Hinweis', () => {
    const r = autopilotOrders([k('Acme Inc', 'ACME', ['insider_kauf'])], [], [], jetzt, E);
    expect(r.ereignisse).toEqual([]);
    expect(r.hinweise[0]).toMatch(/noch kein Signaltyp/);
  });

  it('kursbasisAusTicker erkennt US, EU und Krypto', () => {
    expect(kursbasisAusTicker('aapl')).toEqual({ markt: 'us', symbol: 'AAPL', waehrung: 'USD' });
    expect(kursbasisAusTicker('SAP.DE')?.markt).toBe('eu');
    expect(kursbasisAusTicker('PEPE', 'krypto')?.markt).toBe('krypto');
    expect(kursbasisAusTicker('GOLD', 'rohstoff')).toBeNull();
  });
});

describe('Ziel/Stop je Signaltyp aus dem Schattenbuch', () => {
  it('simuliert den Ausstieg entlang der Messpunkte', () => {
    expect(simuliereAusstieg([2, 6, 1], 5, -5)).toBe(5);
    expect(simuliereAusstieg([-6, 10], 5, -5)).toBe(-5);
    expect(simuliereAusstieg([1, 2, 3], 5, -5)).toBe(3);
  });

  it('findet die beste Kombination nach Gebühren und vergleicht mit „ohne Regel“', () => {
    // Fälle steigen erst kräftig und fallen dann zurück → ein Ziel bei +8 % ist besser als halten
    const l = [...Array(12)].map(() => fall('gewinn_ueberraschung', 9, { r1T: 9, r1W: 1 }));
    const v = zielStopVorschlaege(l, () => 2.78, { mindestFaelle: 10, zieleBruttoProzent: [3, 5, 8, 12], stopsProzent: [-3, -8] });
    expect(v[0]).toMatchObject({ typ: 'gewinn_ueberraschung', faelle: 12, zielBruttoProzent: 8, stopProzent: -3, zielNettoProzent: 5.2 });
    expect(v[0].oeNetto).toBeGreaterThan(v[0].ohneRegelOeNetto);
    expect(zielStopVorschlaege(l.slice(3), () => 2.78, { mindestFaelle: 10, zieleBruttoProzent: [5], stopsProzent: [-5] })).toEqual([]);
  });
});

describe('Gegensignale', () => {
  const sig = (typ: string, richtung: -1 | 0 | 1, staerke = 1, ticker = 'ACME'): Signal => ({ id: `${typ}:${ticker}`, wertpapier: { name: 'Acme', ticker }, typ, staerke, richtung, zeit: '2026-10-29T09:00:00Z', quellen: [{ quelle: 'Q', fakt: 'F' }] });
  it('Handelsstopp nur T12/H10 (Richtung −1, Stärke ≥ 0,8); Short-Positionen fürchten gute Nachrichten', () => {
    expect(istStarkesGegensignal(sig('shortreport', -1), 'long')).toBe(true);
    expect(istStarkesGegensignal(sig('handelsstopp', -1, 0.5), 'long')).toBe(false);
    expect(istStarkesGegensignal(sig('handelsstopp', -1, 0.9), 'long')).toBe(true);
    expect(istStarkesGegensignal(sig('prognose_erhoehung', 1), 'long')).toBe(false);
    expect(istStarkesGegensignal(sig('prognose_erhoehung', 1), 'short')).toBe(true);
  });
  it('ordnet Signale offenen Positionen zu und behält bekannte', () => {
    const o = { id: 'o1', status: 'offen', kauf: { zeit: 'x' }, plan: { wertpapier: { name: 'Acme', isin: 'US0000000001', anlageklasse: 'aktie', kursbasis: { markt: 'us', symbol: 'ACME', waehrung: 'USD' } } } } as unknown as Order;
    const jetzt = new Date('2026-10-29T09:07:00Z');
    const r = gegensignaleFinden([o], [sig('shortreport', -1)], {}, jetzt);
    expect(r.o1).toMatchObject({ typ: 'shortreport', erkannt: jetzt.toISOString() });
    expect(gegensignaleFinden([o], [], r, new Date())).toEqual(r);
    expect(gegensignaleFinden([], [], r, new Date())).toEqual({});
  });
});

describe('Claude-Orders S2', () => {
  const jetzt = new Date('2026-10-29T05:45:00Z');
  const cfg = { haltedauerMinMinuten: 15, haltedauerMaxTage: 31, hebelMax: 20, claudeOrders: { morgenlauf: 6, mittagslauf: 3, abendlauf: 3 } };
  const basis: OrderPlan = {
    wertpapier: { name: 'Beispiel AG', isin: 'DE0007164600', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'SAP.DE', waehrung: 'EUR' } },
    strategie: 'quartalszahlen_momentum',
    these: 'Prognoseerhöhung und Gewinnüberraschung, Momentum sollte einige Tage anhalten.',
    ausloeser: 'Ad-hoc-Mitteilung 07:02',
    signalIds: [],
    quellen: [],
    konfidenz: 55,
    pflichtOrder: false,
    erwarteteRenditeNetto: 3,
    zielNettoProzent: 5,
    stopProzent: -3,
    verkaufstermin: '2026-11-03T15:00:00Z',
    risiken: ['Gewinnmitnahmen'],
    einflussLektionen: '',
    gegenpruefung: { einwand: 'Zahlen könnten schon eingepreist sein', risiko: 35 },
  };
  const btc: OrderPlan = { ...basis, wertpapier: { name: 'Bitcoin', isin: '', ticker: 'BTC', anlageklasse: 'krypto', spreadKlasse: 'krypto', handelsplatz: 'TRK', steuertopf: 'sonstige', kursbasis: { markt: 'krypto', symbol: 'BTC', waehrung: 'EUR' } } };
  const n = (i: number) => ({ ...basis, wertpapier: { ...basis.wertpapier, name: `Wert ${i}` } });

  it('Schema: 6 Orders, Krypto direkt ohne ISIN, Gegenprüfung, Tagesprognose, einwandEingetreten', () => {
    const e: Entscheidung = {
      typ: 'morgenlauf',
      datum: '2026-10-29',
      erstellt: '2026-10-29T05:40:00Z',
      orders: [n(1), n(2), n(3), n(4), n(5), btc],
      prognose: [{ name: 'Apple', ticker: 'AAPL', markt: 'us', richtung: 'hoch', chance: 55 }],
    };
    expect(pruefe(e)).toBe(true);
    expect(pruefe({ ...e, orders: [...e.orders!, n(7)] })).toBe(false);
    expect(pruefe({ typ: 'abendlauf', datum: '2026-10-29', erstellt: '2026-10-29T21:20:00Z', berichte: [{ orderId: 'x', text: 'x'.repeat(60), learnings: ['l'], einwandEingetreten: true }] })).toBe(true);
  });

  it('Mittagslauf höchstens 3 Orders; Herkunft Claude; Gegenprüfung bleibt am Plan', () => {
    const u = entscheidungUebernehmen({ typ: 'mittagslauf', datum: '2026-10-29', erstellt: jetzt.toISOString(), orders: [n(1), n(2), n(3), n(4)] }, [], jetzt, cfg);
    const v = u.ereignisse.filter((x) => x.typ === 'vorgemerkt');
    expect(v).toHaveLength(3);
    expect(u.hinweise.some((h) => /höchstens 3/.test(h))).toBe(true);
    const p = (v[0].daten as { plan: OrderPlan }).plan;
    expect(p.herkunft).toBe('claude');
    expect(p.gegenpruefung?.risiko).toBe(35);
  });

  it('Krypto direkt: Kursbasis krypto und Handelsplatz TRK Pflicht; ISIN nur dort entbehrlich', () => {
    const ok = entscheidungUebernehmen({ typ: 'abendlauf', datum: '2026-10-29', erstellt: jetzt.toISOString(), orders: [btc] }, [], jetzt, cfg);
    expect(ok.ereignisse.filter((x) => x.typ === 'vorgemerkt')).toHaveLength(1);
    const falsch = entscheidungUebernehmen({ typ: 'abendlauf', datum: '2026-10-29', erstellt: jetzt.toISOString(), orders: [{ ...btc, wertpapier: { ...btc.wertpapier, handelsplatz: 'TGT' } }, { ...basis, wertpapier: { ...basis.wertpapier, isin: '' } }] }, [], jetzt, cfg);
    expect(falsch.hinweise.filter((h) => /abgelehnt/.test(h))).toHaveLength(2);
  });

  it('Short-Turbo mit Hebel bis 20 erlaubt', () => {
    const turbo: OrderPlan = {
      ...basis,
      wertpapier: { name: 'Turbo Short Tesla', isin: 'DE000HD0AAA1', anlageklasse: 'hebel', spreadKlasse: 'hebel', handelsplatz: 'TGT', steuertopf: 'sonstige' },
      hebel: { typ: 'turbo', richtung: 'short', emittent: 'UniCredit', basiswert: { name: 'Tesla', kursbasis: { markt: 'us', symbol: 'TSLA', waehrung: 'USD' } }, basispreis: 260, koSchwelle: 260, bezugsverhaeltnis: 0.1 },
      risikoklasse: 'spekulativ',
    };
    const u = entscheidungUebernehmen({ typ: 'morgenlauf', datum: '2026-10-29', erstellt: jetzt.toISOString(), orders: [turbo] }, [], jetzt, { ...cfg, risikoBudget: { maxSpekulativJeLauf: 4, maxAnteilSpekulativ: 0.7, stopMinProzent: -25, mindestKursEuro: 0.01 } });
    expect(u.ereignisse.filter((x) => x.typ === 'vorgemerkt')).toHaveLength(1);
  });
});

describe('Statistik S2', () => {
  const geschlossen = (id: string, netto: number, extra: Partial<OrderPlan> = {}, o: Partial<Order> = {}): Order =>
    ({
      id,
      status: 'geschlossen',
      plan: { strategie: 'sonstige', signalIds: [], quellen: [], konfidenz: 50, pflichtOrder: false, erwarteteRenditeNetto: 2, wertpapier: { anlageklasse: 'aktie' }, ...extra },
      kauf: { zeit: '2026-10-20T08:00:00Z', betrag: 1000 },
      verkauf: { zeit: '2026-10-22T08:00:00Z', grund: 'ziel' },
      ergebnis: { netto, nettoProzent: netto / 10, nachSteuern: netto, kursProzent: 0, gebuehren: 22, steuer: 0 },
      anpassungen: [],
      ...o,
    }) as unknown as Order;

  it('misst Herkunft, Gegenprüfung und Tagesprognose getrennt vom Schattenbuch', () => {
    const orders = [
      geschlossen('a', 30, { herkunft: 'autopilot' }),
      geschlossen('b', -20, { gegenpruefung: { einwand: 'eingepreist', risiko: 60 } }, { einwandEingetreten: true }),
      geschlossen('c', 15, { gegenpruefung: { einwand: 'Zinsen', risiko: 20 } }),
    ];
    const tracking: TrackingEintrag[] = [
      { datum: '2026-10-28', schluessel: 'prognose:us:AAPL', name: 'Apple', ticker: 'AAPL', score: 1, typen: ['claude_prognose'], quellen: ['Claude-Tagesprognose'], art: 'prognose', start: 100, r1T: 1.2 },
      { datum: '2026-10-28', schluessel: 'k', name: 'K', ticker: 'K', score: 2, typen: ['insider_kauf'], quellen: ['Q'], start: 10, r1T: -1 },
    ];
    const s: Statistik = statistikBerechnen(orders, tracking, 'x');
    expect(s.nachHerkunft?.autopilot.anzahl).toBe(1);
    expect(s.nachHerkunft?.claude.anzahl).toBe(2);
    expect(s.gegenpruefung).toMatchObject({ stark: { anzahl: 1, quote: 0 }, schwach: { anzahl: 1, quote: 100 }, verlusteMitUrteil: 1, einwandEingetreten: 1 });
    expect(s.prognose).toMatchObject({ anzahl: 1, quote1T: 100, n1T: 1 });
    expect(s.kandidaten.gesamt.anzahl).toBe(1);
    expect(s.kandidaten.nachSignalTyp.claude_prognose).toBeUndefined();
    expect(s.zusammenfassung).toMatch(/Tagesprognose/);
  });

  it('Risiko-Budget: Grundwert 4/70 %, Lernregel wächst höchstens bis 4/70 %', () => {
    const basis = { maxSpekulativJeLauf: 4, maxAnteilSpekulativ: 0.7, stopMinProzent: -25, mindestKursEuro: 0.01 };
    const gut = { nachRisikoklasse: { spekulativ: { anzahl: 12, quote: 50, oeNetto: 6 }, normal: { anzahl: 10, oeNetto: 1 } } } as unknown as Statistik;
    expect(wirksamesRisikoBudget(basis, gut)).toMatchObject({ maxSpekulativJeLauf: 4, maxAnteilSpekulativ: 0.7 });
    const schlecht = { nachRisikoklasse: { spekulativ: { anzahl: 12, quote: 20, oeNetto: -8 }, normal: { anzahl: 10, oeNetto: 1 } } } as unknown as Statistik;
    expect(wirksamesRisikoBudget(basis, schlecht)).toMatchObject({ maxSpekulativJeLauf: 2, maxAnteilSpekulativ: 0.35 });
  });
});

// Nur Typprüfung: Ereignisse mit Quelle autopilot sind gültig
export const _typ: Ereignis['quelle'] = 'autopilot';
