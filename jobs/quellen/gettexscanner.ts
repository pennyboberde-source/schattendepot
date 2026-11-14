// Kursraketen-Scanner: wertet stündlich alle gettex-Geschäfte der letzten Stunde aus (kostenlose MiFIR-Daten)
// und meldet starke Bewegungen mit vielen Geschäften – auch bei Penny Stocks. Namen über OpenFIGI (ISIN → Name/Ticker).
// Hebelprodukte (Optionsscheine, Turbos, Zertifikate z. B. von HSBC/Goldman) fliegen raus: ihre Sprünge sind Hebelmechanik,
// kein Signal (Lektion 21; Schattenbuch 1 W Ø −26 %, n=10). Gemeldet werden nur Aktien/ADRs – oder ISINs, die OpenFIGI nicht kennt.
import { aggregiere, auffaellige, gettexFenster } from '../kurse/gettex.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';

export interface Figi {
  data?: { name?: string; ticker?: string; exchCode?: string; securityType?: string; securityType2?: string }[];
}

export interface FigiName {
  name: string;
  ticker?: string;
  /** false = laut OpenFIGI kein Aktien-/ADR-Wert (Optionsschein, Turbo, Zertifikat, ETP …) */
  aktie: boolean;
}

const AKTIE = new Set(['Common Stock', 'Depositary Receipt']);
/** Kandidaten je Lauf, bevor Hebelprodukte aussortiert werden (OpenFIGI ohne Schlüssel: 10 ISINs je Anfrage). */
const VORAUSWAHL = 20;
const MELDUNGEN = 10;

/** OpenFIGI-Antwort → Name/Ticker/Aktie je ISIN (Reihenfolge wie die Anfrage). */
export function figiAuswerten(isins: string[], j: Figi[]): Map<string, FigiName> {
  const m = new Map<string, FigiName>();
  j.forEach((r, i) => {
    const d = r.data?.find((x) => x.exchCode === 'US') ?? r.data?.[0];
    if (d?.name) m.set(isins[i], { name: d.name, ticker: d.exchCode === 'US' ? d.ticker : undefined, aktie: AKTIE.has(d.securityType2 ?? '') });
  });
  return m;
}

/** Hebelprodukte raus: behalten wird, was OpenFIGI als Aktie/ADR kennt oder gar nicht kennt. */
export function ohneHebelprodukte<T extends { isin: string }>(treffer: T[], n: Map<string, FigiName>, max = MELDUNGEN): T[] {
  return treffer.filter((t) => n.get(t.isin)?.aktie !== false).slice(0, max);
}

async function namen(isins: string[]): Promise<Map<string, FigiName>> {
  const m = new Map<string, FigiName>();
  const key = process.env.OPENFIGI_API_KEY?.trim();
  for (let a = 0; a < isins.length; a += 10) {
    const teil = isins.slice(a, a + 10);
    try {
      const res = await fetch('https://api.openfigi.com/v3/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OPENFIGI-APIKEY': key } : {}) },
        body: JSON.stringify(teil.map((i) => ({ idType: 'ID_ISIN', idValue: i }))),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) break;
      for (const [k, v] of figiAuswerten(teil, (await res.json()) as Figi[])) m.set(k, v);
    } catch {
      break; /* Namen sind Komfort; ohne Einordnung bleibt der Treffer drin */
    }
  }
  return m;
}

export const gettexScanner: Quelle = {
  id: 'gettex-scanner',
  name: 'gettex-Kursraketen-Scanner',
  laeufe: ['haupt', 'stuendlich'],
  maxProLauf: 10,
  async abrufen() {
    const dateien = await gettexFenster(4);
    const vorauswahl = auffaellige(aggregiere(dateien), { minProzent: 15, minGeschaefte: 15, minUmsatz: 20000, max: VORAUSWAHL });
    const n = await namen(vorauswahl.map((t) => t.isin));
    const treffer = ohneHebelprodukte(vorauswahl, n);
    const signale = treffer.map((t) => {
      const nm = n.get(t.isin);
      const kurs = t.letzter < 1 ? t.letzter.toFixed(4) : t.letzter.toFixed(2);
      return signal(
        'kursrakete',
        { name: nm?.name ?? t.isin, isin: t.isin, ticker: nm?.ticker },
        Math.min(1, 0.3 + Math.abs(t.prozent) / 100),
        0,
        t.bis,
        'gettex-Scanner',
        `${t.prozent > 0 ? '+' : ''}${t.prozent.toFixed(0)} % in der letzten Stunde auf ${kurs} € (${t.geschaefte} Geschäfte, Umsatz ${Math.round(t.umsatz / 1000)} T€, gettex) – spekulativ`,
        `https://www.gettex.de/suche/?q=${t.isin}`,
      );
    });
    return { signale, abfragen: dateien.length + Math.ceil(vorauswahl.length / 10) };
  },
};

