// Datenkrake: verdichtete Signal-Historie, Hot-Stuff-Rückblick („hätte man es erkennen können?“),
// Vorlauf-Trefferquote je Signaltyp, Ähnliche-Fälle-Check, Pump-&-Dump-Verdacht und Chancen-Korrektur.
// Alles reine Funktionen – die Jobs liefern nur die Daten.
import { runde } from './geld.ts';
import { wertpapierSchluessel, type Signal } from './signale.ts';
import type { TrackingEintrag } from './statistik.ts';

// ---------- Verdichtete Signal-Historie ----------
/** Ein Signal in knapper Form für die Tagesdatei signale/tag/<datum>.json. */
export interface KompaktSignal {
  id: string;
  /** Wertpapier-Schlüssel (wie in den Kandidaten) */
  s: string;
  n: string;
  t?: string;
  i?: string;
  m?: string;
  typ: string;
  r: -1 | 0 | 1;
  st: number;
  q: string[];
  z: string;
}

export function verdichten(signale: Signal[]): KompaktSignal[] {
  return signale.map((x) => ({
    id: x.id,
    s: wertpapierSchluessel(x.wertpapier),
    n: x.wertpapier.name.slice(0, 60),
    ...(x.wertpapier.ticker ? { t: x.wertpapier.ticker } : {}),
    ...(x.wertpapier.isin ? { i: x.wertpapier.isin } : {}),
    ...(x.wertpapier.markt ? { m: x.wertpapier.markt } : {}),
    typ: x.typ,
    r: x.richtung,
    st: runde(x.staerke, 2),
    q: [...new Set(x.quellen.map((q) => q.quelle))],
    z: x.zeit,
  }));
}

/** Neue Signale in die Tagesliste einfügen (gleiche ID nur einmal, stärkster Wert und alle Quellen bleiben). */
export function zusammenlegen(alt: KompaktSignal[], neu: KompaktSignal[]): KompaktSignal[] {
  const m = new Map(alt.map((x) => [x.id, x]));
  for (const x of neu) {
    const a = m.get(x.id);
    m.set(x.id, a ? { ...a, st: Math.max(a.st, x.st), q: [...new Set([...a.q, ...x.q])] } : x);
  }
  return [...m.values()];
}

// ---------- Hot Stuff ----------
/** Signaltypen, die eine extreme Kursbewegung anzeigen (die „Raketen“ des Tages). */
export const RAKETEN = new Set(['kursrakete', 'tagesgewinner', 'tagesverlierer']);

export interface HistorienTag {
  datum: string;
  signale: { s: string; typ: string; q: string[] }[];
}

export interface HotStuffEintrag {
  s: string;
  n: string;
  t?: string;
  typ: string;
  r: -1 | 0 | 1;
  /** Signale zu diesem Wert in den Tagen davor (ohne frühere Raketen) */
  vorzeichen: { typ: string; tageVorher: number; q: string[] }[];
}

const tageZwischen = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Raketen eines Tages und welche Signale ihnen in den `fenster` Kalendertagen davor vorausgingen. */
export function hotStuff(heute: KompaktSignal[], historie: HistorienTag[], datum: string, fenster = 10): { mover: HotStuffEintrag[]; abdeckung: number | null } {
  const mover = new Map<string, HotStuffEintrag>();
  for (const x of heute) {
    if (!RAKETEN.has(x.typ) || mover.has(x.s)) continue;
    mover.set(x.s, { s: x.s, n: x.n, ...(x.t ? { t: x.t } : {}), typ: x.typ, r: x.r, vorzeichen: [] });
  }
  for (const tag of historie) {
    const d = tageZwischen(tag.datum, datum);
    if (d <= 0 || d > fenster) continue;
    for (const x of tag.signale) {
      const e = mover.get(x.s);
      if (!e || RAKETEN.has(x.typ) || e.vorzeichen.some((v) => v.typ === x.typ && v.tageVorher === d)) continue;
      e.vorzeichen.push({ typ: x.typ, tageVorher: d, q: x.q });
    }
  }
  const liste = [...mover.values()].map((e) => ({ ...e, vorzeichen: e.vorzeichen.sort((a, b) => a.tageVorher - b.tageVorher) }));
  return { mover: liste, abdeckung: liste.length ? runde((liste.filter((e) => e.vorzeichen.length).length / liste.length) * 100, 1) : null };
}

export interface VorlaufStatistik {
  /** bereits ausgewertete Signal-Tage (jeder Tag genau einmal) */
  tage: string[];
  /** je Signaltyp und Quelle: wie viele Werte hatten das Signal, wie viele wurden danach zur Rakete */
  jeTyp: Record<string, { signale: number; vorRakete: number }>;
  jeQuelle: Record<string, { signale: number; vorRakete: number }>;
  /** Grundrate: Anteil aller signalisierten Werte, die danach zur Rakete wurden */
  gesamt: { signale: number; vorRakete: number };
  /** Abdeckung je Tag (Anteil der Raketen mit Vorzeichen) – zeigt, ob die Datenkrake besser wird */
  verlauf: { datum: string; mover: number; abdeckung: number | null }[];
}

export const leereVorlaufStatistik = (): VorlaufStatistik => ({ tage: [], jeTyp: {}, jeQuelle: {}, gesamt: { signale: 0, vorRakete: 0 }, verlauf: [] });

/**
 * Wertet einen gereiften Signal-Tag genau einmal aus: Welche seiner Werte wurden in den Folgetagen zur Rakete?
 * So entsteht je Signaltyp eine Vorlauf-Trefferquote, die man mit der Grundrate vergleichen kann.
 */
export function vorlaufFortschreiben(stat: VorlaufStatistik, signalTag: HistorienTag, raketenDanach: Set<string>): VorlaufStatistik {
  if (stat.tage.includes(signalTag.datum)) return stat;
  const neu: VorlaufStatistik = { ...stat, tage: [...stat.tage, signalTag.datum].slice(-400), jeTyp: { ...stat.jeTyp }, jeQuelle: { ...stat.jeQuelle }, gesamt: { ...stat.gesamt } };
  const add = (r: Record<string, { signale: number; vorRakete: number }>, k: string, treffer: boolean) => {
    const v = r[k] ?? { signale: 0, vorRakete: 0 };
    r[k] = { signale: v.signale + 1, vorRakete: v.vorRakete + (treffer ? 1 : 0) };
  };
  const werte = new Set<string>();
  const gesehen = new Set<string>();
  for (const x of signalTag.signale) {
    if (RAKETEN.has(x.typ)) continue;
    const treffer = raketenDanach.has(x.s);
    if (!gesehen.has(`${x.s}|${x.typ}`)) {
      gesehen.add(`${x.s}|${x.typ}`);
      add(neu.jeTyp, x.typ, treffer);
      for (const q of new Set(x.q)) if (!gesehen.has(`${x.s}|q:${q}`)) (gesehen.add(`${x.s}|q:${q}`), add(neu.jeQuelle, q, treffer));
    }
    if (!werte.has(x.s)) {
      werte.add(x.s);
      neu.gesamt = { signale: neu.gesamt.signale + 1, vorRakete: neu.gesamt.vorRakete + (treffer ? 1 : 0) };
    }
  }
  return neu;
}

/** Lift = Vorlauf-Quote des Typs geteilt durch die Grundrate (> 1 = Signal kündigt Raketen besser an als Zufall). */
export function vorlaufLift(stat: VorlaufStatistik, minSignale = 10): { typ: string; quote: number; lift: number | null; signale: number }[] {
  const basis = stat.gesamt.signale ? stat.gesamt.vorRakete / stat.gesamt.signale : 0;
  return Object.entries(stat.jeTyp)
    .filter(([, v]) => v.signale >= minSignale)
    .map(([typ, v]) => {
      const quote = v.vorRakete / v.signale;
      return { typ, quote: runde(quote * 100, 1), lift: basis > 0 ? runde(quote / basis, 2) : null, signale: v.signale };
    })
    .sort((a, b) => (b.lift ?? 0) - (a.lift ?? 0));
}

// ---------- Ähnliche Fälle ----------
const ALLGEMEIN = new Set(['nachricht']);

/** „In n ähnlichen Fällen x Gewinne, Ø y %“ – aus dem Schattenbuch, gleiche Richtung, gemeinsame Signaltypen. */
export function aehnlicheFaelle(
  typen: string[],
  richtung: -1 | 1,
  tracking: TrackingEintrag[],
  feld: 'r1T' | 'r3T' | 'r1W' | 'r10T' = 'r1W',
  minFaelle = 3,
): { anzahl: number; treffer: number; quote: number; oe: number; feld: string } | null {
  const eigene = typen.filter((t) => !ALLGEMEIN.has(t));
  if (!eigene.length) return null;
  const noetig = Math.min(2, eigene.length);
  const passend = tracking.filter((t) => typeof t[feld] === 'number' && Math.sign(t.score) === richtung && t.typen.filter((x) => eigene.includes(x)).length >= noetig);
  if (passend.length < minFaelle) return null;
  const w = passend.map((t) => t[feld] as number);
  const treffer = w.filter((x) => x > 0).length;
  return { anzahl: w.length, treffer, quote: runde((treffer / w.length) * 100, 1), oe: runde(w.reduce((a, b) => a + b, 0) / w.length, 2), feld };
}

export function aehnlichText(a: ReturnType<typeof aehnlicheFaelle>): string {
  if (!a) return '';
  const zeitraum = { r1T: '1 Tag', r3T: '3 Tagen', r1W: '1 Woche', r10T: '10 Tagen' }[a.feld] ?? a.feld;
  return `In ${a.anzahl} ähnlichen Fällen ${a.treffer} im Plus, Ø ${a.oe > 0 ? '+' : ''}${a.oe.toLocaleString('de-DE')} % nach ${zeitraum}`;
}

// ---------- Pump-&-Dump-Verdacht ----------
/** Typen mit harter Grundlage (Pflichtmeldung, Zahlen, Insider, Analysten …). */
const FAKT = /^(insider_|gewinn_|prognose_|analysten_|leerverkauf_)|^(grossauftrag|uebernahmeangebot|aktienrueckkauf|quartalstermin|nachzahlen_drift|krypto_einnahmen|shortreport|cot_extrem)$/;
const HYPE = new Set(['stimmung_social', 'kursrakete', 'tagesgewinner', 'upbit_warnung', 'neulistung', 'handelsstopp', 'app_ranking', 'volumen_ungewoehnlich']);

/**
 * Typisches Werbe-Muster bei Penny Stocks und Altcoins: nur Stimmung, Rakete oder Volumen, aber nichts Handfestes.
 * Verstärkt durch Upbit-Hinweis „auf wenige Konten konzentriert“ oder einen Kurs unter 1.
 */
export function pumpVerdacht(typen: string[], opt: { fakten?: string[]; kurs?: number } = {}): boolean {
  if (!typen.length || typen.some((t) => FAKT.test(t))) return false;
  const hype = typen.filter((t) => HYPE.has(t)).length;
  const konzentriert = (opt.fakten ?? []).some((f) => /wenige Konten/i.test(f));
  const billig = typeof opt.kurs === 'number' && opt.kurs > 0 && opt.kurs < 1;
  return konzentriert || hype >= 2 || (hype >= 1 && billig);
}

// ---------- Chancen-Korrektur ----------
export interface KalibrierStufe {
  stufe: string;
  erwartet: number;
  tatsaechlich: number;
  anzahl: number;
}

const STUFEN: [string, number, number][] = [
  ['0–39 %', 0, 39],
  ['40–59 %', 40, 59],
  ['60–79 %', 60, 79],
  ['80–100 %', 80, 100],
];

/**
 * Geschätzte Chance mit der bisherigen Wirklichkeit verrechnen: je mehr abgeschlossene Fälle in derselben Stufe,
 * desto stärker zählt die tatsächliche Trefferquote (Vorwissen = 10 Fälle zum geschätzten Wert).
 */
export function korrigierteChance(konfidenz: number, kalibrierung: KalibrierStufe[] = [], vorwissen = 10): { chance: number; faelle: number } {
  const stufe = STUFEN.find(([, v, b]) => konfidenz >= v && konfidenz <= b)?.[0];
  const k = kalibrierung.find((x) => x.stufe === stufe);
  if (!k || k.anzahl < 3) return { chance: konfidenz, faelle: k?.anzahl ?? 0 };
  return { chance: runde((konfidenz * vorwissen + k.tatsaechlich * k.anzahl) / (vorwissen + k.anzahl), 1), faelle: k.anzahl };
}
