// Kursraketen-Scanner: wertet stündlich alle gettex-Geschäfte der letzten Stunde aus (kostenlose MiFIR-Daten)
// und meldet starke Bewegungen mit vielen Geschäften – auch bei Penny Stocks. Namen über OpenFIGI (ISIN → Name/Ticker).
import { aggregiere, auffaellige, gettexFenster } from '../kurse/gettex.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';

interface Figi {
  data?: { name?: string; ticker?: string; exchCode?: string; securityType?: string }[];
}

async function namen(isins: string[]): Promise<Map<string, { name: string; ticker?: string }>> {
  const m = new Map<string, { name: string; ticker?: string }>();
  if (!isins.length) return m;
  const key = process.env.OPENFIGI_API_KEY?.trim();
  try {
    const res = await fetch('https://api.openfigi.com/v3/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(key ? { 'X-OPENFIGI-APIKEY': key } : {}) },
      body: JSON.stringify(isins.slice(0, 10).map((i) => ({ idType: 'ID_ISIN', idValue: i }))),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return m;
    const j = (await res.json()) as Figi[];
    j.forEach((r, i) => {
      const d = r.data?.find((x) => x.exchCode === 'US') ?? r.data?.[0];
      if (d?.name) m.set(isins[i], { name: d.name, ticker: d.exchCode === 'US' ? d.ticker : undefined });
    });
  } catch {
    /* Namen sind nur Komfort */
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
    const treffer = auffaellige(aggregiere(dateien));
    const n = await namen(treffer.map((t) => t.isin));
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
    return { signale, abfragen: dateien.length + 1 };
  },
};

