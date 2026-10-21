// Nachrichten per RSS (frei, für automatisches Abonnieren gedacht; robots.txt geprüft 21.10.2026).
import { holeText } from '../lib/netz.ts';
import { schlagzeilenAuswerten } from './hilfen.ts';
import { parseRss } from './parser.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';

const FEEDS: { id: string; name: string; url: string }[] = [
  { id: 'tagesschau', name: 'tagesschau Wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml' },
  { id: 'handelsblatt', name: 'Handelsblatt Finanzen', url: 'https://www.handelsblatt.com/contentexport/feed/finanzen' },
  { id: 'faz', name: 'FAZ Finanzen', url: 'https://www.faz.net/rss/aktuell/finanzen/' },
  { id: 'cnbc', name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
];

export const rssQuellen: Quelle[] = FEEDS.map((f) => ({
  id: f.id,
  name: f.name,
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx): Promise<QuellenErgebnis> {
    const xml = await holeText(f.url, { header: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    const { meldungen, signale } = schlagzeilenAuswerten(parseRss(xml).slice(0, 40), f.name, ctx.universum, ctx.jetzt);
    return { signale, meldungen: meldungen.slice(0, 15), abfragen: 1 };
  },
}));
