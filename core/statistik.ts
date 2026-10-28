// Statistik über abgeschlossene Orders und mitverfolgte Nicht-Käufe – Grundlage der Lernschleife.
import { runde } from './geld.ts';
import type { Order } from './typen.ts';
import { phaseAm, type PhasenVerlauf } from './marktphase.ts';

export interface Gruppe {
  anzahl: number;
  treffer: number;
  /** Trefferquote in % (Ergebnis nach Gebühren > 0) */
  quote: number;
  /** Ø Rendite nach Gebühren in % */
  oeNetto: number;
  /** Ø Rendite nach Steuern in % (auf den Kapitaleinsatz) */
  oeNachSteuern: number;
  summeNetto: number;
}

export interface TrackingEintrag {
  datum: string;
  schluessel: string;
  name: string;
  ticker?: string;
  score: number;
  typen: string[];
  quellen: string[];
  start?: number;
  /** Zeitpunkt des Startkurses (für die Reaktionszeit) */
  startZeit?: string;
  /** gerichtete Rendite in % (Long: Kursveränderung, Short: negativ) nach ~1 Stunde / 1 / 3 / 5 / 10 / 21 Handelstagen */
  r1h?: number;
  r1T?: number;
  r3T?: number;
  r1W?: number;
  r10T?: number;
  r1M?: number;
  markt?: 'krypto' | 'us' | 'eu' | 'rohstoff';
  /** Pump-&-Dump-Verdacht (nur Stimmung/Rakete, nichts Handfestes) */
  pump?: boolean;
  /** schnell = tagsüber aufgenommenes Ereignis-Signal (Reaktionszeit), prognose = Claudes Tagesprognose (ohne Geld), sonst Kandidat des Hauptlaufs */
  art?: 'kandidat' | 'schnell' | 'prognose';
}

export interface TrackingGruppe {
  anzahl: number;
  oe1h?: number | null;
  oe1T: number | null;
  oe3T?: number | null;
  oe1W: number | null;
  oe10T?: number | null;
  oe1M: number | null;
  /** Anteil mit gerichteter 1-Tages-Rendite > 0 in % */
  quote1T?: number | null;
  /** Anteil mit gerichteter 1-Wochen-Rendite > 0 in % */
  quote1W: number | null;
  quote3T?: number | null;
  /** Anzahl gemessener Fälle je Messpunkt */
  n1T?: number;
  n3T?: number;
  n1W?: number;
}

export interface Statistik {
  stand: string;
  gesamt: Gruppe;
  nachStrategie: Record<string, Gruppe>;
  nachSignalTyp: Record<string, Gruppe>;
  nachQuelle: Record<string, Gruppe>;
  nachAnlageklasse: Record<string, Gruppe>;
  nachRisikoklasse: Record<string, Gruppe>;
  nachVerkaufsgrund: Record<string, Gruppe>;
  /** vom Code abgeleitete Lern-Hinweise (ohne menschliches Urteil) */
  lernhinweise?: string[];
  /** wirksames, mitlernendes Risiko-Budget */
  risikoBudget?: import("./lernhinweise.ts").RisikoBudgetWirksam;
  nachHaltedauer: Record<string, Gruppe>;
  nachKonfidenz: Record<string, Gruppe>;
  kalibrierung: { stufe: string; erwartet: number; tatsaechlich: number; anzahl: number }[];
  pflicht: Gruppe;
  ueberzeugung: Gruppe;
  erwartetVsTatsaechlich: { erwartet: number; tatsaechlich: number; anzahl: number };
  etf: { depotNetto: number; etfNetto: number; anzahlMitVergleich: number };
  kandidaten: {
    gesamt: TrackingGruppe;
    nachSignalTyp: Record<string, TrackingGruppe>;
    nachQuelle: Record<string, TrackingGruppe>;
    /** Pump-Verdacht getrennt messen (Penny Stocks/Altcoins ohne handfeste Grundlage) */
    nachRisiko?: Record<string, TrackingGruppe>;
    nachMarkt?: Record<string, TrackingGruppe>;
    /** je Marktphase am Tag der Aufnahme (Aktien- bzw. Krypto-Phase) */
    nachPhase?: Record<string, TrackingGruppe>;
  };
  /** abgeschlossene Orders je Marktphase am Kauftag */
  nachPhase?: Record<string, Gruppe>;
  /** Claudes Tagesprognose (morgens bis 10 Werte, Richtung ohne Geld) – gemessen wie das Schattenbuch */
  prognose?: TrackingGruppe;
  /** Orders nach Herkunft (Claude vs. Autopilot) */
  nachHerkunft?: Record<string, Gruppe>;
  /** Gegenprüfung: Orders mit starkem (Risiko ≥ 40 %) vs. schwachem Einwand; wie oft trat der Einwand bei Verlusten ein? */
  gegenpruefung?: { stark: Gruppe; schwach: Gruppe; verlusteMitUrteil: number; einwandEingetreten: number };
  /** Autopilot: welche Signaltypen haben sich bewiesen (wird von abgeleitet.ts ergänzt) */
  autopilot?: import('./autopilot.ts').SignalBeweis[];
  /** Ziel/Stop-Vorschläge je Signaltyp aus dem Schattenbuch (wird von abgeleitet.ts ergänzt) */
  zielStop?: import('./zielstop.ts').ZielStopVorschlag[];
  /** Vorlauf-Quote je Signaltyp vor Raketen (Hot-Stuff-Rückblick), wird von abgeleitet.ts ergänzt */
  vorlauf?: { typ: string; quote: number; lift: number | null; signale: number }[];
  zusammenfassung: string;
}

const KONFIDENZ_STUFEN: [string, number, number][] = [
  ['0–39 %', 0, 39],
  ['40–59 %', 40, 59],
  ['60–79 %', 60, 79],
  ['80–100 %', 80, 100],
];

function gruppe(orders: Order[]): Gruppe {
  const n = orders.length;
  const treffer = orders.filter((o) => o.ergebnis!.netto > 0).length;
  const mittel = (f: (o: Order) => number) => (n ? runde(orders.reduce((s, o) => s + f(o), 0) / n, 2) : 0);
  return {
    anzahl: n,
    treffer,
    quote: n ? runde((treffer / n) * 100, 1) : 0,
    oeNetto: mittel((o) => o.ergebnis!.nettoProzent),
    oeNachSteuern: mittel((o) => (o.kauf ? (o.ergebnis!.nachSteuern / o.kauf.betrag) * 100 : 0)),
    summeNetto: runde(orders.reduce((s, o) => s + o.ergebnis!.netto, 0)),
  };
}

function gruppiert(orders: Order[], schluessel: (o: Order) => string[]): Record<string, Gruppe> {
  const m = new Map<string, Order[]>();
  for (const o of orders) for (const k of new Set(schluessel(o))) m.set(k, [...(m.get(k) ?? []), o]);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, l]) => [k, gruppe(l)]));
}

function haltedauer(o: Order): string {
  const tage = (new Date(o.verkauf!.zeit).getTime() - new Date(o.kauf!.zeit).getTime()) / 86400000;
  return tage < 1 ? '< 1 Tag' : tage < 3 ? '1–3 Tage' : tage < 7 ? '3–7 Tage' : '> 1 Woche';
}

/** Signal-Typ aus Signal-ID ("insider_kauf:ACME:2026-10-21" → "insider_kauf"). */
export const signalTyp = (id: string) => id.split(':')[0];

function trackingGruppe(l: TrackingEintrag[]): TrackingGruppe {
  const mittel = (f: (t: TrackingEintrag) => number | undefined) => {
    const w = l.map(f).filter((x): x is number => typeof x === 'number');
    return w.length ? runde(w.reduce((a, b) => a + b, 0) / w.length, 2) : null;
  };
  const quote = (f: (t: TrackingEintrag) => number | undefined) => {
    const w = l.map(f).filter((x): x is number => typeof x === 'number');
    return w.length ? runde((w.filter((x) => x > 0).length / w.length) * 100, 1) : null;
  };
  const n = (f: (t: TrackingEintrag) => number | undefined) => l.filter((t) => typeof f(t) === 'number').length;
  return {
    anzahl: l.length,
    n1T: n((t) => t.r1T),
    n3T: n((t) => t.r3T),
    n1W: n((t) => t.r1W),
    oe1h: mittel((t) => t.r1h),
    oe1T: mittel((t) => t.r1T),
    oe3T: mittel((t) => t.r3T),
    oe1W: mittel((t) => t.r1W),
    oe10T: mittel((t) => t.r10T),
    oe1M: mittel((t) => t.r1M),
    quote1T: quote((t) => t.r1T),
    quote3T: quote((t) => t.r3T),
    quote1W: quote((t) => t.r1W),
  };
}

function trackingGruppiert(l: TrackingEintrag[], f: (t: TrackingEintrag) => string[]): Record<string, TrackingGruppe> {
  const m = new Map<string, TrackingEintrag[]>();
  for (const t of l) for (const k of new Set(f(t))) m.set(k, [...(m.get(k) ?? []), t]);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, trackingGruppe(v)]));
}

const istKryptoMarkt = (t: TrackingEintrag) => t.markt === 'krypto' || ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'].includes(t.ticker ?? '');

export function statistikBerechnen(alle: Order[], trackingAlle: TrackingEintrag[], stand: string, phasen: PhasenVerlauf = {}): Statistik {
  // Claudes Tagesprognosen getrennt messen – sie sind keine Kandidaten des Schattenbuchs
  const tracking = trackingAlle.filter((t) => t.art !== 'prognose');
  const prognosen = trackingAlle.filter((t) => t.art === 'prognose');
  const g = alle.filter((o) => o.status === 'geschlossen' && o.ergebnis && o.kauf && o.verkauf);
  const kalibrierung = KONFIDENZ_STUFEN.map(([stufe, von, bis]) => {
    const l = g.filter((o) => o.plan.konfidenz >= von && o.plan.konfidenz <= bis);
    return { stufe, erwartet: l.length ? runde(l.reduce((s, o) => s + o.plan.konfidenz, 0) / l.length, 1) : 0, tatsaechlich: gruppe(l).quote, anzahl: l.length };
  }).filter((k) => k.anzahl > 0);
  const mitEtf = g.filter((o) => o.etfVergleich);
  const mitEinwand = g.filter((o) => o.plan.gegenpruefung);
  const verlusteMitUrteil = mitEinwand.filter((o) => o.ergebnis!.netto <= 0 && typeof o.einwandEingetreten === 'boolean');
  const s: Statistik = {
    stand,
    gesamt: gruppe(g),
    nachStrategie: gruppiert(g, (o) => [o.plan.strategie]),
    nachSignalTyp: gruppiert(g, (o) => (o.plan.signalIds.length ? o.plan.signalIds.map(signalTyp) : ['(ohne Signal)'])),
    nachQuelle: gruppiert(g, (o) => (o.plan.quellen.length ? o.plan.quellen.map((q) => q.name) : ['(ohne Quelle)'])),
    nachAnlageklasse: gruppiert(g, (o) => [o.plan.wertpapier.anlageklasse]),
    nachRisikoklasse: gruppiert(g, (o) => [o.plan.risikoklasse === 'spekulativ' ? 'spekulativ' : 'normal']),
    nachVerkaufsgrund: gruppiert(g, (o) => [o.verkauf!.grund]),
    nachHaltedauer: gruppiert(g, (o) => [haltedauer(o)]),
    nachKonfidenz: gruppiert(g, (o) => [KONFIDENZ_STUFEN.find(([, v, b]) => o.plan.konfidenz >= v && o.plan.konfidenz <= b)![0]]),
    kalibrierung,
    pflicht: gruppe(g.filter((o) => o.plan.pflichtOrder)),
    ueberzeugung: gruppe(g.filter((o) => !o.plan.pflichtOrder)),
    erwartetVsTatsaechlich: {
      erwartet: g.length ? runde(g.reduce((a, o) => a + o.plan.erwarteteRenditeNetto, 0) / g.length, 2) : 0,
      tatsaechlich: gruppe(g).oeNetto,
      anzahl: g.length,
    },
    etf: { depotNetto: runde(mitEtf.reduce((a, o) => a + o.ergebnis!.netto, 0)), etfNetto: runde(mitEtf.reduce((a, o) => a + o.etfVergleich!.netto, 0)), anzahlMitVergleich: mitEtf.length },
    kandidaten: {
      gesamt: trackingGruppe(tracking),
      nachSignalTyp: trackingGruppiert(tracking, (t) => t.typen),
      nachQuelle: trackingGruppiert(tracking, (t) => t.quellen),
      nachRisiko: trackingGruppiert(tracking, (t) => [t.pump ? 'pump_verdacht' : 'normal']),
      nachMarkt: trackingGruppiert(tracking, (t) => [t.markt ?? (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'].includes(t.ticker ?? '') ? 'krypto' : /\.(DE|PA|AS|MI|MC|F)$/.test(t.ticker ?? '') ? 'eu' : 'us')]),
      ...(Object.keys(phasen).length ? { nachPhase: trackingGruppiert(tracking, (t) => [phaseAm(phasen, t.datum, istKryptoMarkt(t) ? 'krypto' : 'aktien') ?? 'unbekannt']) } : {}),
    },
    ...(Object.keys(phasen).length
      ? { nachPhase: gruppiert(g, (o) => [phaseAm(phasen, o.kauf!.zeit.slice(0, 10), o.plan.wertpapier.anlageklasse === 'krypto' || o.plan.wertpapier.anlageklasse === 'krypto_etn' ? 'krypto' : 'aktien') ?? 'unbekannt']) }
      : {}),
    ...(prognosen.length ? { prognose: trackingGruppe(prognosen) } : {}),
    nachHerkunft: gruppiert(g, (o) => [o.plan.herkunft ?? 'claude']),
    ...(mitEinwand.length
      ? {
          gegenpruefung: {
            stark: gruppe(mitEinwand.filter((o) => o.plan.gegenpruefung!.risiko >= 40)),
            schwach: gruppe(mitEinwand.filter((o) => o.plan.gegenpruefung!.risiko < 40)),
            verlusteMitUrteil: verlusteMitUrteil.length,
            einwandEingetreten: verlusteMitUrteil.filter((o) => o.einwandEingetreten).length,
          },
        }
      : {}),
    zusammenfassung: '',
  };
  s.zusammenfassung = zusammenfassung(s);
  return s;
}

/** Kompakter Text für die Routinen (wenige hundert Zeichen statt der ganzen Statistik). */
function zusammenfassung(s: Statistik): string {
  const z: string[] = [];
  const g = s.gesamt;
  z.push(`Gesamt: ${g.anzahl} Orders, Trefferquote ${g.quote} %, Ø ${g.oeNetto} % nach Gebühren (erwartet waren Ø ${s.erwartetVsTatsaechlich.erwartet} %).`);
  if (s.pflicht.anzahl) z.push(`Pflicht-Orders: ${s.pflicht.anzahl}, Quote ${s.pflicht.quote} %, Ø ${s.pflicht.oeNetto} % · Überzeugung: ${s.ueberzeugung.anzahl}, Quote ${s.ueberzeugung.quote} %, Ø ${s.ueberzeugung.oeNetto} %.`);
  const rk = s.nachRisikoklasse;
  if (rk.spekulativ) z.push(`Spekulativ: ${rk.spekulativ.anzahl} Orders, Quote ${rk.spekulativ.quote} %, Ø ${rk.spekulativ.oeNetto} % · normal: ${rk.normal?.anzahl ?? 0} Orders, Ø ${rk.normal?.oeNetto ?? 0} %.`);
  if (s.kalibrierung.length) z.push(`Kalibrierung (Konfidenz → tatsächliche Quote): ${s.kalibrierung.map((k) => `${k.stufe}: ${k.tatsaechlich} % (n=${k.anzahl})`).join('; ')}.`);
  const beste = Object.entries(s.nachStrategie).filter(([, v]) => v.anzahl >= 3);
  if (beste.length) z.push(`Strategien (n≥3): ${beste.map(([k, v]) => `${k} ${v.quote} %/Ø ${v.oeNetto} %`).join('; ')}.`);
  const sig = Object.entries(s.kandidaten.nachSignalTyp).filter(([, v]) => (v.anzahl ?? 0) >= 5 && v.oe1W !== null);
  if (sig.length) z.push(`Mitverfolgte Kandidaten – Ø gerichtete 1-Wochen-Rendite je Signal-Typ: ${sig.map(([k, v]) => `${k} ${v.oe1W} % (n=${v.anzahl})`).join('; ')}.`);
  const au = s.nachHerkunft?.autopilot;
  if (au) z.push(`Autopilot: ${au.anzahl} Orders, Quote ${au.quote} %, Ø ${au.oeNetto} % · Claude: ${s.nachHerkunft?.claude?.anzahl ?? 0} Orders, Ø ${s.nachHerkunft?.claude?.oeNetto ?? 0} %.`);
  if (s.prognose && (s.prognose.n1T ?? 0) > 0) z.push(`Claudes Tagesprognose: ${s.prognose.quote1T} % Richtung richtig nach 1 Tag (n=${s.prognose.n1T}), Ø ${s.prognose.oe1T} %.`);
  const gp = s.gegenpruefung;
  if (gp && gp.stark.anzahl + gp.schwach.anzahl >= 3) z.push(`Gegenprüfung: starker Einwand → Quote ${gp.stark.quote} % (n=${gp.stark.anzahl}), schwacher → ${gp.schwach.quote} % (n=${gp.schwach.anzahl}); Einwand trat bei ${gp.einwandEingetreten} von ${gp.verlusteMitUrteil} Verlusten ein.`);
  if (s.etf.anzahlMitVergleich) z.push(`Vs. MSCI World (gleiche Zeiträume): Depot ${s.etf.depotNetto} € vs. ETF ${s.etf.etfNetto} €.`);
  return z.join('\n');
}

/** Kalibrierte Trefferquote für eine Konfidenz (gleiche Stufe), für den Kauf-Push. */
export function kalibrierteQuote(s: Statistik | null, konfidenz: number): { quote: number; faelle: number } | undefined {
  if (!s) return undefined;
  const stufe = KONFIDENZ_STUFEN.find(([, v, b]) => konfidenz >= v && konfidenz <= b)?.[0];
  const k = s.kalibrierung.find((x) => x.stufe === stufe);
  return k ? { quote: k.tatsaechlich, faelle: k.anzahl } : undefined;
}
