import { describe, expect, it } from 'vitest';
import gebuehrenDatei from '../../config/gebuehren.json';
import smartbrokerDatei from '../../config/gebuehren-smartbroker.json';
import trDatei from '../../config/gebuehren-traderepublic.json';
import type { GebuehrenConfig } from '../gebuehren.ts';
import { beobachtung, kerzenVerarbeiten, type DtLaufCfg } from './ablauf.ts';
import { abendbilanzText, uebersichtBerechnen } from './auswertung.ts';
import { kerzenAusGeschaeften, krakenKerzen, ortszeitZuUtc, sitzung, tradesAusEreignissen, turboAnlegen, turboWert, type DtTrade, type Kerze } from './kern.ts';
import { historie, monteCarlo, volleSitzungen, type SKerze } from './zeitmaschine.ts';

const g = (x: unknown) => x as GebuehrenConfig;
const GEB = { smartbroker: g(smartbrokerDatei), consors: g(gebuehrenDatei), traderepublic: g(trDatei), krypto: g(gebuehrenDatei) };
const DATUM = '2026-10-29'; // Do; New York noch Sommerzeit (bis 1.11.), Berlin schon Winterzeit
const EU = { aktiv: true, zeitzone: 'Europe/Berlin', eroeffnung: '09:00', keineEinstiegeNach: '17:00', flatBis: '17:25' };
const US = { aktiv: true, zeitzone: 'America/New_York', eroeffnung: '09:30', keineEinstiegeNach: '15:30', flatBis: '15:55' };

const cfg = (): DtLaufCfg => ({
  datum: DATUM,
  sitzungen: { eu: sitzung(DATUM, EU, 15), us: sitzung(DATUM, US, 15) },
  regeln: { minSpannenKerzen: 2, volumenFaktor: 0 },
  plan: { zielR: 2, stopProzentLevel: 2, minRisikoProzent: 0.05 },
  spreads: { aktie: 0.1, spekulativ: 1, krypto: 0.5, turbo: 0.5 },
  orderBetrag: 1000,
  maxTradesJeTag: 40,
  maxOffen: 15,
  emittent: 'UniCredit (synthetisch)',
  gebuehren: GEB,
});

/** Kerze ab Berlin-Uhrzeit (Winterzeit: UTC+1) */
const k = (hhmm: string, o: number, h: number, l: number, c: number, v = 100): Kerze => ({ t: ortszeitZuUtc(DATUM, hhmm, 'Europe/Berlin').toISOString(), o, h, l, c, v, n: 5 });

describe('Zeit', () => {
  it('US-Eröffnung in der Woche der Zeitumstellung: 09:30 New York = 13:30 UTC (14:30 Berlin)', () => {
    expect(ortszeitZuUtc(DATUM, '09:30', 'America/New_York').toISOString()).toBe('2026-10-29T13:30:00.000Z');
    expect(ortszeitZuUtc('2026-11-03', '09:30', 'America/New_York').toISOString()).toBe('2026-11-03T14:30:00.000Z');
    expect(ortszeitZuUtc(DATUM, '09:00', 'Europe/Berlin').toISOString()).toBe('2026-10-29T08:00:00.000Z');
  });
});

describe('Kerzen', () => {
  it('Geschäfte → 5-Minuten-Kerzen (Eröffnung = erstes, Schluss = letztes Geschäft)', () => {
    const m = kerzenAusGeschaeften([
      { isin: 'A', zeit: '2026-10-29T08:01:30.000Z', kurs: 10, stueck: 5 },
      { isin: 'A', zeit: '2026-10-29T08:00:10.000Z', kurs: 9.9, stueck: 1 },
      { isin: 'A', zeit: '2026-10-29T08:04:59.000Z', kurs: 10.2, stueck: 2 },
      { isin: 'A', zeit: '2026-10-29T08:05:00.000Z', kurs: 10.1, stueck: 1 },
    ]);
    expect(m.get('A')).toEqual([
      { t: '2026-10-29T08:00:00.000Z', o: 9.9, h: 10.2, l: 9.9, c: 10.2, v: 8, n: 3 },
      { t: '2026-10-29T08:05:00.000Z', o: 10.1, h: 10.1, l: 10.1, c: 10.1, v: 1, n: 1 },
    ]);
  });
  it('Kraken: laufende Kerze wird verworfen', () => {
    const z = [[1793260800, '60000', '60100', '59900', '60050', '0', '1.5', 10], [1793261100, '60050', '60060', '60000', '60010', '0', '0.4', 3]];
    expect(krakenKerzen(z, new Date((1793261100 + 120) * 1000))).toHaveLength(1);
  });
});

describe('Eröffnungsspanne (ORB) Kerze für Kerze', () => {
  it('Long: Auslöser bei Schluss über dem Spannen-Hoch, Einstieg zur nächsten Eröffnung, Ziel 2R, Smartbroker 0 €', () => {
    const b = beobachtung({ basis: 'DE0007164600', herkunft: 'code_scan', markt: 'eu', name: 'SAP', isin: 'DE0007164600', instrumentLong: 'aktie', hebel: 5, spekulativ: false }, 'orb', ['long', 'short']);
    const offen: DtTrade[] = [];
    const z = { heuteEroeffnet: 0, vergeben: new Set<string>() };
    const kerzen = [
      k('08:55', 99, 99.5, 98.8, 99.2), // vor Eröffnung: zählt nicht
      k('09:00', 100, 101, 99.5, 100.5),
      k('09:05', 100.5, 101.5, 100, 101),
      k('09:10', 101, 101.2, 100.2, 100.8), // Spanne 99,5–101,5, Mitte 100,5
      k('09:15', 100.8, 101.6, 100.7, 101.4), // Docht über Hoch, Schluss darunter → kein Auslöser
      k('09:20', 101.4, 102, 101.3, 101.9), // Schluss über 101,5 → Auslöser
      k('09:25', 102, 102.5, 101.9, 102.4), // Einstieg zur Eröffnung 102 (Brief 102,051)
      k('09:30', 102.4, 105.1, 102.3, 105), // Ziel = 102 + 2 × 1,5 = 105 → erreicht
    ];
    const r = kerzenVerarbeiten(new Map([['DE0007164600', kerzen]]), [b], offen, cfg(), z);
    expect(r.ereignisse.map((e) => e.typ)).toEqual(['einstieg', 'ausstieg']);
    const [t] = tradesAusEreignissen(r.ereignisse);
    expect(t).toMatchObject({ richtung: 'long', instrument: 'aktie', stop: 100.5, ziel: 105, ausloeser: { level: 101.5 }, einstieg: { basisKurs: 102, kurs: 102.051, stueck: 9 } });
    expect(t.ausstieg).toMatchObject({ grund: 'ziel', basisKurs: 105 });
    expect(t.ergebnis!.gebuehren.haupt).toBe(0);
    expect(t.ergebnis!.gebuehren.consors).toBeGreaterThan(20);
    expect(t.ergebnis!.gebuehren.tr).toBe(2);
    expect(t.ergebnis!.r).toBe(2);
    expect(t.ergebnis!.netto).toBe(t.ergebnis!.brutto);
    expect(offen).toHaveLength(0);
  });

  it('Short über Turbo (Hebel 5): Schluss unter dem Spannen-Tief, Stop vor Ziel, flat zum Schluss', () => {
    const b = beobachtung({ basis: 'X', herkunft: 'code_scan', markt: 'eu', name: 'Xetra AG', isin: 'X', instrumentLong: 'aktie', hebel: 5, spekulativ: false }, 'orb', ['long', 'short']);
    const offen: DtTrade[] = [];
    const kerzen = [k('09:00', 50, 50.5, 49.5, 50), k('09:05', 50, 50.2, 49.8, 50), k('09:10', 50, 50.1, 49.9, 50), k('09:15', 49.9, 50, 49.2, 49.3), k('09:20', 49.2, 49.3, 49, 49.1), k('17:25', 49.4, 49.5, 49.3, 49.4)];
    const r = kerzenVerarbeiten(new Map([['X', kerzen]]), [b], offen, cfg(), { heuteEroeffnet: 0, vergeben: new Set() });
    const [t] = tradesAusEreignissen(r.ereignisse);
    expect(t).toMatchObject({ richtung: 'short', instrument: 'turbo', stop: 50, turbo: { richtung: 'short', hebel: 5 } });
    expect(t.ausstieg?.grund).toBe('schluss');
    // Turbo verdient am Kursrückgang (49,2 → 49,4 ist für Short ein Verlust)
    expect(t.ergebnis!.brutto).toBeLessThan(0);
  });

  it('Stop vor Ziel, wenn eine Kerze beides berührt; Turbo-Formel', () => {
    const tr = turboAnlegen(100, 'long', 5, 'U');
    expect(tr.basispreis).toBe(80);
    expect(turboWert(tr, 110)).toBe(3);
    const b = beobachtung({ basis: 'Y', herkunft: 'claude', markt: 'eu', name: 'Y', isin: 'Y', instrumentLong: 'aktie', hebel: 5, spekulativ: false }, 'orb', ['long']);
    const kerzen = [k('09:00', 10, 10.1, 9.9, 10), k('09:05', 10, 10.1, 9.95, 10), k('09:10', 10, 10.1, 9.9, 10.05), k('09:15', 10.05, 10.2, 10.05, 10.15), k('09:20', 10.15, 10.6, 9.9, 10.1)];
    const r = kerzenVerarbeiten(new Map([['Y', kerzen]]), [b], [], cfg(), { heuteEroeffnet: 0, vergeben: new Set() });
    expect(tradesAusEreignissen(r.ereignisse)[0].ausstieg?.grund).toBe('stop');
  });

  it('Level-Ausbruch Krypto (Bruchstücke, Trade Republic 1 €) und Tagesgrenze', () => {
    const c = { ...cfg(), sitzungen: { krypto: sitzung(DATUM, { aktiv: true, zeitzone: 'Europe/Berlin', eroeffnung: '09:00', keineEinstiegeNach: '21:00', flatBis: '21:55' }, 15) }, gebuehren: { ...GEB, krypto: g(gebuehrenDatei) } };
    const b = beobachtung({ basis: 'BTC', herkunft: 'code_scan', markt: 'krypto', name: 'Bitcoin', symbol: 'BTC', instrumentLong: 'krypto', hebel: 5, spekulativ: false }, 'level', ['long'], { level: 61000 });
    const r = kerzenVerarbeiten(new Map([['BTC', [k('09:15', 60800, 61100, 60700, 61050), k('09:20', 61060, 61100, 61000, 61080), k('21:55', 61500, 61600, 61400, 61500)]]]), [b], [], c, { heuteEroeffnet: 0, vergeben: new Set() });
    const [t] = tradesAusEreignissen(r.ereignisse);
    expect(t.einstieg.stueck).toBeCloseTo(1000 / (61060 * 1.0025), 5);
    expect(t.ergebnis!.gebuehren.haupt).toBe(2);
    const voll = kerzenVerarbeiten(new Map([['BTC', [k('09:15', 60800, 61100, 60700, 61050), k('09:20', 61060, 61100, 61000, 61080)]]]), [beobachtung({ ...b }, 'level', ['long'], { level: 61000 })], [], { ...c, maxTradesJeTag: 0 }, { heuteEroeffnet: 0, vergeben: new Set() });
    expect(voll.ereignisse).toEqual([]);
    expect(voll.hinweise[0]).toMatch(/grenze/i);
  });
});

describe('Time Machine', () => {
  // 30 gleich aufgebaute Sitzungen à 78 Kerzen: steigen jede Kerze um 0,1 %
  const steigend: SKerze[][] = [...Array(30)].map(() => {
    let c = 100;
    return [...Array(78)].map(() => {
      const o = c;
      c *= 1.001;
      return { o, h: c * 1.0005, l: o * 0.9995, c };
    });
  });
  it('Monte Carlo ist mit Seed wiederholbar und erkennt die Richtung', () => {
    const p = { richtung: 'long' as const, einstiegIndex: 5, bisIndex: 77, stopFaktor: 0.99, zielFaktor: 1.02, zielR: 2 };
    const a = monteCarlo(steigend, p, 2000, 19);
    expect(a).toEqual(monteCarlo(steigend, p, 2000, 19));
    expect(a.zielZuerst).toBe(100);
    expect(a.urteil).toBe('Deutlich Richtung Ziel');
    expect(monteCarlo(steigend, { ...p, richtung: 'short', stopFaktor: 1.01, zielFaktor: 0.98 }, 2000).stopZuerst).toBe(100);
  });
  it('Historie spielt die ORB-Regel auf echten Sitzungen nach', () => {
    const h = historie(steigend, { richtung: 'long', spanneKerzen: 3, letzteEinstiegsKerze: 71, flatIndex: 77, zielR: 2 });
    expect(h.faelle).toBe(30);
    expect(h.ziel).toBe(30);
    expect(h.oeR).toBe(2);
  });
  it('volle Sitzungen aus Twelve Data (nur 78 Kerzen, nur vor dem Datum)', () => {
    const werte = [...Array(78)].map((_, i) => ({ datetime: `2026-10-28 ${String(9 + Math.floor((30 + i * 5) / 60)).padStart(2, '0')}:${String((30 + i * 5) % 60).padStart(2, '0')}:00`, open: '1', high: '1', low: '1', close: '1' }));
    expect(volleSitzungen(werte, '2026-10-29')).toHaveLength(1);
    expect(volleSitzungen(werte.slice(1), '2026-10-29')).toHaveLength(0);
    expect(volleSitzungen(werte, '2026-10-28')).toHaveLength(0);
  });
});

describe('Auswertung und Abendbilanz', () => {
  it('trennt Herkunft und nennt vor/nach Gebühren', () => {
    const b = beobachtung({ basis: 'DE1', herkunft: 'claude', markt: 'eu', name: 'Eins', isin: 'DE1', instrumentLong: 'aktie', hebel: 5, spekulativ: false }, 'orb', ['long']);
    const kerzen = [k('09:00', 100, 101, 99.5, 100.5), k('09:05', 100.5, 101.5, 100, 101), k('09:10', 101, 101.2, 100.2, 100.8), k('09:20', 101.4, 102, 101.3, 101.9), k('09:25', 102, 102.5, 101.9, 102.4), k('09:30', 102.4, 105.1, 102.3, 105)];
    const r = kerzenVerarbeiten(new Map([['DE1', kerzen]]), [b], [], cfg(), { heuteEroeffnet: 0, vergeben: new Set() });
    const trades = tradesAusEreignissen(r.ereignisse);
    const u = uebersichtBerechnen(trades, DATUM, 'x');
    expect(u.heute.gruppe.anzahl).toBe(1);
    expect(u.nachHerkunft.claude.quote).toBe(100);
    expect(u.gesamt.nettoConsors).toBeLessThan(u.gesamt.netto);
    const a = abendbilanzText(u, trades);
    expect(a.titel).toMatch(/^📊 Daytrading heute: \+/);
    expect(a.text).toMatch(/Claude/);
  });
});
