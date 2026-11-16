// Rückblick und Musterprüfung (Plan Volltreffer V3, mit Sprung-Zensus aus V2): rechnet über die ganze Kursgeschichte
// im privaten Archiv (US-Aktien, Kraken-Coins) für jeden handelbaren Wert und Tag aus, ob eine 1.000-€-Order ein
// Volltreffer geworden wäre, und prüft Merkmale, Zweierkombinationen und Hypothesen in zwei getrennten Zeiträumen.
// Aufruf: node jobs/rueckblick.ts   (ARCHIV_DIR = Checkout des privaten Archivs, DATEN_DIR = Datenzweig)
// Öffentlich (DATEN_DIR/lernen/muster/): nur verdichtete Kennzahlen. Privat (ARCHIV_DIR/auswertung/): Zensus mit Werten.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { orderentgelt } from '../core/gebuehren.ts';
import { parseKryptoKerzenArchiv, parseUsArchiv, parseUsSplitsArchiv } from '../core/sammelkurse.ts';
import { etikett, spielarten, spielartText, sprungEpisoden, type Ausgang, type EtikettKosten, type Kerze, type NachziehEinstellung, type Spielart } from '../core/volltreffer/etikett.ts';
import { klasse, klassenName, merkmale, type Einteilung, type Merkmale } from '../core/volltreffer/merkmale.ts';
import { HYPOTHESEN, hypothesenFaelle, pruefen, spielartSchluessel, TagesKlumpen, Zaehlwerk, type Pruefergebnis } from '../core/volltreffer/pruefung.ts';
import { jagdenWaehlen, jagdKennzahlen, type JagdFall } from '../core/volltreffer/jagd.ts';
import { pumpVerdacht } from '../core/datenkrake.ts';
import { befoerderungPruefen, istBefoerdert, noetigeFaelle, stufe3Waehlen, stufe3Zeiten, type V6Regeln } from '../core/volltreffer/befoerderung.ts';
import { istUsAktie, kryptoPaar, median, splitBereinigen, splitVerdacht, unbekannteSplitsTeilen, type Split } from '../core/volltreffer/reihen.ts';
import { ladeConfig, leseJson, schreibeJson } from './lib/dateien.ts';
import { schluesselNormal } from '../core/signale.ts';
import { boersenwertAm, parseBoersenwertCsv } from '../core/volltreffer/boersenwert.ts';
import { aenderungAm, breite, fedAbstand, summeBis, wertAm, type UmfeldArchiv } from '../core/volltreffer/umfeld.ts';
import { leerquotenAusCsv, leerquotenReihe } from '../core/volltreffer/leerverkauf.ts';
import { leerbestandAusCsv, leerbestandDatei } from '../core/volltreffer/leerbestand.ts';
import { turboDa, type TurboStand } from '../core/volltreffer/turbos.ts';
import { turbosPruefen } from './lib/turbos.ts';
import type { InsiderArchiv } from '../core/volltreffer/insider.ts';
import { brancheAusSic, firmaJeTicker, MELDUNG_ARTEN, meldungenErfasst, zahlenAbstaende, type MeldungArt, type ZahlenArchiv, type ZahlenFirma } from '../core/volltreffer/zahlen.ts';

type Markt = 'aktie' | 'krypto';
interface VtConfig {
  etikett: { einsatz: number; ziel: number; beinahe: number; zensusMaxHebel: number; hebel: number[]; stops: number[]; nachzieh?: NachziehEinstellung; standardStop: number; fenster: number[]; episodeAbstand: number; finanzierungProzentJahr: number; turboSpreadKlasse: string; turboEmittent: string };
  handelbar: {
    aktie: { mindestKurs: number; mindestUmsatzStichtag: number; turboAbUmsatz20: number; spread: { abUmsatz20: number; klasse: string }[]; handelsplatz: string };
    krypto: { mindestUmsatzStichtag: number; turboBasiswerte: string[]; ohneBasis: string[]; mindestSchwankung20: number; spreadKlasse: string; handelsplatz: string };
  };
  pruefung: { mindestFaelle: number; mindestTage: number; klumpenJeGruppe: number; splitVerdachtMax: number; sperreTage: number; paareFenster: number[]; rangliste: number; einteilungen: Einteilung[] };
  v4: { maxOffen: number; tagesVerlustGrenze: number; vorwaertsMax: number; lauerlisteMax: number; stufe2Faelle: number; mindestQuote: number; maxJeBaustein?: number };
  v6: V6Regeln & { ohneNein?: boolean };
  turbos: { boerse: string; gueltigTage: number; maxSuchen: number; maxSeiten: number; minuten: number; stichprobeAbUmsatz20: number };
}

const t0 = Date.now();
const ARCHIV = process.env.ARCHIV_DIR ?? '_archiv';
const vt = JSON.parse(readFileSync(join(process.cwd(), 'config', 'volltreffer.json'), 'utf8')) as VtConfig;
const cfg = ladeConfig();
const jetzt = new Date(process.env.JETZT ?? Date.now());
const heute = jetzt.toISOString().slice(0, 10);
const log = (text: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${text}`);
const gz = (pfad: string) => gunzipSync(readFileSync(pfad)).toString('utf8');
const tagesDateien = (markt: string) => {
  const o = join(ARCHIV, markt);
  if (!existsSync(o)) return [];
  return readdirSync(o)
    .flatMap((jahr) => (/^\d{4}$/.test(jahr) ? readdirSync(join(o, jahr)).map((d) => join(o, jahr, d)) : []))
    .filter((p) => /\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(p))
    .sort();
};
const datumAus = (pfad: string) => pfad.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/)![1];

if (!existsSync(ARCHIV)) {
  console.error(`Archiv-Ordner ${ARCHIV} fehlt (Checkout des privaten Repos).`);
  process.exit(1);
}

// ---------- 1. Reihen laden ----------
interface Reihe {
  schluessel: string;
  markt: Markt;
  kerzen: Kerze[];
}
const reihen: Reihe[] = [];

// US-Aktien: eine Datei je Handelstag mit allen Werten → je Wert eine Reihe
{
  const dateien = tagesDateien('us');
  const je = new Map<string, Kerze[]>();
  for (const p of dateien) {
    const datum = datumAus(p);
    for (const k of parseUsArchiv(gz(p)).values()) {
      if (k.otc || !istUsAktie(k.ticker)) continue;
      let r = je.get(k.ticker);
      if (!r) je.set(k.ticker, (r = []));
      r.push({ datum, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
  }
  const splitDatei = join(ARCHIV, 'stamm', 'us-splits.csv.gz');
  const splits = new Map<string, Split[]>();
  if (existsSync(splitDatei)) for (const s of parseUsSplitsArchiv(gz(splitDatei))) (splits.get(s.ticker) ?? splits.set(s.ticker, []).get(s.ticker)!).push(s);
  let geteilt = 0;
  for (const [ticker, kerzen] of je) {
    const teile = unbekannteSplitsTeilen(splitBereinigen(kerzen, splits.get(ticker) ?? []));
    geteilt += teile.length - 1;
    teile.forEach((t, n) => reihen.push({ schluessel: `T:${ticker}${n ? `#${n}` : ''}`, markt: 'aktie', kerzen: t }));
  }
  log(`US: ${dateien.length} Handelstage, ${je.size} Aktien, ${[...splits.values()].flat().length} gemeldete Splits, ${geteilt} Reihen an nicht gemeldeten Splits geteilt.`);
}

// Krypto: Tageskerzen aller Kraken-Paare → je Coin eine Reihe (Euro bevorzugt, sonst Dollar)
{
  const dateien = tagesDateien('krypto-kerzen');
  const je = new Map<string, Map<string, Kerze[]>>();
  const ohne = new Set(vt.handelbar.krypto.ohneBasis);
  for (const p of dateien) {
    const datum = datumAus(p);
    for (const k of parseKryptoKerzenArchiv(gz(p)).values()) {
      const pq = kryptoPaar(k.name);
      if (!pq || ohne.has(pq.basis)) continue;
      const nachQuote = je.get(pq.basis) ?? je.set(pq.basis, new Map()).get(pq.basis)!;
      (nachQuote.get(pq.quote) ?? nachQuote.set(pq.quote, []).get(pq.quote)!).push({ datum, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
  }
  for (const [basis, nachQuote] of je) {
    const kerzen = nachQuote.get('EUR') ?? nachQuote.get('USD');
    const name = ({ XBT: 'BTC', XDG: 'DOGE' } as Record<string, string>)[basis] ?? basis;
    if (kerzen?.length) reihen.push({ schluessel: `K:${name}`, markt: 'krypto', kerzen });
  }
  log(`Krypto: ${dateien.length} Tage, ${je.size} Coins.`);
}
if (!reihen.length) {
  console.error('Keine Kursreihen im Archiv – erst die Kursgeschichte laden (Workflow historie.yml).');
  process.exit(1);
}

// Börsenwert der Coins am Stichtag (CoinGecko, privat im Archiv) – nie der heutige Wert (Rückschaufehler)
const boersenwerte = new Map<string, Map<string, number>>();
{
  const p = join(ARCHIV, 'stamm', 'krypto-boersenwert.csv.gz');
  if (existsSync(p)) for (const z of parseBoersenwertCsv(gz(p))) (boersenwerte.get(z.symbol) ?? boersenwerte.set(z.symbol, new Map()).get(z.symbol)!).set(z.datum, z.cap);
  log(`Börsenwert: ${boersenwerte.size} Coins mit Verlauf.`);
}

// Zahlen-Termine und Branchen (SEC EDGAR, privat im Archiv): Abstand zum letzten Reaktionstag auf Quartalszahlen – nur
// Vergangenes, künftige Termine fließen nicht ein – und die Branche aus dem SIC-Code
let zahlenAb = '9999-12-31';
const firmen = new Map<string, ZahlenFirma>();
{
  const p = join(ARCHIV, 'stamm', 'us-zahlen.json.gz');
  if (existsSync(p)) {
    const a = JSON.parse(gz(p)) as ZahlenArchiv;
    zahlenAb = a.ab;
    for (const [t, f] of firmaJeTicker(a)) firmen.set(t, f);
  }
  const mit = new Set(reihen.filter((r) => r.markt === 'aktie' && firmen.has(r.schluessel.slice(2).split('#')[0])).map((r) => r.schluessel.split('#')[0]));
  const mitArten = new Set(reihen.filter((r) => r.markt === 'aktie' && meldungenErfasst(firmen.get(r.schluessel.slice(2).split('#')[0]))).map((r) => r.schluessel.split('#')[0]));
  log(`Zahlen-Termine (SEC): ${firmen.size} Kürzel, ${mit.size} US-Reihen mit Zahlen und Branche, ${mitArten.size} mit weiteren Meldungsarten, vollständig ab ${firmen.size ? zahlenAb : '–'}.`);
}
/** Abstand zum Zahlen-Reaktionstag je Stichtag der zuletzt gefragten Reihe (die Durchgänge gehen Reihe für Reihe vor) */
let zahlenCache: { r: Reihe; je: Map<string, number | null> } | null = null;
const zahlenAm = (r: Reihe, datum: string): number | null => {
  if (r.markt !== 'aktie') return null;
  const f = firmen.get(r.schluessel.slice(2).split('#')[0]);
  // ohne eine einzige Zahlen-Meldung in zwei Jahren (ausländische Firmen melden per 6-K, Fonds gar nicht): unbekannt, nicht „keine Zahlen“
  if (!f || !f.zahlen.length) return null;
  if (zahlenCache?.r !== r) {
    const daten = r.kerzen.map((k) => k.datum);
    const abst = zahlenAbstaende(daten, f.zahlen, zahlenAb);
    zahlenCache = { r, je: new Map(daten.map((d, i) => [d, abst[i]])) };
  }
  return zahlenCache.je.get(datum) ?? null;
};
/** Abstand zur letzten Meldung je Art (Kapitalerhöhung, Großaktionär, 8-K-Punkte) – unbekannt, solange die Firma nicht mit den Meldungsarten erfasst ist */
let meldungCache: { r: Reihe; je: Map<string, Map<string, number | null>> } | null = null;
const meldungAm = (r: Reihe, datum: string, art: MeldungArt): number | null => {
  if (r.markt !== 'aktie') return null;
  const f = firmen.get(r.schluessel.slice(2).split('#')[0]);
  if (!meldungenErfasst(f)) return null;
  if (meldungCache?.r !== r) {
    const daten = r.kerzen.map((k) => k.datum);
    const je = new Map<string, Map<string, number | null>>();
    for (const a of MELDUNG_ARTEN) {
      const abst = zahlenAbstaende(daten, f!.meldungen?.[a] ?? [], zahlenAb);
      je.set(a, new Map(daten.map((d, i) => [d, abst[i]])));
    }
    meldungCache = { r, je };
  }
  return meldungCache.je.get(art)?.get(datum) ?? null;
};
// Leerverkaufsanteil (FINRA, privat im Archiv): je Kürzel ein Float32Array über alle Archivtage (NaN = keine Angabe)
const leerTage: string[] = [];
const leerJe = new Map<string, Float32Array>();
{
  const ordner = join(ARCHIV, 'leerverkauf');
  const dateien = existsSync(ordner)
    ? readdirSync(ordner)
        .filter((j) => /^\d{4}$/.test(j))
        .flatMap((j) => readdirSync(join(ordner, j)).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(f)).map((f) => join(ordner, j, f)))
        .sort()
    : [];
  for (const f of dateien) leerTage.push(f.slice(-17, -7));
  const usKuerzel = new Set(reihen.filter((r) => r.markt === 'aktie').map((r) => r.schluessel.slice(2).split('#')[0]));
  dateien.forEach((f, ti) => {
    for (const [k, q] of leerquotenAusCsv(gz(f))) {
      if (!usKuerzel.has(k)) continue;
      let a = leerJe.get(k);
      if (!a) leerJe.set(k, (a = new Float32Array(dateien.length).fill(Number.NaN)));
      a[ti] = q;
    }
  });
  log(`Leerverkauf (FINRA): ${leerTage.length} Tage (${leerTage[0] ?? '–'} bis ${leerTage[leerTage.length - 1] ?? '–'}), ${leerJe.size} US-Kürzel.`);
}
const leerTagIndex = new Map(leerTage.map((d, i) => [d, i]));
let leerCache: { r: Reihe; quote: Map<string, number | null>; abw: Map<string, number | null> } | null = null;
const leerAm = (r: Reihe, datum: string): { leerquote: number | null; leerquoteRel: number | null } => {
  if (r.markt !== 'aktie') return { leerquote: null, leerquoteRel: null };
  const a = leerJe.get(r.schluessel.slice(2).split('#')[0]);
  if (!a) return { leerquote: null, leerquoteRel: null };
  if (leerCache?.r !== r) {
    const daten = r.kerzen.map((k) => k.datum);
    const x = leerquotenReihe(daten, (d) => {
      const i = leerTagIndex.get(d);
      const v = i === undefined ? Number.NaN : a[i];
      return Number.isNaN(v) ? undefined : Math.round(v * 10) / 10;
    });
    leerCache = { r, quote: new Map(daten.map((d, i) => [d, x.quote[i]])), abw: new Map(daten.map((d, i) => [d, x.abweichung[i]])) };
  }
  return { leerquote: leerCache.quote.get(datum) ?? null, leerquoteRel: leerCache.abw.get(datum) ?? null };
};
// Insider-Käufe (SEC Formular 4, privat im Archiv): Handelstage seit dem letzten Kauf – bekannt nur im lückenlos erfassten
// Bereich (ab Beginn + 30 Tage Vorlauf bis zum letzten erfassten Tag), sonst unbekannt statt „kein Kauf“
const insider: InsiderArchiv | null = (() => {
  const pf = join(ARCHIV, 'stamm', 'insider.json.gz');
  return existsSync(pf) ? (JSON.parse(gz(pf)) as InsiderArchiv) : null;
})();
const insiderAb = insider?.ab ? new Date(Date.parse(`${insider.ab}T12:00:00Z`) + 30 * 86400000).toISOString().slice(0, 10) : null;
log(`Insider-Käufe (SEC): ${insider ? Object.values(insider.kaeufe).reduce((a, l) => a + l.length, 0) : 0} Käufe, bekannt ${insiderAb ?? '–'} bis ${insider?.bis ?? '–'}.`);
let insiderCache: { r: Reihe; je: Map<string, number | null> } | null = null;
const insiderAm = (r: Reihe, datum: string): number | null => {
  if (r.markt !== 'aktie' || !insider || !insiderAb || !insider.bis || datum < insiderAb || datum > insider.bis) return null;
  if (insiderCache?.r !== r) {
    const daten = r.kerzen.map((k) => k.datum);
    const liste = (insider.kaeufe[r.schluessel.slice(2).split('#')[0]] ?? []).map((x) => [x[0], x[1]] as [string, string]);
    const abst = zahlenAbstaende(daten, liste, insiderAb);
    insiderCache = { r, je: new Map(daten.map((d, i) => [d, abst[i]])) };
  }
  return insiderCache.je.get(datum) ?? null;
};
// Leerverkaufsbestand (FINRA Short Interest, privat im Archiv): je Stichtag-Datei Tage zum Eindecken und Änderung des
// Bestands; eine Datei gilt erst ab ihrer Veröffentlichung (12–18 Tage nach dem FINRA-Stichtag), höchstens 45 Tage
const lbDateien: { stichtag: string; ab: string }[] = [];
const lbJe = new Map<string, Float32Array>();
{
  const ordner = join(ARCHIV, 'leerbestand');
  const dateien = existsSync(ordner)
    ? readdirSync(ordner)
        .filter((j) => /^\d{4}$/.test(j))
        .flatMap((j) => readdirSync(join(ordner, j)).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(f)).map((f) => join(ordner, j, f)))
        .sort()
    : [];
  const usKuerzel = new Set(reihen.filter((r) => r.markt === 'aktie').map((r) => r.schluessel.slice(2).split('#')[0]));
  dateien.forEach((f, i) => {
    const stichtag = f.slice(-17, -7);
    const { ab, werte } = leerbestandAusCsv(gz(f), stichtag);
    lbDateien.push({ stichtag, ab });
    for (const [k, w] of werte) {
      if (!usKuerzel.has(k)) continue;
      let a = lbJe.get(k);
      if (!a) lbJe.set(k, (a = new Float32Array(dateien.length * 2).fill(Number.NaN)));
      a[2 * i] = w.tage ?? Number.NaN;
      a[2 * i + 1] = w.aenderung ?? Number.NaN;
    }
  });
  const letzte = lbDateien[lbDateien.length - 1];
  log(`Leerverkaufsbestand (FINRA): ${lbDateien.length} Stichtage (${lbDateien[0]?.stichtag ?? '–'} bis ${letzte?.stichtag ?? '–'}, veröffentlicht ${letzte?.ab ?? '–'}), ${lbJe.size} US-Kürzel.`);
}
const lbDateiAm = new Map<string, number>();
const leerbestandAm = (r: Reihe, datum: string): { bestandTage: number | null; bestandAenderung: number | null } => {
  const a = r.markt === 'aktie' ? lbJe.get(r.schluessel.slice(2).split('#')[0]) : undefined;
  if (!a) return { bestandTage: null, bestandAenderung: null };
  let i = lbDateiAm.get(datum);
  if (i === undefined) lbDateiAm.set(datum, (i = leerbestandDatei(lbDateien, datum)));
  if (i < 0) return { bestandTage: null, bestandAenderung: null };
  const t = a[2 * i];
  const c = a[2 * i + 1];
  return { bestandTage: Number.isNaN(t) ? null : Math.round(t * 100) / 100, bestandAenderung: Number.isNaN(c) ? null : Math.round(c * 10) / 10 };
};
const brancheVon = (r: Reihe): number | null => (r.markt === 'aktie' ? brancheAusSic(firmen.get(r.schluessel.slice(2).split('#')[0])?.sic) : null);

// ---------- 2. Kosten je Wertklasse ----------
const spreadProzent = (klasseName: string) => (cfg.spreads.klassen as Record<string, { prozent: number }>)[klasseName]?.prozent ?? 3;
const kosten = (markt: Markt, umsatz20: number | null): EtikettKosten => {
  const h = vt.handelbar;
  const e = vt.etikett;
  const basis = { einsatz: e.einsatz, ziel: e.ziel, beinahe: e.beinahe, turboSpreadProzent: spreadProzent(e.turboSpreadKlasse), entgeltTurbo: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.aktie.handelsplatz, emittent: e.turboEmittent }).gesamt, finanzierungProzentJahr: e.finanzierungProzentJahr };
  if (markt === 'krypto') return { ...basis, spreadProzent: spreadProzent(h.krypto.spreadKlasse), entgeltDirekt: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.krypto.handelsplatz }).gesamt };
  const klasseName = h.aktie.spread.find((s) => (umsatz20 ?? 0) >= s.abUmsatz20)?.klasse ?? 'spekulativ';
  return { ...basis, spreadProzent: spreadProzent(klasseName), entgeltDirekt: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.aktie.handelsplatz }).gesamt };
};
const kostenCache = new Map<string, EtikettKosten>();
const kostenFuer = (markt: Markt, umsatz20: number | null) => {
  const s = markt === 'krypto' ? 'krypto' : (vt.handelbar.aktie.spread.find((x) => (umsatz20 ?? 0) >= x.abUmsatz20)?.klasse ?? 'spekulativ');
  return kostenCache.get(s) ?? kostenCache.set(s, kosten(markt, umsatz20)).get(s)!;
};

// Handelbarkeits-Karte aus gettex (stamm/handelbar.json): sobald sie auf mindestens 10 gettex-Tagen beruht, zählen nur
// US-Aktien, die an gettex gehandelt werden (heutige Karte auf die Vergangenheit angewandt – Näherung). Vorher: Umsatzregel.
const gettexUs: Set<string> | null = (() => {
  const p = join(ARCHIV, 'stamm', 'handelbar.json');
  if (!existsSync(p)) return null;
  const h = JSON.parse(readFileSync(p, 'utf8')) as { gettexTage: number; isins: Record<string, { art: string; usTicker?: string }> };
  if (h.gettexTage < 10) return null;
  return new Set(Object.values(h.isins).flatMap((x) => (x.art === 'aktie' && x.usTicker ? [x.usTicker] : [])));
})();
log(gettexUs ? `Handelbarkeit: gettex-Karte mit ${gettexUs.size} US-Aktien.` : 'Handelbarkeit: Näherung über Umsatz (gettex-Karte hat noch keine 10 Tage).');

/** Gilt der Wert am Stichtag als handelbar? */
function handelbar(r: Reihe, m: Merkmale, k: Kerze): boolean {
  if (r.markt === 'aktie') {
    if (gettexUs && !gettexUs.has(r.schluessel.slice(2).replace(/#\d+$/, ''))) return false;
    return m.kurs >= vt.handelbar.aktie.mindestKurs && (k.v ?? 0) * k.c >= vt.handelbar.aktie.mindestUmsatzStichtag;
  }
  return (k.v ?? 0) * k.c >= vt.handelbar.krypto.mindestUmsatzStichtag && (m.schwankung20 === null || m.schwankung20 >= vt.handelbar.krypto.mindestSchwankung20);
}
// Echte Handelbarkeit (seit 16.11.2026): Hebelprodukte je Basiswert in Deutschland (OpenFIGI, Cache privat im Archiv
// stamm/turbos.json). Wo ein Wert geprüft ist, gilt statt der Umsatz-Näherung, ob es Produkte in der Richtung der
// Spielart gibt (Call = long, Put = short) – die heutige Karte, auf die Vergangenheit angewandt (Näherung).
const turboPfad = join(ARCHIV, 'stamm', 'turbos.json');
const turboCache: Record<string, TurboStand> = existsSync(turboPfad) ? (JSON.parse(readFileSync(turboPfad, 'utf8')) as Record<string, TurboStand>) : {};
log(`Turbos: ${Object.keys(turboCache).length} US-Werte geprüft (${Object.values(turboCache).filter((t) => t.short > 0).length} mit Puts, ${Object.values(turboCache).filter((t) => t.long > 0).length} mit Calls).`);
const turboErlaubt = (r: Reihe, m: Merkmale, richtung: 'long' | 'short') => {
  if (r.markt === 'krypto') return vt.handelbar.krypto.turboBasiswerte.includes(r.schluessel.slice(2)) || (r.schluessel === 'K:BTC' && vt.handelbar.krypto.turboBasiswerte.includes('XBT'));
  return turboDa(turboCache[r.schluessel.slice(2).split('#')[0]], richtung) ?? (m.umsatz20 ?? 0) >= vt.handelbar.aktie.turboAbUmsatz20;
};
/** beide Richtungen auf einmal (je Stichtag einmal statt je Spielart) */
const turbosAm = (r: Reihe, m: Merkmale) => ({ long: turboErlaubt(r, m, 'long'), short: turboErlaubt(r, m, 'short') });

// ---------- 3. Durchgang 1: Merkmale, Marktbewegung je Tag, Zeiträume ----------
// Merkmale werden nicht vorgehalten (Speicher), sondern im zweiten Durchgang neu berechnet
const r1JeTag: Record<Markt, Map<string, number[]>> = { aktie: new Map(), krypto: new Map() };
for (const r of reihen) {
  r.kerzen.forEach((_, i) => {
    const x = merkmale(r.kerzen, i);
    if (!x || !handelbar(r, x, r.kerzen[i])) return;
    const d = r.kerzen[i].datum;
    (r1JeTag[r.markt].get(d) ?? r1JeTag[r.markt].set(d, []).get(d)!).push(x.r1);
  });
}
const marktR1: Record<Markt, Map<string, number>> = { aktie: new Map(), krypto: new Map() };
for (const markt of ['aktie', 'krypto'] as Markt[]) for (const [d, xs] of r1JeTag[markt]) marktR1[markt].set(d, xs.length >= 20 ? median(xs) : 0);
const alleTage = [...new Set([...r1JeTag.aktie.keys(), ...r1JeTag.krypto.keys()])].sort();
// Marktumfeld je Tag: Marktbreite und 5-Tage-Bewegung je Markt (aus den eigenen Daten), VIX und Abstand zum Zinsentscheid
const breiteJeTag: Record<Markt, Map<string, number | null>> = { aktie: new Map(), krypto: new Map() };
const markt5JeTag: Record<Markt, Map<string, number | null>> = { aktie: new Map(), krypto: new Map() };
for (const markt of ['aktie', 'krypto'] as Markt[]) {
  const tage = [...r1JeTag[markt].keys()].sort();
  const werte = tage.map((d) => marktR1[markt].get(d) ?? 0);
  tage.forEach((d, i) => {
    breiteJeTag[markt].set(d, breite(r1JeTag[markt].get(d) ?? []));
    markt5JeTag[markt].set(d, summeBis(werte, i, 5));
  });
}
const umfeldCfg = JSON.parse(readFileSync(join(process.cwd(), 'config', 'umfeld.json'), 'utf8')) as { fedEntscheide: string[] };
const vixReihe: [string, number][] = (() => {
  const pf = join(ARCHIV, 'stamm', 'umfeld.json.gz');
  return existsSync(pf) ? (JSON.parse(gz(pf)) as UmfeldArchiv).vix : [];
})();
const umfeldJeTag = new Map(alleTage.map((d) => [d, { vix: wertAm(vixReihe, d), vix5: aenderungAm(vixReihe, d), fed: fedAbstand(d, umfeldCfg.fedEntscheide) }]));
log(`Marktumfeld: VIX ${vixReihe.length} Tage (${[...umfeldJeTag.values()].filter((u) => u.vix !== null).length} von ${alleTage.length} Stichtagen), Zinsentscheide ${umfeldCfg.fedEntscheide.length}.`);
const grenze = alleTage[Math.floor(alleTage.length / 2)] ?? heute;
log(`Merkmale berechnet. Stichtage von ${alleTage[0]} bis ${alleTage[alleTage.length - 1]}; Zeitraum B ab ${grenze}.`);

// ---------- 4. Gruppen und Zählwerk ----------
const E = vt.pruefung.einteilungen;
const MAERKTE: Markt[] = ['aktie', 'krypto'];
const gruppen: string[] = [];
const gid = new Map<string, number>();
const neueGruppe = (name: string) => (gid.has(name) ? gid.get(name)! : (gid.set(name, gruppen.length), gruppen.push(name), gruppen.length - 1));
const klassenZahl = (e: Einteilung) => e.grenzen.length + 1;
for (const markt of MAERKTE) {
  neueGruppe(`${markt}|alle`);
  E.forEach((e, a) => {
    for (let c = 0; c < klassenZahl(e); c++) neueGruppe(`${markt}|${a}=${c}`);
  });
  for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) for (let ca = 0; ca < klassenZahl(E[a]); ca++) for (let cb = 0; cb < klassenZahl(E[b]); cb++) neueGruppe(`${markt}|${a}=${ca}&${b}=${cb}`);
  for (const h of HYPOTHESEN) if (h.markt === 'alle' || h.markt === markt) neueGruppe(`${markt}|hyp=${h.nr}`);
}
const SP = spielarten(vt.etikett.hebel, vt.etikett.stops, vt.etikett.nachzieh);
const F = vt.etikett.fenster;
const standard = SP.map((s) => s.stopEuro === vt.etikett.standardStop);
const paarF = F.map((f) => vt.pruefung.paareFenster.includes(f));
const zw = new Zaehlwerk(gruppen.length, SP.length, F.length, 2);
log(`${gruppen.length} Gruppen, ${SP.length} Spielarten, ${F.length} Fenster.`);

type Kontext = { marktR1: number; ueberrendite1: number; boersenwert: number | null; zahlen: number | null; branche: number | null; vix: number | null; vix5: number | null; fed: number | null; breite: number | null; markt5: number | null; leerquote: number | null; leerquoteRel: number | null; insider: number | null; bestandTage: number | null; bestandAenderung: number | null } & Partial<Record<MeldungArt, number | null>>;
const KONTEXT_MERKMALE = new Set<string>(['marktR1', 'ueberrendite1', 'boersenwert', 'zahlen', 'branche', 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung', ...MELDUNG_ARTEN]);
const merkmalWert = (e: Einteilung, m: Merkmale, kontext: Kontext): number | null =>
  KONTEXT_MERKMALE.has(e.merkmal) ? (kontext[e.merkmal as keyof Kontext] ?? null) : (m[e.merkmal as keyof Merkmale] as number | null);
/** Meldungsarten, nach denen die Einteilungen fragen (nur die werden je Stichtag gerechnet) */
const GEFRAGTE_ARTEN = MELDUNG_ARTEN.filter((a) => E.some((e) => e.merkmal === a));
const LEER_GEFRAGT = E.some((e) => e.merkmal === 'leerquote' || e.merkmal === 'leerquoteRel');
const INSIDER_GEFRAGT = E.some((e) => e.merkmal === 'insider');
const LB_GEFRAGT = E.some((e) => e.merkmal === 'bestandTage' || e.merkmal === 'bestandAenderung');
/** Klasse je Einteilung an einem Stichtag (Durchgang 2 und Klumpen-Prüfung rechnen genau gleich) */
const klassenAm = (r: Reihe, x: Merkmale, datum: string) => {
  const mr = marktR1[r.markt].get(datum) ?? 0;
  const kontext: Kontext = { marktR1: mr, ueberrendite1: x.r1 - mr, boersenwert: r.markt === 'krypto' ? boersenwertAm(boersenwerte.get(r.schluessel.slice(2)), datum) : null, zahlen: zahlenAm(r, datum), branche: brancheVon(r), ...(umfeldJeTag.get(datum) ?? { vix: null, vix5: null, fed: null }), breite: breiteJeTag[r.markt].get(datum) ?? null, markt5: markt5JeTag[r.markt].get(datum) ?? null, ...(LEER_GEFRAGT ? leerAm(r, datum) : { leerquote: null, leerquoteRel: null }), insider: INSIDER_GEFRAGT ? insiderAm(r, datum) : null, ...(LB_GEFRAGT ? leerbestandAm(r, datum) : { bestandTage: null, bestandAenderung: null }) };
  for (const a of GEFRAGTE_ARTEN) kontext[a] = meldungAm(r, datum, a);
  return E.map((e) => klasse(merkmalWert(e, x, kontext), e.grenzen));
};

// ---------- 4b. Signale der Datenkrake (seit 28.10.2026) – was war vor einem Sprung bekannt? ----------
interface Sig {
  datum: string;
  typ: string;
}
const signaleJe = new Map<string, Sig[]>();
{
  const ordner = join(process.env.SIGNALE_DIR ?? process.env.DATEN_DIR ?? '_daten', 'signale', 'tag');
  let zahl = 0;
  if (existsSync(ordner))
    for (const f of readdirSync(ordner).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      const d = JSON.parse(readFileSync(join(ordner, f), 'utf8')) as { signale?: { s: string; m?: string; typ: string; z?: string }[] };
      for (const x of d.signale ?? []) {
        const sch = schluesselNormal(x.s, x.m);
        (signaleJe.get(sch) ?? signaleJe.set(sch, []).get(sch)!).push({ datum: (x.z ?? f).slice(0, 10), typ: x.typ });
        zahl++;
      }
    }
  log(`Signale der Datenkrake: ${zahl} aus ${ordner} (${signaleJe.size} Werte).`);
}
// Signal-Prüfung: je Signaltyp Fälle (je Wert höchstens einmal in 10 Handelstagen) und Volltreffer ab dem Folgetag
const sigStat = new Map<string, { n: number; treffer: number; markt: Markt }>();
// Grundrate je Markt und Tag (fertige Etiketten)
const tagStat = new Map<string, { n: number; treffer: number }>();
interface BuchEintrag {
  datum: string;
  wert: string;
  markt: Markt;
  spielart: string;
  netto: number;
  tage: number;
  r1: number;
  relVolumen: number | null;
  vorzeichen: { typ: string; datum: string }[];
}
const trefferbuch: BuchEintrag[] = [];
const buchAb = new Date(Date.parse(heute) - 30 * 86400000).toISOString().slice(0, 10);

// ---------- 4c. Muster-Buch (V4): Muster im Vorwärtstest – gezählt wird nur, was NACH dem Eintrag geschah ----------
interface BuchMuster {
  schluessel: string;
  gruppe: string;
  gruppenSchluessel: string;
  sp: string;
  fenster: number;
  seit: string;
  wertung: number;
  rueckblick: { quote: number; ev: number; se: number; faelle: number };
  status: string;
  /** bei „beendet“: Tag des Endes und Grund */
  am?: string;
  grund?: string;
}
const musterBuch = leseJson<{ eintraege: BuchMuster[] }>('lernen/muster/muster-buch.json', { eintraege: [] });
// alle Muster (jüngster Eintrag je Schlüssel); beendete zählen ihre Fälle bis zum Ende weiter, damit keine Jagd nachträglich verschwindet
const alleMuster = new Map<string, BuchMuster>();
for (const e of musterBuch.eintraege) alleMuster.set(e.schluessel, e);
const imTest = new Map([...alleMuster].filter(([, e]) => e.status !== 'beendet'));
const testJeGruppe = new Map<number, BuchMuster[]>();
for (const e of alleMuster.values()) {
  const g = gid.get(e.gruppenSchluessel);
  if (g !== undefined) (testJeGruppe.get(g) ?? testJeGruppe.set(g, []).get(g)!).push(e);
}
const spNachSchluessel = new Map(SP.map((sp) => [spielartSchluessel(sp), sp]));
const vorwaerts: JagdFall[] = [];
const FENSTER_ALLE = (f: number) => Array.from({ length: f }, (_, n) => n + 1);
/** Fall eines Musters im Vorwärtstest: Ausgang, laufend oder noch lauernd (kein Folgetag) */
const SEC_NAME: Record<MeldungArt, string> = { angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: '13D-Meldung (Großaktionär)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz/Delisting/Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzungsänderung (8-K 5.03, oft Aktiensplit)' };
function jagdFall(r: Reihe, i: number, e: BuchMuster, kosten: EtikettKosten): JagdFall | null {
  const sp = spNachSchluessel.get(e.sp);
  if (!sp) return null;
  const k = r.kerzen;
  // V4: Pump-Verdacht (Hype-Signale ohne harte Fakten in den 3 Tagen bis zum Stichtag, Regel wie in der Datenkrake) –
  // solche Fälle zählen für das Muster, werden aber weder gejagt noch sichtbar geordert
  const von = new Date(Date.parse(`${k[i].datum}T12:00:00Z`) - 3 * 86400000).toISOString().slice(0, 10);
  const typen = (signaleJe.get(r.schluessel.split('#')[0]) ?? []).filter((x) => x.datum >= von && x.datum <= k[i].datum).map((x) => x.typ);
  const pump = pumpVerdacht(typen, { kurs: k[i].c });
  // V5: amtliche SEC-Meldungen der letzten 20 Handelstage als Hinweis für Claudes Urteil (öffentlich, gemeinfrei)
  const sec: string[] = [];
  const wann = (d: number) => (d === 0 ? 'am Stichtag' : d === 1 ? 'am Vortag' : `vor ${d} Handelstagen`);
  const za = zahlenAm(r, k[i].datum);
  if (za !== null && za <= 20) sec.push(`Quartalszahlen ${wann(za)}`);
  for (const a of MELDUNG_ARTEN) {
    const d = meldungAm(r, k[i].datum, a);
    if (d !== null && d <= 20) sec.push(`${SEC_NAME[a]} ${wann(d)}`);
  }
  const ins = insiderAm(r, k[i].datum);
  if (ins !== null && ins <= 20) sec.push(`Insider-Kauf ${wann(ins)}`);
  const basis = { muster: e.schluessel, wertung: e.wertung, wert: r.schluessel.slice(2).split('#')[0], markt: r.markt, stichtag: k[i].datum, fenster: e.fenster, spielart: spielartText(sp), ...(pump ? { pump: true } : {}), ...(sec.length ? { hinweis: `SEC: ${sec.join(', ')}` } : {}) };
  if (!k[i + 1]) return { ...basis, einstieg: null, ende: null, art: 'lauert', netto: null, tag: null };
  const res = etikett(k, i, sp, kosten, FENSTER_ALLE(e.fenster));
  const fertig = res.find((a) => a && a.art !== 'zeit') ?? res[e.fenster - 1];
  if (fertig) return { ...basis, einstieg: k[i + 1].datum, ende: k[i + fertig.tag]?.datum ?? null, art: fertig.art, netto: fertig.netto, tag: fertig.tag };
  const stand = [...res].reverse().find((a) => a);
  return { ...basis, einstieg: k[i + 1].datum, ende: null, art: 'offen', netto: stand?.netto ?? 0, tag: stand?.tag ?? 1 };
}

// ---------- 5. Durchgang 2: Etiketten, Zensus, Hypothesen ----------
interface Episode {
  datum: string;
  schluessel: string;
  markt: Markt;
  spielart: string;
  fenster: number;
  netto: number;
  tag: number;
  umsatz20: number | null;
  r1: number;
  relVolumen: number | null;
}
const episoden: Episode[] = [];
let stichtage = 0;
const hypFaelle: Record<string, number> = {};

for (const r of reihen) {
  const k = r.kerzen;
  const m = k.map((_, i) => merkmale(k, i));
  const treffer: boolean[] = new Array(k.length).fill(false);
  const fertig: boolean[] = new Array(k.length).fill(false);
  const bester: (Episode | null)[] = new Array(k.length).fill(null);
  // Ehrliche Fallzahl: je Wert und Gruppe höchstens ein Fall in `sperreTage` Handelstagen (wie bei den Hypothesen)
  const gezaehltAm = new Int32Array(gruppen.length).fill(-1e9);
  const sperre = vt.pruefung.sperreTage;
  const ausg = (i: number, sp: Spielart, x: Merkmale) => etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20), F);
  const testZuletzt = new Map<string, number>();
  const imVorwaerts = (gruppen: number[], i: number, x: Merkmale) => {
    for (const g of gruppen) {
      for (const e of testJeGruppe.get(g) ?? []) {
        if (k[i].datum <= e.seit || (e.status === 'beendet' && e.am && k[i].datum > e.am) || i - (testZuletzt.get(e.schluessel) ?? -1e9) <= vt.pruefung.sperreTage) continue;
        const sp = spNachSchluessel.get(e.sp);
        if (!sp || (sp.hebel > 1 && !turboErlaubt(r, x, sp.richtung))) continue;
        const fall = jagdFall(r, i, e, kostenFuer(r.markt, x.umsatz20));
        if (fall) {
          vorwaerts.push(fall);
          testZuletzt.set(e.schluessel, i);
        }
      }
    }
  };
  for (let i = 1; i < k.length; i++) {
    const x = m[i];
    if (!x || !handelbar(r, x, k[i])) continue;
    stichtage++;
    const z = k[i].datum < grenze ? 0 : 1;
    const klassen = klassenAm(r, x, k[i].datum);
    const gAlle = gid.get(`${r.markt}|alle`)!;
    const gEinzel = klassen.map((c, a) => (c === null ? -1 : gid.get(`${r.markt}|${a}=${c}`)!));
    const gPaare: number[] = [];
    for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) if (klassen[a] !== null && klassen[b] !== null) gPaare.push(gid.get(`${r.markt}|${a}=${klassen[a]}&${b}=${klassen[b]}`)!);
    if (testJeGruppe.size) imVorwaerts([...gEinzel.filter((g) => g >= 0), ...gPaare], i, x);
    const frei = (g: number) => g >= 0 && i - gezaehltAm[g] > sperre;
    const alleFrei = frei(gAlle);
    const einzelFrei = gEinzel.filter(frei);
    const paareFrei = gPaare.filter(frei);
    let gezaehlt = false;
    const turbo = turbosAm(r, x);
    SP.forEach((sp, s) => {
      if (sp.hebel > 1 && !turbo[sp.richtung]) return;
      const a = ausg(i, sp, x);
      a.forEach((au, f) => {
        if (!au) return;
        if (F[f] === 10 || au.art === 'treffer') fertig[i] = true;
        gezaehlt = true;
        if (alleFrei) zw.add(gAlle, s, f, z, au);
        if (!standard[s]) return;
        for (const g of einzelFrei) zw.add(g, s, f, z, au);
        if (paarF[f]) for (const g of paareFrei) zw.add(g, s, f, z, au);
        // Zensus: echter Sprung – Volltreffer mit Standard-Stop binnen 10 Handelstagen, höchstens Hebel zensusMaxHebel
        if (au.art === 'treffer' && sp.nachziehAb === undefined && F[f] <= 10 && sp.hebel <= vt.etikett.zensusMaxHebel && (!bester[i] || au.netto > bester[i]!.netto)) {
          treffer[i] = true;
          bester[i] = { datum: k[i].datum, schluessel: r.schluessel.replace(/#\d+$/, ''), markt: r.markt, spielart: spielartText(sp), fenster: F[f], netto: au.netto, tag: au.tag, umsatz20: x.umsatz20, r1: Math.round(x.r1 * 10) / 10, relVolumen: x.relVolumen === null ? null : Math.round(x.relVolumen * 10) / 10 };
        }
      });
    });
    if (gezaehlt) for (const g of [alleFrei ? gAlle : -1, ...einzelFrei, ...paareFrei]) if (g >= 0) gezaehltAm[g] = i;
  }
  for (const i of sprungEpisoden(treffer, vt.etikett.episodeAbstand)) if (bester[i]) episoden.push(bester[i]!);
  // Grundrate je Tag und Markt
  for (let i = 0; i < k.length; i++) {
    if (!fertig[i]) continue;
    const key = `${r.markt}|${k[i].datum}`;
    const t = tagStat.get(key) ?? tagStat.set(key, { n: 0, treffer: 0 }).get(key)!;
    t.n++;
    if (treffer[i]) t.treffer++;
  }
  const schluessel = r.schluessel.replace(/#\d+$/, '');
  const sigs = signaleJe.get(schluessel) ?? [];
  // Signal-Prüfung: Stichtag = erster Handelstag am oder nach dem Signal
  const zuletzt = new Map<string, number>();
  for (const sg of [...sigs].sort((a, b) => a.datum.localeCompare(b.datum))) {
    const i = k.findIndex((x) => x.datum >= sg.datum);
    if (i < 1 || !fertig[i]) continue;
    if (i - (zuletzt.get(sg.typ) ?? -Infinity) <= vt.pruefung.sperreTage) continue;
    zuletzt.set(sg.typ, i);
    const key = `${r.markt}|${sg.typ}`;
    const st = sigStat.get(key) ?? sigStat.set(key, { n: 0, treffer: 0, markt: r.markt }).get(key)!;
    st.n++;
    if (treffer[i]) st.treffer++;
  }
  // Trefferbuch: Volltreffer der letzten 30 Tage mit den Vorzeichen der 14 Tage davor
  for (const i of sprungEpisoden(treffer, vt.etikett.episodeAbstand)) {
    const e = bester[i];
    if (!e || e.datum < buchAb) continue;
    const von = new Date(Date.parse(e.datum) - 14 * 86400000).toISOString().slice(0, 10);
    const vorzeichen = sigs.filter((sg) => sg.datum >= von && sg.datum <= e.datum).map((sg) => ({ typ: sg.typ, datum: sg.datum }));
    trefferbuch.push({ datum: e.datum, wert: schluessel.slice(2), markt: r.markt, spielart: e.spielart, netto: e.netto, tage: e.tag, r1: e.r1, relVolumen: e.relVolumen, vorzeichen: [...new Map(vorzeichen.map((v) => [v.typ + v.datum, v])).values()].slice(0, 8) });
  }
  // Hypothesen: eigene Fälle (derselbe Wert erst nach der Sperre wieder)
  for (const h of HYPOTHESEN) {
    if (h.markt !== 'alle' && h.markt !== r.markt) continue;
    const g = gid.get(`${r.markt}|hyp=${h.nr}`)!;
    for (const i of hypothesenFaelle(h, k, m, vt.pruefung.sperreTage)) {
      const x = m[i];
      if (!x || !handelbar(r, x, k[i])) continue;
      if (testJeGruppe.has(g)) imVorwaerts([g], i, x);
      if (i >= k.length - 1) continue;
      hypFaelle[h.nr] = (hypFaelle[h.nr] ?? 0) + 1;
      const z = k[i].datum < grenze ? 0 : 1;
      const turbo = turbosAm(r, x);
      SP.forEach((sp, s) => {
        if (sp.hebel > 1 && !turbo[sp.richtung]) return;
        ausg(i, sp, x).forEach((au, f) => au && zw.add(g, s, f, z, au));
      });
    }
  }
}
log(`${stichtage} handelbare Stichtage, ${episoden.length} Sprung-Episoden, Hypothesen-Fälle: ${JSON.stringify(hypFaelle)}.`);

// ---------- 6. Auswertung ----------
const MERKMAL_TEXT: Record<string, string> = { r1: 'Tagesrendite %', r5: '5-Tage-Rendite %', r20: '20-Tage-Rendite %', relVolumen: 'Umsatz (× Ø 20 Tage)', relSpanne: 'Tagesspanne (× Ø 20 Tage)', abstandHoch20: '20-Tage-Hoch', abstandHoch250: 'Abstand zum Jahreshoch %', lageSchluss: 'Schluss in der Tagesspanne (0 = Tief, 1 = Hoch)', luecke: 'Kurslücke %', schwankung20: 'Schwankung je Tag %', umsatz20: 'Ø Tagesumsatz', kurs: 'Kurs', ueberrendite1: 'Tagesrendite über dem Markt %', marktR1: 'Markt am Stichtag %', boersenwert: 'Börsenwert (Coins)', zahlen: 'Quartalszahlen', branche: 'Branche', angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: 'Großaktionär (13D)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz, Delisting, Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzung/Aktiensplit (8-K 5.03)', vix: 'VIX (Angstbarometer)', vix5: 'VIX-Änderung 5 Tage', fed: 'Zinsentscheid der Fed', breite: 'Marktbreite', markt5: 'Markt 5 Tage', leerquote: 'Leerverkaufsanteil', leerquoteRel: 'Leerverkäufe gegen den eigenen Schnitt', insider: 'Insider-Kauf (Formular 4)', bestandTage: 'Leerverkaufsbestand: Tage zum Eindecken', bestandAenderung: 'Leerverkaufsbestand gegen den vorigen FINRA-Stichtag' };
const gruppenText = (name: string) => {
  const [markt, rest] = name.split('|');
  const marktText = markt === 'aktie' ? 'Aktien' : 'Krypto';
  if (rest === 'alle') return `${marktText}: alle handelbaren Stichtage`;
  if (rest.startsWith('hyp=')) {
    const h = HYPOTHESEN.find((x) => x.nr === rest.slice(4))!;
    return `${marktText}: ${h.nr} ${h.name}`;
  }
  return `${marktText}: ${rest
    .split('&')
    .map((t) => {
      const [a, c] = t.split('=').map(Number);
      return `${MERKMAL_TEXT[E[a].merkmal] ?? E[a].merkmal}: ${klassenName(E[a], c)}`;
    })
    .join(' und ')}`;
};
const ergebnisse: (Pruefergebnis & { schluessel: string; art: 'alle' | 'einzel' | 'paar' | 'hypothese'; vorteil: boolean; vorteilA: number; vorteilB: number; spielartSchluessel: string; tage?: [number, number]; groessterTag?: [number, number]; splitVerdacht?: number })[] = [];
for (const name of gruppen) {
  const g = gid.get(name)!;
  const markt = name.split('|')[0];
  const gA = gid.get(`${markt}|alle`)!;
  const art = name.endsWith('|alle') ? 'alle' : name.includes('hyp=') ? 'hypothese' : name.includes('&') ? 'paar' : 'einzel';
  SP.forEach((sp, s) => {
    F.forEach((f, fi) => {
      const ges = zw.gesamt(g, s, fi);
      if (!ges.n) return;
      const p = pruefen(gruppenText(name), spielartText(sp), f, [zw.werte(g, s, fi, 0), zw.werte(g, s, fi, 1)], zw.gesamt(gA, s, fi), vt.pruefung.mindestFaelle);
      // Vorteil gegen die Grundrate (dieselbe Spielart, jeden Stichtag): ohne ihn ist ein „Muster“ nur der Markttrend
      const basisA = zw.werte(gA, s, fi, 0);
      const basisB = zw.werte(gA, s, fi, 1);
      const vorteilA = Math.round((p.zeitraeume[0].ev - basisA.ev) * 10) / 10;
      const vorteilB = Math.round((p.zeitraeume[1].ev - basisB.ev) * 10) / 10;
      ergebnisse.push({ ...p, schluessel: name, art, vorteil: art !== 'alle' && vorteilA > 0 && vorteilB > 0, vorteilA, vorteilB, spielartSchluessel: spielartSchluessel(sp) });
    });
  });
}

// ---------- 6b. Klumpen-Prüfung: Fälle desselben Stichtags sind nicht unabhängig ----------
// An einem Crash-Tag fallen Hunderte Aktien gemeinsam – das ist ein Ereignis, nicht Hunderte. Geprüft werden je Gruppe die
// besten bestandenen Kombinationen und alles im Vorwärtstest (Durchgang 3, zählt genau wie Durchgang 2). Bestanden bleibt
// nur, was in beiden Zeiträumen Fälle an mindestens `mindestTage` verschiedenen Stichtagen hat; der Rang rechnet mit dem
// Klumpen-Standardfehler (Tag als Einheit). Nicht geprüfte Kombinationen gelten als nicht bestanden.
{
  type Ergebnis = (typeof ergebnisse)[number];
  const kombi = (e: Ergebnis) => `${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`;
  const gewaehlt = new Set<Ergebnis>();
  const jeGruppe = new Map<string, Ergebnis[]>();
  for (const e of ergebnisse) if (e.bestanden && e.art !== 'alle') (jeGruppe.get(e.schluessel) ?? jeGruppe.set(e.schluessel, []).get(e.schluessel)!).push(e);
  for (const l of jeGruppe.values()) for (const e of l.sort((a, b) => b.wertung - a.wertung).slice(0, vt.pruefung.klumpenJeGruppe)) gewaehlt.add(e);
  for (const e of ergebnisse) if (e.bestanden && e.art !== 'alle' && imTest.has(kombi(e))) gewaehlt.add(e);
  const spIndex = new Map(SP.map((sp, s) => [spielartSchluessel(sp), s]));
  const kand = [...gewaehlt].map((e) => ({ e, g: gid.get(e.schluessel)!, s: spIndex.get(e.spielartSchluessel)!, fi: F.indexOf(e.fenster) }));
  const kandJeGruppe = new Map<number, number[]>();
  kand.forEach((c, j) => (kandJeGruppe.get(c.g) ?? kandJeGruppe.set(c.g, []).get(c.g)!).push(j));
  // Gruppen als Bedingungen [Einteilung, Klasse]; Index je Markt über die erste Bedingung
  interface Regel {
    g: number;
    bed: [number, number][];
  }
  const regelIndex: Record<Markt, Map<number, Regel[]>> = { aktie: new Map(), krypto: new Map() };
  const hypGruppen: { g: number; markt: Markt; h: (typeof HYPOTHESEN)[number] }[] = [];
  for (const g of kandJeGruppe.keys()) {
    const [markt, rest] = gruppen[g].split('|') as [Markt, string];
    if (rest.startsWith('hyp=')) {
      hypGruppen.push({ g, markt, h: HYPOTHESEN.find((x) => x.nr === rest.slice(4))! });
      continue;
    }
    const bed = rest.split('&').map((t) => t.split('=').map(Number) as [number, number]);
    const key = bed[0][0] * 1000 + bed[0][1];
    (regelIndex[markt].get(key) ?? regelIndex[markt].set(key, []).get(key)!).push({ g, bed });
  }
  const tagNr = new Map(alleTage.map((d, i) => [d, i]));
  const grenzeNr = alleTage.indexOf(grenze) >= 0 ? alleTage.indexOf(grenze) : alleTage.length;
  const klumpen = new TagesKlumpen(kand.length, alleTage.length);
  // Split-Verdacht: Volltreffer, in deren Fenster eine Lücke genau wie ein kleiner Split (3:2, 2:1, 3:1, 4:1) aussieht
  const trefferJe = new Int32Array(kand.length);
  const verdachtJe = new Int32Array(kand.length);
  const sperre = vt.pruefung.sperreTage;
  for (const r of reihen) {
    const hyp = hypGruppen.filter((x) => x.markt === r.markt);
    if (!regelIndex[r.markt].size && !hyp.length) continue;
    const k = r.kerzen;
    const m = k.map((_, i) => merkmale(k, i));
    const gezaehltAm = new Map<number, number>();
    const fallZaehlen = (i: number, g: number, x: Merkmale, cache: Map<number, (Ausgang | null)[]>) => {
      const turbo = turbosAm(r, x);
      for (const j of kandJeGruppe.get(g)!) {
        const c = kand[j];
        const sp = SP[c.s];
        if (sp.hebel > 1 && !turbo[sp.richtung]) continue;
        const a = cache.get(c.s) ?? cache.set(c.s, etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20), F)).get(c.s)!;
        const au = a[c.fi];
        if (au) klumpen.add(j, tagNr.get(k[i].datum)!, au.netto);
        if (au?.art === 'treffer') {
          trefferJe[j]++;
          if (r.markt === 'aktie' && splitVerdacht(k, i + 2, i + au.tag)) verdachtJe[j]++;
        }
      }
    };
    if (regelIndex[r.markt].size)
      for (let i = 1; i < k.length; i++) {
        const x = m[i];
        if (!x || !handelbar(r, x, k[i])) continue;
        const klassen = klassenAm(r, x, k[i].datum);
        // wie Durchgang 2: gezählt ist ein Stichtag, sobald es einen Einstiegstag gibt
        const gezaehlt = !!k[i + 1] && k[i + 1].o > 0;
        const cache = new Map<number, (Ausgang | null)[]>();
        for (let a = 0; a < klassen.length; a++) {
          if (klassen[a] === null) continue;
          for (const rg of regelIndex[r.markt].get(a * 1000 + klassen[a]!) ?? []) {
            if (!rg.bed.every(([b, cb]) => klassen[b] === cb)) continue;
            if (i - (gezaehltAm.get(rg.g) ?? -1e9) <= sperre) continue;
            fallZaehlen(i, rg.g, x, cache);
            if (gezaehlt) gezaehltAm.set(rg.g, i);
          }
        }
      }
    for (const { g, h } of hyp)
      for (const i of hypothesenFaelle(h, k, m, sperre)) {
        const x = m[i];
        if (!x || !handelbar(r, x, k[i]) || i >= k.length - 1) continue;
        fallZaehlen(i, g, x, new Map());
      }
  }
  let abweichend = 0;
  let gefallen = 0;
  let splitGefallen = 0;
  const geprueft = new Map<Ergebnis, number>();
  kand.forEach((c, j) => geprueft.set(c.e, j));
  for (const e of ergebnisse) {
    if (!e.bestanden || e.art === 'alle') continue;
    const j = geprueft.get(e);
    if (j === undefined) {
      e.bestanden = false;
      continue;
    }
    const A = klumpen.werte(j, 0, grenzeNr);
    const B = klumpen.werte(j, grenzeNr, alleTage.length);
    if (A.n !== e.zeitraeume[0].n || B.n !== e.zeitraeume[1].n) abweichend++;
    e.zeitraeume = [
      { ...e.zeitraeume[0], se: A.se },
      { ...e.zeitraeume[1], se: B.se },
    ];
    e.gesamt = { ...e.gesamt, se: Math.max(A.se, B.se) };
    e.wertung = Math.round(Math.min(e.zeitraeume[0].ev - A.se, e.zeitraeume[1].ev - B.se) * 10) / 10;
    e.tage = [A.tage, B.tage];
    e.groessterTag = [A.groessterTag, B.groessterTag];
    e.splitVerdacht = trefferJe[j] ? Math.round((verdachtJe[j] / trefferJe[j]) * 1000) / 10 : 0;
    if (A.tage < vt.pruefung.mindestTage || B.tage < vt.pruefung.mindestTage) {
      e.bestanden = false;
      gefallen++;
    } else if (e.splitVerdacht > vt.pruefung.splitVerdachtMax) {
      e.bestanden = false;
      splitGefallen++;
    }
  }
  log(`Klumpen-Prüfung: ${kand.length} Kombinationen nachgezählt, ${gefallen} fallen durch (in einem Zeitraum weniger als ${vt.pruefung.mindestTage} verschiedene Stichtage), ${splitGefallen} wegen Split-Verdacht (mehr als ${vt.pruefung.splitVerdachtMax} % der Volltreffer), Volltreffer mit Split-Verdacht insgesamt ${verdachtJe.reduce((a, x) => a + x, 0)} von ${trefferJe.reduce((a, x) => a + x, 0)}${abweichend ? `, ${abweichend} mit abweichender Fallzahl (Durchgang 2 ≠ 3)` : ', Fallzahlen stimmen mit Durchgang 2 überein'}.`);
}
// je Gruppe die beste Spielart/das beste Fenster (nach Wertung)
const besteJeGruppe = new Map<string, (typeof ergebnisse)[number]>();
for (const e of ergebnisse) {
  const b = besteJeGruppe.get(e.schluessel);
  const rang = (x: typeof e) => (x.bestanden ? 2 : x.zeitraeume.every((k) => k.n >= vt.pruefung.mindestFaelle) ? 1 : 0);
  if (!b || rang(e) > rang(b) || (rang(e) === rang(b) && e.wertung > b.wertung)) besteJeGruppe.set(e.schluessel, e);
}
const beste = [...besteJeGruppe.values()];
// Nachziehstop (V4): ehrlicher Vergleich mit derselben Spielart ohne Nachziehstop – gleiche Fälle, gleiches Fenster
{
  const ohneN = new Map(ergebnisse.filter((e) => !e.spielartSchluessel.endsWith('N')).map((e) => [`${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`, e]));
  let paare = 0;
  let besser = 0;
  let summeDiff = 0;
  for (const e of ergebnisse) {
    if (!e.spielartSchluessel.endsWith('N') || e.art === 'alle') continue;
    const o = ohneN.get(`${e.schluessel}|${e.spielartSchluessel.slice(0, -1)}|${e.fenster}`);
    if (!o || !(o.bestanden || e.bestanden)) continue;
    paare++;
    summeDiff += e.gesamt.ev - o.gesamt.ev;
    if (e.gesamt.ev > o.gesamt.ev) besser++;
  }
  const gutGruppen = beste.filter((e) => e.bestanden && e.vorteil);
  if (paare)
    log(`Nachziehstop: in ${besser} von ${paare} bestandenen Kombinationen besser als ohne (Ø ${summeDiff >= 0 ? '+' : ''}${(summeDiff / paare).toFixed(1)} € je Order); beste Spielart mit Nachziehstop in ${gutGruppen.filter((e) => e.spielartSchluessel.endsWith('N')).length} von ${gutGruppen.length} Gruppen mit Vorteil.`);
}
const sortiert =(l: typeof beste) => [...l].sort((a, b) => Number(b.vorteil) - Number(a.vorteil) || b.wertung - a.wertung);
const kurz = (e: (typeof ergebnisse)[number]) => ({
  gruppe: e.gruppe,
  spielart: e.spielart,
  fenster: e.fenster,
  bestanden: e.bestanden,
  wertung: e.wertung,
  faelle: e.gesamt.n,
  quote: e.gesamt.quote,
  lift: e.lift,
  erfassung: e.erfassung,
  evGesamt: e.gesamt.ev,
  zeitraumA: { n: e.zeitraeume[0].n, quote: e.zeitraeume[0].quote, ev: e.zeitraeume[0].ev, se: e.zeitraeume[0].se, tage: e.tage?.[0] ?? null, groessterTag: e.groessterTag?.[0] ?? null },
  zeitraumB: { n: e.zeitraeume[1].n, quote: e.zeitraeume[1].quote, ev: e.zeitraeume[1].ev, se: e.zeitraeume[1].se, tage: e.tage?.[1] ?? null, groessterTag: e.groessterTag?.[1] ?? null },
  knockoutQuote: e.gesamt.n ? Math.round((e.gesamt.knockout / e.gesamt.n) * 1000) / 10 : 0,
  /** Anteil der Volltreffer mit Split-Verdacht im Fenster, in % (nur geprüfte Kombinationen) */
  splitVerdacht: e.splitVerdacht ?? null,
  vorteil: e.vorteil,
  vorteilA: e.vorteilA,
  vorteilB: e.vorteilB,
});
const bestanden = sortiert(beste.filter((e) => e.bestanden && e.art !== 'alle'));
const mitVorteil = bestanden.filter((e) => e.vorteil);
const grundraten = ergebnisse.filter((e) => e.art === 'alle').map(kurz);
const hypothesen = sortiert(beste.filter((e) => e.art === 'hypothese')).map(kurz);
const n = vt.pruefung.rangliste;

const rangliste = {
  stand: jetzt.toISOString(),
  hinweis: 'Rückblick über die Kursgeschichte im privaten Archiv (nur verdichtete Kennzahlen). 1.000-€-Order, Volltreffer = mindestens +400 € netto, Einstieg zur Eröffnung des Folgetags. Bestanden = in beiden Zeiträumen mindestens 100 Fälle und Ø nach Kosten über null; Rang = schwächerer Zeitraum minus ein Standardfehler. „Vorteil“ = in beiden Zeiträumen besser als die Grundrate derselben Spielart (sonst ist es nur der Markttrend); Muster mit Vorteil stehen vorn. Handelbarkeit ist eine Näherung. Je Wert und Gruppe zählt höchstens ein Fall in 10 Handelstagen (ehrliche Fallzahl); bei 21-Tage-Fenstern überlappen Fälle trotzdem teilweise. Klumpen-Prüfung: Aktien desselben Tages bewegen sich gemeinsam – bestanden hat nur, was in beiden Zeiträumen Fälle an mindestens ' + vt.pruefung.mindestTage + ' verschiedenen Stichtagen hat; der Standardfehler rechnet den Tag als Einheit. Muster, bei denen mehr als ' + vt.pruefung.splitVerdachtMax + ' % der Volltreffer eine Lücke wie ein kleiner Aktiensplit im Fenster haben, bestehen nicht.',
  zeitraum: { von: alleTage[0], bis: alleTage[alleTage.length - 1], grenze },
  umfang: { stichtage, reihen: reihen.length, episoden: episoden.length, aktien: reihen.filter((r) => r.markt === 'aktie').length, coins: reihen.filter((r) => r.markt === 'krypto').length },
  bestandenZahl: bestanden.length,
  mitVorteilZahl: mitVorteil.length,
  bestanden: bestanden.slice(0, n).map(kurz),
  besteOhneBestehen: sortiert(beste.filter((e) => !e.bestanden && e.art !== 'alle')).slice(0, 15).map(kurz),
  hypothesen,
};
schreibeJson('lernen/muster/rangliste.json', rangliste);
{
  // Signal-Prüfung: Quote je Signaltyp gegen die Grundrate derselben Tage
  const sigTage = [...signaleJe.values()].flat().map((x) => x.datum).sort();
  const grund = (markt: Markt) => {
    let n = 0;
    let t = 0;
    for (const [key, v] of tagStat) {
      const [m, d] = key.split('|');
      if (m === markt && d >= (sigTage[0] ?? '9999') && d <= (sigTage[sigTage.length - 1] ?? '0000')) {
        n += v.n;
        t += v.treffer;
      }
    }
    return n ? (t / n) * 100 : 0;
  };
  const grundrate = { aktie: grund('aktie'), krypto: grund('krypto') };
  const typen = [...sigStat].map(([key, v]) => {
    const quote = v.n ? (v.treffer / v.n) * 100 : 0;
    return { typ: key.split('|')[1], markt: v.markt, faelle: v.n, treffer: v.treffer, quote: Math.round(quote * 10) / 10, grundrate: Math.round(grundrate[v.markt] * 10) / 10, lift: grundrate[v.markt] > 0 ? Math.round((quote / grundrate[v.markt]) * 100) / 100 : null };
  });
  schreibeJson('lernen/muster/signale-volltreffer.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Wie oft folgte auf ein Signal der Datenkrake ein Volltreffer (Kauf zur Eröffnung des Folgetags, direkt oder Turbo bis Hebel 3 in beide Richtungen, Stop 150 €, binnen 10 Handelstagen)? Je Wert und Signaltyp höchstens ein Fall in 10 Handelstagen; Grundrate = alle handelbaren Stichtage derselben Tage. Kleine Fallzahlen sind Zufall – erst ab etwa 100 Fällen aussagekräftig.',
    von: sigTage[0] ?? null,
    bis: sigTage[sigTage.length - 1] ?? null,
    grundrate,
    typen: typen.sort((a, b) => b.faelle - a.faelle),
  });
  schreibeJson('lernen/muster/trefferbuch.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Volltreffer der letzten 30 Tage (Beginn eines Sprungs, beste Spielart mit Stop 150 €) und die Signale der Datenkrake zu diesem Wert in den 14 Tagen davor. Rückwärts gelernt: Was war vorher bekannt?',
    eintraege: trefferbuch.sort((a, b) => b.datum.localeCompare(a.datum) || b.netto - a.netto).slice(0, 80),
    zahl: trefferbuch.length,
    mitVorzeichen: trefferbuch.filter((e) => e.vorzeichen.length).length,
  });
  log(`Signal-Prüfung: ${typen.length} Typen, Grundrate Aktien ${grundrate.aktie.toFixed(1)} %, Krypto ${grundrate.krypto.toFixed(1)} %. Trefferbuch: ${trefferbuch.length} Volltreffer in 30 Tagen, ${trefferbuch.filter((e) => e.vorzeichen.length).length} mit Vorzeichen.`);
}
schreibeJson('lernen/muster/grundraten.json', { stand: jetzt.toISOString(), hinweis: 'Grundrate je Markt, Spielart und Fenster: alle handelbaren Stichtage.', grundraten });

// Hypothesen-Buch: nur anhängen – neue Hypothesen als „Idee“, danach je Lauf das Ergebnis des Rückblicks
const buch = leseJson<{ eintraege: Record<string, unknown>[] }>('lernen/muster/hypothesen.json', { eintraege: [] });
for (const h of HYPOTHESEN) {
  if (!buch.eintraege.some((e) => e.nr === h.nr)) buch.eintraege.push({ nr: h.nr, datum: heute, status: 'idee', name: h.name, regel: h.regel, markt: h.markt, richtung: h.richtung });
  const besteH = hypothesen.filter((x) => x.gruppe.includes(` ${h.nr} `));
  const top = besteH.sort((a, b) => b.wertung - a.wertung)[0];
  if (top) buch.eintraege.push({ nr: h.nr, datum: heute, status: top.bestanden ? 'rueckblick_bestanden' : 'rueckblick_nicht_bestanden', spielart: top.spielart, fenster: top.fenster, faelle: top.faelle, quote: top.quote, evA: top.zeitraumA.ev, evB: top.zeitraumB.ev, wertung: top.wertung });
}
schreibeJson('lernen/muster/hypothesen.json', buch);

// ---------- V4: Muster-Buch fortschreiben und virtuelle Jagden ----------
{
  const v4 = vt.v4;
  // Zurückstufen: Ein Muster im Vorwärtstest, das im heutigen Rückblick nicht mehr mit Vorteil besteht, wird beendet
  // (Eintrag „beendet“ – das Buch wird nur angehängt). Seine bisherigen Vorwärts-Fälle bleiben im Protokoll dieses Laufs.
  // Maßstab ist der Volltreffer: Muster, die fast nie einen bringen (Quote unter v4.mindestQuote), belegen keinen Platz
  const mitVorteilHeute = new Map(ergebnisse.filter((e) => e.bestanden && e.vorteil).map((e) => [`${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`, e]));
  const beendet = [...imTest.values()].filter((e) => !mitVorteilHeute.has(e.schluessel) || mitVorteilHeute.get(e.schluessel)!.gesamt.quote < v4.mindestQuote);
  for (const e of beendet) {
    const grund = mitVorteilHeute.has(e.schluessel) ? `Volltreffer-Quote unter ${v4.mindestQuote} %` : 'besteht im Rückblick nicht mehr mit Vorteil';
    musterBuch.eintraege.push({ ...e, status: 'beendet', grund, am: heute } as BuchMuster);
    imTest.delete(e.schluessel);
  }
  // Reihenfolge der Jagden nach der heutigen Wertung (mit Klumpen-Standardfehler), nicht nach der vom Eintragstag
  for (const f of vorwaerts) {
    const w = mitVorteilHeute.get(f.muster)?.wertung;
    if (w !== undefined) f.wertung = w;
  }
  // neue Muster: bestanden mit Vorteil gegen die Grundrate (beste Spielart je Gruppe), stärkste zuerst
  // Vielfalt: höchstens v4.maxJeBaustein Muster je Baustein (Merkmal=Klasse, z. B. „Kapital-Registrierung vor 2–5 Tagen“) –
  // sonst füllen Varianten derselben Idee die Plätze mit fast denselben Fällen
  const bausteine = (gruppenSchluessel: string) => gruppenSchluessel.split('|')[1]?.split('&') ?? [];
  const belegt = new Map<string, number>();
  for (const e of imTest.values()) for (const b of bausteine(e.gruppenSchluessel)) belegt.set(b, (belegt.get(b) ?? 0) + 1);
  const maxJe = v4.maxJeBaustein ?? 99;
  const frei = Math.max(0, v4.vorwaertsMax - imTest.size);
  const neu: typeof mitVorteil = [];
  for (const e of mitVorteil) {
    if (neu.length >= frei) break;
    if (e.gesamt.quote < v4.mindestQuote || imTest.has(`${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`)) continue;
    const bs = bausteine(e.schluessel);
    if (bs.some((b) => (belegt.get(b) ?? 0) >= maxJe)) continue;
    for (const b of bs) belegt.set(b, (belegt.get(b) ?? 0) + 1);
    neu.push(e);
  }
  for (const e of neu) {
    const eintrag: BuchMuster = { schluessel: `${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`, gruppe: e.gruppe, gruppenSchluessel: e.schluessel, sp: e.spielartSchluessel, fenster: e.fenster, seit: heute, wertung: e.wertung, rueckblick: { quote: e.gesamt.quote, ev: e.gesamt.ev, se: e.gesamt.se, faelle: e.gesamt.n }, status: 'vorwaertstest' };
    musterBuch.eintraege.push(eintrag);
  }
  schreibeJson('lernen/muster/muster-buch.json', musterBuch);
  // Echte Handelbarkeit: zuerst die Werte der lauernden und laufenden Fälle mit Turbo-Spielart prüfen (Vorrang nach
  // Wertung), dann zur Eichung die Werte abgeschlossener Fälle und eine feste Stichprobe des Markts. Fälle ohne Produkt
  // in ihrer Richtung fallen aus Vorwärtstest, Jagd und sichtbaren Orders (gezählt als „nicht handelbar“).
  const tc = vt.turbos;
  const spVon = (muster: string) => {
    const t = muster.split('|');
    return spNachSchluessel.get(alleMuster.get(muster)?.sp ?? t[t.length - 2]);
  };
  const mitTurbo = (f: JagdFall) => f.markt === 'aktie' && (spVon(f.muster)?.hebel ?? 1) > 1;
  const vorrang = vorwaerts.filter((f) => mitTurbo(f) && (f.art === 'lauert' || f.art === 'offen')).sort((a, b) => b.wertung - a.wertung).map((f) => f.wert);
  const eichung = vorwaerts.filter(mitTurbo).map((f) => f.wert);
  // Stichprobe: alle handelbaren US-Werte ab einem Mindestumsatz, fest gemischt (gleiche Reihenfolge an jedem Tag)
  const umsatzJe = new Map<string, number>();
  for (const r of reihen) {
    if (r.markt !== 'aktie' || r.kerzen.length < 21) continue;
    const u = merkmale(r.kerzen, r.kerzen.length - 1)?.umsatz20;
    if (u) umsatzJe.set(r.schluessel.slice(2).split('#')[0], u);
  }
  const misch = (k: string) => [...k].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
  const stichprobe = [...umsatzJe].filter(([, u]) => u >= tc.stichprobeAbUmsatz20).map(([k]) => k).sort((a, b) => misch(a) - misch(b));
  const cacheVorher = Object.keys(turboCache).length;
  const tStart = Date.now();
  const tp = await turbosPruefen([...vorrang, ...eichung, ...stichprobe], turboCache, heute, tc, Date.now() + tc.minuten * 60000).catch((e: Error) => {
    log(`Turbos: Prüfung abgebrochen (${e.message}).`);
    return null;
  });
  if (tp?.geprueft) {
    mkdirSync(dirname(turboPfad), { recursive: true });
    writeFileSync(turboPfad, JSON.stringify(turboCache));
  }
  let nichtHandelbar = 0;
  for (let n = vorwaerts.length - 1; n >= 0; n--) {
    const f = vorwaerts[n];
    const sp = spVon(f.muster);
    if (!sp || !mitTurbo(f)) continue;
    if (turboDa(turboCache[f.wert], sp.richtung) === false) {
      vorwaerts.splice(n, 1);
      nichtHandelbar++;
    }
  }
  // Eichung der Umsatz-Näherung: Anteil geprüfter Werte mit Puts bzw. Calls je Klasse des Ø-Tagesumsatzes (nur Zählungen)
  const klassen = [0, 5e6, 20e6, 50e6];
  const eich = klassen.map((ab, i) => {
    const bis = klassen[i + 1] ?? Infinity;
    const ws = Object.entries(turboCache).filter(([k]) => (umsatzJe.get(k) ?? -1) >= ab && (umsatzJe.get(k) ?? -1) < bis).map(([, t]) => t);
    return { abUmsatz20: ab, geprueft: ws.length, mitPuts: ws.filter((t) => t.short > 0).length, mitCalls: ws.filter((t) => t.long > 0).length };
  });
  const handelbarkeit = { geprueft: Object.keys(turboCache).length, neuGeprueft: tp?.geprueft ?? 0, nichtHandelbar, eichung: eich };
  log(`Turbos: ${tp?.geprueft ?? 0} Werte neu geprüft in ${Math.round((Date.now() - tStart) / 1000)} s (${tp?.ohneName ?? 0} ohne Firmennamen, ${tp?.fehler ?? 0} Fehler), Cache ${cacheVorher} → ${Object.keys(turboCache).length}; ${nichtHandelbar} Vorwärts-Fälle ohne Produkt in ihrer Richtung entfernt. Eichung (Ø-Umsatz ab → Puts/Calls je geprüft): ${eich.map((e) => `${e.abUmsatz20 / 1e6} Mio. $: ${e.mitPuts}/${e.mitCalls} von ${e.geprueft}`).join(' · ')}.`);
  // V5: Claudes Urteile aus den Morgenläufen den Fällen zuordnen (Wert + Stichtag)
  const urteilOrdner = join(process.env.SIGNALE_DIR ?? process.env.DATEN_DIR ?? '_daten', 'volltreffer', 'urteile');
  const urteile = new Map<string, { urteil: 'ja' | 'nein'; grund: string }>();
  if (existsSync(urteilOrdner))
    for (const f of readdirSync(urteilOrdner).filter((x) => x.endsWith('.json')))
      for (const u of (JSON.parse(readFileSync(join(urteilOrdner, f), 'utf8')) as { urteile?: { wert: string; stichtag: string; urteil: 'ja' | 'nein'; grund: string }[] }).urteile ?? [])
        urteile.set(`${u.wert.toUpperCase()}|${u.stichtag}`, { urteil: u.urteil, grund: u.grund });
  for (const f of vorwaerts) {
    const u = urteile.get(`${f.wert.toUpperCase()}|${f.stichtag}`);
    if (u) Object.assign(f, u);
  }
  const ohnePump = vorwaerts.filter((f) => !f.pump);
  const { jagden, uebersprungen } = jagdenWaehlen(ohnePump, { maxOffen: v4.maxOffen, tagesVerlustGrenze: v4.tagesVerlustGrenze, einmalJeWert: true });
  // V6: Stufe 3 vor dem Fortschreiben – Stand je Muster (abgeschlossene Vorwärts-Fälle, Ø)
  const v6 = vt.v6;
  const zeitenVorher = stufe3Zeiten(musterBuch.eintraege);
  const befoerdertHeute: string[] = [];
  const zurueckHeute: string[] = [];
  const stufe3Grund = new Map<string, string>();
  const jeMuster = [...imTest.values()].map((e) => {
    const f = vorwaerts.filter((x) => x.muster === e.schluessel && x.art !== 'offen' && x.art !== 'lauert');
    const summe = f.reduce((a, x) => a + (x.netto ?? 0), 0);
    const ev = f.length ? Math.round((summe / f.length) * 10) / 10 : 0;
    // Stufe 2: mindestens 20 Fälle im Vorwärtstest und ein Ergebnis im Band des Rückblicks (Ø ≥ Rückblick − 2 Standardfehler und > 0)
    const stufe2 = f.length >= v4.stufe2Faelle && ev > 0 && ev >= e.rueckblick.ev - 2 * Math.max(e.rueckblick.se, 1);
    // Stufe 3 (V6): automatisch befördern bzw. zurückstufen – nur nach vorn, als Eintrag im Muster-Buch
    const p6 = befoerderungPruefen({ faelle: f.length, ev, rueckblick: e.rueckblick, wertung: e.wertung }, v6);
    const war = istBefoerdert(zeitenVorher, e.schluessel);
    if (p6.ok && !war) {
      musterBuch.eintraege.push({ ...e, status: 'befoerdert', am: heute, grund: p6.grund });
      befoerdertHeute.push(e.gruppe);
    } else if (!p6.ok && war && f.length >= noetigeFaelle({ wertung: e.wertung }, v6)) {
      musterBuch.eintraege.push({ ...e, status: 'zurueckgestuft', am: heute, grund: p6.grund });
      zurueckHeute.push(e.gruppe);
    }
    stufe3Grund.set(e.schluessel, p6.grund);
    return {
      stufe3: p6.ok,
      stufe3Grund: p6.grund, gruppe: e.gruppe, spielart: spielartText(spNachSchluessel.get(e.sp)!), fenster: e.fenster, seit: e.seit, faelle: f.length, treffer: f.filter((x) => x.art === 'treffer').length, ev, offen: vorwaerts.filter((x) => x.muster === e.schluessel && x.art === 'offen').length, rueckblick: e.rueckblick, stufe2 };
  });
  if (befoerdertHeute.length || zurueckHeute.length) schreibeJson('lernen/muster/muster-buch.json', musterBuch);
  const zeiten3 = stufe3Zeiten(musterBuch.eintraege);
  const s3 = stufe3Waehlen(ohnePump, zeiten3, v6, v6.ohneNein ?? false);
  const befoerdertJetzt = [...alleMuster.values(), ...musterBuch.eintraege]
    .filter((e, i, a) => a.findIndex((x) => x.schluessel === e.schluessel) === i && istBefoerdert(zeiten3, e.schluessel))
    .map((e) => ({ gruppe: e.gruppe, spielart: spielartText(spNachSchluessel.get(e.sp)!), fenster: e.fenster, seit: zeiten3.get(e.schluessel)!.find((z) => z.bis === null)!.von, rueckblick: e.rueckblick }));
  const lauerliste = ohnePump.filter((x) => x.art === 'lauert').sort((a, b) => b.wertung - a.wertung);
  const pumpZahl = vorwaerts.filter((x) => x.pump).length;
  const musterText = new Map([...alleMuster.values()].map((e) => [e.schluessel, e.gruppe]));
  const ohneMuster = (j: JagdFall) => ({ ...j, muster: musterText.get(j.muster) ?? j.muster });
  schreibeJson('volltreffer/uebersicht.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Bereich Volltreffer, rein virtuell (Plan Volltreffer V4): Muster, die im Rückblick mit Vorteil bestanden haben und eine Volltreffer-Quote von mindestens ' + v4.mindestQuote + ' % zeigen, laufen ab dem Folgetag im Vorwärtstest. Jagd = 1.000-€-Order zur Eröffnung des Handelstags nach dem Stichtag, Ausstieg nach den Regeln des Etiketts (Ziel +400 €, Stop, Fenster). Höchstens ' + v4.maxOffen + ' Jagden gleichzeitig, nach ' + v4.tagesVerlustGrenze + ' € Tagesverlust am Folgetag keine neue. Mitteilungen nur gesammelt in der Abendbilanz, kein echtes Geld.',
    regeln: { maxOffen: v4.maxOffen, tagesVerlustGrenze: v4.tagesVerlustGrenze, stufe2Faelle: v4.stufe2Faelle },
    kennzahlen: jagdKennzahlen(jagden),
    // V5: Wie gut ist Claudes Urteil? Alle Fälle im Vorwärtstest mit „ja“ gegen „nein“ (nicht nur die gewählten Jagden)
    urteil: { ja: jagdKennzahlen(vorwaerts.filter((f) => f.urteil === 'ja')), nein: jagdKennzahlen(vorwaerts.filter((f) => f.urteil === 'nein')), urteile: urteile.size },
    offen: jagden.filter((j) => j.art === 'offen').map(ohneMuster),
    abgeschlossen: jagden.filter((j) => j.art !== 'offen').sort((a, b) => (b.ende ?? '').localeCompare(a.ende ?? '')).slice(0, 30).map(ohneMuster),
    lauerliste: lauerliste.slice(0, v4.lauerlisteMax).map(ohneMuster),
    lauerlisteZahl: lauerliste.length,
    pumpVerdacht: pumpZahl,
    // Echte Handelbarkeit: geprüfte Werte (Hebelprodukte in Deutschland), entfernte Fälle, Eichung der Umsatz-Näherung
    handelbarkeit,
    uebersprungen,
    muster: jeMuster.sort((a, b) => b.faelle - a.faelle),
    // V6: sichtbare Orders (Stufe 3) – bewährte Muster, simuliert mit 1.000 € je Order, mit Einzelmitteilungen
    sichtbar: {
      hinweis: 'Stufe 3 (Plan V6): Muster mit mindestens ' + v6.mindestFaelle + ' abgeschlossenen Fällen im Vorwärtstest, Ø im Plus und im Band des Rückblicks, Volltreffer-Quote im Rückblick ab ' + v6.mindestQuote + ' % und Ø ab ' + v6.mindestEv + ' € handeln sichtbar – ohne Rückfrage, aber Klasse vor Masse: höchstens ' + v6.maxOffen + ' Orders gleichzeitig, je Wert eine. Nur Fälle ab dem Tag der Beförderung, nie rückwirkend. Simuliert, kein echtes Geld.',
      regeln: { mindestFaelle: v6.mindestFaelle, mindestQuote: v6.mindestQuote, mindestEv: v6.mindestEv, maxOffen: v6.maxOffen, tagesVerlustGrenze: v6.tagesVerlustGrenze, einsatz: v6.einsatz },
      kennzahlen: s3.kennzahlen,
      rendite: s3.rendite,
      offen: s3.offen.map(ohneMuster),
      abgeschlossen: s3.abgeschlossen.slice(0, 30).map(ohneMuster),
      vorgemerkt: s3.vorgemerkt.map(ohneMuster),
      uebersprungen: s3.uebersprungen,
      befoerdert: befoerdertJetzt,
    },
  });
  if (neu.length) log(`V4 neu im Vorwärtstest: ${neu.map((e) => `${e.gruppe} – ${e.spielart}`).join(" | ")}`);
  log(`V6: ${befoerdertJetzt.length} Muster in Stufe 3 (heute ${befoerdertHeute.length} befördert, ${zurueckHeute.length} zurückgestuft), ${s3.kennzahlen.anzahl} sichtbare Orders abgeschlossen (Rendite ${s3.rendite} %), ${s3.offen.length} offen, ${s3.vorgemerkt.length} vorgemerkt.`);
  log(`V4: ${imTest.size} Muster im Vorwärtstest (+${neu.length} neu, ${beendet.length} beendet), ${vorwaerts.length} Fälle, ${jagden.length} Jagden (${uebersprungen} übersprungen), Lauerliste ${lauerliste.length}, Pump-Verdacht ${pumpZahl} (nicht gejagt).`);
}

// privat: Zensus mit Werten und die vollständige Prüfung
const aus = join(ARCHIV, 'auswertung');
mkdirSync(aus, { recursive: true });
const zensusCsv = ['datum,schluessel,markt,spielart,fenster,netto,tag,umsatz20,r1,relVolumen', ...episoden.sort((a, b) => a.datum.localeCompare(b.datum)).map((e) => [e.datum, e.schluessel, e.markt, `"${e.spielart}"`, e.fenster, e.netto, e.tag, e.umsatz20 === null ? '' : Math.round(e.umsatz20), e.r1, e.relVolumen ?? ''].join(','))].join('\n');
writeFileSync(join(aus, `zensus-${heute}.csv.gz`), gzipSync(Buffer.from(zensusCsv + '\n', 'utf8'), { level: 9 }));
writeFileSync(join(aus, `pruefung-${heute}.json.gz`), gzipSync(Buffer.from(JSON.stringify(sortiert(beste).map(kurz)), 'utf8'), { level: 9 }));

// Log: nur Zählungen und verdichtete Kennzahlen
log(`Fertig: ${bestanden.length} Gruppen bestanden, davon ${mitVorteil.length} mit Vorteil gegen die Grundrate. Beste: ${bestanden
  .slice(0, 5)
  .map((e) => `${e.gruppe} – ${e.spielart}, ${e.fenster} T: Quote ${e.gesamt.quote} %, Ø ${e.gesamt.ev} € (A ${e.zeitraeume[0].ev}, B ${e.zeitraeume[1].ev})`)
  .join(' | ') || '–'}`);
for (const h of hypothesen) log(`${h.gruppe}: ${h.spielart}, ${h.fenster} T – ${h.faelle} Fälle, Quote ${h.quote} %, Ø A ${h.zeitraumA.ev} € / B ${h.zeitraumB.ev} € → ${h.bestanden ? 'BESTANDEN' : 'nicht bestanden'}`);
// Was bringen die Merkmale aus Zusatzquellen (Quartalszahlen, Branche)? Nur verdichtete Kennzahlen ins Log
for (const merkmal of ['zahlen', 'branche', ...MELDUNG_ARTEN, 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung']) {
  const a = E.findIndex((e) => e.merkmal === merkmal);
  if (a < 0) continue;
  const mit = (e: (typeof bestanden)[number]) => e.schluessel.split('|')[1].split('&').some((t) => t.startsWith(`${a}=`));
  const b = bestanden.filter(mit);
  const v = b.filter((e) => e.vorteil);
  log(
    `Merkmal ${MERKMAL_TEXT[merkmal]}: ${b.length} Gruppen bestanden, ${v.length} mit Vorteil. Beste: ${
      v
        .slice(0, 6)
        .map((e) => `${e.gruppe} – ${e.spielart}, ${e.fenster} T: Quote ${e.gesamt.quote} %, Ø A ${e.zeitraeume[0].ev} ± ${e.zeitraeume[0].se} / B ${e.zeitraeume[1].ev} ± ${e.zeitraeume[1].se} €, Wertung ${e.wertung}`)
        .join(' | ') || '–'
    }`,
  );
}
