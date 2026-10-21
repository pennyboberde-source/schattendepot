// Quellen mit Gratis-Schlüssel: Finnhub, FMP, Alpha Vantage (Schlüssel nur aus Secrets/Umgebung).
import type { Signal } from '../../core/signale.ts';
import { holeJson } from '../lib/netz.ts';
import { schlagzeilenAuswerten, signal } from './hilfen.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';

const env = (n: string) => process.env[n]?.trim() ?? '';
const tag = (d: Date, plus = 0) => new Date(d.getTime() + plus * 86400000).toISOString().slice(0, 10);

interface Quartal {
  date: string;
  symbol: string;
  hour?: string;
  epsActual?: number | null;
  epsEstimate?: number | null;
  revenueEstimate?: number | null;
}

/** Quartalszahlen: Termine heute + Überraschungen der letzten Veröffentlichungen. */
export function quartalszahlenAuswerten(liste: Quartal[], heute: string, quelle: string, universumTicker: Set<string>, jetzt: Date): Pick<QuellenErgebnis, 'signale' | 'termine'> {
  const signale: Signal[] = [];
  const termine: { zeit: string; text: string }[] = [];
  const relevant = (q: Quartal) => universumTicker.has(q.symbol) || (q.revenueEstimate ?? 0) >= 5e9;
  for (const q of liste) {
    if (!relevant(q)) continue;
    if (q.date === heute && (q.epsActual === null || q.epsActual === undefined)) {
      termine.push({ zeit: q.hour === 'bmo' ? 'vor US-Eröffnung' : q.hour === 'amc' ? 'nach US-Schluss' : 'heute', text: `${q.symbol} Quartalszahlen (Erwartung EPS ${q.epsEstimate ?? '–'})` });
      signale.push(signal('quartalstermin', { name: q.symbol, ticker: q.symbol }, 0.4, 0, jetzt.toISOString(), quelle, `Quartalszahlen ${q.date} ${q.hour ?? ''}`));
    }
    if (q.epsActual !== null && q.epsActual !== undefined && q.epsEstimate) {
      const ueberraschung = ((q.epsActual - q.epsEstimate) / Math.abs(q.epsEstimate)) * 100;
      if (Math.abs(ueberraschung) < 5) continue;
      const typ = ueberraschung > 0 ? 'gewinn_ueberraschung' : 'gewinn_enttaeuschung';
      signale.push(
        signal(typ, { name: q.symbol, ticker: q.symbol }, Math.min(1, 0.4 + Math.abs(ueberraschung) / 50), ueberraschung > 0 ? 1 : -1, jetzt.toISOString(), quelle, `EPS ${q.epsActual} vs. erwartet ${q.epsEstimate} (${ueberraschung > 0 ? '+' : ''}${ueberraschung.toFixed(0)} %) am ${q.date}`),
      );
    }
  }
  return { signale, termine: termine.slice(0, 15) };
}

export const finnhub: Quelle = {
  id: 'finnhub',
  name: 'Finnhub',
  schluessel: 'FINNHUB_API_KEY',
  laeufe: ['haupt', 'stuendlich'],
  tageslimit: 1500,
  maxProLauf: 12,
  async abrufen(ctx) {
    const k = env('FINNHUB_API_KEY');
    const erg: QuellenErgebnis = { signale: [], meldungen: [], termine: [], abfragen: 0 };
    if (ctx.laufart === 'haupt') {
      const kal = await holeJson<{ earningsCalendar?: Quartal[] }>(`https://finnhub.io/api/v1/calendar/earnings?from=${tag(ctx.jetzt, -2)}&to=${tag(ctx.jetzt, 1)}&token=${k}`);
      erg.abfragen++;
      const q = quartalszahlenAuswerten(kal.earningsCalendar ?? [], tag(ctx.jetzt), 'Finnhub', new Set(ctx.universum.map((u) => u.ticker)), ctx.jetzt);
      erg.signale.push(...q.signale);
      erg.termine!.push(...(q.termine ?? []));
      const news = await holeJson<{ headline: string; url: string; datetime: number }[]>(`https://finnhub.io/api/v1/news?category=general&token=${k}`);
      erg.abfragen++;
      const s = schlagzeilenAuswerten(news.slice(0, 40).map((n) => ({ titel: n.headline, link: n.url, zeit: new Date(n.datetime * 1000).toISOString() })), 'Finnhub News', ctx.universum, ctx.jetzt);
      erg.signale.push(...s.signale);
      erg.meldungen!.push(...s.meldungen.slice(0, 10));
    }
    // Nachrichten zu offenen US-Positionen (stündlich und im Hauptlauf)
    for (const o of ctx.offen.filter((x) => x.ticker && !x.ticker.includes('.')).slice(0, 10)) {
      const news = await holeJson<{ headline: string; url: string; datetime: number }[]>(`https://finnhub.io/api/v1/company-news?symbol=${o.ticker}&from=${tag(ctx.jetzt, -1)}&to=${tag(ctx.jetzt)}&token=${k}`);
      erg.abfragen++;
      const s = schlagzeilenAuswerten(
        news.slice(0, 10).map((n) => ({ titel: `${o.name}: ${n.headline}`, link: n.url, zeit: new Date(n.datetime * 1000).toISOString() })),
        'Finnhub',
        [{ name: o.name, ticker: o.ticker!, aliase: [o.name.toLowerCase()] }],
        ctx.jetzt,
        ctx.laufart === 'stuendlich' ? 2 : 24,
      );
      erg.signale.push(...s.signale);
      erg.meldungen!.push(...s.meldungen.map((m) => ({ ...m, wertpapier: o.name })));
    }
    return erg;
  },
};

export const fmp: Quelle = {
  id: 'fmp',
  name: 'Financial Modeling Prep',
  schluessel: 'FMP_API_KEY',
  laeufe: ['haupt'],
  tageslimit: 80,
  maxProLauf: 3,
  async abrufen(ctx) {
    const k = env('FMP_API_KEY');
    const erg: QuellenErgebnis = { signale: [], termine: [], abfragen: 0 };
    const fehler: string[] = [];
    const versuche = async <T>(url: string): Promise<T | null> => {
      erg.abfragen++;
      try {
        return await holeJson<T>(url);
      } catch (e) {
        fehler.push((e as Error).message);
        return null;
      }
    };
    for (const [pfad, typ, richtung] of [
      ['biggest-gainers', 'tagesgewinner', 1],
      ['biggest-losers', 'tagesverlierer', -1],
    ] as const) {
      const l = await versuche<{ symbol: string; name?: string; changesPercentage?: number; price?: number }[]>(`https://financialmodelingprep.com/stable/${pfad}?apikey=${k}`);
      for (const e of (Array.isArray(l) ? l : []).slice(0, 10)) {
        const pct = Number(e.changesPercentage ?? 0);
        if (Math.abs(pct) < 5 || (e.price ?? 0) < 2) continue;
        erg.signale.push(signal(typ, { name: e.name ?? e.symbol, ticker: e.symbol }, Math.min(1, Math.abs(pct) / 25), richtung, ctx.jetzt.toISOString(), 'FMP', `${pct > 0 ? '+' : ''}${pct.toFixed(1)} % am Vortag (US)`));
      }
    }
    const kal = await versuche<{ symbol: string; date: string; epsActual?: number | null; epsEstimated?: number | null; revenueEstimated?: number | null }[]>(
      `https://financialmodelingprep.com/stable/earnings-calendar?from=${tag(ctx.jetzt, -2)}&to=${tag(ctx.jetzt)}&apikey=${k}`,
    );
    if (Array.isArray(kal)) {
      const q = quartalszahlenAuswerten(
        kal.map((x) => ({ date: x.date, symbol: x.symbol, epsActual: x.epsActual, epsEstimate: x.epsEstimated, revenueEstimate: x.revenueEstimated })),
        tag(ctx.jetzt),
        'FMP',
        new Set(ctx.universum.map((u) => u.ticker)),
        ctx.jetzt,
      );
      erg.signale.push(...q.signale);
      erg.termine!.push(...(q.termine ?? []));
    }
    if (fehler.length === erg.abfragen) throw new Error(fehler[0]);
    return erg;
  },
};

export const alphaVantage: Quelle = {
  id: 'alphavantage',
  name: 'Alpha Vantage',
  schluessel: 'ALPHAVANTAGE_API_KEY',
  laeufe: ['haupt'],
  // geteilt mit dem claude.ai-Konnektor (25/Tag) → Sammler nutzt höchstens 2
  tageslimit: 2,
  maxProLauf: 2,
  async abrufen(ctx) {
    const k = env('ALPHAVANTAGE_API_KEY');
    const erg: QuellenErgebnis = { signale: [], meldungen: [], abfragen: 0 };
    const tg = await holeJson<{ top_gainers?: { ticker: string; change_percentage: string; price: string; volume: string }[]; most_actively_traded?: { ticker: string; change_percentage: string; volume: string }[] }>(
      `https://www.alphavantage.co/query?function=TOP_GAINERS_LOSERS&apikey=${k}`,
    );
    erg.abfragen++;
    for (const e of (tg.top_gainers ?? []).slice(0, 15)) {
      const pct = parseFloat(e.change_percentage);
      if (!(pct >= 20) || Number(e.volume) < 2e6 || Number(e.price) < 0.01) continue;
      erg.signale.push(signal('kursrakete', { name: e.ticker, ticker: e.ticker }, Math.min(1, 0.3 + pct / 200), 0, ctx.jetzt.toISOString(), 'Alpha Vantage', `Tagesgewinner +${pct.toFixed(0)} % bei ${Number(e.price)} $ (Volumen ${Math.round(Number(e.volume) / 1e6)} Mio.) – spekulativ`));
    }
    for (const e of (tg.most_actively_traded ?? []).slice(0, 10)) {
      if (Number(e.volume) < 5e6) continue;
      erg.signale.push(signal('volumen_ungewoehnlich', { name: e.ticker, ticker: e.ticker }, 0.4, 0, ctx.jetzt.toISOString(), 'Alpha Vantage', `meistgehandelt am Vortag (${e.change_percentage}, Volumen ${Number(e.volume).toLocaleString('de-DE')})`));
    }
    const ns = await holeJson<{ feed?: { title: string; url: string; time_published: string; ticker_sentiment?: { ticker: string; relevance_score: string; ticker_sentiment_score: string }[] }[] }>(
      `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&topics=earnings&sort=LATEST&limit=50&apikey=${k}`,
    );
    erg.abfragen++;
    for (const n of (ns.feed ?? []).slice(0, 50)) {
      const t = n.time_published;
      const zeit = `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}T${t.slice(9, 11)}:${t.slice(11, 13)}:00Z`;
      for (const s of (n.ticker_sentiment ?? []).filter((x) => Number(x.relevance_score) >= 0.5 && Math.abs(Number(x.ticker_sentiment_score)) >= 0.35 && !x.ticker.includes(':'))) {
        const score = Number(s.ticker_sentiment_score);
        erg.signale.push(signal('nachricht', { name: s.ticker, ticker: s.ticker }, Math.min(1, Math.abs(score)), score > 0 ? 1 : -1, zeit, 'Alpha Vantage', `${n.title} (Stimmung ${score.toFixed(2)})`, n.url));
      }
      if (erg.meldungen!.length < 8) erg.meldungen!.push({ titel: n.title, quelle: 'Alpha Vantage', link: n.url, zeit });
    }
    return erg;
  },
};
