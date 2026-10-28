// Krypto-Randquellen, alle ohne Anmeldung (robots.txt und Bedingungen geprüft am 28.10.2026):
// - Upbit (größte Börse Koreas, offizielle Quotation-API, 10 Abfragen/s je Gruppe): Warnhinweise der Börse je Coin,
//   Neulistungen (Vergleich mit der Marktliste vom Vortag), Kimchi-Prämie (BTC in Korea gegen USD-Markt).
// - Kraken Futures (öffentliche API): Funding Rates und Open Interest der Perpetuals.
// - DefiLlama (offene API): Protokoll-Gebühren und Stablecoin-Menge. Token-Unlocks sind dort kostenpflichtig → nicht genutzt.
import type { Signal } from '../../core/signale.ts';
import { holeJson } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';
import { kurz, pz, zustandLesen, zustandSchreiben } from './zustand.ts';

// ---------- Upbit ----------
export interface UpbitMarkt {
  market: string;
  english_name: string;
  market_event?: { warning?: boolean; caution?: Record<string, boolean> };
}

const UPBIT_HINWEIS: Record<string, string> = {
  PRICE_FLUCTUATIONS: 'starke Preisschwankung',
  TRADING_VOLUME_SOARING: 'Handelsvolumen schießt hoch',
  DEPOSIT_AMOUNT_SOARING: 'Einzahlungen schießen hoch',
  GLOBAL_PRICE_DIFFERENCES: 'großer Preisunterschied zum Ausland',
  CONCENTRATION_OF_SMALL_ACCOUNTS: 'Handel auf wenige Konten konzentriert',
};

export function upbitAuswerten(maerkte: UpbitMarkt[], vorher: string[] | null, jetzt: Date) {
  const krw = maerkte.filter((m) => m.market.startsWith('KRW-'));
  const codes = krw.map((m) => m.market).sort();
  // Neulistung nur, wenn eine brauchbare Vortagsliste existiert (erster Lauf meldet nicht 300 „neue“ Coins)
  const neu = vorher && vorher.length > 50 ? codes.filter((c) => !vorher.includes(c)) : [];
  const zeit = jetzt.toISOString();
  const signale: Signal[] = [];
  for (const m of krw) {
    const wp = { name: m.english_name, ticker: m.market.slice(4), markt: 'krypto' as const };
    const link = `https://upbit.com/exchange?code=CRIX.UPBIT.${m.market}`;
    if (neu.includes(m.market)) signale.push(signal('neulistung', wp, 0.6, 1, zeit, 'Upbit', `Neu an Upbit gelistet (KRW): ${m.english_name}. Listing-Sprünge verpuffen oft binnen Stunden.`, link));
    const gruende = Object.entries(m.market_event?.caution ?? {}).filter(([, v]) => v).map(([k]) => UPBIT_HINWEIS[k] ?? k);
    if (m.market_event?.warning) gruende.unshift('Investment-Warnung der Börse');
    if (gruende.length) signale.push(signal('upbit_warnung', wp, Math.min(1, 0.3 + gruende.length * 0.2), 0, zeit, 'Upbit', `Upbit-Hinweis ${m.english_name}: ${gruende.join(', ')}`, link));
  }
  return { signale, codes, neu };
}

export interface UpbitTicker {
  market: string;
  signed_change_rate?: number;
  acc_trade_price_24h?: number;
}

/** Tagesraketen an Upbit (≥ 20 % seit Tagesbeginn KST, ≥ 5 Mrd. ₩ Umsatz in 24 h) – für den Hot-Stuff-Rückblick. */
export function upbitRaketen(ticker: UpbitTicker[], maerkte: UpbitMarkt[], jetzt: Date): Signal[] {
  const namen = new Map(maerkte.map((m) => [m.market, m.english_name]));
  return ticker
    .filter((t) => t.market.startsWith('KRW-') && Math.abs(t.signed_change_rate ?? 0) >= 0.2 && (t.acc_trade_price_24h ?? 0) >= 5e9)
    .map((t) => {
      const p = (t.signed_change_rate ?? 0) * 100;
      const name = namen.get(t.market) ?? t.market.slice(4);
      return signal('kursrakete', { name, ticker: t.market.slice(4), markt: 'krypto' }, Math.min(1, Math.abs(p) / 50), p > 0 ? 1 : -1, jetzt.toISOString(), 'Upbit', `${name} ${pz(p)} % an Upbit seit Tagesbeginn (Korea)`, `https://upbit.com/exchange?code=CRIX.UPBIT.${t.market}`);
    });
}

/** Kimchi-Prämie in %: Bitcoin-Preis in Korea gegen den USD-Weltmarkt zum offiziellen Wechselkurs. */
export function kimchiPraemie(krwBtc: number, usdBtc: number, usdKrw: number): number {
  return (krwBtc / (usdBtc * usdKrw) - 1) * 100;
}

interface UpbitZustand {
  krw?: string[];
  praemie?: { wert: number; zeit: string };
}

export const upbit: Quelle = {
  id: 'upbit',
  name: 'Upbit (Korea, Krypto)',
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 5,
  async abrufen(ctx) {
    const z = zustandLesen<UpbitZustand>('upbit', {});
    const maerkte = await holeJson<UpbitMarkt[]>('https://api.upbit.com/v1/market/all?isDetails=true');
    const { signale, codes, neu } = upbitAuswerten(maerkte, z.krw ?? null, ctx.jetzt);
    let abfragen = 1;
    const makro: string[] = [];
    try {
      const [t] = await holeJson<{ trade_price: number }[]>('https://api.upbit.com/v1/ticker?markets=KRW-BTC');
      const k = await holeJson<{ result?: Record<string, { c: string[] }> }>('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      const fx = await holeJson<{ rates?: { KRW?: number } }>('https://api.frankfurter.app/latest?from=USD&to=KRW');
      abfragen += 3;
      const usdBtc = Number(Object.values(k.result ?? {})[0]?.c?.[0]);
      const usdKrw = Number(fx.rates?.KRW);
      if (t?.trade_price && usdBtc > 0 && usdKrw > 0) {
        const p = kimchiPraemie(t.trade_price, usdBtc, usdKrw);
        const alt = z.praemie?.wert;
        makro.push(`Kimchi-Prämie (BTC in Korea gegen USD-Markt): ${pz(p, 2)} %${alt !== undefined ? ` (vorher ${pz(alt, 2)} %)` : ''}. Steigend = Kaufdruck koreanischer Privatanleger.`);
        z.praemie = { wert: Math.round(p * 100) / 100, zeit: ctx.jetzt.toISOString() };
      }
    } catch {
      // Die Prämie ist ein Zusatz – die Marktliste mit Warnhinweisen zählt trotzdem.
    }
    try {
      const alle = await holeJson<UpbitTicker[]>('https://api.upbit.com/v1/ticker/all?quote_currencies=KRW');
      abfragen++;
      signale.push(...upbitRaketen(alle, maerkte, ctx.jetzt));
    } catch {
      // Zusatz für den Hot-Stuff-Rückblick
    }
    if (neu.length) makro.push(`Upbit-Neulistungen: ${neu.map((c) => c.slice(4)).join(', ')}`);
    zustandSchreiben('upbit', { ...z, krw: codes });
    return { signale, makro, abfragen };
  },
};

// ---------- Kraken Futures ----------
export interface FuturesTicker {
  symbol: string;
  markPrice?: number;
  openInterest?: number;
  /** Funding je Stunde relativ zum Preis */
  relativeFundingRate?: number;
  volumeQuote?: number;
  suspended?: boolean;
}

const coinVon = (symbol: string) => symbol.slice(3, -3).replace(/^XBT$/, 'BTC');
// Kraken Futures führt auch Rohstoff-Perpetuals – über ETCs handelbar, daher behalten, aber lesbar benennen.
const ROHSTOFFE: Record<string, string> = { XAU: 'Gold', XAG: 'Silber', XPT: 'Platin', XPD: 'Palladium', WTIOIL: 'Rohöl WTI', BRENTOIL: 'Rohöl Brent', NATGAS: 'Erdgas', COPPER: 'Kupfer' };

export function krakenFuturesAuswerten(tickers: FuturesTicker[], oiVorher: Record<string, number>, jetzt: Date) {
  const perps = tickers.filter((t) => /^PF_[A-Z0-9]+USD$/.test(t.symbol) && !t.suspended && Number.isFinite(t.relativeFundingRate) && (t.volumeQuote ?? 0) >= 2_000_000);
  const zeit = jetzt.toISOString();
  const signale: Signal[] = [];
  const oi: Record<string, number> = {};
  const fundingPa: Record<string, number> = {};
  for (const t of perps) {
    const coin = coinVon(t.symbol);
    const pa = (t.relativeFundingRate ?? 0) * 24 * 365 * 100;
    fundingPa[coin] = pa;
    const oiUsd = (t.openInterest ?? 0) * (t.markPrice ?? 0);
    oi[coin] = Math.round(oiUsd);
    const wp = ROHSTOFFE[coin] ? { name: `${ROHSTOFFE[coin]} (Rohstoff)`, ticker: coin, markt: 'rohstoff' as const } : { name: coin, ticker: coin, markt: 'krypto' as const };
    const link = `https://futures.kraken.com/trade/futures/${t.symbol}`;
    if (Math.abs(pa) >= 50) {
      const deutung = pa > 0 ? 'viele gehebelte Käufer, überhitzt?' : 'viele gehebelte Leerverkäufer, Short-Squeeze möglich';
      signale.push(signal('funding_extrem', wp, Math.min(1, Math.abs(pa) / 150), 0, zeit, 'Kraken Futures', `Funding ${pz(pa)} % p. a. (${deutung})`, link));
    }
    const alt = oiVorher[coin];
    if (alt > 0 && oiUsd >= 5_000_000) {
      const d = (oiUsd / alt - 1) * 100;
      if (Math.abs(d) >= 25) {
        const deutung = d > 0 ? 'neues gehebeltes Geld' : 'Positionen werden aufgelöst';
        signale.push(signal('open_interest_sprung', wp, Math.min(1, Math.abs(d) / 80), 0, zeit, 'Kraken Futures', `Open Interest ${pz(d)} % seit gestern (${kurz(oiUsd)} $, ${deutung})`, link));
      }
    }
  }
  const makro: string[] = [];
  const teile = ['BTC', 'ETH', 'SOL'].filter((c) => fundingPa[c] !== undefined).map((c) => `${c} ${pz(fundingPa[c])} %`);
  if (teile.length) makro.push(`Funding p. a. (Kraken Futures): ${teile.join(', ')}. Hoch positiv = gehebelte Käufer dominieren.`);
  return { signale, oi, makro };
}

export const krakenFutures: Quelle = {
  id: 'krakenfutures',
  name: 'Kraken Futures (Funding, Open Interest)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const z = zustandLesen<{ oi?: Record<string, number> }>('krakenfutures', {});
    const j = await holeJson<{ tickers?: FuturesTicker[] }>('https://futures.kraken.com/derivatives/api/v3/tickers', { zeitlimitMs: 20000 });
    const { signale, oi, makro } = krakenFuturesAuswerten(j.tickers ?? [], z.oi ?? {}, ctx.jetzt);
    zustandSchreiben('krakenfutures', { oi, zeit: ctx.jetzt.toISOString() });
    return { signale, makro, abfragen: 1 };
  },
};

// ---------- DefiLlama ----------
export interface FeesProtokoll {
  defillamaId?: string;
  displayName?: string;
  name: string;
  total7d?: number;
  change_7dover7d?: number;
  category?: string;
}
export interface LlamaProtokoll {
  id: string;
  symbol?: string;
  mcap?: number;
}
export interface Stablecoin {
  pegType?: string;
  circulating?: { peggedUSD?: number };
  circulatingPrevWeek?: { peggedUSD?: number };
}

/** Protokolle, deren Gebühren (also echte Nutzung) in 7 Tagen kräftig gewachsen sind und die einen handelbaren Token haben. */
export function gebuehrenSprung(fees: FeesProtokoll[], protokolle: LlamaProtokoll[], jetzt: Date): Signal[] {
  const symbol = new Map(protokolle.filter((p) => p.symbol && p.symbol !== '-').map((p) => [p.id, p] as const));
  const out: Signal[] = [];
  for (const f of fees) {
    const p = f.defillamaId ? symbol.get(f.defillamaId) : undefined;
    const w = f.change_7dover7d ?? 0;
    // Vorwoche muss schon nennenswert sein – sonst sind +29.000 % nur ein Neustart von fast null
    const vorwoche = (f.total7d ?? 0) / (1 + w / 100);
    if (!p?.symbol || (f.total7d ?? 0) < 1_000_000 || w < 40 || w > 1000 || vorwoche < 250_000) continue;
    const name = f.displayName ?? f.name;
    out.push(
      signal('krypto_einnahmen', { name, ticker: p.symbol.toUpperCase(), markt: 'krypto' }, Math.min(1, 0.3 + w / 200), 1, jetzt.toISOString(), 'DefiLlama',
        `${name} (${p.symbol}): Gebühren 7 Tage ${kurz(f.total7d!)} $, ${pz(w)} % gegenüber der Vorwoche${p.mcap ? `, Marktwert ${kurz(p.mcap)} $` : ''}`,
        `https://defillama.com/protocol/${encodeURIComponent((f.name ?? '').toLowerCase().replace(/\s+/g, '-'))}`),
    );
  }
  return out.sort((a, b) => b.staerke - a.staerke).slice(0, 12);
}

export function stablecoinMenge(assets: Stablecoin[]): string | null {
  const usd = assets.filter((a) => a.pegType === 'peggedUSD');
  const jetzt = usd.reduce((s, a) => s + (a.circulating?.peggedUSD ?? 0), 0);
  const woche = usd.reduce((s, a) => s + (a.circulatingPrevWeek?.peggedUSD ?? 0), 0);
  if (!(jetzt > 0 && woche > 0)) return null;
  return `Stablecoin-Menge ${kurz(jetzt)} $ (7 Tage ${pz((jetzt / woche - 1) * 100, 2)} %). Wachsend = frisches Geld für Krypto.`;
}

export const defiLlama: Quelle = {
  id: 'defillama',
  name: 'DefiLlama (Gebühren, Stablecoins)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 3,
  async abrufen(ctx) {
    const lang = { zeitlimitMs: 45000 };
    const fees = await holeJson<{ protocols?: FeesProtokoll[] }>('https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true', lang);
    const protokolle = await holeJson<LlamaProtokoll[]>('https://api.llama.fi/protocols', lang);
    const signale = gebuehrenSprung(fees.protocols ?? [], protokolle, ctx.jetzt);
    let abfragen = 2;
    const makro: string[] = [];
    try {
      const st = await holeJson<{ peggedAssets?: Stablecoin[] }>('https://stablecoins.llama.fi/stablecoins?includePrices=false', lang);
      abfragen++;
      const m = stablecoinMenge(st.peggedAssets ?? []);
      if (m) makro.push(m);
    } catch {
      // Zusatz
    }
    return { signale, makro, abfragen };
  },
};
