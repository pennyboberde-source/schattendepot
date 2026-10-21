// Orderentgelte nach Consorsbank-Standardpreis. Alle Werte kommen aus config/gebuehren.json.
// Bewusst immer Standard: keine Statusstufen, keine Freetrades.
import { runde } from './geld.ts';

export interface Handelsplatz {
  name: string;
  entgelt: number;
  variabelProzent: number;
}

export interface GebuehrenConfig {
  orderentgelt: { grundpreis: number; prozent: number; min: number; max: number };
  handelsplaetze: Record<string, Handelsplatz>;
  standardHandelsplatz: string;
}

export interface Orderentgelt {
  provision: number;
  handelsplatz: number;
  gesamt: number;
}

export interface EntgeltOptionen {
  /** Kürzel aus config, z. B. "TGT". Standard: standardHandelsplatz. */
  handelsplatz?: string;
}

/** Entgelt für eine einzelne Order (Kauf oder Verkauf) mit dem angegebenen Kurswert in Euro. */
export function orderentgelt(kurswert: number, cfg: GebuehrenConfig, opt: EntgeltOptionen = {}): Orderentgelt {
  if (!(kurswert > 0)) throw new Error(`Kurswert muss positiv sein (${kurswert})`);
  const kuerzel = opt.handelsplatz ?? cfg.standardHandelsplatz;
  const hp = cfg.handelsplaetze[kuerzel];
  if (!hp) throw new Error(`Unbekannter Handelsplatz: ${kuerzel}`);
  const { grundpreis, prozent, min, max } = cfg.orderentgelt;
  const provision = runde(Math.min(max, Math.max(min, grundpreis + (kurswert * prozent) / 100)));
  const handelsplatz = runde(hp.entgelt + (kurswert * hp.variabelProzent) / 100);
  return { provision, handelsplatz, gesamt: runde(provision + handelsplatz) };
}
