// Schnell-SEC (Quantensprung „Echtzeit“, Nutzer 19.11.2026): Meldungen im Kurswächter-Takt statt stündlich.
// Reine Bausteine: Zeitfenster und „schon gesehen“-Filter (getestet in schnell.test.ts).
import type { Signal } from './signale.ts';

/** Nur werktags, solange Hebelprodukte auf US-Werte an gettex handelbar sind (7–21 Uhr UTC ≈ 8–22 Uhr Berlin) */
export function schnellZeit(utcStunde: number, handelstag: boolean): boolean {
  return handelstag && utcStunde >= 7 && utcStunde < 21;
}

/** Signale, deren Kennung heute noch nicht gesehen wurde; dazu die fortgeschriebene Liste (nur der heutige Tag) */
export function nurNeue(signale: Signal[], gesehen: { datum: string; ids: string[] } | null, datum: string): { neu: Signal[]; gesehen: { datum: string; ids: string[] } } {
  const alt = new Set(gesehen?.datum === datum ? gesehen.ids : []);
  const neu: Signal[] = [];
  for (const s of signale) {
    if (alt.has(s.id)) continue;
    alt.add(s.id);
    neu.push(s);
  }
  return { neu, gesehen: { datum, ids: [...alt].slice(-2000) } };
}

/** Minuten zwischen Meldung (Zeit im Signal) und jetzt – wie schnell der Code reagiert */
export function reaktionMinuten(signale: Signal[], jetzt: Date): number | null {
  const z = signale.map((s) => (jetzt.getTime() - Date.parse(s.zeit)) / 60000).filter((x) => Number.isFinite(x) && x >= 0);
  if (!z.length) return null;
  const s = [...z].sort((a, b) => a - b);
  return Math.round(s[Math.floor(s.length / 2)]);
}
