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

// ---------- Krypto-Tageskerzen (Kraken OHLC, UTC-Tage) – für Rückblick und Zensus ----------
export interface KryptoKerze {
  /** Kraken-Paar, z. B. XXBTZEUR */
  paar: string;
  /** lesbarer Name, z. B. XBT/EUR */
  name: string;
  o: number;
  h: number;
  l: number;
  c: number;
  vwap: number;
  /** gehandelte Menge in der Basiswährung */
  v: number;
  /** Zahl der Geschäfte */
  n: number;
}

/** Paare aus /0/public/AssetPairs, die gegen eine der Währungen notieren (Standard: Euro und US-Dollar). */
export function krakenKerzenPaare(json: unknown, waehrungen: string[] = ['EUR', 'USD']): { paar: string; name: string }[] {
  const j = json as { result?: Record<string, { wsname?: string }> } | null;
  const paare: { paar: string; name: string }[] = [];
  for (const [paar, v] of Object.entries(j?.result ?? {})) {
    const name = v?.wsname ?? '';
    if (waehrungen.includes(name.split('/')[1] ?? '')) paare.push({ paar, name });
  }
  return paare.sort((a, b) => a.paar.localeCompare(b.paar));
}

/**
 * Antwort von /0/public/OHLC?pair=…&interval=1440: Tageskerzen (UTC) eines Paars, [Zeit, o, h, l, c, vwap, Menge, Geschäfte].
 * Tage ohne Geschäft liefert Kraken als Kerze mit Zahl 0 – sie entfallen. Der laufende Tag ist enthalten; wer nur
 * fertige Tage will, filtert über `datum`.
 */
export function parseKrakenOhlc(json: unknown): { tage: (Omit<KryptoKerze, 'paar' | 'name'> & { datum: string })[]; fehler?: string } {
  const j = json as { error?: string[]; result?: Record<string, unknown> } | null;
  if (!j || typeof j !== 'object') return { tage: [], fehler: 'keine JSON-Antwort' };
  if (j.error?.length) return { tage: [], fehler: j.error.join('; ') };
  const reihe = Object.entries(j.result ?? {}).find(([k, v]) => k !== 'last' && Array.isArray(v))?.[1] as unknown[][] | undefined;
  if (!reihe) return { tage: [], fehler: 'keine Kerzen in der Antwort' };
  const tage: (Omit<KryptoKerze, 'paar' | 'name'> & { datum: string })[] = [];
  for (const r of reihe) {
    if (!Array.isArray(r) || r.length < 8) continue;
    const k = { o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), vwap: Number(r[5]), v: Number(r[6]), n: Number(r[7]) };
    if (!(k.n > 0) || !(k.c > 0) || !(k.o > 0) || !(k.h >= k.l)) continue;
    tage.push({ datum: new Date(Number(r[0]) * 1000).toISOString().slice(0, 10), ...k });
  }
  return { tage };
}

const KRYPTO_KERZEN_KOPF = 'paar,name,o,h,l,c,vwap,v,n';

export function kryptoKerzenCsv(kerzen: KryptoKerze[]): string {
  const zeilen = [...kerzen].sort((a, b) => a.paar.localeCompare(b.paar)).map((k) => [k.paar, k.name, z(k.o, 10), z(k.h, 10), z(k.l, 10), z(k.c, 10), z(k.vwap, 10), z(k.v, 4), k.n].join(','));
  return `${KRYPTO_KERZEN_KOPF}\n${zeilen.join('\n')}\n`;
}

export function parseKryptoKerzenArchiv(csv: string): Map<string, KryptoKerze> {
  const m = new Map<string, KryptoKerze>();
  for (const zeile of csv.split('\n').slice(1)) {
    const [paar, name, o, h, l, c, vwap, v, n] = zeile.split(',');
    if (paar) m.set(paar, { paar, name, o: Number(o), h: Number(h), l: Number(l), c: Number(c), vwap: Number(vwap), v: Number(v), n: Number(n) });
  }
  return m;
}

// ---------- US-Aktiensplits (Massive) – Splits sind Ereignisse, keine Kurssprünge ----------
export interface UsSplit {
  ticker: string;
  /** Tag, ab dem der neue Kurs gilt (JJJJ-MM-TT) */
  datum: string;
  /** aus `von` alten Aktien werden `zu` neue (1 → 10: Split; 10 → 1: Zusammenlegung) */
  von: number;
  zu: number;
}

/** Antwort von /v3/reference/splits; `weiter` ist die Adresse der nächsten Seite. */
export function parseMassiveSplits(json: unknown): { splits: UsSplit[]; weiter?: string; fehler?: string } {
  const j = json as { status?: string; error?: string; message?: string; next_url?: string; results?: Record<string, unknown>[] } | null;
  if (!j || typeof j !== 'object') return { splits: [], fehler: 'keine JSON-Antwort' };
  if (j.status === 'ERROR' || j.status === 'NOT_AUTHORIZED') return { splits: [], fehler: String(j.error ?? j.message ?? j.status) };
  const splits: UsSplit[] = [];
  for (const r of j.results ?? []) {
    const s = { ticker: String(r.ticker ?? ''), datum: String(r.execution_date ?? ''), von: Number(r.split_from), zu: Number(r.split_to) };
    if (s.ticker && /^\d{4}-\d{2}-\d{2}$/.test(s.datum) && s.von > 0 && s.zu > 0) splits.push(s);
  }
  return { splits, ...(typeof j.next_url === 'string' && j.next_url ? { weiter: j.next_url } : {}) };
}

/** Bekannte und neue Splits vereinen – nichts Bekanntes geht verloren (je Wert und Tag ein Eintrag, der neuere gilt). */
export function splitsVereinen(alt: UsSplit[], neu: UsSplit[]): UsSplit[] {
  const m = new Map<string, UsSplit>();
  for (const s of [...alt, ...neu]) m.set(`${s.datum}|${s.ticker}`, s);
  return [...m.values()].sort((a, b) => a.datum.localeCompare(b.datum) || a.ticker.localeCompare(b.ticker));
}

const US_SPLITS_KOPF = 'datum,ticker,von,zu';

export function usSplitsCsv(splits: UsSplit[]): string {
  return `${US_SPLITS_KOPF}\n${splits.map((s) => [s.datum, s.ticker, z(s.von), z(s.zu)].join(',')).join('\n')}\n`;
}

export function parseUsSplitsArchiv(csv: string): UsSplit[] {
  const liste: UsSplit[] = [];
  for (const zeile of csv.split('\n').slice(1)) {
    const [datum, ticker, von, zu] = zeile.split(',');
    if (datum && ticker) liste.push({ datum, ticker, von: Number(von), zu: Number(zu) });
  }
  return liste;
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
