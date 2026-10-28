// Starke Gegensignale zu offenen Positionen finden (Plan Datenkrake S2): Der Sammler merkt sie in
// daten/gegensignale.json, der Kurswächter verkauft dann sofort – zu einem Kurs nach dem Erkennen.
import { benoetigteKursbasis } from './bewertung.ts';
import type { Signal } from './signale.ts';
import type { Order } from './typen.ts';
import { GEGENSIGNALE_LONG, GEGENSIGNALE_SHORT, type Gegensignal } from './waechter.ts';

const ohneBoerse = (s?: string) => (s ?? '').toUpperCase().replace(/\..*$/, '');

function symbolVon(o: Order): string {
  try {
    return ohneBoerse(benoetigteKursbasis(o.plan).symbol);
  } catch {
    return ohneBoerse(o.plan.wertpapier.ticker);
  }
}

/** Ist dieses Signal stark genug für einen Sofort-Verkauf? Handelsstopp nur bei T12/H10 (Richtung −1, Stärke ≥ 0,8). */
export function istStarkesGegensignal(s: Signal, richtung: 'long' | 'short'): boolean {
  if (richtung === 'short') return GEGENSIGNALE_SHORT.has(s.typ) && s.richtung === 1;
  if (!GEGENSIGNALE_LONG.has(s.typ)) return false;
  if (s.typ === 'handelsstopp') return s.richtung === -1 && s.staerke >= 0.8;
  return s.richtung === -1;
}

/** Gegensignale je Order-ID: bestehende bleiben, neue kommen dazu, nicht mehr offene Orders fallen heraus. */
export function gegensignaleFinden(orders: Order[], signale: Signal[], alt: Record<string, Gegensignal>, jetzt: Date): Record<string, Gegensignal> {
  const neu: Record<string, Gegensignal> = {};
  for (const o of orders.filter((x) => x.status === 'offen' && x.kauf)) {
    if (alt[o.id]) {
      neu[o.id] = alt[o.id];
      continue;
    }
    const sym = symbolVon(o);
    if (!sym) continue;
    const richtung = o.plan.hebel?.richtung === 'short' ? 'short' : 'long';
    const s = signale.find((x) => ohneBoerse(x.wertpapier.ticker) === sym && istStarkesGegensignal(x, richtung));
    if (!s) continue;
    neu[o.id] = { typ: s.typ, zeit: s.zeit, erkannt: jetzt.toISOString(), text: `${s.typ}: ${s.quellen.map((q) => `${q.quelle}: ${q.fakt}`).join(' | ')}`.slice(0, 400) };
  }
  return neu;
}
