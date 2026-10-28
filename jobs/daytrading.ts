// Daytrading-Job (Plan Datenkrake S3), läuft im Kurswächter-Workflow nach dem Depot-Wächter (alle 15 Min.).
// 1. neue gettex-Dateien (15-Minuten-Fenster, alle Geschäfte) → 5-Minuten-Kerzen; beim Fenster der Eröffnungsspanne
//    das Code-Scan-Universum wählen (umsatzstärkste Aktien)  2. Krypto-Kerzen von Kraken  3. Setups/Trades Kerze für
//    Kerze (core/daytrading)  4. Time Machine für neue US-Trades  5. Protokoll, Übersicht, Pushes, Abendbilanz.
// Eigener Bereich: daytrading/ereignisse.jsonl (nur anhängen), nie mit dem Depot vermischt. Aufruf: node jobs/daytrading.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { signalBeweise } from '../core/autopilot.ts';
import { beobachtung, kerzenVerarbeiten, spreadFuer, type DtBeobachtung, type DtLaufCfg } from '../core/daytrading/ablauf.ts';
import { abendbilanzText, setupVarianten, tradeBeschreibung, uebersichtBerechnen } from '../core/daytrading/auswertung.ts';
import { kerzenAusGeschaeften, krakenKerzen, sitzung, tradesAusEreignissen, tradeSchritt, ausstiegAusfuehren, ergebnisRechnen, type DtEreignis, type DtMarkt, type DtTrade, type Kerze, type MarktConfig, type Sitzung } from '../core/daytrading/kern.ts';
import { historie, monteCarlo, volleSitzungen } from '../core/daytrading/zeitmaschine.ts';
import { euro } from '../core/geld.ts';
import type { GebuehrenConfig } from '../core/gebuehren.ts';
import { berlin, istHandelstag, uhrzeitMinuten } from '../core/kalender.ts';
import type { PushNachricht } from '../core/push.ts';
import type { TrackingEintrag } from '../core/statistik.ts';
import { geschaefteAusCsv, gettexDateiLaden, gettexDateiliste } from './kurse/gettex.ts';
import { symbolFuer } from './kurse/parser.ts';
import { DATEN_DIR, ladeConfig, leseJson, schreibeJson } from './lib/dateien.ts';
import { isinInfos, isinInfosLesen } from './lib/isininfo.ts';
import { holeJson } from './lib/netz.ts';
import { pushen } from './lib/pushen.ts';
import { schwaerzen } from './lib/schwaerzen.ts';

interface DtConfig {
  aktiv: boolean;
  orderBetrag: number;
  maxTradesJeTag: number;
  maxOffen: number;
  /** gettex-Fenster je Lauf (Aufholen nach Lücken) */
  maxFensterJeLauf?: number;
  spanneMinuten: number;
  zielR: number;
  stopProzentLevel: number;
  minRisikoProzent: number;
  minSpannenKerzen: number;
  volumenFaktor: number;
  maerkte: Record<DtMarkt, MarktConfig>;
  universum: { jeSitzung: number; minGeschaefte: number; minUmsatzEuro: number; laenderEu: string[]; laenderUs: string[] };
  krypto: { symbole: string[] };
  spekulativ: { unterKursEuro: number; unterUmsatzEuro: number };
  turbo: { hebelCode: number; emittent: string };
  /** Spielart je Setup aus dem Varianten-Schattenbuch (Richtung, Aktie/Turbo, Hebel) */
  varianten?: { aktiv: boolean; mindestTrades: number; mindestChance: number };
  spreads: DtLaufCfg['spreads'];
  nyseFeiertage: string[];
  timeMachine: { aktiv: boolean; maxJeLauf: number; wiederholungen: number; seed: number; minSitzungen: number };
  autopilot: { aktiv: boolean; horizont: 'r1h' | 'r1T'; mindestFaelle: number; maxJeTag: number; maxSignalAlterMin: number };
  claude: { maxWatchlist: number; hebelMin: number; hebelMax: number };
  abendbilanzAb: string;
}

interface DtZustand {
  datum: string;
  /** verarbeitete gettex-Dateien (Namen) */
  dateien: string[];
  universum: Partial<Record<DtMarkt, boolean>>;
  beobachtungen: DtBeobachtung[];
  kryptoLetzte: Record<string, string>;
  watchlist: boolean;
  autopilotGenutzt: string[];
  letzteKurse: Record<string, { zeit: string; kurs: number }>;
  abendbilanz?: string;
}

export interface WatchlistEintrag {
  name: string;
  markt: DtMarkt;
  isin?: string;
  symbol?: string;
  setup: 'orb' | 'level';
  level?: number;
  richtung: 'long' | 'short' | 'beide';
  instrument?: 'aktie' | 'turbo';
  hebel?: number;
  chance?: number;
  these?: string;
}

const jetzt = new Date(process.env.JETZT ?? Date.now());
const b = berlin(jetzt);
const datum = b.datum;
const root = process.cwd();
const dt = JSON.parse(readFileSync(join(root, 'config', 'daytrading.json'), 'utf8')) as DtConfig;
const cfg = ladeConfig();
const tr = JSON.parse(readFileSync(join(root, 'config', 'gebuehren-traderepublic.json'), 'utf8')) as GebuehrenConfig;
const PROTOKOLL = 'daytrading/ereignisse.jsonl';

function leseDtEreignisse(): DtEreignis[] {
  const p = join(DATEN_DIR, PROTOKOLL);
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((z) => z.trim())
    .map((z) => JSON.parse(z) as DtEreignis);
}

/** Einstiege ohne Ausstiegsfelder speichern (der Ausstieg ist ein eigenes Ereignis). */
function anhaengen(alt: DtEreignis[], neu: DtEreignis[]): DtEreignis[] {
  const ids = new Set(alt.map((e) => e.id));
  const wirklich = neu.filter((e) => !ids.has(e.id));
  if (!wirklich.length) return [];
  const zeilen = wirklich.map((e) => {
    if (e.typ !== 'einstieg') return JSON.stringify(e);
    const { ausstieg: _a, ergebnis: _e, ...trade } = e.trade;
    return JSON.stringify({ ...e, trade });
  });
  mkdirSync(join(DATEN_DIR, 'daytrading'), { recursive: true });
  appendFileSync(join(DATEN_DIR, PROTOKOLL), zeilen.join('\n') + '\n');
  return wirklich;
}

if (!dt.aktiv) {
  console.log('Daytrading aus (config/daytrading.json).');
  process.exit(0);
}

const alleEreignisse = leseDtEreignisse();
const trades = tradesAusEreignissen(alleEreignisse);
const offen = trades.filter((t) => !t.ausstieg);
const handelstag = istHandelstag(datum);
// Krypto-Daytrading läuft jeden Tag, auch am Wochenende und an Börsenfeiertagen (Nutzer 28.10.2026); Aktien nur an Handelstagen.
const kryptoTaeglich = dt.maerkte.krypto.aktiv;
// Nachts, vor 08:00 und an Tagen ohne Markt nichts tun (außer liegengebliebene Trades schließen)
if (((!handelstag && !kryptoTaeglich) || b.minuten < 8 * 60 || b.minuten > 23 * 60 + 30) && !offen.length) {
  console.log(`Daytrading ${datum} ${b.stunde}:${String(b.minute).padStart(2, '0')}: außerhalb der Handelszeit – nichts zu tun.`);
  process.exit(0);
}

const gebuehren = { smartbroker: cfg.gebuehrenSmartbroker, traderepublic: tr, krypto: cfg.gebuehren };
const sitzungen: Partial<Record<DtMarkt, Sitzung>> = {};
for (const m of ['eu', 'us', 'krypto'] as DtMarkt[]) {
  if (!dt.maerkte[m].aktiv || (m !== 'krypto' && !handelstag) || (m === 'us' && dt.nyseFeiertage.includes(datum))) continue;
  sitzungen[m] = sitzung(datum, dt.maerkte[m], dt.spanneMinuten);
}
const laufCfg: DtLaufCfg = {
  datum,
  sitzungen,
  regeln: { minSpannenKerzen: dt.minSpannenKerzen, volumenFaktor: dt.volumenFaktor },
  plan: { zielR: dt.zielR, stopProzentLevel: dt.stopProzentLevel, minRisikoProzent: dt.minRisikoProzent },
  spreads: dt.spreads,
  orderBetrag: dt.orderBetrag,
  maxTradesJeTag: dt.maxTradesJeTag,
  maxOffen: dt.maxOffen,
  emittent: dt.turbo.emittent,
  gebuehren,
};

// Spielart je Setup (Nutzer 28.10.: „herausfiltern, wo Hebel und Co. passen“): erst ab genug Trades, vorsichtig bewertet
const varianten = dt.varianten?.aktiv ? setupVarianten(trades, { aktie: dt.spreads.aktie, turbo: dt.spreads.turbo }, dt.varianten) : {};
function wahlFuer(markt: DtMarkt, setup: string): DtBeobachtung['wahl'] {
  const w: NonNullable<DtBeobachtung['wahl']> = {};
  for (const r of ['long', 'short'] as const) {
    const v = varianten[`${markt}:${setup}_${r}`]?.beste;
    if (!v) continue;
    const richtung = v.richtung === 'mit' ? r : r === 'long' ? 'short' : 'long';
    w[r] = { richtung, instrument: v.hebel === 1 ? (markt === 'krypto' ? 'krypto' : 'aktie') : 'turbo', hebel: v.hebel === 1 ? dt.turbo.hebelCode : v.hebel };
  }
  return Object.keys(w).length ? w : undefined;
}
const neueEreignisse: DtEreignis[] = [];
const neueTrades: DtTrade[] = [];
const hinweise: string[] = [];
const zaehler = { heuteEroeffnet: trades.filter((t) => t.datum === datum).length, vergeben: new Set(trades.map((t) => t.id)) };

// --- Tageswechsel: liegengebliebene Trades zum letzten bekannten Kurs schließen (Daytrading hält nie über Nacht) ---
let z = leseJson<DtZustand | null>('daytrading/zustand.json', null);
for (const t of offen.filter((x) => x.datum < datum)) {
  const k = z?.letzteKurse[t.isin ?? t.symbol ?? ''];
  const kurs = k?.kurs ?? t.einstieg.basisKurs;
  const s = tradeSchritt(t, { t: t.flatBis, o: kurs, h: kurs, l: kurs, c: kurs, v: 0, n: 0 })!;
  const ausstieg = ausstiegAusfuehren(t, s, spreadFuer(t, dt.spreads));
  const ergebnis = ergebnisRechnen(t, ausstieg, gebuehren);
  Object.assign(t, { ausstieg, ergebnis });
  neueEreignisse.push({ id: `${ausstieg.zeit}-ausstieg-${t.id}`, typ: 'ausstieg', zeit: ausstieg.zeit, tradeId: t.id, ausstieg, ergebnis });
  offen.splice(offen.indexOf(t), 1);
  hinweise.push(`${t.name}: vom Vortag offen – zum letzten Kurs geschlossen`);
}
if (!z || z.datum !== datum) z = { datum, dateien: [], universum: {}, beobachtungen: [], kryptoLetzte: {}, watchlist: false, autopilotGenutzt: [], letzteKurse: {} };
const zustand = z;

function verarbeiten(kerzen: Map<string, Kerze[]>) {
  if (!kerzen.size) return;
  for (const [basis, l] of kerzen) {
    const letzte = l[l.length - 1];
    if (letzte) zustand.letzteKurse[basis] = { zeit: letzte.t, kurs: letzte.c };
  }
  const r = kerzenVerarbeiten(kerzen, zustand.beobachtungen, offen, laufCfg, zaehler);
  neueEreignisse.push(...r.ereignisse);
  neueTrades.push(...r.neu);
  hinweise.push(...r.hinweise);
}

// --- Claude-Watchlist aus dem Morgenlauf ---
const wl = leseJson<{ eintraege?: WatchlistEintrag[] } | null>(`daytrading/watchlist/${datum}.json`, null);
if (wl && !zustand.watchlist) {
  zustand.watchlist = true;
  for (const e of (wl.eintraege ?? []).slice(0, dt.claude.maxWatchlist)) {
    const basis = e.markt === 'krypto' ? e.symbol?.toUpperCase() : e.isin;
    if (!basis || !sitzungen[e.markt]) continue;
    const richtungen = e.markt === 'krypto' || e.richtung === 'long' ? (['long'] as const) : e.richtung === 'short' ? (['short'] as const) : (['long', 'short'] as const);
    zustand.beobachtungen.push(
      beobachtung(
        {
          basis,
          herkunft: 'claude',
          markt: e.markt,
          name: e.name,
          ...(e.markt === 'krypto' ? { symbol: basis } : { isin: basis }),
          instrumentLong: e.markt === 'krypto' ? 'krypto' : e.instrument === 'turbo' ? 'turbo' : 'aktie',
          hebel: Math.min(dt.claude.hebelMax, Math.max(dt.claude.hebelMin, Math.round(e.hebel ?? 5))),
          spekulativ: false,
          ...(e.chance !== undefined ? { chance: e.chance } : {}),
          ...(e.these ? { these: e.these } : {}),
        },
        e.setup === 'level' && e.level ? 'level' : 'orb',
        [...richtungen],
        e.setup === 'level' && e.level ? { level: e.level, levelTief: e.level } : {},
      ),
    );
  }
  console.log(`Claude-Watchlist: ${wl.eintraege?.length ?? 0} Werte.`);
}

// --- Autopilot: im Schattenbuch bewiesene schnelle Signale (Reaktion nach ~1 Stunde) ---
if (dt.autopilot.aktiv && handelstag) {
  const beweise = signalBeweise(leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []), { horizont: dt.autopilot.horizont, mindestFaelle: dt.autopilot.mindestFaelle, mindestChance: cfg.einstellungen.mindestChance ?? 40 }, { aktie: dt.spreads.aktie, krypto: dt.spreads.krypto + 0.2 });
  schreibeJson('daytrading/autopilot.json', { stand: jetzt.toISOString(), horizont: dt.autopilot.horizont, beweise: beweise.slice(0, 15) });
  const bewiesen = beweise.filter((x) => x.bewiesen && x.gruppe === 'aktie');
  const heuteAuto = trades.filter((t) => t.datum === datum && t.herkunft === 'autopilot').length + zustand.beobachtungen.filter((x) => x.herkunft === 'autopilot' && x.zustand.status !== 'fertig').length;
  if (bewiesen.length && heuteAuto < dt.autopilot.maxJeTag) {
    const tag = leseJson<{ signale?: { id: string; n: string; i?: string; typ: string; r: number; z: string }[] }>(`signale/tag/${datum}.json`, {});
    let frei = dt.autopilot.maxJeTag - heuteAuto;
    for (const s of tag.signale ?? []) {
      if (frei <= 0) break;
      const beweis = bewiesen.find((x) => x.typ === s.typ);
      if (!beweis || !s.i || s.r !== 1 || zustand.autopilotGenutzt.includes(s.id)) continue;
      if (jetzt.getTime() - Date.parse(s.z) > dt.autopilot.maxSignalAlterMin * 60000) continue;
      const markt: DtMarkt | null = dt.universum.laenderUs.includes(s.i.slice(0, 2)) ? 'us' : dt.universum.laenderEu.includes(s.i.slice(0, 2)) ? 'eu' : null;
      const sz = markt ? sitzungen[markt] : undefined;
      if (!markt || !sz || jetzt >= sz.keineEinstiegeNach) continue;
      zustand.autopilotGenutzt.push(s.id);
      frei--;
      // Signal ist ab JETZT bekannt → Einstieg zum ersten Kurs danach (nächste Kerze)
      const ab = new Date(Math.floor(jetzt.getTime() / 300000) * 300000).toISOString();
      zustand.beobachtungen.push(
        beobachtung(
          { basis: s.i, herkunft: 'autopilot', markt, name: s.n, isin: s.i, instrumentLong: 'aktie', hebel: dt.turbo.hebelCode, spekulativ: false, chance: Math.round(beweis.chance), these: `Autopilot: ${s.typ} im Schattenbuch bewiesen (${beweis.faelle} Fälle, ${beweis.chance} % im Plus, Ø ${beweis.oeNetto} % nach 1 Std.)` },
          'signal',
          ['long'],
          { status: 'ausgeloest', ausloeser: { zeit: jetzt.toISOString(), kurs: 0, level: 0, richtung: 'long' }, letzteKerze: ab },
        ),
      );
      hinweise.push(`Autopilot beobachtet ${s.n} (${s.typ})`);
    }
  }
}

// --- gettex: neue 15-Minuten-Fenster des Tages (älteste zuerst) ---
const mitIsin = () => zustand.beobachtungen.some((x) => x.isin) || offen.some((t) => t.isin) || sitzungen.eu || sitzungen.us;
if (mitIsin()) {
  try {
    const liste = (await gettexDateiliste()).filter((d) => d.datum === datum && !zustand.dateien.includes(d.name));
    const fenster = [...new Set(liste.map((d) => d.schluessel))].slice(0, dt.maxFensterJeLauf ?? 40);
    for (const f of fenster) {
      const dateien = liste.filter((d) => d.schluessel === f);
      // beide Segmente (MUNC/MUND) abwarten, außer das Fenster ist schon > 30 Min. alt
      if (dateien.length < 2 && jetzt.getTime() - Date.parse(dateien[0].ende) < 30 * 60000) break;
      // concat statt push(...): zum Börsenstart hat ein Fenster sehr viele Geschäfte
      let geschaefte: ReturnType<typeof geschaefteAusCsv> = [];
      for (const d of dateien) geschaefte = geschaefte.concat(geschaefteAusCsv(await gettexDateiLaden(d.url), d.datum));
      const kerzen = kerzenAusGeschaeften(geschaefte);
      const ende = dateien[0].ende;
      for (const m of ['eu', 'us'] as const) {
        const s = sitzungen[m];
        if (!s || zustand.universum[m]) continue;
        if (ende === s.spannenEnde.toISOString()) {
          await universumWaehlen(m, kerzen, s);
          zustand.universum[m] = true;
        } else if (Date.parse(ende) > s.spannenEnde.getTime()) zustand.universum[m] = true; // Spanne verpasst
      }
      const verfolgt = new Set([...zustand.beobachtungen.filter((x) => x.isin).map((x) => x.basis), ...offen.filter((t) => t.isin).map((t) => t.isin!)]);
      verarbeiten(new Map([...kerzen].filter(([isin]) => verfolgt.has(isin))));
      zustand.dateien.push(...dateien.map((d) => d.name));
      flatOhneKerze(ende, false);
    }
  } catch (e) {
    hinweise.push(schwaerzen(`gettex: ${(e as Error).message}`));
  }
}

async function universumWaehlen(m: 'eu' | 'us', kerzen: Map<string, Kerze[]>, s: Sitzung) {
  const laender = m === 'eu' ? dt.universum.laenderEu : dt.universum.laenderUs;
  const kand = [...kerzen]
    .filter(([isin]) => laender.includes(isin.slice(0, 2)))
    .map(([isin, ks]) => {
      const sp = ks.filter((k) => Date.parse(k.t) >= s.eroeffnung.getTime() && Date.parse(k.t) < s.spannenEnde.getTime());
      return { isin, umsatz: sp.reduce((a, k) => a + k.c * k.v, 0), n: sp.reduce((a, k) => a + k.n, 0), kurs: sp.at(-1)?.c ?? 0 };
    })
    .filter((x) => x.n >= dt.universum.minGeschaefte && x.umsatz >= dt.universum.minUmsatzEuro)
    .sort((a, c) => c.umsatz - a.umsatz)
    .slice(0, dt.universum.jeSitzung * 2);
  const info = await isinInfos(kand.map((x) => x.isin));
  const gewaehlt = kand.filter((x) => info[x.isin]?.aktie).slice(0, dt.universum.jeSitzung);
  for (const x of gewaehlt) {
    zustand.beobachtungen.push(
      beobachtung(
        { basis: x.isin, herkunft: 'code_scan', markt: m, name: info[x.isin].name, isin: x.isin, instrumentLong: 'aktie', hebel: dt.turbo.hebelCode, spekulativ: x.kurs < dt.spekulativ.unterKursEuro || x.umsatz < dt.spekulativ.unterUmsatzEuro, wahl: wahlFuer(m, 'orb') },
        'orb',
        ['long', 'short'],
      ),
    );
  }
  console.log(`Universum ${m}: ${kand.length} Kandidaten, ${gewaehlt.length} Aktien gewählt.`);
}

/** Nach „flat bis“: offene Trades ohne neue Kerze zum letzten Kurs davor schließen (sobald die Daten darüber hinaus reichen). */
function flatOhneKerze(datenBis: string, krypto: boolean) {
  for (const t of [...offen]) {
    if ((t.markt === 'krypto') !== krypto || t.datum !== datum) continue;
    if (Date.parse(datenBis) < Date.parse(t.flatBis) + 5 * 60000) continue;
    const k = zustand.letzteKurse[t.isin ?? t.symbol ?? ''];
    if (!k) continue;
    verarbeiten(new Map([[t.isin ?? t.symbol!, [{ t: t.flatBis, o: k.kurs, h: k.kurs, l: k.kurs, c: k.kurs, v: 0, n: 0 }]]]));
  }
}

// --- Krypto (Kraken, öffentlich, ohne Schlüssel) ---
const sk = sitzungen.krypto;
if ((sk && jetzt >= sk.eroeffnung) || offen.some((t) => t.markt === 'krypto')) {
  type Ohlc = { error?: string[]; result?: Record<string, (string | number)[][] | number> };
  const reihe = async (sym: string, intervall: number, seit?: number) => {
    const j = await holeJson<Ohlc>(`https://api.kraken.com/0/public/OHLC?pair=${symbolFuer('kraken', sym)}&interval=${intervall}${seit ? `&since=${seit}` : ''}`);
    const r = Object.entries(j.result ?? {}).find(([k]) => k !== 'last')?.[1];
    return Array.isArray(r) ? (r as (string | number)[][]) : [];
  };
  try {
    if (sk && jetzt < sk.keineEinstiegeNach) {
      for (const sym of dt.krypto.symbole) {
        if (zustand.beobachtungen.some((x) => x.basis === sym && x.herkunft === 'code_scan')) continue;
        // Level = Hoch des Vortags (UTC-Tageskerze); Eröffnungsspanne ab 09:00 Berlin
        const tage = krakenKerzen(await reihe(sym, 1440), new Date(Date.parse(`${datum}T00:00:00Z`)), 1440);
        const vortag = tage.at(-1);
        const basisDaten = { basis: sym, herkunft: 'code_scan' as const, markt: 'krypto' as const, name: sym, symbol: sym, instrumentLong: 'krypto' as const, hebel: 1, spekulativ: !['BTC', 'ETH'].includes(sym) };
        zustand.beobachtungen.push(beobachtung({ ...basisDaten, wahl: wahlFuer('krypto', 'orb') }, 'orb', ['long']));
        if (vortag) zustand.beobachtungen.push(beobachtung({ ...basisDaten, wahl: wahlFuer('krypto', 'level') }, 'level', ['long'], { level: vortag.h }));
      }
    }
    const basen = new Set([...zustand.beobachtungen.filter((x) => x.markt === 'krypto').map((x) => x.basis), ...offen.filter((t) => t.markt === 'krypto').map((t) => t.symbol!)]);
    const seit = Math.floor(((sk?.eroeffnung.getTime() ?? jetzt.getTime() - 6 * 3600000) - 300000) / 1000);
    for (const sym of basen) {
      const k = krakenKerzen(await reihe(sym, 5, seit), jetzt).filter((x) => x.t > (zustand.kryptoLetzte[sym] ?? ''));
      if (k.length) zustand.kryptoLetzte[sym] = k[k.length - 1].t;
      verarbeiten(new Map([[sym, k]]));
    }
    flatOhneKerze(jetzt.toISOString(), true);
  } catch (e) {
    hinweise.push(schwaerzen(`Kraken: ${(e as Error).message}`));
  }
}

// --- Time Machine für neue US-Trades (Twelve Data, 60 Tage 5-Minuten-Kerzen) ---
const tdKey = process.env.TWELVEDATA_API_KEY?.trim();
if (dt.timeMachine.aktiv && tdKey) {
  const infos = isinInfosLesen();
  let n = 0;
  for (const t of neueTrades.filter((x) => x.markt === 'us' && x.herkunft !== 'autopilot' && x.isin && infos[x.isin]?.ticker)) {
    if (n++ >= dt.timeMachine.maxJeLauf) break;
    try {
      const j = await holeJson<{ values?: { datetime: string; open: string; high: string; low: string; close: string }[]; status?: string }>(
        `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(infos[t.isin!].ticker!)}&interval=5min&outputsize=5000&apikey=${tdKey}`,
      );
      const s = volleSitzungen(j.values ?? [], datum);
      if (s.length < dt.timeMachine.minSitzungen) continue;
      const us = sitzungen.us!;
      const einstiegIndex = Math.round((Date.parse(t.einstieg.zeit) - us.eroeffnung.getTime()) / 300000);
      const flatIndex = Math.round((us.flatBis.getTime() - us.eroeffnung.getTime()) / 300000);
      t.timeMachine = {
        ...monteCarlo(s, { richtung: t.richtung, einstiegIndex, bisIndex: flatIndex, stopFaktor: t.stop / t.einstieg.basisKurs, zielFaktor: t.ziel / t.einstieg.basisKurs, zielR: t.zielR }, dt.timeMachine.wiederholungen, dt.timeMachine.seed),
        historie: historie(s, { richtung: t.richtung, spanneKerzen: dt.spanneMinuten / 5, letzteEinstiegsKerze: Math.round((us.keineEinstiegeNach.getTime() - us.eroeffnung.getTime()) / 300000) - 1, flatIndex, zielR: t.zielR }),
      };
    } catch (e) {
      hinweise.push(schwaerzen(`Time Machine ${t.name}: ${(e as Error).message}`));
    }
  }
}

// --- Schreiben ---
const geschrieben = anhaengen(alleEreignisse, neueEreignisse);
const nachher = tradesAusEreignissen([...alleEreignisse, ...geschrieben]);
const uebersicht = uebersichtBerechnen(nachher, datum, jetzt.toISOString(), leseJson('lernen/marktphasen.json', {}));
schreibeJson('daytrading/uebersicht.json', {
  ...uebersicht,
  varianten,
  beobachtet: Object.fromEntries((['code_scan', 'claude', 'autopilot'] as const).map((h) => [h, zustand.beobachtungen.filter((x) => x.herkunft === h).length])),
  hinweise: hinweise.slice(-20),
});
// Zustand ohne erledigte Beobachtungen der Vergangenheit; Dateiliste bleibt für den Tag
schreibeJson('daytrading/zustand.json', zustand);

// --- Pushes: Claude-Trades einzeln (je Lauf gebündelt), Code-Scan/Autopilot nur in der Abendbilanz ---
let pushes: PushNachricht[] = [];
const iso = jetzt.toISOString();
const claudeEin = geschrieben.filter((e) => e.typ === 'einstieg' && e.trade.herkunft === 'claude') as Extract<DtEreignis, { typ: 'einstieg' }>[];
const claudeAus = geschrieben.filter((e) => e.typ === 'ausstieg' && nachher.find((t) => t.id === e.tradeId)?.herkunft === 'claude') as Extract<DtEreignis, { typ: 'ausstieg' }>[];
for (const e of claudeEin) {
  const b = tradeBeschreibung(e.trade);
  pushes.push({ typ: 'gekauft', titel: `⚡ Daytrade: ${b.was}`, text: `${b.einstieg} · ${b.plan}`, ziel: '#/daytrading', tag: `dt-${e.trade.id}`, erstellt: iso });
}
for (const e of claudeAus) {
  const t = nachher.find((x) => x.id === e.tradeId)!;
  pushes.push({ typ: 'verkauft', titel: `⚡ Daytrade beendet: ${t.name} ${euro(e.ergebnis.netto, { vorzeichen: true })}`, text: tradeBeschreibung(t).ausstieg ?? '', ziel: '#/daytrading', tag: `dt-aus-${t.id}`, erstellt: iso });
}
if (pushes.length > 4) pushes = [{ typ: 'gekauft', titel: `⚡ ${pushes.length} Daytrade-Meldungen`, text: pushes.map((p) => p.titel).join(' · '), ziel: '#/daytrading', tag: `dt-sammel-${iso.slice(0, 16)}`, erstellt: iso }];
// Abendbilanz: werktags ab 22:10 (US-Daten kommen verzögert); am Wochenende nur Krypto (Kraken in Echtzeit) → kurz nach „flat bis“
const bilanzAb = handelstag ? uhrzeitMinuten(dt.abendbilanzAb) : uhrzeitMinuten(dt.maerkte.krypto.flatBis) + 5;
if ((handelstag || kryptoTaeglich) && b.minuten >= bilanzAb && zustand.abendbilanz !== datum) {
  const heute = nachher.filter((t) => t.datum === datum);
  if (heute.length) {
    const a = abendbilanzText(uebersicht, heute);
    pushes.push({ typ: 'bericht', titel: a.titel, text: a.text, ziel: '#/daytrading', tag: `dt-bilanz-${datum}`, erstellt: iso });
  }
  zustand.abendbilanz = datum;
  schreibeJson('daytrading/zustand.json', zustand);
}
const gesendet = pushes.length ? await pushen(pushes, jetzt) : 0;

console.log(
  `Daytrading ${datum} ${b.stunde}:${String(b.minute).padStart(2, '0')}: ${zustand.beobachtungen.length} beobachtet, ${zustand.dateien.length} gettex-Dateien, ${geschrieben.filter((e) => e.typ === 'einstieg').length} Einstiege, ${geschrieben.filter((e) => e.typ === 'ausstieg').length} Ausstiege, ${offen.length} offen, ${gesendet} Push(es).`,
);
for (const h of hinweise.slice(-10)) console.log(`Hinweis: ${h}`);
