// Wöchentliche Anpassung der Gewichte für Signal-Typen und Quellen – nur innerhalb fester Grenzen und ab Mindestfallzahl.
// Datengrundlage: gerichtete 1-Wochen-Rendite der mitverfolgten Kandidaten (Käufe und Nicht-Käufe).
import { runde } from './geld.ts';
import type { Gewichte, SignalConfig } from './signale.ts';
import type { TrackingGruppe } from './statistik.ts';

export interface Grenzen {
  min: number;
  max: number;
  maxAenderungProWoche: number;
  mindestFaelle: number;
}

export interface Aenderung {
  datum: string;
  art: 'signal' | 'quelle';
  name: string;
  alt: number;
  neu: number;
  grund: string;
}

export interface Vorschlag {
  art: 'signal' | 'quelle';
  name: string;
  faktor: number;
  begruendung: string;
  datum?: string;
  status?: string;
}

/** Faktor aus Ø gerichteter 1-Wochen-Rendite: +2 % → ×1,10 (begrenzt auf ± maxAenderung). */
export function faktorAusRendite(oe1W: number, maxAenderung: number): number {
  return Math.min(1 + maxAenderung, Math.max(1 - maxAenderung, 1 + oe1W * 0.05));
}

export function gewichteAnpassen(
  aktuell: Gewichte,
  cfg: SignalConfig & { grenzen: Grenzen },
  nachSignalTyp: Record<string, TrackingGruppe>,
  nachQuelle: Record<string, TrackingGruppe>,
  vorschlaege: Vorschlag[],
  datum: string,
): { gewichte: Gewichte; aenderungen: Aenderung[]; vorschlaegeErledigt: Vorschlag[] } {
  const g = cfg.grenzen;
  const neu: Gewichte = { signale: { ...(aktuell.signale ?? {}) }, quellen: { ...(aktuell.quellen ?? {}) } };
  const aenderungen: Aenderung[] = [];
  const begrenzen = (w: number) => runde(Math.min(g.max, Math.max(g.min, w)), 3);

  const anwenden = (art: 'signal' | 'quelle', name: string, faktor: number, grund: string) => {
    const tabelle = art === 'signal' ? neu.signale! : neu.quellen!;
    const basis = tabelle[name] ?? (art === 'signal' ? (cfg.typen[name]?.gewicht ?? 1) : cfg.quellen.standardGewicht);
    const f = Math.min(1 + g.maxAenderungProWoche, Math.max(1 - g.maxAenderungProWoche, faktor));
    const w = begrenzen(basis * f);
    if (Math.abs(w - basis) >= 0.005) {
      tabelle[name] = w;
      aenderungen.push({ datum, art, name, alt: runde(basis, 3), neu: w, grund });
    }
  };

  for (const [name, t] of Object.entries(nachSignalTyp)) {
    if (t.anzahl < g.mindestFaelle || t.oe1W === null) continue;
    anwenden('signal', name, faktorAusRendite(t.oe1W, g.maxAenderungProWoche), `Ø 1-Wochen-Rendite ${t.oe1W} % (n=${t.anzahl})`);
  }
  for (const [name, t] of Object.entries(nachQuelle)) {
    if (t.anzahl < g.mindestFaelle || t.oe1W === null) continue;
    anwenden('quelle', name, faktorAusRendite(t.oe1W, g.maxAenderungProWoche), `Ø 1-Wochen-Rendite ${t.oe1W} % (n=${t.anzahl})`);
  }

  // Claude-Vorschläge nur, wenn genug Fälle vorliegen und die Daten nicht widersprechen (Richtung muss passen).
  const erledigt: Vorschlag[] = [];
  for (const v of vorschlaege.filter((x) => (x.status ?? 'offen') === 'offen')) {
    const t = (v.art === 'signal' ? nachSignalTyp : nachQuelle)[v.name];
    const genug = t && t.anzahl >= g.mindestFaelle && t.oe1W !== null;
    const passt = genug && Math.sign(v.faktor - 1) === Math.sign(t.oe1W!) ;
    if (passt && !aenderungen.some((a) => a.art === v.art && a.name === v.name)) anwenden(v.art, v.name, v.faktor, `Vorschlag Abendlauf: ${v.begruendung}`);
    erledigt.push({ ...v, status: passt ? 'übernommen' : genug ? 'abgelehnt (Daten widersprechen)' : 'abgelehnt (zu wenige Fälle)' });
  }
  return { gewichte: neu, aenderungen, vorschlaegeErledigt: erledigt };
}
