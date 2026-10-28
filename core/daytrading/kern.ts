// Daytrading-Kern (Plan Datenkrake S3): Regeln des Daytrader-Skills (Jakeschincariol/day-trader-skill, MIT) nach
// TypeScript portiert – Eröffnungsspanne (ORB), Level-Ausbruch, Stop an der Spannen-Mitte, Ziel 2R, flat vor Schluss.
// Rein funktional, ohne Netz. Grundsatz: nur geschlossene 5-Minuten-Kerzen zählen; Einstieg zum ersten Kurs NACH
// der Auslöser-Kerze (Eröffnung der nächsten Kerze), Ausstieg Kerze für Kerze (Stop vor Ziel, wie im Skill).
import { orderentgelt, type GebuehrenConfig } from '../gebuehren.ts';
import { runde } from '../geld.ts';

// ---------- Typen ----------

export type DtMarkt = 'us' | 'eu' | 'krypto';
export type DtHerkunft = 'code_scan' | 'claude' | 'autopilot';
export type DtSetup = 'orb' | 'level' | 'signal';
export type DtRichtung = 'long' | 'short';
export type DtInstrument = 'aktie' | 'turbo' | 'krypto';
export type DtAusstiegGrund = 'ziel' | 'stop' | 'schluss' | 'knockout';

/** 5-Minuten-Kerze; t = Beginn (ISO, UTC), v = Stück, n = Anzahl Geschäfte */
export interface Kerze {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  n: number;
}

export interface Sitzung {
  eroeffnung: Date;
  spannenEnde: Date;
  keineEinstiegeNach: Date;
  flatBis: Date;
}

export interface MarktConfig {
  aktiv: boolean;
  zeitzone: string;
  eroeffnung: string;
  keineEinstiegeNach: string;
  flatBis: string;
}

export interface Turbo {
  richtung: DtRichtung;
  hebel: number;
  /** Basispreis = Knock-out-Schwelle (Turbo), in der Währung der Kerzen (EUR) */
  basispreis: number;
  bezugsverhaeltnis: number;
  emittent: string;
}

export interface DtTrade {
  id: string;
  datum: string;
  herkunft: DtHerkunft;
  markt: DtMarkt;
  setup: DtSetup;
  richtung: DtRichtung;
  instrument: DtInstrument;
  name: string;
  /** gettex-ISIN des Basiswerts (Aktien) */
  isin?: string;
  /** Kürzel (Krypto, US-Ticker) */
  symbol?: string;
  turbo?: Turbo;
  /** Penny Stock/Small Cap unter dem Skill-Filter (≥ 5 $, viel Umsatz) → getrennt ausgewertet */
  spekulativ: boolean;
  ausloeser: { zeit: string; kurs: number; level: number; spanne?: { hoch: number; tief: number } };
  /** Stop und Ziel am Basiswert (EUR), Risiko = Abstand Einstieg–Stop */
  stop: number;
  ziel: number;
  zielR: number;
  flatBis: string;
  einstieg: { zeit: string; basisKurs: number; kurs: number; stueck: number; kurswert: number };
  /** Claudes Chance (Watchlist) bzw. Trefferquote des bewiesenen Signals (Autopilot) */
  chance?: number;
  these?: string;
  timeMachine?: ZeitmaschinenErgebnis;
  ausstieg?: { zeit: string; basisKurs: number; kurs: number; kurswert: number; grund: DtAusstiegGrund };
  ergebnis?: DtErgebnis;
}

export interface ZeitmaschinenErgebnis {
  /** Monte-Carlo-Wahrscheinlichkeiten in % */
  zielZuerst: number;
  stopZuerst: number;
  keins: number;
  gruen: number;
  /** Gewinnschwelle 1/(1+R) in % der Fälle, die eine Seite erreichen */
  schwelle: number;
  urteil: string;
  wiederholungen: number;
  seed: number;
  sitzungen: number;
  /** dieselbe Regel auf den vergangenen Sitzungen (echte Historie) */
  historie?: { faelle: number; ziel: number; stop: number; oeR: number };
}

export interface DtErgebnis {
  /** vor Gebühren (nach Spread) */
  brutto: number;
  bruttoProzent: number;
  /** nach Gebühren im Hauptmodell (Smartbroker+, Krypto Trade Republic) */
  netto: number;
  nettoProzent: number;
  nettoTR: number;
  gebuehren: { haupt: number; tr: number };
  /** Ergebnis in R (Vielfache des Risikos) am Basiswert */
  r: number;
}

export type DtEreignis =
  | { id: string; typ: 'einstieg'; zeit: string; trade: DtTrade }
  | { id: string; typ: 'ausstieg'; zeit: string; tradeId: string; ausstieg: NonNullable<DtTrade['ausstieg']>; ergebnis: DtErgebnis };

// ---------- Zeit ----------

function versatzMin(d: Date, tz: string): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - d.getTime()) / 60000;
}

/** Ortszeit (Datum + HH:MM in Zeitzone tz) → UTC-Zeitpunkt (Sommer-/Winterzeit je Zone, z. B. New York ≠ Berlin). */
export function ortszeitZuUtc(datum: string, hhmm: string, tz: string): Date {
  const [j, m, t] = datum.split('-').map(Number);
  const [h, min] = hhmm.split(':').map(Number);
  const roh = Date.UTC(j, m - 1, t, h, min);
  let utc = roh - versatzMin(new Date(roh), tz) * 60000;
  const v2 = versatzMin(new Date(utc), tz);
  utc = roh - v2 * 60000;
  return new Date(utc);
}

export function sitzung(datum: string, m: MarktConfig, spanneMinuten: number): Sitzung {
  const eroeffnung = ortszeitZuUtc(datum, m.eroeffnung, m.zeitzone);
  return {
    eroeffnung,
    spannenEnde: new Date(eroeffnung.getTime() + spanneMinuten * 60000),
    keineEinstiegeNach: ortszeitZuUtc(datum, m.keineEinstiegeNach, m.zeitzone),
    flatBis: ortszeitZuUtc(datum, m.flatBis, m.zeitzone),
  };
}

// ---------- Kerzen ----------

export interface Geschaeft {
  isin: string;
  zeit: string;
  kurs: number;
  stueck: number;
}

/** Geschäfte → 5-Minuten-Kerzen je ISIN (zeitlich sortiert). */
export function kerzenAusGeschaeften(geschaefte: Geschaeft[], minuten = 5): Map<string, Kerze[]> {
  const ms = minuten * 60000;
  const je = new Map<string, Map<number, { k: Kerze; erste: string; letzte: string }>>();
  for (const g of geschaefte) {
    const t = Date.parse(g.zeit);
    if (!(g.kurs > 0) || Number.isNaN(t)) continue;
    const start = Math.floor(t / ms) * ms;
    if (!je.has(g.isin)) je.set(g.isin, new Map());
    const m = je.get(g.isin)!;
    const x = m.get(start);
    if (!x) {
      m.set(start, { k: { t: new Date(start).toISOString(), o: g.kurs, h: g.kurs, l: g.kurs, c: g.kurs, v: g.stueck, n: 1 }, erste: g.zeit, letzte: g.zeit });
      continue;
    }
    const k = x.k;
    if (g.zeit < x.erste) {
      x.erste = g.zeit;
      k.o = g.kurs;
    }
    if (g.zeit >= x.letzte) {
      x.letzte = g.zeit;
      k.c = g.kurs;
    }
    k.h = Math.max(k.h, g.kurs);
    k.l = Math.min(k.l, g.kurs);
    k.v += g.stueck;
    k.n++;
  }
  const out = new Map<string, Kerze[]>();
  for (const [isin, m] of je) out.set(isin, [...m.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x.k));
  return out;
}

/** Kraken OHLC ([zeit s, o, h, l, c, vwap, volumen, anzahl]) → geschlossene Kerzen (die laufende wird verworfen). */
export function krakenKerzen(zeilen: (string | number)[][], jetzt: Date, minuten = 5): Kerze[] {
  return zeilen
    .map((z) => ({ t: new Date(Number(z[0]) * 1000).toISOString(), o: +z[1], h: +z[2], l: +z[3], c: +z[4], v: +z[6], n: +z[7] }))
    .filter((k) => Date.parse(k.t) + minuten * 60000 <= jetzt.getTime() && k.c > 0);
}

export const kerzenEnde = (k: Kerze, minuten = 5) => new Date(Date.parse(k.t) + minuten * 60000);

// ---------- Setup: Eröffnungsspanne / Level ----------

export interface SetupZustand {
  setup: DtSetup;
  /** erlaubte Richtungen */
  richtungen: DtRichtung[];
  status: 'spanne' | 'wartet' | 'ausgeloest' | 'fertig';
  spanne?: { hoch: number; tief: number; volumen: number; kerzen: number };
  /** Level-Setup: Ausbruch über `level` (long) bzw. unter `levelTief` (short) */
  level?: number;
  levelTief?: number;
  ausloeser?: { zeit: string; kurs: number; level: number; richtung: DtRichtung };
  letzteKerze?: string;
  grund?: string;
}

export interface SetupRegeln {
  /** Mindestzahl Kerzen in der Spanne (gettex hat nicht in jeder Minute Handel) */
  minSpannenKerzen: number;
  /** Volumen der Auslöser-Kerze ≥ Faktor × Ø Spannen-Kerze (0 = aus) */
  volumenFaktor: number;
}

export type SetupAktion =
  | { typ: 'ausloeser'; richtung: DtRichtung; kerze: Kerze; level: number }
  | { typ: 'einstieg'; richtung: DtRichtung; kerze: Kerze }
  | { typ: 'abgelaufen'; grund: string };

/**
 * Eine geschlossene Kerze verarbeiten (Zustandsautomat, eine Auslösung je Setup und Tag wie im Skill).
 * Auslöser: erste Kerze NACH der Spanne, die ÜBER dem Hoch (long) bzw. UNTER dem Tief (short) SCHLIESST.
 * Einstieg: Eröffnung der nächsten Kerze (erster Kurs nach dem Auslöser).
 */
export function setupSchritt(z: SetupZustand, k: Kerze, s: Sitzung, r: SetupRegeln): SetupAktion | null {
  if (z.letzteKerze && k.t <= z.letzteKerze) return null;
  z.letzteKerze = k.t;
  const t = Date.parse(k.t);
  const ende = kerzenEnde(k).getTime();
  if (z.status === 'fertig' || t < s.eroeffnung.getTime()) return null;

  if (z.status === 'ausgeloest') {
    z.status = 'fertig';
    if (t >= s.keineEinstiegeNach.getTime()) return { typ: 'abgelaufen', grund: 'kein Kurs vor dem Einstiegsschluss' };
    return { typ: 'einstieg', richtung: z.ausloeser!.richtung, kerze: k };
  }

  if (z.setup === 'orb' && t < s.spannenEnde.getTime()) {
    const sp = z.spanne ?? { hoch: k.h, tief: k.l, volumen: 0, kerzen: 0 };
    z.spanne = { hoch: Math.max(sp.hoch, k.h), tief: Math.min(sp.tief, k.l), volumen: sp.volumen + k.v, kerzen: sp.kerzen + 1 };
    return null;
  }
  if (z.status === 'spanne') {
    if (z.setup === 'orb' && (!z.spanne || z.spanne.kerzen < r.minSpannenKerzen)) {
      z.status = 'fertig';
      z.grund = 'zu wenig Handel in der Eröffnungsspanne';
      return { typ: 'abgelaufen', grund: z.grund };
    }
    z.status = 'wartet';
  }
  // „Keine Einstiege vor dem Ende der Spanne“ gilt auch für Level-Setups
  if (t < s.spannenEnde.getTime()) return null;
  if (ende > s.keineEinstiegeNach.getTime()) {
    z.status = 'fertig';
    z.grund = 'Einstiegsfenster vorbei';
    return { typ: 'abgelaufen', grund: z.grund };
  }
  const hoch = z.setup === 'orb' ? z.spanne!.hoch : z.level;
  const tief = z.setup === 'orb' ? z.spanne!.tief : z.levelTief;
  const volOk = !r.volumenFaktor || z.setup !== 'orb' || k.v >= r.volumenFaktor * (z.spanne!.volumen / Math.max(1, z.spanne!.kerzen));
  let richtung: DtRichtung | null = null;
  let level = 0;
  if (z.richtungen.includes('long') && hoch !== undefined && k.c > hoch && volOk) [richtung, level] = ['long', hoch];
  else if (z.richtungen.includes('short') && tief !== undefined && k.c < tief && volOk) [richtung, level] = ['short', tief];
  if (!richtung) return null;
  z.status = 'ausgeloest';
  z.ausloeser = { zeit: kerzenEnde(k).toISOString(), kurs: k.c, level, richtung };
  return { typ: 'ausloeser', richtung, kerze: k, level };
}

/** Stop (Spannen-Mitte, bei Level: Prozent-Stop) und Ziel (R × Risiko) wie trader-exit; null = Risiko zu klein/unplausibel. */
export function ausstiegsPlan(
  einstieg: number,
  richtung: DtRichtung,
  z: { spanne?: { hoch: number; tief: number } },
  e: { zielR: number; stopProzentLevel: number; minRisikoProzent: number },
): { stop: number; ziel: number; risiko: number } | null {
  const d = richtung === 'long' ? 1 : -1;
  let stop = z.spanne ? (z.spanne.hoch + z.spanne.tief) / 2 : einstieg * (1 - (d * e.stopProzentLevel) / 100);
  // Stop muss auf der Verlustseite liegen (bei weitem Einstieg über der Mitte sonst Prozent-Stop)
  if (d * (einstieg - stop) <= 0) stop = einstieg * (1 - (d * e.stopProzentLevel) / 100);
  const risiko = Math.abs(einstieg - stop);
  if (risiko < (einstieg * e.minRisikoProzent) / 100) return null;
  const st = einstieg < 10 ? 4 : 2;
  return { stop: runde(stop, st), ziel: runde(einstieg + d * e.zielR * risiko, st), risiko };
}

// ---------- Instrument, Ausführung, Gebühren ----------

/** Synthetischer Turbo (Basispreis = KO) mit gewünschtem Hebel zum Einstiegskurs; Wert = innerer Wert × BV. */
export function turboAnlegen(basisKurs: number, richtung: DtRichtung, hebel: number, emittent: string): Turbo {
  const basispreis = richtung === 'long' ? basisKurs * (1 - 1 / hebel) : basisKurs * (1 + 1 / hebel);
  const bezugsverhaeltnis = basisKurs >= 100 ? 0.1 : 1;
  return { richtung, hebel, basispreis: runde(basispreis, basisKurs < 10 ? 4 : 2), bezugsverhaeltnis, emittent };
}

export function turboWert(t: Turbo, basisKurs: number): number {
  const inner = t.richtung === 'long' ? basisKurs - t.basispreis : t.basispreis - basisKurs;
  return Math.max(0, runde(inner * t.bezugsverhaeltnis, 4));
}

/** Instrumentkurs (Mitte) aus dem Basiswert. */
export function instrumentMitte(tr: Pick<DtTrade, 'instrument' | 'turbo'>, basisKurs: number): number {
  return tr.instrument === 'turbo' ? turboWert(tr.turbo!, basisKurs) : basisKurs;
}

export interface DtGebuehren {
  smartbroker: GebuehrenConfig;
  traderepublic: GebuehrenConfig;
  /** Krypto direkt: Trade Republic (gebuehren.json, Handelsplatz TRK) */
  krypto: GebuehrenConfig;
}

const entgelt = (kw: number, cfg: GebuehrenConfig, hp?: string) => (kw > 0 ? orderentgelt(kw, cfg, hp ? { handelsplatz: hp } : {}).gesamt : 0);

/** Stückzahl für den Ordereinsatz: ganze Stücke, Krypto in Bruchstücken. */
export function stueckFuer(instrument: DtInstrument, brief: number, betrag: number): number {
  if (!(brief > 0)) return 0;
  return instrument === 'krypto' ? Math.floor((betrag / brief) * 1e6) / 1e6 : Math.floor(betrag / brief + 1e-9);
}

export function ergebnisRechnen(tr: DtTrade, ausstieg: NonNullable<DtTrade['ausstieg']>, g: DtGebuehren): DtErgebnis {
  const kauf = tr.einstieg.kurswert;
  const verkauf = ausstieg.kurswert;
  const brutto = runde(verkauf - kauf);
  const haupt = tr.instrument === 'krypto' ? entgelt(kauf, g.krypto, 'TRK') + entgelt(verkauf, g.krypto, 'TRK') : entgelt(kauf, g.smartbroker) + entgelt(verkauf, g.smartbroker);
  const trg = entgelt(kauf, g.traderepublic) + entgelt(verkauf, g.traderepublic);
  const d = tr.richtung === 'long' ? 1 : -1;
  const risiko = Math.abs(tr.einstieg.basisKurs - tr.stop);
  return {
    brutto,
    bruttoProzent: runde((brutto / kauf) * 100, 2),
    netto: runde(brutto - haupt),
    nettoProzent: runde(((brutto - haupt) / (kauf + entgelt(kauf, tr.instrument === 'krypto' ? g.krypto : g.smartbroker, tr.instrument === 'krypto' ? 'TRK' : undefined))) * 100, 2),
    nettoTR: runde(brutto - trg),
    gebuehren: { haupt: runde(haupt), tr: runde(trg) },
    r: risiko > 0 ? runde((d * (ausstieg.basisKurs - tr.einstieg.basisKurs)) / risiko, 2) : 0,
  };
}

/**
 * Offenen Trade mit einer geschlossenen Kerze des Basiswerts prüfen: zuerst „flat bis“, dann Knock-out,
 * Stop vor Ziel (berührt eine Kerze beides, zählt der Stop – wie im Skill); Kurslücken zum Eröffnungskurs.
 */
export function tradeSchritt(tr: DtTrade, k: Kerze): { basisKurs: number; grund: DtAusstiegGrund; zeit: string } | null {
  const t = Date.parse(k.t);
  if (t < Date.parse(tr.einstieg.zeit)) return null;
  if (t >= Date.parse(tr.flatBis)) return { basisKurs: k.o, grund: 'schluss', zeit: k.t };
  const long = tr.richtung === 'long';
  const ko = tr.turbo?.basispreis;
  if (ko !== undefined && (long ? k.o <= ko : k.o >= ko)) return { basisKurs: k.o, grund: 'knockout', zeit: k.t };
  const ende = kerzenEnde(k).toISOString();
  if (long ? k.l <= tr.stop : k.h >= tr.stop) return { basisKurs: long ? Math.min(k.o, tr.stop) : Math.max(k.o, tr.stop), grund: 'stop', zeit: ende };
  if (long ? k.h >= tr.ziel : k.l <= tr.ziel) return { basisKurs: long ? Math.max(k.o, tr.ziel) : Math.min(k.o, tr.ziel), grund: 'ziel', zeit: ende };
  return null;
}

/** Ausführung des Ausstiegs zum Geldkurs (Spread) des Instruments. */
export function ausstiegAusfuehren(tr: DtTrade, s: { basisKurs: number; grund: DtAusstiegGrund; zeit: string }, spreadProzent: number): NonNullable<DtTrade['ausstieg']> {
  const mitte = s.grund === 'knockout' ? 0 : instrumentMitte(tr, s.basisKurs);
  const kurs = runde(mitte * (1 - spreadProzent / 200), mitte < 10 ? 4 : 3);
  return { zeit: s.zeit, basisKurs: s.basisKurs, kurs, kurswert: runde(kurs * tr.einstieg.stueck), grund: s.grund };
}

/** Einstieg zum Briefkurs (Spread) des Instruments; null, wenn kein Stück bezahlbar ist. */
export function einstiegAusfuehren(
  tr: Omit<DtTrade, 'einstieg'>,
  k: Kerze,
  spreadProzent: number,
  betrag: number,
): DtTrade['einstieg'] | null {
  const mitte = instrumentMitte(tr, k.o);
  if (!(mitte > 0)) return null;
  const kurs = runde(mitte * (1 + spreadProzent / 200), mitte < 10 ? 4 : 3);
  const stueck = stueckFuer(tr.instrument, kurs, betrag);
  if (!(stueck > 0) || stueck * kurs < 1) return null;
  return { zeit: k.t, basisKurs: k.o, kurs, stueck, kurswert: runde(stueck * kurs) };
}

/** Trades aus dem Daytrading-Protokoll (nur anhängen): Einstiege mit ihren Ausstiegen zusammenführen. */
export function tradesAusEreignissen(ev: DtEreignis[]): DtTrade[] {
  const m = new Map<string, DtTrade>();
  for (const e of [...ev].sort((a, b) => a.zeit.localeCompare(b.zeit) || a.id.localeCompare(b.id))) {
    if (e.typ === 'einstieg' && !m.has(e.trade.id)) m.set(e.trade.id, { ...e.trade });
    if (e.typ === 'ausstieg') {
      const t = m.get(e.tradeId);
      if (t && !t.ausstieg) {
        // ältere Ereignisse tragen noch einen gestrichenen Vergleichswert – beim Ableiten weglassen
        const { nettoConsors: _n, ...ergebnis } = e.ergebnis as DtErgebnis & { nettoConsors?: number };
        const { consors: _c, ...gebuehren } = ergebnis.gebuehren as DtErgebnis['gebuehren'] & { consors?: number };
        Object.assign(t, { ausstieg: e.ausstieg, ergebnis: { ...ergebnis, gebuehren } });
      }
    }
  }
  return [...m.values()];
}
