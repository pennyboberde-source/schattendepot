// Marktphase messen (einmal je Tag im Hauptlauf/Samstag des Sammlers): S&P 500 über SPY (Twelve Data, 1 Abfrage)
// und Bitcoin (Kraken-Tageskerzen, ohne Schlüssel). Ergebnis: lernen/marktphase.json (heute) und
// lernen/marktphasen.json (Verlauf Datum → Phase), Grundlage für die Auswertung je Marktlage.
import { phaseBerechnen, type Marktphase, type PhasenVerlauf } from '../../core/marktphase.ts';
import { holeJson } from './netz.ts';
import { leseJson, schreibeJson } from './dateien.ts';

export async function marktphaseAktualisieren(datum: string): Promise<{ aktien?: Marktphase; krypto?: Marktphase; fehler: string[] }> {
  const fehler: string[] = [];
  let aktien: Marktphase | undefined;
  let krypto: Marktphase | undefined;
  const td = process.env.TWELVEDATA_API_KEY?.trim();
  if (td) {
    try {
      const j = await holeJson<{ values?: { datetime: string; close: string }[]; message?: string }>(`https://api.twelvedata.com/time_series?symbol=SPY&interval=1day&outputsize=300&apikey=${td}`);
      const werte = (j.values ?? []).filter((v) => v.datetime < datum).sort((a, b) => a.datetime.localeCompare(b.datetime));
      aktien = phaseBerechnen(werte.map((v) => Number(v.close)), datum) ?? undefined;
      if (!aktien) fehler.push(`SPY: zu wenig Kurse (${j.message ?? werte.length})`);
    } catch (e) {
      fehler.push(`SPY: ${(e as Error).message}`);
    }
  } else fehler.push('TWELVEDATA_API_KEY fehlt – Aktien-Phase ohne Messung');
  try {
    const j = await holeJson<{ result?: Record<string, (string | number)[][] | number> }>('https://api.kraken.com/0/public/OHLC?pair=XBTEUR&interval=1440');
    const reihe = Object.entries(j.result ?? {}).find(([k]) => k !== 'last')?.[1];
    // nur abgeschlossene Tage (UTC) vor heute
    const tage = (Array.isArray(reihe) ? reihe : []).filter((z) => new Date(Number(z[0]) * 1000).toISOString().slice(0, 10) < datum);
    krypto = phaseBerechnen(tage.map((z) => Number(z[4])), datum, 365) ?? undefined;
  } catch (e) {
    fehler.push(`Kraken BTC: ${(e as Error).message}`);
  }
  const alt = leseJson<{ aktien?: Marktphase; krypto?: Marktphase }>('lernen/marktphase.json', {});
  const heute = { stand: new Date().toISOString(), aktien: aktien ?? alt.aktien, krypto: krypto ?? alt.krypto, fehler };
  schreibeJson('lernen/marktphase.json', heute);
  const verlauf = leseJson<PhasenVerlauf>('lernen/marktphasen.json', {});
  verlauf[datum] = { ...(heute.aktien ? { aktien: heute.aktien.phase } : {}), ...(heute.krypto ? { krypto: heute.krypto.phase } : {}) };
  schreibeJson('lernen/marktphasen.json', verlauf);
  return { aktien, krypto, fehler };
}
