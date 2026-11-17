// Plattformwahl für Depot-Orders (17.11.2026, Nutzer: „alle Bereiche so schlau wie möglich“ – wie im Bereich Volltreffer
// seit 16.11.: „Wenn auf gettex nicht handelbar, trotzdem handeln auf einer simulierten Plattform, die diese anbietet,
// vermerken und Kosten verrechnen“). Reihenfolge für einen nachgebildeten Turbo (Wunsch-Hebel) auf einen US-Wert:
// Hebelprodukt an gettex → Hebelprodukt an anderer deutscher Börse/außerbörslich (Smartbroker+) → simulierter US-Broker
// (Leerverkauf/Marge bis maxHebel) → CFD-Broker (Nutzer 17.11.: „lieber kaufen und als vielleicht unrealistisch, da
// Handelbarkeit nicht geprüft, vermerken, als es zu lassen“ – Privatkunden bis 5:1, Profikunden bis 20:1). Direktkauf einer US-Aktie ohne ISIN: Smartbroker+ an der US-Börse.
// Grundlage ist die amtliche Liste ESMA FIRDS (privat im Archiv). Ohne frische Liste bleibt alles wie bisher (gettex).
// Reine Funktionen.
import type { HebelStand } from './volltreffer/firds.ts';
import type { OrderPlan } from './typen.ts';

export type DepotPlatz = 'gettex' | 'boerse' | 'ausland' | 'us' | 'cfd';

/** Handelsplatz-Kürzel im Gebührenmodell (config/gebuehren-smartbroker.json › handelsplaetze) */
export const HANDELSPLATZ_JE_PLATZ: Record<DepotPlatz, string> = { gettex: 'GTX', boerse: 'SBX', ausland: 'USA', us: 'USB', cfd: 'CFD' };

export type PlattformWahl =
  | { art: 'unveraendert' }
  | { art: 'platz'; platz: DepotPlatz; handelsplatz: string; grund: string; ungeprueft?: boolean };

/** Hebelstand je US-Kürzel aus der FIRDS-Liste (ISIN des Basiswerts → Kürzel), mit Frische- und Abdeckungsprüfung. */
export function hebelJeKuerzel(
  liste: { quelle: string; basiswerte: Record<string, HebelStand> },
  zuordnung: Record<string, string | null>,
  heute: string,
  e: { maxAlterTage: number; mindestZugeordnet: number },
): { je: Map<string, HebelStand>; vollstaendig: boolean; isins: number; zugeordnet: number } {
  const je = new Map<string, HebelStand>();
  const isins = Object.keys(liste.basiswerte);
  const zugeordnet = isins.filter((i) => i in zuordnung).length;
  for (const i of isins) {
    const k = zuordnung[i];
    if (!k) continue;
    const a = je.get(k);
    const b = liste.basiswerte[i];
    je.set(k, a ? { l: [a.l[0] + b.l[0], a.l[1] + b.l[1]], s: [a.s[0] + b.s[0], a.s[1] + b.s[1]] } : b);
  }
  const alter = (Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${liste.quelle}T12:00:00Z`)) / 86400000;
  const vollstaendig = alter <= e.maxAlterTage && isins.length > 0 && zugeordnet / isins.length >= e.mindestZugeordnet;
  return { je, vollstaendig, isins: isins.length, zugeordnet };
}

const symbol = (plan: OrderPlan) => (plan.wertpapier.kursbasis?.symbol ?? plan.wertpapier.ticker ?? '').toUpperCase().replace(/\..*$/, '');

/**
 * Plattform für eine Depot-Order beim Kauf. `hebelJe` = null: keine frische FIRDS-Liste → unverändert (wie bisher gettex).
 * Krypto direkt, echte Hebelprodukte mit eigener ISIN und Werte außerhalb der USA bleiben unverändert.
 */
export function depotPlattform(plan: OrderPlan, hebelJe: Map<string, HebelStand> | null, usMaxHebel: number, cfd: { maxHebelPrivat: number; maxHebelProfi: number } = { maxHebelPrivat: 5, maxHebelProfi: 20 }): PlattformWahl {
  const wp = plan.wertpapier;
  if (wp.anlageklasse === 'krypto' || wp.handelsplatz === 'TRK') return { art: 'unveraendert' };
  if (wp.kursbasis?.markt !== 'us') return { art: 'unveraendert' };
  if (plan.hebelWunsch && !plan.hebel) {
    if (!hebelJe) return { art: 'unveraendert' };
    const r = plan.hebelWunsch.richtung;
    const [g, a] = (r === 'long' ? hebelJe.get(symbol(plan))?.l : hebelJe.get(symbol(plan))?.s) ?? [0, 0];
    const was = r === 'long' ? 'Call/Long-Turbo' : 'Put/Short-Turbo';
    if (g > 0) return { art: 'platz', platz: 'gettex', handelsplatz: HANDELSPLATZ_JE_PLATZ.gettex, grund: `${was} an gettex vorhanden (ESMA FIRDS)` };
    if (a > 0) return { art: 'platz', platz: 'boerse', handelsplatz: HANDELSPLATZ_JE_PLATZ.boerse, grund: `${was} nicht an gettex, aber an einer anderen deutschen Börse (ESMA FIRDS)` };
    if (plan.hebelWunsch.hebel <= usMaxHebel)
      return { art: 'platz', platz: 'us', handelsplatz: HANDELSPLATZ_JE_PLATZ.us, grund: `kein ${was} an deutschen Börsen – ${r === 'short' ? 'Leerverkauf' : 'Marge'} beim US-Broker (Hebel ${plan.hebelWunsch.hebel})` };
    const h = plan.hebelWunsch.hebel;
    const stufe = h <= cfd.maxHebelPrivat ? `Privatkunde bis ${cfd.maxHebelPrivat}:1` : h <= cfd.maxHebelProfi ? `nur als Profikunde bis ${cfd.maxHebelProfi}:1` : `über jedem bekannten Angebot (Profikunde bis ${cfd.maxHebelProfi}:1) – unrealistisch`;
    return { art: 'platz', platz: 'cfd', handelsplatz: HANDELSPLATZ_JE_PLATZ.cfd, ungeprueft: true, grund: `kein ${was} an deutschen Börsen, Hebel ${h} über der US-Marge (${usMaxHebel}) – CFD ${stufe}; ob der Anbieter den Wert${r === 'short' ? ' leer' : ''} handelt, ist NICHT geprüft` };
  }
  if (!plan.hebel && !wp.isin && (wp.anlageklasse === 'aktie' || wp.anlageklasse === 'etf'))
    return { art: 'platz', platz: 'ausland', handelsplatz: HANDELSPLATZ_JE_PLATZ.ausland, grund: 'ohne ISIN nicht an gettex – Smartbroker+ an der US-Börse' };
  return { art: 'unveraendert' };
}
