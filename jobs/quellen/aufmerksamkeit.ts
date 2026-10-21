// Aufmerksamkeit: Wikipedia-Seitenaufrufe (offizielle Wikimedia-REST-API, mit aussagekräftigem User-Agent erlaubt).
// Plötzliche Spitzen (Vortag ≥ 3× Median der Woche davor) gehen Kursbewegungen laut Forschung oft voraus.
import type { Signal } from '../../core/signale.ts';
import { holeJson } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';

// Wikimedia-Regeln (2026): User-Agent mit Kontakt-URL → 200 Abfragen/Min., höchstens 3 gleichzeitig, bei 429 aufhören.
const UA = 'Schattendepot/0.3 (https://github.com/pennyboberde-source/schattendepot; private Boersen-Simulation) node-fetch';
const PAUSE_MS = 700; // ≤ ~85 Abfragen/Min., deutlich unter dem Limit

export function aufmerksamkeitsSpitze(views: number[]): { faktor: number; letzter: number } | null {
  if (views.length < 5) return null;
  const letzter = views[views.length - 1];
  const vorher = [...views.slice(0, -1)].sort((a, b) => a - b);
  const median = vorher[Math.floor(vorher.length / 2)];
  if (!(median > 0) || letzter < 2000) return null;
  const faktor = letzter / median;
  return faktor >= 3 ? { faktor, letzter } : null;
}

const tag = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

export const aufmerksamkeit: Quelle = {
  id: 'wikipedia',
  name: 'Wikipedia-Seitenaufrufe (Aufmerksamkeit)',
  laeufe: ['haupt'],
  maxProLauf: 45,
  async abrufen(ctx) {
    const bis = new Date(ctx.jetzt.getTime() - 86400000);
    const von = new Date(ctx.jetzt.getTime() - 9 * 86400000);
    const signale: Signal[] = [];
    let abfragen = 0;
    let fehler = 0;
    for (const w of ctx.universum.filter((x) => (x as { wiki?: string }).wiki)) {
      const titel = (w as { wiki?: string }).wiki!;
      if (abfragen > 0) await new Promise((r) => setTimeout(r, PAUSE_MS));
      abfragen++;
      try {
        const j = await holeJson<{ items?: { views: number }[] }>(
          `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(titel)}/daily/${tag(von)}/${tag(bis)}`,
          { header: { 'User-Agent': UA }, versuche: 1 },
        );
        const s = aufmerksamkeitsSpitze((j.items ?? []).map((i) => i.views));
        if (s) signale.push(signal('stimmung_social', { name: w.name, ticker: w.ticker }, Math.min(1, 0.3 + s.faktor / 15), 0, ctx.jetzt.toISOString(), 'Wikipedia', `Aufmerksamkeitsspitze: ${s.letzter.toLocaleString('de-DE')} Aufrufe gestern (${s.faktor.toFixed(1)}× üblich)`, `https://en.wikipedia.org/wiki/${titel}`));
      } catch (e) {
        fehler++;
        // Gebremst (429) → sofort aufhören, nicht weiter anfragen
        if (/429|too many/i.test(String(e))) throw new Error('Wikimedia bremst (429) – Lauf abgebrochen');
      }
    }
    if (fehler === abfragen && abfragen > 0) throw new Error('alle Wikimedia-Abfragen fehlgeschlagen');
    return { signale, abfragen };
  },
};
