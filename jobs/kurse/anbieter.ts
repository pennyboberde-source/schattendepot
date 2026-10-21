// Kursquellen hinter einer Schnittstelle mit Fallbacks. Gratis-Kontingente werden nie überschritten.
// Reihenfolge je Markt: us → Finnhub, Twelve Data, FMP, Alpha Vantage; eu → FMP, Alpha Vantage; krypto → Kraken.
// Yahoo Finance wird bewusst NICHT genutzt (Nutzungsbedingungen verbieten automatisierten Abruf).
import type { Kurs, Kursbasis } from '../../core/typen.ts';
import { holeJson, kontingentFrei, kontingentZaehlen } from '../lib/netz.ts';
import { parseAlphaVantage, parseFinnhub, parseFmp, parseFrankfurter, parseKraken, parseTwelveData, symbolFuer } from './parser.ts';

interface Anbieter {
  id: string;
  schluessel?: string;
  hole(symbol: string, jetzt: Date): Promise<Kurs | null>;
}

const env = (n: string) => process.env[n]?.trim() || undefined;

const ANBIETER: Record<string, Anbieter> = {
  finnhub: {
    id: 'finnhub',
    schluessel: 'FINNHUB_API_KEY',
    hole: async (s) => parseFinnhub(await holeJson(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${env('FINNHUB_API_KEY')}`)),
  },
  twelvedata: {
    id: 'twelvedata',
    schluessel: 'TWELVEDATA_API_KEY',
    hole: async (s) => parseTwelveData(await holeJson(`https://api.twelvedata.com/quote?symbol=${encodeURIComponent(s)}&apikey=${env('TWELVEDATA_API_KEY')}`)),
  },
  fmp: {
    id: 'fmp',
    schluessel: 'FMP_API_KEY',
    hole: async (s) => parseFmp(await holeJson(`https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(s)}&apikey=${env('FMP_API_KEY')}`)),
  },
  alphavantage: {
    id: 'alphavantage',
    schluessel: 'ALPHAVANTAGE_API_KEY',
    hole: async (s) =>
      parseAlphaVantage(await holeJson(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbolFuer('alphavantage', s))}&apikey=${env('ALPHAVANTAGE_API_KEY')}`)),
  },
  kraken: {
    id: 'kraken',
    hole: async (s, jetzt) => parseKraken(await holeJson(`https://api.kraken.com/0/public/Ticker?pair=${symbolFuer('kraken', s)}`), jetzt),
  },
};

const REIHENFOLGE: Record<Kursbasis['markt'], string[]> = {
  us: ['finnhub', 'twelvedata', 'fmp', 'alphavantage'],
  eu: ['fmp', 'alphavantage'],
  krypto: ['kraken'],
};

export interface Abrufprotokoll {
  [anbieter: string]: { ok: number; fehler: number; letzterFehler?: string; zuletztOk?: string };
}

function protokolliere(p: Abrufprotokoll, id: string, ok: boolean, jetzt: Date, fehler?: string) {
  p[id] ??= { ok: 0, fehler: 0 };
  if (ok) {
    p[id].ok++;
    p[id].zuletztOk = jetzt.toISOString();
  } else {
    p[id].fehler++;
    p[id].letzterFehler = `${jetzt.toISOString()}: ${fehler}`;
  }
}

/** Holt einen Kurs über die Fallback-Kette. Markiert Verzögerung (> 20 Min. alt) am Kurs. */
export async function holeKurs(kb: Kursbasis, jetzt: Date, protokoll: Abrufprotokoll): Promise<Kurs | null> {
  for (const id of REIHENFOLGE[kb.markt]) {
    const a = ANBIETER[id];
    if (a.schluessel && !env(a.schluessel)) continue;
    if (!kontingentFrei(id, jetzt)) continue;
    try {
      kontingentZaehlen(id, jetzt);
      const k = await a.hole(kb.symbol, jetzt);
      if (!k) {
        protokolliere(protokoll, id, false, jetzt, `kein Kurs für ${kb.symbol}`);
        continue;
      }
      protokolliere(protokoll, id, true, jetzt);
      const alterMin = Math.round((jetzt.getTime() - new Date(k.zeit).getTime()) / 60000);
      return alterMin > 20 ? { ...k, verzoegertMin: alterMin } : k;
    } catch (e) {
      protokolliere(protokoll, id, false, jetzt, (e as Error).message.replace(/(apikey|token)=[^&\s]+/gi, '$1=***'));
    }
  }
  return null;
}

/** EUR/USD (USD je EUR): Twelve Data (laufend) → FMP → EZB-Referenzkurs (täglich, Frankfurter). */
export async function holeEurUsd(jetzt: Date, protokoll: Abrufprotokoll): Promise<number | undefined> {
  const versuche: [string, () => Promise<number | null>][] = [
    ['twelvedata', async () => (env('TWELVEDATA_API_KEY') ? (ANBIETER.twelvedata.hole('EUR/USD', jetzt).then((k) => k?.wert ?? null)) : null)],
    ['fmp', async () => (env('FMP_API_KEY') ? (ANBIETER.fmp.hole('EURUSD', jetzt).then((k) => k?.wert ?? null)) : null)],
    ['frankfurter', async () => parseFrankfurter(await holeJson('https://api.frankfurter.app/latest?from=EUR&to=USD'))],
  ];
  for (const [id, f] of versuche) {
    if (!kontingentFrei(id, jetzt)) continue;
    try {
      kontingentZaehlen(id, jetzt);
      const w = await f();
      if (w && w > 0) {
        protokolliere(protokoll, id, true, jetzt);
        return w;
      }
    } catch (e) {
      protokolliere(protokoll, id, false, jetzt, (e as Error).message.replace(/(apikey|token)=[^&\s]+/gi, '$1=***'));
    }
  }
  return undefined;
}
