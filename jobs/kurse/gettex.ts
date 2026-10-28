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

export interface Bewegung {
  isin: string;
  erster: number;
  letzter: number;
  geschaefte: number;
  umsatz: number;
  von: string;
  bis: string;
}

/** Alle Geschäfte mehrerer Dateien je ISIN verdichten: erster/letzter Kurs, Anzahl, Umsatz in EUR. */
export function aggregiere(dateien: { csv: string; datum: string }[]): Map<string, Bewegung> {
  const m = new Map<string, Bewegung>();
  for (const { csv, datum } of dateien) {
    for (const zeile of csv.split('\n')) {
      const [isin, zeit, waehrung, kurs, stueck] = zeile.split(',');
      const k = Number(kurs);
      if (!isin || waehrung !== 'EUR' || !(k > 0)) continue;
      const t = `${datum}T${(zeit ?? '').slice(0, 12)}Z`;
      const b = m.get(isin) ?? { isin, erster: k, letzter: k, geschaefte: 0, umsatz: 0, von: t, bis: t };
      if (t < b.von) Object.assign(b, { von: t, erster: k });
      if (t >= b.bis) Object.assign(b, { bis: t, letzter: k });
      b.geschaefte++;
      b.umsatz += k * (Number(stueck) || 0);
      m.set(isin, b);
    }
  }
  return m;
}

/** Kursraketen/-abstürze: starke Bewegung innerhalb des Fensters bei vielen Geschäften und Mindestumsatz. */
export function auffaellige(m: Map<string, Bewegung>, opt = { minProzent: 15, minGeschaefte: 15, minUmsatz: 20000, max: 10 }): (Bewegung & { prozent: number })[] {
  return [...m.values()]
    .map((b) => ({ ...b, prozent: (b.letzter / b.erster - 1) * 100 }))
    .filter((b) => Math.abs(b.prozent) >= opt.minProzent && b.geschaefte >= opt.minGeschaefte && b.umsatz >= opt.minUmsatz)
    .sort((a, b) => Math.abs(b.prozent) - Math.abs(a.prozent))
    .slice(0, opt.max);
}

/** Lädt die Dateien der letzten `fenster` 15-Minuten-Fenster (Standard: 1 Stunde). */
export async function gettexFenster(fenster = 4): Promise<{ csv: string; datum: string }[]> {
  const html = await holeText(SEITE, { header: { Accept: 'text/html' } });
  const urls = [...new Set(html.match(/https:\/\/erdk\.bayerische-boerse\.de:8000\/[^"' ]+\.csv\.gz/g) ?? [])]
    .map((u) => ({ u, info: dateiInfo(u) }))
    .filter((x): x is { u: string; info: { datum: string; schluessel: string } } => !!x.info)
    .sort((a, b) => b.info.schluessel.localeCompare(a.info.schluessel));
  const neueste = new Set([...new Set(urls.map((x) => x.info.schluessel))].slice(0, fenster));
  const out: { csv: string; datum: string }[] = [];
  for (const { u, info } of urls.filter((x) => neueste.has(x.info.schluessel))) out.push({ csv: await entpacken(u), datum: info.datum });
  return out;
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

export interface GettexDatei {
  url: string;
  /** Dateiname, z. B. posttrade.20261029.08.00.mund.csv.gz */
  name: string;
  datum: string;
  /** Fensterende JJJJMMTTHHMM (UTC) – der Dateiname nennt das ENDE des 15-Minuten-Fensters (live geprüft 28.10.2026) */
  schluessel: string;
  /** Fensterbeginn und -ende als ISO-Zeit (UTC) */
  beginn: string;
  ende: string;
}

/** Alle aktuell angebotenen Dateien (beide Segmente MUNC/MUND je 15-Minuten-Fenster), älteste zuerst. */
export async function gettexDateiliste(): Promise<GettexDatei[]> {
  const html = await holeText(SEITE, { header: { Accept: 'text/html' } });
  return [...new Set(html.match(/https:\/\/erdk\.bayerische-boerse\.de:8000\/[^"' ]+\.csv\.gz/g) ?? [])]
    .map((url) => {
      const info = dateiInfo(url);
      if (!info) return null;
      const s = info.schluessel;
      const ende = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:00.000Z`;
      return { url, name: url.split('/').pop()!, datum: info.datum, schluessel: s, beginn: new Date(Date.parse(ende) - 15 * 60000).toISOString(), ende };
    })
    .filter((x): x is GettexDatei => !!x)
    .sort((a, b) => a.schluessel.localeCompare(b.schluessel) || a.name.localeCompare(b.name));
}

export const gettexDateiLaden = (url: string) => entpacken(url);

/** Alle Geschäfte einer Datei (nur EUR), optional nur bestimmte ISINs. */
export function geschaefteAusCsv(csv: string, datum: string, nur?: Set<string>): { isin: string; zeit: string; kurs: number; stueck: number }[] {
  const out: { isin: string; zeit: string; kurs: number; stueck: number }[] = [];
  for (const zeile of csv.split('\n')) {
    const [isin, zeit, waehrung, kurs, stueck] = zeile.split(',');
    if (!isin || !zeit || waehrung !== 'EUR' || (nur && !nur.has(isin))) continue;
    const k = Number(kurs);
    if (k > 0) out.push({ isin, zeit: `${datum}T${zeit.slice(0, 12)}Z`, kurs: k, stueck: Number(stueck) || 0 });
  }
  return out;
}
