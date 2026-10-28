// GDELT DOC 2.0 (frei, für programmatische Nutzung gedacht): aktuelle Artikel zu offenen Positionen.
// S4-Reparatur: früher je Position eine Abfrage (bis 10 × mit Wiederholungen) → GDELT erlaubt nur 1 Abfrage je 5 s
// und das Zeitlimit von 45 s riss seit dem 22.10. bei jedem Lauf. Jetzt EINE ODER-Abfrage für alle Positionen,
// eigenes kurzes Zeitlimit, kein Wiederholen; die Artikel werden danach den Positionen zugeordnet.
import { HttpFehler, holeText } from '../lib/netz.ts';
import { schlagzeilenAuswerten } from './hilfen.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';

export function gdeltZeit(s: string): string {
  // "20261021T061500Z" → ISO
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

/** Firmenname ohne Rechtsform (für Suche und Zuordnung). */
export function suchname(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\b(AG|SE|Inc\.?|Corp\.?|Corporation|plc|N\.V\.|Holdings?|Group|Co\.?|Ltd\.?)\b/gi, '')
    .replace(/[^\p{L}\p{N}&\- ]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function gdeltAbfrage(namen: string[], zeitraum: string, maxrecords = 75): string {
  const teile = [...new Set(namen.map(suchname).filter((n) => n.length >= 3))].map((n) => `"${n}"`);
  const q = teile.length > 1 ? `(${teile.join(' OR ')})` : (teile[0] ?? '');
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=ArtList&format=json&maxrecords=${maxrecords}&timespan=${zeitraum}&sort=DateDesc`;
}

/** Antwort lesen; GDELT schickt bei Überlast Klartext („Please limit requests …“) statt JSON. */
export function gdeltArtikel(text: string): { url: string; title: string; seendate: string }[] {
  try {
    return (JSON.parse(text) as { articles?: { url: string; title: string; seendate: string }[] }).articles ?? [];
  } catch {
    throw new Error(`GDELT antwortet ohne JSON: ${text.slice(0, 80)}`);
  }
}

export const gdelt: Quelle = {
  id: 'gdelt',
  name: 'GDELT (Nachrichten zu Positionen)',
  laeufe: ['haupt', 'stuendlich'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const erg: QuellenErgebnis = { signale: [], meldungen: [], abfragen: 0 };
    const offen = ctx.offen.slice(0, 15);
    if (!offen.length) return erg;
    const zeitraum = ctx.laufart === 'stuendlich' ? '2h' : '24h';
    let text: string;
    try {
      text = await holeText(gdeltAbfrage(offen.map((o) => o.name), zeitraum), { versuche: 1, zeitlimitMs: 25000 });
    } catch (e) {
      // GDELT sperrt geteilte IPs (z. B. GitHub Actions) oft per HTTP 429 – schnell und verständlich melden statt zu hängen
      if (e instanceof HttpFehler && e.status === 429) throw new Error('GDELT drosselt (HTTP 429: höchstens 1 Abfrage je 5 s, geteilte IPs oft gesperrt)');
      throw e;
    }
    const artikel = gdeltArtikel(text);
    erg.abfragen = 1;
    for (const o of offen) {
      const name = suchname(o.name);
      if (name.length < 3) continue;
      const passend = artikel.filter((a) => a.title.toLowerCase().includes(name.toLowerCase()));
      const s = schlagzeilenAuswerten(
        passend.map((a) => ({ titel: a.title, link: a.url, zeit: gdeltZeit(a.seendate) })),
        'GDELT',
        [{ name: o.name, ticker: o.ticker ?? o.name, aliase: [name.toLowerCase()] }],
        ctx.jetzt,
      );
      erg.signale.push(...s.signale);
      erg.meldungen!.push(...s.meldungen.slice(0, 3).map((m) => ({ ...m, wertpapier: o.name })));
    }
    return erg;
  },
};
