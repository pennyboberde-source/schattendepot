// Autopilot (Plan Datenkrake S2): Der Code kauft zwischen den Claude-Läufen selbst ins Depot – aber nur Kandidaten mit
// einem Signaltyp, der sich im Schattenbuch bewiesen hat (Mindestfallzahl, Chance nach Gebühren ≥ Mindest-Chance,
// positiver Erwartungswert nach Gebühren). Er merkt nur vor; ausgeführt wird wie immer beim nächsten Kurscheck.
import { orderentgelt, type GebuehrenConfig } from './gebuehren.ts';
import { runde } from './geld.ts';
import { berlin } from './kalender.ts';
import type { TrackingEintrag } from './statistik.ts';
import type { ZielStopVorschlag } from './zielstop.ts';
import type { Ereignis, Kursbasis, Order, OrderPlan, Strategie } from './typen.ts';

export interface AutopilotEinstellungen {
  aktiv: boolean;
  /** Mindestzahl gemessener Long-Fälle je Signaltyp und Marktgruppe */
  mindestFaelle: number;
  /** Messpunkt des Schattenbuchs, an dem gemessen wird (r1T = 1, r3T = 3, r1W = 5 Handelstage) */
  horizont: 'r1h' | 'r1T' | 'r3T' | 'r1W';
  maxJeLauf: number;
  maxJeTag: number;
  /** höchstens so viele offene/vorgemerkte Autopilot-Orders gleichzeitig */
  maxOffen: number;
  /** Ersatz, solange es keinen Ziel/Stop-Vorschlag aus dem Schattenbuch gibt */
  zielNettoProzent: number;
  stopProzent: number;
  maerkte: ('us' | 'eu' | 'krypto')[];
}

export type MarktGruppe = 'aktie' | 'krypto';

export interface SignalBeweis {
  typ: string;
  gruppe: MarktGruppe;
  /** gemessene Long-Fälle am Horizont */
  faelle: number;
  /** Anteil der Fälle, die nach Gebühren im Plus lagen, in % */
  chance: number;
  /** Ø Ergebnis nach Gebühren in % */
  oeNetto: number;
  huerde: number;
  bewiesen: boolean;
}

export interface AutopilotKandidat {
  schluessel: string;
  name: string;
  ticker?: string;
  isin?: string;
  markt?: 'us' | 'eu' | 'krypto' | 'rohstoff';
  score: number;
  typen: string[];
  quellen: string[];
  pump?: boolean;
}

const KRYPTO_KUERZEL = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'];
const HORIZONT_TAGE: Record<AutopilotEinstellungen['horizont'], number> = { r1h: 1, r1T: 1, r3T: 3, r1W: 5 };
const HORIZONT_TEXT: Record<AutopilotEinstellungen['horizont'], string> = { r1h: '1 Stunde', r1T: '1 Handelstag', r3T: '3 Handelstagen', r1W: '5 Handelstagen' };

/** Kursbasis aus einem Kürzel des Schattenbuchs (US-Ticker, .DE/.PA …, Krypto-Kürzel). */
export function kursbasisAusTicker(ticker: string, markt?: TrackingEintrag['markt']): Kursbasis | null {
  const t = ticker.toUpperCase();
  if (markt === 'rohstoff') return null;
  if (markt === 'krypto' || KRYPTO_KUERZEL.includes(t)) return /^[A-Z0-9]{2,10}$/.test(t) ? { markt: 'krypto', symbol: t, waehrung: 'EUR' } : null;
  if (/\.(DE|PA|AS|MI|MC|F)$/.test(t)) return { markt: 'eu', symbol: t, waehrung: 'EUR' };
  if (/^[A-Z][A-Z0-9-]{0,5}$/.test(t)) return { markt: 'us', symbol: t, waehrung: 'USD' };
  return null;
}

export function marktGruppe(t: { markt?: string; ticker?: string }): MarktGruppe | null {
  if (t.markt === 'rohstoff') return null;
  return t.markt === 'krypto' || KRYPTO_KUERZEL.includes((t.ticker ?? '').toUpperCase()) ? 'krypto' : 'aktie';
}

/** Kosten hin und zurück in % des Einsatzes: zwei Orderentgelte plus Spread. */
export function kostenHuerdeProzent(betrag: number, gebuehren: GebuehrenConfig, handelsplatz: string, spreadProzent: number): number {
  const e = orderentgelt(betrag, gebuehren, { handelsplatz }).gesamt * 2;
  return runde((e / betrag) * 100 + spreadProzent, 2);
}

/** Wie gut hat sich jeder Signaltyp im Schattenbuch bewährt (nur Long-Fälle, je Marktgruppe, nach Gebühren)? */
export function signalBeweise(
  tracking: TrackingEintrag[],
  e: { horizont: AutopilotEinstellungen['horizont']; mindestFaelle: number; mindestChance: number },
  huerden: Record<MarktGruppe, number>,
): SignalBeweis[] {
  const werte = new Map<string, { typ: string; gruppe: MarktGruppe; r: number[] }>();
  for (const t of tracking) {
    const r = t[e.horizont];
    if (t.art === 'prognose' || t.pump || !(t.score > 0) || typeof r !== 'number') continue;
    const gruppe = marktGruppe(t);
    if (!gruppe) continue;
    for (const typ of new Set(t.typen)) {
      const k = `${typ}|${gruppe}`;
      if (!werte.has(k)) werte.set(k, { typ, gruppe, r: [] });
      werte.get(k)!.r.push(r);
    }
  }
  const out: SignalBeweis[] = [];
  for (const { typ, gruppe, r } of werte.values()) {
    if (r.length < 3) continue;
    const h = huerden[gruppe];
    const chance = runde((r.filter((x) => x > h).length / r.length) * 100, 1);
    const oeNetto = runde(r.reduce((a, b) => a + b, 0) / r.length - h, 2);
    out.push({ typ, gruppe, faelle: r.length, chance, oeNetto, huerde: h, bewiesen: r.length >= e.mindestFaelle && chance >= e.mindestChance && oeNetto > 0 });
  }
  return out.sort((a, b) => Number(b.bewiesen) - Number(a.bewiesen) || b.oeNetto - a.oeNetto);
}

const STRATEGIE_JE_TYP: Record<string, Strategie> = {
  insider_kauf: 'insider_kauf',
  insider_cluster_kauf: 'insider_kauf',
  analysten_hochstufung: 'analysten_hochstufung',
  gewinn_ueberraschung: 'quartalszahlen_momentum',
  prognose_erhoehung: 'quartalszahlen_momentum',
  nachzahlen_drift: 'nachzahlen_drift',
  uebernahmeangebot: 'uebernahme',
  ueberreaktion: 'ueberreaktion_rebound',
  kursrakete: 'stimmungswelle',
  tagesgewinner: 'stimmungswelle',
  stimmung_social: 'stimmungswelle',
};

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

const symbolVon = (o: Order) => (o.plan.wertpapier.kursbasis?.symbol ?? o.plan.wertpapier.ticker ?? '').toUpperCase().replace(/\..*$/, '');

export interface AutopilotErgebnis {
  ereignisse: Ereignis[];
  hinweise: string[];
}

export function autopilotOrders(
  kandidaten: AutopilotKandidat[],
  beweise: SignalBeweis[],
  orders: Order[],
  jetzt: Date,
  e: AutopilotEinstellungen,
  opt: { zielStop?: ZielStopVorschlag[]; appUrl?: string } = {},
): AutopilotErgebnis {
  const hinweise: string[] = [];
  const ereignisse: Ereignis[] = [];
  if (!e.aktiv) return { ereignisse, hinweise };
  const iso = jetzt.toISOString();
  const heute = berlin(jetzt).datum;
  const auto = orders.filter((o) => o.plan.herkunft === 'autopilot');
  let heuteGekauft = auto.filter((o) => berlin(new Date(o.vorgemerktUm)).datum === heute).length;
  let offen = auto.filter((o) => o.status === 'vorgemerkt' || o.status === 'offen').length;
  const aktiv = orders.filter((o) => o.status === 'vorgemerkt' || o.status === 'offen');
  const belegt = new Set([...aktiv.map(symbolVon), ...aktiv.map((o) => o.plan.wertpapier.isin).filter(Boolean)]);
  const heuteSchluessel = new Set(auto.filter((o) => berlin(new Date(o.vorgemerktUm)).datum === heute).map((o) => o.plan.ausloeser));
  const vergeben = new Set(orders.map((o) => o.id));
  const bewiesen = beweise.filter((b) => b.bewiesen);
  if (!bewiesen.length) return { ereignisse, hinweise: ['Autopilot: noch kein Signaltyp im Schattenbuch bewiesen'] };

  for (const k of kandidaten) {
    if (ereignisse.length >= e.maxJeLauf || heuteGekauft >= e.maxJeTag || offen >= e.maxOffen) break;
    if (!(k.score > 0) || k.pump || !k.ticker) continue;
    const kb = kursbasisAusTicker(k.ticker, k.markt);
    if (!kb || !e.maerkte.includes(kb.markt)) continue;
    if (kb.markt === 'eu' && !k.isin) continue; // ohne ISIN nur Tagesschlusskurse → nicht automatisch
    const gruppe: MarktGruppe = kb.markt === 'krypto' ? 'krypto' : 'aktie';
    const beweis = bewiesen.filter((b) => b.gruppe === gruppe && k.typen.includes(b.typ)).sort((a, b) => b.oeNetto - a.oeNetto)[0];
    if (!beweis) continue;
    const symbol = kb.symbol.toUpperCase().replace(/\..*$/, '');
    if (belegt.has(symbol) || (k.isin && belegt.has(k.isin))) continue;
    const ausloeser = `Autopilot-Kandidat ${k.schluessel}: ${k.typen.join(', ')} (Score ${k.score})`.slice(0, 300);
    if (heuteSchluessel.has(ausloeser)) continue;

    const zs = opt.zielStop?.find((z) => z.typ === beweis.typ);
    const krypto = kb.markt === 'krypto';
    const tage = HORIZONT_TAGE[e.horizont];
    // Krypto handelt 24/7 (Kalendertage), Aktien grob 5 von 7 Tagen
    const termin = new Date(jetzt.getTime() + (krypto ? tage : Math.ceil((tage * 7) / 5)) * 86400000);
    const plan: OrderPlan = {
      wertpapier: {
        name: k.name.slice(0, 80),
        isin: krypto ? '' : (k.isin ?? ''),
        ticker: k.ticker,
        anlageklasse: krypto ? 'krypto' : 'aktie',
        spreadKlasse: krypto ? 'krypto' : 'aktie_neben',
        handelsplatz: krypto ? 'TRK' : 'TGT',
        steuertopf: krypto ? 'sonstige' : 'aktien',
        kursbasis: kb,
      },
      risikoklasse: 'normal',
      herkunft: 'autopilot',
      strategie: STRATEGIE_JE_TYP[beweis.typ] ?? 'sonstige',
      these: `Autopilot: Signaltyp „${beweis.typ}“ hat sich im Schattenbuch bewiesen – ${beweis.faelle} Fälle, ${beweis.chance} % nach Gebühren im Plus, Ø ${beweis.oeNetto} % nach ${HORIZONT_TEXT[e.horizont]}.`,
      ausloeser,
      signalIds: k.typen.map((t) => `${t}:${k.ticker}:${heute}`),
      quellen: k.quellen.slice(0, 10).map((name) => ({ name, link: `${opt.appUrl ?? 'https://pennyboberde-source.github.io/schattendepot/'}#/lernen` })),
      konfidenz: Math.round(beweis.chance),
      pflichtOrder: false,
      erwarteteRenditeNetto: beweis.oeNetto,
      zielNettoProzent: zs && zs.zielNettoProzent > 0 ? zs.zielNettoProzent : e.zielNettoProzent,
      stopProzent: zs ? zs.stopProzent : e.stopProzent,
      verkaufstermin: termin.toISOString(),
      risiken: ['Autopilot ohne Claude-Urteil – Claude prüft im nächsten Lauf', 'Bisherige Trefferquote garantiert nichts (kleine Stichprobe möglich)'],
      einflussLektionen: zs ? `Schattenbuch-Beweis + Ziel/Stop-Vorschlag (${zs.faelle} Fälle)` : 'Schattenbuch-Beweis (Code)',
    };
    let id = `${heute}-auto-${slug(k.name)}`;
    for (let n = 2; vergeben.has(id); n++) id = `${heute}-auto-${slug(k.name)}-${n}`;
    vergeben.add(id);
    belegt.add(symbol);
    heuteGekauft++;
    offen++;
    ereignisse.push({ id: `${iso}-vorgemerkt-${id}`, zeit: iso, typ: 'vorgemerkt', quelle: 'autopilot', orderId: id, daten: { plan, verkaufstermin: plan.verkaufstermin }, begruendung: plan.these });
    hinweise.push(`Autopilot merkt ${k.name} vor (${beweis.typ}, ${beweis.chance} % / Ø ${beweis.oeNetto} %)`);
  }
  return { ereignisse, hinweise };
}
