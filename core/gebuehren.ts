// Orderentgelte nach Consorsbank-Preismodell. Alle Werte kommen aus config/gebuehren.json.
import { runde } from './geld.ts';

export interface Stufe {
  name: string;
  abAnzahl: number;
  grundpreis: number;
  prozent: number;
  min: number;
  max: number;
  tradegateProvisionsfrei?: boolean;
}

export interface Handelsplatz {
  name: string;
  entgelt: number;
  variabelProzent: number;
}

export interface GebuehrenConfig {
  statusSimulation: boolean;
  stufen: Stufe[];
  freetradeNachAnzahl: number[];
  handelsplaetze: Record<string, Handelsplatz>;
  standardHandelsplatz: string;
}

export interface Orderentgelt {
  provision: number;
  handelsplatz: number;
  gesamt: number;
  stufe: string;
  freetrade: boolean;
}

export interface EntgeltOptionen {
  /** Kürzel aus config, z. B. "TGT". Standard: standardHandelsplatz. */
  handelsplatz?: string;
  /** Bereits ausgeführte Orders im Kalenderjahr vor dieser Order (nur mit statusSimulation relevant). */
  bisherigeOrdersImJahr?: number;
}

export function stufeFuer(cfg: GebuehrenConfig, bisherige: number): Stufe {
  if (!cfg.statusSimulation) return cfg.stufen[0];
  let treffer = cfg.stufen[0];
  for (const s of cfg.stufen) if (bisherige >= s.abAnzahl) treffer = s;
  return treffer;
}

/** Entgelt für eine einzelne Order (Kauf oder Verkauf) mit dem angegebenen Kurswert in Euro. */
export function orderentgelt(kurswert: number, cfg: GebuehrenConfig, opt: EntgeltOptionen = {}): Orderentgelt {
  if (!(kurswert > 0)) throw new Error(`Kurswert muss positiv sein (${kurswert})`);
  const kuerzel = opt.handelsplatz ?? cfg.standardHandelsplatz;
  const hp = cfg.handelsplaetze[kuerzel];
  if (!hp) throw new Error(`Unbekannter Handelsplatz: ${kuerzel}`);
  const bisherige = opt.bisherigeOrdersImJahr ?? 0;
  const stufe = stufeFuer(cfg, bisherige);
  const freetrade = cfg.statusSimulation && cfg.freetradeNachAnzahl.includes(bisherige);

  const handelsplatz = runde(hp.entgelt + (kurswert * hp.variabelProzent) / 100);
  let provision = 0;
  if (!freetrade && !(stufe.tradegateProvisionsfrei && kuerzel === 'TGT')) {
    const roh = stufe.grundpreis + (kurswert * stufe.prozent) / 100;
    provision = runde(Math.min(stufe.max, Math.max(stufe.min, roh)));
  }
  return { provision, handelsplatz, gesamt: runde(provision + handelsplatz), stufe: stufe.name, freetrade };
}
