// Schattenbuch der Datenkrake: Kandidaten und schnelle Ereignis-Signale werden virtuell „gekauft“ und nachverfolgt –
// Kurs nach ~1 Stunde (Reaktionszeit), 1, 3, 5, 10 und 21 Handelstagen. So lernt das System, welche Signale und
// Quellen taugen, ohne dafür Orders zu brauchen. Sparsam: Kontingente beachten (max. Abrufe je Lauf aus der Config).
import { berlin, handelstageZwischen } from '../../core/kalender.ts';
import { pumpVerdacht, type KompaktSignal } from '../../core/datenkrake.ts';
import { runde } from '../../core/geld.ts';
import type { TrackingEintrag } from '../../core/statistik.ts';
import type { Kursbasis } from '../../core/typen.ts';
import { holeKurs, type Abrufprotokoll } from '../kurse/anbieter.ts';
import { ladeConfig, leseJson, schreibeJson } from './dateien.ts';

export function kursbasisAusTicker(ticker: string, markt?: TrackingEintrag['markt']): Kursbasis | null {
  const t = ticker.toUpperCase();
  if (markt === 'rohstoff') return null;
  if (markt === 'krypto' || ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'].includes(t)) return /^[A-Z0-9]{2,10}$/.test(t) ? { markt: 'krypto', symbol: t, waehrung: 'EUR' } : null;
  if (/\.(DE|PA|AS|MI|MC|F)$/.test(t)) return { markt: 'eu', symbol: t, waehrung: 'EUR' };
  if (/^[A-Z][A-Z0-9-]{0,5}$/.test(t)) return { markt: 'us', symbol: t, waehrung: 'USD' };
  return null;
}

const FAELLIG: [keyof TrackingEintrag & ('r1T' | 'r3T' | 'r1W' | 'r10T' | 'r1M'), number][] = [
  ['r1T', 1],
  ['r3T', 3],
  ['r1W', 5],
  ['r10T', 10],
  ['r1M', 21],
];

/** Signaltypen, deren Wirkung schnell eintritt – tagsüber sofort ins Schattenbuch (Reaktionszeit messen). */
export const SCHNELLE_TYPEN = new Set(['kursrakete', 'handelsstopp', 'shortreport', 'neulistung', 'uebernahmeangebot', 'prognose_erhoehung', 'prognose_senkung', 'upbit_warnung', 'gewinn_ueberraschung', 'gewinn_enttaeuschung']);

export interface TrackingOptionen {
  /** haupt: Tageskandidaten aufnehmen; stuendlich: nur messen + schnelle Signale aufnehmen */
  modus?: 'haupt' | 'stuendlich';
  /** frische Signale dieses Laufs (für schnelle Aufnahme tagsüber) */
  schnelle?: KompaktSignal[];
}

export async function trackingAktualisieren(jetzt: Date, protokoll: Abrufprotokoll, opt: TrackingOptionen = {}): Promise<number> {
  const { einstellungen } = ladeConfig();
  const modus = opt.modus ?? 'haupt';
  const heute = berlin(jetzt).datum;
  const liste = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []);
  let abrufe = 0;
  const max = einstellungen.tracking.maxAbrufeProLauf;
  const cache = new Map<string, number | null>();
  const kurs = async (ticker: string, markt?: TrackingEintrag['markt']): Promise<number | null> => {
    const key = `${markt ?? ''}:${ticker}`;
    if (cache.has(key)) return cache.get(key)!;
    const kb = kursbasisAusTicker(ticker, markt);
    if (!kb || abrufe >= max) return null;
    abrufe++;
    const k = await holeKurs(kb, jetzt, protokoll).catch(() => null);
    cache.set(key, k?.wert ?? null);
    return k?.wert ?? null;
  };
  const gerichtet = (t: TrackingEintrag, w: number) => runde((w / t.start! - 1) * 100 * (t.score < 0 ? -1 : 1), 2);

  // 1. Reaktionszeit: ~1 Stunde nach dem Start (50 Min. bis 6 Std.)
  for (const t of liste) {
    if (!t.ticker || !t.start || !t.startZeit || typeof t.r1h === 'number') continue;
    const min = (jetzt.getTime() - Date.parse(t.startZeit)) / 60000;
    if (min < 50 || min > 360) continue;
    const w = await kurs(t.ticker, t.markt);
    if (w !== null) t.r1h = gerichtet(t, w);
  }

  // 2. Fällige Messungen nachtragen (älteste zuerst)
  for (const t of liste) {
    if (!t.ticker || !t.start) continue;
    for (const [feld, tage] of FAELLIG) {
      if (typeof t[feld] === 'number' || handelstageZwischen(t.datum, heute) < tage) continue;
      const w = await kurs(t.ticker, t.markt);
      if (w === null) break;
      t[feld] = gerichtet(t, w);
    }
  }

  // 3a. Hauptlauf: Tageskandidaten aufnehmen (nur einmal pro Tag, mit Startkurs)
  if (modus === 'haupt' && !liste.some((t) => t.datum === heute && t.art !== 'schnell')) {
    const neu = leseJson<{ kandidaten?: { schluessel: string; name: string; ticker?: string; markt?: TrackingEintrag['markt']; pump?: boolean; score: number; typen: string[]; quellen: string[] }[] }>(`signale/${heute}.json`, {});
    const top = (neu.kandidaten ?? []).filter((k) => k.ticker && kursbasisAusTicker(k.ticker, k.markt)).slice(0, einstellungen.tracking.kandidatenProTag);
    for (const k of top) {
      const start = await kurs(k.ticker!, k.markt);
      liste.push({
        datum: heute, schluessel: k.schluessel, name: k.name, ticker: k.ticker, score: k.score, typen: k.typen, quellen: k.quellen,
        ...(k.markt ? { markt: k.markt } : {}), ...(k.pump || (start && pumpVerdacht(k.typen, { kurs: start })) ? { pump: true } : {}),
        art: 'kandidat', ...(start ? { start, startZeit: jetzt.toISOString() } : {}),
      });
    }
  }

  // 3b. Tagsüber: schnelle Ereignis-Signale sofort aufnehmen (Reaktionszeit), höchstens 8 je Lauf
  if (opt.schnelle?.length) {
    let n = 0;
    for (const x of opt.schnelle) {
      if (n >= 8 || !SCHNELLE_TYPEN.has(x.typ) || !x.t || x.r === 0 && x.typ !== 'kursrakete') continue;
      if (liste.some((t) => t.datum === heute && t.schluessel === x.s)) continue;
      const markt = x.m as TrackingEintrag['markt'];
      if (!kursbasisAusTicker(x.t, markt)) continue;
      const start = await kurs(x.t, markt);
      if (!start) continue;
      n++;
      liste.push({
        datum: heute, schluessel: x.s, name: x.n, ticker: x.t, score: (x.r === -1 ? -1 : 1) * x.st, typen: [x.typ], quellen: x.q,
        ...(markt ? { markt } : {}), ...(pumpVerdacht([x.typ], { kurs: start }) ? { pump: true } : {}),
        art: 'schnell', start, startZeit: jetzt.toISOString(),
      });
    }
  }

  // 4. Aufräumen: ein Jahr behalten
  const grenze = new Date(jetzt.getTime() - 366 * 86400000).toISOString().slice(0, 10);
  schreibeJson('kandidaten-tracking.json', liste.filter((t) => t.datum >= grenze));
  return abrufe;
}
