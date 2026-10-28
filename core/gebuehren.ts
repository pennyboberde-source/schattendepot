// Orderentgelte nach Consorsbank-Standardpreis. Alle Werte kommen aus config/gebuehren.json.
// Bewusst immer Standard: keine Statusstufen, keine Freetrades.
import { runde } from './geld.ts';

export interface Handelsplatz {
  name: string;
  entgelt: number;
  variabelProzent: number;
  /** true = nur das Handelsplatz-Entgelt, keine Provision (z. B. Trade Republic Krypto: 1 € je Order) */
  ohneProvision?: boolean;
}

export interface GebuehrenConfig {
  orderentgelt: { grundpreis: number; prozent: number; min: number; max: number };
  handelsplaetze: Record<string, Handelsplatz>;
  standardHandelsplatz: string;
  /** Mindermengenzuschlag (z. B. Smartbroker+: unter 500 € Ordervolumen 1 €) */
  mindermenge?: { unter: number; entgelt: number };
  /** true = unbekannter Handelsplatz wird wie der Standard-Handelsplatz gerechnet („als wäre alles dort gehandelt“) */
  fallbackStandardHandelsplatz?: boolean;
  /** Aufschlag je Order für Hebelprodukte anderer Emittenten (z. B. Smartbroker+: UniCredit 0 €, andere 4 €) */
  emittentAufschlag?: { entgelt: number; ausserEmittenten: string[] };
}

export interface Orderentgelt {
  provision: number;
  handelsplatz: number;
  gesamt: number;
}

export interface EntgeltOptionen {
  /** Kürzel aus config, z. B. "TGT". Standard: standardHandelsplatz. */
  handelsplatz?: string;
  /** Emittent eines Hebelprodukts (für den Emittenten-Aufschlag) */
  emittent?: string;
}

/** Entgelt-Optionen einer Depot-Order: Handelsplatz und – bei Hebelprodukten – Emittent. */
export function depotEntgeltOpt(plan: { wertpapier: { handelsplatz: string }; hebel?: { emittent: string } }): EntgeltOptionen {
  return { handelsplatz: plan.wertpapier.handelsplatz, ...(plan.hebel ? { emittent: plan.hebel.emittent } : {}) };
}

/** Entgelt für eine einzelne Order (Kauf oder Verkauf) mit dem angegebenen Kurswert in Euro. */
export function orderentgelt(kurswert: number, cfg: GebuehrenConfig, opt: EntgeltOptionen = {}): Orderentgelt {
  if (!(kurswert > 0)) throw new Error(`Kurswert muss positiv sein (${kurswert})`);
  const gewuenscht = opt.handelsplatz ?? cfg.standardHandelsplatz;
  const kuerzel = cfg.handelsplaetze[gewuenscht] || !cfg.fallbackStandardHandelsplatz ? gewuenscht : cfg.standardHandelsplatz;
  const hp = cfg.handelsplaetze[kuerzel];
  if (!hp) throw new Error(`Unbekannter Handelsplatz: ${kuerzel}`);
  const { grundpreis, prozent, min, max } = cfg.orderentgelt;
  const mindermenge = cfg.mindermenge && kurswert < cfg.mindermenge.unter ? cfg.mindermenge.entgelt : 0;
  const ea = cfg.emittentAufschlag;
  const aufschlag = ea && opt.emittent && !ea.ausserEmittenten.some((e) => opt.emittent!.toLowerCase().includes(e.toLowerCase())) ? ea.entgelt : 0;
  const provision = hp.ohneProvision ? 0 : runde(Math.min(max, Math.max(min, grundpreis + (kurswert * prozent) / 100)) + mindermenge + aufschlag);
  const handelsplatz = runde(hp.entgelt + (kurswert * hp.variabelProzent) / 100);
  return { provision, handelsplatz, gesamt: runde(provision + handelsplatz) };
}

/** Was hätten Kauf und Verkauf bei einem anderen Broker gekostet? (Vergleichswert, immer dessen Standard-Handelsplatz) */
export function entgeltVergleich(kurswerte: number[], cfg: GebuehrenConfig): number {
  return runde(kurswerte.filter((k) => k > 0).reduce((s, k) => s + orderentgelt(k, cfg).gesamt, 0));
}
