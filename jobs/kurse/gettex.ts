// gettex (Bayerische Börse): kostenlose, verzögerte Nachhandelsdaten nach Art. 13 MiFIR (spätestens 15 Min.).
// Alle 15 Minuten zwei Dateien (MUNC/MUND) mit jedem Geschäft: ISIN, Zeit (UTC), Währung, Kurs, Stück.
// Liefert echte Euro-Kurse nach ISIN für deutsche/EU-/US-Aktien, ETFs, ETNs und Hebelprodukte.
import { berlin } from '../../core/kalender.ts';
import type { Kurs } from '../../core/typen.ts';
import { holeText } from '../lib/netz.ts';

const SEITE = 'https://www.gettex.de/en/trading/delayed-data/posttrade-data/';

export interface GettexGeschaeft {
  isin: string;
  zeit: string;
  kurs: number;
}

/** Zeile „ISIN,HH:MM:SS.ffffff,EUR,Kurs,Stück“ → letztes Geschäft je ISIN (Datum aus dem Dateinamen). */
export function parseGettex(csv: string, datum: string, nur?: Set<string>): Map<string, GettexGeschaeft> {
  const letzte = new Map<string, GettexGeschaeft>();
  for (const zeile of csv.split('\n')) {
    const [isin, zeit, waehrung, kurs] = zeile.split(',');
    if (!isin || !zeit || waehrung !== 'EUR' || (nur && !nur.has(isin))) continue;
    const wert = Number(kurs);
    if (!(wert > 0)) continue;
    const iso = `${datum}T${zeit.slice(0, 12)}Z`;
    const alt = letzte.get(isin);
    if (!alt || iso >= alt.zeit) letzte.set(isin, { isin, zeit: iso, kurs: wert });
  }
  return letzte;
}

/** Dateiname „posttrade.20261021.19.00.mund.csv.gz“ → { datum: "2026-10-21", sortierschluessel } */
export function dateiInfo(url: string): { datum: string; schluessel: string } | null {
  const m = url.match(/posttrade\.(\d{4})(\d{2})(\d{2})\.(\d{2})\.(\d{2})\.(munc|mund)\.csv\.gz$/);
  return m ? { datum: `${m[1]}-${m[2]}-${m[3]}`, schluessel: `${m[1]}${m[2]}${m[3]}${m[4]}${m[5]}` } : null;
}

async function entpacken(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': 'Schattendepot/0.2 (private Boersen-Simulation)' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`gettex HTTP ${res.status}`);
  const strom = res.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Response(strom).text();
}

/**
 * Holt die neuesten Dateien (rückwärts, höchstens `maxFenster` 15-Minuten-Fenster), bis für alle gesuchten ISINs
 * ein Geschäft gefunden ist. Kurse tragen Zeitstempel und sind als verzögert gekennzeichnet.
 */
export async function gettexKurse(isins: string[], jetzt: Date, maxFenster = 8): Promise<Map<string, Kurs>> {
  const gesucht = new Set(isins);
  const ergebnis = new Map<string, Kurs>();
  if (!gesucht.size) return ergebnis;
  const html = await holeText(SEITE, { header: { Accept: 'text/html' } });
  const urls = [...new Set(html.match(/https:\/\/erdk\.bayerische-boerse\.de:8000\/[^"' ]+\.csv\.gz/g) ?? [])]
    .map((u) => ({ u, info: dateiInfo(u) }))
    .filter((x): x is { u: string; info: { datum: string; schluessel: string } } => !!x.info)
    .sort((a, b) => b.info.schluessel.localeCompare(a.info.schluessel));
  const fenster = [...new Set(urls.map((x) => x.info.schluessel))].slice(0, maxFenster);
  for (const f of fenster) {
    const offen = new Set([...gesucht].filter((i) => !ergebnis.has(i)));
    if (!offen.size) break;
    for (const { u, info } of urls.filter((x) => x.info.schluessel === f)) {
      for (const g of parseGettex(await entpacken(u), info.datum, offen).values()) {
        const alt = ergebnis.get(g.isin);
        if (alt && alt.zeit >= g.zeit) continue;
        const verzoegertMin = Math.max(0, Math.round((jetzt.getTime() - new Date(g.zeit).getTime()) / 60000));
        ergebnis.set(g.isin, { wert: g.kurs, zeit: g.zeit, quelle: 'gettex (verzögert, MiFIR)', verzoegertMin, hinweis: `letztes Geschäft ${berlin(new Date(g.zeit)).datum}` });
      }
    }
  }
  return ergebnis;
}
