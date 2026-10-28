// Stimmungs- und Positionierungs-Randquellen, alle ohne Anmeldung (robots.txt/Bedingungen geprüft am 28.10.2026):
// - Nasdaq Trader: Handelsstopps (offizieller RSS) – Volatilitätspausen (LUDP) und Nachrichtenstopps, wichtig für Penny Stocks/Daytrading.
// - Apple App Store (offizielle Marketing-RSS-API, Gesamt-Charts USA): Rang von Coinbase/Robinhood & Co. = Euphorie der Privatanleger.
//   (Die alte iTunes-RSS mit Finanz-Kategorie sperrt robots.txt → nicht genutzt.)
// - alternative.me Fear & Greed (frei, Quelle muss neben dem Wert stehen).
// - Deribit DVOL (öffentliche API): implizite Volatilität von BTC/ETH („Krypto-VIX“).
// - Polymarket (öffentliche Gamma-API): Wahrscheinlichkeiten für Fed-Entscheide, Konjunktur, Krypto.
// - CFTC Commitments of Traders (US-Behörde, gemeinfrei): Netto-Positionen der Spekulanten, 3-Jahres-Perzentil.
import type { Signal } from '../../core/signale.ts';
import { holeJson, holeText } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';
import { pz, zustandLesen, zustandSchreiben } from './zustand.ts';

const tagText = (b: string, tag: string) => b.match(new RegExp(`<ndaq:${tag}>([^<]*)</ndaq:${tag}>`))?.[1]?.trim() ?? '';

// ---------- Nasdaq-Handelsstopps ----------
const HALT_GRUND: Record<string, [string, number, -1 | 0 | 1]> = {
  LUDP: ['Volatilitätspause (Limit Up/Down)', 0.5, 0],
  LUDS: ['Volatilitätspause (Straddle)', 0.5, 0],
  M: ['Volatilitätspause', 0.5, 0],
  T1: ['Stopp: Nachricht steht bevor', 0.7, 0],
  T2: ['Stopp: Nachricht veröffentlicht', 0.6, 0],
  T12: ['Stopp: Börse verlangt Informationen', 0.8, -1],
  H10: ['SEC-Handelsaussetzung', 0.9, -1],
  H4: ['Stopp wegen Regelverstoß', 0.8, -1],
  H9: ['Stopp: Meldepflicht verletzt', 0.8, -1],
  H11: ['Regulatorischer Stopp', 0.8, -1],
};

export function handelsstoppsAuswerten(xml: string, jetzt: Date) {
  const bloecke = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
  const jeWert = new Map<string, { name: string; gruende: string[]; zeit: string }>();
  const zaehler: Record<string, number> = {};
  for (const b of bloecke) {
    const symbol = tagText(b, 'IssueSymbol');
    const code = tagText(b, 'ReasonCode');
    const [mo, ta, ja] = tagText(b, 'HaltDate').split('/').map(Number);
    if (!symbol || !ja) continue;
    const datum = new Date(Date.UTC(ja, mo - 1, ta));
    if (jetzt.getTime() - datum.getTime() > 2 * 86400000) continue;
    zaehler[code] = (zaehler[code] ?? 0) + 1;
    const e = jeWert.get(symbol) ?? { name: tagText(b, 'IssueName') || symbol, gruende: [], zeit: datum.toISOString() };
    e.gruende.push(code);
    jeWert.set(symbol, e);
  }
  const signale: Signal[] = [];
  for (const [symbol, e] of jeWert) {
    const haupt = e.gruende.find((g) => HALT_GRUND[g]?.[2] === -1) ?? e.gruende.find((g) => g.startsWith('T')) ?? e.gruende[0];
    const [text, staerke, richtung] = HALT_GRUND[haupt] ?? [`Handelsstopp (${haupt})`, 0.5, 0];
    const mehr = e.gruende.length > 1 ? `, ${e.gruende.length} Stopps` : '';
    signale.push(signal('handelsstopp', { name: e.name, ticker: symbol }, Math.min(1, staerke + (e.gruende.length - 1) * 0.1), richtung, e.zeit, 'Nasdaq Trader', `${text}${mehr} am ${e.zeit.slice(0, 10)}`, 'https://www.nasdaqtrader.com/trader.aspx?id=TradeHalts'));
  }
  const summe = Object.values(zaehler).reduce((a, b) => a + b, 0);
  const makro = summe ? [`Nasdaq-Handelsstopps (2 Tage): ${summe}, davon Volatilitätspausen ${(zaehler.LUDP ?? 0) + (zaehler.M ?? 0)}, Nachrichten ${(zaehler.T1 ?? 0) + (zaehler.T2 ?? 0)}`] : [];
  return { signale: signale.sort((a, b) => b.staerke - a.staerke).slice(0, 30), makro };
}

export const handelsstopps: Quelle = {
  id: 'nasdaqhalts',
  name: 'Nasdaq Trader Handelsstopps',
  laeufe: ['haupt', 'stuendlich'],
  maxProLauf: 1,
  async abrufen(ctx) {
    return { ...handelsstoppsAuswerten(await holeText('https://www.nasdaqtrader.com/rss.aspx?feed=tradehalts'), ctx.jetzt), abfragen: 1 };
  },
};

// ---------- App-Store-Ränge ----------
const APPS: { muster: RegExp; name: string; wp?: { name: string; ticker: string } }[] = [
  { muster: /^coinbase/i, name: 'Coinbase', wp: { name: 'Coinbase Global', ticker: 'COIN' } },
  { muster: /^robinhood/i, name: 'Robinhood', wp: { name: 'Robinhood Markets', ticker: 'HOOD' } },
  { muster: /^crypto\.com/i, name: 'Crypto.com' },
  { muster: /^kraken/i, name: 'Kraken' },
  { muster: /^binance/i, name: 'Binance.US' },
  { muster: /^webull/i, name: 'Webull' },
  { muster: /^moomoo/i, name: 'moomoo' },
  { muster: /^kalshi/i, name: 'Kalshi' },
  { muster: /^polymarket/i, name: 'Polymarket' },
  { muster: /^cash app/i, name: 'Cash App', wp: { name: 'Block', ticker: 'XYZ' } },
];

export function appRaengeAuswerten(namen: string[], vorher: Record<string, number>, jetzt: Date) {
  const raenge: Record<string, number> = {};
  for (const a of APPS) {
    const i = namen.findIndex((n) => a.muster.test(n));
    if (i >= 0) raenge[a.name] = i + 1;
  }
  const signale: Signal[] = [];
  for (const a of APPS) {
    const r = raenge[a.name];
    if (!r || !a.wp) continue;
    const alt = vorher[a.name];
    // Neu in den Top 100 oder ≥ 20 Plätze gesprungen
    if (alt === undefined ? r <= 50 : alt - r >= 20) {
      signale.push(signal('app_ranking', a.wp, Math.min(1, 0.4 + (100 - r) / 150), 0, jetzt.toISOString(), 'Apple App Store', `${a.name}-App auf Platz ${r} der US-Gratis-Charts${alt ? ` (vorher ${alt})` : ' (vorher nicht in den Top 100)'} – Andrang neuer Privatanleger`, 'https://apps.apple.com/us/charts/iphone/top-free-apps/36'));
    }
  }
  const teile = APPS.filter((a) => raenge[a.name]).map((a) => `${a.name} #${raenge[a.name]}${vorher[a.name] ? ` (vorher #${vorher[a.name]})` : ''}`);
  const makro = [`US-App-Store Gesamt-Top-100: ${teile.length ? teile.join(', ') : 'keine Broker-/Krypto-App'} – je höher, desto mehr Andrang von Privatanlegern`];
  return { signale, raenge, makro };
}

export const appRaenge: Quelle = {
  id: 'appstore',
  name: 'Apple App Store (Broker-/Krypto-Apps)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const z = zustandLesen<{ raenge?: Record<string, number> }>('appstore', {});
    const j = await holeJson<{ feed?: { results?: { name: string }[] } }>('https://rss.marketingtools.apple.com/api/v2/us/apps/top-free/100/apps.json', { zeitlimitMs: 25000, versuche: 2 });
    const r = appRaengeAuswerten((j.feed?.results ?? []).map((x) => x.name), z.raenge ?? {}, ctx.jetzt);
    zustandSchreiben('appstore', { raenge: r.raenge });
    return { signale: r.signale, makro: r.makro, abfragen: 1 };
  },
};

// ---------- Krypto Fear & Greed + Deribit DVOL ----------
export function angstGierAuswerten(daten: { value: string; value_classification: string }[], jetzt: Date) {
  const [heute, gestern] = daten.map((d) => ({ wert: Number(d.value), text: d.value_classification }));
  if (!heute || !Number.isFinite(heute.wert)) return { signale: [] as Signal[], makro: [] as string[] };
  const makro = [`Krypto Fear & Greed: ${heute.wert} (${heute.text})${gestern ? `, gestern ${gestern.wert}` : ''} – Quelle: alternative.me`];
  const signale: Signal[] = [];
  if (heute.wert <= 15 || heute.wert >= 85) {
    signale.push(signal('stimmung_extrem', { name: 'Bitcoin', ticker: 'BTC', markt: 'krypto' }, Math.min(1, Math.abs(heute.wert - 50) / 45), 0, jetzt.toISOString(), 'alternative.me', `Krypto Fear & Greed ${heute.wert} (${heute.text}) – Extremwerte drehen oft`, 'https://alternative.me/crypto/fear-and-greed-index/'));
  }
  return { signale, makro };
}

export function dvolAuswerten(coin: string, reihe: number[][], jetzt: Date) {
  const schluss = reihe.map((r) => r[4]).filter((x) => Number.isFinite(x));
  if (schluss.length < 2) return { signale: [] as Signal[], makro: [] as string[] };
  const letzter = schluss[schluss.length - 1];
  const vortag = schluss[schluss.length - 2];
  const woche = schluss[Math.max(0, schluss.length - 8)];
  const makro = [`${coin}-Volatilität DVOL (Deribit): ${letzter.toLocaleString('de-DE', { maximumFractionDigits: 1 })} (Vortag ${vortag.toLocaleString('de-DE', { maximumFractionDigits: 1 })}, vor 7 Tagen ${woche.toLocaleString('de-DE', { maximumFractionDigits: 1 })})`];
  const d = (letzter / vortag - 1) * 100;
  const signale: Signal[] = [];
  if (Math.abs(d) >= 15) {
    signale.push(signal('volatilitaet_sprung', { name: coin === 'BTC' ? 'Bitcoin' : 'Ethereum', ticker: coin, markt: 'krypto' }, Math.min(1, Math.abs(d) / 40), 0, jetzt.toISOString(), 'Deribit DVOL', `Implizite Volatilität ${pz(d)} % zum Vortag (${letzter.toFixed(1)}) – Markt erwartet große Bewegung`, 'https://www.deribit.com/statistics/BTC/volatility-index'));
  }
  return { signale, makro };
}

export const kryptoStimmung: Quelle = {
  id: 'kryptostimmung',
  name: 'Fear & Greed (alternative.me) + DVOL (Deribit)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 3,
  async abrufen(ctx) {
    const fg = await holeJson<{ data?: { value: string; value_classification: string }[] }>('https://api.alternative.me/fng/?limit=2');
    const a = angstGierAuswerten(fg.data ?? [], ctx.jetzt);
    const signale = [...a.signale];
    const makro = [...a.makro];
    let abfragen = 1;
    const bis = ctx.jetzt.getTime();
    for (const coin of ['BTC', 'ETH']) {
      try {
        const j = await holeJson<{ result?: { data?: number[][] } }>(`https://www.deribit.com/api/v2/public/get_volatility_index_data?currency=${coin}&resolution=1D&start_timestamp=${bis - 10 * 86400000}&end_timestamp=${bis}`);
        abfragen++;
        const d = dvolAuswerten(coin, j.result?.data ?? [], ctx.jetzt);
        signale.push(...d.signale);
        makro.push(...d.makro);
      } catch {
        // Zusatz
      }
    }
    return { signale, makro, abfragen };
  },
};

// ---------- Polymarket ----------
export interface PmMarkt {
  id: string;
  question?: string;
  groupItemTitle?: string;
  outcomePrices?: string;
  closed?: boolean;
}
export interface PmEreignis {
  title: string;
  slug?: string;
  markets?: PmMarkt[];
}

const jaPreis = (m: PmMarkt) => {
  try {
    return Number(JSON.parse(m.outcomePrices ?? '[]')[0]);
  } catch {
    return NaN;
  }
};

export function polymarketZeilen(ereignisse: PmEreignis[], vorher: Record<string, number>) {
  const zeilen: string[] = [];
  const jetzt: Record<string, number> = {};
  for (const e of ereignisse) {
    // Platzhalter-Ausgänge („Company F“, „Person B“) überspringen
    const ms = (e.markets ?? [])
      .filter((m) => !m.closed && !/^(company|person|player|team|option|other) [a-z0-9]{1,2}$/i.test(m.groupItemTitle ?? ''))
      .map((m) => ({ m, p: jaPreis(m) }))
      .filter((x) => x.p >= 0.03 && x.p <= 0.99);
    if (!ms.length) continue;
    ms.sort((a, b) => b.p - a.p);
    const teile = ms.slice(0, 2).map(({ m, p }) => {
      jetzt[m.id] = Math.round(p * 1000) / 1000;
      const alt = vorher[m.id];
      const diff = alt !== undefined ? Math.round((p - alt) * 100) : 0;
      return `${ms.length > 1 || (e.markets ?? []).length > 1 ? `${m.groupItemTitle || m.question}: ` : ''}${Math.round(p * 100)} %${Math.abs(diff) >= 10 ? ` (${diff > 0 ? '+' : ''}${diff} Pkt.)` : ''}`;
    });
    zeilen.push(`Polymarket „${e.title}“ – ${teile.join(', ')}`);
  }
  return { zeilen, preise: jetzt };
}

export const polymarket: Quelle = {
  id: 'polymarket',
  name: 'Polymarket (Prognosemarkt)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 2,
  async abrufen() {
    const z = zustandLesen<{ preise?: Record<string, number> }>('polymarket', {});
    const url = (tag: string, n: number) => `https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=${n}&tag_slug=${tag}`;
    const wirtschaft = await holeJson<PmEreignis[]>(url('economy', 6), { zeitlimitMs: 20000 });
    const krypto = await holeJson<PmEreignis[]>(url('crypto', 4), { zeitlimitMs: 20000 });
    const r = polymarketZeilen([...wirtschaft, ...krypto], z.preise ?? {});
    zustandSchreiben('polymarket', { preise: r.preise });
    return { signale: [], makro: r.zeilen.slice(0, 5), abfragen: 2 };
  },
};

// ---------- CFTC Commitments of Traders ----------
const COT_MAERKTE: Record<string, { name: string; ticker: string; markt?: 'krypto' | 'rohstoff' }> = {
  'GOLD - COMMODITY EXCHANGE INC.': { name: 'Gold (Rohstoff)', ticker: 'XAU', markt: 'rohstoff' },
  'SILVER - COMMODITY EXCHANGE INC.': { name: 'Silber (Rohstoff)', ticker: 'XAG', markt: 'rohstoff' },
  'COPPER- #1 - COMMODITY EXCHANGE INC.': { name: 'Kupfer (Rohstoff)', ticker: 'COPPER', markt: 'rohstoff' },
  'WTI-PHYSICAL - NEW YORK MERCANTILE EXCHANGE': { name: 'Rohöl WTI (Rohstoff)', ticker: 'WTIOIL', markt: 'rohstoff' },
  'NAT GAS NYME - NEW YORK MERCANTILE EXCHANGE': { name: 'Erdgas (Rohstoff)', ticker: 'NATGAS', markt: 'rohstoff' },
  'E-MINI S&P 500 - CHICAGO MERCANTILE EXCHANGE': { name: 'S&P 500', ticker: 'SPX' },
  'BITCOIN - CHICAGO MERCANTILE EXCHANGE': { name: 'Bitcoin', ticker: 'BTC', markt: 'krypto' },
  'ETHER CASH SETTLED - CHICAGO MERCANTILE EXCHANGE': { name: 'Ethereum', ticker: 'ETH', markt: 'krypto' },
};

export interface CotZeile {
  market_and_exchange_names: string;
  report_date_as_yyyy_mm_dd: string;
  open_interest_all: string;
  noncomm_positions_long_all: string;
  noncomm_positions_short_all: string;
}

/** Netto-Position der Spekulanten in % des Open Interest und ihr Perzentil der letzten 3 Jahre. */
export function cotAuswerten(zeilen: CotZeile[], jetzt: Date) {
  const jeMarkt = new Map<string, { datum: string; netto: number }[]>();
  for (const z of zeilen) {
    const oi = Number(z.open_interest_all);
    if (!COT_MAERKTE[z.market_and_exchange_names] || !(oi > 0)) continue;
    const netto = ((Number(z.noncomm_positions_long_all) - Number(z.noncomm_positions_short_all)) / oi) * 100;
    const l = jeMarkt.get(z.market_and_exchange_names) ?? [];
    l.push({ datum: z.report_date_as_yyyy_mm_dd.slice(0, 10), netto });
    jeMarkt.set(z.market_and_exchange_names, l);
  }
  const signale: Signal[] = [];
  const teile: string[] = [];
  let neuestes = '';
  for (const [markt, reihe] of jeMarkt) {
    reihe.sort((a, b) => a.datum.localeCompare(b.datum));
    const akt = reihe[reihe.length - 1];
    if (reihe.length < 20) continue;
    neuestes = akt.datum > neuestes ? akt.datum : neuestes;
    const perzentil = Math.round((reihe.filter((r) => r.netto <= akt.netto).length / reihe.length) * 100);
    const wp = COT_MAERKTE[markt];
    const vorwoche = reihe[reihe.length - 2]?.netto ?? akt.netto;
    teile.push(`${wp.name.replace(' (Rohstoff)', '')} ${pz(akt.netto, 0)} % (Vorw. ${pz(vorwoche, 0)}, P${perzentil})`);
    if (perzentil >= 92 || perzentil <= 8) {
      signale.push(signal('cot_extrem', wp, Math.min(1, Math.abs(perzentil - 50) / 50), 0, jetzt.toISOString(), 'CFTC COT', `Spekulanten so ${perzentil >= 92 ? 'stark long' : 'stark short'} wie selten (Perzentil ${perzentil} % über 3 Jahre, Stand ${akt.datum}) – Extrem-Positionierung dreht oft`, 'https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm'));
    }
  }
  const makro = teile.length ? [`COT ${neuestes} – Spekulanten netto in % des Open Interest, P = Perzentil über 3 Jahre: ${teile.join('; ')}`] : [];
  return { signale, makro, neuestes };
}

export const cftcCot: Quelle = {
  id: 'cftccot',
  name: 'CFTC Commitments of Traders (wöchentlich)',
  laeufe: ['haupt', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const z = zustandLesen<{ stand?: string }>('cftccot', {});
    const ab = new Date(ctx.jetzt.getTime() - 3 * 365 * 86400000).toISOString().slice(0, 10);
    const namen = Object.keys(COT_MAERKTE).map((n) => `'${n.replace(/'/g, "''")}'`).join(',');
    const where = `report_date_as_yyyy_mm_dd >= '${ab}' AND market_and_exchange_names in(${namen})`;
    const sel = 'market_and_exchange_names,report_date_as_yyyy_mm_dd,open_interest_all,noncomm_positions_long_all,noncomm_positions_short_all';
    const zeilen = await holeJson<CotZeile[]>(`https://publicreporting.cftc.gov/resource/6dca-aqww.json?$select=${sel}&$where=${encodeURIComponent(where)}&$limit=5000`, { zeitlimitMs: 30000 });
    const r = cotAuswerten(zeilen, ctx.jetzt);
    // Extrem-Signale nur einmal je neuem Bericht; die Makro-Zeilen stehen jeden Tag im Lagebild
    const neu = r.neuestes && r.neuestes !== z.stand;
    if (neu) zustandSchreiben('cftccot', { stand: r.neuestes });
    return { signale: neu ? r.signale : [], makro: r.makro, abfragen: 1 };
  },
};
