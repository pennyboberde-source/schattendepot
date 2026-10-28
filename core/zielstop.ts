// Ziel/Stop je Signaltyp selbst optimieren (Plan Datenkrake S2): Das Schattenbuch misst jeden Kandidaten nach
// 1, 3 und 5 Handelstagen. Für ein Raster aus Ziel/Stop wird simuliert, was nach Gebühren herausgekommen wäre.
// Grob, aber ehrlich: zwischen zwei Messpunkten ist der Verlauf unbekannt (Ziel/Stop gelten am Messpunkt).
import { runde } from './geld.ts';
import type { TrackingEintrag } from './statistik.ts';

export interface ZielStopEinstellungen {
  mindestFaelle: number;
  /** Kursziele vor Gebühren in % (gerichtet: bei Short-Kandidaten ein Kursrückgang) */
  zieleBruttoProzent: number[];
  /** Stops in % (negativ) */
  stopsProzent: number[];
}

export interface ZielStopVorschlag {
  typ: string;
  faelle: number;
  zielBruttoProzent: number;
  /** Ziel nach Gebühren (für `zielNettoProzent` im Order-Plan) */
  zielNettoProzent: number;
  stopProzent: number;
  /** Ø Ergebnis nach Gebühren in % mit dieser Regel … */
  oeNetto: number;
  /** … und ohne Ziel/Stop (einfach 5 Handelstage halten) */
  ohneRegelOeNetto: number;
  /** Kostenhürde (Gebühren hin und zurück + Spread) in % */
  huerde: number;
}

/** Ausstieg entlang der Messpunkte: erstes Erreichen von Ziel oder Stop, sonst letzter Punkt. */
export function simuliereAusstieg(pfad: number[], ziel: number, stop: number): number {
  for (const r of pfad) {
    if (r >= ziel) return ziel;
    if (r <= stop) return stop;
  }
  return pfad[pfad.length - 1];
}

const pfadVon = (t: TrackingEintrag) => [t.r1T, t.r3T, t.r1W].filter((x): x is number => typeof x === 'number');

export function zielStopVorschlaege(tracking: TrackingEintrag[], huerde: (t: TrackingEintrag) => number, e: ZielStopEinstellungen): ZielStopVorschlag[] {
  const nachTyp = new Map<string, TrackingEintrag[]>();
  for (const t of tracking) {
    if (t.art === 'prognose' || typeof t.r1W !== 'number') continue;
    for (const typ of new Set(t.typen)) nachTyp.set(typ, [...(nachTyp.get(typ) ?? []), t]);
  }
  const out: ZielStopVorschlag[] = [];
  for (const [typ, faelle] of nachTyp) {
    if (faelle.length < e.mindestFaelle) continue;
    const h = faelle.map(huerde);
    const oeHuerde = h.reduce((a, b) => a + b, 0) / h.length;
    const mittel = (f: (t: TrackingEintrag, i: number) => number) => faelle.reduce((a, t, i) => a + f(t, i), 0) / faelle.length;
    const ohne = mittel((t, i) => t.r1W! - h[i]);
    let best: { ziel: number; stop: number; wert: number } | null = null;
    for (const ziel of e.zieleBruttoProzent) {
      if (ziel <= oeHuerde) continue; // Ziel muss nach Gebühren etwas übrig lassen
      for (const stop of e.stopsProzent) {
        const wert = mittel((t, i) => simuliereAusstieg(pfadVon(t), ziel, stop) - h[i]);
        // bei Gleichstand das engere Risiko (Stop näher an 0) bevorzugen
        if (!best || wert > best.wert + 1e-9 || (Math.abs(wert - best.wert) < 1e-9 && stop > best.stop)) best = { ziel, stop, wert };
      }
    }
    if (!best) continue;
    out.push({
      typ,
      faelle: faelle.length,
      zielBruttoProzent: best.ziel,
      zielNettoProzent: runde(best.ziel - oeHuerde, 1),
      stopProzent: best.stop,
      oeNetto: runde(best.wert, 2),
      ohneRegelOeNetto: runde(ohne, 2),
      huerde: runde(oeHuerde, 2),
    });
  }
  return out.sort((a, b) => b.oeNetto - a.oeNetto);
}
