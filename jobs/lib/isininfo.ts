// ISIN → Name, Ticker, Wertpapierart über OpenFIGI (kostenlos; ohne Schlüssel 25 Anfragen/Min. à 10 ISINs).
// Ergebnis wird dauerhaft gemerkt (daytrading/isin-info.json), damit jede ISIN nur einmal abgefragt wird.
import { leseJson, schreibeJson } from './dateien.ts';

export interface IsinInfo {
  name: string;
  ticker?: string;
  /** OpenFIGI securityType2, z. B. "Common Stock" */
  art?: string;
  /** Aktie (Stammaktie/ADR) → im Daytrading-Scan handelbar */
  aktie: boolean;
  /** Abfrage ohne Ergebnis */
  unbekannt?: boolean;
}

interface Figi {
  data?: { name?: string; ticker?: string; exchCode?: string; securityType?: string; securityType2?: string }[];
  error?: string;
}

const DATEI = 'daytrading/isin-info.json';
const AKTIE = new Set(['Common Stock', 'Depositary Receipt']);

export function isinInfosLesen(): Record<string, IsinInfo> {
  return leseJson<Record<string, IsinInfo>>(DATEI, {});
}

/** Fehlende ISINs nachschlagen (höchstens `maxAnfragen` Anfragen), gemerkte Infos zurückgeben. */
export async function isinInfos(isins: string[], maxAnfragen = 8): Promise<Record<string, IsinInfo>> {
  const cache = isinInfosLesen();
  const fehlen = [...new Set(isins)].filter((i) => !cache[i]);
  const key = process.env.OPENFIGI_API_KEY?.trim();
  const je = key ? 100 : 10;
  let geaendert = false;
  for (let a = 0; a < maxAnfragen && fehlen.length; a++) {
    const teil = fehlen.splice(0, je);
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OPENFIGI-APIKEY': key } : {}) },
        body: JSON.stringify(teil.map((i) => ({ idType: 'ID_ISIN', idValue: i }))),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) break;
      const j = (await res.json()) as Figi[];
      j.forEach((r, i) => {
        const daten = r.data ?? [];
        const us = daten.find((d) => d.exchCode === 'US');
        const de = daten.find((d) => d.exchCode === 'GR' || d.exchCode === 'GY' || d.exchCode === 'GF');
        const d = us ?? de ?? daten[0];
        cache[teil[i]] = d?.name
          ? { name: d.name, ...(us?.ticker ? { ticker: us.ticker } : {}), ...(d.securityType2 ? { art: d.securityType2 } : {}), aktie: AKTIE.has(d.securityType2 ?? '') }
          : { name: teil[i], aktie: false, unbekannt: true };
      });
      geaendert = true;
    } catch {
      break; // Namen sind Komfort; ohne Einordnung wird die ISIN heute nicht gescannt
    }
  }
  if (geaendert) schreibeJson(DATEI, cache);
  return cache;
}
