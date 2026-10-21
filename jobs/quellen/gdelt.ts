// GDELT DOC 2.0 (frei, für programmatische Nutzung gedacht): aktuelle Artikel zu offenen Positionen.
import { holeJson } from '../lib/netz.ts';
import { schlagzeilenAuswerten } from './hilfen.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';

export function gdeltZeit(s: string): string {
  // "20261021T061500Z" → ISO
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

export const gdelt: Quelle = {
  id: 'gdelt',
  name: 'GDELT (Nachrichten zu Positionen)',
  laeufe: ['haupt', 'stuendlich'],
  maxProLauf: 10,
  async abrufen(ctx) {
    const erg: QuellenErgebnis = { signale: [], meldungen: [], abfragen: 0 };
    for (const o of ctx.offen.slice(0, 10)) {
      const name = o.name.replace(/\b(AG|SE|Inc\.?|Corp\.?|plc|N\.V\.)\b/g, '').trim();
      const q = encodeURIComponent(`"${name}"`);
      const zeitraum = ctx.laufart === 'stuendlich' ? '2h' : '24h';
      const j = await holeJson<{ articles?: { url: string; title: string; seendate: string }[] }>(
        `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=ArtList&format=json&maxrecords=10&timespan=${zeitraum}&sort=DateDesc`,
      ).catch(() => ({ articles: [] }));
      erg.abfragen++;
      const s = schlagzeilenAuswerten(
        (j.articles ?? []).map((a) => ({ titel: a.title.includes(name) ? a.title : `${name}: ${a.title}`, link: a.url, zeit: gdeltZeit(a.seendate) })),
        'GDELT',
        [{ name: o.name, ticker: o.ticker ?? o.name, aliase: [name.toLowerCase()] }],
        ctx.jetzt,
      );
      erg.signale.push(...s.signale);
      erg.meldungen!.push(...s.meldungen.slice(0, 3).map((m) => ({ ...m, wertpapier: o.name })));
      await new Promise((r) => setTimeout(r, 1200)); // GDELT bittet um zurückhaltende Abfragefrequenz
    }
    return erg;
  },
};
