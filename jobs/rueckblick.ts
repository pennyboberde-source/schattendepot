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
import { huerdenAusConfig } from './lib/abgeleitet.ts';
import { schluesselNormal } from '../core/signale.ts';
import { boersenwertAm, parseBoersenwertCsv } from '../core/volltreffer/boersenwert.ts';
import { aenderungAm, breite, fedAbstand, schluesse, summeBis, wertAm, type KryptoUmfeldArchiv, type UmfeldArchiv } from '../core/volltreffer/umfeld.ts';
import { leerquotenAusCsv, leerquotenReihe } from '../core/volltreffer/leerverkauf.ts';
import { leerbestandAusCsv, leerbestandDatei } from '../core/volltreffer/leerbestand.ts';
import { turboDa, type TurboStand } from '../core/volltreffer/turbos.ts';
import { hebelDa, type HebelStand } from '../core/volltreffer/firds.ts';
import { haltefristFortschreiben, type Haltefrist } from '../core/volltreffer/haltefrist.ts';
import { groessenKlasse, signalMessen, verdichten, type SammelErgebnis } from '../core/volltreffer/sammelmessung.ts';
import { bewerten, gegenTag, mitSperre, tagesAuswahl, tagesRang, trainieren, wichtigkeit, type Modell, type ModellEinstellungen } from '../core/volltreffer/modell.ts';
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
  pruefung: { quartalMindestFaelle: number; quartaleMindestAnteil: number; mindestFaelle: number; mindestTage: number; klumpenJeGruppe: number; splitVerdachtMax: number; sperreTage: number; paareFenster: number[]; rangliste: number; einteilungen: Einteilung[] };
  erkennung?: { fenster: number; ereignisMerkmale: string[]; mindestSpruenge: number; fallstudie: { wert: string; von: string; bis: string; anlass: string }[] };
  v4: { maxOffen: number; tagesVerlustGrenze: number; vorwaertsMax: number; lauerlisteMax: number; stufe2Faelle: number; mindestQuote: number; maxJeBaustein?: number; haltefristTage?: number };
  v6: V6Regeln & { ohneNein?: boolean };
  modell?: { aktiv: boolean; modelle: { markt: Markt; spielart: string; fenster: number }[]; obersteProzent: number[]; ohne: string[]; musterFilter?: number[]; einstellungen: ModellEinstellungen; abstandTage: number; mindestFaelle: number };
  hebel?: { nurGettex: boolean; maxAlterTage: number; mindestZugeordnet: number };
  plattformen: {
    andereBoerse: { name: string; entgeltJeOrder: number };
    auslandDirekt: { name: string; entgeltJeOrder: number; prozent: number };
    usBroker: { name: string; maxHebel: number; entgeltJeOrder: number; devisenProzent: number; leihgebuehrProzentJahr: { abUmsatz20: number; prozent: number }[]; margenzinsProzentJahr: number };
    cfd: { name: string; maxHebelPrivat: number; maxHebelProfi: number; entgeltJeOrder: number; prozent: number; finanzierungProzentJahr: number };
  };
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
const leihProzent = (umsatz20: number | null) => vt.plattformen.usBroker.leihgebuehrProzentJahr.find((x) => (umsatz20 ?? 0) >= x.abUmsatz20)?.prozent ?? 30;
const kostenFuer = (markt: Markt, umsatz20: number | null, platz: 'gettex' | 'boerse' | 'ausland' | 'us' | 'cfd' = 'gettex', sp?: Spielart) => {
  const s = markt === 'krypto' ? 'krypto' : (vt.handelbar.aktie.spread.find((x) => (umsatz20 ?? 0) >= x.abUmsatz20)?.klasse ?? 'spekulativ');
  const key = `${s}|${platz}|${platz === 'us' || platz === 'cfd' ? `${sp?.richtung}|${sp?.hebel}|${leihProzent(umsatz20)}` : ''}`;
  const da = kostenCache.get(key);
  if (da) return da;
  const b = kosten(markt, umsatz20);
  const u = vt.plattformen.usBroker;
  let k = b;
  if (platz === 'boerse') k = { ...b, entgeltTurbo: vt.plattformen.andereBoerse.entgeltJeOrder };
  else if (platz === 'ausland') k = { ...b, entgeltDirekt: vt.plattformen.auslandDirekt.entgeltJeOrder + (b.einsatz * vt.plattformen.auslandDirekt.prozent) / 100 };
  else if (platz === 'us' && sp)
    // Marge-Position: Spread und Devisen wirken auf den Gegenwert (Hebel × Einsatz); Leihgebühr auf die ganze Short-
    // Position, Marge-Zins nur auf den geliehenen Teil
    k = { ...b, turboSpreadProzent: sp.hebel * (b.spreadProzent + 2 * u.devisenProzent), entgeltTurbo: u.entgeltJeOrder, finanzierungProzentJahr: sp.richtung === 'short' ? leihProzent(umsatz20) : (u.margenzinsProzentJahr * (sp.hebel - 1)) / sp.hebel };
  else if (platz === 'cfd' && sp) {
    // CFD (17.11.2026, Handelbarkeit ungeprüft): Spread und 0,1 % je Seite auf den Gegenwert, Finanzierung auf den ganzen
    // Gegenwert (Long), Short vorsichtig mit der Leihgebühr der Umsatzklasse
    const c = vt.plattformen.cfd;
    k = { ...b, turboSpreadProzent: sp.hebel * (b.spreadProzent + 2 * c.prozent), entgeltTurbo: c.entgeltJeOrder, finanzierungProzentJahr: sp.richtung === 'short' ? leihProzent(umsatz20) : c.finanzierungProzentJahr };
  }
  kostenCache.set(key, k);
  return k;
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
// Quantensprung B Stufe 1 (16.11.2026): amtliche Liste der Hebelprodukte (ESMA FIRDS) je US-Basiswert, über die
// ISIN einem Kürzel zugeordnet (privat stamm/gettex-hebel.json.gz, stamm/isin-kuerzel.json). Ist die Liste frisch und
// fast vollständig zugeordnet, gilt sie für ALLE Werte: Produkt in der Richtung (nur gettex, wenn hebel.nurGettex) →
// handelbar, sonst nicht. Vorrang vor der OpenFIGI-Einzelsuche und der Umsatz-Näherung.
const HC = { nurGettex: true, maxAlterTage: 21, mindestZugeordnet: 0.9, ...vt.hebel };
const hebelJe = new Map<string, HebelStand>();
let hebelVollstaendig = false;
{
  const pf = join(ARCHIV, 'stamm', 'gettex-hebel.json.gz');
  const zf = join(ARCHIV, 'stamm', 'isin-kuerzel.json');
  if (existsSync(pf) && existsSync(zf)) {
    const h = JSON.parse(gz(pf)) as { quelle: string; basiswerte: Record<string, HebelStand> };
    const zu = JSON.parse(readFileSync(zf, 'utf8')) as Record<string, string | null>;
    const isins = Object.keys(h.basiswerte);
    const zugeordnet = isins.filter((i) => i in zu).length;
    for (const i of isins) {
      const k = zu[i];
      if (!k) continue;
      const a = hebelJe.get(k);
      const b = h.basiswerte[i];
      hebelJe.set(k, a ? { l: [a.l[0] + b.l[0], a.l[1] + b.l[1]], s: [a.s[0] + b.s[0], a.s[1] + b.s[1]] } : b);
    }
    const alter = (Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${h.quelle}T12:00:00Z`)) / 86400000;
    hebelVollstaendig = alter <= HC.maxAlterTage && isins.length > 0 && zugeordnet / isins.length >= HC.mindestZugeordnet;
    log(`Hebelprodukte (FIRDS ${h.quelle}): ${isins.length} US-Basiswerte, ${zugeordnet} zugeordnet (${hebelJe.size} Kürzel), ${[...hebelJe.values()].filter((x) => x.s[0] > 0).length} mit Puts an gettex, ${[...hebelJe.values()].filter((x) => x.s[0] + x.s[1] > 0).length} mit Puts an irgendeinem deutschen Platz → ${hebelVollstaendig ? `gilt für alle Werte (${HC.nurGettex ? 'nur gettex' : 'alle deutschen Plätze'})` : 'noch nicht vollständig – Einzelsuche/Näherung'}.`);
  } else log('Hebelprodukte (FIRDS): noch keine Liste im Archiv – Einzelsuche/Näherung.');
}
const turboErlaubt = (r: Reihe, m: Merkmale, richtung: 'long' | 'short') => {
  if (r.markt === 'krypto') return vt.handelbar.krypto.turboBasiswerte.includes(r.schluessel.slice(2)) || (r.schluessel === 'K:BTC' && vt.handelbar.krypto.turboBasiswerte.includes('XBT'));
  const k = r.schluessel.slice(2).split('#')[0];
  if (hebelVollstaendig) return hebelDa(hebelJe.get(k), richtung, HC.nurGettex);
  return turboDa(turboCache[k], richtung) ?? (m.umsatz20 ?? 0) >= vt.handelbar.aktie.turboAbUmsatz20;
};
/** beide Richtungen auf einmal (je Stichtag einmal statt je Spielart) */
// Plattformen (Nutzer 16.11.2026 abends: „Wenn auf gettex nicht handelbar, trotzdem handeln auf einer simulierten
// Plattform, die diese anbietet; neben dem Handel vermerken und Kosten verrechnen“): gettex → Smartbroker+ an einer
// anderen deutschen Börse/außerbörslich (Hebelprodukt vorhanden) → simulierter US-Broker mit Leerverkauf/Marge bis
// usBroker.maxHebel. Direkte Käufe: gettex, sonst Smartbroker+ an der US-Börse. Kosten je Plattform in kostenFuer.
type Platz = 'gettex' | 'boerse' | 'ausland' | 'us' | 'cfd';
const PL = vt.plattformen;
const PLATZ_NAME: Record<Platz, string> = { gettex: 'Smartbroker+ an gettex', boerse: PL.andereBoerse.name, ausland: PL.auslandDirekt.name, us: PL.usBroker.name, cfd: PL.cfd.name };
const plattformAm = (r: Reihe, m: Merkmale): { long: Platz | null; short: Platz | null } => {
  if (r.markt === 'krypto') {
    const t = turboErlaubt(r, m, 'long');
    return { long: t ? 'gettex' : null, short: t ? 'gettex' : null };
  }
  if (hebelVollstaendig) {
    const st = hebelJe.get(r.schluessel.slice(2).split('#')[0]);
    const wahl = (d: 'long' | 'short'): Platz => {
      const [g, a] = (d === 'long' ? st?.l : st?.s) ?? [0, 0];
      return g > 0 ? 'gettex' : a > 0 ? 'boerse' : 'us';
    };
    return { long: wahl('long'), short: wahl('short') };
  }
  return { long: turboErlaubt(r, m, 'long') ? 'gettex' : 'us', short: turboErlaubt(r, m, 'short') ? 'gettex' : 'us' };
};
/** Plattform einer Spielart (null = nirgends handelbar). Über der Marge des US-Brokers ohne deutsches Produkt: mit `mitCfd`
 *  CFD-Broker, Handelbarkeit ungeprüft (Nutzer 17.11.2026: „lieber kaufen und als vielleicht unrealistisch vermerken, als es
 *  zu lassen“) – nur für Vorwärtstest, Jagden und Lauerliste. Die Musterprüfung im Rückblick bleibt auf geprüft handelbaren
 *  Fällen (Probe 17.11.: mit CFD-Fällen fielen 419 → 97 bestandene Gruppen, weil teure Kleinwert-Hebel die Muster überdecken). */
const platzFuer = (r: Reihe, sp: Spielart, pa: { long: Platz | null; short: Platz | null }, mitCfd = false): Platz | null => {
  if (sp.hebel === 1) return r.markt === 'aktie' && gettexUs && !gettexUs.has(r.schluessel.slice(2).split('#')[0]) ? 'ausland' : 'gettex';
  const pl = pa[sp.richtung];
  return pl === 'us' && sp.hebel > PL.usBroker.maxHebel ? (mitCfd ? 'cfd' : null) : pl;
};

// ---------- 3. Durchgang 1: Merkmale, Marktbewegung je Tag, Zeiträume ----------
// Merkmale werden nicht vorgehalten (Speicher), sondern im zweiten Durchgang neu berechnet
const r1JeTag: Record<Markt, Map<string, number[]>> = { aktie: new Map(), krypto: new Map() };
const r1JeKlasse: Record<Markt, Map<string, number[]>> = { aktie: new Map(), krypto: new Map() };
for (const r of reihen) {
  r.kerzen.forEach((_, i) => {
    const x = merkmale(r.kerzen, i);
    if (!x || !handelbar(r, x, r.kerzen[i])) return;
    const d = r.kerzen[i].datum;
    (r1JeTag[r.markt].get(d) ?? r1JeTag[r.markt].set(d, []).get(d)!).push(x.r1);
    const kk = `${groessenKlasse(x.umsatz20)}|${d}`;
    (r1JeKlasse[r.markt].get(kk) ?? r1JeKlasse[r.markt].set(kk, []).get(kk)!).push(x.r1);
  });
}
// Vergleichsgruppe (V1): Median der Tagesrendite je Größenklasse (Ø-Tagesumsatz) und Tag, mindestens 10 Werte
const klasseR1: Record<Markt, Map<string, number>> = { aktie: new Map(), krypto: new Map() };
for (const markt of ['aktie', 'krypto'] as Markt[]) for (const [kk, xs] of r1JeKlasse[markt]) if (xs.length >= 10) klasseR1[markt].set(kk, median(xs));
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
// Lage (schlanker Kontext, seit 16.11.2026): aus vorhandenen ETF-Kursen 5-Tage-Bewegung von langen US-Anleihen (TLT,
// steigt bei fallenden Zinsen), Dollar (UUP), Kreditmarkt (Hochzinsanleihen HYG gegen 7–10-jährige Staatsanleihen IEF)
// und Öl (USO); je Aktie die eigene Branche (Branchen-ETF). Krypto: Fear & Greed und Stablecoin-Menge über 30 Tage.
const etfReihe = (t: string) => schluesse(reihen.find((r) => r.schluessel === `T:${t}`)?.kerzen ?? []);
const [tlt, uup, hyg, ief, uso] = ['TLT', 'UUP', 'HYG', 'IEF', 'USO'].map(etfReihe);
// Branchen-Code (brancheAusSic) → ETF: Biotech XBI, Gesundheit XLV, Technologie XLK, Finanzen XLF, SPAC –, Energie XLE, Sonstige IWM
const SEKTOR_ETF = ['XBI', 'XLV', 'XLK', 'XLF', null, 'XLE', 'IWM'];
const sektorReihen = SEKTOR_ETF.map((t) => (t ? etfReihe(t) : []));
const kryptoUmfeld: KryptoUmfeldArchiv | null = (() => {
  const pf = join(ARCHIV, 'stamm', 'krypto-umfeld.json.gz');
  return existsSync(pf) ? (JSON.parse(gz(pf)) as KryptoUmfeldArchiv) : null;
})();
const lageJeTag = new Map(
  alleTage.map((d) => {
    const h = aenderungAm(hyg, d);
    const i = aenderungAm(ief, d);
    return [d, { anleihen5: aenderungAm(tlt, d), dollar5: aenderungAm(uup, d), kredit5: h !== null && i !== null ? Math.round((h - i) * 10) / 10 : null, oel5: aenderungAm(uso, d), angst: kryptoUmfeld ? wertAm(kryptoUmfeld.angst, d, 2) : null, stable30: kryptoUmfeld ? aenderungAm(kryptoUmfeld.stable, d, 30, 3) : null }];
  }),
);
const sektorAm = (r: Reihe, d: string): number | null => {
  const b = r.markt === 'aktie' ? brancheVon(r) : null;
  return b === null || !sektorReihen[b]?.length ? null : aenderungAm(sektorReihen[b], d);
};
log(`Lage: ETF-Reihen TLT ${tlt.length}, UUP ${uup.length}, HYG ${hyg.length}, IEF ${ief.length}, USO ${uso.length} Tage, Branchen-ETFs ${sektorReihen.filter((x) => x.length).length} von 6; Krypto Fear & Greed ${kryptoUmfeld?.angst.length ?? 0}, Stablecoins ${kryptoUmfeld?.stable.length ?? 0} Tage.`);
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
  for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) if (E[a].paare !== false && E[b].paare !== false) for (let ca = 0; ca < klassenZahl(E[a]); ca++) for (let cb = 0; cb < klassenZahl(E[b]); cb++) neueGruppe(`${markt}|${a}=${ca}&${b}=${cb}`);
  for (const h of HYPOTHESEN) if (h.markt === 'alle' || h.markt === markt) neueGruppe(`${markt}|hyp=${h.nr}`);
}
const SP = spielarten(vt.etikett.hebel, vt.etikett.stops, vt.etikett.nachzieh);
const F = vt.etikett.fenster;
const standard = SP.map((s) => s.stopEuro === vt.etikett.standardStop);
const paarF = F.map((f) => vt.pruefung.paareFenster.includes(f));
const zw = new Zaehlwerk(gruppen.length, SP.length, F.length, 2);
log(`${gruppen.length} Gruppen, ${SP.length} Spielarten, ${F.length} Fenster.`);

type Kontext = { marktR1: number; ueberrendite1: number; boersenwert: number | null; zahlen: number | null; branche: number | null; vix: number | null; vix5: number | null; fed: number | null; breite: number | null; markt5: number | null; leerquote: number | null; leerquoteRel: number | null; insider: number | null; bestandTage: number | null; bestandAenderung: number | null; anleihen5: number | null; dollar5: number | null; kredit5: number | null; oel5: number | null; sektor5: number | null; angst: number | null; stable30: number | null } & Partial<Record<MeldungArt, number | null>>;
const KONTEXT_MERKMALE = new Set<string>(['marktR1', 'ueberrendite1', 'boersenwert', 'zahlen', 'branche', 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung', 'anleihen5', 'dollar5', 'kredit5', 'oel5', 'sektor5', 'angst', 'stable30', ...MELDUNG_ARTEN]);
const merkmalWert = (e: Einteilung, m: Merkmale, kontext: Kontext): number | null =>
  KONTEXT_MERKMALE.has(e.merkmal) ? (kontext[e.merkmal as keyof Kontext] ?? null) : (m[e.merkmal as keyof Merkmale] as number | null);
/** Meldungsarten, nach denen die Einteilungen fragen (nur die werden je Stichtag gerechnet) */
const GEFRAGTE_ARTEN = MELDUNG_ARTEN.filter((a) => E.some((e) => e.merkmal === a));
const LEER_GEFRAGT = E.some((e) => e.merkmal === 'leerquote' || e.merkmal === 'leerquoteRel');
const INSIDER_GEFRAGT = E.some((e) => e.merkmal === 'insider');
const LB_GEFRAGT = E.some((e) => e.merkmal === 'bestandTage' || e.merkmal === 'bestandAenderung');
const LEER_LAGE = { anleihen5: null, dollar5: null, kredit5: null, oel5: null, angst: null, stable30: null };
/** Lage am Stichtag: US-Lage nur für Aktien, Krypto-Lage nur für Coins */
const lageFuer = (r: Reihe, datum: string) => {
  const l = lageJeTag.get(datum) ?? LEER_LAGE;
  return r.markt === 'aktie' ? { anleihen5: l.anleihen5, dollar5: l.dollar5, kredit5: l.kredit5, oel5: l.oel5, sektor5: sektorAm(r, datum), angst: null, stable30: null } : { anleihen5: null, dollar5: null, kredit5: null, oel5: null, sektor5: null, angst: l.angst, stable30: l.stable30 };
};
/** Klasse je Einteilung an einem Stichtag (Durchgang 2 und Klumpen-Prüfung rechnen genau gleich) */
const klassenAm = (r: Reihe, x: Merkmale, datum: string) => {
  const mr = marktR1[r.markt].get(datum) ?? 0;
  const kontext: Kontext = { marktR1: mr, ueberrendite1: x.r1 - mr, boersenwert: r.markt === 'krypto' ? boersenwertAm(boersenwerte.get(r.schluessel.slice(2)), datum) : null, zahlen: zahlenAm(r, datum), branche: brancheVon(r), ...(umfeldJeTag.get(datum) ?? { vix: null, vix5: null, fed: null }), breite: breiteJeTag[r.markt].get(datum) ?? null, markt5: markt5JeTag[r.markt].get(datum) ?? null, ...(LEER_GEFRAGT ? leerAm(r, datum) : { leerquote: null, leerquoteRel: null }), insider: INSIDER_GEFRAGT ? insiderAm(r, datum) : null, ...(LB_GEFRAGT ? leerbestandAm(r, datum) : { bestandTage: null, bestandAenderung: null }), ...lageFuer(r, datum) };
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
// Schattenbuch auf Sammelkursen (V1): je Markt und Signaltyp die Messungen; gemessene Signale (Wert|Tag) für die Abdeckung
const sammel = new Map<string, SammelErgebnis[]>();
const sammelGemessen = new Set<string>();
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
const SEC_NAME: Record<MeldungArt, string> = { angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: '13D-Meldung (Großaktionär)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz/Delisting/Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzungsänderung (8-K 5.03, oft Aktiensplit)', fusion: 'Fusion (425/DEFM14A)', uebernahme: 'Übernahmeangebot (SC TO/14D9)', beteiligung: '13G-Meldung (Beteiligung ab 5 %)' };
function jagdFall(r: Reihe, i: number, e: BuchMuster, kosten: EtikettKosten, pl: Platz = 'gettex'): JagdFall | null {
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
  const basis = { muster: e.schluessel, wertung: e.wertung, wert: r.schluessel.slice(2).split('#')[0], markt: r.markt, stichtag: k[i].datum, fenster: e.fenster, spielart: spielartText(sp), plattform: r.markt === 'krypto' && sp.hebel === 1 ? 'Trade Republic (Krypto direkt)' : PLATZ_NAME[pl], ...(pl === 'cfd' ? { ungeprueft: true } : {}), ...(pump ? { pump: true } : {}), ...(sec.length ? { hinweis: `SEC: ${sec.join(', ')}` } : {}) };
  if (!k[i + 1]) return { ...basis, einstieg: null, ende: null, art: 'lauert', netto: null, tag: null };
  const res = etikett(k, i, sp, kosten, FENSTER_ALLE(e.fenster));
  const fertig = res.find((a) => a && a.art !== 'zeit') ?? res[e.fenster - 1];
  if (fertig) return { ...basis, einstieg: k[i + 1].datum, ende: k[i + fertig.tag]?.datum ?? null, art: fertig.art, netto: fertig.netto, tag: fertig.tag };
  const stand = [...res].reverse().find((a) => a);
  return { ...basis, einstieg: k[i + 1].datum, ende: null, art: 'offen', netto: stand?.netto ?? 0, tag: stand?.tag ?? 1 };
}

// ---------- 4c. Gesamtmodell: Speicher der Fälle (Klassen aller Merkmale + Ergebnis je Modell-Spielart) ----------
// Jeder handelbare Stichtag eines Modell-Markts wird eine Zeile: Klasse je Einteilung (0 = unbekannt, sonst Klasse + 1)
// und je Modell das Ergebnis der Spielart nach Kosten (NaN = Fenster noch offen); anwendbar = Spielart dort erlaubt
// (z. B. Turbo vorhanden). Gerechnet wird nach Durchgang 2 (Abschnitt 6b).
const MC = vt.modell;
const MODELLE = (MC?.aktiv ? MC.modelle : [])
  .map((m, idx) => ({ ...m, idx, s: SP.findIndex((sp) => spielartSchluessel(sp) === m.spielart), f: F.indexOf(m.fenster) }))
  .filter((m) => m.s >= 0 && m.f >= 0);
const MODELL_MAERKTE = new Set<Markt>(MODELLE.map((m) => m.markt));
const P = E.length;
const wachse = <A extends Uint8Array | Int32Array | Float32Array>(a: A, n: number): A => {
  if (n <= a.length) return a;
  const b = new (a.constructor as new (l: number) => A)(Math.max(n, a.length * 2));
  b.set(a);
  return b;
};
let mZahl = 0;
let mX = new Uint8Array(P * 4096);
let mReihe = new Int32Array(4096);
let mI = new Int32Array(4096);
let mTag = new Int32Array(4096);
const mY = MODELLE.map(() => new Float32Array(4096));
const mTreffer = MODELLE.map(() => new Uint8Array(4096));
const mAnw = MODELLE.map(() => new Uint8Array(4096));
const reihenNr = new Map(reihen.map((r, n) => [r, n]));
const tagNrAlle = new Map(alleTage.map((d, n) => [d, n]));
const modellZeile = (r: Reihe, i: number, klassen: (number | null)[]): number => {
  const z = mZahl++;
  mX = wachse(mX, mZahl * P);
  mReihe = wachse(mReihe, mZahl);
  mI = wachse(mI, mZahl);
  mTag = wachse(mTag, mZahl);
  for (let a = 0; a < P; a++) mX[z * P + a] = klassen[a] === null ? 0 : klassen[a]! + 1;
  mReihe[z] = reihenNr.get(r)!;
  mI[z] = i;
  mTag[z] = tagNrAlle.get(r.kerzen[i].datum) ?? 0;
  for (let m = 0; m < MODELLE.length; m++) {
    mY[m] = wachse(mY[m], mZahl);
    mTreffer[m] = wachse(mTreffer[m], mZahl);
    mAnw[m] = wachse(mAnw[m], mZahl);
    mY[m][z] = Number.NaN;
    mTreffer[m][z] = 0;
    mAnw[m][z] = 0;
  }
  return z;
};

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
  const ausg = (i: number, sp: Spielart, x: Merkmale, pl: Platz) => etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F);
  const testZuletzt = new Map<string, number>();
  const imVorwaerts = (gruppen: number[], i: number, x: Merkmale) => {
    for (const g of gruppen) {
      for (const e of testJeGruppe.get(g) ?? []) {
        if (k[i].datum <= e.seit || (e.status === 'beendet' && e.am && k[i].datum > e.am) || i - (testZuletzt.get(e.schluessel) ?? -1e9) <= vt.pruefung.sperreTage) continue;
        const sp = spNachSchluessel.get(e.sp);
        if (!sp) continue;
        const pl = platzFuer(r, sp, plattformAm(r, x), true);
        if (!pl) continue;
        const fall = jagdFall(r, i, e, kostenFuer(r.markt, x.umsatz20, pl, sp), pl);
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
    for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) if (klassen[a] !== null && klassen[b] !== null && E[a].paare !== false && E[b].paare !== false) gPaare.push(gid.get(`${r.markt}|${a}=${klassen[a]}&${b}=${klassen[b]}`)!);
    if (testJeGruppe.size) imVorwaerts([...gEinzel.filter((g) => g >= 0), ...gPaare], i, x);
    const frei = (g: number) => g >= 0 && i - gezaehltAm[g] > sperre;
    const alleFrei = frei(gAlle);
    const einzelFrei = gEinzel.filter(frei);
    const paareFrei = gPaare.filter(frei);
    let gezaehlt = false;
    const pa = plattformAm(r, x);
    const mz = MODELL_MAERKTE.has(r.markt) ? modellZeile(r, i, klassen) : -1;
    SP.forEach((sp, s) => {
      const pl = platzFuer(r, sp, pa);
      if (!pl) return;
      const a = ausg(i, sp, x, pl);
      if (mz >= 0)
        for (const mm of MODELLE)
          if (mm.s === s && mm.markt === r.markt) {
            mAnw[mm.idx][mz] = 1;
            const au = a[mm.f];
            if (au) {
              mY[mm.idx][mz] = au.netto;
              mTreffer[mm.idx][mz] = au.art === 'treffer' ? 1 : 0;
            }
          }
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
  // Schattenbuch auf Sammelkursen: jedes Signal ab dem ersten Handelstag danach (je Wert und Typ ein Fall in sperreTage)
  {
    const zuletztJ = new Map<string, number>();
    const idxVon = sigs.length ? new Map(k.map((x, n) => [x.datum, n])) : new Map<string, number>();
    for (const sg of [...sigs].sort((a, b) => a.datum.localeCompare(b.datum))) {
      const kl = (d: string) => {
        const xs = m[idxVon.get(d) ?? -1];
        return xs ? (klasseR1[r.markt].get(`${groessenKlasse(xs.umsatz20)}|${d}`) ?? null) : null;
      };
      const g = signalMessen(k, sg.datum, (d) => marktR1[r.markt].get(d) ?? null, kl);
      if (!g) continue;
      sammelGemessen.add(`${schluessel}|${sg.datum}`);
      if (g.j - (zuletztJ.get(sg.typ) ?? -1e9) <= vt.pruefung.sperreTage) continue;
      zuletztJ.set(sg.typ, g.j);
      const key = `${r.markt}|${sg.typ}`;
      (sammel.get(key) ?? sammel.set(key, []).get(key)!).push(g);
    }
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
      const pa = plattformAm(r, x);
      SP.forEach((sp, s) => {
        const pl = platzFuer(r, sp, pa);
        if (!pl) return;
        ausg(i, sp, x, pl).forEach((au, f) => au && zw.add(g, s, f, z, au));
      });
    }
  }
}
log(`${stichtage} handelbare Stichtage, ${episoden.length} Sprung-Episoden, Hypothesen-Fälle: ${JSON.stringify(hypFaelle)}.`);

// ---------- 6. Auswertung ----------
const MERKMAL_TEXT: Record<string, string> = { r1: 'Tagesrendite %', r5: '5-Tage-Rendite %', r20: '20-Tage-Rendite %', relVolumen: 'Umsatz (× Ø 20 Tage)', relSpanne: 'Tagesspanne (× Ø 20 Tage)', abstandHoch20: '20-Tage-Hoch', abstandHoch250: 'Abstand zum Jahreshoch %', lageSchluss: 'Schluss in der Tagesspanne (0 = Tief, 1 = Hoch)', luecke: 'Kurslücke %', schwankung20: 'Schwankung je Tag %', umsatz20: 'Ø Tagesumsatz', kurs: 'Kurs', ueberrendite1: 'Tagesrendite über dem Markt %', marktR1: 'Markt am Stichtag %', boersenwert: 'Börsenwert (Coins)', zahlen: 'Quartalszahlen', branche: 'Branche', angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: 'Großaktionär (13D)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz, Delisting, Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzung/Aktiensplit (8-K 5.03)', fusion: 'Fusion (425/DEFM14A)', uebernahme: 'Übernahmeangebot (SC TO/14D9)', beteiligung: 'Beteiligung ab 5 % (13G)', vix: 'VIX (Angstbarometer)', vix5: 'VIX-Änderung 5 Tage', fed: 'Zinsentscheid der Fed', breite: 'Marktbreite', markt5: 'Markt 5 Tage', leerquote: 'Leerverkaufsanteil', leerquoteRel: 'Leerverkäufe gegen den eigenen Schnitt', insider: 'Insider-Kauf (Formular 4)', bestandTage: 'Leerverkaufsbestand: Tage zum Eindecken', bestandAenderung: 'Leerverkaufsbestand gegen den vorigen FINRA-Stichtag', anleihen5: 'Lange US-Anleihen (TLT) 5 Tage %', dollar5: 'Dollar (UUP) 5 Tage %', kredit5: 'Kreditmarkt (HYG gegen IEF) 5 Tage, Punkte', oel5: 'Öl (USO) 5 Tage %', sektor5: 'Eigene Branche (Branchen-ETF) 5 Tage %', angst: 'Krypto Fear & Greed', stable30: 'Stablecoin-Menge 30 Tage %' };
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
const ergebnisse: (Pruefergebnis & { schluessel: string; art: 'alle' | 'einzel' | 'paar' | 'hypothese'; vorteil: boolean; vorteilA: number; vorteilB: number; spielartSchluessel: string; tage?: [number, number]; groessterTag?: [number, number]; splitVerdacht?: number; quartale?: [number, number] })[] = [];
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
  // Kalenderquartale als Tagesbereiche [von, bis) für die rollierende Prüfung (Startpunkt-Effekt)
  const quartalGrenzen: [number, number][] = [];
  const quartalVon = (d: string) => `${d.slice(0, 4)}q${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`;
  for (let i = 0; i < alleTage.length; ) {
    let j = i;
    while (j < alleTage.length && quartalVon(alleTage[j]) === quartalVon(alleTage[i])) j++;
    quartalGrenzen.push([i, j]);
    i = j;
  }
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
      const pa = plattformAm(r, x);
      for (const j of kandJeGruppe.get(g)!) {
        const c = kand[j];
        const sp = SP[c.s];
        const pl = platzFuer(r, sp, pa);
        if (!pl) continue;
        const a = cache.get(c.s) ?? cache.set(c.s, etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F)).get(c.s)!;
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
  let quartalGefallen = 0;
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
    }
    let qMit = 0;
    let qPlus = 0;
    for (const [von, bis] of quartalGrenzen) {
      const q = klumpen.werte(j, von, bis);
      if (q.n < vt.pruefung.quartalMindestFaelle) continue;
      qMit++;
      if (q.ev > 0) qPlus++;
    }
    e.quartale = [qPlus, qMit];
    if (!e.bestanden) {
      // schon durchgefallen (zu wenige Tage)
    } else if (e.splitVerdacht > vt.pruefung.splitVerdachtMax) {
      e.bestanden = false;
      splitGefallen++;
    } else if (qMit >= 4 && qPlus / qMit < vt.pruefung.quartaleMindestAnteil) {
      e.bestanden = false;
      quartalGefallen++;
    }
  }
  log(`Klumpen-Prüfung: ${kand.length} Kombinationen nachgezählt, ${gefallen} fallen durch (in einem Zeitraum weniger als ${vt.pruefung.mindestTage} verschiedene Stichtage), ${splitGefallen} wegen Split-Verdacht (mehr als ${vt.pruefung.splitVerdachtMax} % der Volltreffer), ${quartalGefallen} wegen zu weniger Quartale im Plus (unter ${vt.pruefung.quartaleMindestAnteil * 100} % der Quartale mit mindestens ${vt.pruefung.quartalMindestFaelle} Fällen), Volltreffer mit Split-Verdacht insgesamt ${verdachtJe.reduce((a, x) => a + x, 0)} von ${trefferJe.reduce((a, x) => a + x, 0)}${abweichend ? `, ${abweichend} mit abweichender Fallzahl (Durchgang 2 ≠ 3)` : ', Fallzahlen stimmen mit Durchgang 2 überein'}.`);
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
  // rollierend: Quartale mit Ø über 0 von den Quartalen mit genug Fällen
  quartale: e.quartale ? { imPlus: e.quartale[0], mitFaellen: e.quartale[1] } : null,
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

// ---------- 6a. Schattenbuch auf Sammelkursen (V1 Teil b): verdichtet je Signaltyp, Abdeckung ehrlich gezählt ----------
{
  const letzterTag = alleTage[alleTage.length - 1] ?? heute;
  let gesamt = 0;
  const jeMarkt: Record<string, { gesamt: number; gemessen: number }> = {};
  for (const [sch, liste] of signaleJe)
    for (const d of new Set(liste.map((x) => x.datum))) {
      if (d >= letzterTag) continue; // noch kein Handelstag danach im Archiv
      gesamt++;
      const mk = sch.startsWith('K:') ? 'krypto' : sch.startsWith('T:') ? 'aktie' : 'sonstige';
      const e = (jeMarkt[mk] ??= { gesamt: 0, gemessen: 0 });
      e.gesamt++;
      if (sammelGemessen.has(`${sch}|${d}`)) e.gemessen++;
    }
  const gemessen = Object.values(jeMarkt).reduce((a, x) => a + x.gemessen, 0);
  // Kosten hin und zurück wie beim Autopilot des Depots (Smartbroker+ bzw. Trade Republic, Spread) → `netto` je Messpunkt
  const sammelHuerden = huerdenAusConfig(cfg);
  const typen = [...sammel]
    .map(([key, liste]) => ({ markt: key.split('|')[0], typ: key.split('|')[1], ...verdichten(liste, sammelHuerden[key.split('|')[0] === 'krypto' ? 'krypto' : 'aktie']) }))
    .sort((a, b) => b.faelle - a.faelle);
  schreibeJson('lernen/schattenbuch/sammelkurse.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Schattenbuch auf Sammelkursen (Plan V1 Teil b): jedes Signal der Datenkrake aus den Tageskerzen des privaten Archivs gemessen, ohne Einzelabruf. Start = Eröffnung des ersten Handelstags nach dem Signaltag; Renditen in % nach 1, 3, 5, 10 und 21 Handelstagen (Schluss), höchster/tiefster Stand seit dem Start (Median), Überrendite gegen den Markt und gegen Werte gleicher Größenklasse (Ø-Tagesumsatz) über dieselben Tage (Median, Näherung über Tagesrenditen). Je Wert und Typ ein Fall in ' + vt.pruefung.sperreTage + ' Handelstagen. Abdeckung: Signale (Wert und Tag) mit Handelstag danach, die im Archiv eine Kursreihe haben (US-Aktien/ETFs, Kraken-Coins; deutsche Werte und Rohstoffe noch nicht). Nur verdichtete Kennzahlen.',
    abdeckung: { signale: gesamt, gemessen, anteil: gesamt ? Math.round((gemessen / gesamt) * 1000) / 10 : 0, jeMarkt },
    typen,
  });
  log(`Schattenbuch auf Sammelkursen: ${gemessen} von ${gesamt} Signalen gemessen (${gesamt ? Math.round((gemessen / gesamt) * 1000) / 10 : 0} %; ${Object.entries(jeMarkt).map(([mk, x]) => `${mk} ${x.gemessen}/${x.gesamt}`).join(', ')}), ${typen.length} Signaltypen, ${typen.reduce((a, t) => a + t.faelle, 0)} Fälle.`);
}

// ---------- 6b. Gesamtmodell: Training auf A → Prüfung auf B und umgekehrt, rollierende Quartale ----------
// Ehrlich: Jeder Fall wird nur von einem Modell bewertet, das ihn nie gesehen hat (A-Modell bewertet B und umgekehrt,
// mit abstandTage Handelstagen Abstand an der Grenze). Ausgewählt werden die obersten q % nach der Schwelle aus den
// eigenen Trainingsdaten; je Wert ein Fall in sperreTage Tagen. Bestanden wie ein Muster: beide Zeiträume genug Fälle
// an genug Tagen, Ø − Standardfehler (Tag als Einheit) über 0, besser als die Grundrate, Quartale überwiegend im Plus.
interface ModellErgebnis {
  schluessel: string;
  gruppe: string;
  markt: Markt;
  spielart: string;
  sp: string;
  fenster: number;
  q: number;
  bestanden: boolean;
  grund: string;
  zeitraeume: { n: number; quote: number; ev: number; se: number; tage: number; grundEv: number }[];
  quartale: [number, number];
  wertung: number;
  gesamt: { n: number; quote: number; ev: number; se: number };
  wichtig: string[];
  faelleHeute: number;
}
const modellErgebnisse: ModellErgebnis[] = [];
const modellAuswahl = new Map<string, { modell: Modell; q: number; m: (typeof MODELLE)[number]; musterP?: number; passt?: (z: number) => boolean }>();
if (MODELLE.length && mZahl) {
  const grenzeTag = tagNrAlle.get(grenze) ?? alleTage.length;
  // marktweite Merkmale (an einem Tag für alle Werte gleich) dürfen nicht teilen
  const erlaubt = E.map((e) => !MC!.ohne.includes(e.merkmal));
  const ab = MC!.abstandTage;
  const auswerten = (zeilen: number[], m: (typeof MODELLE)[number]) => {
    const kl = new TagesKlumpen(1, alleTage.length);
    let treffer = 0;
    for (const z of zeilen) {
      kl.add(0, mTag[z], mY[m.idx][z]);
      treffer += mTreffer[m.idx][z];
    }
    return { kl, treffer };
  };
  for (const m of MODELLE) {
    const t0m = Date.now();
    const gelabelt: number[] = [];
    for (let z = 0; z < mZahl; z++) if (mAnw[m.idx][z] && Number.isFinite(mY[m.idx][z]) && reihen[mReihe[z]].markt === m.markt) gelabelt.push(z);
    const A = gelabelt.filter((z) => mTag[z] < grenzeTag - ab);
    const B = gelabelt.filter((z) => mTag[z] >= grenzeTag);
    if (A.length < 5000 || B.length < 5000) {
      log(`Gesamtmodell ${m.markt} ${m.spielart} ${m.fenster} T: zu wenige Fälle (A ${A.length}, B ${B.length}) – übersprungen.`);
      continue;
    }
    const e = MC!.einstellungen;
    // Ziel gegen den Tagesdurchschnitt, ohne marktweite Merkmale: das Modell soll lernen, welcher Wert an einem Tag
    // besser ist als die anderen – nicht, welcher Tag gut war (sonst lernt es wenige Crash-Tage auswendig, Probe 16.11.)
    const yRel = gegenTag(mY[m.idx], gelabelt, (z) => mTag[z]);
    const mA = trainieren(mX, P, yRel, Int32Array.from(A), e, erlaubt);
    const mB = trainieren(mX, P, yRel, Int32Array.from(B), e, erlaubt);
    const bBdurchA = B.map((z) => bewerten(mA, mX, z));
    const bAdurchB = A.map((z) => bewerten(mB, mX, z));
    const grundA = A.reduce((su, z) => su + mY[m.idx][z], 0) / A.length;
    const grundB = B.reduce((su, z) => su + mY[m.idx][z], 0) / B.length;
    const sp = SP[m.s];
    // ---- A: Muster × Modell (Quantensprung A, freigegeben 16.11.2026): Das Modell sortiert die Fälle der Muster im
    // Vorwärtstest mit derselben Spielart. Behalten wird ein Musterfall, wenn das Modell ihn im oberen Teil SEINES Tages
    // sieht (Rang ≥ p). Vergleich: alle Musterfälle (dieselbe Sperre je Wert). Bewertet nur außerhalb des Trainings.
    const musterBed = [...imTest.values()]
      .filter((e) => e.sp === m.spielart && e.fenster === m.fenster && !e.schluessel.startsWith('modell|') && e.gruppenSchluessel.startsWith(`${m.markt}|`) && /^\d+=\d+(&\d+=\d+)?$/.test(e.gruppenSchluessel.split('|')[1] ?? ''))
      .map((e) => e.gruppenSchluessel.split('|')[1].split('&').map((t) => t.split('=').map(Number) as [number, number]));
    const passt = (z: number) => musterBed.some((bed) => bed.every(([a, c]) => mX[z * P + a] === c + 1));
    let musterErg: ModellErgebnis | null = null;
    if (musterBed.length && MC!.musterFilter?.length) {
      const rA = tagesRang(A, bAdurchB, (z) => mTag[z]);
      const rB = tagesRang(B, bBdurchA, (z) => mTag[z]);
      const kandA = A.map((z, k) => ({ z, r: rA[k] })).filter((x) => passt(x.z));
      const kandB = B.map((z, k) => ({ z, r: rB[k] })).filter((x) => passt(x.z));
      const waehle = (k: { z: number; r: number }[], pmin: number) => mitSperre(k.filter((x) => x.r >= pmin).map((x) => ({ z: x.z, wert: mReihe[x.z], tag: mI[x.z] })), vt.pruefung.sperreTage).map((x) => x.z);
      const kennz = (sel: number[]) => {
        const k = auswerten(sel, m);
        const w = k.kl.werte(0, 0, alleTage.length);
        return { n: w.n, quote: w.n ? Math.round((k.treffer / w.n) * 1000) / 10 : 0, ev: w.ev, se: w.se, tage: w.tage, treffer: k.treffer };
      };
      const quartaleVon = (sel: number[]) => {
        const kq = new TagesKlumpen(1, alleTage.length);
        for (const z of sel) kq.add(0, mTag[z], mY[m.idx][z]);
        let mit = 0;
        let plus = 0;
        const qv = (d: string) => `${d.slice(0, 4)}${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`;
        for (let i0 = 0; i0 < alleTage.length; ) {
          let i1 = i0;
          while (i1 < alleTage.length && qv(alleTage[i1]) === qv(alleTage[i0])) i1++;
          const w = kq.werte(0, i0, i1);
          if (w.n >= vt.pruefung.quartalMindestFaelle) {
            mit++;
            if (w.ev > 0) plus++;
          }
          i0 = i1;
        }
        return [plus, mit] as [number, number];
      };
      const allA = kennz(waehle(kandA, 0));
      const allB = kennz(waehle(kandB, 0));
      log(`Muster × Modell ${m.markt} ${spielartText(sp)} ${m.fenster} T: ${musterBed.length} Muster, alle Musterfälle A ${allA.n}/${allA.tage} Tage, Quote ${allA.quote} %, Ø ${allA.ev} ± ${allA.se} € · B ${allB.n}/${allB.tage}, Quote ${allB.quote} %, Ø ${allB.ev} ± ${allB.se} €.`);
      for (const pmin of MC!.musterFilter) {
        const sA = waehle(kandA, pmin);
        const sB = waehle(kandB, pmin);
        const a = kennz(sA);
        const b = kennz(sB);
        const qu = quartaleVon([...sA, ...sB]);
        const zr = [
          { n: a.n, quote: a.quote, ev: a.ev, se: a.se, tage: a.tage, grundEv: allA.ev },
          { n: b.n, quote: b.quote, ev: b.ev, se: b.se, tage: b.tage, grundEv: allB.ev },
        ];
        const wertung = Math.round(Math.min(a.ev - a.se, b.ev - b.se) * 10) / 10;
        const gruende: string[] = [];
        if (zr.some((x) => x.n < MC!.mindestFaelle)) gruende.push(`weniger als ${MC!.mindestFaelle} Fälle in einem Zeitraum`);
        if (zr.some((x) => x.tage < vt.pruefung.mindestTage)) gruende.push(`weniger als ${vt.pruefung.mindestTage} Tage in einem Zeitraum`);
        if (wertung <= 0) gruende.push('Ø − Standardfehler nicht in beiden Zeiträumen über 0');
        if (zr.some((x) => x.ev <= x.grundEv)) gruende.push('nicht besser als alle Musterfälle ohne Modell');
        if (qu[1] >= 4 && qu[0] / qu[1] < vt.pruefung.quartaleMindestAnteil) gruende.push(`nur ${qu[0]} von ${qu[1]} Quartalen im Plus`);
        const nAlle = a.n + b.n;
        const erg: ModellErgebnis = {
          schluessel: `modell|${m.markt}|${m.spielart}|${m.fenster}|muster`,
          gruppe: `${m.markt === 'aktie' ? 'Aktien' : 'Krypto'}: Muster × Gesamtmodell – Fälle der Muster im Vorwärtstest, die das Modell im oberen ${Math.round((1 - pmin) * 100)} % ihres Tages sieht`,
          markt: m.markt,
          spielart: spielartText(sp),
          sp: m.spielart,
          fenster: m.fenster,
          q: Math.round((1 - pmin) * 100),
          bestanden: !gruende.length,
          grund: gruende.join('; ') || 'bestanden (außerhalb der Trainingsdaten in beiden Zeiträumen, besser als alle Musterfälle)',
          zeitraeume: zr,
          quartale: qu,
          wertung,
          gesamt: { n: nAlle, quote: nAlle ? Math.round(((a.treffer + b.treffer) / nAlle) * 1000) / 10 : 0, ev: nAlle ? Math.round(((a.ev * a.n + b.ev * b.n) / nAlle) * 10) / 10 : 0, se: Math.max(a.se, b.se) },
          wichtig: [],
          faelleHeute: 0,
        };
        log(`Muster × Modell ${m.markt} ${erg.spielart} ${m.fenster} T, oberes ${erg.q} % des Tages: A ${a.n}/${a.tage} Tage, Quote ${a.quote} %, Ø ${a.ev} ± ${a.se} € (alle Musterfälle ${allA.ev}) · B ${b.n}/${b.tage}, Quote ${b.quote} %, Ø ${b.ev} ± ${b.se} € (alle ${allB.ev}) · Quartale ${qu[0]}/${qu[1]} · Wertung ${wertung} → ${erg.grund}`);
        if (!musterErg || (erg.bestanden && !musterErg.bestanden) || (erg.bestanden === musterErg.bestanden && erg.wertung > musterErg.wertung)) musterErg = erg;
      }
    }
    let bestes: ModellErgebnis | null = null;
    for (const q of MC!.obersteProzent) {
      const wahl = (zeilen: number[], b: number[]) => mitSperre(tagesAuswahl(zeilen, b, (z) => mTag[z], q).map((z) => ({ z, wert: mReihe[z], tag: mI[z] })), vt.pruefung.sperreTage).map((x) => x.z);
      const selA = wahl(A, bAdurchB);
      const selB = wahl(B, bBdurchA);
      const ka = auswerten(selA, m);
      const kb = auswerten(selB, m);
      const wa = ka.kl.werte(0, 0, alleTage.length);
      const wb = kb.kl.werte(0, 0, alleTage.length);
      // rollierend: Quartale der außerhalb des Trainings bewerteten Fälle
      const kq = new TagesKlumpen(1, alleTage.length);
      for (const z of [...selA, ...selB]) kq.add(0, mTag[z], mY[m.idx][z]);
      let qMit = 0;
      let qPlus = 0;
      for (let i0 = 0; i0 < alleTage.length; ) {
        let i1 = i0;
        const qv = (d: string) => `${d.slice(0, 4)}${Math.floor((Number(d.slice(5, 7)) - 1) / 3)}`;
        while (i1 < alleTage.length && qv(alleTage[i1]) === qv(alleTage[i0])) i1++;
        const w = kq.werte(0, i0, i1);
        if (w.n >= vt.pruefung.quartalMindestFaelle) {
          qMit++;
          if (w.ev > 0) qPlus++;
        }
        i0 = i1;
      }
      const zr = [
        { n: wa.n, quote: wa.n ? Math.round((ka.treffer / wa.n) * 1000) / 10 : 0, ev: wa.ev, se: wa.se, tage: wa.tage, grundEv: Math.round(grundA * 10) / 10 },
        { n: wb.n, quote: wb.n ? Math.round((kb.treffer / wb.n) * 1000) / 10 : 0, ev: wb.ev, se: wb.se, tage: wb.tage, grundEv: Math.round(grundB * 10) / 10 },
      ];
      const wertung = Math.round(Math.min(wa.ev - wa.se, wb.ev - wb.se) * 10) / 10;
      const gruende: string[] = [];
      if (zr.some((x) => x.n < MC!.mindestFaelle)) gruende.push(`weniger als ${MC!.mindestFaelle} Fälle in einem Zeitraum`);
      if (zr.some((x) => x.tage < vt.pruefung.mindestTage)) gruende.push(`weniger als ${vt.pruefung.mindestTage} Tage in einem Zeitraum`);
      if (wertung <= 0) gruende.push('Ø − Standardfehler nicht in beiden Zeiträumen über 0');
      if (zr.some((x) => x.ev <= x.grundEv)) gruende.push('nicht besser als die Grundrate');
      if (qMit >= 4 && qPlus / qMit < vt.pruefung.quartaleMindestAnteil) gruende.push(`nur ${qPlus} von ${qMit} Quartalen im Plus`);
      const nAlle = wa.n + wb.n;
      const erg: ModellErgebnis = {
        schluessel: `modell|${m.markt}|${m.spielart}|${m.fenster}`,
        gruppe: `${m.markt === 'aktie' ? 'Aktien' : 'Krypto'}: Gesamtmodell aus allen Merkmalen – oberste ${String(q).replace('.', ',')} %`,
        markt: m.markt,
        spielart: spielartText(sp),
        sp: m.spielart,
        fenster: m.fenster,
        q,
        bestanden: !gruende.length,
        grund: gruende.join('; ') || 'bestanden (außerhalb der Trainingsdaten in beiden Zeiträumen)',
        zeitraeume: zr,
        quartale: [qPlus, qMit],
        wertung,
        gesamt: { n: nAlle, quote: nAlle ? Math.round(((ka.treffer + kb.treffer) / nAlle) * 1000) / 10 : 0, ev: nAlle ? Math.round(((wa.ev * wa.n + wb.ev * wb.n) / nAlle) * 10) / 10 : 0, se: Math.max(wa.se, wb.se) },
        wichtig: [],
        faelleHeute: 0,
      };
      log(`Gesamtmodell ${m.markt} ${erg.spielart} ${m.fenster} T, oberste ${q} %: A ${zr[0].n} Fälle/${zr[0].tage} Tage, Quote ${zr[0].quote} %, Ø ${zr[0].ev} ± ${zr[0].se} € (Grundrate ${zr[0].grundEv}) · B ${zr[1].n}/${zr[1].tage}, Quote ${zr[1].quote} %, Ø ${zr[1].ev} ± ${zr[1].se} € (Grundrate ${zr[1].grundEv}) · Quartale ${qPlus}/${qMit} im Plus · Wertung ${wertung} → ${erg.grund}`);
      if (!bestes || (erg.bestanden && !bestes.bestanden) || (erg.bestanden === bestes.bestanden && erg.wertung > bestes.wertung)) bestes = erg;
    }
    if (!bestes) continue;
    // Endgültiges Modell auf allen Fällen; gewählt wird später je Tag (oberste q % des Tages)
    const mAlle = trainieren(mX, P, gegenTag(mY[m.idx], gelabelt, (z) => mTag[z]), Int32Array.from(gelabelt), MC!.einstellungen, erlaubt);
    const w = wichtigkeit(mAlle);
    bestes.wichtig = w
      .map((x, a) => [x, a] as const)
      .sort((x, y) => y[0] - x[0])
      .slice(0, 8)
      .filter(([x]) => x > 0)
      .map(([x, a]) => `${MERKMAL_TEXT[E[a].merkmal] ?? E[a].merkmal} (${x})`);
    // heutige Kandidaten: Fälle des jüngsten Stichtags dieses Markts, die in die obersten q % fallen
    let juengster = -1;
    for (let z = 0; z < mZahl; z++) if (mAnw[m.idx][z] && reihen[mReihe[z]].markt === m.markt && mTag[z] > juengster) juengster = mTag[z];
    const heuteZeilen: number[] = [];
    for (let z = 0; z < mZahl; z++) if (mAnw[m.idx][z] && reihen[mReihe[z]].markt === m.markt && mTag[z] === juengster) heuteZeilen.push(z);
    bestes.faelleHeute = tagesAuswahl(heuteZeilen, heuteZeilen.map((z) => bewerten(mAlle, mX, z)), (z) => mTag[z], bestes.q).length;
    modellErgebnisse.push(bestes);
    modellAuswahl.set(bestes.schluessel, { modell: mAlle, q: bestes.q, m });
    if (musterErg) {
      musterErg.wichtig = bestes.wichtig;
      const pmin = 1 - musterErg.q / 100;
      const rHeute = tagesRang(heuteZeilen, heuteZeilen.map((z) => bewerten(mAlle, mX, z)), (z) => mTag[z]);
      musterErg.faelleHeute = heuteZeilen.filter((z, k) => passt(z) && rHeute[k] >= pmin).length;
      modellErgebnisse.push(musterErg);
      modellAuswahl.set(musterErg.schluessel, { modell: mAlle, q: bestes.q, m, musterP: pmin, passt });
      log(`Muster × Modell ${m.markt} ${musterErg.spielart} ${m.fenster} T: gewählt oberes ${musterErg.q} % (${musterErg.bestanden ? 'BESTANDEN' : 'nicht bestanden'}), heute ${musterErg.faelleHeute} Fälle.`);
    }
    log(`Gesamtmodell ${m.markt} ${bestes.spielart} ${m.fenster} T: gewählt oberste ${bestes.q} % (${bestes.bestanden ? 'BESTANDEN' : 'nicht bestanden'}), wichtigste Merkmale: ${bestes.wichtig.join(', ')}; ${Math.round((Date.now() - t0m) / 1000)} s.`);
  }
  // Vorwärtstest: Modelle im Muster-Buch bekommen ihre Fälle ab dem Tag nach dem Eintrag (je Wert ein Fall in sperreTage)
  for (const [schluessel, a] of modellAuswahl) {
    const e = imTest.get(schluessel);
    if (!e) continue;
    const vonTag = tagNrAlle.get(alleTage.find((d) => d > e.seit) ?? '9999') ?? Infinity;
    const zeilen: number[] = [];
    for (let z = 0; z < mZahl; z++) if (mAnw[a.m.idx][z] && mTag[z] >= vonTag && reihen[mReihe[z]].markt === a.m.markt) zeilen.push(z);
    const bew = zeilen.map((z) => bewerten(a.modell, mX, z));
    let gewaehlt: number[];
    if (a.passt) {
      // Muster × Modell: Musterfälle, die das Modell im oberen Teil ihres Tages sieht
      const r = tagesRang(zeilen, bew, (z) => mTag[z]);
      gewaehlt = zeilen.filter((z, k) => a.passt!(z) && r[k] >= a.musterP!);
    } else gewaehlt = tagesAuswahl(zeilen, bew, (z) => mTag[z], a.q);
    for (const { z } of mitSperre(gewaehlt.map((z) => ({ z, wert: mReihe[z], tag: mI[z] })), vt.pruefung.sperreTage)) {
      const r = reihen[mReihe[z]];
      const x = merkmale(r.kerzen, mI[z]);
      if (!x) continue;
      const spM = spNachSchluessel.get(e.sp);
      const pl = spM ? platzFuer(r, spM, plattformAm(r, x), true) : null;
      if (!spM || !pl) continue;
      const fall = jagdFall(r, mI[z], e, kostenFuer(r.markt, x.umsatz20, pl, spM), pl);
      if (fall) vorwaerts.push(fall);
    }
  }
  schreibeJson('lernen/muster/modell.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Gesamtmodell (Quantensprung, seit 16.11.2026): Gradient Boosting über die Klassen aller wertbezogenen Merkmale (marktweite wie VIX, Fed, Öl bleiben draußen), Ziel Ergebnis nach Kosten gegen den Tagesdurchschnitt, Auswahl je Tag die obersten q % des Tages. Gemessen nur außerhalb der Trainingsdaten (Modell aus Zeitraum A bewertet B und umgekehrt); bestanden wie ein Muster. Nur verdichtete Kennzahlen.',
    modelle: modellErgebnisse,
  });
}

// ---------- F1: Erkennungsquote hebelfreier Volltreffer (KONZEPT-FRUEHERKENNUNG.md, 17.11.2026) ----------
const fallstudieZeilen: { wert: string; datum: string; anlass: string; sprung: boolean; tag: number | null; muster: string[]; ereignisse: string[] }[] = [];
if (vt.erkennung) {
  const ek = vt.erkennung;
  const fi = F.indexOf(ek.fenster);
  const sMax = Math.max(...vt.etikett.stops);
  const s1 = SP.findIndex((sp) => sp.hebel === 1 && sp.stopEuro === sMax && sp.nachziehAb === undefined);
  // bestandene Gruppen mit Vorteil als Bedingungen [Merkmal, Klasse][]
  const bedingungen = new Map<string, { name: string; bed: [number, number][] }[]>();
  for (const e of mitVorteil) {
    if (e.schluessel.includes('hyp=') || e.schluessel.endsWith('|alle')) continue;
    const [markt, rest] = e.schluessel.split('|');
    const bed = rest.split('&').map((t) => t.split('=').map(Number) as [number, number]);
    if (bed.some(([a, c]) => !Number.isFinite(a) || !Number.isFinite(c))) continue;
    (bedingungen.get(markt) ?? bedingungen.set(markt, []).get(markt)!).push({ name: e.gruppe ?? e.schluessel, bed });
  }
  const eIdx = ek.ereignisMerkmale.map((nm) => E.findIndex((x) => x.merkmal === nm)).filter((a) => a >= 0);
  type Z = { spruenge: number; erkannt: number; tage: number; feuern: number; klasse: Map<string, [number, number]> };
  const jeMarkt = new Map<string, Z>();
  const fallJe = new Map(ek.fallstudie.map((f) => [f.wert.toUpperCase(), f]));
  if (fi >= 0 && s1 >= 0)
    for (const r of reihen) {
      const muster = bedingungen.get(r.markt) ?? [];
      const k = r.kerzen;
      const fall = r.markt === 'aktie' ? fallJe.get(r.schluessel.replace(/#\d+$/, '').replace(/^T:/, '').toUpperCase()) : undefined;
      const z = jeMarkt.get(r.markt) ?? jeMarkt.set(r.markt, { spruenge: 0, erkannt: 0, tage: 0, feuern: 0, klasse: new Map() }).get(r.markt)!;
      let letzterSprung = -1e9;
      for (let i = 1; i < k.length - 1; i++) {
        const x = merkmale(k, i);
        if (!x || !handelbar(r, x, k[i])) continue;
        const pl = platzFuer(r, SP[s1], plattformAm(r, x));
        if (!pl) continue;
        const au = etikett(k, i, SP[s1], kostenFuer(r.markt, x.umsatz20, pl, SP[s1]), F)[fi];
        if (!au) continue;
        const klassen = klassenAm(r, x, k[i].datum);
        const feuernd = muster.filter((mu) => mu.bed.every(([a, c]) => klassen[a] === c));
        const sprung = au.art === 'treffer' && i - letzterSprung > vt.pruefung.sperreTage;
        z.tage++;
        if (feuernd.length) z.feuern++;
        for (const a of eIdx) {
          if (klassen[a] === null) continue;
          const key = `${a}=${klassen[a]}`;
          const w = z.klasse.get(key) ?? z.klasse.set(key, [0, 0]).get(key)!;
          w[0]++;
          if (sprung) w[1]++;
        }
        if (sprung) {
          letzterSprung = i;
          z.spruenge++;
          if (feuernd.length) z.erkannt++;
        }
        if (fall && k[i].datum >= fall.von && k[i].datum <= fall.bis)
          fallstudieZeilen.push({
            wert: fall.wert, datum: k[i].datum, anlass: fall.anlass, sprung: au.art === 'treffer', tag: au.art === 'treffer' ? au.tag : null,
            muster: feuernd.slice(0, 5).map((mu) => mu.name),
            ereignisse: eIdx.filter((a) => klassen[a] !== null).map((a) => gruppenText(`${r.markt}|${a}=${klassen[a]}`).replace(/^[^:]*:\s*/, '')),
          });
      }
    }
  const maerkte = [...jeMarkt.entries()].map(([markt, z]) => {
    const anteilErkannt = z.spruenge ? Math.round((z.erkannt / z.spruenge) * 1000) / 10 : null;
    const anteilFeuern = z.tage ? Math.round((z.feuern / z.tage) * 1000) / 10 : null;
    const grund = z.tage ? z.spruenge / z.tage : 0;
    const klassen = [...z.klasse.entries()]
      .filter(([, [n, s]]) => n >= 200 && s >= 5)
      .map(([key, [n, s]]) => ({ merkmal: gruppenText(`${markt}|${key}`), faelle: n, spruenge: s, quote: Math.round((s / n) * 1000) / 10, lift: grund ? Math.round((s / n / grund) * 10) / 10 : null }))
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
      .slice(0, 25);
    return { markt, stichtage: z.tage, spruenge: z.spruenge, grundrate: Math.round(grund * 10000) / 100, erkannt: z.erkannt, anteilErkannt, anteilFeuern, lift: anteilErkannt !== null && anteilFeuern ? Math.round((anteilErkannt / anteilFeuern) * 10) / 10 : null, klassen };
  });
  schreibeJson('lernen/muster/erkennung.json', {
    stand: jetzt.toISOString(),
    hinweis: `F1 Erkennungsquote: hebelfreie Volltreffer (direkt, Stop ${sMax} €, ≥ +${vt.etikett.ziel} € nach Kosten binnen ${ek.fenster} Handelstagen, je Wert einer in ${vt.pruefung.sperreTage} Tagen). „erkannt“ = am Stichtag feuerte mindestens ein bestandenes Muster mit Vorteil (Muster sind auf derselben Geschichte geprüft – die Quote ist eine Obergrenze). Klassen: Anteil der Sprünge unter allen Stichtagen mit dieser Klasse gegen die Grundrate (Lift).`,
    maerkte,
    fallstudie: [...new Set(fallstudieZeilen.map((f) => f.wert))].map((w) => {
      const z = fallstudieZeilen.filter((f) => f.wert === w);
      const sp = z.filter((f) => f.sprung);
      return { wert: w, anlass: z[0]?.anlass ?? '', stichtage: z.length, sprungTage: sp.length, sprungMitMuster: sp.filter((f) => f.muster.length).length };
    }),
  });
  for (const m of maerkte) log(`F1 ${m.markt}: ${m.spruenge} hebelfreie Sprünge (Grundrate ${m.grundrate} %), erkannt ${m.erkannt} = ${m.anteilErkannt} % bei Muster-Feuer an ${m.anteilFeuern} % aller Tage (Lift ${m.lift}).`);
  for (const w of new Set(fallstudieZeilen.map((f) => f.wert))) {
    const z = fallstudieZeilen.filter((f) => f.wert === w);
    const sp = z.filter((f) => f.sprung);
    log(`F1 Fallstudie ${w}: ${z.length} Stichtage, ${sp.length} mit hebelfreiem Volltreffer, davon ${sp.filter((f) => f.muster.length).length} mit bestandenem Muster am Stichtag.`);
  }
}

// ---------- V4: Muster-Buch fortschreiben und virtuelle Jagden ----------
{
  const v4 = vt.v4;
  // Zurückstufen: Ein Muster im Vorwärtstest, das im heutigen Rückblick nicht mehr mit Vorteil besteht, wird beendet
  // (Eintrag „beendet“ – das Buch wird nur angehängt). Seine bisherigen Vorwärts-Fälle bleiben im Protokoll dieses Laufs.
  // Maßstab ist der Volltreffer: Muster, die fast nie einen bringen (Quote unter v4.mindestQuote), belegen keinen Platz
  const mitVorteilHeute = new Map(ergebnisse.filter((e) => e.bestanden && e.vorteil).map((e) => [`${e.schluessel}|${e.spielartSchluessel}|${e.fenster}`, e]));
  const modellOk = new Map(modellErgebnisse.filter((x) => x.bestanden).map((x) => [x.schluessel, x]));
  const verfehltHeute = [...imTest.values()].filter((e) => (e.schluessel.startsWith('modell|') ? MODELLE.length > 0 && !modellOk.has(e.schluessel) : !mitVorteilHeute.has(e.schluessel) || mitVorteilHeute.get(e.schluessel)!.gesamt.quote < v4.mindestQuote));
  // Haltefrist (17.11.2026): erst nach haltefristTage verfehlten Rückblick-Tagen in Folge beenden – sonst wechselt der
  // Vorwärtstest täglich fast vollständig und kein Muster sammelt je genug Fälle für die Beförderung
  const halte = haltefristFortschreiben(leseJson<Haltefrist>('lernen/muster/haltefrist.json', { verfehlt: {} }), [...imTest.keys()], verfehltHeute.map((e) => e.schluessel), heute);
  const beendet = verfehltHeute.filter((e) => (halte.verfehlt[e.schluessel]?.length ?? 0) >= (v4.haltefristTage ?? 1));
  for (const e of beendet) delete halte.verfehlt[e.schluessel];
  schreibeJson('lernen/muster/haltefrist.json', { stand: jetzt.toISOString(), hinweis: `Muster im Vorwärtstest, die im Rückblick nicht mehr mit Vorteil bestehen: Tage in Folge (beendet ab ${v4.haltefristTage ?? 1}).`, verfehlt: halte.verfehlt });
  if (verfehltHeute.length) log(`Haltefrist: ${verfehltHeute.length} Muster verfehlen heute, ${beendet.length} davon beendet (${v4.haltefristTage ?? 1} Tage in Folge).`);
  for (const e of beendet) {
    const grund = e.schluessel.startsWith('modell|') ? 'Gesamtmodell besteht außerhalb der Trainingsdaten nicht mehr' : mitVorteilHeute.has(e.schluessel) ? `Volltreffer-Quote unter ${v4.mindestQuote} %` : 'besteht im Rückblick nicht mehr mit Vorteil';
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
  const neuModelle: string[] = [];
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
  // Gesamtmodell: bestandene Modelle kommen zusätzlich in den Vorwärtstest (eigene Plätze, nicht gegen vorwaertsMax)
  for (const x of modellOk.values()) {
    if (imTest.has(x.schluessel)) continue;
    const eintrag: BuchMuster = { schluessel: x.schluessel, gruppe: x.gruppe, gruppenSchluessel: `modell|${x.markt}`, sp: x.sp, fenster: x.fenster, seit: heute, wertung: x.wertung, rueckblick: { quote: x.gesamt.quote, ev: x.gesamt.ev, se: x.gesamt.se, faelle: x.gesamt.n }, status: 'vorwaertstest' };
    musterBuch.eintraege.push(eintrag);
    neuModelle.push(x.gruppe);
  }
  for (const f of vorwaerts) {
    const w = modellOk.get(f.muster)?.wertung;
    if (w !== undefined) f.wertung = w;
  }
  schreibeJson('lernen/muster/muster-buch.json', musterBuch);
  if (neuModelle.length) log(`Gesamtmodell neu im Vorwärtstest: ${neuModelle.join(' | ')}`);
  // Echte Handelbarkeit: zuerst die Werte der lauernden und laufenden Fälle mit Turbo-Spielart prüfen (Vorrang nach
  // Wertung), dann zur Eichung die Werte abgeschlossener Fälle und eine feste Stichprobe des Markts. Fälle ohne Produkt
  // in ihrer Richtung fallen aus Vorwärtstest, Jagd und sichtbaren Orders (gezählt als „nicht handelbar“).
  const tc = vt.turbos;
  const spJe = new Map(musterBuch.eintraege.map((e) => [e.schluessel, e.sp]));
  const spVon = (muster: string) => {
    const t = muster.split('|');
    return spNachSchluessel.get(spJe.get(muster) ?? alleMuster.get(muster)?.sp ?? t[t.length - 2]);
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
  // Mit vollständiger FIRDS-Liste ist die langsame Einzelsuche (5 je Minute) überflüssig
  const tp = hebelVollstaendig
    ? null
    : await turbosPruefen([...vorrang, ...eichung, ...stichprobe], turboCache, heute, tc, Date.now() + tc.minuten * 60000).catch((e: Error) => {
        log(`Turbos: Prüfung abgebrochen (${e.message}).`);
        return null;
      });
  if (tp?.geprueft) {
    mkdirSync(dirname(turboPfad), { recursive: true });
    writeFileSync(turboPfad, JSON.stringify(turboCache));
  }
  let nichtHandelbar = 0;
  for (let n = -1; n >= 0; n--) {
    const f = vorwaerts[n];
    const sp = spVon(f.muster);
    if (!sp || !mitTurbo(f)) continue;
    const da = hebelVollstaendig ? hebelDa(hebelJe.get(f.wert), sp.richtung, HC.nurGettex) : turboDa(turboCache[f.wert], sp.richtung);
    if (da === false) {
      vorwaerts.splice(n, 1);
      nichtHandelbar++;
    }
  }
  // Eichung der Umsatz-Näherung: Anteil geprüfter Werte mit Puts bzw. Calls je Klasse des Ø-Tagesumsatzes (nur Zählungen)
  const klassen = [0, 5e6, 20e6, 50e6];
  const eich = klassen.map((ab, i) => {
    const bis = klassen[i + 1] ?? Infinity;
    if (hebelVollstaendig) {
      // FIRDS: alle Werte der Klasse (nicht nur geprüfte), Puts/Calls nach der gültigen Regel (gettex bzw. alle Plätze)
      const ks = [...umsatzJe].filter(([, u]) => u >= ab && u < bis).map(([k]) => k);
      return { abUmsatz20: ab, geprueft: ks.length, mitPuts: ks.filter((k) => hebelDa(hebelJe.get(k), 'short', HC.nurGettex)).length, mitCalls: ks.filter((k) => hebelDa(hebelJe.get(k), 'long', HC.nurGettex)).length };
    }
    const ws = Object.entries(turboCache).filter(([k]) => (umsatzJe.get(k) ?? -1) >= ab && (umsatzJe.get(k) ?? -1) < bis).map(([, t]) => t);
    return { abUmsatz20: ab, geprueft: ws.length, mitPuts: ws.filter((t) => t.short > 0).length, mitCalls: ws.filter((t) => t.long > 0).length };
  });
  const jePlattform: Record<string, number> = {};
  for (const f of vorwaerts) if (f.plattform) jePlattform[f.plattform] = (jePlattform[f.plattform] ?? 0) + 1;
  const handelbarkeit = { jePlattform, quelle: hebelVollstaendig ? (HC.nurGettex ? 'ESMA FIRDS, nur gettex' : 'ESMA FIRDS, deutsche Börsen') : 'OpenFIGI-Einzelsuche', geprueft: hebelVollstaendig ? hebelJe.size : Object.keys(turboCache).length, neuGeprueft: tp?.geprueft ?? 0, nichtHandelbar, eichung: eich };
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

// Tages-Lagebild für alle Bereiche (schlanker Kontext, seit 16.11.2026): nur grobe Klassen, keine Kurswerte (die Quellen
// erlauben keine Weitergabe von Kursen) – Depot, Daytrading, Schattenbuch und Routinen können ihre Ergebnisse über das
// Datum mit der Lage verbinden. Öffentlich: lernen/lage.json (die letzten 250 Tage).
{
  const textVon = (merkmal: string, wert: number | null | undefined) => {
    const e = E.find((x) => x.merkmal === merkmal);
    const c = e ? klasse(wert ?? null, e.grenzen) : null;
    return e && c !== null ? klassenName(e, c) : null;
  };
  const tage = alleTage.slice(-250);
  const verlauf = tage.map((d) => {
    const l = lageJeTag.get(d);
    const u = umfeldJeTag.get(d);
    return {
      datum: d,
      aktien: { vix: textVon('vix', u?.vix), vix5: textVon('vix5', u?.vix5), breite: textVon('breite', breiteJeTag.aktie.get(d)), markt5: textVon('markt5', markt5JeTag.aktie.get(d)), anleihen: textVon('anleihen5', l?.anleihen5), dollar: textVon('dollar5', l?.dollar5), kredit: textVon('kredit5', l?.kredit5), oel: textVon('oel5', l?.oel5) },
      krypto: { angst: textVon('angst', l?.angst), stablecoins: textVon('stable30', l?.stable30), breite: textVon('breite', breiteJeTag.krypto.get(d)), markt5: textVon('markt5', markt5JeTag.krypto.get(d)) },
    };
  });
  schreibeJson('lernen/lage.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Tages-Lagebild in groben Klassen (keine Kurswerte): Angstbarometer VIX, Marktbreite und 5-Tage-Bewegung des Markts, lange US-Anleihen (Zinsen), Dollar, Kreditmarkt und Öl über ETF-Kurse; Krypto: Fear & Greed (alternative.me) und Stablecoin-Menge (DefiLlama). Stichtag = US-Handelstag bzw. Krypto-Tag (UTC).',
    heute: verlauf[verlauf.length - 1] ?? null,
    verlauf,
  });
}

// privat: Zensus mit Werten und die vollständige Prüfung
const aus = join(ARCHIV, 'auswertung');
if (fallstudieZeilen.length) { mkdirSync(aus, { recursive: true }); writeFileSync(join(aus, `fallstudie-${heute}.json`), JSON.stringify(fallstudieZeilen, null, 1)); }
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
for (const merkmal of ['zahlen', 'branche', ...MELDUNG_ARTEN, 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung', 'anleihen5', 'dollar5', 'kredit5', 'oel5', 'sektor5', 'angst', 'stable30']) {
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
