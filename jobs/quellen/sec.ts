// SEC EDGAR: neueste 8-K-Pflichtmeldungen (Atom-Feed) → Signale für wesentliche Ereignisse.
// SEC verlangt einen aussagekräftigen User-Agent mit Kontakt und höchstens 10 Abfragen/s – hier 2 Abfragen pro Hauptlauf.
import type { Signal } from '../../core/signale.ts';
import { holeJson, holeText } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import { parseRss } from './parser.ts';
import type { Quelle } from './typen.ts';

// SEC verlangt „Name Kontakt-E-Mail“ im User-Agent (sonst HTTP 403). Die Adresse kommt nur aus dem Secret SEC_KONTAKT.
const secUa = () => `Schattendepot private simulation ${process.env.SEC_KONTAKT?.trim() ?? ''}`.trim();

/** 8-K-Items → Signal-Typ, Richtung, Stärke. Nur wesentliche Ereignisse. */
const ITEMS: Record<string, [string, -1 | 0 | 1, number, string]> = {
  '1.01': ['grossauftrag', 1, 0.4, 'wesentlicher Vertrag'],
  '1.03': ['prognose_senkung', -1, 0.9, 'Insolvenz/Zwangsverwaltung'],
  '2.01': ['uebernahmeangebot', 1, 0.5, 'Erwerb/Veräußerung abgeschlossen'],
  '2.06': ['prognose_senkung', -1, 0.5, 'wesentliche Wertminderung'],
  '4.02': ['prognose_senkung', -1, 0.7, 'frühere Abschlüsse nicht mehr verlässlich'],
};

export function secAuswerten(atom: string, cikZuTicker: Map<number, { ticker: string; name: string }>, jetzt: Date): Signal[] {
  const out: Signal[] = [];
  const bloecke = atom.match(/<entry[\s>][\s\S]*?<\/entry>/g) ?? [];
  const eintraege = parseRss(atom);
  bloecke.forEach((b, i) => {
    const e = eintraege[i];
    if (!e) return;
    const cik = Number(e.titel.match(/\((\d{10})\)/)?.[1]);
    const firma = cikZuTicker.get(cik);
    if (!firma) return;
    const items = [...b.matchAll(/Item\s+(\d\.\d{2})/g)].map((m) => m[1]);
    for (const it of new Set(items)) {
      const def = ITEMS[it];
      if (!def) continue;
      const [typ, richtung, staerke, text] = def;
      out.push(signal(typ, { name: firma.name, ticker: firma.ticker }, staerke, richtung, e.zeit ?? jetzt.toISOString(), 'SEC EDGAR', `8-K Item ${it}: ${text}`, e.link));
    }
  });
  return out;
}

export const sec8k: Quelle = {
  id: 'sec',
  name: 'SEC EDGAR (8-K)',
  schluessel: 'SEC_KONTAKT',
  laeufe: ['haupt'],
  maxProLauf: 2,
  async abrufen(ctx) {
    const header = { 'User-Agent': secUa(), Accept: 'application/json, application/atom+xml' };
    const tickers = await holeJson<Record<string, { cik_str: number; ticker: string; title: string }>>('https://www.sec.gov/files/company_tickers.json', { header });
    const karte = new Map(Object.values(tickers).map((t) => [t.cik_str, { ticker: t.ticker, name: t.title }]));
    const atom = await holeText('https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&company=&dateb=&owner=include&count=100&output=atom', { header });
    return { signale: secAuswerten(atom, karte, ctx.jetzt), abfragen: 2 };
  },
};
