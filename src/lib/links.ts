// Links nach außen: Fehler melden (GitHub-Issue), Einstellungen im GitHub-Editor, Order in Claude besprechen.
import { euro, prozent } from '../../core/geld.ts';
import type { Order } from '../../core/typen.ts';

/** "besitzer/schattendepot" – setzt der Deploy-Workflow über VITE_REPO. */
export const REPO: string = import.meta.env.VITE_REPO ?? '';

export function fehlerMeldenUrl(kontext: string): string | null {
  if (!REPO) return null;
  const body = [
    '**Was ist passiert?**',
    '',
    '',
    '**Was hätte passieren sollen?**',
    '',
    '',
    '---',
    `Ansicht: ${kontext}`,
    `App-Version: ${import.meta.env.VITE_VERSION ?? 'dev'}`,
    `Gerät: ${navigator.userAgent}`,
  ].join('\n');
  const q = new URLSearchParams({ title: `Fehler: ${kontext}`, body, labels: 'fehler' });
  return `https://github.com/${REPO}/issues/new?${q}`;
}

export function konfigBearbeitenUrl(datei: string): string | null {
  return REPO ? `https://github.com/${REPO}/edit/main/config/${datei}` : null;
}

export function inClaudeBesprechenUrl(o: Order): string {
  const p = o.plan;
  const zeilen = [
    `Im „Schattendepot“ (reine Simulation mit fiktivem Geld, keine Anlageberatung) gibt es diese Order:`,
    `${p.wertpapier.name} (${p.wertpapier.isin}), Strategie ${p.strategie}, Erfolgschance laut Morgenlauf ${p.konfidenz} %.`,
    `These: ${p.these}`,
    o.kauf ? `Gekauft ${o.kauf.stueck} Stk. à ${euro(o.kauf.kurs)} am ${o.kauf.zeit}.` : 'Noch nicht ausgeführt.',
    o.zielkurs && o.stopkurs ? `Ziel ${euro(o.zielkurs)}, Stop ${euro(o.stopkurs)}, Verkaufstermin ${o.verkaufstermin}.` : '',
    o.ergebnis ? `Ergebnis nach Gebühren: ${euro(o.ergebnis.netto)} (${prozent(o.ergebnis.nettoProzent)}).` : '',
    '',
    'Meine Frage dazu: ',
  ].filter(Boolean);
  return `https://claude.ai/new?q=${encodeURIComponent(zeilen.join('\n'))}`;
}
