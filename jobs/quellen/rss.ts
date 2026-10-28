// Nachrichten per RSS (frei, für automatisches Abonnieren gedacht; robots.txt geprüft 21.10.2026).
import { holeText } from '../lib/netz.ts';
import { schlagzeilenAuswerten } from './hilfen.ts';
import { parseRss } from './parser.ts';
import type { Laufart, Quelle, QuellenErgebnis } from './typen.ts';

const FEEDS: { id: string; name: string; url: string; laeufe?: Laufart[]; maxAlterStd?: number }[] = [
  { id: 'tagesschau', name: 'tagesschau Wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml' },
  { id: 'handelsblatt', name: 'Handelsblatt Finanzen', url: 'https://www.handelsblatt.com/contentexport/feed/finanzen' },
  { id: 'faz', name: 'FAZ Finanzen', url: 'https://www.faz.net/rss/aktuell/finanzen/' },
  { id: 'cnbc', name: 'CNBC Top News', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html' },
  { id: 'marketwatch', name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/' },
  // Ergänzt 28.10.2026 (robots.txt geprüft). Randquellen: deutsche Krypto-Nachrichten und Nebenwerte-Briefe (wöchentlich → 1×/Tag, 4 Tage Fenster).
  { id: 'btcecho', name: 'BTC-ECHO', url: 'https://www.btc-echo.de/feed/' },
  { id: 'asiancentury', name: 'Asian Century Stocks', url: 'https://www.asiancenturystocks.com/feed', laeufe: ['haupt', 'samstag'], maxAlterStd: 96 },
  { id: 'emskeptic', name: 'Emerging Market Skeptic', url: 'https://emergingmarketskeptic.substack.com/feed', laeufe: ['haupt', 'samstag'], maxAlterStd: 96 },
  { id: 'mikrokap', name: 'The Mikro Kap', url: 'https://www.mikro-kap.com/feed', laeufe: ['haupt', 'samstag'], maxAlterStd: 96 },
];

export const rssQuellen: Quelle[] = FEEDS.map((f) => ({
  id: f.id,
  name: f.name,
  laeufe: f.laeufe ?? ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 1,
  async abrufen(ctx): Promise<QuellenErgebnis> {
    const xml = await holeText(f.url, { header: { Accept: 'application/rss+xml, application/xml, text/xml' } });
    const { meldungen, signale } = schlagzeilenAuswerten(parseRss(xml).slice(0, 40), f.name, ctx.universum, ctx.jetzt, f.maxAlterStd);
    return { signale, meldungen: meldungen.slice(0, 15), abfragen: 1 };
  },
}));
