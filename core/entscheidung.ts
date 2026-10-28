// Übernahme einer (bereits schemageprüften) Claude-Entscheidung: fachliche Prüfung und Umwandlung in Ereignisse.
// Claude merkt nur vor; ausgeführt wird erst beim nächsten Kurscheck (core/waechter.ts).
import type { Anpassung, Ereignis, Laufquelle, Order, OrderPlan } from './typen.ts';
import { korrigierteChance, type KalibrierStufe } from './datenkrake.ts';

export interface Entscheidung {
  typ: 'morgenlauf' | 'mittagslauf' | 'abendlauf' | 'ereignislauf' | 'wochenrueckblick';
  datum: string;
  erstellt: string;
  briefing?: string[];
  orders?: OrderPlan[];
  anpassungen?: { orderId: string; feld: Anpassung['feld']; neu: number | string; begruendung: string }[];
  berichte?: { orderId: string; text: string; learnings: string[]; einwandEingetreten?: boolean; ersetzt?: boolean }[];
  /** Claudes Tagesprognose (Morgenlauf): bis 10 Werte mit Richtung, ohne Geld – wird im Schattenbuch gemessen */
  prognose?: TagesPrognose[];
  /** Daytrading-Watchlist (Morgenlauf, S3): bis 5 Werte für den eigenen Bereich Daytrading */
  daytrading?: DaytradingWunsch[];
  lektionen?: string;
  gewichtsvorschlaege?: { art: 'signal' | 'quelle'; name: string; faktor: number; begruendung: string }[];
  wochenrueckblick?: { push: string; text: string };
  /** Abendlauf (S4): 1–3 Punkte „Heute gelernt“ */
  heuteGelernt?: string[];
  /** Wochenrückblick am ersten Samstag im Monat (S4): Tiefenprüfung mit Vorschlägen */
  monatspruefung?: { push?: string; text: string; vorschlaege: { bereich: string; vorschlag: string; begruendung: string }[] };
  notiz?: string;
}

export interface DaytradingWunsch {
  name: string;
  markt: 'us' | 'eu' | 'krypto';
  isin?: string;
  symbol?: string;
  setup: 'orb' | 'level';
  level?: number;
  richtung: 'long' | 'short' | 'beide';
  instrument?: 'aktie' | 'turbo';
  hebel?: number;
  chance: number;
  these: string;
}

/** Fachliche Prüfung eines Daytrading-Wunschs; Fehlertext oder null. */
export function daytradingFehler(d: DaytradingWunsch): string | null {
  if (d.markt === 'krypto' && !d.symbol) return 'Krypto braucht ein Kürzel (symbol, z. B. BTC)';
  if (d.markt !== 'krypto' && !d.isin) return 'Aktien brauchen die ISIN (gettex-Kurse)';
  if (d.setup === 'level' && !(d.level && d.level > 0)) return 'Level-Setup braucht einen Level-Kurs in Euro';
  if (d.markt === 'krypto' && d.richtung !== 'long') return 'Krypto nur long (kein Krypto-Turbo)';
  return null;
}

export interface TagesPrognose {
  name: string;
  ticker: string;
  markt: 'us' | 'eu' | 'krypto';
  richtung: 'hoch' | 'runter';
  chance?: number;
  grund?: string;
}

export interface RisikoBudget {
  maxSpekulativJeLauf: number;
  maxAnteilSpekulativ: number;
  stopMinProzent: number;
  mindestKursEuro: number;
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
  if (k === 'krypto') {
    if (p.wertpapier.kursbasis?.markt !== 'krypto') return 'Krypto direkt braucht kursbasis {markt: "krypto", symbol: "BTC", waehrung: "EUR"}';
    if (p.wertpapier.handelsplatz !== 'TRK') return 'Krypto direkt wird über Trade Republic gehandelt (handelsplatz "TRK")';
  } else if (!p.wertpapier.isin) return 'ISIN fehlt (nur Krypto direkt kommt ohne ISIN aus)';
  if (p.wertpapier.handelsplatz === 'TRK' && k !== 'krypto') return 'Handelsplatz TRK nur für Krypto direkt';
  if (p.hebel) {
    const h = p.hebel;
    if (h.richtung === 'long' && h.koSchwelle < h.basispreis) return 'Long-Knock-out: KO-Schwelle unter Basispreis ist unplausibel';
    if (h.richtung === 'short' && h.koSchwelle > h.basispreis) return 'Short-Knock-out: KO-Schwelle über Basispreis ist unplausibel';
    if (hebelMax <= 0) return 'Hebelprodukte sind ausgeschaltet';
  }
  if (p.hebelWunsch) {
    if (p.hebel || p.etn) return 'Wunsch-Hebel nur ohne eigene Hebel-/ETN-Angaben (der Code bildet den Turbo nach)';
    if (k !== 'aktie' && k !== 'etf') return 'Wunsch-Hebel nur für Aktien und ETFs';
    if (!(p.hebelWunsch.hebel >= 2) || p.hebelWunsch.hebel > hebelMax) return `Wunsch-Hebel muss zwischen 2 und ${hebelMax} liegen`;
  }
  if (p.pflichtOrder && p.konfidenz > 50) return 'Pflicht-Order mit Konfidenz über 50 ist widersprüchlich';
  if (p.zielNettoProzent <= 0 || p.stopProzent >= 0) return 'Ziel muss positiv, Stop negativ sein';
  return null;
}

export function entscheidungUebernehmen(
  e: Entscheidung,
  orders: Order[],
  jetzt: Date,
  cfg: {
    haltedauerMinMinuten: number;
    haltedauerMaxTage: number;
    hebelMax: number;
    risikoBudget?: RisikoBudget;
    /** Mindest-Chance in % für jeden Kauf (Plan Datenkrake: 40); fehlt → keine Prüfung (alte Aufrufe) */
    mindestChance?: number;
    /** bisherige Treffsicherheit je Konfidenz-Stufe → Chancen-Korrektur */
    kalibrierung?: KalibrierStufe[];
    /** Berichte, die vor diesem Zeitpunkt geschrieben wurden, dürfen einmal ersetzt werden (Gebührenmodell geändert) */
    berichteNeuVor?: string;
    /** Höchstzahl neuer Orders je Lauf-Typ (S2: morgens 6, mittags 3, abends 3) */
    claudeOrders?: Partial<Record<Entscheidung['typ'], number>>;
  },
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

  // Risiko-Budget für spekulative Orders: höchstens n je Lauf und höchstens ein Anteil aller aktiven Positionen
  const rb = cfg.risikoBudget;
  const aktive = orders.filter((o) => o.status === 'offen' || o.status === 'vorgemerkt');
  let spekAktiv = aktive.filter((o) => o.plan.risikoklasse === 'spekulativ').length;
  let gesamtAktiv = aktive.length;
  let spekNeu = 0;

  const maxOrders = cfg.claudeOrders?.[e.typ];
  let angenommen = 0;
  for (const original of e.orders ?? []) {
    let plan: OrderPlan = { ...original, herkunft: 'claude' };
    if (maxOrders !== undefined && angenommen >= maxOrders) {
      hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: höchstens ${maxOrders} neue Orders im ${e.typ}`);
      continue;
    }
    const fehler = planFehler(plan, cfg.hebelMax);
    if (fehler) {
      hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: ${fehler}`);
      continue;
    }
    // Kaufregel: Chance (mit der Wirklichkeit verrechnet) ≥ Mindest-Chance und positiver Erwartungswert nach Gebühren
    if (cfg.mindestChance !== undefined) {
      const k = korrigierteChance(plan.konfidenz, cfg.kalibrierung);
      if (!(plan.erwarteteRenditeNetto > 0)) {
        hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: kein positiver Erwartungswert nach Gebühren (${plan.erwarteteRenditeNetto} %)`);
        continue;
      }
      if (k.chance < cfg.mindestChance) {
        hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: Chance ${k.chance} % unter ${cfg.mindestChance} %${k.chance !== plan.konfidenz ? ` (Claude schätzte ${plan.konfidenz} %, korrigiert nach ${k.faelle} Fällen)` : ''}`);
        continue;
      }
      if (k.chance !== plan.konfidenz) plan = { ...plan, chanceKorrigiert: k.chance };
    }
    // Hebel ist immer spekulativ (Risiko-Budget, Stop-Grenze, eigene Auswertung)
    if (plan.hebelWunsch && plan.risikoklasse !== 'spekulativ') plan = { ...plan, risikoklasse: 'spekulativ' };
    if (plan.risikoklasse === 'spekulativ' && rb) {
      const erlaubt = Math.max(1, Math.floor(rb.maxAnteilSpekulativ * (gesamtAktiv + 1)));
      if (spekNeu >= rb.maxSpekulativJeLauf || spekAktiv + 1 > erlaubt) {
        hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: Risiko-Budget für spekulative Orders ausgeschöpft`);
        continue;
      }
      if (plan.stopProzent < rb.stopMinProzent) {
        hinweise.push(`Order ${plan.wertpapier.name} abgelehnt: Stop ${plan.stopProzent} % weiter als erlaubt (${rb.stopMinProzent} %)`);
        continue;
      }
      // realistische Kosten: spekulative Werte haben breite Spreads
      plan = { ...plan, wertpapier: { ...plan.wertpapier, spreadKlasse: 'spekulativ' } };
      spekNeu++;
      spekAktiv++;
    }
    gesamtAktiv++;
    angenommen++;
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
    const ersetzbar = !!b.ersetzt && !!cfg.berichteNeuVor && !!o.berichtZeit && o.berichtZeit < cfg.berichteNeuVor;
    if (o.bericht && !ersetzbar) {
      hinweise.push(`Bericht für ${b.orderId} ignoriert: existiert bereits`);
      continue;
    }
    const text = `${b.text.trim()}\n\nLearnings:\n${b.learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}`;
    ereignisse.push(ev('bericht', o.id, { text, learnings: b.learnings, ...(typeof b.einwandEingetreten === 'boolean' ? { einwandEingetreten: b.einwandEingetreten } : {}) }));
  }

  if (e.briefing?.length) ereignisse.push(ev('briefing', undefined, { punkte: e.briefing }));
  ereignisse.push(ev('lauf', undefined, { typ: e.typ, datum: e.datum, erstellt: e.erstellt, orders: (e.orders ?? []).length, notiz: e.notiz ?? '' }));
  if (e.prognose?.length && e.typ !== 'morgenlauf') hinweise.push('Tagesprognose nur im Morgenlauf – ignoriert');
  return { ereignisse, hinweise };
}
