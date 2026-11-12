// Episoden im Schattenbuch (Plan Volltreffer V0, „ehrliche Fallzahlen“): Derselbe Wert steht oft an mehreren Tagen
// hintereinander im Buch (z. B. BRK-A dreimal in drei Tagen). Für die Statistik zählt er je Episode nur einmal:
// Einträge mit gleichem Schlüssel gehören zur selben Episode, solange zwischen zwei Einträgen weniger als
// `abstandTage` Handelstage liegen. Vertreter ist der erste Eintrag mit Startkurs (sonst der erste Eintrag).
import { handelstageZwischen } from './kalender.ts';

export interface EpisodenEintrag {
  schluessel: string;
  datum: string;
  start?: number;
  startZeit?: string;
}

export const EPISODEN_ABSTAND_TAGE = 10;

/** Je Episode ein Vertreter, in der Reihenfolge des ersten Auftretens. */
export function episodenVertreter<T extends EpisodenEintrag>(liste: T[], abstandTage = EPISODEN_ABSTAND_TAGE): T[] {
  const sortiert = [...liste].sort((a, b) => a.datum.localeCompare(b.datum) || (a.startZeit ?? '').localeCompare(b.startZeit ?? ''));
  const offen = new Map<string, { letztes: string; index: number }>();
  const out: T[] = [];
  // ein fehlerhaftes Datum darf die Statistik nicht abbrechen lassen → gilt als neue Episode
  const abstand = (von: string, bis: string) => {
    try {
      return handelstageZwischen(von, bis);
    } catch {
      return Infinity;
    }
  };
  for (const t of sortiert) {
    const e = offen.get(t.schluessel);
    if (e && abstand(e.letztes, t.datum) < abstandTage) {
      e.letztes = t.datum;
      // der erste Eintrag der Episode war nicht messbar → der erste mit Startkurs vertritt sie
      if (!out[e.index].start && t.start) out[e.index] = t;
      continue;
    }
    offen.set(t.schluessel, { letztes: t.datum, index: out.length });
    out.push(t);
  }
  return out;
}

/** Median einer Zahlenliste (null bei leerer Liste). */
export function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
