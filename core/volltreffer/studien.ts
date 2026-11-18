// F3 Katalysator-Termine (18.11.2026): klinische Studien je börsennotierter Biotech-/Pharma-Firma aus ClinicalTrials.gov
// (API v2, frei, ohne Schlüssel). Fälle wie Viking (Phase-2-Daten im angekündigten Quartal) haben einen erkennbaren Termin:
// das erwartete Ende der Hauptauswertung (Primary Completion). Die API liefert nur den HEUTIGEN Stand – für den Rückblick
// wäre das ein Rückschaufehler. Deshalb: täglicher Schnappschuss (nur anhängen), Merkmal erst aus Schnappschüssen ≤ Stichtag.
// Bis genug Schnappschüsse da sind, dient der Termin nur als Hinweis für Claudes Urteil (V5) und in der Lauerliste.
// Reine Funktionen.

export interface Studie {
  nct: string;
  phase: string;
  status: string;
  /** erwartetes oder tatsächliches Ende der Hauptauswertung (JJJJ-MM oder JJJJ-MM-TT) */
  ende: string | null;
  endeArt: 'erwartet' | 'tatsaechlich' | null;
}

/** Biotech/Pharma/Medizintechnik nach SIC (2833–2836 Pharma, 3841–3845 Medizintechnik, 8731 Forschung) */
export const istBiotech = (sic: number | null | undefined) => !!sic && ((sic >= 2833 && sic <= 2836) || (sic >= 3841 && sic <= 3845) || sic === 8731);

/** Firmenname für die Sponsorsuche: Rechtsform und Satzzeichen weg */
export function sponsorName(titel: string): string {
  return titel
    .replace(/[.,]/g, ' ')
    .replace(/\b(inc|corp|corporation|co|ltd|plc|llc|holdings?|group|n ?v|s ?a|ag|se|limited|company)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Antwort von /api/v2/studies → Studien (nur Phase 2/3, aktive oder kürzlich beendete) */
export function studienLesen(json: unknown): Studie[] {
  const d = json as { studies?: { protocolSection?: { identificationModule?: { nctId?: string }; statusModule?: { overallStatus?: string; primaryCompletionDateStruct?: { date?: string; type?: string } }; designModule?: { phases?: string[] } } }[] };
  const aus: Studie[] = [];
  for (const s of d.studies ?? []) {
    const p = s.protocolSection;
    const nct = p?.identificationModule?.nctId;
    const phasen = p?.designModule?.phases ?? [];
    if (!nct || !phasen.some((x) => /PHASE2|PHASE3/.test(x))) continue;
    const pc = p?.statusModule?.primaryCompletionDateStruct;
    aus.push({
      nct,
      phase: phasen.join('/'),
      status: p?.statusModule?.overallStatus ?? '',
      ende: pc?.date ?? null,
      endeArt: pc?.type === 'ACTUAL' ? 'tatsaechlich' : pc?.type ? 'erwartet' : null,
    });
  }
  return aus;
}

const tagAus = (d: string) => (d.length === 7 ? `${d}-15` : d.slice(0, 10));

/** Nächster erwarteter Studien-Termin (Phase 2/3, noch nicht abgeschlossen) ab `datum`, in Kalendertagen; null = keiner */
export function tageBisStudie(studien: Studie[] | undefined, datum: string, maxTage = 180): number | null {
  let best: number | null = null;
  for (const s of studien ?? []) {
    if (!s.ende || s.endeArt !== 'erwartet' || /COMPLETED|TERMINATED|WITHDRAWN|SUSPENDED/.test(s.status)) continue;
    const t = Math.round((Date.parse(`${tagAus(s.ende)}T12:00:00Z`) - Date.parse(`${datum}T12:00:00Z`)) / 86400000);
    if (t < -30 || t > maxTage) continue;
    if (best === null || Math.abs(t) < Math.abs(best)) best = t;
  }
  return best;
}
