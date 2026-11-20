// Kursarchiv (Plan Volltreffer V1): holt je Markt die Sammelkurse eines Tages und legt sie als komprimierte
// Tagesdatei ins PRIVATE Repo schattendepot-archiv (Checkout unter ARCHIV_DIR, Standard _archiv).
// Aufruf: node jobs/archiv.ts   – der Lauf ist wiederholbar: Was schon da ist, wird nie überschrieben.
// Ins öffentliche Repo geht nur der Stand in Zählungen (Ausgabe „stand“ → archiv/stand.json im Datenzweig).
// Schalter (Umgebung): ARCHIV_NUR=krypto,us,gettex,stamm,boersenwert,zahlen,kryptokerzen,ussplits (Standard: krypto,us,gettex,stamm,boersenwert,zahlen – der tägliche Lauf).
//   ZAHLEN_MAX=n: höchstens so viele SEC-Abrufe in diesem Lauf (Standard aus config/archiv.json); SEC_KONTAKT: Kontaktadresse für den User-Agent.
//   US_AB=JJJJ-MM-TT und US_MAX_TAGE=n für den Rückblick (Kursgeschichte rückwärts, fortsetzbar – Workflow historie.yml).
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { berlin, berlinZuUtc, istHandelstag } from '../core/kalender.ts';
import {
  gettexCsv,
  parseGettexArchiv,
  gettexTagStatus,
  gettexZeilen,
  krakenKerzenPaare,
  kryptoCsv,
  kryptoKerzenCsv,
  parseKrakenAlle,
  parseKrakenOhlc,
  parseMassive,
  parseMassiveSplits,
  parseUsArchiv,
  parseUsSplitsArchiv,
  splitsVereinen,
  tageInFolge,
  usCsv,
  usSplitsCsv,
  type KryptoKerze,
  type Tageskerze,
  type UsSplit,
} from '../core/sammelkurse.ts';
import { figiEinordnen, handelbarkeitsKarte, type Wertpapier } from '../core/volltreffer/stamm.ts';
import { boersenwertCsv, krakenZuSymbol, parseBoersenwertCsv, parseGeckoChart, parseGeckoMarkets, symbolZuId, type BoersenwertZeile } from '../core/volltreffer/boersenwert.ts';
import { ciksAusTagesverzeichnis, MELDUNG_ARTEN, MELDUNGEN_STUFE, meldungenAusSeite, meldungenErfasst, meldungenVereinen, NACHFASS_FORMULARE, parseSubmissions, secTickerKarte, zahlenAusSeite, zahlenVereinen, type ZahlenArchiv } from '../core/volltreffer/zahlen.ts';
import { parseAngst, parseStablecoins, parseVixCsv, type KryptoUmfeldArchiv, type UmfeldArchiv } from '../core/volltreffer/umfeld.ts';
import { finraDatei, leerverkaufCsv, parseFinraShvol } from '../core/volltreffer/leerverkauf.ts';
import { leerbestandCsv, parseFinraShortInterest, stichtagKandidaten } from '../core/volltreffer/leerbestand.ts';
import { FirdsLeser, GettexProdukte, HebelZaehler, type HebelStand } from '../core/volltreffer/firds.ts';
import { hebelZeilen, produktAuswahl, richtungenAus, type ProdukteJeBasis } from '../core/volltreffer/hebelkurse.ts';
import { formular4Dateien, kaeufeAusDatensatz, kaeufeVereinen, kaufAusMeldung, quartaleZwischen, quartalsEnde, quartalVon, type InsiderArchiv } from '../core/volltreffer/insider.ts';
import { frameEinarbeiten, frameLesen, framesBis, type AktienzahlArchiv } from '../core/volltreffer/aktienzahl.ts';
import { istBiotech, sponsorName, studienLesen, type Studie } from '../core/volltreffer/studien.ts';
import { amtsblattLesen, aufrufeLesen, gdeltLesen, weltgeschehenLesen, wikidataKuerzel, type Ereignis, type Tagesreihe, type Thema } from '../core/volltreffer/kontext.ts';
import { apewisdomLesen, leiheCsv, leiheLesen, type Nennung } from '../core/volltreffer/stimmung.ts';
import { eftsLesen, type Katalysator } from '../core/volltreffer/volltext.ts';
import { gettexDateiLaden, gettexDateiliste } from './kurse/gettex.ts';
import { USER_AGENT } from './lib/netz.ts';

interface ArchivConfig {
  repo: string;
  gettex: { handelVon: string; handelBis: string; fertigNachMinuten: number; parallel: number };
  us: { host: string; ab: string; maxTageJeLauf: number; pauseSekunden: number; bereinigt: boolean; mitOtc: boolean };
  krypto: { host: string };
  minuten?: { schwelleHoch: number; minKurs: number; maxFaktor: number; mitOtc: boolean; pauseSekunden: number; laufzeitMinuten: number; ab: string };
  kryptoKerzen?: { waehrungen: string[]; pauseMs: number; mindestAnteil: number; tageZurueck: number };
  stamm?: { maxAnfragen: number; pauseMs: number; fenster: number; mindestTage: number };
  boersenwert?: { seiten: number; maxVerlaeufe: number; pauseMs: number; tage: number };
  usSplits?: { jahreZurueck: number; nachfassenTage: number };
  zahlen?: { jahre: number; maxAnfragen: number; abstandMs: number; parallel: number; zeitzone: 'ET' | 'UTC'; nachfassenTage: number; speichernAlle: number };
}
interface Index {
  stand?: string;
  gettex: Record<string, { isins: number; geschaefte: number; umsatz: number; fenster: number; erwartet: number; vollstaendig: boolean; geholt: string }>;
  us: Record<string, { werte?: number; otc?: number; bereinigt?: boolean; keinHandel?: boolean; ausserhalbTarif?: boolean; geholt: string }>;
  krypto: Record<string, { paare: number; zeit: string }>;
  /** Tageskerzen (UTC) aller Kraken-Paare gegen Euro und Dollar */
  kryptoKerzen?: Record<string, { paare: number; geholt: string }>;
  /** Splits-Liste (stamm/us-splits.csv.gz): Zahl der Einträge und letzter Abruf */
  usSplits?: { eintraege: number; von: string; bis: string; geholt: string };
  /** Stammdaten (stamm/wertpapiere.json) und Handelbarkeits-Karte (stamm/handelbar.json) in Zählungen */
  stamm?: { wertpapiere: number; handelbar: number; handelbarUs: number; gettexTage: number; offen: number; geholt: string };
  /** Börsenwert der Coins (stamm/krypto-boersenwert.csv.gz) in Zählungen */
  boersenwert?: { coins: number; zeilen: number; verlaeufeOffen: number; geholt: string };
  /** Zahlen-Termine und Branchen aus EDGAR (stamm/us-zahlen.json.gz) in Zählungen */
  umfeld?: { vixTage: number; vixLetzterTag: string | null; geholt: string };
  /** Krypto-Umfeld (stamm/krypto-umfeld.json.gz) in Zählungen */
  kryptoUmfeld?: { angstTage: number; angstBis: string | null; stableTage: number; stableBis: string | null; geholt: string };
  /** Leerverkaufsvolumen je US-Handelstag (leerverkauf/JJJJ/JJJJ-MM-TT.csv.gz); werte 0 = bei FINRA nicht vorhanden */
  leerverkauf?: Record<string, { werte: number; geholt: string }>;
  /** Hebelprodukte je Basiswert (ESMA FIRDS) und Zuordnung ISIN → Kürzel in Zählungen */
  hebel?: { quelle: string | null; basiswerte: number; zugeordnet: number; offen: number; geholt: string };
  /** B Stufe 2a: mitgeschriebene gettex-Zeilen passender Hebelprodukte je Tag (nur Zählungen) */
  hebelkurse?: Record<string, { basiswerte: number; produkte: number; zeilen: number; geschaefte: number; geholt: string }>;
  /** Leerverkaufsbestand je FINRA-Stichtag (leerbestand/JJJJ/JJJJ-MM-TT.csv.gz); werte 0 = bei FINRA nicht vorhanden */
  leerbestand?: Record<string, { werte: number; veroeffentlicht: string | null; geholt: string }>;
  /** Insider-Käufe (stamm/insider.json.gz) in Zählungen */
  insider?: { kaeufe: number; kuerzel: number; quartale: number; tage: number; ab: string | null; bis: string | null; geholt: string };
  /** F4: Aktienzahl je Firma aus SEC-XBRL-Frames (nur Zählungen) */
  aktienzahl?: { firmen: number; werte: number; frames: number; geholt: string };
  /** F3: tägliche Schnappschüsse der Studien-Termine (nur Zählungen) */
  studien?: Record<string, { firmen: number; mitStudien: number; studien: number; geholt: string }>;
  /** Quantensprung 3: Kontext-Geschichte (nur Zählungen) */
  themen?: { themen: number; tage: number; bis: string | null; geholt: string };
  amtsblatt?: { reihen: number; tage: number; bis: string | null; geholt: string };
  weltgeschehen?: { tage: number; ereignisse: number; bis: string | null; geholt: string };
  aufmerksamkeit?: { zugeordnet: number; mitReihe: number; offen: number; bis: string | null; geholt: string; zuordnung: string };
  /** Zeitlupe (Q1, 20.11.2026): Minutenkerzen der Tage mit großem Tageshoch (minuten/JJJJ/JJJJ-MM-TT.json.gz) in Zählungen */
  minuten?: { ereignisse: number; tage: number; offen: number; leer: number; geholt: string };
  /** Q6 Leihgebühren (Interactive Brokers) und Q7 Reddit/4chan-Nennungen (ApeWisdom): Schnappschüsse in Zählungen */
  leihe?: Record<string, { werte: number; geholt: string }>;
  reddit?: Record<string, { aktien: number; coins: number; geholt: string }>;
  /** Q2 Katalysator-Begriffe aus der SEC-Volltextsuche (stamm/volltext.json.gz) in Zählungen */
  volltext?: { begriffe: number; meldungen: number; kuerzel: number; monateOffen: number; geholt: string };
  usZahlen?: { firmen: number; abgerufen: number; offen: number; mitZahlen: number; meldungen: number; mitBranche: number; ab: string; tageBis: string | null; geholt: string; mitArten?: number; arten?: Record<string, number> };
}

const ARCHIV = process.env.ARCHIV_DIR ?? '_archiv';
const cfg = JSON.parse(readFileSync(join(process.cwd(), 'config', 'archiv.json'), 'utf8')) as ArchivConfig;
const nyseFeiertage = new Set((JSON.parse(readFileSync(join(process.cwd(), 'config', 'daytrading.json'), 'utf8')) as { nyseFeiertage?: string[] }).nyseFeiertage ?? []);
const jetzt = new Date(process.env.JETZT ?? Date.now());
const iso = jetzt.toISOString();
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
const tagPlus = (datum: string, tage: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + tage * 86400000).toISOString().slice(0, 10);
const pfad = (markt: string, datum: string) => join(ARCHIV, markt, datum.slice(0, 4), `${datum}.csv.gz`);
const fehler: string[] = [];
const neu: string[] = [];
// Welche Teile laufen? Der tägliche Lauf holt Krypto-Stand, US und gettex; Kursgeschichte und Splits nur auf Wunsch.
const NUR = new Set((process.env.ARCHIV_NUR?.trim() || 'krypto,us,gettex,stamm,boersenwert,zahlen,umfeld,kryptoumfeld,leerverkauf,leerbestand,hebel,insider,aktienzahl,studien,themen,amtsblatt,weltgeschehen,aufmerksamkeit,leihe,reddit,volltext').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
const istDatum = (x: string | undefined): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
const usAb = istDatum(process.env.US_AB?.trim()) ? process.env.US_AB!.trim() : cfg.us.ab;
const usMaxTage = Number(process.env.US_MAX_TAGE) > 0 ? Math.floor(Number(process.env.US_MAX_TAGE)) : cfg.us.maxTageJeLauf;

if (!existsSync(ARCHIV)) {
  console.error(`Archiv-Ordner ${ARCHIV} fehlt (Checkout des privaten Repos).`);
  process.exit(1);
}
const indexPfad = join(ARCHIV, 'index.json');
const index: Index = existsSync(indexPfad) ? (JSON.parse(readFileSync(indexPfad, 'utf8')) as Index) : { gettex: {}, us: {}, krypto: {} };

/** Tagesdatei schreiben – nur wenn es sie noch nicht gibt (Archiv wird nur angehängt). */
function ablegen(markt: string, datum: string, csv: string): boolean {
  const p = pfad(markt, datum);
  if (existsSync(p)) return false;
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, gzipSync(Buffer.from(csv, 'utf8'), { level: 9 }));
  neu.push(`${markt}/${datum}`);
  return true;
}

// ---------- Krypto: einmal je UTC-Tag der Stand aller Kraken-Paare ----------
async function krypto() {
  const tag = iso.slice(0, 10);
  if (index.krypto[tag] || existsSync(pfad('krypto', tag))) return;
  const hole = async (weg: string) => {
    const r = await fetch(`${cfg.krypto.host}${weg}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error(`Kraken HTTP ${r.status}`);
    return (await r.json()) as unknown;
  };
  const paare = (await hole('/0/public/AssetPairs').catch(() => null)) as { result?: Record<string, { wsname?: string }> } | null;
  const namen = Object.fromEntries(Object.entries(paare?.result ?? {}).map(([k, v]) => [k, v.wsname ?? '']));
  const r = parseKrakenAlle(await hole('/0/public/Ticker'), namen);
  if (r.fehler || r.staende.length < 100) throw new Error(`Kraken: ${r.fehler ?? `nur ${r.staende.length} Paare`}`);
  if (ablegen('krypto', tag, kryptoCsv(r.staende))) index.krypto[tag] = { paare: r.staende.length, zeit: iso };
  console.log(`Krypto ${tag}: ${r.staende.length} Paare.`);
}

// ---------- US: fehlende Handelstage bis gestern (New Yorker Datum) ----------
async function us() {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) {
    console.log('US: MASSIVE_API_KEY fehlt – übersprungen.');
    return;
  }
  const nyHeute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/New_York' }).format(jetzt);
  const offen: string[] = [];
  for (let d = usAb; d < nyHeute; d = tagPlus(d, 1)) {
    const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wt === 0 || wt === 6 || nyseFeiertage.has(d) || index.us[d] || existsSync(pfad('us', d))) continue;
    offen.push(d);
  }
  // Neueste Tage zuerst: Sie sind für Zensus und Schattenbuch am wertvollsten, und die Grenze der Tarif-Historie
  // zeigt sich als erste Ablehnung (HTTP 403) nach erfolgreichen jüngeren Tagen.
  offen.reverse();
  let abrufe = 0;
  const abruf = async (d: string, otc: boolean) => {
    if (abrufe++ > 0) await pause(cfg.us.pauseSekunden * 1000);
    const url = `${cfg.us.host}/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=${cfg.us.bereinigt}${otc ? '&include_otc=true' : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
  };
  let mitOtc = cfg.us.mitOtc;
  const altGrenze = tagPlus(nyHeute, -10);
  const erfolgreich = (d: string) => Object.keys(index.us).some((x) => x > d && index.us[x].werte);
  for (const [i, d] of offen.slice(0, usMaxTage).entries()) {
    let a = await abruf(d, mitOtc);
    // Der Gratis-Tarif kann den Zusatz „mit OTC“ ablehnen → ohne wiederholen und für den Rest des Laufs merken
    if (mitOtc && (a.status === 400 || a.status === 403)) {
      const ohne = await abruf(d, false);
      if (ohne.status === 200) mitOtc = false;
      a = ohne;
    }
    // Außerhalb des Tarifs antwortet Massive mit HTTP 403 oder mit Status NOT_AUTHORIZED – beides gleich behandeln
    if (a.status === 200 && (a.json as { status?: string } | null)?.status === 'NOT_AUTHORIZED') a = { ...a, status: 403 };
    if (a.status === 403) {
      if (d >= altGrenze) {
        console.log(`US ${d}: noch nicht abrufbar (HTTP 403) – nächster Lauf.`);
        continue;
      }
      // Alter Tag abgelehnt, jüngere Tage gingen: Grenze der Tarif-Historie erreicht. Dieser und alle älteren offenen Tage
      // werden gemerkt und nie wieder versucht. Ohne erfolgreichen jüngeren Tag (Schlüssel ungültig?) wird nichts gemerkt.
      if (!erfolgreich(d)) throw new Error(`Massive ${d}: HTTP 403 ohne erfolgreichen jüngeren Tag – Schlüssel prüfen`);
      const aelter = offen.slice(i);
      for (const x of aelter) index.us[x] = { ausserhalbTarif: true, geholt: iso };
      console.log(`US: Grenze der Tarif-Historie bei ${d} – ${aelter.length} ältere Tage außerhalb (werden nicht mehr versucht).`);
      break;
    }
    if (a.status === 429) {
      console.log('US: Kontingent je Minute erreicht – nächster Lauf.');
      break;
    }
    const p = parseMassive(a.json);
    if (a.status !== 200 || p.fehler) throw new Error(`Massive ${d}: HTTP ${a.status}${p.fehler ? ` – ${p.fehler}` : ''}`);
    if (!p.kerzen.length) {
      index.us[d] = { keinHandel: true, geholt: iso };
      console.log(`US ${d}: kein Handel.`);
      continue;
    }
    if (p.kerzen.length < 3000) throw new Error(`Massive ${d}: nur ${p.kerzen.length} Werte – Antwort unvollständig?`);
    if (ablegen('us', d, usCsv(p.kerzen))) index.us[d] = { werte: p.kerzen.length, otc: p.kerzen.filter((k) => k.otc).length, bereinigt: p.bereinigt ?? cfg.us.bereinigt, geholt: iso };
    console.log(`US ${d}: ${p.kerzen.length} Werte (${index.us[d]?.otc ?? 0} OTC).`);
  }
  const rest = offen.filter((d) => !index.us[d] && !existsSync(pfad('us', d))).length;
  if (rest && offen.length > usMaxTage) console.log(`US: ${rest} weitere Tage folgen im nächsten Lauf.`);
}

// ---------- Krypto-Tageskerzen (UTC) aller Kraken-Paare gegen Euro und Dollar – Kursgeschichte und täglicher Nachtrag ----------
// Kraken liefert je Paar bis zu 720 Tageskerzen. Abgelegt wird je fertigem UTC-Tag eine Datei mit allen Paaren; fehlen
// zu viele Paare (Abrufgrenze), wird nichts abgelegt – eine Tagesdatei lässt sich später nicht mehr ergänzen.
async function kryptoKerzen() {
  const kk = cfg.kryptoKerzen ?? { waehrungen: ['EUR', 'USD'], pauseMs: 1100, mindestAnteil: 0.97, tageZurueck: 720 };
  const heute = iso.slice(0, 10);
  const da = (index.kryptoKerzen ??= {});
  const fehlend: string[] = [];
  for (let d = tagPlus(heute, -kk.tageZurueck); d < heute; d = tagPlus(d, 1)) if (!da[d] && !existsSync(pfad('krypto-kerzen', d))) fehlend.push(d);
  if (!fehlend.length) {
    console.log('Krypto-Tageskerzen: alle Tage vorhanden.');
    return;
  }
  const hole = async (weg: string): Promise<unknown> => {
    for (let versuch = 0; ; versuch++) {
      const r = await fetch(`${cfg.krypto.host}${weg}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) }).catch(() => null);
      const json = r?.ok ? ((await r.json().catch(() => null)) as { error?: string[] } | null) : null;
      const zuViele = r?.status === 429 || !!json?.error?.some((e) => /Too many requests|Rate limit/i.test(e));
      if (json && !zuViele) return json;
      if (versuch >= 3) throw new Error(`Kraken ${weg.split('?')[0]}: ${r ? `HTTP ${r.status}` : 'keine Antwort'}`);
      await pause((zuViele ? 15000 : 3000) * (versuch + 1));
    }
  };
  const paare = krakenKerzenPaare(await hole('/0/public/AssetPairs'), kk.waehrungen);
  if (paare.length < 100) throw new Error(`Kraken: nur ${paare.length} Paare`);
  // nur so weit zurück fragen wie nötig (Kraken: Kerzen NACH dem Zeitpunkt)
  const seit = Math.floor(Date.parse(`${fehlend[0]}T00:00:00Z`) / 1000) - 86400;
  const jeTag = new Map<string, KryptoKerze[]>();
  let geholt = 0;
  const lade = async (liste: { paar: string; name: string }[]) => {
    const gescheitert: { paar: string; name: string }[] = [];
    for (const p of liste) {
      await pause(kk.pauseMs);
      try {
        const r = parseKrakenOhlc(await hole(`/0/public/OHLC?pair=${encodeURIComponent(p.paar)}&interval=1440&since=${seit}`));
        if (r.fehler) throw new Error(r.fehler);
        for (const { datum, ...k } of r.tage) {
          if (datum >= heute) continue;
          const tag = jeTag.get(datum) ?? [];
          tag.push({ paar: p.paar, name: p.name, ...k });
          jeTag.set(datum, tag);
        }
        geholt++;
      } catch {
        gescheitert.push(p);
      }
    }
    return gescheitert;
  };
  const offen = await lade(await lade(paare));
  if (geholt / paare.length < kk.mindestAnteil) throw new Error(`Krypto-Tageskerzen: nur ${geholt} von ${paare.length} Paaren abrufbar – nichts abgelegt`);
  let tage = 0;
  for (const d of fehlend) {
    const kerzen = jeTag.get(d);
    if (!kerzen?.length) continue;
    if (ablegen('krypto-kerzen', d, kryptoKerzenCsv(kerzen))) {
      da[d] = { paare: kerzen.length, geholt: iso };
      tage++;
    }
  }
  console.log(`Krypto-Tageskerzen: ${geholt} von ${paare.length} Paaren, ${tage} Tage neu (${fehlend[0]} bis ${fehlend[fehlend.length - 1]})${offen.length ? `, ${offen.length} Paare nicht abrufbar` : ''}.`);
}

// ---------- Stammdaten und Handelbarkeits-Karte (gettex-ISINs, OpenFIGI) ----------
// Je an gettex gehandelter ISIN Name, US-Kürzel und Art (OpenFIGI, ohne Schlüssel 25 Anfragen/Min. à 10 ISINs);
// handelbar ist, was an mindestens 10 der letzten 20 gettex-Tage Umsatz hatte. Beides bleibt privat (die Karte
// beruht auf gettex-Umsätzen); öffentlich nur Zählungen.
async function stamm() {
  const st = cfg.stamm ?? { maxAnfragen: 120, pauseMs: 2600, fenster: 20, mindestTage: 10 };
  const ordner = join(ARCHIV, 'gettex');
  const dateien = existsSync(ordner)
    ? readdirSync(ordner)
        .filter((j) => /^\d{4}$/.test(j))
        .flatMap((j) => readdirSync(join(ordner, j)).map((d) => join(ordner, j, d)))
        .filter((d) => /\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(d))
        .sort()
        .slice(-st.fenster)
    : [];
  if (!dateien.length) {
    console.log('Stammdaten: noch keine gettex-Tage im Archiv.');
    return;
  }
  const tage = dateien.map((d) => {
    const kerzen = parseGettexArchiv(gunzipSync(readFileSync(d)).toString('utf8'));
    return { datum: d.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/)![1], umsatz: new Map([...kerzen].map(([isin, k]) => [isin, k.umsatz])) };
  });
  const stammPfad = join(ARCHIV, 'stamm', 'wertpapiere.json');
  const bekannt: Record<string, Wertpapier> = existsSync(stammPfad) ? JSON.parse(readFileSync(stammPfad, 'utf8')) : {};
  // fehlende ISINs nach Umsatz (wichtige zuerst)
  const umsatzSumme = new Map<string, number>();
  for (const t of tage) for (const [isin, u] of t.umsatz) umsatzSumme.set(isin, (umsatzSumme.get(isin) ?? 0) + u);
  const fehlen = [...umsatzSumme].filter(([isin]) => !bekannt[isin]).sort((a, b) => b[1] - a[1]).map(([isin]) => isin);
  const key = process.env.OPENFIGI_API_KEY?.trim();
  const je = key ? 100 : 10;
  let anfragen = 0;
  while (fehlen.length && anfragen < st.maxAnfragen) {
    const teil = fehlen.splice(0, je);
    if (anfragen++ > 0) await pause(key ? 300 : st.pauseMs);
    const r = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT, ...(key ? { 'X-OPENFIGI-APIKEY': key } : {}) },
      body: JSON.stringify(teil.map((i) => ({ idType: 'ID_ISIN', idValue: i }))),
      signal: AbortSignal.timeout(30000),
    }).catch(() => null);
    if (r?.status === 429) {
      console.log('Stammdaten: OpenFIGI-Kontingent erreicht – nächster Lauf.');
      fehlen.unshift(...teil);
      break;
    }
    if (!r?.ok) throw new Error(`OpenFIGI: ${r ? `HTTP ${r.status}` : 'keine Antwort'}`);
    Object.assign(bekannt, figiEinordnen(teil, (await r.json()) as Parameters<typeof figiEinordnen>[1], iso.slice(0, 10)));
  }
  mkdirSync(dirname(stammPfad), { recursive: true });
  writeFileSync(stammPfad, JSON.stringify(bekannt) + '\n');
  const karte = handelbarkeitsKarte(tage, st.fenster, st.mindestTage);
  const handelbar: Record<string, { tage: number; umsatzMedian: number; art: string; usTicker?: string }> = {};
  for (const [isin, k] of karte) handelbar[isin] = { ...k, art: bekannt[isin]?.art ?? 'unbekannt', ...(bekannt[isin]?.usTicker ? { usTicker: bekannt[isin].usTicker } : {}) };
  writeFileSync(join(ARCHIV, 'stamm', 'handelbar.json'), JSON.stringify({ stand: iso, gettexTage: tage.length, von: tage[0].datum, bis: tage[tage.length - 1].datum, isins: handelbar }) + '\n');
  const handelbarUs = Object.values(handelbar).filter((h) => h.usTicker && h.art === 'aktie').length;
  index.stamm = { wertpapiere: Object.keys(bekannt).length, handelbar: karte.size, handelbarUs, gettexTage: tage.length, offen: fehlen.length, geholt: iso };
  console.log(`Stammdaten: ${Object.keys(bekannt).length} ISINs bekannt (${anfragen} Anfragen, ${fehlen.length} noch offen); handelbar ${karte.size} ISINs aus ${tage.length} gettex-Tagen, davon ${handelbarUs} Aktien mit US-Kürzel.`);
}

// ---------- Börsenwert der Coins (CoinGecko Demo) – Merkmal für Rückblick und Zensus ----------
// Täglich der Stand der größten Coins (/coins/markets), dazu einmalig je Coin der Verlauf über 365 Tage
// (/coins/{id}/market_chart), damit der Rückblick den Börsenwert AM Stichtag kennt. Demo: 30 Abrufe je Minute,
// 10.000 je Monat. Privat im Archiv (stamm/krypto-boersenwert.csv.gz); öffentlich nur Zählungen.
async function boersenwert() {
  const key = process.env.COINGECKO_API_KEY?.trim();
  if (!key) {
    console.log('Börsenwert: COINGECKO_API_KEY fehlt – übersprungen.');
    return;
  }
  const bw = cfg.boersenwert ?? { seiten: 4, maxVerlaeufe: 150, pauseMs: 2500, tage: 365 };
  const hole = async (weg: string): Promise<unknown> => {
    const r = await fetch(`https://api.coingecko.com/api/v3${weg}`, { headers: { 'x-cg-demo-api-key': key, accept: 'application/json', 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
    if (r.status === 429) throw new Error('Kontingent');
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  };
  const datei = join(ARCHIV, 'stamm', 'krypto-boersenwert.csv.gz');
  const alt: BoersenwertZeile[] = existsSync(datei) ? parseBoersenwertCsv(gunzipSync(readFileSync(datei)).toString('utf8')) : [];
  const neu: BoersenwertZeile[] = [];
  const heute = iso.slice(0, 10);
  // 1. heutiger Stand der größten Coins
  const maerkte = [];
  for (let s = 1; s <= bw.seiten; s++) {
    if (s > 1) await pause(bw.pauseMs);
    maerkte.push(...parseGeckoMarkets(await hole(`/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=${s}`)));
  }
  if (maerkte.length < 100) throw new Error(`CoinGecko: nur ${maerkte.length} Coins`);
  const ids = symbolZuId(maerkte);
  for (const m of maerkte) if (ids.get(m.symbol) === m.id) neu.push({ datum: heute, symbol: m.symbol, cap: m.cap });
  // 2. Verlauf für Coins, die an Kraken gehandelt werden und noch keinen Verlauf haben (älteste Zeile jünger als 300 Tage)
  const aeltester = new Map<string, string>();
  for (const z of alt) if (!aeltester.has(z.symbol) || z.datum < aeltester.get(z.symbol)!) aeltester.set(z.symbol, z.datum);
  const grenze = new Date(Date.parse(heute) - 300 * 86400000).toISOString().slice(0, 10);
  const kerzenOrdner = join(ARCHIV, 'krypto-kerzen');
  const krakenSymbole = new Set<string>();
  if (existsSync(kerzenOrdner)) {
    const letzte = readdirSync(kerzenOrdner)
      .filter((j) => /^\d{4}$/.test(j))
      .flatMap((j) => readdirSync(join(kerzenOrdner, j)).map((d) => join(kerzenOrdner, j, d)))
      .sort()
      .pop();
    if (letzte) for (const zeile of gunzipSync(readFileSync(letzte)).toString('utf8').split('\n').slice(1)) {
      const name = zeile.split(',')[1] ?? '';
      const basis = name.split('/')[0];
      if (basis) krakenSymbole.add(krakenZuSymbol(basis));
    }
  }
  const offen = [...krakenSymbole].filter((s) => ids.has(s) && !((aeltester.get(s) ?? '9999') <= grenze));
  let verlaeufe = 0;
  let gescheitert = 0;
  let ersterFehler = '';
  for (const s of offen.slice(0, bw.maxVerlaeufe)) {
    await pause(bw.pauseMs);
    try {
      for (const p of parseGeckoChart(await hole(`/coins/${ids.get(s)}/market_chart?vs_currency=usd&days=${bw.tage}&interval=daily`))) if (p.datum < heute) neu.push({ datum: p.datum, symbol: s, cap: p.cap });
      verlaeufe++;
    } catch (e) {
      if ((e as Error).message === 'Kontingent') {
        console.log('Börsenwert: CoinGecko-Kontingent erreicht – Rest im nächsten Lauf.');
        break;
      }
      gescheitert++;
      ersterFehler ||= `${s}: ${(e as Error).message}`;
    }
  }
  const { csv, zeilen } = boersenwertCsv(alt, neu);
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, gzipSync(Buffer.from(csv, 'utf8'), { level: 9 }));
  index.boersenwert = { coins: new Set([...alt, ...neu].map((z) => z.symbol)).size, zeilen, verlaeufeOffen: Math.max(0, offen.length - verlaeufe), geholt: iso };
  console.log(`Börsenwert: ${maerkte.length} Coins heute, ${verlaeufe} Verläufe neu (${Math.max(0, offen.length - verlaeufe)} offen${gescheitert ? `, ${gescheitert} gescheitert, z. B. ${ersterFehler}` : ''}), ${zeilen} Zeilen gesamt.`);
  if (gescheitert && !verlaeufe) throw new Error(`Börsenwert-Verläufe: alle ${gescheitert} gescheitert (${ersterFehler})`);
}

// ---------- US-Aktiensplits (Massive): eine Liste, die nur wächst – Splits sind Ereignisse, keine Kurssprünge ----------
async function usSplits() {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) {
    console.log('US-Splits: MASSIVE_API_KEY fehlt – übersprungen.');
    return;
  }
  const sp = cfg.usSplits ?? { jahreZurueck: 2, nachfassenTage: 30 };
  const datei = join(ARCHIV, 'stamm', 'us-splits.csv.gz');
  const alt: UsSplit[] = existsSync(datei) ? parseUsSplitsArchiv(gunzipSync(readFileSync(datei)).toString('utf8')) : [];
  const heute = iso.slice(0, 10);
  // erster Abruf: die ganze Historie des Tarifs; danach nur die letzten Wochen nachfassen
  const ab = alt.length ? tagPlus(heute, -sp.nachfassenTage) : tagPlus(heute, -Math.round(sp.jahreZurueck * 365.25));
  let url: string | undefined = `${cfg.us.host}/v3/reference/splits?execution_date.gte=${ab}&order=asc&sort=execution_date&limit=1000`;
  const neue: UsSplit[] = [];
  for (let seite = 0; url && seite < 40; seite++) {
    if (seite > 0) await pause(cfg.us.pauseSekunden * 1000);
    const r: Response = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (r.status === 403) {
      console.log('US-Splits: im Tarif nicht abrufbar (HTTP 403) – übersprungen.');
      return;
    }
    const p = parseMassiveSplits(await r.json().catch(() => null));
    if (r.status !== 200 || p.fehler) throw new Error(`Massive Splits: HTTP ${r.status}${p.fehler ? ` – ${p.fehler}` : ''}`);
    neue.push(...p.splits);
    url = p.weiter;
  }
  const alle = splitsVereinen(alt, neue);
  if (alle.length !== alt.length || neue.some((n) => !alt.some((a) => a.datum === n.datum && a.ticker === n.ticker && a.von === n.von && a.zu === n.zu))) {
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(usSplitsCsv(alle), 'utf8'), { level: 9 }));
    neu.push('stamm/us-splits');
  }
  if (alle.length) index.usSplits = { eintraege: alle.length, von: alle[0].datum, bis: alle[alle.length - 1].datum, geholt: iso };
  console.log(`US-Splits: ${alle.length} Einträge (${alle.length - alt.length} neu, abgefragt ab ${ab}).`);
}

// ---------- Zahlen-Termine und Branchen (SEC EDGAR: frei, ohne Schlüssel; die SEC verlangt eine Kontaktadresse) ----------
// Erster Abruf: je Firma die Meldungen der letzten zwei Jahre (fortsetzbar über mehrere Läufe, Budget je Lauf); danach
// nur die Firmen, die laut EDGAR-Tagesverzeichnis seit dem letzten Lauf ein 8-K eingereicht haben.
async function zahlen() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt || !kontakt.includes('@')) {
    console.log('Zahlen (SEC): SEC_KONTAKT fehlt – übersprungen (die SEC verlangt eine Kontaktadresse im User-Agent).');
    return;
  }
  const zc = cfg.zahlen ?? { jahre: 2, maxAnfragen: 1500, abstandMs: 130, parallel: 4, zeitzone: 'ET' as const, nachfassenTage: 10, speichernAlle: 500 };
  const max = Number(process.env.ZAHLEN_MAX) > 0 ? Math.floor(Number(process.env.ZAHLEN_MAX)) : zc.maxAnfragen;
  const ua = `Schattendepot-Forschung ${kontakt}`;
  const datei = join(ARCHIV, 'stamm', 'us-zahlen.json.gz');
  const heute = iso.slice(0, 10);
  const gestern = tagPlus(heute, -1);
  const a: ZahlenArchiv = existsSync(datei)
    ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as ZahlenArchiv)
    : { stand: iso, ab: tagPlus(heute, -Math.round(zc.jahre * 365.25) - 30), tageBis: gestern, firmen: {} };
  // nur schreiben, wenn sich etwas geändert hat (das private Repo soll nicht mit gleichen Ständen wachsen)
  const inhalt = () => JSON.stringify({ ...a, stand: '' });
  const vorher = existsSync(datei) ? inhalt() : '';
  const speichern = () => {
    if (inhalt() === vorher) return false;
    a.stand = iso;
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(a), 'utf8'), { level: 9 }));
    return true;
  };
  // höchstens 1000/abstandMs Abrufe je Sekunde über alle parallelen Abrufe (SEC: höchstens 10 je Sekunde)
  let anfragen = 0;
  let naechste = 0;
  const holen = async (url: string) => {
    const slot = Math.max(Date.now(), naechste);
    naechste = slot + zc.abstandMs;
    if (slot > Date.now()) await pause(slot - Date.now());
    anfragen++;
    const r = await fetch(url, { headers: { 'User-Agent': ua, Accept: 'application/json, text/plain' }, signal: AbortSignal.timeout(60000) });
    if (r.status === 403 || r.status === 429) throw new Error(`SEC lehnt ab (HTTP ${r.status}) – Abrufe für heute beendet`);
    return r;
  };

  // 1. Kürzel-Liste: welche Firmen gibt es, welche Kürzel tragen sie heute?
  const tr = await holen('https://www.sec.gov/files/company_tickers.json');
  if (tr.status !== 200) throw new Error(`SEC-Kürzelliste: HTTP ${tr.status}`);
  const karte = secTickerKarte(await tr.json().catch(() => null));
  if (karte.size < 1000) throw new Error(`SEC-Kürzelliste: nur ${karte.size} Firmen`);
  for (const [cik, tickers] of karte) {
    const f = a.firmen[cik];
    if (!f) a.firmen[cik] = { tickers, sic: null, zahlen: [] };
    else f.tickers = [...new Set([...tickers, ...f.tickers])];
  }

  // 2. Nachfassen: Firmen mit einem 8-K seit dem letzten Lauf (EDGAR-Tagesverzeichnis, ein Abruf je Tag)
  const nachholen = new Set<string>();
  let tag = tagPlus(a.tageBis ?? gestern, 1);
  for (let n = 0; tag <= gestern && n < zc.nachfassenTage; n++, tag = tagPlus(tag, 1)) {
    const wt = new Date(`${tag}T12:00:00Z`).getUTCDay();
    if (wt === 0 || wt === 6) {
      a.tageBis = tag;
      continue;
    }
    const q = Math.floor((Number(tag.slice(5, 7)) - 1) / 3) + 1;
    const r = await holen(`https://www.sec.gov/Archives/edgar/daily-index/${tag.slice(0, 4)}/QTR${q}/form.${tag.replace(/-/g, '')}.idx`);
    if (r.status === 200) {
      for (const cik of ciksAusTagesverzeichnis(await r.text(), NACHFASS_FORMULARE)) if (meldungenErfasst(a.firmen[cik])) nachholen.add(cik);
      a.tageBis = tag;
    } else if (r.status === 404 && tag < gestern) a.tageBis = tag; // Feiertag
    else break; // gestern noch nicht veröffentlicht → nächster Lauf
  }

  // 3. Meldungen je Firma holen: erst die nachzufassenden, dann die noch nie abgerufenen, dann die ohne die aktuellen
  //    Meldungsarten (einmaliges Neuholen, wenn MELDUNGEN_STUFE steigt)
  const liste = [...nachholen, ...Object.keys(a.firmen).filter((c) => !a.firmen[c].geholt), ...Object.keys(a.firmen).filter((c) => a.firmen[c].geholt && !meldungenErfasst(a.firmen[c]))];
  let fertig = 0;
  let ohneDaten = 0;
  let abbruch: Error | null = null;
  let pos = 0;
  const arbeiter = async () => {
    while (!abbruch && pos < liste.length && anfragen < max) {
      const cik = liste[pos++];
      const f = a.firmen[cik];
      // Nachfassen braucht nur die jüngsten Meldungen (erste Seite reicht weit über die Nachfass-Tage zurück)
      const nurNeu = meldungenErfasst(f);
      try {
        const r = await holen(`https://data.sec.gov/submissions/CIK${cik.padStart(10, '0')}.json`);
        const p = r.status === 200 ? parseSubmissions(await r.json().catch(() => null), a.ab, zc.zeitzone) : null;
        if (!p) {
          ohneDaten++;
          f.geholt = heute;
          continue;
        }
        let z = p.zahlen;
        let ml = meldungenVereinen({}, p.meldungen);
        let vollstaendig = true;
        for (const name of nurNeu ? [] : p.weitere) {
          if (anfragen >= max) {
            vollstaendig = false;
            break;
          }
          const rs = await holen(`https://data.sec.gov/submissions/${name}`);
          if (rs.status !== 200) {
            vollstaendig = false;
            continue;
          }
          const seite = await rs.json().catch(() => null);
          z = zahlenVereinen(z, zahlenAusSeite(seite, a.ab, zc.zeitzone));
          ml = meldungenVereinen(ml, meldungenAusSeite(seite, a.ab, zc.zeitzone));
        }
        f.sic = p.sic ?? f.sic;
        f.zahlen = zahlenVereinen(f.zahlen, z);
        f.meldungen = meldungenVereinen(f.meldungen ?? {}, ml);
        // nur als erfasst markieren, wenn alle Seiten da sind (sonst holt der nächste Lauf die Firma noch einmal ganz)
        if (vollstaendig || nurNeu) f.stufe = MELDUNGEN_STUFE;
        f.geholt = heute;
        if (++fertig % zc.speichernAlle === 0) speichern();
      } catch (e) {
        if (/SEC lehnt ab/.test((e as Error).message)) abbruch = e as Error;
        else ohneDaten++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, zc.parallel) }, arbeiter));
  if (speichern()) neu.push('stamm/us-zahlen');
  const firmen = Object.values(a.firmen);
  const geholt = firmen.filter((f) => f.geholt);
  const uz = {
    firmen: firmen.length,
    abgerufen: geholt.length,
    offen: firmen.length - geholt.length,
    mitZahlen: geholt.filter((f) => f.zahlen.length).length,
    meldungen: geholt.reduce((s, f) => s + f.zahlen.length, 0),
    mitBranche: geholt.filter((f) => f.sic).length,
    mitArten: firmen.filter(meldungenErfasst).length,
    arten: Object.fromEntries(MELDUNG_ARTEN.map((art) => [art, firmen.reduce((s, f) => s + (f.meldungen?.[art]?.length ?? 0), 0)])),
    ab: a.ab,
    tageBis: a.tageBis ?? null,
    geholt: iso,
  };
  index.usZahlen = uz;
  console.log(
    `Zahlen (SEC): ${fertig} Firmen abgerufen (${nachholen.size} nachgefasst, ${ohneDaten} ohne Daten), ${anfragen} Anfragen; Stand: ${geholt.length} von ${firmen.length} Firmen, ${uz.mitZahlen} mit Zahlen-Meldungen (${uz.meldungen} insgesamt), ${uz.mitBranche} mit Branche, ${uz.offen} offen, Tagesverzeichnis bis ${a.tageBis ?? '–'}; Meldungsarten erfasst bei ${uz.mitArten} Firmen (${Object.entries(uz.arten ?? {}).map(([k, v]) => `${k} ${v}`).join(', ')}).`,
  );
  if (abbruch) throw abbruch;
}

// ---------- B Stufe 2a: welche Hebelprodukte mitschreiben? ----------
// Werte der öffentlichen Lauerliste, offenen Jagden und sichtbaren Volltreffer-Orders (Kürzel → Basiswert-ISIN über die
// OpenFIGI-Zuordnung) in der Richtung ihrer Spielart. Fehlt etwas, wird nichts mitgeschrieben (null).
async function hebelAuswahlLaden(): Promise<{ auswahl: Map<string, { b: string; t: 'C' | 'P' }>; jedesNte: number; basiswerte: number } | null> {
  const hc = (cfg as { hebelkurse?: { basiswerteMax: number; produkteJeRichtung: number; kursstellungJedesNteFenster: number; quelle: string } }).hebelkurse;
  const pd = join(ARCHIV, 'stamm', 'gettex-produkte.json.gz');
  const zf = join(ARCHIV, 'stamm', 'isin-kuerzel.json');
  if (!hc || !existsSync(pd) || !existsSync(zf)) return null;
  try {
    // zuerst die private volle Liste des Rückblicks (nur Werte mit Hebelprodukt), sonst die öffentliche Übersicht
    const privat = join(ARCHIV, 'auswertung', 'hebelwerte.json');
    let faelle: { wert?: string; markt?: string; spielart?: string }[];
    if (existsSync(privat)) faelle = (JSON.parse(readFileSync(privat, 'utf8')) as { werte: typeof faelle }).werte;
    else {
      const r = await fetch(hc.quelle, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(30000) });
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      const u = (await r.json()) as Record<string, unknown>;
      faelle = ['offen', 'sichtbar', 'lauerliste'].flatMap((k) => (Array.isArray(u[k]) ? (u[k] as { wert?: string; markt?: string; spielart?: string }[]) : []));
    }
    const zu = JSON.parse(readFileSync(zf, 'utf8')) as Record<string, string | null>;
    const isinsJe = new Map<string, string[]>();
    for (const [isin, k] of Object.entries(zu)) if (k) isinsJe.set(k, [...(isinsJe.get(k) ?? []), isin]);
    const wunsch = new Map<string, Set<'C' | 'P'>>();
    const werte = new Set<string>();
    for (const f of faelle) {
      if (!f.wert || f.markt === 'krypto') continue;
      if (!werte.has(f.wert) && werte.size >= hc.basiswerteMax) continue;
      werte.add(f.wert);
      for (const isin of isinsJe.get(f.wert.toUpperCase()) ?? []) {
        const s = wunsch.get(isin) ?? wunsch.set(isin, new Set()).get(isin)!;
        for (const t of richtungenAus(f.spielart ?? '')) s.add(t);
      }
    }
    const produkte = (JSON.parse(gunzipSync(readFileSync(pd)).toString('utf8')) as { produkte: ProdukteJeBasis }).produkte;
    const auswahl = produktAuswahl(produkte, wunsch, hc.produkteJeRichtung);
    console.log(`Hebelkurse: ${werte.size} Werte, ${wunsch.size} Basiswert-ISINs, ${auswahl.size} Produkte an gettex ausgewählt.`);
    return auswahl.size ? { auswahl, jedesNte: Math.max(1, hc.kursstellungJedesNteFenster), basiswerte: werte.size } : null;
  } catch (e) {
    console.log(`Hebelkurse: Auswahl nicht möglich (${(e as Error).message.slice(0, 80)}) – nur Tageskerzen.`);
    return null;
  }
}

// ---------- gettex: Tageskerzen je ISIN aus allen 15-Minuten-Dateien ----------
async function gettex() {
  const b = berlin(jetzt);
  const tage = [tagPlus(b.datum, -1), b.datum].filter((d) => istHandelstag(d) && !index.gettex[d] && !existsSync(pfad('gettex', d)));
  if (!tage.length) return;
  const liste = await gettexDateiliste();
  const hk = await hebelAuswahlLaden();
  for (const d of tage) {
    const schluss = berlinZuUtc(d, cfg.gettex.handelBis).getTime() + cfg.gettex.fertigNachMinuten * 60000;
    if (jetzt.getTime() < schluss) {
      console.log(`gettex ${d}: Handel läuft noch – nächster Lauf.`);
      continue;
    }
    const dateien = liste.filter((f) => f.datum === d);
    const st = gettexTagStatus(dateien.map((f) => f.schluessel), d, { von: cfg.gettex.handelVon, bis: cfg.gettex.handelBis });
    // Unvollständig? Nur ablegen, wenn es die letzte Gelegenheit ist (die ersten Fenster laufen nach ~24 Std. ab)
    const letzteChance = jetzt.getTime() >= Date.parse(st.erstesEnde) + 22.5 * 3600000;
    if (!dateien.length || (!st.vollstaendig && !letzteChance)) {
      console.log(`gettex ${d}: ${st.fenster} von ${st.erwartet} Fenstern – nächster Lauf.`);
      continue;
    }
    const kerzen = new Map<string, Tageskerze>();
    const hebelZiel: string[] = [];
    let geschaefte = 0;
    let abgelaufen = 0;
    const schlange = [...dateien];
    await Promise.all(
      [...Array(Math.max(1, cfg.gettex.parallel))].map(async () => {
        for (let f = schlange.shift(); f; f = schlange.shift()) {
          // eine leere Datei (Fenster ohne Geschäft) ist in Ordnung, ein gescheiterter Abruf nicht
          let csv: string | null = null;
          for (let versuch = 0; versuch < 4 && csv === null; versuch++) {
            csv = await gettexDateiLaden(f.url).catch(async (e: Error) => {
              // zwischen Liste und Abruf abgelaufen (gettex hält die Dateien nur ~24 Std.) → Tag gilt als unvollständig
              if (/HTTP 404/.test(e.message)) {
                abgelaufen++;
                return '';
              }
              await pause(2000 * (versuch + 1));
              return null;
            });
          }
          if (csv === null) throw new Error(`gettex ${f.name}: nicht ladbar`);
          geschaefte += gettexZeilen(kerzen, csv);
          if (hk && csv) {
            const fensterNr = Math.round(Date.parse(`${f.schluessel.slice(0, 4)}-${f.schluessel.slice(4, 6)}-${f.schluessel.slice(6, 8)}T${f.schluessel.slice(8, 10)}:${f.schluessel.slice(10, 12)}:00Z`) / 900000);
            hebelZeilen(hebelZiel, csv, hk.auswahl, fensterNr % hk.jedesNte === 0);
          }
        }
      }),
    );
    if (!kerzen.size) throw new Error(`gettex ${d}: keine Geschäfte in ${dateien.length} Dateien`);
    const umsatz = Math.round([...kerzen.values()].reduce((a, k) => a + k.umsatz, 0));
    const vollstaendig = st.vollstaendig && abgelaufen === 0;
    if (ablegen('gettex', d, gettexCsv(kerzen))) index.gettex[d] = { isins: kerzen.size, geschaefte, umsatz, fenster: st.fenster, erwartet: st.erwartet, vollstaendig, geholt: iso };
    console.log(`gettex ${d}: ${kerzen.size} ISINs, ${geschaefte} Geschäfte, ${st.fenster} von ${st.erwartet} Fenstern${vollstaendig ? '' : ' (UNVOLLSTÄNDIG – frühe Fenster waren schon abgelaufen)'}.`);
    if (hk && hebelZiel.length) {
      hebelZiel.sort((a, b) => a.slice(13, 21).localeCompare(b.slice(13, 21)) || a.localeCompare(b));
      const geschaefteH = hebelZiel.filter((z) => !z.endsWith(',0')).length;
      const kopf = `# basis je Produkt: siehe stamm/gettex-produkte.json.gz · Kursstellungen jedes ${hk.jedesNte}. Fenster\nisin,zeit,kurs,stueck\n`;
      if (ablegen('hebelkurse', d, kopf + hebelZiel.join('\n') + '\n')) {
        (index.hebelkurse ??= {})[d] = { basiswerte: hk.basiswerte, produkte: new Set(hebelZiel.map((z) => z.slice(0, 12))).size, zeilen: hebelZiel.length, geschaefte: geschaefteH, geholt: iso };
        console.log(`Hebelkurse ${d}: ${hebelZiel.length} Zeilen (${geschaefteH} Geschäfte) von ${index.hebelkurse[d].produkte} Produkten auf ${hk.basiswerte} Basiswerte.`);
      }
    }
  }
}

// ---------- Marktumfeld: VIX-Schlusskurse (CBOE, eine CSV mit der ganzen Geschichte) ----------
async function umfeld() {
  const uc = JSON.parse(readFileSync(join(process.cwd(), 'config', 'umfeld.json'), 'utf8')) as { vixUrl: string };
  const r = await fetch(uc.vixUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/csv' }, signal: AbortSignal.timeout(60000) });
  if (r.status !== 200) throw new Error(`VIX: HTTP ${r.status}`);
  const vix = parseVixCsv(await r.text());
  if (vix.length < 1000) throw new Error(`VIX: nur ${vix.length} Tage`);
  const datei = join(ARCHIV, 'stamm', 'umfeld.json.gz');
  const alt = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as UmfeldArchiv) : null;
  if (JSON.stringify(alt?.vix) !== JSON.stringify(vix)) {
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify({ stand: iso, vix } satisfies UmfeldArchiv), 'utf8'), { level: 9 }));
    neu.push('stamm/umfeld');
  }
  index.umfeld = { vixTage: vix.length, vixLetzterTag: vix[vix.length - 1]?.[0] ?? null, geholt: iso };
  console.log(`Marktumfeld: VIX ${vix.length} Tage bis ${index.umfeld.vixLetzterTag}.`);
}

// ---------- Krypto-Umfeld: Fear & Greed (alternative.me, frei mit Quellenangabe) und Stablecoin-Menge (DefiLlama, frei) ----------
// Je Abruf die ganze Geschichte (zwei kleine Antworten); gespeichert nur, wenn sich etwas geändert hat.
async function kryptoumfeld() {
  const holen = async (url: string) => {
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (r.status !== 200) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
    return r.json();
  };
  const angst = parseAngst(await holen('https://api.alternative.me/fng/?limit=0&format=json'));
  const stable = parseStablecoins(await holen('https://stablecoins.llama.fi/stablecoincharts/all'));
  if (angst.length < 1000 || stable.length < 1000) throw new Error(`Krypto-Umfeld unvollständig (Fear & Greed ${angst.length}, Stablecoins ${stable.length} Tage)`);
  const datei = join(ARCHIV, 'stamm', 'krypto-umfeld.json.gz');
  const alt = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as KryptoUmfeldArchiv) : null;
  if (JSON.stringify([alt?.angst, alt?.stable]) !== JSON.stringify([angst, stable])) {
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify({ stand: iso, angst, stable } satisfies KryptoUmfeldArchiv), 'utf8'), { level: 9 }));
    neu.push('stamm/krypto-umfeld');
  }
  index.kryptoUmfeld = { angstTage: angst.length, angstBis: angst[angst.length - 1]?.[0] ?? null, stableTage: stable.length, stableBis: stable[stable.length - 1]?.[0] ?? null, geholt: iso };
  console.log(`Krypto-Umfeld: Fear & Greed ${angst.length} Tage bis ${index.kryptoUmfeld.angstBis}, Stablecoins ${stable.length} Tage bis ${index.kryptoUmfeld.stableBis}.`);
}

// ---------- Leerverkaufsvolumen (FINRA Reg SHO, eine frei abrufbare Datei je US-Handelstag) ----------
// Neueste zuerst; der tägliche Lauf holt höchstens LEER_MAX_TAGE (Standard 15) fehlende Tage und füllt so die zwei
// Jahre nach und nach auf, historie.yml (teile=leerverkauf) holt alles auf einmal.
async function leerverkauf() {
  const heute = iso.slice(0, 10);
  const ab = istDatum(process.env.LEER_AB?.trim()) ? process.env.LEER_AB!.trim() : tagPlus(heute, -Math.round(2 * 365.25) - 5);
  const max = Number(process.env.LEER_MAX_TAGE) > 0 ? Math.floor(Number(process.env.LEER_MAX_TAGE)) : 15;
  const idx = (index.leerverkauf ??= {});
  const tage: string[] = [];
  for (let d = tagPlus(heute, -1); d >= ab && tage.length < max; d = tagPlus(d, -1)) {
    const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wt === 0 || wt === 6 || nyseFeiertage.has(d) || idx[d] || existsSync(pfad('leerverkauf', d))) continue;
    tage.push(d);
  }
  let geholt = 0;
  let fehlt = 0;
  for (const d of tage) {
    const r = await fetch(`https://cdn.finra.org/equity/regsho/daily/${finraDatei(d)}`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    if (r.status === 200) {
      const m = parseFinraShvol(await r.text());
      if (m.size < 1000) throw new Error(`FINRA ${d}: nur ${m.size} Werte`);
      ablegen('leerverkauf', d, leerverkaufCsv(m));
      idx[d] = { werte: m.size, geholt: iso };
      geholt++;
    } else if (r.status === 403 || r.status === 404) {
      fehlt++;
      // älter als eine Woche und immer noch nicht da → gibt es nicht (z. B. Börse geschlossen), nicht jedes Mal neu fragen
      if (d < tagPlus(heute, -7)) idx[d] = { werte: 0, geholt: iso };
    } else throw new Error(`FINRA ${d}: HTTP ${r.status}`);
    await pause(250);
  }
  const da = Object.keys(idx).filter((d) => idx[d].werte > 0).sort();
  console.log(`Leerverkauf (FINRA): ${geholt} Tage geholt, ${fehlt} nicht vorhanden; Archiv: ${da.length} Tage (${da[0] ?? '–'} bis ${da[da.length - 1] ?? '–'}).`);
}

// ---------- Leerverkaufsbestand (FINRA Equity Short Interest, zwei Stichtage im Monat, frei abrufbar) ----------
// Neueste zuerst. Je Stichtag eine Datei (rund 22.500 Werte, ~2,7 MB); der Zeitpunkt der Veröffentlichung kommt aus
// Last-Modified und steht in der Archivdatei – der Rückblick nutzt einen Stichtag erst ab diesem Tag.
async function leerbestand() {
  const heute = iso.slice(0, 10);
  const ab = tagPlus(heute, -Math.round(2 * 365.25) - 45);
  const max = Number(process.env.LEERBESTAND_MAX) > 0 ? Math.floor(Number(process.env.LEERBESTAND_MAX)) : 60;
  const idx = (index.leerbestand ??= {});
  const usHandelstag = (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) && !nyseFeiertage.has(d);
  // Halbmonate von heute rückwärts; je Halbmonat die Kandidaten (Regeltag zuerst)
  const halbmonate: string[][] = [];
  for (let j = Number(heute.slice(0, 4)), m = Number(heute.slice(5, 7)); `${j}-${String(m).padStart(2, '0')}-31` >= ab; m === 1 ? ((m = 12), j--) : m--) {
    const [mitte, ende] = stichtagKandidaten(j, m, usHandelstag);
    for (const k of [ende, mitte]) if (k.length && k[0] < heute && k[0] >= ab) halbmonate.push(k);
  }
  let geholt = 0;
  let offen = 0;
  for (const kandidaten of halbmonate) {
    if (geholt >= max) break;
    if (kandidaten.some((d) => idx[d] || existsSync(pfad('leerbestand', d)))) continue;
    let gefunden = false;
    for (const d of kandidaten) {
      const r = await fetch(`https://cdn.finra.org/equity/otcmarket/biweekly/shrt${d.replace(/-/g, '')}.csv`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(120000) });
      await pause(150);
      if (r.status === 403 || r.status === 404) {
        await r.arrayBuffer().catch(() => undefined);
        continue;
      }
      if (r.status !== 200) throw new Error(`FINRA-Bestand ${d}: HTTP ${r.status}`);
      const m = parseFinraShortInterest(await r.text());
      if (m.size < 5000) throw new Error(`FINRA-Bestand ${d}: nur ${m.size} Werte`);
      const lm = Date.parse(r.headers.get('last-modified') ?? '');
      const veroeffentlicht = Number.isFinite(lm) ? new Date(lm).toISOString() : null;
      ablegen('leerbestand', d, leerbestandCsv(m, veroeffentlicht));
      idx[d] = { werte: m.size, veroeffentlicht, geholt: iso };
      geholt++;
      gefunden = true;
      break;
    }
    if (!gefunden) {
      offen++;
      // 30 Tage nach dem Regeltag immer noch nichts → gibt es nicht, nicht jedes Mal neu fragen
      if (kandidaten[0] < tagPlus(heute, -30)) idx[kandidaten[0]] = { werte: 0, veroeffentlicht: null, geholt: iso };
    }
  }
  const da = Object.keys(idx).filter((d) => idx[d].werte > 0).sort();
  console.log(`Leerverkaufsbestand (FINRA): ${geholt} Stichtage geholt, ${offen} noch nicht veröffentlicht; Archiv: ${da.length} Stichtage (${da[0] ?? '–'} bis ${da[da.length - 1] ?? '–'}).`);
}

// ---------- F4: Aktienzahl je US-Firma (SEC XBRL frames, frei; Kontaktadresse wie bei den Zahlen-Terminen) ----------
// Eine Abfrage je Quartal liefert das Deckblatt-Datum und die ausstehenden Aktien aller Firmen. Fehlende Quartale ab zwei
// Jahren vor heute einmal, das laufende und das vorige Quartal bei jedem Lauf neu (sie füllen sich mit jeder Meldung).
async function aktienzahl() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt || !kontakt.includes('@')) {
    console.log('Aktienzahl (SEC): SEC_KONTAKT fehlt – übersprungen.');
    return;
  }
  const datei = join(ARCHIV, 'stamm', 'us-aktienzahl.json.gz');
  const a: AktienzahlArchiv = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as AktienzahlArchiv) : { stand: iso, frames: {}, je: {} };
  const heute = iso.slice(0, 10);
  const alle = framesBis(tagPlus(heute, -Math.round(2 * 365.25) - 120), heute);
  const neu = alle.filter((f, i) => !a.frames[f] || i >= alle.length - 2);
  let werte = 0;
  for (const f of neu) {
    const r = await fetch(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/${f}.json`, { headers: { 'User-Agent': `Schattendepot-Forschung ${kontakt}`, Accept: 'application/json' }, signal: AbortSignal.timeout(120000) });
    await pause(300);
    if (r.status === 404) {
      await r.arrayBuffer().catch(() => undefined);
      continue;
    }
    if (r.status !== 200) throw new Error(`Aktienzahl ${f}: HTTP ${r.status}`);
    werte += frameEinarbeiten(a, frameLesen(await r.json()));
    a.frames[f] = iso;
  }
  a.stand = iso;
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(a), 'utf8'), { level: 9 }));
  const gesamt = Object.values(a.je).reduce((s, l) => s + l.length, 0);
  index.aktienzahl = { firmen: Object.keys(a.je).length, werte: gesamt, frames: Object.keys(a.frames).length, geholt: iso };
  console.log(`Aktienzahl (SEC-Frames): ${neu.length} Quartale abgefragt, ${werte} neue Werte; Archiv: ${Object.keys(a.je).length} Firmen, ${gesamt} Werte.`);
}

// ---------- F3: Studien-Termine (ClinicalTrials.gov API v2, frei) – täglicher Schnappschuss je Biotech-Firma ----------
// Nur anhängen: studien/JJJJ/<Tag>.json.gz { Kürzel: [nct, phase, status, ende, endeArt][] }. Der Rückblick darf nur
// Schnappschüsse ≤ Stichtag nutzen (die API kennt nur den heutigen Stand). Firmen: SIC Biotech/Pharma/Medizintechnik aus
// stamm/us-zahlen.json.gz, Name aus company_tickers.json der SEC.
async function studien() {
  const heute = iso.slice(0, 10);
  if (existsSync(pfad('studien', heute))) return console.log('Studien: heutiger Schnappschuss schon da.');
  const kontakt = process.env.SEC_KONTAKT?.trim();
  const zf = join(ARCHIV, 'stamm', 'us-zahlen.json.gz');
  if (!kontakt || !existsSync(zf)) return console.log('Studien: SEC_KONTAKT oder Zahlen-Archiv fehlt – übersprungen.');
  const za = JSON.parse(gunzipSync(readFileSync(zf)).toString('utf8')) as ZahlenArchiv;
  const tr = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': `Schattendepot-Forschung ${kontakt}` }, signal: AbortSignal.timeout(60000) });
  if (tr.status !== 200) throw new Error(`company_tickers: HTTP ${tr.status}`);
  const titel = new Map<string, string>();
  for (const e of Object.values((await tr.json()) as Record<string, { cik_str: number; title: string }>)) titel.set(String(e.cik_str), e.title);
  const firmen = Object.entries(za.firmen).filter(([, f]) => istBiotech(f.sic) && f.tickers.length);
  const aus: Record<string, [string, string, string, string | null, string | null][]> = {};
  let anfragen = 0;
  let mit = 0;
  let zahl = 0;
  const frist = Date.now() + 15 * 60000;
  for (const [cik, f] of firmen) {
    if (Date.now() > frist) break;
    const name = sponsorName(titel.get(String(Number(cik))) ?? '');
    if (name.length < 3) continue;
    const url = `https://clinicaltrials.gov/api/v2/studies?query.lead=${encodeURIComponent(name)}&fields=NCTId,OverallStatus,PrimaryCompletionDate,PrimaryCompletionDateType,Phase&pageSize=100`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(30000) }).catch(() => null);
    anfragen++;
    await pause(350);
    if (!r || r.status !== 200) {
      await r?.arrayBuffer().catch(() => undefined);
      continue;
    }
    const st: Studie[] = studienLesen(await r.json());
    if (!st.length) continue;
    mit++;
    zahl += st.length;
    for (const t of f.tickers) aus[t] = st.map((s) => [s.nct, s.phase, s.status, s.ende, s.endeArt]);
  }
  if (anfragen < firmen.length * 0.8) return console.log(`Studien: nur ${anfragen} von ${firmen.length} Firmen abgefragt – kein Schnappschuss (nächster Lauf).`);
  ablegen('studien', heute, JSON.stringify(aus));
  (index.studien ??= {})[heute] = { firmen: firmen.length, mitStudien: mit, studien: zahl, geholt: iso };
  console.log(`Studien (ClinicalTrials.gov): ${firmen.length} Biotech-Firmen, ${mit} mit Phase-2/3-Studien, ${zahl} Studien.`);
}

// ---------- Hebelprodukte je Basiswert (ESMA FIRDS, Quantensprung B Stufe 1) ----------
// Wöchentliche Vollliste der Klasse R (samstags, ~19 Teile à ~9 MB gezippt, je ~470 MB XML in einer Zeile): nur wenn es
// eine neue gibt, stückweise über `unzip -p` gelesen. Gezählt je US-Basiswert: Calls/Puts an gettex (MUND) und am
// größten anderen deutschen Platz. Danach die Basiswert-ISINs per OpenFIGI einem US-Kürzel zuordnen (10 je Anfrage,
// höchstens 25 Anfragen je Minute ohne Schlüssel), mit Zeitgrenze – der Rest im nächsten Lauf.
async function hebel() {
  const hc = { gettexMic: 'MUND', andereMics: ['STUB', 'STUH', 'FRAB', 'XFRA', 'XSTU', 'EUWX', 'HAND', 'HAMB', 'BERB', 'DUSB'], minuten: 8, ...(cfg as { hebel?: object }).hebel } as { gettexMic: string; andereMics: string[]; minuten: number };
  const heute = iso.slice(0, 10);
  const frist = Math.min(Date.now() + hc.minuten * 60000, performance.timeOrigin + 34 * 60000);
  const datei = join(ARCHIV, 'stamm', 'gettex-hebel.json.gz');
  const produkteDatei = join(ARCHIV, 'stamm', 'gettex-produkte.json.gz');
  let stand = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as { stand: string; quelle: string; basiswerte: Record<string, HebelStand> }) : null;
  // 1. neueste Vollliste
  const r = await fetch('https://registers.esma.europa.eu/solr/esma_registers_firds_files/select?q=file_name:FULINS_R*&fq=file_type:FULINS&sort=publication_date%20desc&wt=json&start=0&rows=80&fl=file_name,publication_date,download_link', { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
  if (r.status !== 200) throw new Error(`FIRDS-Liste: HTTP ${r.status}`);
  const docs = ((await r.json()) as { response: { docs: { file_name: string; publication_date: string; download_link: string }[] } }).response.docs;
  const neuest = docs[0]?.publication_date.slice(0, 10) ?? null;
  const teile = docs.filter((d) => d.publication_date.slice(0, 10) === neuest).sort((a, b) => a.file_name.localeCompare(b.file_name));
  const soll = Number(/of(\d+)\.zip$/.exec(teile[0]?.file_name ?? '')?.[1] ?? 0);
  if (neuest && (stand?.quelle !== neuest || !existsSync(produkteDatei))) {
    if (!soll || teile.length !== soll) throw new Error(`FIRDS ${neuest}: ${teile.length} von ${soll} Teilen gelistet – nächster Lauf`);
    const leser = new FirdsLeser(heute);
    const zaehler = new HebelZaehler(hc.gettexMic, new Set(hc.andereMics));
    const gp = new GettexProdukte(hc.gettexMic);
    let produkte = 0;
    for (const t of teile) {
      const z = await fetch(t.download_link, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(180000) });
      if (z.status !== 200) throw new Error(`FIRDS ${t.file_name}: HTTP ${z.status}`);
      const tmp = join(ARCHIV, '..', 'firds-teil.zip');
      writeFileSync(tmp, Buffer.from(await z.arrayBuffer()));
      const kind = spawn('unzip', ['-p', tmp]);
      kind.stdout.setEncoding('utf8');
      for await (const stueck of kind.stdout as AsyncIterable<string>)
        for (const pr of leser.teil(stueck))
          if (pr.basis.startsWith('US')) {
            zaehler.add(pr);
            gp.add(pr);
            produkte++;
          }
      rmSync(tmp, { force: true });
    }
    stand = { stand: iso, quelle: neuest, basiswerte: zaehler.ergebnis() };
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(stand), 'utf8'), { level: 9 }));
    neu.push('stamm/gettex-hebel');
    // B Stufe 2a: Produkt-ISINs an gettex je Basiswert (für die Mitschrift der Hebelkurse im gettex-Teil)
    const gpe = gp.ergebnis();
    writeFileSync(produkteDatei, gzipSync(Buffer.from(JSON.stringify({ stand: iso, quelle: neuest, produkte: gpe }), 'utf8'), { level: 9 }));
    neu.push('stamm/gettex-produkte');
    console.log(`gettex-Produkte (FIRDS ${neuest}): ${Object.values(gpe).reduce((a, l) => a + l.length, 0)} an gettex auf ${Object.keys(gpe).length} US-Basiswerte.`);
    console.log(`Hebelprodukte (FIRDS ${neuest}): ${produkte} Einträge auf US-Basiswerte an deutschen Plätzen, ${Object.keys(stand.basiswerte).length} Basiswerte.`);
  }
  // 2. Zuordnung ISIN → US-Kürzel (null = OpenFIGI kennt kein US-Kürzel)
  const zf = join(ARCHIV, 'stamm', 'isin-kuerzel.json');
  const zu: Record<string, string | null> = existsSync(zf) ? (JSON.parse(readFileSync(zf, 'utf8')) as Record<string, string | null>) : {};
  const offen = Object.keys(stand?.basiswerte ?? {}).filter((i) => !(i in zu));
  let neuZu = 0;
  for (let i = 0; i < offen.length && Date.now() < frist; i += 10) {
    const teil = offen.slice(i, i + 10);
    const a = await fetch('https://api.openfigi.com/v3/mapping', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT }, body: JSON.stringify(teil.map((isin) => ({ idType: 'ID_ISIN', idValue: isin, exchCode: 'US' }))), signal: AbortSignal.timeout(30000) });
    if (a.status === 429) {
      await pause((Number(a.headers.get('ratelimit-reset')) || 60) * 1000 + 500);
      i -= 10;
      continue;
    }
    if (a.status !== 200) throw new Error(`OpenFIGI-Zuordnung: HTTP ${a.status}`);
    const j = (await a.json()) as { data?: { ticker?: string; marketSector?: string }[] }[];
    teil.forEach((isin, k) => {
      const d = (j[k]?.data ?? []).find((x) => x.marketSector === 'Equity') ?? j[k]?.data?.[0];
      zu[isin] = d?.ticker ? d.ticker.toUpperCase().replace(/[ /]/g, '.') : null;
      neuZu++;
    });
    await pause(2600);
  }
  if (neuZu) {
    writeFileSync(zf, JSON.stringify(zu));
    neu.push('stamm/isin-kuerzel');
  }
  const zugeordnet = Object.keys(stand?.basiswerte ?? {}).filter((i) => zu[i]).length;
  index.hebel = { quelle: stand?.quelle ?? null, basiswerte: Object.keys(stand?.basiswerte ?? {}).length, zugeordnet, offen: offen.length - neuZu, geholt: iso };
  console.log(`Hebelprodukte: Liste ${stand?.quelle ?? '–'}, ${index.hebel.basiswerte} US-Basiswerte, ${zugeordnet} einem Kürzel zugeordnet, ${index.hebel.offen} noch offen (${neuZu} in diesem Lauf).`);
}

// ---------- Insider-Käufe (SEC Formular 4): Quartals-Datensätze für die Geschichte, einzelne Meldungen danach ----------
async function insider() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt || !kontakt.includes('@')) {
    console.log('Insider (SEC): SEC_KONTAKT fehlt – übersprungen.');
    return;
  }
  const ic = { jahre: 2, mindestWert: 10000, abstandMs: 160, maxMeldungen: 2500, minuten: 18, taeglich: true, ...(cfg as { insider?: object }).insider } as { jahre: number; mindestWert: number; abstandMs: number; maxMeldungen: number; minuten: number; taeglich: boolean };
  // Einzelne Formular-4-Tage nur, wenn eingeschaltet (config insider.taeglich) oder ausdrücklich verlangt (INSIDER_TAEGLICH=1)
  const taeglich = ic.taeglich || process.env.INSIDER_TAEGLICH === "1";
  const max = Number(process.env.INSIDER_MAX) > 0 ? Math.floor(Number(process.env.INSIDER_MAX)) : ic.maxMeldungen;
  // Zeitgrenze: höchstens `minuten` für die einzelnen Tage und nie über die Laufzeit des ganzen Jobs hinaus
  // (archiv.yml bricht nach 40 Min. ab – dann wäre auch Gesichertes anderer Teile verloren)
  const minuten = Number(process.env.INSIDER_MINUTEN) > 0 ? Number(process.env.INSIDER_MINUTEN) : ic.minuten;
  const gesamt = Number(process.env.ARCHIV_MINUTEN) > 0 ? Number(process.env.ARCHIV_MINUTEN) : 34;
  const frist = Math.min(Date.now() + minuten * 60000, performance.timeOrigin + gesamt * 60000);
  const ua = `Schattendepot-Forschung ${kontakt}`;
  const datei = join(ARCHIV, 'stamm', 'insider.json.gz');
  const heute = iso.slice(0, 10);
  const gestern = tagPlus(heute, -1);
  const start = tagPlus(heute, -Math.round(ic.jahre * 365.25) - 30);
  const a: InsiderArchiv = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as InsiderArchiv) : { stand: iso, ab: null, bis: null, quartale: [], tage: [], kaeufe: {} };
  const vorher = JSON.stringify({ ...a, stand: '' });
  let anfragen = 0;
  let naechste = 0;
  const holen = async (url: string) => {
    const slot = Math.max(Date.now(), naechste);
    naechste = slot + ic.abstandMs;
    if (slot > Date.now()) await pause(slot - Date.now());
    anfragen++;
    const r = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(120000) });
    if (r.status === 403 || r.status === 429) throw new Error(`SEC lehnt ab (HTTP ${r.status})`);
    return r;
  };

  // Lehnt die SEC ab (403/429), wird nicht alles verworfen: Bis dahin Geholtes (ganze Quartale, ganze Tage) wird
  // gesichert, der Fehler danach gemeldet – der nächste Lauf macht dort weiter (Lehre aus dem 16.11.: 88 Min. verloren)
  let fehler: Error | null = null;
  // 1. Quartals-Datensätze (lückenlos ab dem Start-Quartal, bis die SEC keinen neueren hat)
  const aktuell = quartalVon(heute);
  let quartaleNeu = 0;
  try {
  for (const q of quartaleZwischen(start, heute)) {
    if (q === aktuell || a.quartale.includes(q)) continue;
    let zip: Buffer | null = null;
    for (const ordner of ['structureddata', 'datastandardsinnovation']) {
      const r = await holen(`https://www.sec.gov/files/${ordner}/data/insider-transactions-data-sets/${q}_form345.zip`);
      if (r.status === 200) {
        zip = Buffer.from(await r.arrayBuffer());
        break;
      }
    }
    if (!zip) break; // noch nicht veröffentlicht → später
    const tmp = join(ARCHIV, '..', `insider-${q}.zip`);
    writeFileSync(tmp, zip);
    const liste = execFileSync('unzip', ['-Z1', tmp], { encoding: 'utf8' }).split('\n').map((x) => x.trim());
    const finde = (name: string) => liste.find((x) => x.toUpperCase().endsWith(name));
    const sub = finde('SUBMISSION.TSV');
    const tr = finde('NONDERIV_TRANS.TSV');
    if (!sub || !tr) throw new Error(`Insider ${q}: Tabellen fehlen (${liste.join(', ')})`);
    const lies = (n: string) => execFileSync('unzip', ['-p', tmp, n], { encoding: 'utf8', maxBuffer: 1e9 });
    const { kaeufe, fehlt } = kaeufeAusDatensatz(lies(sub), lies(tr), ic.mindestWert);
    rmSync(tmp, { force: true });
    if (fehlt.length) throw new Error(`Insider ${q}: Spalten fehlen: ${fehlt.join(', ')}`);
    a.kaeufe = kaeufeVereinen(a.kaeufe, kaeufe);
    a.quartale.push(q);
    a.quartale.sort();
    quartaleNeu++;
    console.log(`Insider ${q}: ${[...kaeufe.values()].reduce((s, l) => s + l.length, 0)} Käufe ab ${ic.mindestWert} $ bei ${kaeufe.size} Kürzeln.`);
  }
  } catch (e) {
    fehler = e as Error;
  }
  // Abdeckung durch Quartale: lückenlos vom ersten an
  let quartalBis: string | null = null;
  const erste = quartaleZwischen(start, heute)[0];
  for (const q of quartaleZwischen(start, heute)) {
    if (!a.quartale.includes(q)) break;
    quartalBis = quartalsEnde(q);
  }
  a.ab = a.quartale.includes(erste) ? `${erste.slice(0, 4)}-${['01-01', '04-01', '07-01', '10-01'][Number(erste.slice(5)) - 1]}` : null;

  // 2. Danach Tag für Tag: Formular-4-Meldungen aus dem EDGAR-Tagesverzeichnis (mit Annahmezeit)
  let tageNeu = 0;
  let meldungen = 0;
  if (quartalBis && !fehler && !taeglich) console.log("Insider (SEC): einzelne Tage abgeschaltet (config insider.taeglich) – nur Quartals-Datensätze.");
  if (quartalBis && !fehler && taeglich) {
    try {
    for (let tag = tagPlus(quartalBis, 1); tag <= gestern; tag = tagPlus(tag, 1)) {
      const wt = new Date(`${tag}T12:00:00Z`).getUTCDay();
      if (wt === 0 || wt === 6 || a.tage.includes(tag)) continue;
      const q = Math.floor((Number(tag.slice(5, 7)) - 1) / 3) + 1;
      const r = await holen(`https://www.sec.gov/Archives/edgar/daily-index/${tag.slice(0, 4)}/QTR${q}/form.${tag.replace(/-/g, '')}.idx`);
      if (r.status === 404 && tag < gestern) {
        a.tage.push(tag); // Feiertag
        continue;
      }
      if (r.status !== 200) {
        if (tag < gestern) console.log(`Insider ${tag}: Tagesverzeichnis HTTP ${r.status} – nächster Lauf.`);
        break; // gestern noch nicht veröffentlicht
      }
      const dateien = formular4Dateien(await r.text());
      // Ganzer Tag passt nicht mehr ins Kontingent → nächster Lauf. Der erste Tag eines Laufs wird immer versucht –
      // sonst bliebe ein Tag mit mehr Meldungen als das Kontingent für immer hängen (16.11.: 2.10. nie geholt)
      if (tageNeu > 0 && anfragen + dateien.length > max) break;
      if (Date.now() + dateien.length * ic.abstandMs > frist) {
        console.log(`Insider ${tag}: ${dateien.length} Meldungen passen zeitlich nicht mehr – nächster Lauf.`);
        break;
      }
      const tagStart = Date.now();
      const neu = new Map<string, [string, string, number][]>();
      // 3 Abrufe gleichzeitig, gemeinsam gedrosselt (holen hält den Abstand) – sonst bremst die Antwortzeit auf ~3/s
      let pos = 0;
      let zeitUm = false;
      const arbeiter = async () => {
        while (pos < dateien.length) {
          if (Date.now() > frist) {
            zeitUm = true;
            return;
          }
          const f = dateien[pos++];
          let m = await holen(`https://www.sec.gov/Archives/${f}`);
          // vorübergehende Fehler (z. B. 503) einmal wiederholen – sonst fehlen Käufe an diesem Tag
          if (m.status !== 200) {
            await pause(1500);
            m = await holen(`https://www.sec.gov/Archives/${f}`);
          }
          if (m.status !== 200) continue;
          const k = kaufAusMeldung(await m.text(), ic.mindestWert);
          meldungen++;
          if (k) (neu.get(k.kuerzel) ?? neu.set(k.kuerzel, []).get(k.kuerzel)!).push([k.datum, k.zeit, k.wert]);
        }
      };
      await Promise.all([arbeiter(), arbeiter(), arbeiter()]);
      if (zeitUm) {
        // halber Tag wird verworfen (zählt nicht als erfasst); das Tempo zeigt, ob die SEC drosselt
        const s = (Date.now() - tagStart) / 1000;
        console.log(`Insider ${tag}: Zeit um nach ${pos} von ${dateien.length} Meldungen (${(pos / Math.max(s, 1)).toFixed(1)} je s) – nächster Lauf.`);
        break;
      }
      // erst nach dem ganzen Tag übernehmen – ein halber Tag zählt nicht als erfasst
      a.kaeufe = kaeufeVereinen(a.kaeufe, neu);
      a.tage.push(tag);
      tageNeu++;
    }
    } catch (e) {
      fehler = e as Error;
    }
    a.tage.sort();
  }
  // Abdeckung insgesamt: Quartale, dann lückenlos die Werktage danach
  let bis = quartalBis;
  if (bis) for (let tag = tagPlus(bis, 1); tag <= gestern; tag = tagPlus(tag, 1)) {
    const wt = new Date(`${tag}T12:00:00Z`).getUTCDay();
    if (wt === 0 || wt === 6) {
      bis = tag;
      continue;
    }
    if (!a.tage.includes(tag)) break;
    bis = tag;
  }
  a.bis = bis;
  if (JSON.stringify({ ...a, stand: '' }) !== vorher) {
    a.stand = iso;
    mkdirSync(dirname(datei), { recursive: true });
    writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(a), 'utf8'), { level: 9 }));
    neu.push('stamm/insider');
  }
  const kaeufeZahl = Object.values(a.kaeufe).reduce((s, l) => s + l.length, 0);
  index.insider = { kaeufe: kaeufeZahl, kuerzel: Object.keys(a.kaeufe).length, quartale: a.quartale.length, tage: a.tage.length, ab: a.ab, bis: a.bis, geholt: iso };
  console.log(`Insider (SEC): ${quartaleNeu} Quartale, ${tageNeu} Tage (${meldungen} Formular-4-Meldungen gelesen), ${anfragen} Anfragen; Stand: ${kaeufeZahl} Käufe bei ${Object.keys(a.kaeufe).length} Kürzeln, lückenlos ${a.ab ?? '–'} bis ${a.bis ?? '–'}.${fehler ? ' Abgebrochen – Geholtes ist gesichert.' : ''}`);
  if (fehler) throw fehler;
}


// ---------- Quantensprung 3: Kontext-Geschichte (config/kontext.json, core/volltreffer/kontext.ts) ----------
interface KontextConfig {
  ab: string;
  gdelt: { url: string; pauseMs: number; themen: Thema[] };
  aufmerksamkeit: { wikidata: string; pageviews: string; parallel: number; pauseMs: number; tageZurueck: number; laufzeitMinuten: number; coins: Record<string, string> };
  weltgeschehen: { api: string; stabilTage: number; maxTageJeLauf: number; pauseMs: number };
  amtsblatt: { url: string; reihen: { id: string; name: string; bedingung: string }[] };
}
const kcfg = () => JSON.parse(readFileSync(join(process.cwd(), 'config', 'kontext.json'), 'utf8')) as KontextConfig;
const ymd = (d: string) => d.replace(/-/g, '');
const stammLesen = <T>(datei: string, standard: T): T => {
  const p = join(ARCHIV, 'stamm', datei);
  return existsSync(p) ? (JSON.parse(gunzipSync(readFileSync(p)).toString('utf8')) as T) : standard;
};
const stammSchreiben = (datei: string, inhalt: unknown) => {
  const p = join(ARCHIV, 'stamm', datei);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, gzipSync(Buffer.from(JSON.stringify(inhalt), 'utf8'), { level: 9 }));
};
/** Wikimedia verlangt einen User-Agent mit Kontakt (Kontaktadresse aus dem Secret, nie ins Log) */
const wikiKopf = () => {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  return kontakt ? { 'User-Agent': `Schattendepot-Forschung/1.0 (private Boersen-Simulation; ${kontakt})`, Accept: 'application/json' } : null;
};

/** Abruf mit Geduld: bei 429/5xx/Zeitüberschreitung bis zu `versuche` Mal mit wachsender Pause; zählt Antworten je Status. */
const statusZahl: Record<string, number> = {};
async function geduldig(url: string, kopf: Record<string, string>, o: { zeitMs: number; versuche: number; warteMs: number }): Promise<Response | null> {
  for (let v = 1; v <= o.versuche; v++) {
    const r = await fetch(url, { headers: kopf, signal: AbortSignal.timeout(o.zeitMs) }).catch(() => null);
    const k = r ? String(r.status) : 'keine Antwort';
    statusZahl[k] = (statusZahl[k] ?? 0) + 1;
    if (r && r.status !== 429 && r.status < 500) return r;
    await r?.arrayBuffer().catch(() => undefined);
    if (v < o.versuche) await pause(o.warteMs * v);
  }
  return null;
}

/** GDELT: Tagesvolumen je Thema seit kontext.ab (ein Abruf je Thema liefert die ganze Reihe). */
async function themen() {
  const c = kcfg();
  const heute = iso.slice(0, 10);
  const alt = stammLesen<{ themen: Record<string, { treffer: Tagesreihe; gesamt: Tagesreihe }> }>('themen.json.gz', { themen: {} });
  let ok = 0;
  for (const t of c.gdelt.themen) {
    // Reihe schon lang (über 600 Tage)? Dann reichen die letzten 45 Tage – kürzere Antworten, weniger Drosselung
    const vorhanden = Object.keys(alt.themen[t.id]?.treffer ?? {}).length;
    const von = vorhanden > 600 ? tagPlus(heute, -45) : c.ab;
    const url = `${c.gdelt.url}?query=${encodeURIComponent(t.gdelt)}&mode=timelinevolraw&format=json&startdatetime=${ymd(von)}000000&enddatetime=${ymd(heute)}235959&timelinesmooth=0`;
    // schon heute geholt? (GDELT drosselt stark – lieber über mehrere Läufe verteilen)
    if (alt.themen[t.id] && (alt as { geholt?: Record<string, string> }).geholt?.[t.id] === heute) {
      ok++;
      continue;
    }
    const r = await geduldig(url, { 'User-Agent': USER_AGENT }, { zeitMs: 150000, versuche: 2, warteMs: 60000 });
    await pause(c.gdelt.pauseMs);
    if (!r || r.status !== 200) {
      console.log(`Themen: ${t.id} – ${r ? `HTTP ${r.status}` : 'keine Antwort'}`);
      await r?.arrayBuffer().catch(() => undefined);
      continue;
    }
    const text = await r.text();
    let j: unknown = null;
    try {
      j = JSON.parse(text);
    } catch {
      console.log(`Themen: ${t.id} – keine JSON-Antwort (${text.slice(0, 80).replace(/\s+/g, ' ')})`);
      continue;
    }
    const neu = gdeltLesen(j);
    if (!Object.keys(neu.treffer).length) continue;
    // ältere Tage behalten, neue Werte gehen vor
    const a = alt.themen[t.id] ?? { treffer: {}, gesamt: {} };
    alt.themen[t.id] = { treffer: { ...a.treffer, ...neu.treffer }, gesamt: { ...a.gesamt, ...neu.gesamt } };
    ((alt as { geholt?: Record<string, string> }).geholt ??= {})[t.id] = heute;
    ok++;
    stammSchreiben('themen.json.gz', { stand: iso, themen: alt.themen, geholt: (alt as { geholt?: Record<string, string> }).geholt });
  }
  console.log(`Themen: Antworten je Status ${JSON.stringify(statusZahl)}`);
  if (!ok) throw new Error('GDELT lieferte für kein Thema Daten');
  const tage = new Set(Object.values(alt.themen).flatMap((x) => Object.keys(x.treffer)));
  const bis = [...tage].sort().pop() ?? null;
  index.themen = { themen: Object.keys(alt.themen).length, tage: tage.size, bis, geholt: iso };
  console.log(`Themen (GDELT): ${ok} von ${c.gdelt.themen.length} Themen geholt, ${tage.size} Tage bis ${bis}.`);
}

/** Federal Register: Dokumente je Tag (Präsidenten-Dokumente, Zölle, Sanktionen, Exportkontrollen). */
async function amtsblatt() {
  const c = kcfg();
  const reihen: Record<string, Tagesreihe> = {};
  for (const r0 of c.amtsblatt.reihen) {
    const url = `${c.amtsblatt.url}?${r0.bedingung}&conditions[publication_date][gte]=${c.ab}`;
    const r = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(60000) }).catch(() => null);
    await pause(500);
    if (!r || r.status !== 200) {
      console.log(`Amtsblatt: ${r0.id} – ${r ? `HTTP ${r.status}` : 'keine Antwort'}`);
      await r?.arrayBuffer().catch(() => undefined);
      continue;
    }
    reihen[r0.id] = amtsblattLesen(await r.json());
  }
  if (!Object.keys(reihen).length) throw new Error('Federal Register lieferte keine Reihe');
  stammSchreiben('amtsblatt.json.gz', { stand: iso, reihen });
  const tage = new Set(Object.values(reihen).flatMap((x) => Object.keys(x)));
  const bis = [...tage].sort().pop() ?? null;
  index.amtsblatt = { reihen: Object.keys(reihen).length, tage: tage.size, bis, geholt: iso };
  console.log(`Amtsblatt (Federal Register): ${Object.keys(reihen).length} Reihen, ${tage.size} Tage bis ${bis}.`);
}

/** Wikipedia „Portal:Current events“: stabile Tage als Tagesdatei (nur anhängen), junge Tage in stamm/weltgeschehen-aktuell. */
async function weltgeschehen() {
  const c = kcfg();
  const kopf = wikiKopf();
  if (!kopf) return console.log('Weltgeschehen: SEC_KONTAKT fehlt (Wikimedia verlangt einen Kontakt im User-Agent) – übersprungen.');
  const heute = iso.slice(0, 10);
  const MONATE = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const seite = (d: string) => `Portal:Current_events/${d.slice(0, 4)}_${MONATE[Number(d.slice(5, 7)) - 1]}_${Number(d.slice(8, 10))}`;
  const holen = async (d: string): Promise<Ereignis[] | null> => {
    const url = `${c.weltgeschehen.api}?action=parse&format=json&prop=wikitext&formatversion=2&page=${encodeURIComponent(seite(d))}`;
    const r = await fetch(url, { headers: kopf, signal: AbortSignal.timeout(30000) }).catch(() => null);
    await pause(c.weltgeschehen.pauseMs);
    if (!r || r.status !== 200) {
      await r?.arrayBuffer().catch(() => undefined);
      return null;
    }
    const j = (await r.json().catch(() => null)) as { parse?: { wikitext?: string }; error?: { code?: string } } | null;
    if (j?.error?.code === 'missingtitle') return [];
    return typeof j?.parse?.wikitext === 'string' ? weltgeschehenLesen(j.parse.wikitext) : null;
  };
  let neuTage = 0;
  let ereignisse = 0;
  // stabile Tage (älter als stabilTage), die noch fehlen
  for (let d = c.ab; d <= tagPlus(heute, -c.weltgeschehen.stabilTage) && neuTage < c.weltgeschehen.maxTageJeLauf; d = tagPlus(d, 1)) {
    if (existsSync(pfad('weltgeschehen', d))) continue;
    const e = await holen(d);
    if (!e) continue;
    ablegen('weltgeschehen', d, JSON.stringify(e));
    neuTage++;
    ereignisse += e.length;
  }
  // junge Tage: jedes Mal neu
  const aktuell: Record<string, Ereignis[]> = {};
  for (let i = c.weltgeschehen.stabilTage - 1; i >= 0; i--) {
    const d = tagPlus(heute, -i);
    const e = await holen(d);
    if (e) aktuell[d] = e;
  }
  stammSchreiben('weltgeschehen-aktuell.json.gz', { stand: iso, tage: aktuell });
  const alle = existsSync(join(ARCHIV, 'weltgeschehen')) ? readdirSync(join(ARCHIV, 'weltgeschehen')).flatMap((j) => readdirSync(join(ARCHIV, 'weltgeschehen', j))).length : 0;
  index.weltgeschehen = { tage: alle, ereignisse: (index.weltgeschehen?.ereignisse ?? 0) + ereignisse, bis: Object.keys(aktuell).sort().pop() ?? null, geholt: iso };
  console.log(`Weltgeschehen (Wikipedia): ${neuTage} neue Tage (${ereignisse} Ereignisse), ${alle} Tage im Archiv, junge Tage ${Object.keys(aktuell).length}.`);
}

/** Wikipedia-Seitenaufrufe je Firma/Coin: Zuordnung (Wikidata, wöchentlich), Nachtrag ganzer Reihen, täglicher Stand. */
async function aufmerksamkeit() {
  const c = kcfg();
  const kopf = wikiKopf();
  if (!kopf) return console.log('Aufmerksamkeit: SEC_KONTAKT fehlt (Wikimedia verlangt einen Kontakt im User-Agent) – übersprungen.');
  const a = c.aufmerksamkeit;
  const frist = Date.now() + a.laufzeitMinuten * 60000;
  const heute = iso.slice(0, 10);
  // 1. Zuordnung Kürzel → Artikel (US-Börsen über Wikidata), höchstens wöchentlich neu
  let karte = stammLesen<{ stand: string; kuerzel: Record<string, string> }>('wiki-artikel.json.gz', { stand: '', kuerzel: {} });
  if (!karte.stand || tagPlus(karte.stand.slice(0, 10), 7) <= heute) {
    const sparql = `SELECT ?ticker ?artikel WHERE { ?firma p:P414 ?st . ?st ps:P414 ?boerse ; pq:P249 ?ticker . ?boerse wdt:P17 wd:Q30 . ?artikel schema:about ?firma ; schema:isPartOf <https://en.wikipedia.org/> . FILTER NOT EXISTS { ?st pq:P582 ?ende } }`;
    const r = await fetch(`${a.wikidata}?format=json&query=${encodeURIComponent(sparql)}`, { headers: { ...kopf, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(120000) }).catch(() => null);
    if (r?.status === 200) {
      const k = wikidataKuerzel(await r.json());
      if (Object.keys(k).length > 1000) karte = { stand: iso, kuerzel: k };
      console.log(`Aufmerksamkeit: Wikidata ordnet ${Object.keys(k).length} US-Kürzel einem Artikel zu.`);
    } else console.log(`Aufmerksamkeit: Wikidata ${r ? `HTTP ${r.status}` : 'keine Antwort'} – alte Zuordnung bleibt.`);
    await r?.arrayBuffer().catch(() => undefined);
    if (karte.stand) stammSchreiben('wiki-artikel.json.gz', karte);
  }
  // nur Kürzel, die das US-Archiv kennt (SEC-Firmen) – plus die Coins aus der Liste
  const zf = join(ARCHIV, 'stamm', 'us-zahlen.json.gz');
  const bekannt = new Set<string>();
  if (existsSync(zf)) for (const f of Object.values((JSON.parse(gunzipSync(readFileSync(zf)).toString('utf8')) as ZahlenArchiv).firmen)) for (const t of f.tickers) bekannt.add(t.toUpperCase());
  const artikel = new Set<string>([...Object.entries(karte.kuerzel).filter(([t]) => !bekannt.size || bekannt.has(t)).map(([, x]) => x), ...Object.values(a.coins)]);
  const geholt = new Set(stammLesen<string[]>('wiki-geholt.json.gz', []));
  const reihe = async (art: string, von: string, bis: string): Promise<Tagesreihe | null> => {
    const r = await geduldig(`${a.pageviews}/${encodeURIComponent(art)}/daily/${ymd(von)}00/${ymd(bis)}00`, kopf, { zeitMs: 30000, versuche: 3, warteMs: 3000 });
    if (!r) return null;
    if (r.status === 404) {
      await r.arrayBuffer().catch(() => undefined);
      return {};
    }
    if (r.status !== 200) {
      await r.arrayBuffer().catch(() => undefined);
      return null;
    }
    return aufrufeLesen(await r.json());
  };
  const parallel = async (liste: string[], f: (x: string) => Promise<void>) => {
    let i = 0;
    await Promise.all(
      Array.from({ length: a.parallel }, async () => {
        while (i < liste.length && Date.now() < frist) {
          const x = liste[i++];
          await f(x);
          await pause(a.pauseMs);
        }
      }),
    );
  };
  // 2. Nachtrag: ganze Reihe seit kontext.ab für jeden neuen Artikel (fortsetzbar)
  const gestern = tagPlus(heute, -1);
  const offen = [...artikel].filter((x) => !geholt.has(x)).sort();
  const nachtrag: Record<string, Tagesreihe> = {};
  await parallel(offen, async (art) => {
    const r = await reihe(art, c.ab, gestern);
    if (r) {
      nachtrag[art] = r;
      geholt.add(art);
    }
  });
  if (Object.keys(nachtrag).length) {
    let n = 1;
    while (existsSync(pfad('aufmerksamkeit-nachtrag', `${heute}-${n}`))) n++;
    ablegen('aufmerksamkeit-nachtrag', `${heute}-${n}`, JSON.stringify(nachtrag));
    stammSchreiben('wiki-geholt.json.gz', [...geholt].sort());
  }
  // 3. täglicher Stand: die letzten tageZurueck Tage für alle geholten Artikel – Datei nach dem neuesten Tag benannt
  const probe = await reihe('Bitcoin', tagPlus(heute, -3), heute);
  const neuester = Object.keys(probe ?? {}).sort().pop();
  let tagesZahl = 0;
  if (neuester && !existsSync(pfad('aufmerksamkeit', neuester)) && Date.now() < frist) {
    const stand: Record<string, Tagesreihe> = {};
    const liste = [...geholt].sort();
    await parallel(liste, async (art) => {
      const r = await reihe(art, tagPlus(neuester, -(a.tageZurueck - 1)), neuester);
      if (r && Object.keys(r).length) stand[art] = r;
    });
    // nur ablegen, wenn (fast) alle durchkamen – sonst holt der nächste Lauf den Tag neu
    if (Object.keys(stand).length >= liste.length * 0.8) {
      ablegen('aufmerksamkeit', neuester, JSON.stringify(stand));
      tagesZahl = Object.keys(stand).length;
    } else console.log(`Aufmerksamkeit: Tagesstand ${neuester} nur für ${Object.keys(stand).length} von ${liste.length} Artikeln – nächster Lauf.`);
  }
  index.aufmerksamkeit = { zugeordnet: artikel.size, mitReihe: geholt.size, offen: artikel.size - geholt.size, bis: neuester ?? null, geholt: iso, zuordnung: karte.stand };
  console.log(`Aufmerksamkeit: Antworten je Status ${JSON.stringify(statusZahl)}`);
  console.log(`Aufmerksamkeit (Wikipedia): ${artikel.size} Artikel zugeordnet, ${Object.keys(nachtrag).length} Reihen nachgetragen (${artikel.size - geholt.size} offen), Tagesstand ${tagesZahl ? `${neuester} für ${tagesZahl} Artikel` : 'unverändert'}.`);
}

// ---------- Zeitlupe (Q1, Nutzer 20.11.2026): Minutenkerzen der Tage mit großem Tageshoch ----------
// Massive Basic liefert Minutenkerzen über 2 Jahre (5 Abrufe je Minute). Geholt werden der Tag, an dem das Tageshoch
// mindestens schwelleHoch % über dem Vortagesschluss lag, und der Folgetag – genau die Tage, an denen ein Einstieg im
// Tagesverlauf überhaupt hätte auslösen können (Auswahl nach dem Hoch, nicht nach dem Schluss: kein Blick nach vorn).
// Neueste Tage zuerst, je Lauf höchstens laufzeitMinuten. Ablage privat je Tag: { KÜRZEL: [[Minute seit 0 Uhr UTC des
// Tages, o, h, l, c, v], …] } (Minute kann über 1440 gehen = Folgetag). Logs und öffentlicher Stand nur in Zählungen.
async function minuten() {
  const key = process.env.MASSIVE_API_KEY?.trim();
  if (!key) {
    console.log('Zeitlupe: MASSIVE_API_KEY fehlt – übersprungen.');
    return;
  }
  const mc = cfg.minuten ?? { schwelleHoch: 15, minKurs: 0.1, maxFaktor: 5, mitOtc: false, pauseSekunden: 13, laufzeitMinuten: 40, ab: '' };
  const laufzeit = Number(process.env.MINUTEN_LAUFZEIT ?? mc.laufzeitMinuten);
  const ende = Date.now() + laufzeit * 60000;
  const tage = Object.keys(index.us).filter((d) => index.us[d].werte && existsSync(pfad('us', d))).sort();
  // Ereignisse aus den Tagesdateien: Hoch ≥ Vortagesschluss × (1 + schwelle), ohne Ausreißer (unbereinigte Splits)
  const ereignisse: { d: string; d1: string; t: string }[] = [];
  let vor: Map<string, { c: number }> | null = null;
  for (let i = 0; i < tage.length; i++) {
    const tag = parseUsArchiv(gunzipSync(readFileSync(pfad('us', tage[i]))).toString('utf8'));
    if (vor && i + 1 < tage.length && (!mc.ab || tage[i] >= mc.ab)) {
      for (const k of tag.values()) {
        if (k.otc && !mc.mitOtc) continue;
        const p = vor.get(k.ticker);
        if (!p || !(p.c >= mc.minKurs) || !(k.v > 0)) continue;
        const f = k.h / p.c;
        if (f >= 1 + mc.schwelleHoch / 100 && f <= mc.maxFaktor) ereignisse.push({ d: tage[i], d1: tage[i + 1], t: k.ticker });
      }
    }
    vor = tag;
  }
  const ordner = join(ARCHIV, 'minuten');
  const fertigPfad = join(ordner, 'fertig.json');
  const fertig = new Set<string>(existsSync(fertigPfad) ? (JSON.parse(readFileSync(fertigPfad, 'utf8')) as string[]) : []);
  // Reihenfolge: feste Zufallsmischung über die zwei Jahre (Streuung über alle Marktlagen statt nur der jüngsten Wochen –
  // 92.000 Tage sind bei 5 Abrufen je Minute nicht in Wochen zu holen, eine gleichmäßige Stichprobe trägt schon nach wenigen Tausend)
  // Polynom-Hash plus Durchmischung (murmur3-Finalisierer) – ohne sie bestimmt das Datum die oberen Bits und die
  // „Zufallsreihenfolge“ holte ganze Tage am Stück (Befund 20.11.: 952 Ereignisse aus nur 28 Tagen)
  const misch = (x: string) => {
    let h = [...x].reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 17);
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  };
  const offen = ereignisse.filter((e) => !fertig.has(`${e.d}|${e.t}`)).sort((a, b) => misch(`${a.d}|${a.t}`) - misch(`${b.d}|${b.t}`));
  const dateiVon = (d: string) => join(ordner, d.slice(0, 4), `${d}.json.gz`);
  const cache = new Map<string, Record<string, number[][]>>();
  const tagDatei = (d: string) => {
    if (!cache.has(d)) cache.set(d, existsSync(dateiVon(d)) ? (JSON.parse(gunzipSync(readFileSync(dateiVon(d))).toString('utf8')) as Record<string, number[][]>) : {});
    return cache.get(d)!;
  };
  const sichern = () => {
    for (const [d, inhalt] of cache) {
      mkdirSync(dirname(dateiVon(d)), { recursive: true });
      writeFileSync(dateiVon(d), gzipSync(Buffer.from(JSON.stringify(inhalt), 'utf8'), { level: 9 }));
    }
    mkdirSync(ordner, { recursive: true });
    writeFileSync(fertigPfad, JSON.stringify([...fertig].sort()));
  };
  let geholt = 0;
  let leer = 0;
  let sperren = 0;
  for (const e of offen) {
    if (Date.now() > ende) break;
    if (geholt + leer > 0) await pause(mc.pauseSekunden * 1000);
    const url = `${cfg.us.host}/v2/aggs/ticker/${encodeURIComponent(e.t)}/range/1/minute/${e.d}/${e.d1}?adjusted=false&sort=asc&limit=50000`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (!r) continue;
    if (r.status === 429) {
      if (++sperren > 3) break;
      await pause(65000);
      continue;
    }
    if (r.status === 403) throw new Error(`Zeitlupe: HTTP 403 (${e.d}) – Tarif oder Schlüssel`);
    if (r.status !== 200) continue;
    const j = (await r.json().catch(() => null)) as { results?: { t: number; o: number; h: number; l: number; c: number; v: number }[] } | null;
    const basis = Date.parse(`${e.d}T00:00:00Z`);
    const kerzen = (j?.results ?? []).map((x) => [Math.round((x.t - basis) / 60000), x.o, x.h, x.l, x.c, Math.round(x.v)]);
    if (kerzen.length) {
      tagDatei(e.d)[e.t] = kerzen;
      geholt++;
    } else leer++;
    fertig.add(`${e.d}|${e.t}`);
    if ((geholt + leer) % 50 === 0) sichern();
  }
  sichern();
  const rest = offen.length - geholt - leer;
  index.minuten = { ereignisse: fertig.size, tage: new Set([...fertig].map((x) => x.split('|')[0])).size, offen: rest, leer: (index.minuten?.leer ?? 0) + leer, geholt: iso };
  console.log(`Zeitlupe: ${ereignisse.length} Tage mit Hoch ≥ +${mc.schwelleHoch} % (2 Jahre), ${geholt} neu geholt, ${leer} ohne Minuten, ${rest} offen.`);
}

// ---------- Q6 Leihgebühren (Interactive Brokers, öffentliches FTP) – ein Schnappschuss je Lauf ----------
async function leihe() {
  const zeit = iso.slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);
  const name = `${iso.slice(0, 10)}-${zeit.slice(8, 12)}`;
  const p = join(ARCHIV, 'leihe', iso.slice(0, 4), `${name}.csv.gz`);
  if (existsSync(p)) return;
  let text = '';
  for (let v = 1; v <= 3 && !text; v++) {
    try {
      text = execFileSync('curl', ['-s', '--max-time', '120', '--user', 'shortstock:', 'ftp://ftp2.interactivebrokers.com/usa.txt'], { encoding: 'utf8', maxBuffer: 1e8 });
    } catch {
      await pause(5000 * v);
    }
  }
  const l = leiheLesen(text);
  if (l.length < 1000) throw new Error(`Leihgebühren: nur ${l.length} Werte – Datei nicht erreichbar oder Format geändert`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, gzipSync(Buffer.from(leiheCsv(l), 'utf8'), { level: 9 }));
  neu.push(`leihe/${name}`);
  (index.leihe ??= {})[name] = { werte: l.length, geholt: iso };
  console.log(`Leihgebühren: ${l.length} US-Werte, ${l.filter((x) => x.gebuehr >= 20).length} mit Gebühr ab 20 %, ${l.filter((x) => x.verfuegbar === 0).length} nicht leihbar.`);
}

// ---------- Q7 Reddit/4chan-Nennungen (ApeWisdom) – ein Schnappschuss je Lauf ----------
async function reddit() {
  const zeit = iso.slice(11, 16).replace(':', '');
  const name = `${iso.slice(0, 10)}-${zeit}`;
  const p = join(ARCHIV, 'reddit', iso.slice(0, 4), `${name}.json.gz`);
  if (existsSync(p)) return;
  const hole = async (filter: string) => {
    const alle: Nennung[] = [];
    for (let seite = 1; seite <= 20; seite++) {
      if (seite > 1) await pause(1500);
      const r = await geduldig(`https://apewisdom.io/api/v1.0/filter/${filter}/page/${seite}`, { 'User-Agent': USER_AGENT, Accept: 'application/json' }, { zeitMs: 30000, versuche: 3, warteMs: 5000 });
      if (!r || r.status !== 200) break;
      const a = apewisdomLesen(await r.json().catch(() => null));
      alle.push(...a.nennungen);
      if (!a.nennungen.length || seite >= a.seiten) break;
    }
    return alle;
  };
  const aktien = await hole('all-stocks');
  const coins = await hole('all-crypto');
  if (aktien.length < 50) throw new Error(`ApeWisdom: nur ${aktien.length} Aktien – Dienst nicht erreichbar oder Format geändert`);
  const kompakt = (l: Nennung[]) => l.map((x) => [x.kuerzel, x.rang, x.nennungen, x.upvotes, x.rangVor24h, x.nennungenVor24h]);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, gzipSync(Buffer.from(JSON.stringify({ zeit: iso, felder: ['kuerzel', 'rang', 'nennungen', 'upvotes', 'rangVor24h', 'nennungenVor24h'], aktien: kompakt(aktien), coins: kompakt(coins) }), 'utf8'), { level: 9 }));
  neu.push(`reddit/${name}`);
  (index.reddit ??= {})[name] = { aktien: aktien.length, coins: coins.length, geholt: iso };
  console.log(`ApeWisdom: ${aktien.length} Aktien, ${coins.length} Coins mit Nennungen.`);
}

// ---------- Q2 Katalysator-Begriffe (SEC-Volltextsuche efts.sec.gov) ----------
// Je Begriff und Monat alle Treffer (Kürzel, Datum, Formular); fertige Monate werden nicht neu geholt, der laufende und der
// vorige Monat bei jedem Lauf. Privat: stamm/volltext.json.gz { stufe, monate: {id: [JJJJ-MM…]}, treffer: {id: {KÜRZEL: [Datum…]}} }.
async function volltext() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt) return console.log('Volltext (SEC): SEC_KONTAKT fehlt – übersprungen.');
  const kc = JSON.parse(readFileSync(join(process.cwd(), 'config', 'katalysatoren.json'), 'utf8')) as { stufe: number; ab: string; maxSeitenJeMonat: number; pauseMs: number; liste: Katalysator[] };
  const datei = join(ARCHIV, 'stamm', 'volltext.json.gz');
  type V = { stufe: number; monate: Record<string, string[]>; treffer: Record<string, Record<string, string[]>> };
  let v: V = existsSync(datei) ? (JSON.parse(gunzipSync(readFileSync(datei)).toString('utf8')) as V) : { stufe: kc.stufe, monate: {}, treffer: {} };
  if (v.stufe !== kc.stufe) v = { stufe: kc.stufe, monate: {}, treffer: {} };
  const kopf = { 'User-Agent': `Schattendepot-Forschung ${kontakt}`, Accept: 'application/json' };
  const jetztMonat = iso.slice(0, 7);
  const vorMonat = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 2, 15)).toISOString().slice(0, 7);
  const monate: string[] = [];
  for (let m = kc.ab.slice(0, 7); m <= jetztMonat; m = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 15)).toISOString().slice(0, 7)) monate.push(m);
  const ende = Date.now() + Number(process.env.VOLLTEXT_MINUTEN ?? 8) * 60000;
  let abrufe = 0, neuGezaehlt = 0, abgeschnitten = 0;
  for (const kat of kc.liste) {
    const fertig = new Set(v.monate[kat.id] ?? []);
    const je = (v.treffer[kat.id] ??= {});
    for (const m of monate) {
      if (Date.now() > ende) break;
      if (fertig.has(m) && m !== jetztMonat && m !== vorMonat) continue;
      const bis = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
      let ok = true;
      for (let seite = 0; seite < kc.maxSeitenJeMonat; seite++) {
        await pause(kc.pauseMs);
        abrufe++;
        const url = `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${kat.begriff}"`)}&forms=${kat.formen.join(',')}&dateRange=custom&startdt=${m}-01&enddt=${bis}&from=${seite * 100}`;
        const r = await geduldig(url, kopf, { zeitMs: 60000, versuche: 3, warteMs: 10000 });
        const a = r && r.status === 200 ? eftsLesen(await r.json().catch(() => null)) : null;
        if (!a) {
          ok = false;
          break;
        }
        for (const t of a.treffer)
          for (const k of t.kuerzel) {
            const l = (je[k] ??= []);
            if (!l.includes(t.datum)) (l.push(t.datum), neuGezaehlt++);
          }
        if ((seite + 1) * 100 >= a.gesamt || !a.treffer.length) break;
        if (seite + 1 === kc.maxSeitenJeMonat) abgeschnitten++;
      }
      if (ok) fertig.add(m);
    }
    v.monate[kat.id] = [...fertig].sort();
  }
  for (const je of Object.values(v.treffer)) for (const k of Object.keys(je)) je[k].sort();
  mkdirSync(dirname(datei), { recursive: true });
  writeFileSync(datei, gzipSync(Buffer.from(JSON.stringify(v), 'utf8'), { level: 9 }));
  const offen = kc.liste.reduce((s2, k) => s2 + monate.filter((m) => !(v.monate[k.id] ?? []).includes(m)).length, 0);
  const meldungen = Object.values(v.treffer).reduce((s2, je) => s2 + Object.values(je).reduce((a, l) => a + l.length, 0), 0);
  index.volltext = { begriffe: kc.liste.length, meldungen, kuerzel: new Set(Object.values(v.treffer).flatMap((je) => Object.keys(je))).size, monateOffen: offen, geholt: iso };
  console.log(`Volltext (SEC): ${abrufe} Abrufe, ${neuGezaehlt} neue Meldungen, ${meldungen} insgesamt, ${offen} Begriff-Monate offen${abgeschnitten ? `, ${abgeschnitten} Monate abgeschnitten (über ${kc.maxSeitenJeMonat * 100} Treffer)` : ''}. Antworten je Status ${JSON.stringify(statusZahl)}`);
}

const TEILE = [
  ['krypto', 'Krypto', krypto],
  ['us', 'US', us],
  ['gettex', 'gettex', gettex],
  ['kryptokerzen', 'Krypto-Tageskerzen', kryptoKerzen],
  ['ussplits', 'US-Splits', usSplits],
  ['stamm', 'Stammdaten', stamm],
  ['boersenwert', 'Börsenwert', boersenwert],
  ['zahlen', 'Zahlen-Termine (SEC)', zahlen],
  ['umfeld', 'Marktumfeld', umfeld],
  ['kryptoumfeld', 'Krypto-Umfeld', kryptoumfeld],
  ['leerverkauf', 'Leerverkauf (FINRA)', leerverkauf],
  ['leerbestand', 'Leerverkaufsbestand (FINRA)', leerbestand],
  ['hebel', 'Hebelprodukte (ESMA FIRDS)', hebel],
  ['insider', 'Insider-Käufe (SEC)', insider],
  ['aktienzahl', 'Aktienzahl (SEC-Frames)', aktienzahl],
  ['studien', 'Studien-Termine (ClinicalTrials.gov)', studien],
  ['themen', 'Themen der Weltnachrichten (GDELT)', themen],
  ['amtsblatt', 'Amtsblatt (Federal Register)', amtsblatt],
  ['weltgeschehen', 'Weltgeschehen (Wikipedia)', weltgeschehen],
  ['aufmerksamkeit', 'Aufmerksamkeit (Wikipedia-Aufrufe)', aufmerksamkeit],
  ['minuten', 'Zeitlupe (Minutenkerzen)', minuten],
  ['leihe', 'Leihgebühren (Interactive Brokers)', leihe],
  ['reddit', 'Reddit/4chan-Nennungen (ApeWisdom)', reddit],
  ['volltext', 'Katalysator-Begriffe (SEC-Volltextsuche)', volltext],
] as const;
for (const [schalter, name, lauf] of TEILE) {
  if (!NUR.has(schalter)) continue;
  try {
    await lauf();
  } catch (e) {
    const text = `${name}: ${(e as Error).message}`.replace(/Bearer\s+\S+/g, 'Bearer ***');
    fehler.push(text);
    console.error(`FEHLER ${text}`);
  }
}

index.stand = iso;
writeFileSync(indexPfad, JSON.stringify(index, null, 1) + '\n');

// Öffentlicher Stand: nur Zählungen, keine Kurse
const usTag = (d: string) => {
  const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
  return wt !== 0 && wt !== 6 && !nyseFeiertage.has(d);
};
const markt = <T extends object>(tage: Record<string, T>, zaehlt: (e: T) => boolean, pflicht: (d: string) => boolean) => {
  const da = Object.keys(tage).filter((d) => zaehlt(tage[d])).sort();
  const letzter = da[da.length - 1];
  return { letzterTag: letzter ?? null, tage: da.length, inFolge: tageInFolge(da, pflicht), ...(letzter ? { letzter: tage[letzter] } : {}) };
};
const stand = {
  stand: iso,
  hinweis: 'Stand des privaten Kursarchivs in Zählungen. Die Kurse selbst liegen nicht im öffentlichen Repo (nur private Nutzung gestattet).',
  gettex: markt(index.gettex, (e) => e.vollstaendig, istHandelstag),
  gettexUnvollstaendig: Object.keys(index.gettex).filter((d) => !index.gettex[d].vollstaendig).sort(),
  us: markt(index.us, (e) => !e.keinHandel && !e.ausserhalbTarif, usTag),
  krypto: markt(index.krypto, () => true, () => true),
  // Kursgeschichte für Rückblick und Zensus (Zählungen)
  historie: {
    usTage: Object.values(index.us).filter((e) => !e.keinHandel && !e.ausserhalbTarif).length,
    usAb: Object.keys(index.us).filter((d) => !index.us[d].keinHandel && !index.us[d].ausserhalbTarif).sort()[0] ?? null,
    usAusserhalbTarif: Object.values(index.us).filter((e) => e.ausserhalbTarif).length,
    kryptoKerzenTage: Object.keys(index.kryptoKerzen ?? {}).length,
    kryptoKerzenAb: Object.keys(index.kryptoKerzen ?? {}).sort()[0] ?? null,
    kryptoKerzenBis: Object.keys(index.kryptoKerzen ?? {}).sort().pop() ?? null,
    usSplits: index.usSplits?.eintraege ?? 0,
  },
  stamm: index.stamm ?? null,
  boersenwert: index.boersenwert ?? null,
  zahlen: index.usZahlen ?? null,
  umfeld: index.umfeld ?? null,
  insider: index.insider ?? null,
  leerverkauf: (() => {
    const da = Object.keys(index.leerverkauf ?? {}).filter((d) => index.leerverkauf![d].werte > 0).sort();
    return { tage: da.length, von: da[0] ?? null, bis: da[da.length - 1] ?? null };
  })(),
  kryptoUmfeld: index.kryptoUmfeld ?? null,
  hebel: index.hebel ?? null,
  leerbestand: (() => {
    const da = Object.keys(index.leerbestand ?? {}).filter((d) => index.leerbestand![d].werte > 0).sort();
    return { stichtage: da.length, von: da[0] ?? null, bis: da[da.length - 1] ?? null };
  })(),
  minuten: index.minuten ?? null,
  volltext: index.volltext ?? null,
  leihe: { schnappschuesse: Object.keys(index.leihe ?? {}).length, letzter: Object.keys(index.leihe ?? {}).sort().pop() ?? null },
  reddit: { schnappschuesse: Object.keys(index.reddit ?? {}).length, letzter: Object.keys(index.reddit ?? {}).sort().pop() ?? null },
  neu:neu.length > 40 ? [...neu.slice(0, 20), `… ${neu.length - 40} weitere …`, ...neu.slice(-20)] : neu,
  fehler,
};
console.log(`Archiv: neu ${neu.length > 12 ? `${neu.length} Dateien` : neu.join(', ') || '–'} · in Folge: gettex ${stand.gettex.inFolge}, US ${stand.us.inFolge}, Krypto ${stand.krypto.inFolge} · Historie: US ${stand.historie.usTage} Tage ab ${stand.historie.usAb ?? '–'}, Krypto-Kerzen ${stand.historie.kryptoKerzenTage} Tage${fehler.length ? ` · ${fehler.length} Fehler` : ''}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stand=${JSON.stringify(stand)}\n`);
if (process.env.ARCHIV_STAND_DATEI) writeFileSync(process.env.ARCHIV_STAND_DATEI, JSON.stringify(stand, null, 2) + '\n');
// Rot nur, wenn etwas schiefging UND nichts Neues abgelegt wurde – sonst würde der Commit der anderen Märkte ausbleiben
if (fehler.length && !neu.length) process.exitCode = 1;
