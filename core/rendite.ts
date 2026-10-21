// Stückzahl, Kauf-/Verkaufsbeträge, Ergebnis und Zielkurs „nach Gebühren“.
import { runde } from './geld.ts';
import { orderentgelt, type EntgeltOptionen, type GebuehrenConfig, type Orderentgelt } from './gebuehren.ts';

/** Ganze Stücke, sodass der Kurswert den Betrag nicht übersteigt. 0, wenn ein Stück teurer ist. */
export function stueckFuerBetrag(brief: number, betrag: number): number {
  if (!(brief > 0)) throw new Error(`Briefkurs muss positiv sein (${brief})`);
  // kleine Toleranz gegen Gleitkomma-Effekte (z. B. 1000 / 0.1)
  return Math.floor(betrag / brief + 1e-9);
}

export interface Seite {
  stueck: number;
  kurs: number;
  kurswert: number;
  entgelt: Orderentgelt;
  /** Kauf: Kurswert + Entgelt (Kapitaleinsatz). Verkauf: Kurswert − Entgelt (Erlös). */
  betrag: number;
}

export function kaufen(stueck: number, brief: number, cfg: GebuehrenConfig, opt: EntgeltOptionen = {}): Seite {
  const kurswert = runde(stueck * brief);
  const entgelt = orderentgelt(kurswert, cfg, opt);
  return { stueck, kurs: brief, kurswert, entgelt, betrag: runde(kurswert + entgelt.gesamt) };
}

export function verkaufen(stueck: number, geld: number, cfg: GebuehrenConfig, opt: EntgeltOptionen = {}): Seite {
  const kurswert = runde(stueck * geld);
  // Restwert 0 (z. B. Knock-out ohne Restwert): keine Order, kein Entgelt.
  if (kurswert <= 0) {
    return { stueck, kurs: geld, kurswert: 0, entgelt: { provision: 0, handelsplatz: 0, gesamt: 0 }, betrag: 0 };
  }
  const entgelt = orderentgelt(kurswert, cfg, opt);
  return { stueck, kurs: geld, kurswert, entgelt, betrag: runde(kurswert - entgelt.gesamt) };
}

export interface Ergebnis {
  /** Kursveränderung in % (Geldkurs Verkauf zu Briefkurs Kauf). */
  kursProzent: number;
  /** Ergebnis nach allen Gebühren in Euro und in % des Kapitaleinsatzes. */
  netto: number;
  nettoProzent: number;
  gebuehren: number;
}

export function ergebnis(kauf: Seite, verkauf: Seite): Ergebnis {
  const netto = runde(verkauf.betrag - kauf.betrag);
  return {
    kursProzent: runde((verkauf.kurs / kauf.kurs - 1) * 100, 2),
    netto,
    nettoProzent: runde((netto / kauf.betrag) * 100, 2),
    gebuehren: runde(kauf.entgelt.gesamt + verkauf.entgelt.gesamt),
  };
}

/**
 * Kleinster Geldkurs beim Verkauf, mit dem nach Gebühren mindestens `nettoProzent` Rendite
 * auf den Kapitaleinsatz erreicht wird (0 = Gewinnschwelle). Gebühren sind stückweise linear,
 * deshalb Bisektion statt Formel.
 */
export function zielkurs(
  kauf: Seite,
  nettoProzent: number,
  cfg: GebuehrenConfig,
  opt: EntgeltOptionen = {},
): number {
  const ziel = kauf.betrag * (1 + nettoProzent / 100);
  const erloes = (k: number) => verkaufen(kauf.stueck, k, cfg, opt).betrag;
  let lo = 0;
  let hi = Math.max(kauf.kurs, 0.0001);
  while (erloes(hi) < ziel) hi *= 2;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (mid <= 0 || erloes(mid) < ziel) lo = mid;
    else hi = mid;
  }
  const stellen = kauf.kurs < 10 ? 4 : 2;
  const f = 10 ** stellen;
  return Math.ceil(hi * f - 1e-7) / f;
}
