// Reine Parser für die Antworten der Kursanbieter (getestet mit aufgezeichneten Beispielen).
import { berlinZuUtc } from '../../core/kalender.ts';
import type { Kurs } from '../../core/typen.ts';

const iso = (sekunden: number) => new Date(sekunden * 1000).toISOString();

/** Finnhub /quote: { c, pc, t } – t = Unix-Sekunden des letzten Handels. c = 0 bei unbekanntem Symbol. */
export function parseFinnhub(j: { c?: number; pc?: number; t?: number; [feld: string]: unknown }): Kurs | null {
  if (!j || !j.c || !j.t) return null;
  return { wert: j.c, vortag: j.pc || undefined, zeit: iso(j.t), quelle: 'Finnhub' };
}

/** Twelve Data /quote (ein Symbol): { close, previous_close, timestamp } oder { code, message } bei Fehler. */
export function parseTwelveData(j: { close?: string; previous_close?: string; timestamp?: number; last_quote_at?: number; code?: number }): Kurs | null {
  if (!j || j.code || !j.close) return null;
  const t = j.last_quote_at ?? j.timestamp;
  if (!t) return null;
  return { wert: Number(j.close), vortag: j.previous_close ? Number(j.previous_close) : undefined, zeit: iso(t), quelle: 'Twelve Data' };
}

/** FMP /stable/quote: [{ price, previousClose, timestamp }] */
export function parseFmp(j: unknown): Kurs | null {
  const e = Array.isArray(j) ? (j[0] as { price?: number; previousClose?: number; timestamp?: number }) : null;
  if (!e || !e.price || !e.timestamp) return null;
  return { wert: e.price, vortag: e.previousClose || undefined, zeit: iso(e.timestamp), quelle: 'FMP' };
}

/** Alpha Vantage GLOBAL_QUOTE: nur Tageswerte → Zeit = Handelsschluss 17:30 Berlin am letzten Handelstag. */
export function parseAlphaVantage(j: { 'Global Quote'?: Record<string, string> }): Kurs | null {
  const q = j?.['Global Quote'];
  if (!q || !q['05. price'] || !q['07. latest trading day']) return null;
  return {
    wert: Number(q['05. price']),
    vortag: q['08. previous close'] ? Number(q['08. previous close']) : undefined,
    zeit: berlinZuUtc(q['07. latest trading day'], '17:30').toISOString(),
    quelle: 'Alpha Vantage (Tageskurs)',
  };
}

/** Kraken /0/public/Ticker: { result: { PAAR: { a:[ask], b:[bid], c:[last], o: open } } } – Zeit = Abrufzeit. */
export function parseKraken(j: { error?: string[]; result?: Record<string, { a: string[]; b: string[]; c: string[]; o: string }> }, abrufzeit: Date): Kurs | null {
  if (!j?.result || (j.error && j.error.length)) return null;
  const t = Object.values(j.result)[0];
  if (!t) return null;
  return {
    wert: Number(t.c[0]),
    geld: Number(t.b[0]),
    brief: Number(t.a[0]),
    vortag: Number(t.o),
    zeit: abrufzeit.toISOString(),
    quelle: 'Kraken',
    hinweis: 'Vortag = Eröffnung 00:00 UTC',
  };
}

/** Frankfurter (EZB-Referenzkurse, täglich): { rates: { USD } } */
export function parseFrankfurter(j: { rates?: { USD?: number } }): number | null {
  return j?.rates?.USD ?? null;
}

/** Symbol-Umsetzung je Anbieter. Grundformat: US-Ticker bzw. Yahoo-ähnlich mit Suffix (SAP.DE). */
export function symbolFuer(anbieter: 'alphavantage' | 'kraken', symbol: string): string {
  if (anbieter === 'alphavantage') return symbol.replace(/\.DE$/, '.DEX').replace(/\.F$/, '.FRK');
  const krypto: Record<string, string> = { BTC: 'XBTEUR', ETH: 'ETHEUR', SOL: 'SOLEUR', XRP: 'XRPEUR', ADA: 'ADAEUR', DOT: 'DOTEUR' };
  return krypto[symbol.toUpperCase()] ?? `${symbol.toUpperCase()}EUR`;
}
