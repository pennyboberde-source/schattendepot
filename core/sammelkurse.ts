// Sammelkurse (Plan Volltreffer V1): je Markt EIN Abruf für alle Werte statt Einzelabrufe.
//   gettex: Tageskerzen je ISIN aus allen 15-Minuten-Dateien des Tages (nur echte Geschäfte mit Stückzahl)
//   US:     Massive „Daily Market Summary“ – alle US-Aktien eines Handelstags in einer Antwort
//   Krypto: Kraken-Ticker aller Paare (Stand und 24-Stunden-Werte)
// Reine Funktionen ohne Datei- und Netzzugriff. Die Rohkurse gehen ins PRIVATE Archiv, nie ins öffentliche Repo.
import { berlinZuUtc } from './kalender.ts';

// ---------- gettex ----------
export interface Tageskerze {
  o: number;
  h: number;
  l: number;
  c: number;
  stueck: number;
  /** Umsatz in Euro */
  umsatz: number;
  geschaefte: number;
  /** Zeit des ersten und letzten Geschäfts (UTC, HH:MM:SS) */
  von: string;
  bis: string;
}

/**
 * Zeilen „ISIN,HH:MM:SS.ffffff,Währung,Kurs,Stück“ einer Datei in die Tageskerzen einrechnen. Es zählen nur
 * Euro-Geschäfte mit Stückzahl: Die Dateien enthalten daneben Hunderttausende Zeilen mit Stück 0 (Kursstellungen
 * von Hebelprodukten, je ISIN einmal) – das sind keine Geschäfte. Alle Dateien müssen vom selben Tag sein.
 */
export function gettexZeilen(kerzen: Map<string, Tageskerze>, csv: string): number {
  let n = 0;
  for (const zeile of csv.split('\n')) {
    const [isin, zeit, waehrung, kursText, stueckText] = zeile.split(',');
    if (!isin || !zeit || waehrung !== 'EUR') continue;
    const kurs = Number(kursText);
    const stueck = Number(stueckText);
    if (!(kurs > 0) || !(stueck > 0)) continue;
    const t = zeit.slice(0, 8);
    const k = kerzen.get(isin);
    if (!k) kerzen.set(isin, { o: kurs, h: kurs, l: kurs, c: kurs, stueck, umsatz: kurs * stueck, geschaefte: 1, von: t, bis: t });
    else {
      if (t < k.von) Object.assign(k, { von: t, o: kurs });
      if (t >= k.bis) Object.assign(k, { bis: t, c: kurs });
      if (kurs > k.h) k.h = kurs;
      if (kurs < k.l) k.l = kurs;
      k.stueck += stueck;
      k.umsatz += kurs * stueck;
      k.geschaefte++;
    }
    n++;
  }
  return n;
}

const GETTEX_KOPF = 'isin,o,h,l,c,stueck,umsatz,geschaefte,von,bis';
const z = (x: number, stellen = 6) => String(Math.round(x * 10 ** stellen) / 10 ** stellen);

export function gettexCsv(kerzen: Map<string, Tageskerze>): string {
  const zeilen = [...kerzen.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([isin, k]) => [isin, z(k.o), z(k.h), z(k.l), z(k.c), z(k.stueck, 4), z(k.umsatz, 2), k.geschaefte, k.von, k.bis].join(','));
  return `${GETTEX_KOPF}\n${zeilen.join('\n')}\n`;
}

export function parseGettexArchiv(csv: string): Map<string, Tageskerze> {
  const m = new Map<string, Tageskerze>();
  for (const zeile of csv.split('\n').slice(1)) {
    const [isin, o, h, l, c, stueck, umsatz, geschaefte, von, bis] = zeile.split(',');
    if (isin) m.set(isin, { o: Number(o), h: Number(h), l: Number(l), c: Number(c), stueck: Number(stueck), umsatz: Number(umsatz), geschaefte: Number(geschaefte), von, bis });
  }
  return m;
}

/**
 * Sind alle 15-Minuten-Fenster eines Handelstags da? Die Dateinamen nennen das FENSTERENDE in UTC
 * (JJJJMMTTHHMM). Handelszeit in Berliner Zeit (gettex 07:30–23:00). gettex hält die Dateien nur etwa 24 Stunden vor.
 */
export function gettexTagStatus(schluessel: string[], datum: string, handel: { von: string; bis: string }): { fenster: number; erwartet: number; vollstaendig: boolean; erstesEnde: string } {
  const start = berlinZuUtc(datum, handel.von).getTime();
  const ende = berlinZuUtc(datum, handel.bis).getTime();
  const key = (ms: number) => new Date(ms).toISOString().replace(/[-T:]/g, '').slice(0, 12);
  const erwartet = Math.round((ende - start) / 900000);
  const da = new Set(schluessel.filter((s) => s >= key(start + 900000) && s <= key(ende)));
  return { fenster: da.size, erwartet, vollstaendig: da.has(key(start + 900000)) && da.has(key(ende)) && da.size >= Math.floor(erwartet * 0.95), erstesEnde: new Date(start + 900000).toISOString() };
}

// ---------- US (Massive, früher Polygon.io) ----------
export interface UsKerze {
  ticker: string;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Stück */
  v: number;
  /** volumengewichteter Durchschnittskurs */
  vw?: number;
  /** Zahl der Geschäfte */
  n?: number;
  otc?: boolean;
}

/** Antwort von /v2/aggs/grouped/locale/us/market/stocks/{datum}. Kein Handelstag → 0 Kerzen. */
export function parseMassive(json: unknown): { kerzen: UsKerze[]; bereinigt: boolean | null; fehler?: string } {
  const j = json as { status?: string; error?: string; message?: string; adjusted?: boolean; results?: Record<string, unknown>[] } | null;
  if (!j || typeof j !== 'object') return { kerzen: [], bereinigt: null, fehler: 'keine JSON-Antwort' };
  if (j.status === 'ERROR' || j.status === 'NOT_AUTHORIZED') return { kerzen: [], bereinigt: null, fehler: String(j.error ?? j.message ?? j.status) };
  const kerzen: UsKerze[] = [];
  for (const r of j.results ?? []) {
    const k = { ticker: String(r.T ?? ''), o: Number(r.o), h: Number(r.h), l: Number(r.l), c: Number(r.c), v: Number(r.v) };
    if (!k.ticker || !(k.c > 0) || !(k.o > 0) || !(k.h >= k.l)) continue;
    kerzen.push({ ...k, ...(typeof r.vw === 'number' ? { vw: r.vw } : {}), ...(typeof r.n === 'number' ? { n: r.n } : {}), ...(r.otc === true ? { otc: true } : {}) });
  }
  return { kerzen, bereinigt: typeof j.adjusted === 'boolean' ? j.adjusted : null };
}

const US_KOPF = 'ticker,o,h,l,c,v,vw,n,otc';

export function usCsv(kerzen: UsKerze[]): string {
  const zeilen = [...kerzen].sort((a, b) => a.ticker.localeCompare(b.ticker)).map((k) => [k.ticker, z(k.o), z(k.h), z(k.l), z(k.c), z(k.v, 2), k.vw === undefined ? '' : z(k.vw), k.n ?? '', k.otc ? 1 : ''].join(','));
  return `${US_KOPF}\n${zeilen.join('\n')}\n`;
}

export function parseUsArchiv(csv: string): Map<string, UsKerze> {
  const m = new Map<string, UsKerze>();
  for (const zeile of csv.split('\n').slice(1)) {
    const [ticker, o, h, l, c, v, vw, n, otc] = zeile.split(',');
    if (ticker) m.set(ticker, { ticker, o: Number(o), h: Number(h), l: Number(l), c: Number(c), v: Number(v), ...(vw ? { vw: Number(vw) } : {}), ...(n ? { n: Number(n) } : {}), ...(otc ? { otc: true } : {}) });
  }
  return m;
}

// ---------- Krypto (Kraken, alle Paare) ----------
export interface KryptoStand {
  /** Kraken-Paar, z. B. XXBTZEUR */
  paar: string;
  /** lesbarer Name, z. B. XBT/EUR (aus AssetPairs, falls bekannt) */
  name: string;
  letzter: number;
  geld: number;
  brief: number;
  /** Werte der letzten 24 Stunden vor dem Abruf */
  hoch24: number;
  tief24: number;
  volumen24: number;
  vwap24: number;
  geschaefte24: number;
  /** Eröffnung des laufenden UTC-Tags */
  eroeffnung: number;
}

/** Antwort von /0/public/Ticker ohne Paar-Angabe (alle Paare); `namen` aus /0/public/AssetPairs (wsname). */
export function parseKrakenAlle(json: unknown, namen: Record<string, string> = {}): { staende: KryptoStand[]; fehler?: string } {
  const j = json as { error?: string[]; result?: Record<string, Record<string, unknown>> } | null;
  if (!j || typeof j !== 'object' || !j.result) return { staende: [], fehler: j?.error?.join('; ') || 'keine JSON-Antwort' };
  if (j.error?.length) return { staende: [], fehler: j.error.join('; ') };
  const zahl = (x: unknown, i = 0) => Number(Array.isArray(x) ? x[i] : x);
  const staende: KryptoStand[] = [];
  for (const [paar, t] of Object.entries(j.result)) {
    const letzter = zahl(t.c);
    if (!(letzter > 0)) continue;
    staende.push({ paar, name: namen[paar] ?? '', letzter, geld: zahl(t.b), brief: zahl(t.a), hoch24: zahl(t.h, 1), tief24: zahl(t.l, 1), volumen24: zahl(t.v, 1), vwap24: zahl(t.p, 1), geschaefte24: zahl(t.t, 1), eroeffnung: zahl(t.o) });
  }
  return { staende };
}

const KRYPTO_KOPF = 'paar,name,letzter,geld,brief,hoch24,tief24,volumen24,vwap24,geschaefte24,eroeffnung';

export function kryptoCsv(staende: KryptoStand[]): string {
  const zeilen = [...staende].sort((a, b) => a.paar.localeCompare(b.paar)).map((s) => [s.paar, s.name, z(s.letzter, 10), z(s.geld, 10), z(s.brief, 10), z(s.hoch24, 10), z(s.tief24, 10), z(s.volumen24, 4), z(s.vwap24, 10), s.geschaefte24, z(s.eroeffnung, 10)].join(','));
  return `${KRYPTO_KOPF}\n${zeilen.join('\n')}\n`;
}

// ---------- Stand des Archivs (öffentlich: nur Zählungen) ----------
/** Wie viele „Pflichttage“ in Folge liegen bis zum jüngsten archivierten Tag lückenlos vor? */
export function tageInFolge(vorhanden: string[], istPflichttag: (datum: string) => boolean): number {
  const da = new Set(vorhanden);
  const letzter = [...da].sort().pop();
  if (!letzter) return 0;
  let n = 0;
  for (let d = letzter, i = 0; i < 400; i++) {
    if (da.has(d)) n++;
    else if (istPflichttag(d)) break;
    d = new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10);
  }
  return n;
}
