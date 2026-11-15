// Börsenwert der Coins (CoinGecko Demo) als Merkmal für Rückblick und Zensus. Wichtig gegen Rückschaufehler: Es zählt
// der Börsenwert AM Stichtag (Tagesverlauf aus /coins/{id}/market_chart, höchstens 365 Tage), nie der heutige.
// Reine Funktionen; Abruf und Speichern im privaten Archiv macht jobs/archiv.ts (Teil „boersenwert“).

export interface GeckoMarkt {
  id: string;
  /** Kürzel in Großbuchstaben, z. B. BTC */
  symbol: string;
  cap: number;
  rang: number | null;
}

/** Antwort von /coins/markets (nach Börsenwert sortiert). */
export function parseGeckoMarkets(json: unknown): GeckoMarkt[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((x: Record<string, unknown>) => ({ id: String(x.id ?? ''), symbol: String(x.symbol ?? '').toUpperCase(), cap: Number(x.market_cap), rang: typeof x.market_cap_rank === 'number' ? x.market_cap_rank : null }))
    .filter((m) => m.id && m.symbol && m.cap > 0);
}

/** Kürzel → CoinGecko-ID; bei mehrfach vergebenen Kürzeln gewinnt der Coin mit dem größten Börsenwert. */
export function symbolZuId(maerkte: GeckoMarkt[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const x of [...maerkte].sort((a, b) => b.cap - a.cap)) if (!m.has(x.symbol)) m.set(x.symbol, x.id);
  return m;
}

/** Kraken nennt manche Coins anders (XBT = Bitcoin, XDG = Dogecoin). */
export const krakenZuSymbol = (basis: string) => ({ XBT: 'BTC', XDG: 'DOGE' })[basis] ?? basis;

/** Antwort von /coins/{id}/market_chart: Börsenwert je UTC-Tag (der letzte Wert des Tags). */
export function parseGeckoChart(json: unknown): { datum: string; cap: number }[] {
  const caps = (json as { market_caps?: unknown[] } | null)?.market_caps;
  if (!Array.isArray(caps)) return [];
  const je = new Map<string, number>();
  for (const p of caps) {
    if (!Array.isArray(p) || typeof p[0] !== 'number' || !(Number(p[1]) > 0)) continue;
    je.set(new Date(p[0]).toISOString().slice(0, 10), Number(p[1]));
  }
  return [...je].map(([datum, cap]) => ({ datum, cap })).sort((a, b) => a.datum.localeCompare(b.datum));
}

export interface BoersenwertZeile {
  datum: string;
  /** Kürzel wie in den Signalen (BTC, ETH …) */
  symbol: string;
  /** Börsenwert in US-Dollar */
  cap: number;
}

const KOPF = 'datum,symbol,cap';

/** Zeilen vereinen (je Tag und Coin einer, der neuere gewinnt) und als CSV schreiben. */
export function boersenwertCsv(alt: BoersenwertZeile[], neu: BoersenwertZeile[]): { csv: string; zeilen: number } {
  const m = new Map<string, BoersenwertZeile>();
  for (const z of [...alt, ...neu]) m.set(`${z.datum}|${z.symbol}`, z);
  const liste = [...m.values()].sort((a, b) => a.datum.localeCompare(b.datum) || a.symbol.localeCompare(b.symbol));
  return { csv: `${KOPF}\n${liste.map((z) => `${z.datum},${z.symbol},${Math.round(z.cap)}`).join('\n')}\n`, zeilen: liste.length };
}

export function parseBoersenwertCsv(csv: string): BoersenwertZeile[] {
  const aus: BoersenwertZeile[] = [];
  for (const zeile of csv.split('\n').slice(1)) {
    const [datum, symbol, cap] = zeile.split(',');
    if (datum && symbol && Number(cap) > 0) aus.push({ datum, symbol, cap: Number(cap) });
  }
  return aus;
}

/** Börsenwert am Stichtag: genau dieser Tag oder der letzte bekannte höchstens `toleranz` Tage davor (nie danach). */
export function boersenwertAm(reihe: Map<string, number> | undefined, datum: string, toleranz = 3): number | null {
  if (!reihe) return null;
  for (let n = 0; n <= toleranz; n++) {
    const d = new Date(Date.parse(`${datum}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
    const v = reihe.get(d);
    if (v) return v;
  }
  return null;
}
