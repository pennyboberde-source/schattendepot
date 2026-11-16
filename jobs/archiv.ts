// Kursarchiv (Plan Volltreffer V1): holt je Markt die Sammelkurse eines Tages und legt sie als komprimierte
// Tagesdatei ins PRIVATE Repo schattendepot-archiv (Checkout unter ARCHIV_DIR, Standard _archiv).
// Aufruf: node jobs/archiv.ts   – der Lauf ist wiederholbar: Was schon da ist, wird nie überschrieben.
// Ins öffentliche Repo geht nur der Stand in Zählungen (Ausgabe „stand“ → archiv/stand.json im Datenzweig).
// Schalter (Umgebung): ARCHIV_NUR=krypto,us,gettex,stamm,boersenwert,zahlen,kryptokerzen,ussplits (Standard: krypto,us,gettex,stamm,boersenwert,zahlen – der tägliche Lauf).
//   ZAHLEN_MAX=n: höchstens so viele SEC-Abrufe in diesem Lauf (Standard aus config/archiv.json); SEC_KONTAKT: Kontaktadresse für den User-Agent.
//   US_AB=JJJJ-MM-TT und US_MAX_TAGE=n für den Rückblick (Kursgeschichte rückwärts, fortsetzbar – Workflow historie.yml).
import { execFileSync } from 'node:child_process';
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
import { parseVixCsv, type UmfeldArchiv } from '../core/volltreffer/umfeld.ts';
import { finraDatei, leerverkaufCsv, parseFinraShvol } from '../core/volltreffer/leerverkauf.ts';
import { leerbestandCsv, parseFinraShortInterest, stichtagKandidaten } from '../core/volltreffer/leerbestand.ts';
import { formular4Dateien, kaeufeAusDatensatz, kaeufeVereinen, kaufAusMeldung, quartaleZwischen, quartalsEnde, quartalVon, type InsiderArchiv } from '../core/volltreffer/insider.ts';
import { gettexDateiLaden, gettexDateiliste } from './kurse/gettex.ts';
import { USER_AGENT } from './lib/netz.ts';

interface ArchivConfig {
  repo: string;
  gettex: { handelVon: string; handelBis: string; fertigNachMinuten: number; parallel: number };
  us: { host: string; ab: string; maxTageJeLauf: number; pauseSekunden: number; bereinigt: boolean; mitOtc: boolean };
  krypto: { host: string };
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
  /** Leerverkaufsvolumen je US-Handelstag (leerverkauf/JJJJ/JJJJ-MM-TT.csv.gz); werte 0 = bei FINRA nicht vorhanden */
  leerverkauf?: Record<string, { werte: number; geholt: string }>;
  /** Leerverkaufsbestand je FINRA-Stichtag (leerbestand/JJJJ/JJJJ-MM-TT.csv.gz); werte 0 = bei FINRA nicht vorhanden */
  leerbestand?: Record<string, { werte: number; veroeffentlicht: string | null; geholt: string }>;
  /** Insider-Käufe (stamm/insider.json.gz) in Zählungen */
  insider?: { kaeufe: number; kuerzel: number; quartale: number; tage: number; ab: string | null; bis: string | null; geholt: string };
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
const NUR = new Set((process.env.ARCHIV_NUR?.trim() || 'krypto,us,gettex,stamm,boersenwert,zahlen,umfeld,leerverkauf,leerbestand,insider').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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

// ---------- gettex: Tageskerzen je ISIN aus allen 15-Minuten-Dateien ----------
async function gettex() {
  const b = berlin(jetzt);
  const tage = [tagPlus(b.datum, -1), b.datum].filter((d) => istHandelstag(d) && !index.gettex[d] && !existsSync(pfad('gettex', d)));
  if (!tage.length) return;
  const liste = await gettexDateiliste();
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
        }
      }),
    );
    if (!kerzen.size) throw new Error(`gettex ${d}: keine Geschäfte in ${dateien.length} Dateien`);
    const umsatz = Math.round([...kerzen.values()].reduce((a, k) => a + k.umsatz, 0));
    const vollstaendig = st.vollstaendig && abgelaufen === 0;
    if (ablegen('gettex', d, gettexCsv(kerzen))) index.gettex[d] = { isins: kerzen.size, geschaefte, umsatz, fenster: st.fenster, erwartet: st.erwartet, vollstaendig, geholt: iso };
    console.log(`gettex ${d}: ${kerzen.size} ISINs, ${geschaefte} Geschäfte, ${st.fenster} von ${st.erwartet} Fenstern${vollstaendig ? '' : ' (UNVOLLSTÄNDIG – frühe Fenster waren schon abgelaufen)'}.`);
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

// ---------- Insider-Käufe (SEC Formular 4): Quartals-Datensätze für die Geschichte, einzelne Meldungen danach ----------
async function insider() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt || !kontakt.includes('@')) {
    console.log('Insider (SEC): SEC_KONTAKT fehlt – übersprungen.');
    return;
  }
  const ic = { jahre: 2, mindestWert: 10000, abstandMs: 160, maxMeldungen: 2500, minuten: 18, ...(cfg as { insider?: object }).insider } as { jahre: number; mindestWert: number; abstandMs: number; maxMeldungen: number; minuten: number };
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
  if (quartalBis && !fehler) {
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
  ['leerverkauf', 'Leerverkauf (FINRA)', leerverkauf],
  ['leerbestand', 'Leerverkaufsbestand (FINRA)', leerbestand],
  ['insider', 'Insider-Käufe (SEC)', insider],
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
  leerbestand: (() => {
    const da = Object.keys(index.leerbestand ?? {}).filter((d) => index.leerbestand![d].werte > 0).sort();
    return { stichtage: da.length, von: da[0] ?? null, bis: da[da.length - 1] ?? null };
  })(),
  neu:neu.length > 40 ? [...neu.slice(0, 20), `… ${neu.length - 40} weitere …`, ...neu.slice(-20)] : neu,
  fehler,
};
console.log(`Archiv: neu ${neu.length > 12 ? `${neu.length} Dateien` : neu.join(', ') || '–'} · in Folge: gettex ${stand.gettex.inFolge}, US ${stand.us.inFolge}, Krypto ${stand.krypto.inFolge} · Historie: US ${stand.historie.usTage} Tage ab ${stand.historie.usAb ?? '–'}, Krypto-Kerzen ${stand.historie.kryptoKerzenTage} Tage${fehler.length ? ` · ${fehler.length} Fehler` : ''}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stand=${JSON.stringify(stand)}\n`);
if (process.env.ARCHIV_STAND_DATEI) writeFileSync(process.env.ARCHIV_STAND_DATEI, JSON.stringify(stand, null, 2) + '\n');
// Rot nur, wenn etwas schiefging UND nichts Neues abgelegt wurde – sonst würde der Commit der anderen Märkte ausbleiben
if (fehler.length && !neu.length) process.exitCode = 1;
