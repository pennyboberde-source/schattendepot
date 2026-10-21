// Geld-/Briefkurs: echt, wenn die Quelle ihn liefert, sonst synthetisch aus Mittelkurs und Spread (config/spreads.json).
import { runde } from './geld.ts';

export type SpreadKlasse = 'aktie_dax' | 'aktie_large' | 'aktie_neben' | 'etf' | 'hebel' | 'krypto_etn';

export interface SpreadConfig {
  klassen: Record<SpreadKlasse, { name: string; prozent: number; spanne: [number, number] }>;
}

export interface GeldBrief {
  geld: number;
  brief: number;
  synthetisch: boolean;
}

/** Kurse unter 10 € bekommen 4 Nachkommastellen (Hebelprodukte), sonst 3. */
function kursStellen(x: number): number {
  return x < 10 ? 4 : 3;
}

export function geldBrief(
  kurs: { wert: number; geld?: number; brief?: number },
  klasse: SpreadKlasse,
  cfg: SpreadConfig,
  spreadProzent?: number,
): GeldBrief {
  if (kurs.geld && kurs.brief && kurs.brief >= kurs.geld) {
    return { geld: kurs.geld, brief: kurs.brief, synthetisch: false };
  }
  const k = cfg.klassen[klasse];
  if (!k) throw new Error(`Unbekannte Spread-Klasse: ${klasse}`);
  const halb = (kurs.wert * (spreadProzent ?? k.prozent)) / 200;
  const st = kursStellen(kurs.wert);
  return { geld: runde(kurs.wert - halb, st), brief: runde(kurs.wert + halb, st), synthetisch: true };
}
