// Politik-Radar (Wunsch Nutzer 05./06.11.2026) – Abruf. Logik in core/politik.ts.
// Quellen (alle 0 €, ohne Schlüssel):
// - Federal Register API (amtlich, für automatischen Abruf gedacht): Präsidenten-Dokumente (Executive Orders,
//   Proklamationen – z. B. Zölle „Adjusting Imports …“).
// - tagesschau Inland/Ausland (RSS, Host bereits für tagesschau Wirtschaft geprüft), CNBC Politics/World (RSS, Host bereits geprüft).
// - Polymarket Gamma-API (bereits genutzt): politische und geopolitische Märkte, Sprung-Erkennung.
// Läuft in jedem Sammler-Lauf (Hauptlauf + stündlich) → politische Lage wird laufend verfolgt.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  grosseEreignisse,
  politikPushText,
  politikRisiko,
  politikSignale,
  politikZeilen,
  polymarketSprungSignale,
  risikoStufe,
  themenErkennen,
  type PmPreis,
  type PolitikConfig,
  type PolitikMeldung,
  type PolitikPushZustand,
} from '../../core/politik.ts';
import { berlin } from '../../core/kalender.ts';
import type { PushNachricht } from '../../core/push.ts';
import { holeJson, holeText } from '../lib/netz.ts';
import { parseRss } from './parser.ts';
import type { PmEreignis } from './stimmungrand.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';
import { zustandLesen, zustandSchreiben } from './zustand.ts';

export const POLITIK_FEEDS: { name: string; url: string }[] = [
  { name: 'tagesschau Ausland', url: 'https://www.tagesschau.de/ausland/index~rss2.xml' },
  { name: 'tagesschau Inland', url: 'https://www.tagesschau.de/inland/index~rss2.xml' },
  { name: 'tagesschau Wirtschaft', url: 'https://www.tagesschau.de/wirtschaft/index~rss2.xml' },
  { name: 'CNBC Politics', url: 'https://www.cnbc.com/id/10000113/device/rss/rss.html' },
  { name: 'CNBC World', url: 'https://www.cnbc.com/id/100727362/device/rss/rss.html' },
];

const FR_URL =
  'https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&conditions%5Btype%5D%5B%5D=PRESDOCU&fields%5B%5D=title&fields%5B%5D=publication_date&fields%5B%5D=html_url';

interface FrAntwort {
  results?: { title?: string; publication_date?: string; html_url?: string }[];
}

/** Federal Register → Meldungen (Zeit = Veröffentlichungstag 00:00 UTC). */
export function federalRegisterMeldungen(a: FrAntwort): PolitikMeldung[] {
  return (a.results ?? [])
    .filter((r) => r.title && r.html_url)
    .map((r) => ({ titel: r.title!, quelle: 'Federal Register (US-Präsident)', link: r.html_url!, zeit: r.publication_date ? `${r.publication_date}T00:00:00Z` : undefined }));
}

const jaPreis = (s?: string) => {
  try {
    return Number(JSON.parse(s ?? '[]')[0]);
  } catch {
    return NaN;
  }
};

/** Polymarket-Ereignisse → Ja-Preise je Markt (Platzhalter und Extreme weg). */
export function polymarketPreise(ereignisse: PmEreignis[]): PmPreis[] {
  const out: PmPreis[] = [];
  for (const e of ereignisse) {
    for (const m of e.markets ?? []) {
      if (m.closed || /^(company|person|player|team|option|other) [a-z0-9]{1,2}$/i.test(m.groupItemTitle ?? '')) continue;
      const p = jaPreis(m.outcomePrices);
      if (!(p >= 0.02 && p <= 0.98)) continue;
      const titel = m.groupItemTitle && (e.markets ?? []).length > 1 ? `${e.title} – ${m.groupItemTitle}` : (m.question ?? e.title);
      out.push({ id: m.id, titel, p: Math.round(p * 1000) / 1000, link: e.slug ? `https://polymarket.com/event/${e.slug}` : undefined });
    }
  }
  return out;
}

export interface PolitikZustand extends PolitikPushZustand {
  preise?: Record<string, number>;
  /** Tageshöchstwert des Risiko-Index (für Marktphase „Politik-Risiko“) */
  verlauf?: Record<string, number>;
  lage?: { stand: string; index: number; stufe: string; zeilen: string[]; themen: { id: string; name: string; meldungen: number; quellen: number; richtung: number }[] };
}

export const politikRadar: Quelle = {
  id: 'politik',
  name: 'Politik-Radar (Federal Register, tagesschau, CNBC, Polymarket)',
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: 8,
  async abrufen(ctx): Promise<QuellenErgebnis> {
    const cfg = JSON.parse(readFileSync(join(process.cwd(), 'config', 'politik-themen.json'), 'utf8')) as PolitikConfig;
    const z = zustandLesen<PolitikZustand>('politik', {});
    let abfragen = 0;
    const fehler: string[] = [];
    const meldungen: PolitikMeldung[] = [];

    const versuch = async <T>(name: string, f: () => Promise<T>): Promise<T | null> => {
      abfragen++;
      try {
        return await f();
      } catch (e) {
        fehler.push(`${name}: ${(e as Error).message}`);
        return null;
      }
    };

    const fr = await versuch('Federal Register', () => holeJson<FrAntwort>(FR_URL, { zeitlimitMs: 15000 }));
    if (fr) meldungen.push(...federalRegisterMeldungen(fr));
    for (const f of POLITIK_FEEDS) {
      const xml = await versuch(f.name, () => holeText(f.url, { zeitlimitMs: 12000, header: { Accept: 'application/rss+xml, application/xml, text/xml' } }));
      if (xml) meldungen.push(...parseRss(xml).slice(0, 40).map((e) => ({ titel: e.titel, quelle: f.name, link: e.link, zeit: e.zeit })));
    }
    const pmUrl = (tag: string) => `https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=12&tag_slug=${tag}`;
    const pm: PmEreignis[] = [];
    for (const tag of ['politics', 'geopolitics']) {
      const r = await versuch(`Polymarket ${tag}`, () => holeJson<PmEreignis[]>(pmUrl(tag), { zeitlimitMs: 15000 }));
      if (r) pm.push(...r);
    }
    if (!meldungen.length && !pm.length) throw new Error(`alle Politik-Quellen ausgefallen (${fehler.join(' | ').slice(0, 150)})`);

    const treffer = themenErkennen(meldungen, cfg, ctx.jetzt);
    const index = politikRisiko(treffer);
    const preise = polymarketPreise(pm);
    const sprung = polymarketSprungSignale(preise, z.preise ?? {}, cfg, ctx.jetzt);
    const zeilen = [...politikZeilen(treffer, index, cfg.risikoHochAb), ...sprung.zeilen.slice(0, 4)];
    if (fehler.length) zeilen.push(`(Politik-Quellen ausgefallen: ${fehler.map((f) => f.split(':')[0]).join(', ')})`);

    const datum = berlin(ctx.jetzt).datum;
    const gross = grosseEreignisse(treffer, cfg, z, datum);
    const offeneTicker = ctx.offen.map((o) => o.ticker ?? '').filter(Boolean);
    const pushes: PushNachricht[] = gross.neu.map((t) => ({ typ: 'warnung', ...politikPushText(t, offeneTicker), ziel: '#/heute', tag: `politik-${t.thema.id}`, erstellt: ctx.jetzt.toISOString() }));

    const verlauf = { ...(z.verlauf ?? {}) };
    verlauf[datum] = Math.max(verlauf[datum] ?? 0, index);
    const neuerZustand: PolitikZustand = {
      ...gross.zustand,
      preise: Object.fromEntries(preise.map((p) => [p.id, p.p])),
      verlauf: Object.fromEntries(Object.entries(verlauf).sort().slice(-60)),
      lage: {
        stand: ctx.jetzt.toISOString(),
        index,
        stufe: risikoStufe(index, cfg.risikoHochAb),
        zeilen,
        themen: treffer.map((t) => ({ id: t.thema.id, name: t.thema.name, meldungen: t.meldungen.length, quellen: t.quellen, richtung: t.richtung })),
      },
    };
    zustandSchreiben('politik', neuerZustand);

    return {
      signale: [...politikSignale(treffer, ctx.jetzt), ...sprung.signale],
      politik: zeilen,
      pushes,
      meldungen: treffer.flatMap((t) => t.meldungen.slice(0, 2).map(({ titel, quelle, link, zeit }) => ({ titel, quelle, link, zeit }))).slice(0, 10),
      abfragen,
    };
  },
};
