// Lagebild: verdichtete Tagesübersicht für Claude (Markdown, ≤ ca. 6.000 Tokens) und die App (JSON).
import type { Kandidat, Signal } from './signale.ts';

export interface LagebildDaten {
  datum: string;
  erstellt: string;
  makro: string[];
  termine: { zeit: string; text: string }[];
  meldungen: { titel: string; quelle: string; link: string; wertpapier?: string; zeit?: string }[];
  insider: { wertpapier: string; text: string; link: string }[];
  positionen: { id: string; name: string; meldungen: { titel: string; quelle: string; link: string }[] }[];
  kandidaten: Kandidat[];
  quellen: { id: string; name: string; ok: boolean; signale: number }[];
  /** Datenkrake je Kandidat (Schlüssel → Text): Ähnliche Fälle aus dem Schattenbuch, Pump-Verdacht */
  hinweise?: Record<string, string>;
}

/** JSON für die Briefing-Ansicht (Kandidaten verkürzt). */
export function lagebildJson(l: LagebildDaten, briefing?: string[]) {
  return {
    datum: l.datum,
    erstellt: l.erstellt,
    briefing,
    makro: l.makro,
    termine: l.termine,
    meldungen: l.meldungen.slice(0, 15),
    insider: l.insider.slice(0, 10),
    positionen: l.positionen,
    kandidaten: l.kandidaten.map((k) => ({
      name: k.wertpapier.name,
      ticker: k.wertpapier.ticker,
      isin: k.wertpapier.isin,
      score: k.score,
      ...(l.hinweise?.[k.schluessel] ? { hinweis: l.hinweise[k.schluessel] } : {}),
      fakten: k.signale.slice(0, 3).map((s) => s.quellen[0]?.fakt ?? s.typ),
      quellen: dedupe(k.signale.flatMap((s) => s.quellen.filter((q) => q.link).map((q) => ({ name: q.quelle, link: q.link! })))).slice(0, 3),
    })),
  };
}

function dedupe<T extends { link: string }>(l: T[]): T[] {
  const s = new Set<string>();
  return l.filter((x) => (s.has(x.link) ? false : (s.add(x.link), true)));
}

const kuerze = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Markdown für den Morgenlauf. Budget ~24.000 Zeichen (~6.000 Tokens); Abschnitte werden bei Bedarf gekürzt. */
export function lagebildMarkdown(l: LagebildDaten, typNamen: Record<string, string>, maxZeichen = 24000): string {
  const z: string[] = [];
  z.push(`# Lagebild ${l.datum} (erstellt ${l.erstellt.slice(11, 16)} UTC)`, '', 'Simulation – keine Anlageberatung. Signal-IDs in [eckigen Klammern] in `signalIds` übernehmen.', '');
  z.push('## Makro-Kurzlage', ...(l.makro.length ? l.makro.slice(0, 22).map((m) => `- ${m}`) : ['- (keine Daten)']), '');
  z.push('## Termine heute', ...(l.termine.length ? l.termine.slice(0, 15).map((t) => `- ${t.zeit}: ${t.text}`) : ['- (keine)']), '');
  z.push('## Nachrichten zu offenen Positionen');
  if (!l.positionen.length) z.push('- (keine offenen Positionen)');
  for (const p of l.positionen) {
    z.push(`- **${p.name}** (${p.id}): ${p.meldungen.length ? '' : 'nichts Neues'}`);
    for (const m of p.meldungen.slice(0, 3)) z.push(`  - ${kuerze(m.titel, 140)} – ${m.quelle} ${m.link}`);
  }
  z.push('', '## Insider-Käufe (öffentlich gemeldet)', ...(l.insider.length ? l.insider.slice(0, 8).map((i) => `- ${i.wertpapier}: ${i.text} ${i.link}`) : ['- (keine)']), '');
  z.push(`## Top-${l.kandidaten.length}-Kandidaten (Score: + = long, − = short)`);
  for (const k of l.kandidaten) {
    const wp = `${k.wertpapier.name}${k.wertpapier.ticker ? ` (${k.wertpapier.ticker})` : ''}${k.wertpapier.isin ? ` ${k.wertpapier.isin}` : ''}`;
    z.push(`### ${k.score > 0 ? '+' : ''}${k.score} ${wp}`);
    if (l.hinweise?.[k.schluessel]) z.push(`- ↳ ${l.hinweise[k.schluessel]}`);
    for (const s of k.signale.slice(0, 4)) z.push(`- [${s.id}] ${typNamen[s.typ] ?? s.typ} (${s.quellen.length} Quelle${s.quellen.length > 1 ? 'n' : ''}): ${kuerze(s.quellen[0]?.fakt ?? '', 150)}${s.quellen[0]?.link ? ` ${s.quellen[0].link}` : ''}`);
  }
  z.push('', '## Top-Meldungen', ...l.meldungen.slice(0, 12).map((m) => `- ${kuerze(m.titel, 140)} – ${m.quelle}`), '');
  const ok = l.quellen.filter((q) => q.ok).length;
  z.push(`Quellen: ${ok}/${l.quellen.length} geliefert${l.quellen.some((q) => !q.ok) ? ` (ausgefallen: ${l.quellen.filter((q) => !q.ok).map((q) => q.name).join(', ')})` : ''}.`);
  let md = z.join('\n');
  // Budget einhalten: Kandidaten-Abschnitt von hinten kürzen
  while (md.length > maxZeichen && l.kandidaten.length > 5) {
    l = { ...l, kandidaten: l.kandidaten.slice(0, l.kandidaten.length - 3) };
    md = lagebildMarkdown(l, typNamen, Infinity);
  }
  return md.length > maxZeichen ? md.slice(0, maxZeichen - 20) + '\n…(gekürzt)' : md;
}

export type { Signal };
