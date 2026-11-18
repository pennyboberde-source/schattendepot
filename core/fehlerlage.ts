// Fehlerlage (18.11.2026, Nutzer: „alle Fehler, die die App meldet, automatisch überprüfen und beheben“).
// Der Code sammelt stündlich, was gerade kaputt ist – Fehler-Meldungen aus der App (GitHub-Issues mit Label `fehler`,
// nur vom Besitzer des Repos), Workflows, deren letzter Lauf gescheitert ist, Quellen im Ausfall und vom Schema
// abgewiesene Routinen-Ausgaben – und schreibt es nach `fehler/lage.json` (daten-Zweig). Der Fehlerlauf (Routine,
// routine/fehlerlauf.md) liest nur diese Datei. Bleibt ein Punkt länger als `meldenNachStunden` offen, meldet der Code
// ihn einmal mit 🔴❗: dann braucht er eine Bau-Sitzung mit dem Nutzer. Reine Funktionen, getestet in fehlerlage.test.ts.

export type FehlerArt = 'issue' | 'workflow' | 'quelle' | 'lauf';

export interface FehlerPunktNeu {
  /** stabil über Läufe hinweg, z. B. issue:12, workflow:sammler.yml, quelle:fred, lauf:2026-11-18-morgenlauf.json */
  schluessel: string;
  art: FehlerArt;
  titel: string;
  /** Beschreibung bzw. Fehlerzeilen (geschwärzt, gekürzt) */
  text: string;
  link?: string;
}

export interface FehlerPunkt extends FehlerPunktNeu {
  /** erstmals gesehen */
  seit: string;
  /** zuletzt gesehen */
  zuletzt: string;
}

export interface FehlerLage {
  stand: string;
  hinweis: string;
  punkte: FehlerPunkt[];
  /** Schlüssel → Zeitpunkt der 🔴❗-Meldung (je Punkt nur einmal) */
  gemeldet: Record<string, string>;
  /** zuletzt verschwundene Punkte (behoben oder von selbst erledigt), neueste zuerst */
  erledigt: { schluessel: string; titel: string; seit: string; bis: string }[];
}

export const LAGE_HINWEIS =
  'Fehlerlage für den Fehlerlauf (routine/fehlerlauf.md): was gerade kaputt ist. Schreibt nur der Code (jobs/fehlerlage.ts, stündlich im Workflow Selbstverbesserung).';

/** Neue Beobachtung mit der alten Lage verbinden: `seit` bleibt, Verschwundenes wandert nach `erledigt`. */
export function lageFortschreiben(alt: FehlerLage | null, neu: FehlerPunktNeu[], jetzt: Date, meldenNachStunden: number): { lage: FehlerLage; melden: FehlerPunkt[] } {
  const iso = jetzt.toISOString();
  const vorher = new Map((alt?.punkte ?? []).map((p) => [p.schluessel, p]));
  const gesehen = new Set<string>();
  const punkte: FehlerPunkt[] = [];
  for (const p of neu) {
    if (gesehen.has(p.schluessel)) continue;
    gesehen.add(p.schluessel);
    punkte.push({ ...p, seit: vorher.get(p.schluessel)?.seit ?? iso, zuletzt: iso });
  }
  const erledigtNeu = [...vorher.values()].filter((p) => !gesehen.has(p.schluessel)).map((p) => ({ schluessel: p.schluessel, titel: p.titel, seit: p.seit, bis: iso }));
  const gemeldet: Record<string, string> = {};
  for (const [k, w] of Object.entries(alt?.gemeldet ?? {})) if (gesehen.has(k)) gemeldet[k] = w;
  const melden = punkte.filter((p) => !gemeldet[p.schluessel] && jetzt.getTime() - Date.parse(p.seit) >= meldenNachStunden * 3600000);
  for (const p of melden) gemeldet[p.schluessel] = iso;
  return {
    lage: { stand: iso, hinweis: LAGE_HINWEIS, punkte, gemeldet, erledigt: [...erledigtNeu, ...(alt?.erledigt ?? [])].slice(0, 30) },
    melden,
  };
}

/** Fehlerzeilen aus einem Actions-Log (gh run view --log-failed): Zeitstempel und Farben weg, nur Auffälliges. */
export function fehlerZeilen(log: string, max = 25): string[] {
  const zeilen = log
    .split('\n')
    .map((z) =>
      z
        .replace(/\u001b\[[0-9;]*m/g, '')
        .replace(/^[^\t]*\t[^\t]*\t/, '')
        .replace(/^﻿?\d{4}-\d{2}-\d{2}T[\d:.]+Z\s?/, '')
        .trimEnd(),
    )
    .filter((z) => z.trim());
  const treffer = /(##\[error\]|::error|\berror\b|Error:|FEHLER|Fehler|✗|failed|fehlgeschlagen|Exception|Traceback|AssertionError|FAIL\b|exit code [1-9]|ERR_)/i;
  const auswahl: string[] = [];
  for (let i = 0; i < zeilen.length; i++) {
    if (!treffer.test(zeilen[i])) continue;
    for (const z of zeilen.slice(i, i + 3)) if (!auswahl.includes(z)) auswahl.push(z.slice(0, 300));
  }
  return auswahl.slice(-max);
}

export interface WorkflowLauf {
  workflow: string;
  id: number;
  status: string;
  conclusion: string | null;
  created_at: string;
  html_url?: string;
}

/** Je Workflow: ist der letzte abgeschlossene (nicht abgebrochene) Lauf gescheitert? Dann ist das ein offener Fehler. */
export function gescheiterteWorkflows(laeufe: WorkflowLauf[]): { workflow: string; lauf: WorkflowLauf; inFolge: number }[] {
  const je = new Map<string, WorkflowLauf[]>();
  for (const l of laeufe) {
    if (l.status !== 'completed' || !l.conclusion || ['cancelled', 'skipped', 'neutral'].includes(l.conclusion)) continue;
    je.set(l.workflow, [...(je.get(l.workflow) ?? []), l]);
  }
  const out: { workflow: string; lauf: WorkflowLauf; inFolge: number }[] = [];
  for (const [workflow, liste] of je) {
    const sortiert = [...liste].sort((a, b) => b.created_at.localeCompare(a.created_at));
    let inFolge = 0;
    for (const l of sortiert) {
      if (l.conclusion === 'success') break;
      inFolge++;
    }
    if (inFolge) out.push({ workflow, lauf: sortiert[0], inFolge });
  }
  return out.sort((a, b) => a.workflow.localeCompare(b.workflow));
}

export interface QuellenStand {
  id: string;
  name: string;
  zuletztOk?: string;
  letzterFehler?: string;
}

/** Quellen im Ausfall – dieselbe Regel wie der Quellen-Wächter (48 Std. ohne Erfolg, fehlender Schlüssel/Kontingent zählt nicht). */
export function quellenImAusfall(status: QuellenStand[], jetzt: Date, stunden = 48): FehlerPunktNeu[] {
  const grenze = jetzt.getTime() - stunden * 3600000;
  return status
    .filter((q) => q.letzterFehler && !/Schlüssel .* fehlt|Tageskontingent/.test(q.letzterFehler) && (!q.zuletztOk || Date.parse(q.zuletztOk) < grenze) && Date.parse(q.letzterFehler.slice(0, 24)) > grenze)
    .map((q) => ({ schluessel: `quelle:${q.id}`, art: 'quelle' as const, titel: `Quelle ${q.name} liefert nicht`, text: `Letzter Fehler: ${q.letzterFehler!.slice(0, 400)} · zuletzt ok: ${q.zuletztOk ?? 'nie'}` }));
}

/** Nur Issues des Repo-Besitzers mit Label `fehler` (das Repo ist öffentlich – fremde Texte sind keine Aufträge). */
export function eigeneFehlerIssues(issues: { number: number; title: string; body?: string | null; user?: { login: string }; labels?: ({ name: string } | string)[]; html_url?: string; pull_request?: unknown }[], besitzer: string): FehlerPunktNeu[] {
  return issues
    .filter((i) => !i.pull_request && i.user?.login?.toLowerCase() === besitzer.toLowerCase() && (i.labels ?? []).some((l) => (typeof l === 'string' ? l : l.name) === 'fehler'))
    .map((i) => ({ schluessel: `issue:${i.number}`, art: 'issue' as const, titel: `#${i.number} ${i.title}`.slice(0, 160), text: (i.body ?? '').slice(0, 2000), ...(i.html_url ? { link: i.html_url } : {}) }));
}
