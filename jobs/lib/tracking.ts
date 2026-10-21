// Mitverfolgen der Lagebild-Kandidaten (auch nicht gekaufte): Kurs nach 1 Handelstag, 1 Woche, 1 Monat.
// So lernt das System, welche Signale und Quellen taugen, ohne dafür Orders zu brauchen. Sparsam: Kontingente beachten.
import { berlin, handelstageZwischen } from '../../core/kalender.ts';
import { runde } from '../../core/geld.ts';
import type { TrackingEintrag } from '../../core/statistik.ts';
import type { Kursbasis } from '../../core/typen.ts';
import { holeKurs, type Abrufprotokoll } from '../kurse/anbieter.ts';
import { ladeConfig, leseJson, schreibeJson } from './dateien.ts';

export function kursbasisAusTicker(ticker: string): Kursbasis | null {
  const t = ticker.toUpperCase();
  if (['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'].includes(t)) return { markt: 'krypto', symbol: t, waehrung: 'EUR' };
  if (/\.(DE|PA|AS|MI|MC|F)$/.test(t)) return { markt: 'eu', symbol: t, waehrung: 'EUR' };
  if (/^[A-Z][A-Z0-9-]{0,5}$/.test(t)) return { markt: 'us', symbol: t, waehrung: 'USD' };
  return null;
}

const FAELLIG: [keyof TrackingEintrag & ('r1T' | 'r1W' | 'r1M'), number][] = [
  ['r1T', 1],
  ['r1W', 5],
  ['r1M', 21],
];

export async function trackingAktualisieren(jetzt: Date, protokoll: Abrufprotokoll): Promise<number> {
  const { einstellungen } = ladeConfig();
  const heute = berlin(jetzt).datum;
  const liste = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []);
  const neu = leseJson<{ kandidaten?: { schluessel: string; name: string; ticker?: string; score: number; typen: string[]; quellen: string[] }[] }>(`signale/${heute}.json`, {});
  let abrufe = 0;
  const max = einstellungen.tracking.maxAbrufeProLauf;
  const cache = new Map<string, number | null>();
  const kurs = async (ticker: string): Promise<number | null> => {
    if (cache.has(ticker)) return cache.get(ticker)!;
    const kb = kursbasisAusTicker(ticker);
    if (!kb || abrufe >= max) return null;
    abrufe++;
    const k = await holeKurs(kb, jetzt, protokoll);
    cache.set(ticker, k?.wert ?? null);
    return k?.wert ?? null;
  };

  // 1. Fällige Messungen nachtragen (älteste zuerst)
  for (const t of liste) {
    if (!t.ticker || !t.start) continue;
    for (const [feld, tage] of FAELLIG) {
      if (typeof t[feld] === 'number' || handelstageZwischen(t.datum, heute) < tage) continue;
      const w = await kurs(t.ticker);
      if (w === null) break;
      t[feld] = runde((w / t.start - 1) * 100 * (t.score < 0 ? -1 : 1), 2);
    }
  }

  // 2. Heutige Top-Kandidaten aufnehmen (nur einmal pro Tag, mit Startkurs)
  if (!liste.some((t) => t.datum === heute)) {
    const top = (neu.kandidaten ?? []).filter((k) => k.ticker && kursbasisAusTicker(k.ticker)).slice(0, einstellungen.tracking.kandidatenProTag);
    for (const k of top) {
      const start = await kurs(k.ticker!);
      liste.push({ datum: heute, schluessel: k.schluessel, name: k.name, ticker: k.ticker, score: k.score, typen: k.typen, quellen: k.quellen, ...(start ? { start } : {}) });
    }
  }

  // 3. Aufräumen: ein Jahr behalten
  const grenze = new Date(jetzt.getTime() - 366 * 86400000).toISOString().slice(0, 10);
  schreibeJson('kandidaten-tracking.json', liste.filter((t) => t.datum >= grenze));
  return abrufe;
}
