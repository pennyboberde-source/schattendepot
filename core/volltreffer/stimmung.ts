// Neue Quellen ab 20.11.2026 (Nutzer: „Ape-Wisdom machen wir gerne“, Q6/Q7 der Ideenliste) – nur ab jetzt verfügbar,
// deshalb früh sammeln. Reine Bausteine (getestet in stimmung.test.ts); Abruf in jobs/archiv.ts (Teile `leihe`, `reddit`).
//
// Q6 Leihgebühren: Interactive Brokers stellt Leihgebühr und verfügbare Stückzahl aller US-Aktien als Textdatei auf
// einen öffentlichen FTP-Server (Benutzer „shortstock“, ohne Passwort). Realistischere Shorts (Gebühr, gar nicht
// leihbar) und ein Warnzeichen für Short-Squeezes (Gebühr springt, Verfügbarkeit fällt).
// Q7 Reddit/4chan: ApeWisdom zählt Nennungen von Kürzeln (Rang, Nennungen, Upvotes, Stand vor 24 Stunden).

export interface Leihe {
  kuerzel: string;
  /** Leihgebühr in % pro Jahr */
  gebuehr: number;
  /** verfügbare Stückzahl (">10000000" → 10000000) */
  verfuegbar: number;
}

/** Datei usa.txt von Interactive Brokers: Kopfzeile #SYM|…, Felder mit | getrennt */
export function leiheLesen(text: string): Leihe[] {
  const zeilen = text.split(/\r?\n/);
  const kopf = zeilen.find((z) => z.startsWith('#SYM'));
  if (!kopf) return [];
  const spalten = kopf.slice(1).split('|').map((s) => s.trim().toUpperCase());
  const iSym = spalten.indexOf('SYM');
  const iFee = spalten.indexOf('FEERATE');
  const iAv = spalten.indexOf('AVAILABLE');
  if (iSym < 0 || iFee < 0 || iAv < 0) return [];
  const out: Leihe[] = [];
  for (const z of zeilen) {
    if (!z || z.startsWith('#')) continue;
    const f = z.split('|');
    const kuerzel = f[iSym]?.trim();
    const gebuehr = Number(f[iFee]);
    const verfuegbar = Number((f[iAv] ?? '').replace(/[^0-9.]/g, ''));
    if (!kuerzel || !Number.isFinite(gebuehr)) continue;
    out.push({ kuerzel, gebuehr, verfuegbar: Number.isFinite(verfuegbar) ? verfuegbar : 0 });
  }
  return out;
}

export function leiheCsv(l: Leihe[]): string {
  return `kuerzel,gebuehr,verfuegbar\n${[...l].sort((a, b) => a.kuerzel.localeCompare(b.kuerzel)).map((x) => `${x.kuerzel},${x.gebuehr},${x.verfuegbar}`).join('\n')}\n`;
}

export interface Nennung {
  kuerzel: string;
  rang: number;
  nennungen: number;
  upvotes: number;
  rangVor24h: number | null;
  nennungenVor24h: number | null;
}

/** Eine Seite der ApeWisdom-API (filter/<filter>/page/<n>): { pages, results: [{ ticker, rank, mentions, upvotes, rank_24h_ago, mentions_24h_ago }] } */
export function apewisdomLesen(json: unknown): { seiten: number; nennungen: Nennung[] } {
  const j = json as { pages?: number; results?: Record<string, unknown>[] } | null;
  if (!j || !Array.isArray(j.results)) return { seiten: 0, nennungen: [] };
  const zahl = (x: unknown) => (x === null || x === undefined || x === '' ? null : Number.isFinite(Number(x)) ? Number(x) : null);
  const nennungen: Nennung[] = [];
  for (const r of j.results) {
    const kuerzel = typeof r.ticker === 'string' ? r.ticker.trim().toUpperCase() : '';
    const rang = zahl(r.rank);
    if (!kuerzel || rang === null) continue;
    nennungen.push({ kuerzel, rang, nennungen: zahl(r.mentions) ?? 0, upvotes: zahl(r.upvotes) ?? 0, rangVor24h: zahl(r.rank_24h_ago), nennungenVor24h: zahl(r.mentions_24h_ago) });
  }
  return { seiten: Number(j.pages ?? 0) || 0, nennungen };
}

/**
 * Kurztext für die Lauerliste (öffentlich nur als Klassen, keine Rohwerte der Anbieter): Reddit-Rang und Veränderung der
 * Nennungen in 24 Stunden, Leihgebühr in groben Stufen. null = nichts Bemerkenswertes.
 */
export function stimmungText(n: Nennung | undefined, l: Leihe | undefined): string | null {
  const teile: string[] = [];
  if (n && n.rang <= 100) {
    const faktor = n.nennungenVor24h ? n.nennungen / n.nennungenVor24h : null;
    const stufe = n.rang <= 10 ? 'Top 10' : n.rang <= 30 ? 'Top 30' : 'Top 100';
    teile.push(`Reddit ${stufe}${faktor !== null && faktor >= 2 ? `, Nennungen über ${faktor >= 5 ? '5' : '2'}-fach in 24 Std.` : ''}`);
  }
  if (l) {
    if (l.verfuegbar === 0) teile.push('Leihe: nicht leihbar (Short kaum möglich)');
    else if (l.gebuehr >= 100) teile.push('Leihgebühr über 100 % p. a. (Squeeze-Gefahr, Short teuer)');
    else if (l.gebuehr >= 20) teile.push('Leihgebühr über 20 % p. a.');
  }
  return teile.length ? teile.join(' · ') : null;
}
