// YouTube (offizielle YouTube Data API v3, kostenloser Schlüssel YOUTUBE_API_KEY, 10.000 Einheiten/Tag; Suche = 100 Einheiten).
// Findet stark gesehene Börsenvideos der letzten 24 h und ordnet erwähnte Werte zu ($TICKER, Universum). Nur Stimmung, geringes Gewicht.
// Richtlinien der YouTube API Services: gespeichert wird nur die eigene Zählung (keine Titel, keine Video-IDs);
// der Link führt auf die öffentliche YouTube-Suche.
import type { Signal } from '../../core/signale.ts';
import { erwaehnteWerte, type UniversumWert } from '../../core/texterkennung.ts';
import { holeJson } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import type { Quelle } from './typen.ts';

const SUCHEN = ['stock to buy now', 'penny stock', 'Aktie kaufen', 'stock market news today'];

interface Treffer {
  id?: { videoId?: string };
  snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
}

/** Titel → erwähnte Werte: $TICKER-Schreibweise oder Namen aus dem Universum. */
export function youtubeWerte(titel: string, universum: UniversumWert[]): { name: string; ticker: string }[] {
  const out = new Map<string, { name: string; ticker: string }>();
  for (const m of titel.matchAll(/\$([A-Z]{1,5})\b/g)) out.set(m[1], { name: m[1], ticker: m[1] });
  for (const w of erwaehnteWerte(titel, universum)) out.set(w.ticker, { name: w.name, ticker: w.ticker });
  return [...out.values()];
}

export const youtube: Quelle = {
  id: 'youtube',
  name: 'YouTube (Stimmung)',
  schluessel: 'YOUTUBE_API_KEY',
  laeufe: ['haupt'],
  tageslimit: 8,
  maxProLauf: 4,
  async abrufen(ctx) {
    const key = process.env.YOUTUBE_API_KEY!.trim();
    const seit = new Date(ctx.jetzt.getTime() - 86400000).toISOString();
    const signale: Signal[] = [];
    const zaehler = new Map<string, { w: { name: string; ticker: string }; videos: string[] }>();
    for (const q of SUCHEN) {
      const j = await holeJson<{ items?: Treffer[] }>(
        `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&order=viewCount&maxResults=25&publishedAfter=${encodeURIComponent(seit)}&q=${encodeURIComponent(q)}&key=${key}`,
      );
      for (const t of j.items ?? []) {
        const titel = t.snippet?.title ?? '';
        for (const w of youtubeWerte(titel, ctx.universum)) {
          const z = zaehler.get(w.ticker) ?? { w, videos: [] };
          const id = t.id?.videoId ?? titel;
          if (!z.videos.includes(id)) z.videos.push(id);
          zaehler.set(w.ticker, z);
        }
      }
    }
    for (const z of [...zaehler.values()].sort((a, b) => b.videos.length - a.videos.length).slice(0, 10)) {
      if (z.videos.length < 2) continue; // einzelne Videos sind Rauschen
      signale.push(signal('stimmung_social', z.w, Math.min(1, 0.2 + z.videos.length * 0.1), 0, ctx.jetzt.toISOString(), 'YouTube', `${z.videos.length} viel gesehene Börsenvideos in 24 h erwähnen den Wert (nur Stimmung, kein Fakt)`, `https://www.youtube.com/results?search_query=${encodeURIComponent(z.w.ticker + " stock")}`));
    }
    return { signale, abfragen: SUCHEN.length };
  },
};
