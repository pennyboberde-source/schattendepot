// HTTP mit Zeitlimit, Wiederholung und sauberem User-Agent; Kontingentzähler je Anbieter und Tag.
import { berlin } from '../../core/kalender.ts';
import { leseJson, schreibeJson } from './dateien.ts';

export const USER_AGENT = 'Schattendepot/0.2 (private Boersen-Simulation; https://github.com/pennyboberde-source/schattendepot)';

export class HttpFehler extends Error {
  status: number;
  constructor(status: number, nachricht: string) {
    super(nachricht);
    this.status = status;
  }
}

export async function holeText(url: string, opt: { versuche?: number; zeitlimitMs?: number; header?: Record<string, string> } = {}): Promise<string> {
  const { versuche = 2, zeitlimitMs = 12000, header = {} } = opt;
  let letzter: unknown;
  for (let i = 0; i < versuche; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json, text/plain, */*', ...header }, signal: AbortSignal.timeout(zeitlimitMs) });
      // (header kann User-Agent überschreiben, z. B. SEC-Vorgabe)
      if (!res.ok) throw new HttpFehler(res.status, `HTTP ${res.status} bei ${new URL(url).host}`);
      return await res.text();
    } catch (e) {
      letzter = e;
      // 4xx (außer 429) nicht wiederholen
      if (e instanceof HttpFehler && e.status >= 400 && e.status < 500 && e.status !== 429) break;
      if (i < versuche - 1) await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw letzter;
}

export async function holeJson<T>(url: string, opt?: Parameters<typeof holeText>[1]): Promise<T> {
  return JSON.parse(await holeText(url, opt)) as T;
}

/** Tageslimits (Gratis-Kontingente; teils mit Datensammler/Konnektor geteilt → Anteil für den Wächter). */
export const KONTINGENT: Record<string, number> = {
  finnhub: 3000,
  twelvedata: 700,
  fmp: 150,
  alphavantage: 8,
  kraken: 5000,
  frankfurter: 200,
};

interface Zaehler {
  [anbieter: string]: { datum: string; genutzt: number };
}

const DATEI = 'kontingente.json';

export function kontingentGenutzt(anbieter: string, jetzt: Date): number {
  const z = leseJson<Zaehler>(DATEI, {});
  return z[anbieter]?.datum === berlin(jetzt).datum ? z[anbieter].genutzt : 0;
}

export function kontingentFrei(anbieter: string, jetzt: Date, anzahl = 1, limit = KONTINGENT[anbieter] ?? Infinity): boolean {
  return kontingentGenutzt(anbieter, jetzt) + anzahl <= limit;
}

export function kontingentZaehlen(anbieter: string, jetzt: Date, anzahl = 1) {
  const z = leseJson<Zaehler>(DATEI, {});
  const heute = berlin(jetzt).datum;
  const alt = z[anbieter]?.datum === heute ? z[anbieter].genutzt : 0;
  z[anbieter] = { datum: heute, genutzt: alt + anzahl };
  schreibeJson(DATEI, z);
}
