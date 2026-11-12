// Schattenbuch-Schritt (Plan Volltreffer V0, „entstopfen“): reine Ablauflogik ohne Datei- und Netzzugriff, getestet.
// Reihenfolge je Lauf: (1) neue Tageskandidaten aufnehmen – Startkurs aus einem EIGENEN Kontingent, vor allen
// Nachmessungen · (2) heutige Einträge ohne Startkurs am selben Tag nachholen, nie später · (3) schnelle
// Ereignis-Signale · (4) Reaktion nach ~1 Stunde, nur wenn der Markt des Werts bei Start und Messung offen war ·
// (5) fällige Messungen, pünktliche zuerst und nur im Fenster ihres Messpunkts (keine verspäteten Werte unter
// falschem Etikett).
import { kursbasisAusTicker } from './autopilot.ts';
import { pumpVerdacht, type KompaktSignal } from './datenkrake.ts';
import { runde } from './geld.ts';
import { berlin, handelstageZwischen, marktOffen } from './kalender.ts';
import type { TrackingEintrag } from './statistik.ts';
import type { Kursbasis } from './typen.ts';

export interface SchattenbuchConfig {
  kandidatenProTag: number;
  /** Kontingent für Nachmessungen je Lauf */
  maxAbrufeProLauf: number;
  /** eigenes Kontingent für Startkurse je Lauf (Standard: Kandidaten je Tag + 20) */
  maxStartAbrufeProLauf?: number;
  /** so oft wird ein fehlender Startkurs am selben Tag höchstens versucht (Standard 3) */
  maxStartVersuche?: number;
  nyseFeiertage?: string[];
}

export interface TagesKandidat {
  schluessel: string;
  name: string;
  ticker?: string;
  markt?: TrackingEintrag['markt'];
  pump?: boolean;
  score: number;
  typen: string[];
  quellen: string[];
}

export interface SchrittOptionen {
  /** haupt: Tageskandidaten aufnehmen; stuendlich: nachholen, messen, schnelle Signale */
  modus: 'haupt' | 'stuendlich';
  /** Rangliste des Tages (mehr als kandidatenProTag, damit Werte ohne Kurs ersetzt werden können) */
  kandidaten?: TagesKandidat[];
  /** frische Signale dieses Laufs (für die schnelle Aufnahme tagsüber) */
  schnelle?: KompaktSignal[];
}

export interface SchrittErgebnis {
  startAbrufe: number;
  messAbrufe: number;
  /** neu aufgenommene Tageskandidaten */
  aufgenommen: number;
  /** Kürzel ohne abrufbaren Kurs, die durch Nachrücker ersetzt wurden */
  ohneKurs: string[];
  /** Kursquelle gestört: Kandidaten ohne Startkurs aufgenommen, Nachholen in den Stundenläufen */
  ausfall: boolean;
  /** heutige Einträge, deren Startkurs in diesem Lauf nachgeholt wurde */
  nachgeholt: number;
  /** eingetragene Messwerte (ohne Startkurse) */
  gemessen: number;
  /** heutige Tageskandidaten gesamt / davon mit Startkurs */
  heuteKandidaten: number;
  heuteMitStart: number;
}

/** Signaltypen, deren Wirkung schnell eintritt – tagsüber sofort ins Schattenbuch (Reaktionszeit messen). */
export const SCHNELLE_TYPEN = new Set(['kursrakete', 'handelsstopp', 'shortreport', 'neulistung', 'uebernahmeangebot', 'prognose_erhoehung', 'prognose_senkung', 'upbit_warnung', 'gewinn_ueberraschung', 'gewinn_enttaeuschung']);

/** Messpunkt, fällig ab so vielen Handelstagen, messbar bis (ausschließlich) – danach bleibt er leer statt falsch. */
export const MESSPUNKTE: ['r1T' | 'r3T' | 'r1W' | 'r10T' | 'r1M', number, number][] = [
  ['r1T', 1, 3],
  ['r3T', 3, 5],
  ['r1W', 5, 10],
  ['r10T', 10, 21],
  ['r1M', 21, 27],
];

const AUSFALL_AB_VERSUCHEN = 8;
const MAX_SCHNELLE_JE_LAUF = 8;
const istKandidat = (t: TrackingEintrag) => (t.art ?? 'kandidat') === 'kandidat';

/**
 * Alte 1-Stunden-Messung, deren Startkurs bei geschlossenem Markt gezogen wurde (meist exakt 0 oder nur die Kurslücke):
 * zählt nicht mehr. Der Wert bleibt als `r1hGeschlossen` im Eintrag erhalten.
 */
export function r1hBereinigen(t: TrackingEintrag, nyseFeiertage?: string[]): boolean {
  if (typeof t.r1h !== 'number' || !t.startZeit || !t.ticker) return false;
  const kb = kursbasisAusTicker(t.ticker, t.markt);
  if (!kb || marktOffen(kb.markt, new Date(t.startZeit), { nyseFeiertage })) return false;
  t.r1hGeschlossen = t.r1h;
  delete t.r1h;
  return true;
}

/**
 * Ein Lauf des Schattenbuchs. `holen` liefert den Kurs zu einer Kursbasis (oder null). Die Liste wird verändert.
 */
export async function schattenbuchSchritt(
  liste: TrackingEintrag[],
  jetzt: Date,
  cfg: SchattenbuchConfig,
  opt: SchrittOptionen,
  holen: (kb: Kursbasis) => Promise<number | null>,
): Promise<SchrittErgebnis> {
  const heute = berlin(jetzt).datum;
  const iso = jetzt.toISOString();
  const offenOpt = { nyseFeiertage: cfg.nyseFeiertage };
  const grenze = { start: cfg.maxStartAbrufeProLauf ?? cfg.kandidatenProTag + 20, messung: cfg.maxAbrufeProLauf };
  const zaehler = { start: 0, messung: 0 };
  const cache = new Map<string, number | null>();
  /** Zahl = Kurs · null = abgerufen, aber kein Kurs · undefined = Kontingent dieses Laufs erschöpft oder kein abrufbares Kürzel */
  const kurs = async (ticker: string, markt: TrackingEintrag['markt'], topf: 'start' | 'messung'): Promise<number | null | undefined> => {
    const kb = kursbasisAusTicker(ticker, markt);
    if (!kb) return undefined;
    const key = `${kb.markt}:${kb.symbol}`;
    if (cache.has(key)) return cache.get(key)!;
    if (zaehler[topf] >= grenze[topf]) return undefined;
    zaehler[topf]++;
    const w = await holen(kb).catch(() => null);
    const wert = typeof w === 'number' && w > 0 ? w : null;
    cache.set(key, wert);
    return wert;
  };
  const gerichtet = (t: TrackingEintrag, w: number) => runde((w / t.start! - 1) * 100 * (t.score < 0 ? -1 : 1), 2);
  const erg: SchrittErgebnis = { startAbrufe: 0, messAbrufe: 0, aufgenommen: 0, ohneKurs: [], ausfall: false, nachgeholt: 0, gemessen: 0, heuteKandidaten: 0, heuteMitStart: 0 };
  const neuInDiesemLauf = new Set<TrackingEintrag>();

  // 1. Hauptlauf: Tageskandidaten aufnehmen (einmal je Tag). Startkurs sofort; Werte ohne abrufbaren Kurs werden
  //    durch den nächsten der Rangliste ersetzt (Nachrücker). Liefert die Kursquelle gar nichts, gilt sie als
  //    gestört: dann kommen die Kandidaten ohne Startkurs ins Buch und werden in den Stundenläufen nachgeholt.
  if (opt.modus === 'haupt' && !liste.some((t) => t.datum === heute && istKandidat(t))) {
    const pool = (opt.kandidaten ?? []).filter((k) => k.ticker && kursbasisAusTicker(k.ticker, k.markt));
    const ergebnis = new Map<TagesKandidat, number | null | undefined>();
    let brauchbar = 0;
    let versuche = 0;
    let erfolge = 0;
    for (const k of pool) {
      if (brauchbar >= cfg.kandidatenProTag) break;
      const w = await kurs(k.ticker!, k.markt, 'start');
      ergebnis.set(k, w);
      if (w !== undefined) versuche++;
      if (typeof w === 'number') erfolge++;
      if (w !== null) brauchbar++;
    }
    erg.ausfall = versuche >= AUSFALL_AB_VERSUCHEN && erfolge < versuche / 4;
    for (const k of pool) {
      if (erg.aufgenommen >= cfg.kandidatenProTag) break;
      if (!erg.ausfall && !ergebnis.has(k)) break;
      const w = ergebnis.get(k);
      if (w === null && !erg.ausfall) {
        erg.ohneKurs.push(k.ticker!);
        continue;
      }
      const start = typeof w === 'number' ? w : undefined;
      const t: TrackingEintrag = {
        datum: heute, schluessel: k.schluessel, name: k.name, ticker: k.ticker, score: k.score, typen: k.typen, quellen: k.quellen,
        ...(k.markt ? { markt: k.markt } : {}),
        ...(k.pump || (start && pumpVerdacht(k.typen, { kurs: start })) ? { pump: true } : {}),
        art: 'kandidat',
        ...(start ? { start, startZeit: iso } : {}),
        ...(w === null ? { startVersuche: 1 } : {}),
      };
      liste.push(t);
      neuInDiesemLauf.add(t);
      erg.aufgenommen++;
    }
  }

  // 2. Heutige Einträge ohne Startkurs nachholen (Claudes Tagesprognosen zuerst, dann Kandidaten) – nur am selben Tag
  const maxVersuche = cfg.maxStartVersuche ?? 3;
  const ohneStart = liste.filter((t) => t.datum === heute && !t.start && t.ticker && !t.unplausibel && !neuInDiesemLauf.has(t) && (t.startVersuche ?? 0) < maxVersuche && (t.art === 'prognose' || istKandidat(t)));
  for (const t of [...ohneStart.filter((x) => x.art === 'prognose'), ...ohneStart.filter(istKandidat)]) {
    const w = await kurs(t.ticker!, t.markt, 'start');
    if (w === undefined) continue;
    if (w === null) {
      t.startVersuche = (t.startVersuche ?? 0) + 1;
      continue;
    }
    Object.assign(t, { start: w, startZeit: iso });
    if (istKandidat(t) && !t.pump && pumpVerdacht(t.typen, { kurs: w })) t.pump = true;
    erg.nachgeholt++;
  }

  // 3. Tagsüber: schnelle Ereignis-Signale sofort aufnehmen (Reaktionszeit), höchstens 8 je Lauf
  let schnell = 0;
  for (const x of opt.schnelle ?? []) {
    if (schnell >= MAX_SCHNELLE_JE_LAUF || !SCHNELLE_TYPEN.has(x.typ) || !x.t || (x.r === 0 && x.typ !== 'kursrakete')) continue;
    if (liste.some((t) => t.datum === heute && t.schluessel === x.s)) continue;
    const markt = x.m as TrackingEintrag['markt'];
    const start = await kurs(x.t, markt, 'start');
    if (!start) continue;
    schnell++;
    liste.push({
      datum: heute, schluessel: x.s, name: x.n, ticker: x.t, score: (x.r === -1 ? -1 : 1) * x.st, typen: [x.typ], quellen: x.q,
      ...(markt ? { markt } : {}),
      ...(pumpVerdacht([x.typ], { kurs: start }) ? { pump: true } : {}),
      art: 'schnell', start, startZeit: iso,
    });
  }

  // 4. Reaktionszeit: ~1 Stunde nach dem Start (50 Min. bis 6 Std.) – nur wenn der Markt bei Start und Messung offen war
  for (const t of liste) {
    if (!t.ticker || !t.start || !t.startZeit || t.unplausibel || typeof t.r1h === 'number' || typeof t.r1hGeschlossen === 'number') continue;
    const min = (jetzt.getTime() - Date.parse(t.startZeit)) / 60000;
    if (min < 50 || min > 360) continue;
    const kb = kursbasisAusTicker(t.ticker, t.markt);
    if (!kb || !marktOffen(kb.markt, new Date(t.startZeit), offenOpt) || !marktOffen(kb.markt, jetzt, offenOpt)) continue;
    const w = await kurs(t.ticker, t.markt, 'messung');
    if (typeof w === 'number') {
      t.r1h = gerichtet(t, w);
      erg.gemessen++;
    }
  }

  // 5. Fällige Messungen: pünktliche zuerst (ein alter Rückstau blockiert nichts mehr), nur im Fenster des Messpunkts
  const faellig: { t: TrackingEintrag; feld: (typeof MESSPUNKTE)[number][0]; verspaetung: number }[] = [];
  const fruehestens = new Date(jetzt.getTime() - 45 * 86400000).toISOString().slice(0, 10);
  for (const t of liste) {
    if (!t.ticker || !t.start || t.unplausibel || t.datum < fruehestens || t.datum >= heute) continue;
    const tage = handelstageZwischen(t.datum, heute);
    for (const [feld, ab, bis] of MESSPUNKTE) if (typeof t[feld] !== 'number' && tage >= ab && tage < bis) faellig.push({ t, feld, verspaetung: tage - ab });
  }
  faellig.sort((a, b) => a.verspaetung - b.verspaetung);
  for (const f of faellig) {
    const w = await kurs(f.t.ticker!, f.t.markt, 'messung');
    if (typeof w !== 'number') continue;
    f.t[f.feld] = gerichtet(f.t, w);
    erg.gemessen++;
  }

  const heuteK = liste.filter((t) => t.datum === heute && istKandidat(t));
  erg.heuteKandidaten = heuteK.length;
  erg.heuteMitStart = heuteK.filter((t) => t.start).length;
  erg.startAbrufe = zaehler.start;
  erg.messAbrufe = zaehler.messung;
  return erg;
}
