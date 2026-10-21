// Übernahme einer (bereits schemageprüften) Claude-Entscheidung: fachliche Prüfung und Umwandlung in Ereignisse.
// Claude merkt nur vor; ausgeführt wird erst beim nächsten Kurscheck (core/waechter.ts).
import type { Anpassung, Ereignis, Laufquelle, Order, OrderPlan } from './typen.ts';

export interface Entscheidung {
  typ: 'morgenlauf' | 'abendlauf' | 'ereignislauf' | 'wochenrueckblick';
  datum: string;
  erstellt: string;
  briefing?: string[];
  orders?: OrderPlan[];
  anpassungen?: { orderId: string; feld: Anpassung['feld']; neu: number | string; begruendung: string }[];
  berichte?: { orderId: string; text: string; learnings: string[] }[];
  lektionen?: string;
  gewichtsvorschlaege?: { art: 'signal' | 'quelle'; name: string; faktor: number; begruendung: string }[];
  wochenrueckblick?: { push: string; text: string };
  notiz?: string;
}

export interface Uebernahme {
  ereignisse: Ereignis[];
  hinweise: string[];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

/** Fachliche Prüfung eines Order-Plans (über das Schema hinaus). Gibt Fehlertext oder null zurück. */
export function planFehler(p: OrderPlan, hebelMax: number): string | null {
  const k = p.wertpapier.anlageklasse;
  if (k === 'hebel' && !p.hebel) return 'Hebelprodukt ohne Hebel-Angaben (Basiswert, Basispreis, KO-Schwelle, Bezugsverhältnis)';
  if (k === 'krypto_etn' && !p.etn) return 'Krypto-ETN ohne ETN-Angaben (Basiswert, Anteil je Stück)';
  if (k !== 'hebel' && k !== 'krypto_etn' && !p.wertpapier.kursbasis) return 'Kursbasis fehlt (markt/symbol/waehrung)';
  if (p.hebel) {
    const h = p.hebel;
    if (h.richtung === 'long' && h.koSchwelle < h.basispreis) return 'Long-Knock-out: KO-Schwelle unter Basispreis ist unplausibel';
    if (h.richtung === 'short' && h.koSchwelle > h.basispreis) return 'Short-Knock-out: KO-Schwelle über Basispreis ist unplausibel';
    if (hebelMax <= 0) return 'Hebelprodukte sind ausgeschaltet';
  }
  if (p.pflichtOrder && p.konfidenz > 50) return 'Pflicht-Order mit Konfidenz über 50 ist widersprüchlich';
  if (p.zielNettoProzent <= 0 || p.stopProzent >= 0) return 'Ziel muss positiv, Stop negativ sein';
  return null;
}

export function entscheidungUebernehmen(
  e: Entscheidung,
  orders: Order[],
  jetzt: Date,
  cfg: { haltedauerMinMinuten: number; haltedauerMaxTage: number; hebelMax: number },
): Uebernahme {
  const iso = jetzt.toISOString();
  const quelle: Laufquelle = e.typ;
  const ereignisse: Ereignis[] = [];
  const hinweise: string[] = [];
  const vergeben = new Set(orders.map((o) => o.id));
  const nachId = new Map(orders.map((o) => [o.id, o]));
  const ev = (typ: Ereignis['typ'], orderId: string | undefined, daten: Record<string, unknown>, begruendung?: string): Ereignis => ({
    id: `${iso}-${typ}${orderId ? `-${orderId}` : ''}`,
    zeit: iso,
    typ,
    quelle,
    orderId,
    daten,
    begruendung,
  });

  const frueheste = jetzt.getTime() + Math.max(30, cfg.haltedauerMinMinuten * 2) * 60000;
  const spaeteste = jetzt.getTime() + cfg.haltedauerMaxTage * 86400000;

  for (const plan of e.orders ?? []) {
    const fehler = planFehler(plan, cfg.hebelMax);
    if (fehler) {
      hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: ${fehler}`);
      continue;
    }
    let id = `${e.datum}-${slug(plan.wertpapier.name)}`;
    for (let n = 2; vergeben.has(id); n++) id = `${e.datum}-${slug(plan.wertpapier.name)}-${n}`;
    vergeben.add(id);
    let termin = new Date(plan.verkaufstermin).getTime();
    if (termin < frueheste || termin > spaeteste) {
      const neu = Math.min(Math.max(termin, frueheste), spaeteste);
      hinweise.push(`Verkaufstermin ${plan.wertpapier.name} auf erlaubte Haltedauer begrenzt (${new Date(neu).toISOString()})`);
      termin = neu;
    }
    const verkaufstermin = new Date(termin).toISOString();
    ereignisse.push(ev('vorgemerkt', id, { plan: { ...plan, verkaufstermin }, verkaufstermin }, plan.these));
  }

  for (const a of e.anpassungen ?? []) {
    const o = nachId.get(a.orderId);
    if (!o || (o.status !== 'offen' && o.status !== 'vorgemerkt')) {
      hinweise.push(`Anpassung für ${a.orderId} ignoriert: Order nicht offen`);
      continue;
    }
    let neu: number | string = a.neu;
    let alt: number | string | undefined;
    if (a.feld === 'verkaufstermin') {
      const t = new Date(String(a.neu)).getTime();
      if (Number.isNaN(t)) {
        hinweise.push(`Anpassung ${a.orderId}: ungültiger Termin`);
        continue;
      }
      const max = (o.kauf ? new Date(o.kauf.zeit).getTime() : jetzt.getTime()) + cfg.haltedauerMaxTage * 86400000;
      neu = new Date(Math.min(Math.max(t, jetzt.getTime()), max)).toISOString();
      alt = o.verkaufstermin;
    } else {
      if (typeof neu !== 'number' || !(neu > 0)) {
        hinweise.push(`Anpassung ${a.orderId}: ${a.feld} muss ein Kurs in Euro sein`);
        continue;
      }
      alt = a.feld === 'ziel' ? o.zielkurs : o.stopkurs;
      if (o.status === 'vorgemerkt') {
        hinweise.push(`Anpassung ${a.orderId}: Ziel/Stop erst nach dem Kauf änderbar`);
        continue;
      }
    }
    const anpassung: Anpassung = { zeit: iso, quelle, feld: a.feld, alt: alt ?? '', neu, begruendung: a.begruendung };
    ereignisse.push(ev('angepasst', o.id, { anpassung }, a.begruendung));
  }

  for (const b of e.berichte ?? []) {
    const o = nachId.get(b.orderId);
    if (!o || o.status !== 'geschlossen') {
      hinweise.push(`Bericht für ${b.orderId} ignoriert: Order nicht abgeschlossen`);
      continue;
    }
    if (o.bericht) {
      hinweise.push(`Bericht für ${b.orderId} ignoriert: existiert bereits`);
      continue;
    }
    const text = `${b.text.trim()}\n\nLearnings:\n${b.learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
    ereignisse.push(ev('bericht', o.id, { text, learnings: b.learnings }));
  }

  if (e.briefing?.length) ereignisse.push(ev('briefing', undefined, { punkte: e.briefing }));
  ereignisse.push(ev('lauf', undefined, { typ: e.typ, datum: e.datum, erstellt: e.erstellt, orders: (e.orders ?? []).length, notiz: e.notiz ?? '' }));
  if (e.typ === 'morgenlauf' && !(e.orders ?? []).length) hinweise.push('Morgenlauf ohne neue Order – Pflicht-Order fehlt');
  return { ereignisse, hinweise };
}
