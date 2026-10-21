// Zweite Stufe des Hauptlaufs: die besten US-Kandidaten gezielt anreichern (Finnhub, Gratis-Schlüssel).
// 1. Analysten-Trend (/stock/recommendation): Anteil Kaufempfehlungen gegenüber Vormonat.
// 2. Drift nach Quartalszahlen (PEAD): Überraschung + bestätigende Marktreaktion (/quote, dp = Veränderung in %).
import type { Kandidat, Signal } from '../../core/signale.ts';
import { holeJson } from '../lib/netz.ts';
import { signal } from './hilfen.ts';

export interface Empfehlung {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
}

export function analystenTrend(liste: Empfehlung[], name: string, ticker: string, jetzt: Date): Signal | null {
  const [neu, alt] = [...liste].sort((a, b) => b.period.localeCompare(a.period));
  if (!neu || !alt) return null;
  const summe = (e: Empfehlung) => e.strongBuy + e.buy + e.hold + e.sell + e.strongSell;
  if (summe(neu) < 3 || summe(alt) < 3) return null;
  const anteil = (e: Empfehlung) => (e.strongBuy + e.buy) / summe(e);
  const delta = anteil(neu) - anteil(alt);
  if (Math.abs(delta) < 0.08) return null;
  const typ = delta > 0 ? 'analysten_hochstufung' : 'analysten_abstufung';
  return signal(
    typ,
    { name, ticker },
    Math.min(1, 0.4 + Math.abs(delta) * 2),
    delta > 0 ? 1 : -1,
    jetzt.toISOString(),
    'Finnhub Analysten',
    `Kaufempfehlungen ${Math.round(anteil(alt) * 100)} % → ${Math.round(anteil(neu) * 100)} % (${summe(neu)} Analysten, ${neu.period})`,
    `https://finnhub.io/`,
  );
}

/** PEAD: Überraschung in derselben Richtung wie die Kursreaktion (≥ 2 %) → Drift-Signal. */
export function nachzahlenDrift(k: Kandidat, reaktionProzent: number, jetzt: Date): Signal | null {
  const ueber = k.signale.find((s) => s.typ === 'gewinn_ueberraschung' || s.typ === 'gewinn_enttaeuschung');
  if (!ueber || Math.abs(reaktionProzent) < 2) return null;
  const richtung = ueber.typ === 'gewinn_ueberraschung' ? 1 : -1;
  if (Math.sign(reaktionProzent) !== richtung) return null;
  return signal(
    'nachzahlen_drift',
    { ...k.wertpapier },
    Math.min(1, 0.4 + Math.abs(reaktionProzent) / 15),
    richtung,
    jetzt.toISOString(),
    'Finnhub Kurs',
    `Kursreaktion ${reaktionProzent > 0 ? '+' : ''}${reaktionProzent.toFixed(1)} % bestätigt die ${richtung > 0 ? 'positive' : 'negative'} Überraschung (${ueber.quellen[0]?.fakt ?? ''})`,
  );
}

const usTicker = (t?: string) => !!t && /^[A-Z][A-Z0-9-]{0,5}$/.test(t);

export async function anreichern(top: Kandidat[], jetzt: Date, max = 12): Promise<{ signale: Signal[]; abfragen: number }> {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return { signale: [], abfragen: 0 };
  const out: Signal[] = [];
  let abfragen = 0;
  for (const k of top.filter((x) => usTicker(x.wertpapier.ticker)).slice(0, max)) {
    const t = k.wertpapier.ticker!;
    try {
      abfragen++;
      const s = analystenTrend(await holeJson<Empfehlung[]>(`https://finnhub.io/api/v1/stock/recommendation?symbol=${t}&token=${key}`), k.wertpapier.name, t, jetzt);
      if (s) out.push(s);
      if (k.signale.some((x) => x.typ === 'gewinn_ueberraschung' || x.typ === 'gewinn_enttaeuschung')) {
        abfragen++;
        const q = await holeJson<{ dp?: number }>(`https://finnhub.io/api/v1/quote?symbol=${t}&token=${key}`);
        const d = typeof q.dp === 'number' ? nachzahlenDrift(k, q.dp, jetzt) : null;
        if (d) out.push(d);
      }
    } catch {
      /* einzelner Ausfall egal */
    }
  }
  return { signale: out, abfragen };
}
