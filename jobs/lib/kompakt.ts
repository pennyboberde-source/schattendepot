// Kandidat → kompakte Form (Signale-Datei, Schattenbuch, Autopilot) – gemeinsam für Sammler und Schnell-SEC.
import type { AutopilotKandidat } from '../../core/autopilot.ts';
import { pumpVerdacht } from '../../core/datenkrake.ts';
import type { Kandidat } from '../../core/signale.ts';

export function kompakt(k: Kandidat): AutopilotKandidat {
  const typen = [...new Set(k.signale.map((s) => s.typ))];
  const markt = k.wertpapier.markt ?? k.signale.find((s) => s.wertpapier.markt)?.wertpapier.markt;
  const pump = pumpVerdacht(typen, { fakten: k.signale.flatMap((s) => s.quellen.map((q) => q.fakt)) });
  return { schluessel: k.schluessel, name: k.wertpapier.name, ticker: k.wertpapier.ticker, isin: k.wertpapier.isin, ...(markt ? { markt } : {}), ...(pump ? { pump } : {}), score: k.score, typen, quellen: [...new Set(k.signale.flatMap((s) => s.quellen.map((q) => q.quelle)))] };
}
