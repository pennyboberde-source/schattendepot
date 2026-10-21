// OpenInsider: Cluster-Käufe und größere Käufe von US-Insidern (aus SEC Form 4). 2 Abfragen pro Hauptlauf.
import { holeText } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import { parseHtmlTabelle, zahl } from './parser.ts';
import type { Quelle, QuellenErgebnis } from './typen.ts';
import type { Signal } from '../../core/signale.ts';

export function openInsiderAuswerten(clusterHtml: string, kaeufeHtml: string, jetzt: Date): Pick<QuellenErgebnis, 'signale' | 'insider'> {
  const signale: Signal[] = [];
  const insider: NonNullable<QuellenErgebnis['insider']> = [];
  const zeit = jetzt.toISOString();
  // Nur frische Meldungen (Filing innerhalb von 4 Tagen) – ältere sind meist eingepreist.
  const frisch = (z: Record<string, string>) => {
    const d = Date.parse((z['Filing Date'] ?? '').replace(' ', 'T') + 'Z');
    return Number.isNaN(d) || jetzt.getTime() - d <= 4 * 86400000;
  };
  for (const z of parseHtmlTabelle(clusterHtml, 'tinytable').slice(0, 25)) {
    const ticker = z.Ticker;
    const anzahl = Number(z.Ins) || 2;
    const wert = zahl(z.Value);
    if (!ticker || wert < 100000 || !/^P/.test(z['Trade Type'] ?? 'P') || !frisch(z)) continue;
    const name = z['Company Name'] || ticker;
    const fakt = `${anzahl} Insider kauften für ${(wert / 1e6).toFixed(2)} Mio. $ (Handel ${z['Trade Date'] ?? '?'}, gemeldet ${(z['Filing Date'] ?? '').slice(0, 10)})`;
    signale.push(signal('insider_cluster_kauf', { name, ticker }, Math.min(1, 0.3 + anzahl * 0.07 + Math.log10(wert / 1e5) * 0.12), 1, zeit, 'OpenInsider', fakt, `http://openinsider.com/${ticker}`));
    insider.push({ wertpapier: `${name} (${ticker})`, text: fakt, link: `http://openinsider.com/${ticker}` });
  }
  for (const z of parseHtmlTabelle(kaeufeHtml, 'tinytable').slice(0, 40)) {
    const ticker = z.Ticker;
    const wert = zahl(z.Value);
    if (!ticker || wert < 250000 || !frisch(z)) continue;
    const fakt = `${z['Insider Name'] ?? 'Insider'} (${z.Title ?? ''}) kaufte für ${(wert / 1e6).toFixed(2)} Mio. $`;
    signale.push(signal('insider_kauf', { name: ticker, ticker }, Math.min(1, 0.4 + Math.log10(wert / 2.5e5) * 0.25), 1, zeit, 'OpenInsider', fakt, `http://openinsider.com/${ticker}`));
  }
  return { signale, insider: insider.slice(0, 10) };
}

export const openInsider: Quelle = {
  id: 'openinsider',
  name: 'OpenInsider',
  laeufe: ['haupt'],
  maxProLauf: 2,
  async abrufen(ctx) {
    const [cluster, kaeufe] = [await holeText('http://openinsider.com/latest-cluster-buys'), await holeText('http://openinsider.com/insider-purchases-25k')];
    return { ...openInsiderAuswerten(cluster, kaeufe, ctx.jetzt), abfragen: 2 };
  },
};
