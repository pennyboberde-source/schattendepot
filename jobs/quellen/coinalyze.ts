// Coinalyze (kostenlose API mit Schlüssel, 40 Aufrufe/Min.; Doku api.coinalyze.net/v1/doc, geprüft 28.10.2026):
// Liquidationen und vorhergesagtes Funding der Binance-Perpetuals. Bedingung: bei öffentlicher Nutzung Quelle nennen
// (steht in der App unter Quellen). Ohne Secret COINALYZE_API_KEY wird die Quelle übersprungen.
import { holeJson } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';

const BASIS = 'https://api.coinalyze.net/v1';
/** Kürzel → Binance-USDT-Perpetual (Börsencode A) */
export const COINALYZE_SYMBOLE: Record<string, string> = { BTC: 'BTCUSDT_PERP.A', ETH: 'ETHUSDT_PERP.A', SOL: 'SOLUSDT_PERP.A', XRP: 'XRPUSDT_PERP.A', ADA: 'ADAUSDT_PERP.A', DOGE: 'DOGEUSDT_PERP.A' };
const NAMEN: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', ADA: 'Cardano', DOGE: 'Dogecoin' };

export interface Liquidationen {
  symbol: string;
  history: { t: number; l: number; s: number }[];
}

/**
 * Liquidations-Spitze: letzte volle Stunde ≥ 3 × Median der Stunden davor und ≥ 1 Mio. USD.
 * Werden vor allem Longs zwangsverkauft, ist der Verkaufsdruck oft erschöpft (Gegenbewegung) → Richtung +1, sonst −1.
 * Stimmung, kein Fakt – deshalb geringe Stärke.
 */
export function liquidationenAuswerten(daten: Liquidationen[]): { signale: ReturnType<typeof signal>[]; makro: string[] } {
  const signale: ReturnType<typeof signal>[] = [];
  const makro: string[] = [];
  const kuerzel = Object.fromEntries(Object.entries(COINALYZE_SYMBOLE).map(([k, v]) => [v, k]));
  for (const d of daten) {
    const k = kuerzel[d.symbol];
    const h = [...d.history].sort((a, b) => a.t - b.t);
    if (!k || h.length < 6) continue;
    const letzte = h[h.length - 1];
    const summe = (x: { l: number; s: number }) => x.l + x.s;
    const vorher = h.slice(0, -1).map(summe).sort((a, b) => a - b);
    const median = vorher[Math.floor(vorher.length / 2)] || 0;
    const tag = h.reduce((a, x) => a + summe(x), 0);
    if (k === 'BTC' || k === 'ETH') makro.push(`Coinalyze ${k}: Liquidationen 24 h ${(tag / 1e6).toFixed(1)} Mio. $ (Longs ${tag ? Math.round((h.reduce((a, x) => a + x.l, 0) / tag) * 100) : 0} %)`);
    if (summe(letzte) < 1e6 || summe(letzte) < 3 * Math.max(median, 1)) continue;
    const longs = letzte.l >= letzte.s;
    signale.push(
      signal(
        'liquidationen_spitze',
        { name: NAMEN[k] ?? k, ticker: k, markt: 'krypto' },
        0.4,
        longs ? 1 : -1,
        new Date(letzte.t * 1000).toISOString(),
        'Coinalyze',
        `${(summe(letzte) / 1e6).toFixed(1)} Mio. $ Liquidationen in einer Stunde (${Math.round(summe(letzte) / Math.max(median, 1))}× üblich), überwiegend ${longs ? 'Longs' : 'Shorts'}`,
        'https://coinalyze.net/',
      ),
    );
  }
  return { signale, makro };
}

/** Vorhergesagtes Funding (% je 8 h): ≥ 0,05 % = Longs zahlen viel (überfüllt) → Richtung −1; ≤ −0,05 % → +1. */
export function fundingAuswerten(daten: { symbol: string; value: number; update: number }[]): ReturnType<typeof signal>[] {
  const kuerzel = Object.fromEntries(Object.entries(COINALYZE_SYMBOLE).map(([k, v]) => [v, k]));
  return daten
    .filter((d) => kuerzel[d.symbol] && Math.abs(d.value) >= 0.05)
    .map((d) => {
      const k = kuerzel[d.symbol];
      return signal('funding_extrem', { name: NAMEN[k] ?? k, ticker: k, markt: 'krypto' }, Math.min(1, Math.abs(d.value) / 0.15), d.value > 0 ? -1 : 1, new Date(d.update).toISOString(), 'Coinalyze', `vorhergesagtes Funding ${d.value.toFixed(3)} % je 8 h (Binance)`, 'https://coinalyze.net/');
    });
}

export const coinalyze: Quelle = {
  id: 'coinalyze',
  name: 'Coinalyze (Liquidationen, Funding)',
  schluessel: 'COINALYZE_API_KEY',
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 12,
  async abrufen(ctx) {
    const header = { api_key: process.env.COINALYZE_API_KEY!.trim() };
    const symbole = Object.values(COINALYZE_SYMBOLE).join(',');
    const bis = Math.floor(ctx.jetzt.getTime() / 3600000) * 3600 - 1;
    const von = bis - 24 * 3600;
    const liq = await holeJson<Liquidationen[]>(`${BASIS}/liquidation-history?symbols=${symbole}&interval=1hour&from=${von}&to=${bis}&convert_to_usd=true`, { header, versuche: 1 });
    const fund = await holeJson<{ symbol: string; value: number; update: number }[]>(`${BASIS}/predicted-funding-rate?symbols=${symbole}`, { header, versuche: 1 });
    const l = liquidationenAuswerten(liq);
    const erg: QuellenErgebnis = { signale: [...l.signale, ...fundingAuswerten(fund)], makro: l.makro, abfragen: 2 * Object.keys(COINALYZE_SYMBOLE).length };
    return erg;
  },
};
