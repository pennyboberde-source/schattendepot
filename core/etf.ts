// Vergleichsmaßstab: Was hätten 1.000 € im iShares Core MSCI World im selben Zeitraum gebracht – inkl. derselben Gebühren?
import type { GebuehrenConfig } from './gebuehren.ts';
import { ergebnis, kaufen, stueckFuerBetrag, verkaufen } from './rendite.ts';
import { geldBrief, type SpreadConfig } from './spreads.ts';
import type { Kurs } from './typen.ts';

export function etfVergleich(kauf: Kurs, verkauf: Kurs, cfg: { gebuehren: GebuehrenConfig; spreads: SpreadConfig }, betrag: number): { netto: number; nettoProzent: number } | null {
  const brief = geldBrief(kauf, 'etf', cfg.spreads).brief;
  const geld = geldBrief(verkauf, 'etf', cfg.spreads).geld;
  const stueck = stueckFuerBetrag(brief, betrag);
  if (stueck === 0) return null;
  const e = ergebnis(kaufen(stueck, brief, cfg.gebuehren), verkaufen(stueck, geld, cfg.gebuehren));
  return { netto: e.netto, nettoProzent: e.nettoProzent };
}
