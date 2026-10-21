// Stimmung (ApeWisdom), Makro (FRED fredgraph.csv, ohne Schlüssel) und Krypto (Kraken). Je 1 Abfrage.
import { berlin } from '../../core/kalender.ts';
import type { Signal } from '../../core/signale.ts';
import { holeJson, holeText } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import { parseFredCsv } from './parser.ts';
import type { Quelle } from './typen.ts';

interface ApeEintrag {
  ticker: string;
  name: string;
  mentions: number;
  mentions_24h_ago: number;
  rank: number;
}

export function apeWisdomAuswerten(j: { results?: ApeEintrag[] }, jetzt: Date): Signal[] {
  const out: Signal[] = [];
  for (const e of (j.results ?? []).slice(0, 50)) {
    const vorher = Math.max(1, Number(e.mentions_24h_ago) || 0);
    const wachstum = Number(e.mentions) / vorher;
    if (Number(e.mentions) < 30 || wachstum < 2) continue;
    out.push(
      signal('stimmung_social', { name: e.name || e.ticker, ticker: e.ticker }, Math.min(1, 0.3 + Math.log2(wachstum) * 0.15), 0, jetzt.toISOString(), 'ApeWisdom', `Reddit-Erwähnungen ${e.mentions} (24 h vorher ${vorher}), Rang ${e.rank}`, `https://apewisdom.io/stocks/${e.ticker}/`),
    );
  }
  return out;
}

export const apeWisdom: Quelle = {
  id: 'apewisdom',
  name: 'ApeWisdom (Reddit-Erwähnungen)',
  laeufe: ['haupt'],
  maxProLauf: 1,
  async abrufen(ctx) {
    return { signale: apeWisdomAuswerten(await holeJson('https://apewisdom.io/api/v1.0/filter/all-stocks/page/1'), ctx.jetzt), abfragen: 1 };
  },
};

const FRED_REIHEN: Record<string, { name: string; einheit: string; stellen: number }> = {
  VIXCLS: { name: 'VIX', einheit: '', stellen: 1 },
  DGS10: { name: 'US-Rendite 10 J.', einheit: ' %', stellen: 2 },
  DEXUSEU: { name: 'EUR/USD', einheit: '', stellen: 4 },
  DCOILBRENTEU: { name: 'Brent', einheit: ' $', stellen: 1 },
};

export function fredMakro(csv: string): string[] {
  const r = parseFredCsv(csv);
  return Object.entries(FRED_REIHEN)
    .filter(([id]) => r[id])
    .map(([id, d]) => {
      const x = r[id];
      const delta = x.vorher ? ` (Vortag ${x.vorher.toFixed(d.stellen).replace('.', ',')})` : '';
      return `${d.name}: ${x.wert.toFixed(d.stellen).replace('.', ',')}${d.einheit}${delta}, Stand ${x.datum}`;
    });
}

export const fred: Quelle = {
  id: 'fred',
  name: 'FRED (St. Louis Fed)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const von = new Date(ctx.jetzt.getTime() - 14 * 86400000).toISOString().slice(0, 10);
    const key = process.env.FRED_API_KEY?.trim();
    if (key) {
      // Offizielle API (mit Gratis-Schlüssel): je Reihe eine Abfrage, als CSV zusammengesetzt
      const zeilen = new Map<string, Record<string, string>>();
      for (const id of Object.keys(FRED_REIHEN)) {
        const j = await holeJson<{ observations?: { date: string; value: string }[] }>(
          `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${key}&file_type=json&observation_start=${von}`,
        );
        for (const o of j.observations ?? []) zeilen.set(o.date, { ...(zeilen.get(o.date) ?? {}), [id]: o.value });
      }
      const ids = Object.keys(FRED_REIHEN);
      const csv = ['observation_date,' + ids.join(','), ...[...zeilen.keys()].sort().map((d) => [d, ...ids.map((i) => zeilen.get(d)?.[i] ?? '')].join(','))].join('\n');
      return { signale: [], makro: fredMakro(csv), abfragen: ids.length };
    }
    const csv = await holeText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${Object.keys(FRED_REIHEN).join(',')}&cosd=${von}`);
    if (csv.trimStart().startsWith('<')) throw new Error('FRED liefert keine CSV (Wartung?)');
    return { signale: [], makro: fredMakro(csv), abfragen: 1 };
  },
};

export const krakenKrypto: Quelle = {
  id: 'kraken',
  name: 'Kraken (Krypto)',
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const j = await holeJson<{ result?: Record<string, { c: string[]; o: string }> }>('https://api.kraken.com/0/public/Ticker?pair=XBTEUR,ETHEUR');
    const makro: string[] = [];
    const signale: Signal[] = [];
    const namen: Record<string, [string, string]> = { XXBTZEUR: ['Bitcoin', 'BTC'], XETHZEUR: ['Ethereum', 'ETH'] };
    for (const [paar, t] of Object.entries(j.result ?? {})) {
      const [name, ticker] = namen[paar] ?? [paar, paar];
      const kurs = Number(t.c[0]);
      const auf = (kurs / Number(t.o) - 1) * 100;
      makro.push(`${name}: ${Math.round(kurs).toLocaleString('de-DE')} € (${auf >= 0 ? '+' : ''}${auf.toFixed(1).replace('.', ',')} % seit 00:00 UTC)`);
      if (Math.abs(auf) >= 5) signale.push(signal('ueberreaktion', { name, ticker }, Math.min(1, Math.abs(auf) / 15), 0, ctx.jetzt.toISOString(), 'Kraken', `${name} ${auf.toFixed(1)} % seit 00:00 UTC (${berlin(ctx.jetzt).datum})`, 'https://www.kraken.com/prices'));
    }
    return { signale, makro, abfragen: 1 };
  },
};
