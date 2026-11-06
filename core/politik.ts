// Politik-Radar (Wunsch Nutzer 05./06.11.2026): politische Meldungen → Themen → Signale für betroffene Werte,
// Politik-Risiko-Index und Push bei großen Ereignissen. Reine, getestete Logik – Abruf in jobs/quellen/politik.ts.
// Alles läuft ins Schattenbuch (Signaltypen politik_massnahme / politik_wahrscheinlichkeit); gekauft wird erst nach Beweis.
import type { Signal } from './signale.ts';

export interface PolitikWert {
  name: string;
  ticker: string;
  markt: 'us' | 'eu' | 'krypto';
  /** +1 = profitiert von „positiver“ Nachricht des Themas, −1 = leidet darunter */
  richtung: 1 | -1;
}

export interface PolitikThema {
  id: string;
  name: string;
  schwere: number;
  stichwoerter: string[];
  positiv: string[];
  negativ: string[];
  /** Richtung, wenn weder positiv noch negativ erkannt wird (0 = keine Richtung, nur Risiko) */
  standard: -1 | 0 | 1;
  werte: PolitikWert[];
}

export interface PolitikConfig {
  maxAlterStd: number;
  pushAbSchwere: number;
  pushAbQuellen: number;
  maxPushesJeTag: number;
  polymarketSprungPkt: number;
  risikoHochAb: number;
  themen: PolitikThema[];
}

export interface PolitikMeldung {
  titel: string;
  quelle: string;
  link: string;
  zeit?: string;
}

export interface ThemenTreffer {
  thema: PolitikThema;
  meldungen: (PolitikMeldung & { richtung: -1 | 0 | 1 })[];
  /** Anzahl unabhängiger Quellen */
  quellen: number;
  /** Mehrheitsrichtung der Meldungen (−1/0/+1) im Sinn des Themas */
  richtung: -1 | 0 | 1;
}

const klein = (s: string) => s.toLowerCase();
const zeichen = 'a-z0-9äöüß';

/** Kurze Wörter (≤ 4 Zeichen) nur als ganzes Wort, längere auch als Wortteil (z. B. „eskal“ → „Eskalation“). */
export function enthaelt(text: string, wort: string): boolean {
  const t = klein(text);
  const w = klein(wort);
  if (w.length > 4) return t.includes(w);
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^${zeichen}])${esc}($|[^${zeichen}])`).test(t);
}

/** Richtung einer Schlagzeile im Sinn des Themas. Negativ schlägt positiv (vorsichtig). */
export function richtungVon(titel: string, t: PolitikThema): -1 | 0 | 1 {
  if (t.negativ.some((w) => enthaelt(titel, w))) return -1;
  if (t.positiv.some((w) => enthaelt(titel, w))) return 1;
  return t.standard;
}

/** Meldungen den Themen zuordnen (eine Meldung darf mehrere Themen treffen). Doppelte Titel zählen einmal. */
export function themenErkennen(meldungen: PolitikMeldung[], cfg: Pick<PolitikConfig, 'themen' | 'maxAlterStd'>, jetzt: Date): ThemenTreffer[] {
  const gesehen = new Set<string>();
  const frisch = meldungen.filter((m) => {
    const k = klein(m.titel).replace(/\s+/g, ' ').trim();
    if (!k || gesehen.has(k)) return false;
    gesehen.add(k);
    return !m.zeit || jetzt.getTime() - new Date(m.zeit).getTime() <= cfg.maxAlterStd * 3600000;
  });
  const out: ThemenTreffer[] = [];
  for (const thema of cfg.themen) {
    const ms = frisch.filter((m) => thema.stichwoerter.some((w) => enthaelt(m.titel, w))).map((m) => ({ ...m, richtung: richtungVon(m.titel, thema) }));
    if (!ms.length) continue;
    const summe = ms.reduce((a, m) => a + m.richtung, 0);
    out.push({ thema, meldungen: ms, quellen: new Set(ms.map((m) => m.quelle)).size, richtung: summe > 0 ? 1 : summe < 0 ? -1 : 0 });
  }
  return out.sort((a, b) => b.thema.schwere * b.meldungen.length - a.thema.schwere * a.meldungen.length);
}

const tag = (zeit: string) => zeit.slice(0, 10);

/** Signale `politik_massnahme` für die betroffenen Werte eines Themas (nur mit Richtung). */
export function politikSignale(treffer: ThemenTreffer[], jetzt: Date): Signal[] {
  const zeit = jetzt.toISOString();
  const out: Signal[] = [];
  for (const t of treffer) {
    if (t.richtung === 0 || !t.thema.werte.length) continue;
    const beleg = t.meldungen.find((m) => m.richtung === t.richtung) ?? t.meldungen[0];
    const staerke = Math.min(1, 0.35 + 0.15 * (t.quellen - 1) + 0.05 * (t.meldungen.length - 1));
    for (const w of t.thema.werte) {
      out.push({
        id: `politik_massnahme:${w.ticker.toUpperCase().replace(/\.(DE|US)$/, '')}:${tag(zeit)}:${t.thema.id}`,
        wertpapier: { name: w.name, ticker: w.ticker, markt: w.markt },
        typ: 'politik_massnahme',
        staerke: Math.round(staerke * 1000) / 1000,
        richtung: (t.richtung * w.richtung) as -1 | 1,
        zeit,
        quellen: [{ quelle: beleg.quelle, link: beleg.link, fakt: `${t.thema.name}: ${beleg.titel}`.slice(0, 200) }],
      });
    }
  }
  return out;
}

/** Politik-Risiko-Index 0–100: Schwere × Meldungen (je Thema höchstens 4) × Quellen-Breite. */
export function politikRisiko(treffer: ThemenTreffer[]): number {
  const roh = treffer.reduce((a, t) => a + t.thema.schwere * Math.min(4, t.meldungen.length) * (t.quellen >= 2 ? 1.5 : 1), 0);
  return Math.min(100, Math.round(roh * 2.5));
}

export function risikoStufe(index: number, hochAb: number): 'hoch' | 'erhöht' | 'normal' {
  return index >= hochAb ? 'hoch' : index >= hochAb / 2 ? 'erhöht' : 'normal';
}

const pfeil = (r: number) => (r > 0 ? '↑' : r < 0 ? '↓' : '·');

/** Kurzzeilen fürs Lagebild (Claude) und die App. */
export function politikZeilen(treffer: ThemenTreffer[], index: number, hochAb: number, max = 8): string[] {
  const z = [`Politik-Risiko: ${index}/100 (${risikoStufe(index, hochAb)})`];
  for (const t of treffer.slice(0, max)) {
    const betroffen = t.richtung !== 0 && t.thema.werte.length ? ` → ${t.thema.werte.map((w) => `${w.name} ${pfeil(t.richtung * w.richtung)}`).join(', ')}` : '';
    const top = t.meldungen[0];
    z.push(`${t.thema.name} (${t.meldungen.length} Meldung${t.meldungen.length > 1 ? 'en' : ''}, ${t.quellen} Quelle${t.quellen > 1 ? 'n' : ''})${betroffen}: „${top.titel.slice(0, 110)}“ – ${top.quelle}`);
  }
  return z;
}

// ---------- Prognosemärkte (Polymarket) ----------
export interface PmPreis {
  id: string;
  titel: string;
  /** Ja-Wahrscheinlichkeit 0..1 */
  p: number;
  link?: string;
}

/** Sprünge ≥ Schwelle (Pkt.) gegenüber dem letzten Lauf → Signal `politik_wahrscheinlichkeit` für zugeordnete Werte. */
export function polymarketSprungSignale(
  preise: PmPreis[],
  vorher: Record<string, number>,
  cfg: Pick<PolitikConfig, 'themen' | 'polymarketSprungPkt'>,
  jetzt: Date,
): { signale: Signal[]; zeilen: string[] } {
  const zeit = jetzt.toISOString();
  const signale: Signal[] = [];
  const zeilen: string[] = [];
  for (const m of preise) {
    const alt = vorher[m.id];
    if (alt === undefined) continue;
    const diff = Math.round((m.p - alt) * 100);
    if (Math.abs(diff) < cfg.polymarketSprungPkt) continue;
    zeilen.push(`Prognosemarkt „${m.titel.slice(0, 90)}“: ${Math.round(m.p * 100)} % (${diff > 0 ? '+' : ''}${diff} Pkt.)`);
    for (const t of cfg.themen) {
      if (!t.stichwoerter.some((w) => enthaelt(m.titel, w))) continue;
      const r = richtungVon(m.titel, t);
      if (r === 0) continue;
      for (const w of t.werte) {
        signale.push({
          id: `politik_wahrscheinlichkeit:${w.ticker.toUpperCase().replace(/\.(DE|US)$/, '')}:${tag(zeit)}:${m.id}`,
          wertpapier: { name: w.name, ticker: w.ticker, markt: w.markt },
          typ: 'politik_wahrscheinlichkeit',
          staerke: Math.min(1, Math.abs(diff) / 30),
          richtung: (Math.sign(diff) * r * w.richtung) as -1 | 1,
          zeit,
          quellen: [{ quelle: 'Polymarket (Politik)', link: m.link, fakt: `${t.name}: „${m.titel}“ ${Math.round(alt * 100)} → ${Math.round(m.p * 100)} %`.slice(0, 200) }],
        });
      }
    }
  }
  return { signale, zeilen };
}

// ---------- Push bei großen Ereignissen ----------
export interface PolitikPushZustand {
  datum?: string;
  themen?: string[];
}

/** Große Ereignisse (Schwere und Quellenbreite) – je Thema höchstens 1 Push pro Tag, insgesamt begrenzt. */
export function grosseEreignisse(
  treffer: ThemenTreffer[],
  cfg: Pick<PolitikConfig, 'pushAbSchwere' | 'pushAbQuellen' | 'maxPushesJeTag'>,
  zustand: PolitikPushZustand,
  datum: string,
): { neu: ThemenTreffer[]; zustand: PolitikPushZustand } {
  const schon = zustand.datum === datum ? (zustand.themen ?? []) : [];
  const frei = Math.max(0, cfg.maxPushesJeTag - schon.length);
  const neu = treffer.filter((t) => t.thema.schwere >= cfg.pushAbSchwere && t.quellen >= cfg.pushAbQuellen && !schon.includes(t.thema.id)).slice(0, frei);
  return { neu, zustand: { datum, themen: [...schon, ...neu.map((t) => t.thema.id)] } };
}

/** Pushtext: Thema, Top-Schlagzeile, betroffene Werte, betroffene offene Positionen. */
export function politikPushText(t: ThemenTreffer, offeneTicker: string[]): { titel: string; text: string } {
  const ohne = (s: string) => s.toUpperCase().replace(/\..*$/, '');
  const betroffenOffen = t.thema.werte.filter((w) => offeneTicker.some((o) => ohne(o) === ohne(w.ticker)));
  const werte = t.richtung !== 0 ? t.thema.werte.map((w) => `${w.name} ${pfeil(t.richtung * w.richtung)}`).join(', ') : '';
  return {
    titel: `🏛️ Politik: ${t.thema.name}`,
    text: [
      `„${t.meldungen[0].titel.slice(0, 120)}“ (${t.quellen} Quellen)`,
      werte ? `Mögliche Wirkung: ${werte}` : '',
      betroffenOffen.length ? `⚠️ Betrifft offene Position: ${betroffenOffen.map((w) => w.name).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 300),
  };
}
