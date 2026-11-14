// Kursarchiv (Plan Volltreffer V1): holt je Markt die Sammelkurse eines Tages und legt sie als komprimierte
// Tagesdatei ins PRIVATE Repo schattendepot-archiv (Checkout unter ARCHIV_DIR, Standard _archiv).
// Aufruf: node jobs/archiv.ts   – der Lauf ist wiederholbar: Was schon da ist, wird nie überschrieben.
// Ins öffentliche Repo geht nur der Stand in Zählungen (Ausgabe „stand“ → archiv/stand.json im Datenzweig).
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { berlin, berlinZuUtc, istHandelstag } from '../core/kalender.ts';
import { gettexCsv, gettexTagStatus, gettexZeilen, kryptoCsv, parseKrakenAlle, parseMassive, tageInFolge, usCsv, type Tageskerze } from '../core/sammelkurse.ts';
import { gettexDateiLaden, gettexDateiliste } from './kurse/gettex.ts';
import { USER_AGENT } from './lib/netz.ts';

interface ArchivConfig {
  repo: string;
  gettex: { handelVon: string; handelBis: string; fertigNachMinuten: number; parallel: number };
  us: { host: string; ab: string; maxTageJeLauf: number; pauseSekunden: number; bereinigt: boolean; mitOtc: boolean };
  krypto: { host: string };
}
interface Index {
  stand?: string;
  gettex: Record<string, { isins: number; geschaefte: number; umsatz: number; fenster: number; erwartet: number; vollstaendig: boolean; geholt: string }>;
  us: Record<string, { werte?: number; otc?: number; bereinigt?: boolean; keinHandel?: boolean; geholt: string }>;
  krypto: Record<string, { paare: number; zeit: string }>;
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
  for (let d = cfg.us.ab; d < nyHeute; d = tagPlus(d, 1)) {
    const wt = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (wt === 0 || wt === 6 || nyseFeiertage.has(d) || index.us[d] || existsSync(pfad('us', d))) continue;
    offen.push(d);
  }
  let abrufe = 0;
  const abruf = async (d: string, otc: boolean) => {
    if (abrufe++ > 0) await pause(cfg.us.pauseSekunden * 1000);
    const url = `${cfg.us.host}/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=${cfg.us.bereinigt}${otc ? '&include_otc=true' : ''}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${key}`, 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60000) });
    return { status: r.status, json: (await r.json().catch(() => null)) as unknown };
  };
  let mitOtc = cfg.us.mitOtc;
  for (const d of offen.slice(0, cfg.us.maxTageJeLauf)) {
    let a = await abruf(d, mitOtc);
    // Der Gratis-Tarif kann den Zusatz „mit OTC“ ablehnen → ohne wiederholen und für den Rest des Laufs merken
    if (mitOtc && (a.status === 400 || a.status === 403)) {
      const ohne = await abruf(d, false);
      if (ohne.status === 200) mitOtc = false;
      a = ohne;
    }
    if (a.status === 403) {
      console.log(`US ${d}: noch nicht abrufbar (HTTP 403) – nächster Lauf.`);
      continue;
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
  if (offen.length > cfg.us.maxTageJeLauf) console.log(`US: ${offen.length - cfg.us.maxTageJeLauf} weitere Tage folgen im nächsten Lauf.`);
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

for (const [name, lauf] of [['Krypto', krypto], ['US', us], ['gettex', gettex]] as const) {
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
  us: markt(index.us, (e) => !e.keinHandel, usTag),
  krypto: markt(index.krypto, () => true, () => true),
  neu,
  fehler,
};
console.log(`Archiv: neu ${neu.join(', ') || '–'} · in Folge: gettex ${stand.gettex.inFolge}, US ${stand.us.inFolge}, Krypto ${stand.krypto.inFolge}${fehler.length ? ` · ${fehler.length} Fehler` : ''}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `stand=${JSON.stringify(stand)}\n`);
if (process.env.ARCHIV_STAND_DATEI) writeFileSync(process.env.ARCHIV_STAND_DATEI, JSON.stringify(stand, null, 2) + '\n');
// Rot nur, wenn etwas schiefging UND nichts Neues abgelegt wurde – sonst würde der Commit der anderen Märkte ausbleiben
if (fehler.length && !neu.length) process.exitCode = 1;
