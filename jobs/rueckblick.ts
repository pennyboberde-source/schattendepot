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
import { etikett, spielarten, spielartText, sprungEpisoden, volHebel, type Ausgang, type EtikettKosten, type Kerze, type NachziehEinstellung, type Spielart, type VolEinstellung } from '../core/volltreffer/etikett.ts';
import { klasse, klassenName, merkmale, type Einteilung, type Merkmale } from '../core/volltreffer/merkmale.ts';
import { HYPOTHESEN, hypothesenFaelle, pruefen, spielartSchluessel, TagesKlumpen, Zaehlwerk, type Pruefergebnis } from '../core/volltreffer/pruefung.ts';
import { jagdenWaehlen, jagdKennzahlen, neinFilterAktiv, urteilKalibrierung, type JagdFall } from '../core/volltreffer/jagd.ts';
import { auswaehlen, bilanz, nachspielen, zrAktiv, zrBremse, zrBuchFortschreiben, zrZeiten, ZeitStat, type Gewaehlt, type Kandidat, type ZrBremsRegel, type ZrBuchEintrag, type ZrMuster } from '../core/volltreffer/zeitreise.ts';
import { pumpVerdacht } from '../core/datenkrake.ts';
import { befoerderungPruefen, inStufe3, istBefoerdert, noetigeFaelle, stufe3Waehlen, stufe3Zeiten, type V6Regeln } from '../core/volltreffer/befoerderung.ts';
import { istUsAktie, kryptoPaar, median, splitBereinigen, splitVerdacht, unbekannteSplitsTeilen, type Split } from '../core/volltreffer/reihen.ts';
import { ladeConfig, leseJson, schreibeJson } from './lib/dateien.ts';
import { huerdenAusConfig } from './lib/abgeleitet.ts';
import { schluesselNormal } from '../core/signale.ts';
import { boersenwertAm, parseBoersenwertCsv } from '../core/volltreffer/boersenwert.ts';
import { aenderungAm, breite, fedAbstand, schluesse, summeBis, wertAm, type KryptoUmfeldArchiv, type UmfeldArchiv } from '../core/volltreffer/umfeld.ts';
import { leerquotenAusCsv, leerquotenReihe } from '../core/volltreffer/leerverkauf.ts';
import { leerbestandAusCsv, leerbestandDatei } from '../core/volltreffer/leerbestand.ts';
import { aktienzahlAm, type AktienzahlArchiv } from '../core/volltreffer/aktienzahl.ts';
import { tageBisStudie, type Studie } from '../core/volltreffer/studien.ts';
import { alsFolge, kalenderTage, spitzenFolge, spitzenKlasse, suchName, themenFuer, type Ereignis, type Tagesreihe, type Thema } from '../core/volltreffer/kontext.ts';
import { katalysatorKlasse, type Katalysator } from '../core/volltreffer/volltext.ts';
import { turboDa, type TurboStand } from '../core/volltreffer/turbos.ts';
import { hebelDa, type HebelStand } from '../core/volltreffer/firds.ts';
import { haltefristFortschreiben, type Haltefrist } from '../core/volltreffer/haltefrist.ts';
import { groessenKlasse, signalMessen, verdichten, type SammelErgebnis } from '../core/volltreffer/sammelmessung.ts';
import { bewerten, gegenTag, mitSperre, tagesAuswahl, tagesRang, trainieren, wichtigkeit, type Modell, type ModellEinstellungen } from '../core/volltreffer/modell.ts';
import { turbosPruefen } from './lib/turbos.ts';
import type { InsiderArchiv } from '../core/volltreffer/insider.ts';
import { artErfasst, brancheAusSic, firmaJeTicker, MELDUNG_ARTEN, meldungenErfasst, zahlenAbstaende, type MeldungArt, type ZahlenArchiv, type ZahlenFirma } from '../core/volltreffer/zahlen.ts';

type Markt = 'aktie' | 'krypto';
interface VtConfig {
  etikett: { einsatz: number; ziel: number; beinahe: number; zensusMaxHebel: number; hebel: number[]; stops: number[]; nachzieh?: NachziehEinstellung; vol?: VolEinstellung; standardStop: number; fenster: number[]; episodeAbstand: number; finanzierungProzentJahr: number; turboSpreadKlasse: string; turboEmittent: string };
  handelbar: {
    aktie: { mindestKurs: number; otc?: boolean; mindestUmsatzStichtag: number; turboAbUmsatz20: number; spread: { abUmsatz20: number; klasse: string }[]; handelsplatz: string };
    krypto: { mindestUmsatzStichtag: number; turboBasiswerte: string[]; ohneBasis: string[]; mindestSchwankung20: number; spreadKlasse: string; handelsplatz: string };
  };
  pruefung: { quartalMindestFaelle: number; quartaleMindestAnteil: number; mindestFaelle: number; mindestTage: number; klumpenJeGruppe: number; splitVerdachtMax: number; sperreTage: number; paareFenster: number[]; rangliste: number; einteilungen: Einteilung[] };
  erkennung?: { fenster: number; ereignisMerkmale: string[]; mindestSpruenge: number; liftMin: number; fallstudie: { wert: string; von: string; bis: string; anlass: string }[] };
  v4: { maxOffen: number; tagesVerlustGrenze: number; vorwaertsMax: number; lauerlisteMax: number; stufe2Faelle: number; mindestQuote: number; maxJeBaustein?: number; haltefristTage?: number; maxJeKlumpen?: number; klumpenAnker?: string[]; klumpenMinKorrelation?: number };
  v6: V6Regeln & { ohneNein?: boolean | 'auto'; urteilAuto?: { mindestJa: number; mindestNein: number } };
  modell?: { aktiv: boolean; modelle: { markt: Markt; spielart: string; fenster: number; ziel?: 'netto' | 'treffer'; universum?: { name: string; text: string; oder: { merkmal: string; klassen: number[] }[] }; oberste?: number[] }[]; obersteProzent: number[]; ohne: string[]; musterFilter?: number[]; einstellungen: ModellEinstellungen; abstandTage: number; mindestFaelle: number };
  hebel?: { nurGettex: boolean; maxAlterTage: number; mindestZugeordnet: number };
  plattformen: {
    andereBoerse: { name: string; entgeltJeOrder: number };
    auslandDirekt: { name: string; entgeltJeOrder: number; prozent: number };
    usBroker: { name: string; maxHebel: number; entgeltJeOrder: number; devisenProzent: number; leihgebuehrProzentJahr: { abUmsatz20: number; prozent: number }[]; margenzinsProzentJahr: number };
    cfd: { name: string; maxHebelPrivat: number; maxHebelProfi: number; entgeltJeOrder: number; prozent: number; finanzierungProzentJahr: number };
    otc: { name: string; entgeltJeOrder: number; prozent: number; spreadZuschlag: number };
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
  /** F5 (18.11.2026): außerbörslich gehandelter US-Wert (OTC) – zum Lernen, Handelbarkeit von Deutschland ungeprüft */
  otc?: boolean;
}
const reihen: Reihe[] = [];

// US-Aktien: eine Datei je Handelstag mit allen Werten → je Wert eine Reihe (seit F5 auch OTC, wenn handelbar.aktie.otc)
const otcTicker = new Set<string>();
{
  const dateien = tagesDateien('us');
  const je = new Map<string, Kerze[]>();
  for (const p of dateien) {
    const datum = datumAus(p);
    for (const k of parseUsArchiv(gz(p)).values()) {
      if ((k.otc && !vt.handelbar.aktie.otc) || !istUsAktie(k.ticker)) continue;
      let r = je.get(k.ticker);
      if (!r) je.set(k.ticker, (r = []));
      if (k.otc) otcTicker.add(k.ticker);
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
    teile.forEach((t, n) => reihen.push({ schluessel: `T:${ticker}${n ? `#${n}` : ''}`, markt: 'aktie', kerzen: t, ...(otcTicker.has(ticker) ? { otc: true } : {}) }));
  }
  log(`US: ${dateien.length} Handelstage, ${je.size} Aktien (davon ${otcTicker.size} OTC), ${[...splits.values()].flat().length} gemeldete Splits, ${geteilt} Reihen an nicht gemeldeten Splits geteilt.`);
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
const firmenNachCik = new Map<string, ZahlenFirma>();
{
  const p = join(ARCHIV, 'stamm', 'us-zahlen.json.gz');
  if (existsSync(p)) {
    const a = JSON.parse(gz(p)) as ZahlenArchiv;
    zahlenAb = a.ab;
    for (const [t, f] of firmaJeTicker(a)) firmen.set(t, f);
    for (const [cik, f] of Object.entries(a.firmen)) firmenNachCik.set(String(Number(cik)), f);
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
  if (!artErfasst(f, art)) return null;
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
// Q2 Katalysator-Begriffe aus der SEC-Volltextsuche (privat stamm/volltext.json.gz, config/katalysatoren.json): Klasse
// nach der Art der jüngsten Meldungen (long-, short-, binäre, gemischte Art) in 5 bzw. 20 Handelstagen; Meldungen zählen
// wie nach Börsenschluss (die Suche liefert nur das Datum) – kein Blick nach vorn.
const KAT = JSON.parse(readFileSync(join(process.cwd(), 'config', 'katalysatoren.json'), 'utf8')) as { ab: string; liste: Katalysator[] };
const volltextTreffer: Record<string, Record<string, string[]>> = (() => {
  const pf = join(ARCHIV, 'stamm', 'volltext.json.gz');
  return existsSync(pf) ? ((JSON.parse(gz(pf)) as { treffer?: Record<string, Record<string, string[]>> }).treffer ?? {}) : {};
})();
const KAT_DA = KAT.liste.every((k) => volltextTreffer[k.id]);
const katArten = KAT.liste.map((k) => k.richtung);
let katCache: { r: Reihe; je: Map<string, [number | null, number | null]> } | null = null;
const katalysatorAm = (r: Reihe, datum: string): { katalysator5: number | null; katalysator20: number | null } => {
  if (!KAT_DA || r.markt !== 'aktie') return { katalysator5: null, katalysator20: null };
  if (katCache?.r !== r) {
    const t = r.schluessel.slice(2).split('#')[0];
    const daten = r.kerzen.map((k) => k.datum);
    const abst = KAT.liste.map((k) => zahlenAbstaende(daten, (volltextTreffer[k.id]?.[t] ?? []).map((d) => [d, '23:59'] as [string, string]), KAT.ab));
    katCache = { r, je: new Map(daten.map((d, i) => [d, [katalysatorKlasse(abst.map((a) => a[i]), katArten, 5), katalysatorKlasse(abst.map((a) => a[i]), katArten, 20)]])) };
  }
  const v = katCache.je.get(datum);
  return { katalysator5: v?.[0] ?? null, katalysator20: v?.[1] ?? null };
};
log(`Katalysator-Begriffe (SEC-Volltext): ${KAT_DA ? `${KAT.liste.length} Begriffe, ${Object.values(volltextTreffer).reduce((a, je) => a + Object.keys(je).length, 0)} Kürzel-Einträge` : 'noch nicht vollständig im Archiv – Merkmal unbekannt'}.`);
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
      if (!a) lbJe.set(k, (a = new Float32Array(dateien.length * 3).fill(Number.NaN)));
      a[3 * i] = w.tage ?? Number.NaN;
      a[3 * i + 1] = w.aenderung ?? Number.NaN;
      a[3 * i + 2] = w.bestand;
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
  const t = a[3 * i];
  const c = a[3 * i + 1];
  return { bestandTage: Number.isNaN(t) ? null : Math.round(t * 100) / 100, bestandAenderung: Number.isNaN(c) ? null : Math.round(c * 10) / 10 };
};
// F4 (18.11.2026): Aktienzahl je Firma (SEC-Frames, privat stamm/us-aktienzahl.json.gz) → Aktienzahl, Börsenwert und
// Leerbestand in % der Aktien (FINRA-Bestand der am Tag gültigen Datei)
const aktienJe = new Map<string, [string, number][]>();
{
  const f = join(ARCHIV, 'stamm', 'us-aktienzahl.json.gz');
  if (existsSync(f)) {
    const a = JSON.parse(gz(f)) as AktienzahlArchiv;
    for (const [cik, l] of Object.entries(a.je)) {
      const firma = firmenNachCik.get(cik);
      for (const t of firma?.tickers ?? []) aktienJe.set(t, l);
    }
  }
  log(`Aktienzahl (SEC-Frames): ${aktienJe.size} Kürzel.`);
}
const aktienAm = (r: Reihe, x: Merkmale, datum: string): { aktien: number | null; boersenwertUS: number | null; leerAnteil: number | null } => {
  if (r.markt !== 'aktie') return { aktien: null, boersenwertUS: null, leerAnteil: null };
  const kz = r.schluessel.slice(2).split('#')[0];
  const n = aktienzahlAm(aktienJe.get(kz), datum);
  if (!n) return { aktien: null, boersenwertUS: null, leerAnteil: null };
  let leer: number | null = null;
  const lb = lbJe.get(kz);
  if (lb) {
    let i = lbDateiAm.get(datum);
    if (i === undefined) lbDateiAm.set(datum, (i = leerbestandDatei(lbDateien, datum)));
    if (i >= 0 && Number.isFinite(lb[3 * i + 2])) leer = Math.round((lb[3 * i + 2] / n) * 1000) / 10;
  }
  return { aktien: Math.round(n / 1e5) / 10, boersenwertUS: Math.round((n * x.kurs) / 1e5) / 10, leerAnteil: leer };
};
// F3 (18.11.2026): Studien-Termine aus täglichen Schnappschüssen (privat studien/JJJJ/<Tag>.csv.gz, JSON) – nur
// Schnappschüsse ≤ Stichtag, damit kein heutiges Wissen in die Vergangenheit fließt. Vorerst nur als Hinweis (V5).
const studienSchnapp: { datum: string; je: Record<string, [string, string, string, string | null, string | null][]> }[] = [];
{
  const ordner = join(ARCHIV, 'studien');
  if (existsSync(ordner))
    for (const j of readdirSync(ordner).filter((x) => /^\d{4}$/.test(x)))
      for (const f of readdirSync(join(ordner, j)).filter((x) => /^\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(x)).sort())
        studienSchnapp.push({ datum: f.slice(0, 10), je: JSON.parse(gz(join(ordner, j, f))) });
  studienSchnapp.sort((a, b) => a.datum.localeCompare(b.datum));
  log(`Studien-Termine: ${studienSchnapp.length} Schnappschüsse${studienSchnapp.length ? ` (${studienSchnapp[0].datum} bis ${studienSchnapp[studienSchnapp.length - 1].datum})` : ''}.`);
}
const studieAm = (r: Reihe, datum: string): number | null => {
  if (r.markt !== 'aktie' || !studienSchnapp.length) return null;
  let s: (typeof studienSchnapp)[number] | undefined;
  for (let i = studienSchnapp.length - 1; i >= 0; i--) if (studienSchnapp[i].datum <= datum) { s = studienSchnapp[i]; break; }
  const l = s?.je[r.schluessel.slice(2).split('#')[0]];
  if (!l) return null;
  return tageBisStudie(l.map(([nct, phase, status, ende, endeArt]) => ({ nct, phase, status, ende, endeArt: endeArt as Studie['endeArt'] })), datum);
};
const brancheVon = (r: Reihe): number | null => (r.markt === 'aktie' ? brancheAusSic(firmen.get(r.schluessel.slice(2).split('#')[0])?.sic) : null);

// ---------- 1c. Kontext-Geschichte (Quantensprung 3, 18.11.2026): Themen der Weltnachrichten (GDELT), Amtsblatt,
// Weltgeschehen (Wikipedia), Aufmerksamkeit (Wikipedia-Aufrufe). Alles privat im Archiv; öffentlich nur Klassen.
const KC = JSON.parse(readFileSync(join(process.cwd(), 'config', 'kontext.json'), 'utf8')) as { ab: string; gdelt: { themen: Thema[] }; aufmerksamkeit: { coins: Record<string, string> } };
const stammJson = <T>(datei: string, standard: T): T => {
  const p = join(ARCHIV, 'stamm', datei);
  return existsSync(p) ? (JSON.parse(gz(p)) as T) : standard;
};
const themenDaten = stammJson<{ themen: Record<string, { treffer: Tagesreihe; gesamt: Tagesreihe }> }>('themen.json.gz', { themen: {} }).themen;
const amtsblattDaten = stammJson<{ reihen: Record<string, Tagesreihe> }>('amtsblatt.json.gz', { reihen: {} }).reihen;
const weltJe = new Map<string, Ereignis[]>();
{
  const o = join(ARCHIV, 'weltgeschehen');
  if (existsSync(o)) for (const j of readdirSync(o)) for (const f of readdirSync(join(o, j))) weltJe.set(f.slice(0, 10), JSON.parse(gz(join(o, j, f))));
  for (const [d, e] of Object.entries(stammJson<{ tage: Record<string, Ereignis[]> }>('weltgeschehen-aktuell.json.gz', { tage: {} }).tage)) weltJe.set(d, e);
}
const aufrufeJe = new Map<string, Tagesreihe>();
{
  const lies = (ordner: string) => {
    const o = join(ARCHIV, ordner);
    if (!existsSync(o)) return;
    for (const j of readdirSync(o).sort())
      for (const f of readdirSync(join(o, j)).sort())
        for (const [art, reihe] of Object.entries(JSON.parse(gz(join(o, j, f))) as Record<string, Tagesreihe>)) aufrufeJe.set(art, { ...(aufrufeJe.get(art) ?? {}), ...reihe });
  };
  lies('aufmerksamkeit-nachtrag');
  lies('aufmerksamkeit');
}
const wikiKarte = stammJson<{ kuerzel: Record<string, string> }>('wiki-artikel.json.gz', { kuerzel: {} }).kuerzel;
const artikelVon = (r: Reihe): string | undefined => {
  const kz = r.schluessel.slice(2).split('#')[0];
  return r.markt === 'krypto' ? KC.aufmerksamkeit.coins[kz] : wikiKarte[kz];
};
// Firmen-Erwähnungen im Weltgeschehen: Suchname aus dem Artikel-Titel (ohne Klammerzusatz), als ganzes Wort
const erwaehntJe = new Map<string, Set<string>>();
{
  const namen = new Map<string, RegExp>();
  for (const art of new Set([...Object.values(wikiKarte), ...Object.values(KC.aufmerksamkeit.coins)])) {
    const n = suchName(art.replace(/_/g, ' ').replace(/\s*\(.*\)$/, ''));
    if (n) namen.set(art, new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'));
  }
  for (const [d, liste] of weltJe) {
    const text = liste.map((e) => e.t).join(' \n ');
    for (const [art, re] of namen) if (re.test(text)) (erwaehntJe.get(art) ?? erwaehntJe.set(art, new Set()).get(art)!).add(d);
  }
}
const THEMEN = KC.gdelt.themen.filter((t) => themenDaten[t.id]);
// Spitzen je Kalendertag vorab (schnell): Thema = Anteil an allen Artikeln, höchster Wert aus Stichtag und Vortag
const KTAGE = kalenderTage(KC.ab, heute);
const ktagIdx = new Map(KTAGE.map((d, i) => [d, i]));
const ausFolge = (f: Float32Array | undefined, datum: string): number | null => {
  const i = ktagIdx.get(datum);
  if (!f || i === undefined) return null;
  const v = f[i];
  return Number.isNaN(v) ? null : v;
};
const themaFolge = new Map(
  THEMEN.map((t) => {
    const d = themenDaten[t.id];
    const mitG = Object.keys(d.gesamt ?? {}).length > 0;
    return [t.id, spitzenFolge(alsFolge(d.treffer, KTAGE), 30, 2, mitG ? alsFolge(d.gesamt, KTAGE) : undefined)];
  }),
);
const maxFolge = (ids: string[]) => {
  const out = new Float32Array(KTAGE.length).fill(NaN);
  for (const id of ids) {
    const f = themaFolge.get(id)!;
    for (let i = 0; i < out.length; i++) if (!Number.isNaN(f[i]) && (Number.isNaN(out[i]) || f[i] > out[i])) out[i] = f[i];
  }
  return out;
};
const nachrichtenFolge = maxFolge(THEMEN.map((t) => t.id));
const politikFolge = maxFolge(THEMEN.filter((t) => t.politik).map((t) => t.id));
const amtsSumme: Tagesreihe = {};
for (const id of ['praesident', 'zoelle', 'sanktionen']) for (const [d, n] of Object.entries(amtsblattDaten[id] ?? {})) amtsSumme[d] = (amtsSumme[d] ?? 0) + n;
// Amtsblatt erscheint nur an Werktagen: fehlende Tage zählen als 0 Dokumente, sobald es überhaupt Daten gibt
const amtsFolge = Object.keys(amtsSumme).length ? spitzenFolge(Float64Array.from(KTAGE, (d) => amtsSumme[d] ?? (d <= Object.keys(amtsSumme).sort().pop()! ? 0 : NaN)), 60, 5) : undefined;
const marktKontextAm = (datum: string) => ({ nachrichtenlage: ausFolge(nachrichtenFolge, datum), politikDruck: ausFolge(politikFolge, datum), amtsblatt5: ausFolge(amtsFolge, datum) });
const aufrufFolge = new Map<string, Float32Array>();
const branchenFolge = new Map<string, Float32Array>();
const erwaehntFolge = new Map<string, Float32Array>();
const wertKontextAm = (r: Reihe, datum: string): { aufmerksamkeit: number | null; branchenThema: number | null; erwaehnt: number | null } => {
  const art = artikelVon(r);
  let fa: Float32Array | undefined;
  if (art && aufrufeJe.has(art)) {
    fa = aufrufFolge.get(art);
    if (!fa) aufrufFolge.set(art, (fa = spitzenFolge(alsFolge(aufrufeJe.get(art), KTAGE), 30, 2)));
  }
  const sic = r.markt === 'aktie' ? firmen.get(r.schluessel.slice(2).split('#')[0])?.sic : null;
  const ids = themenFuer(THEMEN, r.markt, sic).map((t) => t.id);
  let fb: Float32Array | undefined;
  if (ids.length) {
    const k = ids.join(',');
    fb = branchenFolge.get(k);
    if (!fb) branchenFolge.set(k, (fb = maxFolge(ids)));
  }
  let fe: Float32Array | undefined;
  if (art && weltJe.size) {
    fe = erwaehntFolge.get(art);
    if (!fe) {
      // Tage seit der letzten Erwähnung (höchstens 20) je Kalendertag; nur Tage, für die es Weltgeschehen gibt
      fe = new Float32Array(KTAGE.length).fill(NaN);
      const set = erwaehntJe.get(art);
      let letzte = -1e9;
      KTAGE.forEach((d, i) => {
        if (set?.has(d)) letzte = i;
        if (weltJe.has(d)) fe![i] = i - letzte <= 20 ? i - letzte : 99;
      });
      erwaehntFolge.set(art, fe);
    }
  }
  return { aufmerksamkeit: ausFolge(fa, datum), branchenThema: ausFolge(fb, datum), erwaehnt: ausFolge(fe, datum) };
};
log(`Kontext-Geschichte: ${THEMEN.length} Themen (GDELT), Amtsblatt ${Object.keys(amtsblattDaten).length} Reihen, Weltgeschehen ${weltJe.size} Tage, Aufmerksamkeit ${aufrufeJe.size} Artikel (zugeordnet ${Object.keys(wikiKarte).length} Kürzel), Erwähnungen bei ${erwaehntJe.size} Artikeln.`);

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
const kostenFuer = (markt: Markt, umsatz20: number | null, platz: 'gettex' | 'boerse' | 'ausland' | 'us' | 'cfd' | 'otc' = 'gettex', sp?: Spielart) => {
  const s = markt === 'krypto' ? 'krypto' : (vt.handelbar.aktie.spread.find((x) => (umsatz20 ?? 0) >= x.abUmsatz20)?.klasse ?? 'spekulativ');
  const key = `${s}|${platz}|${platz === 'us' || platz === 'cfd' ? `${sp?.richtung}|${sp?.hebel}|${leihProzent(umsatz20)}` : ''}`;
  const da = kostenCache.get(key);
  if (da) return da;
  const b = kosten(markt, umsatz20);
  const u = vt.plattformen.usBroker;
  let k = b;
  if (platz === 'boerse') k = { ...b, entgeltTurbo: vt.plattformen.andereBoerse.entgeltJeOrder };
  else if (platz === 'ausland') k = { ...b, entgeltDirekt: vt.plattformen.auslandDirekt.entgeltJeOrder + (b.einsatz * vt.plattformen.auslandDirekt.prozent) / 100 };
  // F5 (18.11.2026): OTC direkt – Entgelt wie beim US-Direkthandel und ein Spread-Zuschlag (dünne Orderbücher), ungeprüft
  else if (platz === 'otc') k = { ...b, spreadProzent: b.spreadProzent + vt.plattformen.otc.spreadZuschlag, entgeltDirekt: vt.plattformen.otc.entgeltJeOrder + (b.einsatz * vt.plattformen.otc.prozent) / 100 };
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
type Platz = 'gettex' | 'boerse' | 'ausland' | 'us' | 'cfd' | 'otc';
const PL = vt.plattformen;
const PLATZ_NAME: Record<Platz, string> = { gettex: 'Smartbroker+ an gettex', boerse: PL.andereBoerse.name, ausland: PL.auslandDirekt.name, us: PL.usBroker.name, cfd: PL.cfd.name, otc: PL.otc.name };
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
  if (r.otc) return sp.hebel === 1 ? 'otc' : mitCfd ? 'cfd' : null;
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
const SP = spielarten(vt.etikett.hebel, vt.etikett.stops, vt.etikett.nachzieh, vt.etikett.vol);
/** Treffer-Geometrie (Quantensprung 1): Schwankungs-Spielart → konkreter Hebel für diesen Fall (null = Schwankung unbekannt) */
const konk = (sp: Spielart, x: Merkmale): Spielart | null => volHebel(sp, x.schwankung20, vt.etikett.einsatz, vt.etikett.vol ?? { maxHebel: 20, stufe: 0.5 });
const F = vt.etikett.fenster;
const standard = SP.map((s) => s.stopEuro === vt.etikett.standardStop);
const paarF = F.map((f) => vt.pruefung.paareFenster.includes(f));
const zw = new Zaehlwerk(gruppen.length, SP.length, F.length, 2);
log(`${gruppen.length} Gruppen, ${SP.length} Spielarten, ${F.length} Fenster.`);

type Kontext = { marktR1: number; ueberrendite1: number; boersenwert: number | null; zahlen: number | null; branche: number | null; vix: number | null; vix5: number | null; fed: number | null; breite: number | null; markt5: number | null; leerquote: number | null; leerquoteRel: number | null; insider: number | null; bestandTage: number | null; bestandAenderung: number | null; anleihen5: number | null; dollar5: number | null; kredit5: number | null; oel5: number | null; sektor5: number | null; angst: number | null; stable30: number | null; otc: number | null; aktien: number | null; boersenwertUS: number | null; leerAnteil: number | null; aufmerksamkeit: number | null; branchenThema: number | null; erwaehnt: number | null; nachrichtenlage: number | null; politikDruck: number | null; amtsblatt5: number | null; katalysator5: number | null; katalysator20: number | null } & Partial<Record<MeldungArt, number | null>>;
const KONTEXT_MERKMALE = new Set<string>(['marktR1', 'ueberrendite1', 'boersenwert', 'zahlen', 'branche', 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung', 'anleihen5', 'dollar5', 'kredit5', 'oel5', 'sektor5', 'angst', 'stable30', 'otc', 'aktien', 'boersenwertUS', 'leerAnteil', 'aufmerksamkeit', 'branchenThema', 'erwaehnt', 'nachrichtenlage', 'politikDruck', 'amtsblatt5', 'katalysator5', 'katalysator20', ...MELDUNG_ARTEN]);
const merkmalWert = (e: Einteilung, m: Merkmale, kontext: Kontext): number | null =>
  KONTEXT_MERKMALE.has(e.merkmal) ? (kontext[e.merkmal as keyof Kontext] ?? null) : (m[e.merkmal as keyof Merkmale] as number | null);
/** Meldungsarten, nach denen die Einteilungen fragen (nur die werden je Stichtag gerechnet) */
const GEFRAGTE_ARTEN = MELDUNG_ARTEN.filter((a) => E.some((e) => e.merkmal === a));
const LEER_GEFRAGT = E.some((e) => e.merkmal === 'leerquote' || e.merkmal === 'leerquoteRel');
const INSIDER_GEFRAGT = E.some((e) => e.merkmal === 'insider');
const LB_GEFRAGT = E.some((e) => e.merkmal === 'bestandTage' || e.merkmal === 'bestandAenderung');
const KONTEXT_GEFRAGT = E.some((e) => ['aufmerksamkeit', 'branchenThema', 'erwaehnt', 'nachrichtenlage', 'politikDruck', 'amtsblatt5'].includes(e.merkmal));
const KAT_GEFRAGT = E.some((e) => e.merkmal === 'katalysator5' || e.merkmal === 'katalysator20');
const LEER_LAGE = { anleihen5: null, dollar5: null, kredit5: null, oel5: null, angst: null, stable30: null };
/** Lage am Stichtag: US-Lage nur für Aktien, Krypto-Lage nur für Coins */
const lageFuer = (r: Reihe, datum: string) => {
  const l = lageJeTag.get(datum) ?? LEER_LAGE;
  return r.markt === 'aktie' ? { anleihen5: l.anleihen5, dollar5: l.dollar5, kredit5: l.kredit5, oel5: l.oel5, sektor5: sektorAm(r, datum), angst: null, stable30: null } : { anleihen5: null, dollar5: null, kredit5: null, oel5: null, sektor5: null, angst: l.angst, stable30: l.stable30 };
};
/** Klasse je Einteilung an einem Stichtag (Durchgang 2 und Klumpen-Prüfung rechnen genau gleich) */
const klassenAm = (r: Reihe, x: Merkmale, datum: string) => {
  const mr = marktR1[r.markt].get(datum) ?? 0;
  const kontext: Kontext = { marktR1: mr, ueberrendite1: x.r1 - mr, boersenwert: r.markt === 'krypto' ? boersenwertAm(boersenwerte.get(r.schluessel.slice(2)), datum) : null, zahlen: zahlenAm(r, datum), branche: brancheVon(r), ...(umfeldJeTag.get(datum) ?? { vix: null, vix5: null, fed: null }), breite: breiteJeTag[r.markt].get(datum) ?? null, markt5: markt5JeTag[r.markt].get(datum) ?? null, ...(LEER_GEFRAGT ? leerAm(r, datum) : { leerquote: null, leerquoteRel: null }), insider: INSIDER_GEFRAGT ? insiderAm(r, datum) : null, ...(LB_GEFRAGT ? leerbestandAm(r, datum) : { bestandTage: null, bestandAenderung: null }), ...lageFuer(r, datum), otc: r.markt === 'aktie' ? (r.otc ? 1 : 0) : null, ...aktienAm(r, x, datum), ...(KONTEXT_GEFRAGT ? { ...wertKontextAm(r, datum), ...marktKontextAm(datum) } : { aufmerksamkeit: null, branchenThema: null, erwaehnt: null, nachrichtenlage: null, politikDruck: null, amtsblatt5: null }), ...(KAT_GEFRAGT ? katalysatorAm(r, datum) : { katalysator5: null, katalysator20: null }) };
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

// ---------- 4d. Zeitreise-Regel (Nutzer 20.11.2026): Auswahl des laufenden Halbmonats ordert sichtbar ----------
// Die Zeitreise (zeitreise.yml, täglich 23:40 UTC) legt in lernen/zeitreise.json › aktuell die Muster des laufenden
// Halbmonats ab – gewählt nur aus Fällen, deren Ergebnis feststand. Das Zeitreise-Buch (nur anhängen) hält fest, ab
// welchem Stichtag ein Muster gilt; seine Fälle entstehen wie im Vorwärtstest, zählen aber nicht für V4.
const ZRV = (vt.v6 as unknown as { zeitreise?: { aktiv: boolean; ausGrund?: string; ab: string; frischTage?: number; ohneUngeprueft?: boolean; bremse: ZrBremsRegel } }).zeitreise;
const zrBuch = leseJson<{ eintraege: ZrBuchEintrag[] }>('lernen/muster/zeitreise-buch.json', { eintraege: [] });
const zrPfad = join(process.env.SIGNALE_DIR ?? process.env.DATEN_DIR ?? '_daten', 'lernen', 'zeitreise.json');
const zrDatei = existsSync(zrPfad) ? (JSON.parse(readFileSync(zrPfad, 'utf8')) as { stand?: string; aktuell?: { halbmonatVon: string; muster: ZrMuster[] } }) : null;
const zrGebremst = !!ZRV && zrBuch.eintraege.some((e) => e.status === 'bremse' && e.am >= ZRV.ab);
const zrFrisch = zrDatei?.aktuell && zrDatei.stand && (Date.parse(heute) - Date.parse(zrDatei.stand.slice(0, 10))) / 86400000 <= (ZRV?.frischTage ?? 2) ? zrDatei.aktuell.muster : null;
// neuester Stichtag je Markt: ab dort gilt eine neue Auswahl (Einstieg zur nächsten Eröffnung – kein Blick zurück)
const neuesterTag = (m: Markt) => [...r1JeTag[m].keys()].reduce((a, d) => (d > a ? d : a), '');
const zrAb = (x: { gruppenSchluessel?: string; schluessel: string }) => {
  const d = neuesterTag((x.gruppenSchluessel ?? x.schluessel).startsWith('krypto|') ? 'krypto' : 'aktie');
  return ZRV && d < ZRV.ab ? ZRV.ab : d;
};
const zrNeu = ZRV ? zrBuchFortschreiben(zrBuch.eintraege, zrFrisch, zrAb, ZRV.aktiv && !zrGebremst, ZRV.aktiv ? 'Bremse' : 'Regel ausgeschaltet') : [];
zrBuch.eintraege.push(...zrNeu);
const zrErst = new Map<string, ZrBuchEintrag>();
for (const e of zrBuch.eintraege) if (e.status === 'gewaehlt' && !zrErst.has(e.schluessel)) zrErst.set(e.schluessel, e);
/** Muster nur der Zeitreise (nicht im Muster-Buch): ihre Fälle zählen nicht für V4 */
const zrNur = new Set<string>();
for (const [k, e] of zrErst) {
  if (alleMuster.has(k) || !e.gruppenSchluessel || !e.sp || !spNachSchluessel.has(e.sp)) continue;
  const g = gid.get(e.gruppenSchluessel);
  if (g === undefined) continue;
  const seit = new Date(Date.parse(`${e.am}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  const bm: BuchMuster = { schluessel: k, gruppe: e.gruppe ?? k, gruppenSchluessel: e.gruppenSchluessel, sp: e.sp, fenster: e.fenster ?? 10, seit, wertung: e.wertung ?? 0, rueckblick: { quote: e.quote ?? 0, ev: e.ev ?? 0, se: 0, faelle: e.tage ?? 0 }, status: 'zeitreise' };
  (testJeGruppe.get(g) ?? testJeGruppe.set(g, []).get(g)!).push(bm);
  zrNur.add(k);
}
// ---------- Q4 Gegenwind (20.11.2026): Marktlage zum Schluss je Stichtag ----------
// Gegenwind = Markt (Median der Aktien) über 5 Tage oder VIX im obersten Zehntel der vorigen rollTage Handelstage (nur
// Vergangenheit). Dort keine sichtbaren Aktien-Shorts (V6 und Zeitreise-Regel) und keine Autopilot-Shorts (über
// volltreffer/uebersicht.json › gegenwind). Zeitreise mit dieser Regel: Ø +12,3 statt +2,2 € je Order (Probe 44717816325).
const GWC = (vt.v6 as unknown as { gegenwind?: { aktiv: boolean; ab: string; rollTage: number; quantil: number } }).gegenwind;
const gegenwindJeTag = new Map<string, { aktiv: boolean; markt5: number | null; vix: number | null; sM5: number; sVix: number }>();
{
  const q = (l: number[]) => {
    const t2 = l.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
    return t2.length >= 60 ? t2[Math.floor(t2.length * (GWC?.quantil ?? 0.9))] : Infinity;
  };
  const tageA = alleTage.filter((d) => markt5JeTag.aktie.has(d));
  for (let n = 0; n < tageA.length; n++) {
    const vor = tageA.slice(Math.max(0, n - (GWC?.rollTage ?? 250)), n);
    const sM5 = q(vor.map((d) => markt5JeTag.aktie.get(d) ?? NaN));
    const sVix = q(vor.map((d) => umfeldJeTag.get(d)?.vix ?? NaN));
    const m5 = markt5JeTag.aktie.get(tageA[n]) ?? null;
    const vix = umfeldJeTag.get(tageA[n])?.vix ?? null;
    gegenwindJeTag.set(tageA[n], { aktiv: (m5 !== null && m5 >= sM5) || (vix !== null && vix >= sVix), markt5: m5, vix, sM5, sVix });
  }
}
const gegenwindShort = (f: JagdFall) => !!GWC?.aktiv && f.markt === 'aktie' && /short/i.test(f.spielart) && f.stichtag >= GWC.ab && !!gegenwindJeTag.get(f.stichtag)?.aktiv;
if (ZRV) log(`Zeitreise-Regel: ${ZRV.aktiv ? (zrGebremst ? 'GEBREMST' : 'an') : 'aus'}, Auswahl ${zrFrisch ? `${zrFrisch.length} Muster (Halbmonat ab ${zrDatei?.aktuell?.halbmonatVon})` : 'nicht frisch – unverändert'}, aktiv ${zrAktiv(zrBuch.eintraege).size}, heute ${zrNeu.filter((e) => e.status === 'gewaehlt').length} gewählt/${zrNeu.filter((e) => e.status === 'abgewaehlt').length} abgewählt.`);
const FENSTER_ALLE = (f: number) => Array.from({ length: f }, (_, n) => n + 1);
/** Fall eines Musters im Vorwärtstest: Ausgang, laufend oder noch lauernd (kein Folgetag) */
const SEC_NAME: Record<MeldungArt, string> = { angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: '13D-Meldung (Großaktionär)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz/Delisting/Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzungsänderung (8-K 5.03, oft Aktiensplit)', fusion: 'Fusion (425/DEFM14A)', uebernahme: 'Übernahmeangebot (SC TO/14D9)', beteiligung: '13G-Meldung (Beteiligung ab 5 %)' };
function jagdFall(r: Reihe, i: number, e: BuchMuster, kosten: EtikettKosten, pl: Platz = 'gettex', spKonkret?: Spielart): JagdFall | null {
  const sp = spKonkret ?? spNachSchluessel.get(e.sp);
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
  const stu = studieAm(r, k[i].datum);
  if (stu !== null) sec.push(stu >= 0 ? `Studien-Ende (Phase 2/3) erwartet in ${stu} Tagen` : `Studien-Ende (Phase 2/3) vor ${-stu} Tagen erwartet, Daten ausstehend`);
  const basis = { muster: e.schluessel, wertung: e.wertung, quote: e.rueckblick.quote, wert: r.schluessel.slice(2).split('#')[0], markt: r.markt, stichtag: k[i].datum, fenster: e.fenster, spielart: spielartText(sp), plattform: r.markt === 'krypto' && sp.hebel === 1 ? 'Trade Republic (Krypto direkt)' : PLATZ_NAME[pl], ...(pl === 'cfd' || pl === 'otc' ? { ungeprueft: true } : {}), ...(pump ? { pump: true } : {}), ...(sec.length ? { hinweis: `SEC: ${sec.join(', ')}` } : {}) };
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
/** Q3 (20.11.2026): Modelle nur für einen Ausschnitt („Universum“, z. B. die wilden Werte) – Zusatz im Schlüssel */
const modellZusatz = (m: (typeof MODELLE)[number]) => `${m.ziel === 'treffer' ? '|treffer' : ''}${m.universum ? `|${m.universum.name}` : ''}`;
const universumIdx = new Map(MODELLE.map((m) => [m.idx, (m.universum?.oder ?? []).map((b) => ({ a: E.findIndex((e) => e.merkmal === b.merkmal), klassen: new Set(b.klassen.map((k) => k + 1)) }))]));
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
/** Zeitreise (19.11.2026): eigener Lauf (zeitreise.yml) – überspringt Durchgang 2 und rechnet nur die Gesamtsimulation */
const ZEITREISE = process.env.ZEITREISE === '1';
/** Trefferanalyse (20.11.2026): eigener Lauf (zeitreise.yml, modus=trefferanalyse) – wo entsteht der Volltreffer, was war vorher sichtbar */
const ANALYSE = process.env.TREFFERANALYSE === '1';
/** Zeitlupe (Q1, 20.11.2026): eigener Lauf (zeitreise.yml, modus=zeitlupe) – Einstieg im Tagesverlauf auf Minutenkerzen nachgerechnet */
const ZEITLUPE = process.env.ZEITLUPE === '1';
/** Wellen (Q4, 20.11.2026): eigener Lauf (zeitreise.yml, modus=wellen) – sagt die Marktlage zum Schluss die Volltreffer-Wellen des Folgetags voraus? */
const WELLEN = process.env.WELLEN === '1';
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

for (const r of ZEITREISE || ANALYSE || ZEITLUPE || WELLEN ? [] : reihen) {
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
        const sp0 = spNachSchluessel.get(e.sp);
        const sp = sp0 ? konk(sp0, x) : null;
        if (!sp) continue;
        const pl = platzFuer(r, sp, plattformAm(r, x), true);
        if (!pl) continue;
        const fall = jagdFall(r, i, e, kostenFuer(r.markt, x.umsatz20, pl, sp), pl, sp);
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
    SP.forEach((sp0, s) => {
      const sp = konk(sp0, x);
      if (!sp) return;
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
        if (au.art === 'treffer' && sp.nachziehAb === undefined && sp.vol === undefined && F[f] <= 10 && sp.hebel <= vt.etikett.zensusMaxHebel && (!bester[i] || au.netto > bester[i]!.netto)) {
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
      SP.forEach((sp0, s) => {
        const sp = konk(sp0, x);
        if (!sp) return;
        const pl = platzFuer(r, sp, pa);
        if (!pl) return;
        ausg(i, sp, x, pl).forEach((au, f) => au && zw.add(g, s, f, z, au));
      });
    }
  }
}
log(`${stichtage} handelbare Stichtage, ${episoden.length} Sprung-Episoden, Hypothesen-Fälle: ${JSON.stringify(hypFaelle)}.`);

// ---------- 6. Auswertung ----------
const MERKMAL_TEXT: Record<string, string> = { r1: 'Tagesrendite %', r5: '5-Tage-Rendite %', r20: '20-Tage-Rendite %', relVolumen: 'Umsatz (× Ø 20 Tage)', relSpanne: 'Tagesspanne (× Ø 20 Tage)', abstandHoch20: '20-Tage-Hoch', abstandHoch250: 'Abstand zum Jahreshoch %', lageSchluss: 'Schluss in der Tagesspanne (0 = Tief, 1 = Hoch)', luecke: 'Kurslücke %', schwankung20: 'Schwankung je Tag %', umsatz20: 'Ø Tagesumsatz', kurs: 'Kurs', ueberrendite1: 'Tagesrendite über dem Markt %', marktR1: 'Markt am Stichtag %', boersenwert: 'Börsenwert (Coins)', zahlen: 'Quartalszahlen', branche: 'Branche', angebot: 'Kapitalerhöhung (Prospekt)', registrierung: 'Kapital-Registrierung (S-1/S-3)', grossaktionaer: 'Großaktionär (13D)', vertrag: 'Großvertrag (8-K 1.01)', warnung: 'Warnmeldung (Insolvenz, Delisting, Korrektur)', fuehrung: 'Chefwechsel (8-K 5.02)', satzung: 'Satzung/Aktiensplit (8-K 5.03)', fusion: 'Fusion (425/DEFM14A)', uebernahme: 'Übernahmeangebot (SC TO/14D9)', beteiligung: 'Beteiligung ab 5 % (13G)', vix: 'VIX (Angstbarometer)', vix5: 'VIX-Änderung 5 Tage', fed: 'Zinsentscheid der Fed', breite: 'Marktbreite', markt5: 'Markt 5 Tage', leerquote: 'Leerverkaufsanteil', leerquoteRel: 'Leerverkäufe gegen den eigenen Schnitt', insider: 'Insider-Kauf (Formular 4)', bestandTage: 'Leerverkaufsbestand: Tage zum Eindecken', bestandAenderung: 'Leerverkaufsbestand gegen den vorigen FINRA-Stichtag', anleihen5: 'Lange US-Anleihen (TLT) 5 Tage %', dollar5: 'Dollar (UUP) 5 Tage %', kredit5: 'Kreditmarkt (HYG gegen IEF) 5 Tage, Punkte', oel5: 'Öl (USO) 5 Tage %', sektor5: 'Eigene Branche (Branchen-ETF) 5 Tage %', angst: 'Krypto Fear & Greed', stable30: 'Stablecoin-Menge 30 Tage %', otc: 'Handelsplatz (Börse/OTC)', aktien: 'Aktienzahl (Mio.)', boersenwertUS: 'Börsenwert (Mio. $)', leerAnteil: 'Leerbestand in % der Aktien', max20: 'Größter Tagesgewinn 20 Tage %', volumen5: 'Umsatz 5 Tage (× Ø 20 Tage davor)' , aufmerksamkeit: 'Aufmerksamkeit (Wikipedia-Aufrufe)', branchenThema: 'Thema der Branche in den Weltnachrichten', erwaehnt: 'Im Weltgeschehen erwähnt', nachrichtenlage: 'Nachrichtenlage (stärkstes Thema)', politikDruck: 'Politik-Druck in den Nachrichten', amtsblatt5: 'US-Amtsblatt: Erlasse, Zölle, Sanktionen', katalysator5: 'Katalysator-Meldung (SEC-Volltext) in 5 Tagen', katalysator20: 'Katalysator-Meldung (SEC-Volltext) in 20 Tagen' };
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
if (ZEITREISE) {
  // ---------- Zeitreise: Gesamtsimulation ohne Blick nach vorn (core/volltreffer/zeitreise.ts) ----------
  const ZR = (vt as unknown as { zeitreise: { fenster: number; mindestFaelleHaelfte: number; mindestQuote: number; maxMuster: number; maxJeBaustein: number; abstand: number; ersterAbschnitt: number; sichtbarMaxOffen: number; sichtbarMaxJeTag: number; jagdenMaxOffen: number; jagdenMaxJeTag: number } }).zeitreise;
  const fZ = F.indexOf(ZR.fenster);
  const ZS = SP.map((sp, s) => (sp.stopEuro === vt.etikett.standardStop && sp.nachziehAb === undefined ? s : -1)).filter((s) => s >= 0);
  const erster = alleTage[0] ?? heute;
  const abschnitt = (d: string) => (Number(d.slice(0, 4)) * 12 + Number(d.slice(5, 7)) - 1 - (Number(erster.slice(0, 4)) * 12 + Number(erster.slice(5, 7)) - 1)) * 2 + (Number(d.slice(8, 10)) > 15 ? 1 : 0);
  const ABSCHNITTE = abschnitt(heute) + 1;
  const kal = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${erster}T12:00:00Z`)) / 86400000);
  const st = new ZeitStat(ABSCHNITTE, gruppen.length, ZS.length);
  // Fälle kompakt: Klassen je Einteilung (255 = unbekannt), Ergebnis je Standard-Spielart im Fenster
  const NE = E.length;
  let zeilen = 0;
  const cap = 4_500_000;
  const kl = new Uint8Array(cap * NE).fill(255);
  const netto = new Float32Array(cap * ZS.length).fill(NaN);
  const art = new Uint8Array(cap * ZS.length);
  const aus = new Int32Array(cap * ZS.length);
  const zTag = new Int32Array(cap);
  const zAbs = new Int16Array(cap);
  const zMarkt = new Uint8Array(cap);
  const zWert: string[] = [];
  // Gruppen-Nummern als Tabellen (keine Texte im inneren Kreis): Einzel [Markt][Einteilung][Klasse], Paar-Basis [Markt][a·NE+b]
  const einzelTab = MAERKTE.map((mk) => E.map((e, a) => Array.from({ length: e.grenzen.length + 1 }, (_, c) => gid.get(`${mk}|${a}=${c}`)!)));
  const paarTab = MAERKTE.map((mk) => {
    const t = new Int32Array(NE * NE).fill(-1);
    for (let a = 0; a < NE; a++) for (let b = a + 1; b < NE; b++) if (E[a].paare !== false && E[b].paare !== false) t[a * NE + b] = gid.get(`${mk}|${a}=0&${b}=0`)!;
    return t;
  });
  const alleTab = MAERKTE.map((mk) => gid.get(`${mk}|alle`)!);
  const breite = E.map((e) => e.grenzen.length + 1);
  for (const r of reihen) {
    const k = r.kerzen;
    const m = k.map((_, i) => merkmale(k, i));
    const mi = r.markt;
    for (let i = 1; i < k.length - 1; i++) {
      const x = m[i];
      if (!x || !handelbar(r, x, k[i])) continue;
      if (zeilen >= cap) break;
      const klassen = klassenAm(r, x, k[i].datum);
      const pa = plattformAm(r, x);
      const b = abschnitt(k[i].datum);
      let irgendwas = false;
      const z = zeilen;
      ZS.forEach((s, j) => {
        const sp = konk(SP[s], x);
        if (!sp) return;
        const pl = platzFuer(r, sp, pa);
        if (!pl) return;
        const au = etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F)[fZ];
        if (!au) return;
        netto[z * ZS.length + j] = au.netto;
        art[z * ZS.length + j] = au.art === 'treffer' ? 1 : 0;
        aus[z * ZS.length + j] = kal(k[Math.min(k.length - 1, i + au.tag)].datum);
        irgendwas = true;
      });
      if (!irgendwas) continue;
      for (let a = 0; a < NE; a++) if (klassen[a] !== null) kl[z * NE + a] = klassen[a]!;
      zTag[z] = kal(k[i].datum);
      zAbs[z] = b;
      zMarkt[z] = mi === 'aktie' ? 0 : 1;
      zWert[z] = r.schluessel.replace(/#\d+$/, '');
      zeilen++;
    }
  }
  // Zählen mit dem Tag als Einheit (wie die Klumpen-Prüfung des Rückblicks): je Tag, Gruppe und Spielart ein Wert –
  // Ø der Fälle des Tages und Anteil der Volltreffer. Sonst wählen Muster, deren Fälle an wenigen Tagen klumpen.
  const gruppenIds = (z: number): number[] => {
    const mIdx = zMarkt[z];
    const pt = paarTab[mIdx];
    const ids: number[] = [alleTab[mIdx]];
    for (let a = 0; a < NE; a++) {
      const ca = kl[z * NE + a];
      if (ca !== 255) ids.push(einzelTab[mIdx][a][ca]);
    }
    for (let a = 0; a < NE; a++) {
      const ca = kl[z * NE + a];
      if (ca === 255) continue;
      for (let c = a + 1; c < NE; c++) {
        const cc = kl[z * NE + c];
        const basis = pt[a * NE + c];
        if (cc !== 255 && basis >= 0) ids.push(basis + ca * breite[c] + cc);
      }
    }
    return ids;
  };
  {
    const reihenfolge = Array.from({ length: zeilen }, (_, z) => z).sort((p, q) => zTag[p] - zTag[q] || zMarkt[p] - zMarkt[q]);
    const L = gruppen.length * ZS.length;
    const tN = new Float32Array(L);
    const tS = new Float64Array(L);
    const tT = new Float32Array(L);
    // Abschnitt, in dem das Ergebnis feststand (spätester Ausstieg der Fälle des Tages): erst ab dann darf die Auswahl
    // es kennen (20.11.2026: vorher zählte der Abschnitt des Stichtags – Fälle vom Ende eines Halbmonats endeten oft erst
    // im nächsten, ihre Ergebnisse flossen so zu früh in dessen Auswahl ein)
    const tA = new Int16Array(L);
    const absVonKal = new Int16Array(kal(heute) + 2);
    for (let t = 0; t < absVonKal.length; t++) absVonKal[t] = abschnitt(new Date(Date.parse(`${erster}T12:00:00Z`) + t * 86400000).toISOString().slice(0, 10));
    const beruehrt: number[] = [];
    let tagJetzt = -1;
    let absJetzt = 0;
    const abschliessen = () => {
      for (const p of beruehrt) {
        const g = Math.floor(p / ZS.length);
        st.add(Math.min(ABSCHNITTE - 1, Math.max(absJetzt, tA[p])), g, p - g * ZS.length, tS[p] / tN[p], tT[p] / tN[p]);
        tN[p] = 0;
        tS[p] = 0;
        tT[p] = 0;
        tA[p] = 0;
      }
      beruehrt.length = 0;
    };
    for (const z of reihenfolge) {
      if (zTag[z] !== tagJetzt) {
        abschliessen();
        tagJetzt = zTag[z];
        absJetzt = zAbs[z];
      }
      const ids = gruppenIds(z);
      for (let j = 0; j < ZS.length; j++) {
        const v = netto[z * ZS.length + j];
        if (Number.isNaN(v)) continue;
        const t = art[z * ZS.length + j];
        const ea = absVonKal[Math.min(absVonKal.length - 1, aus[z * ZS.length + j])];
        for (const g of ids) {
          const p = g * ZS.length + j;
          if (tN[p] === 0) beruehrt.push(p);
          tN[p]++;
          tS[p] += v;
          tT[p] += t;
          if (ea > tA[p]) tA[p] = ea;
        }
      }
    }
    abschliessen();
  }
  st.kumulieren();
  log(`Zeitreise: ${zeilen} Stichtage gezählt, ${ABSCHNITTE} Halbmonate seit ${erster}, ${ZS.length} Spielarten (Fenster ${ZR.fenster} Tage).`);
  // Auswahl je Halbmonat nur aus Fällen, deren Ergebnis feststand
  const alleVon = (g: number) => gid.get(`${gruppen[g].split('|')[0]}|alle`)!;
  const kandidatGruppe = (g: number) => !gruppen[g].endsWith('|alle') && !gruppen[g].includes('|hyp=');
  const bausteineVon = (g: number) => gruppen[g].split('|')[1]?.split('&') ?? [];
  const regeln = { mindestFaelleHaelfte: ZR.mindestFaelleHaelfte, mindestQuote: ZR.mindestQuote, maxMuster: ZR.maxMuster, maxJeBaustein: ZR.maxJeBaustein, abstand: ZR.abstand, ersterAbschnitt: ZR.ersterAbschnitt };
  const wahl: Gewaehlt[][] = [];
  for (let b = 0; b < ABSCHNITTE; b++) wahl.push(auswaehlen(st, b, regeln, kandidatGruppe, alleVon, bausteineVon));
  log(`Zeitreise: Auswahl je Halbmonat ${wahl.map((w) => w.length).join(',')}.`);
  // Bedingungen der gewählten Gruppen (Einteilung=Klasse, ein oder zwei Bausteine) je Halbmonat
  const bedingung = (g: number) => (gruppen[g].split('|')[1] ?? '').split('&').map((t) => t.split('=').map(Number) as [number, number]);
  const wahlBed = wahl.map((w) => w.map((x) => ({ x, markt: gruppen[x.g].startsWith('aktie|') ? 0 : 1, bed: bedingung(x.g), text: '' })));
  const kandidaten: Kandidat[] = [];
  // Q4 Wellen (20.11.2026): Variante „Gegenwind“ – keine Shorts an Tagen, an denen der Markt über 5 Tage stark gestiegen
  // ist oder der VIX hoch steht (Wellen-Analyse: Shorts schwankungsreicher Werte dort Ø −60 bis −80 € in beiden Zeiträumen)
  const GW = (ZR as unknown as { gegenwind?: { markt5Ab: number; vixAb: number } }).gegenwind ?? { markt5Ab: 1.7, vixAb: 24 };
  // Beständigkeit: dieselbe Regel mit lockereren/strengeren Schwellen und je Bedingung allein
  const GW_VARIANTEN: { markt5Ab: number; vixAb: number; rollend?: boolean; markt5Bis?: number }[] = [GW, { markt5Ab: 1.2, vixAb: 22 }, { markt5Ab: 2.2, vixAb: 28 }, { markt5Ab: GW.markt5Ab, vixAb: Infinity }, { markt5Ab: Infinity, vixAb: GW.vixAb }, { markt5Ab: NaN, vixAb: NaN, rollend: true }, { markt5Ab: GW.markt5Ab, vixAb: GW.vixAb, markt5Bis: -1.8 }];
  // rollend: Schwellen = oberstes Zehntel der vorigen 250 Handelstage (nur Vergangenheit, kein Blick nach vorn)
  const rollSchwelle = new Map<string, { m5: number; vix: number }>();
  {
    const q90 = (l: number[]) => {
      const t2 = l.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
      return t2.length >= 60 ? t2[Math.floor(t2.length * 0.9)] : Infinity;
    };
    for (let n = 0; n < alleTage.length; n++) {
      const vor = alleTage.slice(Math.max(0, n - 250), n);
      rollSchwelle.set(alleTage[n], { m5: q90(vor.map((d) => markt5JeTag.aktie.get(d) ?? NaN)), vix: q90(vor.map((d) => umfeldJeTag.get(d)?.vix ?? NaN)) });
    }
  }
  const kandidatenWindV: Kandidat[][] = GW_VARIANTEN.map(() => []);
  const datumVonTag = (t: number) => new Date(Date.parse(`${erster}T12:00:00Z`) + t * 86400000).toISOString().slice(0, 10);
  const lageCache = new Map<number, { m5: number; vix: number }>();
  const lageVon = (t: number) => {
    if (!lageCache.has(t)) {
      const d = datumVonTag(t);
      lageCache.set(t, { m5: markt5JeTag.aktie.get(d) ?? 0, vix: umfeldJeTag.get(d)?.vix ?? 0 });
    }
    return lageCache.get(t)!;
  };
  let alleN = 0, alleT = 0, alleSum = 0;
  for (let z = 0; z < zeilen; z++) {
    const w = wahlBed[zAbs[z]];
    if (!w?.length) continue;
    let beste: Kandidat | null = null;
    const besteWindV: (Kandidat | null)[] = GW_VARIANTEN.map(() => null);
    const lz = lageVon(zTag[z]);
    const rs = rollSchwelle.get(datumVonTag(zTag[z]));
    const gwV = GW_VARIANTEN.map((g) => zMarkt[z] === 0 && (g.rollend ? !!rs && (lz.m5 >= rs.m5 || lz.vix >= rs.vix) : lz.m5 >= g.markt5Ab || lz.vix >= g.vixAb || (g.markt5Bis !== undefined && lz.m5 <= g.markt5Bis)));
    for (const wb of w) {
      const x = wb.x;
      if (wb.markt !== zMarkt[z]) continue;
      if (!wb.bed.every(([a, c]) => kl[z * NE + a] === c)) continue;
      const v = netto[z * ZS.length + x.s];
      if (Number.isNaN(v)) continue;
      alleN++;
      alleSum += v;
      if (art[z * ZS.length + x.s] === 1) alleT++;
      if (!beste || x.wertung > beste.wertung) {
        if (!wb.text) wb.text = `${gruppenText(gruppen[x.g])} – ${spielartText(SP[ZS[x.s]])}`;
        beste = { tag: zTag[z], wert: zWert[z], wertung: x.wertung, netto: v, treffer: art[z * ZS.length + x.s] === 1, dauer: Math.max(1, aus[z * ZS.length + x.s] - zTag[z]), muster: wb.text };
      }
      for (let gi = 0; gi < GW_VARIANTEN.length; gi++) {
        if (gwV[gi] && SP[ZS[x.s]].richtung === 'short') continue;
        const bw = besteWindV[gi];
        if (bw && x.wertung <= bw.wertung) continue;
        if (!wb.text) wb.text = `${gruppenText(gruppen[x.g])} – ${spielartText(SP[ZS[x.s]])}`;
        besteWindV[gi] = { tag: zTag[z], wert: zWert[z], wertung: x.wertung, netto: v, treffer: art[z * ZS.length + x.s] === 1, dauer: Math.max(1, aus[z * ZS.length + x.s] - zTag[z]), muster: wb.text };
      }
    }
    if (beste) kandidaten.push(beste);
    besteWindV.forEach((k, gi) => k && kandidatenWindV[gi].push(k));
  }
  // Grundrate: alle handelbaren Stichtage im selben Zeitraum mit der Spielart der gewählten Muster
  let grN = 0, grT = 0, grSum = 0;
  const ab = Math.min(...wahl.map((w, b) => (w.length ? b : Infinity)));
  for (let z = 0; z < zeilen; z++) {
    if (zAbs[z] < ab) continue;
    for (let j = 0; j < ZS.length; j++) {
      const v = netto[z * ZS.length + j];
      if (Number.isNaN(v)) continue;
      grN++;
      grSum += v;
      if (art[z * ZS.length + j] === 1) grT++;
    }
  }
  const monatVon = (t: number) => new Date(Date.parse(`${erster}T12:00:00Z`) + t * 86400000).toISOString().slice(0, 7);
  // Seit 20.11.2026 (Q4): die sichtbare Regel nutzt den rollenden Gegenwind-Filter (wie live); ohne Filter zum Vergleich
  const iRoll = GW_VARIANTEN.findIndex((g) => g.rollend);
  const sichtbar = nachspielen(kandidatenWindV[iRoll], { maxOffen: ZR.sichtbarMaxOffen, maxJeTag: ZR.sichtbarMaxJeTag });
  const sichtbarOhne = nachspielen(kandidaten, { maxOffen: ZR.sichtbarMaxOffen, maxJeTag: ZR.sichtbarMaxJeTag });
  const jagden = nachspielen(kandidaten, { maxOffen: ZR.jagdenMaxOffen, maxJeTag: ZR.jagdenMaxJeTag });
  const haeufig = new Map<string, { orders: number; volltreffer: number; netto: number }>();
  for (const o of sichtbar) {
    const h = haeufig.get(o.muster) ?? haeufig.set(o.muster, { orders: 0, volltreffer: 0, netto: 0 }).get(o.muster)!;
    h.orders++;
    if (o.treffer) h.volltreffer++;
    h.netto += o.netto;
  }
  const ergebnis = {
    stand: jetzt.toISOString(),
    hinweis: `Zeitreise: der ganze Ablauf über die Kursgeschichte nachgespielt, als wäre er live gelaufen. Je Halbmonat wählt der Code bis zu ${ZR.maxMuster} Muster nur aus Fällen, deren Ergebnis da schon feststand (${ZR.abstand} Halbmonat Abstand): der Tag zählt als Einheit (Ø und Volltreffer-Anteil der Fälle eines Tages), in beiden Hälften der Vergangenheit je mindestens ${ZR.mindestFaelleHaelfte} Tage im Plus, besser als die Grundrate, Quote ab ${ZR.mindestQuote} %, höchstens ${ZR.maxJeBaustein} je Baustein. Dann je Tag die Fälle dieser Muster nach Wertung: „sichtbar“ höchstens ${ZR.sichtbarMaxOffen} offene Orders, ohne Aktien-Shorts bei Gegenwind (Markt 5 Tage oder VIX im obersten Zehntel der vorigen 250 Tage), „Jagden“ höchstens ${ZR.jagdenMaxOffen}, je Wert eine; 1.000 € je Order nach Kosten, Ausstieg bei Ziel (+400 €), Stop (−150 €) oder nach ${ZR.fenster} Handelstagen. Vereinfachungen: ohne Klumpen-Grenze zwischen Werten, Pump-Filter und Gesamtmodell. Nur Kennzahlen, keine Kurse.`,
    zeitraum: { von: kandidaten.length ? monatVon(kandidaten.reduce((a, k) => Math.min(a, k.tag), Infinity)) : null, bis: heute.slice(0, 7) },
    regeln: ZR,
    auswahl: { halbmonate: wahl.filter((w) => w.length).length, oeMuster: Math.round(wahl.reduce((a, w) => a + w.length, 0) / Math.max(1, wahl.filter((w) => w.length).length)) },
    sichtbar: bilanz(sichtbar, monatVon),
    sichtbarOhneFilter: bilanz(sichtbarOhne, monatVon),
    // Q4: Variante mit Gegenwind-Filter (keine Shorts bei starkem Markt über 5 Tage oder hohem VIX)
    sichtbarGegenwind: bilanz(nachspielen(kandidatenWindV[0], { maxOffen: ZR.sichtbarMaxOffen, maxJeTag: ZR.sichtbarMaxJeTag }), monatVon),
    gegenwind: GW,
    gegenwindVarianten: GW_VARIANTEN.map((g, gi) => {
      const b2 = bilanz(nachspielen(kandidatenWindV[gi], { maxOffen: ZR.sichtbarMaxOffen, maxJeTag: ZR.sichtbarMaxJeTag }), monatVon);
      return { rollend: !!g.rollend, markt5Bis: g.markt5Bis ?? null, markt5Ab: Number.isFinite(g.markt5Ab) ? g.markt5Ab : null, vixAb: Number.isFinite(g.vixAb) ? g.vixAb : null, orders: b2.orders, volltreffer: b2.volltreffer, quote: b2.quote, netto: b2.netto, oe: b2.oe, maxRueckgang: b2.maxRueckgang, monatePlus: b2.monate.filter((mo) => mo.netto > 0).length, monate: b2.monate.length };
    }),
    jagden: bilanz(jagden, monatVon),
    alleMusterfaelle: { faelle: alleN, quote: alleN ? Math.round((alleT / alleN) * 1000) / 10 : 0, oe: alleN ? Math.round((alleSum / alleN) * 10) / 10 : 0 },
    grundrate: { faelle: grN, quote: grN ? Math.round((grT / grN) * 1000) / 10 : 0, oe: grN ? Math.round((grSum / grN) * 10) / 10 : 0 },
    haeufigsteMuster: [...haeufig.entries()].sort((a, b) => b[1].orders - a[1].orders).slice(0, 12).map(([muster, h]) => ({ muster, orders: h.orders, volltreffer: h.volltreffer, netto: Math.round(h.netto) })),
    // Live-Regel (Nutzer 20.11.2026): die Auswahl des laufenden Halbmonats – der nächtliche Rückblick ordert daraus sichtbar
    aktuell: {
      halbmonatVon: `${heute.slice(0, 8)}${Number(heute.slice(8, 10)) > 15 ? '16' : '01'}`,
      muster: (wahl[ABSCHNITTE - 1] ?? []).map((x) => ({
        schluessel: `${gruppen[x.g]}|${spielartSchluessel(SP[ZS[x.s]])}|${ZR.fenster}`,
        gruppe: gruppenText(gruppen[x.g]),
        gruppenSchluessel: gruppen[x.g],
        sp: spielartSchluessel(SP[ZS[x.s]]),
        spielart: spielartText(SP[ZS[x.s]]),
        fenster: ZR.fenster,
        wertung: Math.round(x.wertung * 100) / 100,
        quote: Math.round(x.quote * 10) / 10,
        ev: Math.round(x.ev * 10) / 10,
        tage: x.n,
      })),
    },
  };
  schreibeJson('lernen/zeitreise.json', ergebnis);
  log(`Zeitreise sichtbar ohne Gegenwind-Filter: ${ergebnis.sichtbarOhneFilter.orders} Orders, Ø ${ergebnis.sichtbarOhneFilter.oe} €, netto ${ergebnis.sichtbarOhneFilter.netto} €.`);
  log(`Zeitreise sichtbar mit rollendem Gegenwind (${ZR.sichtbarMaxOffen} offen): ${ergebnis.sichtbar.orders} Orders, ${ergebnis.sichtbar.volltreffer} Volltreffer (${ergebnis.sichtbar.quote} %), netto ${ergebnis.sichtbar.netto} €, Ø ${ergebnis.sichtbar.oe} €, größter Rückgang ${ergebnis.sichtbar.maxRueckgang} €.`);
  log(`Zeitreise Jagden (${ZR.jagdenMaxOffen} offen): ${ergebnis.jagden.orders} Orders, ${ergebnis.jagden.volltreffer} Volltreffer (${ergebnis.jagden.quote} %), netto ${ergebnis.jagden.netto} €, Ø ${ergebnis.jagden.oe} €, größter Rückgang ${ergebnis.jagden.maxRueckgang} €.`);
  log(`Zeitreise Vergleich: alle Fälle der gewählten Muster ${alleN} (Quote ${ergebnis.alleMusterfaelle.quote} %, Ø ${ergebnis.alleMusterfaelle.oe} €) · Grundrate ${grN} (Quote ${ergebnis.grundrate.quote} %, Ø ${ergebnis.grundrate.oe} €).`);
  for (const mo of ergebnis.sichtbar.monate) log(`  ${mo.monat}: ${mo.orders} Orders, ${mo.volltreffer} Volltreffer, ${mo.netto} €`);
  for (const g of ergebnis.gegenwindVarianten) log(`Zeitreise Gegenwind-Variante ${g.rollend ? 'rollend (oberstes Zehntel der vorigen 250 Tage)' : `Markt5 ≥ ${g.markt5Ab ?? '–'} / VIX ≥ ${g.vixAb ?? '–'}${g.markt5Bis !== null ? ` / Markt5 ≤ ${g.markt5Bis}` : ''}`}: ${g.orders} Orders, ${g.volltreffer} Volltreffer (${g.quote} %), netto ${g.netto} €, Ø ${g.oe} €, Rückgang ${g.maxRueckgang} €, ${g.monatePlus}/${g.monate} Monate im Plus.`);
  log(`Zeitreise sichtbar mit Gegenwind-Filter (keine Shorts bei Markt 5 Tage ≥ ${GW.markt5Ab} % oder VIX ≥ ${GW.vixAb}): ${ergebnis.sichtbarGegenwind.orders} Orders, ${ergebnis.sichtbarGegenwind.volltreffer} Volltreffer (${ergebnis.sichtbarGegenwind.quote} %), netto ${ergebnis.sichtbarGegenwind.netto} €, Ø ${ergebnis.sichtbarGegenwind.oe} €, größter Rückgang ${ergebnis.sichtbarGegenwind.maxRueckgang} €.`);
  log(`Zeitreise aktuell (Halbmonat ab ${ergebnis.aktuell.halbmonatVon}): ${ergebnis.aktuell.muster.length} Muster für die Live-Regel.`);
  process.exit(0);
}
if (WELLEN) {
  // ---------- Wellen (Q4, Nutzer 20.11.2026: „Punkt 4 besonders interessant … das Bestmögliche rausholen“) ----------
  // 37 % der Volltreffer beginnen an 10 % der Tage. Frage: Kündigt die Marktlage zum Schluss eines Tages (alles, was dann
  // bekannt ist) an, dass ab der nächsten Eröffnung viele Volltreffer in EINE Richtung beginnen? Gemessen für die
  // schwankungsreichen Werte (Schwankung je Tag ≥ hochVol %), Turbo Hebel 2 und Hebel nach Schwankung (2 σ), long und
  // short, Fenster 10 Tage. Je Merkmal der Marktlage: Zehntel der Tage → Volltreffer-Quote und Ø je Order, getrennt nach
  // den beiden Zeiträumen (Beständigkeit). Nur Zählungen.
  const TAGE = Number(process.env.ANALYSE_TAGE ?? 520);
  const hochVol = Number(process.env.WELLEN_HOCHVOL ?? 5);
  const fA = F.indexOf(10);
  const std = vt.etikett.standardStop;
  const finde = (h: number, rt: 'long' | 'short', vol?: number) => SP.find((sp) => sp.stopEuro === std && sp.nachziehAb === undefined && sp.richtung === rt && (vol ? sp.vol === vol : sp.vol === undefined && sp.hebel === h));
  const ARTEN = [['H2L', finde(2, 'long')], ['H2S', finde(2, 'short')], ['V2L', finde(0, 'long', 2)], ['V2S', finde(0, 'short', 2)]].filter((x): x is [string, Spielart] => !!x[1]);
  type T = { n: number; vt: number[]; sum: number[]; m: number[] };
  const jeTag = new Map<string, T>();
  const neuT = (): T => ({ n: 0, vt: ARTEN.map(() => 0), sum: ARTEN.map(() => 0), m: ARTEN.map(() => 0) });
  for (const r of reihen) {
    if (r.markt !== 'aktie') continue;
    const k = r.kerzen;
    for (let i = Math.max(21, k.length - TAGE - 12); i + 10 < k.length; i++) {
      const x = merkmale(k, i);
      if (!x || !handelbar(r, x, k[i]) || !((x.schwankung20 ?? 0) >= hochVol)) continue;
      const t = jeTag.get(k[i].datum) ?? jeTag.set(k[i].datum, neuT()).get(k[i].datum)!;
      t.n++;
      const pa = plattformAm(r, x);
      ARTEN.forEach(([, sp0], j) => {
        const sp = konk(sp0, x);
        if (!sp) return;
        const pl = platzFuer(r, sp, pa, true);
        if (!pl) return;
        const a = etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F)[fA];
        if (!a) return;
        t.m[j]++;
        t.sum[j] += a.netto;
        if (a.art === 'treffer') t.vt[j]++;
      });
    }
  }
  const tage = [...jeTag.keys()].filter((d) => jeTag.get(d)!.n >= 20).sort();
  // Marktlage zum Schluss: aus allen handelbaren Aktien des Tages (r1JeTag) und dem Umfeld
  const anteil = (l: number[], f: (v: number) => boolean) => (l.length ? l.filter(f).length / l.length : null);
  const med = (l: number[]) => {
    const s2 = [...l].sort((a, b) => a - b);
    return s2.length ? s2[Math.floor(s2.length / 2)] : null;
  };
  const lage = new Map<string, Record<string, number | null>>();
  for (const [n, d] of alleTage.entries()) {
    const l = r1JeTag.aktie.get(d) ?? [];
    const vorher = alleTage[n - 1] ? lage.get(alleTage[n - 1]) : undefined;
    const u = umfeldJeTag.get(d);
    const w = {
      markt: med(l),
      breite: anteil(l, (v) => v > 0),
      absturz10: anteil(l, (v) => v <= -10),
      sprung10: anteil(l, (v) => v >= 10),
      markt5: markt5JeTag.aktie.get(d) ?? null,
      vix: u?.vix ?? null,
      vix5: u?.vix5 ?? null,
      vortagAbsturz10: vorher?.absturz10 ?? null,
      vortagSprung10: vorher?.sprung10 ?? null,
    };
    lage.set(d, w);
  }
  const MERK = ['markt', 'breite', 'absturz10', 'sprung10', 'markt5', 'vix', 'vix5', 'vortagAbsturz10', 'vortagSprung10'];
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const oe = (a: number, b: number) => (b ? Math.round((a / b) * 10) / 10 : 0);
  const auswertung: Record<string, unknown> = {};
  // Grundwerte je Spielart
  const grund = ARTEN.map(([name], j) => {
    let m = 0, vt2 = 0, sum = 0;
    for (const d of tage) (m += jeTag.get(d)!.m[j], (vt2 += jeTag.get(d)!.vt[j]), (sum += jeTag.get(d)!.sum[j]));
    return { spielart: name, orders: m, quote: pct(vt2, m), oe: oe(sum, m) };
  });
  log(`Wellen: ${tage.length} Tage mit ≥ 20 schwankungsreichen Werten (Schwankung ≥ ${hochVol} %), Grundwerte ${JSON.stringify(grund)}.`);
  for (const mk of MERK) {
    const mit = tage.filter((d) => typeof lage.get(d)?.[mk] === 'number');
    const sortiert = [...mit].sort((a, b) => (lage.get(a)![mk] as number) - (lage.get(b)![mk] as number));
    const zehntel = Array.from({ length: 10 }, (_, z) => sortiert.slice(Math.floor((z * sortiert.length) / 10), Math.floor(((z + 1) * sortiert.length) / 10)));
    const zeilen = zehntel.map((ds, z) => {
      const von = ds.length ? (lage.get(ds[0])![mk] as number) : null;
      const bis = ds.length ? (lage.get(ds[ds.length - 1])![mk] as number) : null;
      const je = ARTEN.map(([name], j) => {
        const sumF = (teil: string[]) => teil.reduce((a, d) => ({ m: a.m + jeTag.get(d)!.m[j], vt: a.vt + jeTag.get(d)!.vt[j], s: a.s + jeTag.get(d)!.sum[j] }), { m: 0, vt: 0, s: 0 });
        const g = sumF(ds);
        const a = sumF(ds.filter((d) => d < grenze));
        const b = sumF(ds.filter((d) => d >= grenze));
        // Tage als Einheit: Ø der Tages-Ø (ein Wellentag zählt einmal)
        const tagesOe = ds.length ? oe(ds.reduce((s3, d) => s3 + (jeTag.get(d)!.m[j] ? jeTag.get(d)!.sum[j] / jeTag.get(d)!.m[j] : 0), 0), ds.length) : 0;
        return { spielart: name, quote: pct(g.vt, g.m), oe: oe(g.s, g.m), tagesOe, oeA: oe(a.s, a.m), oeB: oe(b.s, b.m), tageA: ds.filter((d) => d < grenze).length, tageB: ds.filter((d) => d >= grenze).length };
      });
      return { zehntel: z + 1, tage: ds.length, von: von === null ? null : Math.round(von * 1000) / 1000, bis: bis === null ? null : Math.round(bis * 1000) / 1000, je };
    });
    auswertung[mk] = zeilen;
    for (const z of zeilen) log(`Wellen ${mk} Zehntel ${z.zehntel} (${z.von}…${z.bis}, ${z.tage} Tage): ${z.je.map((e) => `${e.spielart} Q ${e.quote} % Ø ${e.oe} (Tag-Ø ${e.tagesOe}, A ${e.oeA}/B ${e.oeB})`).join(' · ')}`);
  }
  schreibeJson('lernen/wellen.json', { stand: jetzt.toISOString(), hinweis: `Wellen (Q4): Marktlage zum Schluss in Zehnteln der Tage gegen Volltreffer-Quote und Ø je Order der schwankungsreichen Werte (Schwankung ≥ ${hochVol} % je Tag) ab der nächsten Eröffnung; A/B = die beiden Zeiträume. Nur Zählungen.`, grund, auswertung });
  process.exit(0);
}
if (ZEITLUPE) {
  // ---------- Zeitlupe (Q1, Nutzer 20.11.2026): Einstieg im Tagesverlauf statt zur nächsten Eröffnung ----------
  // Grundlage: Minutenkerzen (privat, minuten/) der Tage, an denen das Tageshoch ≥ +15 % über dem Vortagesschluss lag,
  // samt Folgetag. Jede Regel löst nur mit dem aus, was bis zur jeweiligen Minute bekannt war; Einstieg zur Eröffnung der
  // nächsten Minute; danach Minuten bis zum Ende des Folgetags, dann Tageskerzen bis 10 Handelstage. Vergleich: der
  // bisherige Weg (Schluss ≥ +X % → Einstieg zur nächsten Eröffnung) auf denselben Tagen. Nur Zählungen öffentlich.
  const ordner = join(ARCHIV, 'minuten');
  const dateien: string[] = [];
  if (existsSync(ordner)) for (const j of readdirSync(ordner)) if (/^\d{4}$/.test(j)) for (const f of readdirSync(join(ordner, j))) if (f.endsWith('.json.gz')) dateien.push(join(ordner, j, f));
  const jeTicker = new Map<string, Reihe[]>();
  for (const r of reihen) if (r.markt === 'aktie') (jeTicker.get(r.schluessel.slice(2).split('#')[0]) ?? jeTicker.set(r.schluessel.slice(2).split('#')[0], []).get(r.schluessel.slice(2).split('#')[0])!).push(r);
  const STD = SP.filter((sp) => sp.stopEuro === vt.etikett.standardStop && sp.nachziehAb === undefined && sp.vol === undefined && [1, 2, 3].includes(sp.hebel));
  // Börsenzeiten in Minuten seit 0 Uhr UTC (Sommerzeit USA: zweiter Sonntag im März bis erster Sonntag im November)
  const sommer = (d: string) => {
    const y = Number(d.slice(0, 4));
    const sonntag = (m: number, n: number) => {
      const erster = new Date(Date.UTC(y, m, 1)).getUTCDay();
      return `${y}-${String(m + 1).padStart(2, '0')}-${String(1 + ((7 - erster) % 7) + 7 * (n - 1)).padStart(2, '0')}`;
    };
    return d >= sonntag(2, 2) && d < sonntag(10, 1);
  };
  const auf = (d: string) => (sommer(d) ? 810 : 870);
  type Bar = { m: number; o: number; h: number; l: number; c: number; v: number };
  type Regel = { name: string; richtung: 'long' | 'short'; text: string };
  const R: Regel[] = [];
  const st = new Map<string, { n: number; vt: number; sum: number; werte: number[]; nA: number; sumA: number; nB: number; sumB: number; tage: Set<string> }>();
  const zaehle = (regel: string, sp: Spielart, d: string, a: Ausgang) => {
    const k = `${regel}|${spielartSchluessel(sp)}`;
    const z = st.get(k) ?? st.set(k, { n: 0, vt: 0, sum: 0, werte: [], nA: 0, sumA: 0, nB: 0, sumB: 0, tage: new Set() }).get(k)!;
    z.n++;
    z.sum += a.netto;
    z.werte.push(a.netto);
    if (a.art === 'treffer') z.vt++;
    if (d < grenze) (z.nA++, (z.sumA += a.netto));
    else (z.nB++, (z.sumB += a.netto));
    z.tage.add(d);
  };
  const regel = (name: string, richtung: 'long' | 'short', text: string) => {
    if (!R.some((x) => x.name === name)) R.push({ name, richtung, text });
    return name;
  };
  let ereignisse = 0, ohneReihe = 0, uneinheitlich = 0;
  for (const datei of dateien.sort()) {
    const d = datei.slice(-18, -8);
    const inhalt = JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as Record<string, number[][]>;
    for (const [ticker, roh] of Object.entries(inhalt)) {
      const r = (jeTicker.get(ticker) ?? []).find((x) => x.kerzen.some((k) => k.datum === d));
      if (!r) {
        ohneReihe++;
        continue;
      }
      const k = r.kerzen;
      const i = k.findIndex((x) => x.datum === d);
      if (i < 21 || i + 1 >= k.length) continue;
      const d1 = k[i + 1].datum;
      const tageBis = Math.round((Date.parse(`${d1}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86400000);
      const bars: Bar[] = roh.map(([m, o, h, l, c, v]) => ({ m, o, h, l, c, v }));
      const regTag0 = bars.filter((b) => b.m >= auf(d) && b.m < auf(d) + 390);
      const vorTag0 = bars.filter((b) => b.m >= auf(d) - 330 && b.m < auf(d));
      const regTag1 = bars.filter((b) => b.m >= tageBis * 1440 + auf(d1) && b.m < tageBis * 1440 + auf(d1) + 390);
      if (regTag0.length < 30 || !regTag1.length) continue;
      // Faktor zwischen bereinigter Tagesreihe und unbereinigten Minuten (Splits) – muss an beiden Tagen passen
      const f0 = k[i].c / regTag0[regTag0.length - 1].c;
      const f1 = k[i + 1].c / regTag1[regTag1.length - 1].c;
      if (!(f0 > 0) || Math.abs(f1 / f0 - 1) > 0.03) {
        uneinheitlich++;
        continue;
      }
      ereignisse++;
      const pc = k[i - 1].c / f0;
      const avgVol = (k.slice(i - 20, i).reduce((s, x) => s + (x.v ?? 0), 0) / 20) * f0;
      const x = merkmale(k, i - 1);
      if (!x) continue;
      const pa = plattformAm(r, x);
      const tageskerzen = k.slice(i + 2, i + 10).map((y) => ({ datum: y.datum, o: y.o / f0, h: y.h / f0, l: y.l / f0, c: y.c / f0 }));
      /** Einstieg bei Minute idx (Eröffnung) in regTag0 bzw. ganz am Anfang von regTag1 (idx = regTag0.length) */
      const ausgang = (start: Bar[], rest: Bar[], sp: Spielart): Ausgang | null => {
        const pl = platzFuer(r, sp, pa, true);
        if (!pl || !start.length) return null;
        const cs: Kerze[] = [{ datum: d, o: start[0].o, h: start[0].o, l: start[0].o, c: start[0].o }, ...start.map((b) => ({ datum: d, o: b.o, h: b.h, l: b.l, c: b.c })), ...rest.map((b) => ({ datum: d1, o: b.o, h: b.h, l: b.l, c: b.c })), ...tageskerzen];
        return etikett(cs, 0, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), [cs.length - 1])[0];
      };
      const einstiegAb = (idx: number, name: string, richtung: 'long' | 'short') => {
        if (idx < 0) return;
        const start = regTag0.slice(idx);
        const rest = regTag1;
        const s0 = start.length ? start : rest;
        const r2 = start.length ? rest : [];
        for (const sp of STD) {
          if (sp.richtung !== richtung) continue;
          const a = ausgang(s0, r2, sp);
          if (a) zaehle(name, sp, d, a);
        }
      };
      // kumulierte Stückzahl und VWAP je Minute der regulären Sitzung
      let cumV = 0, cumPV = 0, hod = 0;
      const cum = regTag0.map((b) => {
        cumV += b.v;
        cumPV += b.v * (b.h + b.l + b.c) / 3;
        hod = Math.max(hod, b.h);
        return { v: cumV, vwap: cumV ? cumPV / cumV : b.c, hod };
      });
      // Long: Kurs ≥ +X % mit Umsatz ≥ V × Ø-Tagesumsatz (ab 5 Minuten nach Eröffnung), Einstieg zur nächsten Minute
      for (const X of [15, 25, 40])
        for (const V of [0.5, 2]) {
          const t = regTag0.findIndex((b, j) => j >= 5 && b.c >= pc * (1 + X / 100) && cum[j].v >= V * avgVol);
          einstiegAb(t >= 0 ? t + 1 : -1, regel(`L${X}V${V}`, 'long', `long, sobald Kurs ≥ +${X} % und Tagesumsatz ≥ ${V} × Ø-Tag`), 'long');
          if (V === 0.5) {
            const tf = t >= 0 && t <= 60 ? t : -1;
            einstiegAb(tf >= 0 ? tf + 1 : -1, regel(`L${X}V${V}frueh`, 'long', `wie L${X}V${V}, nur in der ersten Stunde`), 'long');
          }
        }
      // Vormarkt: letzter Kurs vor der Eröffnung ≥ +X % mit Vormarkt-Umsatz ≥ 0,2 × Ø-Tag → Einstieg zur Eröffnung
      for (const X of [15, 30]) {
        const vv = vorTag0.reduce((s, b) => s + b.v, 0);
        const letzter = vorTag0[vorTag0.length - 1];
        if (letzter && letzter.c >= pc * (1 + X / 100) && vv >= 0.2 * avgVol) einstiegAb(0, regel(`P${X}`, 'long', `long zur Eröffnung, wenn der Vormarkt ≥ +${X} % steht`), 'long');
        else regel(`P${X}`, 'long', `long zur Eröffnung, wenn der Vormarkt ≥ +${X} % steht`);
        if (letzter && letzter.c >= pc * (1 + X / 100) && vv >= 0.2 * avgVol) einstiegAb(0, regel(`P${X}S`, 'short', `short zur Eröffnung, wenn der Vormarkt ≥ +${X} % steht`), 'short');
        else regel(`P${X}S`, 'short', `short zur Eröffnung, wenn der Vormarkt ≥ +${X} % steht`);
      }
      // Abverkauf: nach Hoch ≥ +X % fällt der Kurs Y % unter das Tageshoch und unter den VWAP → short
      for (const X of [25, 50])
        for (const Y of [10, 20]) {
          const t = regTag0.findIndex((b, j) => cum[j].hod >= pc * (1 + X / 100) && b.c <= cum[j].hod * (1 - Y / 100) && b.c < cum[j].vwap);
          einstiegAb(t >= 0 ? t + 1 : -1, regel(`S${X}R${Y}`, 'short', `short, wenn nach Hoch ≥ +${X} % der Kurs ${Y} % unter das Hoch und unter den VWAP fällt`), 'short');
        }
      // kurz vor Schluss (15:45 New York): Kurs ≥ +X % → long bzw. short zur nächsten Minute
      const t1545 = regTag0.findIndex((b) => b.m >= auf(d) + 375);
      for (const X of [15, 30]) {
        const ok = t1545 >= 0 && regTag0[t1545].c >= pc * (1 + X / 100);
        einstiegAb(ok ? t1545 + 1 : -1, regel(`C${X}L`, 'long', `long um 15:45 New York, wenn ≥ +${X} %`), 'long');
        einstiegAb(ok ? t1545 + 1 : -1, regel(`C${X}S`, 'short', `short um 15:45 New York, wenn ≥ +${X} %`), 'short');
      }
      // bisheriger Weg: Schluss ≥ +X % → Einstieg zur nächsten Eröffnung (Tageskerzen)
      for (const X of [15, 30]) {
        const ok = k[i].c / k[i - 1].c >= 1 + X / 100;
        for (const richtung of ['long', 'short'] as const) {
          const name = regel(`B${X}${richtung === 'long' ? 'L' : 'S'}`, richtung, `bisher: Schluss ≥ +${X} % → ${richtung} zur nächsten Eröffnung`);
          if (!ok) continue;
          for (const sp of STD) {
            if (sp.richtung !== richtung) continue;
            const pl = platzFuer(r, sp, pa, true);
            if (!pl) continue;
            const a = etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), [10])[0];
            if (a) zaehle(name, sp, d, a);
          }
        }
      }
    }
  }
  const median = (w: number[]) => {
    const s2 = [...w].sort((a, b) => a - b);
    return s2.length ? s2[Math.floor(s2.length / 2)] : 0;
  };
  const zeilen = [...st.entries()].map(([k2, z]) => {
    const [name, sp] = k2.split('|');
    const rg = R.find((x) => x.name === name)!;
    return { regel: name, text: rg.text, spielart: spielartText(spNachSchluessel.get(sp)!), faelle: z.n, tage: z.tage.size, volltreffer: z.vt, quote: Math.round((z.vt / z.n) * 1000) / 10, oe: Math.round((z.sum / z.n) * 10) / 10, median: Math.round(median(z.werte) * 10) / 10, oeA: z.nA ? Math.round((z.sumA / z.nA) * 10) / 10 : null, oeB: z.nB ? Math.round((z.sumB / z.nB) * 10) / 10 : null, nA: z.nA, nB: z.nB };
  });
  zeilen.sort((a, b) => b.oe - a.oe);
  schreibeJson('lernen/zeitlupe.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Zeitlupe (Q1): Einstieg im Tagesverlauf auf Minutenkerzen nachgerechnet – nur Tage mit Tageshoch ≥ +15 % (alle Tage, an denen eine der Regeln auslösen konnte), Einstieg zur Eröffnung der Minute nach dem Auslöser, Ziel +400 €, Stop 150 €, höchstens 10 Handelstage, Kosten je Plattform. B-Regeln = bisheriger Weg auf denselben Tagen. Nur Zählungen.',
    tage: dateien.length,
    ereignisse,
    zeilen,
  });
  log(`Zeitlupe: ${dateien.length} Tage, ${ereignisse} Ereignisse ausgewertet (${ohneReihe} ohne Tagesreihe, ${uneinheitlich} mit unpassendem Split-Faktor).`);
  for (const z of zeilen) log(`Zeitlupe ${z.regel} ${z.spielart}: ${z.faelle} Fälle an ${z.tage} Tagen, Quote ${z.quote} %, Ø ${z.oe} € (Median ${z.median}), A ${z.oeA} (${z.nA}) / B ${z.oeB} (${z.nB}).`);
  process.exit(0);
}
if (ANALYSE) {
  // ---------- Trefferanalyse (Nutzer 20.11.2026: „Prüfe … bei jedem Wert, wie wir das Ganze frühzeitig erkennen können“) ----------
  // Je Stichtag der letzten TAGE Handelstage: Volltreffer mit einer Standard-Spielart (direkt, Turbo 2/3 long/short,
  // Stop 150 €, Fenster 10)? Wann (Tag)? Wäre er mit Einstieg zum Schluss des Stichtags statt zur nächsten Eröffnung
  // auch/eher gekommen? Was war vorher sichtbar (Extremtag, SEC-Meldung, Datenkrake-Signal, Marktwelle)? Nur Zählungen.
  const TAGE = Number(process.env.ANALYSE_TAGE ?? 250);
  const fA = F.indexOf(10);
  const STD = SP.filter((sp) => sp.stopEuro === vt.etikett.standardStop && sp.nachziehAb === undefined && sp.vol === undefined && [1, 2, 3].includes(sp.hebel));
  const ab30 = new Date(Date.parse(heute) - 30 * 86400000).toISOString().slice(0, 10);
  const vorTagen = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
  type Z = { n: number; vt: number; vtS: number; vtSchluss: number; sum: number; sumSchluss: number };
  const neuZ = (): Z => ({ n: 0, vt: 0, vtS: 0, vtSchluss: 0, sum: 0, sumSchluss: 0 });
  const zaehler = new Map<string, Z>();
  const zz = (k: string) => zaehler.get(k) ?? zaehler.set(k, neuZ()).get(k)!;
  const tagJe = new Map<string, { l: number; s: number }>();
  const faelle: { d: string; richtung: 'long' | 'short'; flags: string[] }[] = [];
  const tagVerteilung = new Map<number, number>();
  let tag1Luecke = 0;
  for (const r of reihen) {
    const k = r.kerzen;
    const von = Math.max(1, k.length - TAGE - 1);
    for (let i = von; i < k.length - 1; i++) {
      const x = merkmale(k, i);
      if (!x || !handelbar(r, x, k[i])) continue;
      const d = k[i].datum;
      const fertig = i + 10 < k.length;
      // beste Standard-Spielart: Einstieg zur nächsten Eröffnung (wie live) und zum Schluss des Stichtags
      let vt: { sp: Spielart; tag: number; netto: number } | null = null;
      let bestNetto = -Infinity;
      for (const sp of STD) {
        const pl = platzFuer(r, sp, plattformAm(r, x), true);
        if (!pl) continue;
        const a = etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F)[fA];
        if (!a) continue;
        if (a.netto > bestNetto) bestNetto = a.netto;
        if (a.art === 'treffer' && (!vt || a.tag < vt.tag)) vt = { sp, tag: a.tag, netto: a.netto };
      }
      // Schluss-Einstieg: Eröffnung des Folgetags durch den Schluss des Stichtags ersetzen (Lücke wird mitgenommen)
      const k1 = k[i + 1];
      const alt = { o: k1.o, h: k1.h, l: k1.l };
      k1.o = k[i].c;
      k1.h = Math.max(alt.h, k[i].c);
      k1.l = Math.min(alt.l, k[i].c);
      let vtSchluss = false;
      let bestSchluss = -Infinity;
      for (const sp of STD) {
        const pl = platzFuer(r, sp, plattformAm(r, x), true);
        if (!pl) continue;
        const a = etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20, pl, sp), F)[fA];
        if (!a) continue;
        if (a.netto > bestSchluss) bestSchluss = a.netto;
        if (a.art === 'treffer') vtSchluss = true;
      }
      k1.o = alt.o;
      k1.h = alt.h;
      k1.l = alt.l;
      if (!fertig && !vt && !vtSchluss) continue;
      // Vorzeichen
      const flags: string[] = [];
      if (Math.abs(x.r1) >= 25 || (x.relVolumen ?? 0) >= 10) flags.push('extremtag');
      let sec = false;
      for (const a of MELDUNG_ARTEN) {
        const m = meldungAm(r, d, a);
        if (m !== null && m <= 5) sec = true;
      }
      const za = zahlenAm(r, d);
      if (sec || (za !== null && za <= 5)) flags.push('sec5');
      const sig = (signaleJe.get(r.schluessel.split('#')[0]) ?? []).some((s) => s.datum >= vorTagen(d, 14) && s.datum <= d);
      if (sig) flags.push('datenkrake14');
      if ((x.max20 ?? 0) >= 50) flags.push('wiederholungslaeufer');
      const zeitraum = d >= ab30 ? '30' : 'alt';
      const lage = x.r1 >= 25 ? (x.lageSchluss >= 0.67 ? 'up-schlussOben' : x.lageSchluss <= 0.33 ? 'up-schlussUnten' : 'up-schlussMitte') : x.r1 <= -25 ? 'down' : '';
      const schluessel = [`alle|${zeitraum}`, ...flags.map((f) => `${f}|${zeitraum}`), ...(flags.length ? [] : [`ohne|${zeitraum}`]), ...(lage ? [`${lage}|${zeitraum}`] : [])];
      for (const s of schluessel) {
        const z = zz(s);
        z.n++;
        if (vt) {
          z.vt++;
          if (vt.sp.richtung === 'short') z.vtS++;
        }
        if (vtSchluss) z.vtSchluss++;
        if (bestNetto > -Infinity) z.sum += bestNetto;
        if (bestSchluss > -Infinity) z.sumSchluss += bestSchluss;
      }
      if (vt) {
        tagVerteilung.set(vt.tag, (tagVerteilung.get(vt.tag) ?? 0) + 1);
        const t = tagJe.get(d) ?? tagJe.set(d, { l: 0, s: 0 }).get(d)!;
        if (vt.sp.richtung === 'long') t.l++;
        else t.s++;
        faelle.push({ d, richtung: vt.sp.richtung, flags });
        // Anteil der Bewegung schon in der Lücke zum Folgetag (in Richtung des Treffers)
        const luecke = ((vt.sp.richtung === 'long' ? 1 : -1) * (k1.o / k[i].c - 1)) * 100;
        if (luecke >= 10) tag1Luecke++;
      }
    }
  }
  // Marktwelle: Tage, an denen in einer Richtung besonders viele Volltreffer beginnen (oberstes Zehntel)
  const proTag = [...tagJe.values()].flatMap((t) => [t.l, t.s]).sort((a, b) => a - b);
  const schwelle = proTag[Math.floor(proTag.length * 0.9)] ?? Infinity;
  let inWelle = 0;
  for (const f of faelle) {
    const t = tagJe.get(f.d)!;
    if ((f.richtung === 'long' ? t.l : t.s) >= schwelle) inWelle++;
  }
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const zeile = (s: string) => {
    const z = zaehler.get(s) ?? neuZ();
    return { stichtage: z.n, volltreffer: z.vt, quote: pct(z.vt, z.n), shortAnteil: pct(z.vtS, z.vt), schlussEinstiegQuote: pct(z.vtSchluss, z.n), oeBesteSpielart: z.n ? Math.round((z.sum / z.n) * 10) / 10 : 0, oeBesteSchluss: z.n ? Math.round((z.sumSchluss / z.n) * 10) / 10 : 0 };
  };
  const arten = ['alle', 'extremtag', 'sec5', 'datenkrake14', 'wiederholungslaeufer', 'ohne', 'up-schlussOben', 'up-schlussMitte', 'up-schlussUnten', 'down'];
  const ergebnis = {
    stand: jetzt.toISOString(),
    hinweis: `Trefferanalyse: Stichtage der letzten ${TAGE} Handelstage, Volltreffer = eine Standard-Spielart (direkt, Turbo Hebel 2/3 long/short, Stop 150 €) erreicht +400 € in höchstens 10 Handelstagen; „Schluss-Einstieg“ = Einstieg zum Schluss des Stichtags statt zur nächsten Eröffnung. Nur Zählungen.`,
    gruppen: Object.fromEntries(arten.flatMap((a) => [[`${a} (30 Tage)`, zeile(`${a}|30`)], [`${a} (davor)`, zeile(`${a}|alt`)]])),
    tagDesTreffers: Object.fromEntries([...tagVerteilung].sort((a, b) => a[0] - b[0])),
    trefferMitLueckeAb10: pct(tag1Luecke, faelle.length),
    marktwelle: { schwelleJeTagUndRichtung: schwelle, anteilTrefferInWelle: pct(inWelle, faelle.length) },
    vorzeichenAnteil: Object.fromEntries(['extremtag', 'sec5', 'datenkrake14', 'wiederholungslaeufer'].map((f) => [f, pct(faelle.filter((x) => x.flags.includes(f)).length, faelle.length)])),
    ohneVorzeichen: pct(faelle.filter((x) => !x.flags.length).length, faelle.length),
  };
  schreibeJson('lernen/trefferanalyse.json', ergebnis);
  for (const [k2, v] of Object.entries(ergebnis.gruppen)) log(`Trefferanalyse ${k2}: ${JSON.stringify(v)}`);
  log(`Trefferanalyse: Tag des Treffers ${JSON.stringify(ergebnis.tagDesTreffers)}, Lücke ≥ 10 % in Trefferrichtung ${ergebnis.trefferMitLueckeAb10} %, Marktwelle ${JSON.stringify(ergebnis.marktwelle)}, Vorzeichen ${JSON.stringify(ergebnis.vorzeichenAnteil)}, ohne ${ergebnis.ohneVorzeichen} %.`);
  process.exit(0);
}
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
        const sp = konk(SP[c.s], x);
        if (!sp) continue;
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
    const uni = universumIdx.get(m.idx)!;
    const imUni = (z: number) => !uni.length || uni.some((b) => b.a >= 0 && b.klassen.has(mX[z * P + b.a]));
    for (let z = 0; z < mZahl; z++) if (mAnw[m.idx][z] && Number.isFinite(mY[m.idx][z]) && reihen[mReihe[z]].markt === m.markt && imUni(z)) gelabelt.push(z);
    const A = gelabelt.filter((z) => mTag[z] < grenzeTag - ab);
    const B = gelabelt.filter((z) => mTag[z] >= grenzeTag);
    if (A.length < 5000 || B.length < 5000) {
      log(`Gesamtmodell ${m.markt} ${m.spielart} ${m.fenster} T: zu wenige Fälle (A ${A.length}, B ${B.length}) – übersprungen.`);
      continue;
    }
    const e = MC!.einstellungen;
    // Ziel gegen den Tagesdurchschnitt, ohne marktweite Merkmale: das Modell soll lernen, welcher Wert an einem Tag
    // besser ist als die anderen – nicht, welcher Tag gut war (sonst lernt es wenige Crash-Tage auswendig, Probe 16.11.)
    // Ziel „treffer“ (Quantensprung 1, 18.11.2026): das Modell lernt direkt die Volltreffer-Wahrscheinlichkeit (Treffer = Ziel €,
    // sonst 0) statt des Ergebnisses in € – sortiert nach „+400 € vor dem Stop“, nicht nach dem Ø
    const yZiel = m.ziel === 'treffer' ? Float32Array.from(mTreffer[m.idx].subarray(0, mY[m.idx].length), (t) => t * vt.etikett.ziel) : mY[m.idx];
    const yRel = gegenTag(yZiel, gelabelt, (z) => mTag[z]);
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
          schluessel: `modell|${m.markt}|${m.spielart}|${m.fenster}${modellZusatz(m)}|muster`,
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
    for (const q of m.oberste ?? MC!.obersteProzent) {
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
        schluessel: `modell|${m.markt}|${m.spielart}|${m.fenster}${modellZusatz(m)}`,
        gruppe: `${m.markt === 'aktie' ? 'Aktien' : 'Krypto'}: Gesamtmodell aus allen Merkmalen${m.ziel === 'treffer' ? ' (Ziel: Volltreffer-Wahrscheinlichkeit)' : ''}${m.universum ? ` nur ${m.universum.text}` : ''} – oberste ${String(q).replace('.', ',')} %`,
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
      log(`Gesamtmodell${m.ziel === 'treffer' ? ' (Ziel Treffer)' : ''}${m.universum ? ` [${m.universum.name}]` : ''} ${m.markt} ${erg.spielart} ${m.fenster} T, oberste ${q} %: A ${zr[0].n} Fälle/${zr[0].tage} Tage, Quote ${zr[0].quote} %, Ø ${zr[0].ev} ± ${zr[0].se} € (Grundrate ${zr[0].grundEv}) · B ${zr[1].n}/${zr[1].tage}, Quote ${zr[1].quote} %, Ø ${zr[1].ev} ± ${zr[1].se} € (Grundrate ${zr[1].grundEv}) · Quartale ${qPlus}/${qMit} im Plus · Wertung ${wertung} → ${erg.grund}`);
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
    for (let z = 0; z < mZahl; z++) if (mAnw[m.idx][z] && reihen[mReihe[z]].markt === m.markt && mTag[z] === juengster && imUni(z)) heuteZeilen.push(z);
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
    log(`Gesamtmodell${m.ziel === 'treffer' ? ' (Ziel Treffer)' : ''}${m.universum ? ` [${m.universum.name}]` : ''} ${m.markt} ${bestes.spielart} ${m.fenster} T: gewählt oberste ${bestes.q} % (${bestes.bestanden ? 'BESTANDEN' : 'nicht bestanden'}), wichtigste Merkmale: ${bestes.wichtig.join(', ')}; ${Math.round((Date.now() - t0m) / 1000)} s.`);
  }
  // Vorwärtstest: Modelle im Muster-Buch bekommen ihre Fälle ab dem Tag nach dem Eintrag (je Wert ein Fall in sperreTage)
  for (const [schluessel, a] of modellAuswahl) {
    const e = imTest.get(schluessel);
    if (!e) continue;
    const vonTag = tagNrAlle.get(alleTage.find((d) => d > e.seit) ?? '9999') ?? Infinity;
    const zeilen: number[] = [];
    const uniL = universumIdx.get(a.m.idx)!;
    for (let z = 0; z < mZahl; z++) if (mAnw[a.m.idx][z] && mTag[z] >= vonTag && reihen[mReihe[z]].markt === a.m.markt && (!uniL.length || uniL.some((b) => b.a >= 0 && b.klassen.has(mX[z * P + b.a])))) zeilen.push(z);
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
      const sp0 = spNachSchluessel.get(e.sp);
      const spM = sp0 ? konk(sp0, x) : null;
      const pl = spM ? platzFuer(r, spM, plattformAm(r, x), true) : null;
      if (!spM || !pl) continue;
      const fall = jagdFall(r, mI[z], e, kostenFuer(r.markt, x.umsatz20, pl, spM), pl, spM);
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
let hebelWerte: { wert: string; markt: string; spielart: string }[] = [];
const fallstudieZeilen: { wert: string; datum: string; anlass: string; sprung: boolean; tag: number | null; muster: string[]; ereignisse: string[] }[] = [];
if (vt.erkennung) {
  const ek = vt.erkennung;
  const fi = F.indexOf(ek.fenster);
  // Standard-Stop und ein Paar-Fenster: nur dafür rechnet der Rückblick Einzel- und Paar-Gruppen
  const sMax = vt.etikett.standardStop;
  const s1 = SP.findIndex((sp) => sp.hebel === 1 && sp.vol === undefined && sp.stopEuro === sMax && sp.nachziehAb === undefined);
  // Erkennungs-Muster: Gruppen, deren hebelfreie Volltreffer-Quote (direkt, dieser Stop, dieses Fenster) in BEIDEN Zeiträumen
  // mindestens liftMin × die Grundrate ist, mit genug Fällen. (Probe 17.11.: „irgendein bestandenes Muster“ feuert an 91 %
  // aller Tage – kein Maßstab.)
  const spS = spielartSchluessel(SP[s1]);
  const grundJe = new Map(ergebnisse.filter((e) => e.art === 'alle' && e.spielartSchluessel === spS && e.fenster === ek.fenster).map((e) => [e.schluessel.split('|')[0], e.gesamt.quote]));
  const stark = ergebnisse.filter((e) => {
    if ((e.art !== 'einzel' && e.art !== 'paar') || e.spielartSchluessel !== spS || e.fenster !== ek.fenster) return false;
    const g = grundJe.get(e.schluessel.split('|')[0]) ?? 0;
    return g > 0 && e.zeitraeume.every((z) => z.n >= vt.pruefung.mindestFaelle && z.quote >= ek.liftMin * g);
  });
  log(`F1: ${stark.length} Erkennungs-Muster (hebelfreie Quote in beiden Zeiträumen ≥ ${ek.liftMin} × Grundrate).`);
  const bedingungen = new Map<string, { name: string; bed: [number, number][] }[]>();
  for (const e of stark) {
    if (e.schluessel.includes('hyp=') || e.schluessel.endsWith('|alle')) continue;
    const [markt, rest] = e.schluessel.split('|');
    const bed = rest.split('&').map((t) => t.split('=').map(Number) as [number, number]);
    if (bed.some(([a, c]) => !Number.isFinite(a) || !Number.isFinite(c))) continue;
    (bedingungen.get(markt) ?? bedingungen.set(markt, []).get(markt)!).push({ name: gruppenText(e.schluessel), bed });
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
      const zFuer = (teil: string) => jeMarkt.get(teil) ?? jeMarkt.set(teil, { spruenge: 0, erkannt: 0, tage: 0, feuern: 0, klasse: new Map() }).get(teil)!;
      let letzterSprung = -1e9;
      for (let i = 1; i < k.length - 1; i++) {
        const x = merkmale(k, i);
        if (!x || !handelbar(r, x, k[i])) continue;
        // F5: Pennystocks (unter 1 $ oder OTC) getrennt ausweisen; die Muster bleiben die des Marktes „aktie“
        const z = zFuer(r.markt === 'aktie' && (r.otc || x.kurs < 1) ? 'penny' : r.markt);
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
  const maerkte = [...jeMarkt.entries()].map(([teil, z]) => {
    const markt = teil === 'penny' ? 'aktie' : teil;
    const anteilErkannt = z.spruenge ? Math.round((z.erkannt / z.spruenge) * 1000) / 10 : null;
    const anteilFeuern = z.tage ? Math.round((z.feuern / z.tage) * 1000) / 10 : null;
    const grund = z.tage ? z.spruenge / z.tage : 0;
    const klassen = [...z.klasse.entries()]
      .filter(([, [n, s]]) => n >= 200 && s >= 5)
      .map(([key, [n, s]]) => ({ merkmal: gruppenText(`${markt}|${key}`), faelle: n, spruenge: s, quote: Math.round((s / n) * 1000) / 10, lift: grund ? Math.round((s / n / grund) * 10) / 10 : null }))
      .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0))
      .slice(0, 25);
    return { markt: teil, stichtage: z.tage, spruenge: z.spruenge, grundrate: Math.round(grund * 10000) / 100, erkannt: z.erkannt, anteilErkannt, anteilFeuern, lift: anteilErkannt !== null && anteilFeuern ? Math.round((anteilErkannt / anteilFeuern) * 10) / 10 : null, klassen };
  });
  schreibeJson('lernen/muster/erkennung.json', {
    stand: jetzt.toISOString(),
    hinweis: `F1 Erkennungsquote: hebelfreie Volltreffer (direkt, Stop ${sMax} €, ≥ +${vt.etikett.ziel} € nach Kosten binnen ${ek.fenster} Handelstagen, je Wert einer in ${vt.pruefung.sperreTage} Tagen). „erkannt“ = am Stichtag feuerte mindestens ein Erkennungs-Muster (hebelfreie Volltreffer-Quote in beiden Zeiträumen ≥ ${ek.liftMin} × Grundrate; auf derselben Geschichte gefunden – die Quote ist eine Obergrenze). Klassen: Anteil der Sprünge unter allen Stichtagen mit dieser Klasse gegen die Grundrate (Lift).`,
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
    log(`F1 Fallstudie ${w}: ${z.length} Stichtage, ${sp.length} mit hebelfreiem Volltreffer, davon ${sp.filter((f) => f.muster.length).length} mit Erkennungs-Muster am Stichtag; Muster an ${z.filter((f) => f.muster.length).length} von ${z.length} Tagen.`);
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
    // eine andere Spielart einer Gruppe, die schon im Test ist (z. B. Hebel nach Schwankung statt festem Hebel), ist
    // keine neue Idee – sie zählt nicht gegen die Vielfalt der Bausteine (19.11.2026)
    const variante = [...imTest.values(), ...neu.map((x) => ({ gruppenSchluessel: x.schluessel }))].some((x) => x.gruppenSchluessel === e.schluessel);
    const bs = bausteine(e.schluessel);
    if (!variante && bs.some((b) => (belegt.get(b) ?? 0) >= maxJe)) continue;
    if (!variante) for (const b of bs) belegt.set(b, (belegt.get(b) ?? 0) + 1);
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
  const urteile = new Map<string, { urteil: 'ja' | 'nein'; grund: string; claudeP?: number; kontext?: string }>();
  if (existsSync(urteilOrdner))
    for (const f of readdirSync(urteilOrdner).filter((x) => x.endsWith('.json')))
      for (const u of (JSON.parse(readFileSync(join(urteilOrdner, f), 'utf8')) as { urteile?: { wert: string; stichtag: string; urteil: 'ja' | 'nein'; grund: string; wahrscheinlichkeit?: number; kontext?: string }[] }).urteile ?? [])
        urteile.set(`${u.wert.toUpperCase()}|${u.stichtag}`, { urteil: u.urteil, grund: u.grund, ...(typeof u.wahrscheinlichkeit === 'number' ? { claudeP: u.wahrscheinlichkeit } : {}), ...(u.kontext ? { kontext: u.kontext } : {}) });
  for (const f of vorwaerts) {
    const u = urteile.get(`${f.wert.toUpperCase()}|${f.stichtag}`);
    if (u) Object.assign(f, u);
  }
  const ohnePump = vorwaerts.filter((f) => !f.pump && !zrNur.has(f.muster));
  // Klumpen (18.11.2026): je Wert die Anker-Reihe mit der höchsten Korrelation der Tagesrenditen der letzten 120 Tage
  // (ab 0,7), sonst der Wert selbst – höchstens maxJeKlumpen offene Jagden je Anker und Richtung
  const klumpeCache = new Map<string, string | null>();
  const reiheNach = new Map<string, Reihe>();
  for (const r of reihen) if (!r.schluessel.includes('#')) reiheNach.set(r.schluessel, r);
  const anker = (vt.v4.klumpenAnker ?? []).map((s) => reiheNach.get(s)).filter((r): r is Reihe => !!r);
  const renditen = (r: Reihe) => {
    const k = r.kerzen.slice(-121);
    const m = new Map<string, number>();
    for (let i = 1; i < k.length; i++) if (k[i - 1].c > 0) m.set(k[i].datum, k[i].c / k[i - 1].c - 1);
    return m;
  };
  const ankerR = anker.map((r) => ({ name: r.schluessel, m: renditen(r) }));
  const korrelation = (a: Map<string, number>, b: Map<string, number>) => {
    const xs: number[] = [];
    const ys: number[] = [];
    for (const [d, x] of a) {
      const y = b.get(d);
      if (y !== undefined) (xs.push(x), ys.push(y));
    }
    if (xs.length < 40) return 0;
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) (sxy += (xs[i] - mx) * (ys[i] - my), sxx += (xs[i] - mx) ** 2, syy += (ys[i] - my) ** 2);
    return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0;
  };
  const klumpe = (f: JagdFall): string | null => {
    const key = `${f.markt}|${f.wert}`;
    if (klumpeCache.has(key)) return klumpeCache.get(key)!;
    const r = reiheNach.get(`${f.markt === 'krypto' ? 'K' : 'T'}:${f.wert}`);
    let best: string | null = key;
    if (r) {
      const m = renditen(r);
      let bk = vt.v4.klumpenMinKorrelation ?? 0.7;
      for (const a of ankerR) {
        if (a.name === r.schluessel) continue;
        const k = korrelation(m, a.m);
        if (k >= bk) (bk = k, (best = a.name));
      }
    }
    klumpeCache.set(key, best);
    return best;
  };
  const klumpenRegel = { klumpe, maxJeKlumpen: vt.v4.maxJeKlumpen ?? 2 };
  const { jagden, uebersprungen } = jagdenWaehlen(ohnePump, { maxOffen: v4.maxOffen, tagesVerlustGrenze: v4.tagesVerlustGrenze, einmalJeWert: true, ...klumpenRegel });
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
    // Klumpen vorwärts (18.11.2026): Fälle je Stichtag zusammenfassen, jeder Tag zählt gleich
    const jeTag = new Map<string, number[]>();
    for (const x of f) (jeTag.get(x.stichtag) ?? jeTag.set(x.stichtag, []).get(x.stichtag)!).push(x.netto ?? 0);
    const evTage = jeTag.size ? Math.round(([...jeTag.values()].reduce((a, l) => a + l.reduce((s, v) => s + v, 0) / l.length, 0) / jeTag.size) * 10) / 10 : 0;
    // Stufe 2: mindestens 20 Fälle im Vorwärtstest und ein Ergebnis im Band des Rückblicks (Ø ≥ Rückblick − 2 Standardfehler und > 0)
    const stufe2 = f.length >= v4.stufe2Faelle && ev > 0 && ev >= e.rueckblick.ev - 2 * Math.max(e.rueckblick.se, 1);
    // Stufe 3 (V6): automatisch befördern bzw. zurückstufen – nur nach vorn, als Eintrag im Muster-Buch
    const p6 = befoerderungPruefen({ faelle: f.length, ev, rueckblick: e.rueckblick, wertung: e.wertung, tage: jeTag.size, evTage }, v6);
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
  // Gesamtbild-Urteil (Quantensprung 2): Claudes „nein“ zählt für die sichtbaren Orders erst, wenn gemessen ist, dass es hilft
  const urteilJa = jagdKennzahlen(vorwaerts.filter((f) => f.urteil === 'ja'));
  const urteilNein = jagdKennzahlen(vorwaerts.filter((f) => f.urteil === 'nein'));
  const ohneNein = v6.ohneNein === 'auto' ? neinFilterAktiv(urteilJa, urteilNein, v6.urteilAuto ?? { mindestJa: 15, mindestNein: 30 }) : (v6.ohneNein ?? false);
  log(`Claudes Urteil: „ja“ ${urteilJa.anzahl} abgeschlossen (Quote ${urteilJa.quote} %, Ø ${urteilJa.ev} €), „nein“ ${urteilNein.anzahl} (Quote ${urteilNein.quote} %, Ø ${urteilNein.ev} €) → Filter für sichtbare Orders ${ohneNein ? 'AKTIV' : 'aus'}${v6.ohneNein === 'auto' ? ' (automatisch nach Messung)' : ''}.`);
  // Zeitreise-Regel (20.11.2026): Fälle der Zeitreise-Muster im Gültigkeitsfenster ordern zusätzlich sichtbar – mit der
  // Wertung der Zeitreise (Rang wie dort), ohne Pump-Verdacht und ohne ungeprüfte Plattform; danach die Bremse
  const zrWertung = new Map([...zrErst.values()].map((e) => [e.schluessel, e.wertung ?? 0]));
  const s3Waehlen = () => {
    const zz = zrZeiten(zrBuch.eintraege);
    const inZR = (f: JagdFall) => zz.get(f.muster)?.some((x) => f.stichtag >= x.von && (x.bis === null || f.stichtag < x.bis)) ?? false;
    const kand = vorwaerts
      .filter((f) => !f.pump && !gegenwindShort(f))
      .flatMap((f) => (inStufe3(zeiten3, f) ? [f] : inZR(f) && !(ZRV?.ohneUngeprueft && f.ungeprueft) ? [{ ...f, wertung: zrWertung.get(f.muster) ?? f.wertung, zeitreise: true }] : []));
    const zeiten = new Map(zeiten3);
    for (const [k, l] of zz) zeiten.set(k, [...(zeiten.get(k) ?? []), ...l]);
    return stufe3Waehlen(kand, zeiten, v6, ohneNein, klumpenRegel);
  };
  let s3 = s3Waehlen();
  const zrOrders = () => [...s3.offen, ...s3.abgeschlossen].filter((j) => j.zeitreise && ZRV && j.stichtag >= ZRV.ab);
  let zrStand = ZRV ? zrBremse(zrOrders(), ZRV.bremse) : null;
  if (ZRV && zrStand?.aus && ZRV.aktiv && !zrGebremst) {
    zrBuch.eintraege.push({ schluessel: '*', status: 'bremse', am: heute, grund: zrStand.grund });
    zrBuch.eintraege.push(...zrBuchFortschreiben(zrBuch.eintraege, null, zrAb, false, 'Bremse'));
    s3 = s3Waehlen();
    zrStand = zrBremse(zrOrders(), ZRV.bremse);
    log(`Zeitreise-Regel GEBREMST: ${zrStand.grund} – zurück zur strengen 6er-Regel, laufende Orders laufen zu Ende.`);
  }
  if (ZRV) schreibeJson('lernen/muster/zeitreise-buch.json', { stand: jetzt.toISOString(), hinweis: 'Zeitreise-Regel (seit 20.11.2026): ab welchem Stichtag ein Muster der Zeitreise-Auswahl sichtbar ordern darf (gewaehlt) und ab wann nicht mehr (abgewaehlt); bremse = Regel gestoppt. Nur anhängen.', eintraege: zrBuch.eintraege });
  const zrBremsEintrag = ZRV ? [...zrBuch.eintraege].reverse().find((e) => e.status === 'bremse' && e.am >= ZRV.ab) ?? null : null;
  const befoerdertJetzt = [...alleMuster.values(), ...musterBuch.eintraege]
    .filter((e, i, a) => a.findIndex((x) => x.schluessel === e.schluessel) === i && istBefoerdert(zeiten3, e.schluessel))
    .map((e) => ({ gruppe: e.gruppe, spielart: spielartText(spNachSchluessel.get(e.sp)!), fenster: e.fenster, seit: zeiten3.get(e.schluessel)!.find((z) => z.bis === null)!.von, rueckblick: e.rueckblick }));
  const lauerliste = ohnePump.filter((x) => x.art === 'lauert').sort((a, b) => b.wertung - a.wertung);
  const pumpZahl = vorwaerts.filter((x) => x.pump && !zrNur.has(x.muster)).length;
  const musterText = new Map([...alleMuster.values()].map((e) => [e.schluessel, e.gruppe]));
  for (const e of zrErst.values()) if (!musterText.has(e.schluessel) && e.gruppe) musterText.set(e.schluessel, e.gruppe);
  const ohneMuster = (j: JagdFall) => ({ ...j, muster: musterText.get(j.muster) ?? j.muster });
  // B Stufe 2a (18.11.2026): privat alle Werte der Lauerliste und offenen Jagden mit Hebelprodukt in Deutschland – der
  // Archivlauf schreibt deren gettex-Kurse mit (die öffentliche Lauerliste zeigt nur die obersten 40, meist ohne Produkt)
  hebelWerte = [...jagden.filter((j) => j.art === 'offen'), ...lauerliste]
    .filter((j) => /gettex|Börse|Stuttgart/i.test(j.plattform ?? ''))
    .map((j) => ({ wert: j.wert, markt: j.markt, spielart: j.spielart }));
  schreibeJson('volltreffer/uebersicht.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Bereich Volltreffer, rein virtuell (Plan Volltreffer V4): Muster, die im Rückblick mit Vorteil bestanden haben und eine Volltreffer-Quote von mindestens ' + v4.mindestQuote + ' % zeigen, laufen ab dem Folgetag im Vorwärtstest. Jagd = 1.000-€-Order zur Eröffnung des Handelstags nach dem Stichtag, Ausstieg nach den Regeln des Etiketts (Ziel +400 €, Stop, Fenster). Höchstens ' + v4.maxOffen + ' Jagden gleichzeitig, nach ' + v4.tagesVerlustGrenze + ' € Tagesverlust am Folgetag keine neue. Mitteilungen nur gesammelt in der Abendbilanz, kein echtes Geld.',
    regeln: { maxOffen: v4.maxOffen, tagesVerlustGrenze: v4.tagesVerlustGrenze, stufe2Faelle: v4.stufe2Faelle },
    kennzahlen: jagdKennzahlen(jagden),
    // Q4 Gegenwind am jüngsten Aktien-Stichtag (Autopilot und App lesen das)
    gegenwind: (() => {
      const d = [...gegenwindJeTag.keys()].pop();
      const g = d ? gegenwindJeTag.get(d)! : null;
      const zahl = (x: number | null) => (x === null || !Number.isFinite(x) ? '–' : x.toLocaleString('de-DE', { maximumFractionDigits: 1 }));
      return d && g ? { datum: d, aktiv: !!GWC?.aktiv && g.aktiv, grund: g.aktiv ? `Markt 5 Tage ${zahl(g.markt5)} % (Schwelle ${zahl(g.sM5)} %), VIX ${zahl(g.vix)} (Schwelle ${zahl(g.sVix)})` : 'kein Gegenwind', markt5: g.markt5 === null ? null : Math.round(g.markt5 * 10) / 10, schwelleMarkt5: Number.isFinite(g.sM5) ? Math.round(g.sM5 * 10) / 10 : null, vix: g.vix, schwelleVix: Number.isFinite(g.sVix) ? Math.round(g.sVix * 10) / 10 : null } : null;
    })(),
    // V5: Wie gut ist Claudes Urteil? Alle Fälle im Vorwärtstest mit „ja“ gegen „nein“ (nicht nur die gewählten Jagden)
    urteil: { ja: urteilJa, nein: urteilNein, urteile: urteile.size, kalibrierung: urteilKalibrierung(vorwaerts), neinFilter: ohneNein },
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
      // Zeitreise-Regel (20.11.2026): Stand, Bremse und Kennzahlen nur ihrer Orders
      ...(ZRV
        ? {
            zeitreise: {
              an: ZRV.aktiv && !zrBremsEintrag,
              ...(ZRV.aktiv ? {} : { ausGrund: ZRV.ausGrund ?? 'ausgeschaltet' }),
              ab: ZRV.ab,
              halbmonatVon: zrDatei?.aktuell?.halbmonatVon ?? null,
              muster: zrAktiv(zrBuch.eintraege).size,
              bremse: zrBremsEintrag ? { am: zrBremsEintrag.am, grund: zrBremsEintrag.grund ?? '' } : null,
              regel: ZRV.bremse,
              stand: zrStand,
              kennzahlen: jagdKennzahlen(zrOrders()),
            },
          }
        : {}),
    },
  });
  if (neu.length) log(`V4 neu im Vorwärtstest: ${neu.map((e) => `${e.gruppe} – ${e.spielart}`).join(" | ")}`);
  if (ZRV) log(`Zeitreise-Regel: ${zrStand?.grund ?? '–'}; sichtbar offen ${s3.offen.filter((j) => j.zeitreise).length}, vorgemerkt ${s3.vorgemerkt.filter((j) => j.zeitreise).length}.`);
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

// Kontext-Geschichte öffentlich (Quantensprung 3, 18.11.2026): Weltlage heute in Klassen, Schlagzeilen des Weltgeschehens
// (Wikipedia, CC BY-SA 4.0), Chronik der stärksten Markttage mit ihren Themen und „Was folgte auf ähnliche Lagen?“ –
// nur Klassen und Anteile, keine Kurswerte. Für Claudes Gesamtbild-Urteil und die App.
if (THEMEN.length || weltJe.size) {
  const bewegung = (x: number | null | undefined) => (x === null || x === undefined ? null : x <= -4 ? 'stark fallend' : x <= -1.5 ? 'fallend' : x < 1.5 ? 'seitwärts' : x < 4 ? 'steigend' : 'stark steigend');
  const aktienTage = [...r1JeTag.aktie.keys()].sort();
  const naechste5 = (d: string) => {
    const i = aktienTage.indexOf(d);
    return i >= 0 && i + 5 < aktienTage.length ? markt5JeTag.aktie.get(aktienTage[i + 5]) ?? null : null;
  };
  const themenAm = (d: string, ab = 1.4) =>
    THEMEN.map((t) => ({ id: t.id, name: t.name, spitze: ausFolge(themaFolge.get(t.id), d) }))
      .filter((x): x is { id: string; name: string; spitze: number } => x.spitze !== null && x.spitze >= ab)
      .sort((a, b) => b.spitze - a.spitze);
  const kurzText = (e: Ereignis) => `${e.k}: ${e.t}`.slice(0, 240);
  const schlagzeilen = (d: string, n: number) => {
    const l = weltJe.get(d) ?? [];
    const wichtig = l.filter((e) => /business|economy|politic|conflict|international|disaster|law|science|health/i.test(e.k));
    return (wichtig.length ? wichtig : l).slice(0, n).map(kurzText);
  };
  const letzter = [...KTAGE].reverse().find((d) => THEMEN.some((t) => ausFolge(themaFolge.get(t.id), d) !== null)) ?? null;
  // Chronik: die 60 Markttage mit der stärksten 1-Tages-Bewegung (Median der Werte) – mit Themen und Schlagzeilen
  const chronik = aktienTage
    .map((d) => ({ d, r: marktR1.aktie.get(d) ?? 0 }))
    .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
    .slice(0, 60)
    .sort((a, b) => b.d.localeCompare(a.d))
    .map(({ d, r }) => ({ datum: d, markt: r < 0 ? (r <= -2 ? 'stark gefallen' : 'gefallen') : r >= 2 ? 'stark gestiegen' : 'gestiegen', danach5: bewegung(naechste5(d)), themen: themenAm(d, 1.8).slice(0, 4).map((t) => `${t.name} (${spitzenKlasse(t.spitze)})`), schlagzeilen: schlagzeilen(d, 3) }));
  // Ähnliche Lagen: je Thema, das heute mindestens „erhöht“ ist, frühere Wellen (Spitze ≥ 2, 5 Tage Abstand) und was der
  // Aktienmarkt in den 5 Handelstagen danach tat
  const aehnlich = letzter
    ? themenAm(letzter, 1.4)
        .slice(0, 6)
        .map((t) => {
          const f = themaFolge.get(t.id)!;
          let letzteWelle = -1e9;
          const folgen: string[] = [];
          KTAGE.forEach((d, i) => {
            if (d >= letzter || !(f[i] >= 2) || i - letzteWelle < 5) return;
            letzteWelle = i;
            const b = bewegung(naechste5(aktienTage.find((x) => x >= d) ?? ''));
            if (b) folgen.push(b);
          });
          const zaehl = (k: string) => folgen.filter((x) => x === k).length;
          return { thema: t.name, heute: spitzenKlasse(t.spitze), fruehereWellen: folgen.length, danach5: { 'stark fallend': zaehl('stark fallend'), fallend: zaehl('fallend'), seitwärts: zaehl('seitwärts'), steigend: zaehl('steigend'), 'stark steigend': zaehl('stark steigend') } };
        })
    : [];
  const amtsTage = KTAGE.slice(-5).map((d) => ({ datum: d, erlasse: amtsblattDaten.praesident?.[d] ?? 0, zoelle: amtsblattDaten.zoelle?.[d] ?? 0, sanktionen: amtsblattDaten.sanktionen?.[d] ?? 0, export: amtsblattDaten.export?.[d] ?? 0 }));
  schreibeJson('lernen/kontext.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Weltlage für alle Bereiche (Quantensprung 3): Themen der Weltnachrichten als Spitze gegen die 30 Tage davor (GDELT, Anteil an allen Artikeln), US-Amtsblatt (Federal Register: Erlasse, Zölle, Sanktionen, Exportkontrollen), Weltgeschehen (Wikipedia, Portal:Current events, Text CC BY-SA 4.0), Chronik der stärksten Markttage der letzten zwei Jahre mit ihren Themen, und was der Aktienmarkt nach früheren Wellen desselben Themas in 5 Handelstagen tat. Nur Klassen, keine Kurswerte.',
    quellen: ['GDELT Project (gdeltproject.org)', 'Wikipedia, Portal:Current events (CC BY-SA 4.0)', 'Federal Register (federalregister.gov)', 'Wikimedia Pageviews'],
    datum: letzter,
    themen: letzter ? themenAm(letzter, 0).slice(0, 10).map((t) => ({ name: t.name, spitze: Math.round(t.spitze * 10) / 10, klasse: spitzenKlasse(t.spitze) })) : [],
    politik: letzter ? spitzenKlasse(ausFolge(politikFolge, letzter)) : null,
    amtsblatt: { klasse: letzter ? spitzenKlasse(ausFolge(amtsFolge, letzter)) : null, tage: amtsTage },
    weltgeschehen: [...weltJe.keys()].sort().slice(-2).reverse().map((d) => ({ datum: d, ereignisse: (weltJe.get(d) ?? []).slice(0, 25).map(kurzText) })),
    aehnlich,
    chronik,
  });
  log(`Kontext öffentlich: Weltlage ${letzter ?? '–'} (${themenAm(letzter ?? '', 1.4).length} Themen erhöht), Chronik ${chronik.length} Tage, ähnliche Lagen ${aehnlich.length} Themen.`);
}

// privat: Zensus mit Werten und die vollständige Prüfung
const aus = join(ARCHIV, 'auswertung');
if (hebelWerte.length) { mkdirSync(aus, { recursive: true }); writeFileSync(join(aus, 'hebelwerte.json'), JSON.stringify({ stand: jetzt.toISOString(), werte: hebelWerte })); }
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
for (const merkmal of ['zahlen', 'branche', ...MELDUNG_ARTEN, 'vix', 'vix5', 'fed', 'breite', 'markt5', 'leerquote', 'leerquoteRel', 'insider', 'bestandTage', 'bestandAenderung', 'anleihen5', 'dollar5', 'kredit5', 'oel5', 'sektor5', 'angst', 'stable30', 'otc', 'max20', 'volumen5', 'aktien', 'boersenwertUS', 'leerAnteil', 'aufmerksamkeit', 'branchenThema', 'erwaehnt', 'nachrichtenlage', 'politikDruck', 'amtsblatt5', 'katalysator5', 'katalysator20']) {
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
