// Selbstverbesserung (Plan Volltreffer VS) – Dateien und Tagesarbeit: Verbesserungsbuch, Kennzahlen-Zeitreihe,
// fällige Bewertungen, Übersicht für die App. Läuft im Sammler-Hauptlauf (reiner Code, kein Claude).
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { berlin } from '../../core/kalender.ts';
import type { DtUebersicht } from '../../core/daytrading/auswertung.ts';
import type { Statistik, TrackingEintrag } from '../../core/statistik.ts';
import { verbesserungsbuch } from '../../core/verbesserung/buch.ts';
import { faelligeBewertungen, kennzahlenHeute, zeitreiheFortschreiben, type Zeitreihe } from '../../core/verbesserung/kennzahlen.ts';
import type { Kandidat, Leitplanken, ProtokollEintrag } from '../../core/verbesserung/typen.ts';
import { uebersichtBauen } from '../../core/verbesserung/uebersicht.ts';
import { DATEN_DIR, leseJson, leseText, schreibeJson } from './dateien.ts';

export const REPO = process.env.GITHUB_REPOSITORY || 'pennyboberde-source/schattendepot';
export const PROTOKOLL = 'lernen/verbesserung/protokoll.jsonl';
const KANDIDATEN = 'lernen/verbesserung/kandidaten.json';
const KENNZAHLEN_DATEI = 'lernen/verbesserung/kennzahlen.json';
const UEBERSICHT = 'lernen/verbesserung/uebersicht.json';

export function ladeLeitplanken(root = process.cwd()): Leitplanken {
  return JSON.parse(readFileSync(join(root, 'config', 'verbesserung.json'), 'utf8')) as Leitplanken;
}

export function leseProtokoll(): ProtokollEintrag[] {
  return leseText(PROTOKOLL)
    .split('\n')
    .filter((z) => z.trim())
    .map((z) => JSON.parse(z) as ProtokollEintrag);
}

/** Protokoll nur anhängen, nie umschreiben. */
export function protokollAnhaengen(neu: ProtokollEintrag[]) {
  if (!neu.length) return;
  const pfad = join(DATEN_DIR, PROTOKOLL);
  mkdirSync(dirname(pfad), { recursive: true });
  appendFileSync(pfad, neu.map((e) => JSON.stringify(e)).join('\n') + '\n');
}

export function uebersichtSchreiben(jetzt: Date, l = ladeLeitplanken()) {
  const k = leseJson<{ kandidaten?: Kandidat[] }>(KANDIDATEN, {});
  schreibeJson(UEBERSICHT, uebersichtBauen(leseProtokoll(), k.kandidaten ?? [], l, jetzt.toISOString(), REPO));
}

/** Offene Issues mit Label „fehler“ (öffentliches Repo; mit Token höheres Kontingent). null = Abruf gescheitert. */
async function offeneFehlerIssues(): Promise<{ nummer: number; titel: string }[] | null> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/issues?labels=fehler&state=open&per_page=20`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'schattendepot-verbesserungsbuch', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const liste = (await r.json()) as { number: number; title: string; pull_request?: unknown }[];
    return liste.filter((i) => !i.pull_request).map((i) => ({ nummer: i.number, titel: String(i.title ?? '') }));
  } catch {
    return null;
  }
}

/**
 * Täglich im Sammler-Hauptlauf: Kennzahlen fortschreiben, fällige Änderungen bewerten, Verbesserungsbuch und
 * Übersicht neu schreiben. `ohneNetz` für Probeläufe (keine Issue-Abfrage), `nurWennVeraltet` für den Stundenlauf.
 */
export async function verbesserungTaeglich(jetzt: Date, opt: { ohneNetz?: boolean; nurWennVeraltet?: boolean } = {}): Promise<{ kandidaten: number; bewertet: number } | null> {
  const l = ladeLeitplanken();
  const heute = berlin(jetzt).datum;
  if (opt.nurWennVeraltet) {
    const stand = leseJson<{ stand?: string }>(KANDIDATEN, {}).stand;
    if (stand && berlin(new Date(stand)).datum === heute) return null;
  }
  const tracking = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []);
  const statistik = leseJson<Partial<Statistik> | null>('statistik.json', null);
  const quellen = leseJson<{ quellen?: { id: string; name: string; zuletztOk?: string; signale?: number; letzterFehler?: string }[] }>('quellenstatus.json', {}).quellen ?? [];
  const zeugnis = leseJson<{ kw: number; note: number | null; faecher: { fach: string; note: number; gewicht: number; wert: string }[] } | null>('wochen/zeugnis-letztes.json', null);

  // 1. Kennzahlen des Tages
  const werte = kennzahlenHeute({
    jetzt,
    heute,
    tracking,
    statistik,
    depot: leseJson<{ netto?: number; etfNetto?: number; trefferquote?: number | null } | null>('kennzahlen.json', null),
    daytrading: leseJson<DtUebersicht | null>('daytrading/uebersicht.json', null),
    quellen,
    signaleHeute: leseJson<{ anzahl?: number } | null>(`signale/tag/${heute}.json`, null)?.anzahl ?? null,
    zeugnisNote: zeugnis?.note ?? null,
  });
  const reihe = zeitreiheFortschreiben(leseJson<Zeitreihe>(KENNZAHLEN_DATEI, {}), heute, werte);
  schreibeJson(KENNZAHLEN_DATEI, reihe);

  // 2. Fällige Bewertungen übernommener Änderungen (2 bis 4 Wochen nach der Übernahme)
  const bewertungen = faelligeBewertungen(leseProtokoll(), reihe, heute, jetzt.toISOString(), l.bewertung);
  protokollAnhaengen(bewertungen);

  // 3. Verbesserungsbuch
  const alt = leseJson<{ kandidaten?: Kandidat[]; ohneSignaleSeit?: Record<string, string> }>(KANDIDATEN, {});
  const monate = leseJson<{ monat: string }[]>('lernen/monatspruefung/index.json', []);
  const monat = monate.map((m) => m.monat).sort().pop();
  const geholt = opt.ohneNetz ? null : await offeneFehlerIssues();
  const issues = geholt ?? (alt.kandidaten ?? []).filter((k) => k.herkunft === 'fehler').map((k) => ({ nummer: Number(k.id.split(':')[1]), titel: k.titel.replace(/^Fehler-Issue #\d+: /, '') }));
  const erledigtPfad = join(process.cwd(), 'verbesserung', 'erledigt.json');
  const erledigt = existsSync(erledigtPfad) ? ((JSON.parse(readFileSync(erledigtPfad, 'utf8')) as { erledigt?: { id: string }[] }).erledigt ?? []).map((x) => x.id) : [];
  const buch = verbesserungsbuch(
    {
      jetzt,
      heute,
      monatspruefung: monat ? { monat, text: leseText(`lernen/monatspruefung/${monat}.md`) } : null,
      zeugnis,
      lernhinweise: statistik?.lernhinweise ?? [],
      quellen,
      issues,
      protokoll: leseProtokoll(),
      erledigt,
      vorher: alt.kandidaten,
      ohneSignaleSeit: alt.ohneSignaleSeit,
    },
    l,
  );
  schreibeJson(KANDIDATEN, { stand: jetzt.toISOString(), hinweis: 'Verbesserungsbuch: Kandidaten für den wöchentlichen Verbesserungslauf, nach erwartetem Nutzen sortiert (Code, täglich).', ...buch });
  uebersichtSchreiben(jetzt, l);
  return { kandidaten: buch.kandidaten.length, bewertet: bewertungen.length };
}
