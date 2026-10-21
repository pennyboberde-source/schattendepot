// Reine Parser für die Antworten der Datenquellen (Tests mit aufgezeichneten Beispielen).

function entities(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&nbsp;/g, ' ');
}

export function textOhneTags(s: string): string {
  const ohneCdata = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  // Tags inkl. Attributen mit ">" in Anführungszeichen (z. B. onmouseover="Tip('…>…')")
  return entities(ohneCdata.replace(/<(?:[^>"']|"[^"]*"|'[^']*')*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export interface RssEintrag {
  titel: string;
  link: string;
  zeit?: string;
}

/** RSS 2.0 und Atom. */
export function parseRss(xml: string): RssEintrag[] {
  const eintraege: RssEintrag[] = [];
  const bloecke = xml.match(/<item[\s>][\s\S]*?<\/item>/g) ?? xml.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  for (const b of bloecke) {
    const titel = textOhneTags(b.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1] ?? '');
    const link = entities(b.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]?.trim() || b.match(/<link[^>]*href="([^"]+)"/)?.[1] || '');
    const datum = b.match(/<(pubDate|updated|published|dc:date)>([\s\S]*?)<\/\1>/)?.[2]?.trim();
    const zeit = datum && !Number.isNaN(Date.parse(datum)) ? new Date(datum).toISOString() : undefined;
    if (titel && link) eintraege.push({ titel, link, zeit });
  }
  return eintraege;
}

/** HTML-Tabelle (erste mit der Klasse) → Zeilen als Objekte nach Kopfzeile. */
export function parseHtmlTabelle(html: string, klasse: string): Record<string, string>[] {
  const tab = html.match(new RegExp(`<table[^>]*class="[^"]*${klasse}[^"]*"[^>]*>([\\s\\S]*?)</table>`))?.[1];
  if (!tab) return [];
  const kopf = (tab.match(/<thead[\s\S]*?<\/thead>/)?.[0] ?? tab.match(/<tr[\s\S]*?<\/tr>/)?.[0] ?? '').match(/<th[\s\S]*?<\/th>/g)?.map((h) => textOhneTags(h).replace(/ /g, ' ')) ?? [];
  const koerper = tab.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/)?.[1] ?? tab;
  const zeilen: Record<string, string>[] = [];
  for (const tr of koerper.match(/<tr[\s\S]*?<\/tr>/g) ?? []) {
    const zellen = tr.match(/<td[\s\S]*?<\/td>/g)?.map(textOhneTags) ?? [];
    if (zellen.length !== kopf.length) continue;
    zeilen.push(Object.fromEntries(kopf.map((k, i) => [k, zellen[i]])));
  }
  return zeilen;
}

/** "$1,234,567" / "+12%" / "1.2M" → Zahl */
export function zahl(s: string | undefined): number {
  if (!s) return 0;
  const m = s.replace(/[$,+%\s]/g, '').match(/^(-?[\d.]+)([kKmMbB])?$/);
  if (!m) return 0;
  const f = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  return Number(m[1]) * f;
}

/** FRED fredgraph.csv (mehrere Reihen): letzter und vorletzter gültiger Wert je Reihe. */
export function parseFredCsv(csv: string): Record<string, { datum: string; wert: number; vorher?: number }> {
  const zeilen = csv.trim().split(/\r?\n/);
  const kopf = zeilen[0].split(',');
  const r: Record<string, { datum: string; wert: number; vorher?: number }> = {};
  for (let s = 1; s < kopf.length; s++) {
    const werte = zeilen
      .slice(1)
      .map((z) => z.split(','))
      .filter((z) => z[s] && z[s] !== '.' && z[s] !== '')
      .map((z) => ({ datum: z[0], wert: Number(z[s]) }));
    const letzter = werte[werte.length - 1];
    if (letzter) r[kopf[s]] = { ...letzter, vorher: werte[werte.length - 2]?.wert };
  }
  return r;
}
