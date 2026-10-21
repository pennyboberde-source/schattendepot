// FINRA Reg-SHO-Tagesdateien (frei, cdn.finra.org): Leerverkaufsvolumen je US-Aktie.
// Signal: Leerverkaufsquote stark gestiegen (Vortag vs. Tag davor) bei nennenswertem Volumen.
import type { Signal } from '../../core/signale.ts';
import { holeText } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';

export interface ShortZeile {
  symbol: string;
  quote: number;
  volumen: number;
}

/** „Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market“ → Quote je Symbol */
export function parseFinra(txt: string): Map<string, ShortZeile> {
  const m = new Map<string, ShortZeile>();
  for (const z of txt.split('\n').slice(1)) {
    const [, symbol, kurz, , gesamt] = z.split('|');
    const v = Number(gesamt);
    if (!symbol || !(v > 0)) continue;
    m.set(symbol, { symbol, quote: Number(kurz) / v, volumen: v });
  }
  return m;
}

export function finraSignale(heute: Map<string, ShortZeile>, vortag: Map<string, ShortZeile>, datum: string, jetzt: Date, max = 15): Signal[] {
  const kandidaten: { z: ShortZeile; delta: number }[] = [];
  for (const z of heute.values()) {
    const v = vortag.get(z.symbol);
    if (!v || z.volumen < 1_000_000 || z.quote < 0.55) continue;
    const delta = z.quote - v.quote;
    if (delta >= 0.15) kandidaten.push({ z, delta });
  }
  return kandidaten
    .sort((a, b) => b.delta - a.delta)
    .slice(0, max)
    .map(({ z, delta }) =>
      signal(
        'leerverkauf_quote',
        { name: z.symbol, ticker: z.symbol },
        Math.min(1, 0.3 + delta),
        0,
        jetzt.toISOString(),
        'FINRA',
        `Leerverkaufsquote ${Math.round(z.quote * 100)} % (+${Math.round(delta * 100)} Pkt. ggü. Vortag), Volumen ${Math.round(z.volumen / 1e6)} Mio. (${datum})`,
        'https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data',
      ),
    );
}

const datei = (d: Date) => `https://cdn.finra.org/equity/regsho/daily/CNMSshvol${d.toISOString().slice(0, 10).replace(/-/g, '')}.txt`;

export const finra: Quelle = {
  id: 'finra',
  name: 'FINRA Leerverkaufsvolumen (US)',
  laeufe: ['haupt'],
  maxProLauf: 7,
  async abrufen(ctx) {
    // die zwei jüngsten verfügbaren Handelstage suchen (höchstens 7 Tage zurück)
    const gefunden: { datum: string; daten: Map<string, ShortZeile> }[] = [];
    let abfragen = 0;
    for (let i = 1; i <= 7 && gefunden.length < 2; i++) {
      const d = new Date(ctx.jetzt.getTime() - i * 86400000);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      abfragen++;
      try {
        gefunden.push({ datum: d.toISOString().slice(0, 10), daten: parseFinra(await holeText(datei(d), { versuche: 1 })) });
      } catch {
        /* Feiertag oder noch nicht veröffentlicht */
      }
    }
    if (gefunden.length < 2) throw new Error('FINRA: keine zwei Tagesdateien gefunden');
    return { signale: finraSignale(gefunden[0].daten, gefunden[1].daten, gefunden[0].datum, ctx.jetzt), abfragen };
  },
};
