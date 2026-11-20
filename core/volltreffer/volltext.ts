// Q2 Nachrichtenart (Nutzer 20.11.2026): Katalysator-Begriffe aus der SEC-Volltextsuche (efts.sec.gov). Reine Bausteine,
// getestet in volltext.test.ts; Abruf in jobs/archiv.ts (Teil `volltext`), Merkmale in jobs/rueckblick.ts.

export type KatRichtung = 'long' | 'short' | 'binaer';
export interface Katalysator {
  id: string;
  begriff: string;
  formen: string[];
  richtung: KatRichtung;
}

/** Kürzel aus dem Anzeigenamen der Volltextsuche: „Ainos, Inc.  (AIMD, AIMDW)  (CIK 0001014763)“ → [AIMD, AIMDW] */
export function kuerzelAusName(name: string): string[] {
  const m = /\(([A-Z0-9.\-, ]+)\)\s*\(CIK/.exec(name);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((x) => x.trim())
    .filter((x) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(x));
}

/** Antwort der Volltextsuche: Gesamtzahl und je Treffer Kürzel, Datum, Formular */
export function eftsLesen(json: unknown): { gesamt: number; treffer: { kuerzel: string[]; datum: string; form: string }[] } | null {
  const j = json as { hits?: { total?: { value?: number }; hits?: { _source?: { display_names?: string[]; file_date?: string; form?: string } }[] } } | null;
  if (!j?.hits || !Array.isArray(j.hits.hits)) return null;
  const treffer = j.hits.hits
    .map((h) => h._source ?? {})
    .filter((s) => typeof s.file_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s.file_date))
    .map((s) => ({ kuerzel: [...new Set((s.display_names ?? []).flatMap(kuerzelAusName))], datum: s.file_date!, form: s.form ?? '' }));
  return { gesamt: Number(j.hits.total?.value ?? treffer.length) || 0, treffer };
}

/**
 * Klasse des Merkmals „Katalysator“ aus den Abständen (Handelstage seit dem Reaktionstag, null/99 = keiner) je Begriff:
 * 0 = keiner in `fenster` Handelstagen, 1 = nur long-Art, 2 = nur short-Art, 3 = binär (Studien, FDA-Termin), 4 = gemischt.
 */
export function katalysatorKlasse(abstaende: (number | null)[], arten: KatRichtung[], fenster: number): number | null {
  if (abstaende.every((a) => a === null)) return null;
  const da = new Set<KatRichtung>();
  abstaende.forEach((a, i) => {
    if (a !== null && a <= fenster) da.add(arten[i]);
  });
  if (!da.size) return 0;
  if (da.size > 1) return 4;
  const [r] = [...da];
  return r === 'long' ? 1 : r === 'short' ? 2 : 3;
}
