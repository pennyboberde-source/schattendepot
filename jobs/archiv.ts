// Kursarchiv (Plan Volltreffer V1): holt je Markt die Sammelkurse eines Tages und legt sie als komprimierte
// Tagesdatei ins PRIVATE Repo schattendepot-archiv (Checkout unter ARCHIV_DIR, Standard _archiv).
// Aufruf: node jobs/archiv.ts   – der Lauf ist wiederholbar: Was schon da ist, wird nie überschrieben.
// Ins öffentliche Repo geht nur der Stand in Zählungen (Ausgabe „stand“ → archiv/stand.json im Datenzweig).
// Schalter (Umgebung): ARCHIV_NUR=krypto,us,gettex,kryptokerzen,ussplits (Standard: krypto,us,gettex – der tägliche Lauf).
//   US_AB=JJJJ-MM-TT und US_MAX_TAGE=n für den Rückblick (Kursgeschichte rückwärts, fortsetzbar – Workflow historie.yml).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const NUR = new Set((process.env.ARCHIV_NUR?.trim() || 'krypto,us,gettex,stamm,boersenwert').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean));
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

const TEILE = [
  ['krypto', 'Krypto', krypto],
  ['us', 'US', us],
  ['gettex', 'gettex', gettex],
  ['kryptokerzen', 'Krypto-Tageskerzen', kryptoKerzen],
  ['ussplits', 'US-Splits', usSplits],
  ['stamm', 'Stammdaten', stamm],
  ['boersenwert', 'Börsenwert', boersenwert],
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
  neu: neu.length > 40 ? [...neu.slice(0, 20), `… ${neu.length - 40} weitere …`, ...neu.slice(-20)] : neu,
  fehler,
};
console.log(`Archiv: neu ${neu.length > 12 ? `${neu.length} Dateien` : neu.join(', ') || '–'} · in Folge: gettex ${stand.gettex.inFolge}, US ${stand.us.inFolge}, Krypto ${stand.krypto.inFolge} · Historie: US ${stand.historie.usTage} Tage ab ${stand.historie.usAb ?? '–'}, Krypto-Kerzen ${stand.historie.kryptoKerzenTage} Tage${fehler.length ? ` · ${fehler.length} Fehler` : ''}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stand=${JSON.stringify(stand)}\n`);
if (process.env.ARCHIV_STAND_DATEI) writeFileSync(process.env.ARCHIV_STAND_DATEI, JSON.stringify(stand, null, 2) + '\n');
// Rot nur, wenn etwas schiefging UND nichts Neues abgelegt wurde – sonst würde der Commit der anderen Märkte ausbleiben
if (fehler.length && !neu.length) process.exitCode = 1;
