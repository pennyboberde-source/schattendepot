// Marktphasen (Plan Datenkrake S4): Trend (50-/200-Tage-Linie) × Unruhe (20-Tage-Schwankung gegen ihren Median).
// Jede Messung im Schattenbuch, jede Order und jeder Daytrade wird so auch je Phase ausgewertet:
// „Was klappt in welcher Marktlage?“ Aktien: S&P 500 (SPY), Krypto: Bitcoin.
import { runde } from './geld.ts';

export type Trend = 'aufwaerts' | 'abwaerts' | 'seitwaerts';
export type Unruhe = 'ruhig' | 'nervoes';
export type MarktGruppe = 'aktien' | 'krypto';

export interface Marktphase {
  datum: string;
  trend: Trend;
  unruhe: Unruhe;
  /** z. B. "aufwaerts_ruhig" */
  phase: string;
  schluss: number;
  sma50: number;
  sma200?: number;
  /** annualisierte Schwankung der letzten 20 Tage in % und ihr Median über bis zu 1 Jahr */
  vol20: number;
  volMedian: number;
}

export const TREND_TEXT: Record<Trend, string> = { aufwaerts: 'Aufwärts', abwaerts: 'Abwärts', seitwaerts: 'Seitwärts' };
export const UNRUHE_TEXT: Record<Unruhe, string> = { ruhig: 'ruhig', nervoes: 'nervös' };
export const phaseText = (p: string) => {
  const [t, u] = p.split('_') as [Trend, Unruhe];
  return `${TREND_TEXT[t] ?? t}, ${UNRUHE_TEXT[u] ?? u}`;
};

const mittel = (l: number[]) => l.reduce((a, b) => a + b, 0) / l.length;

function vol(schluesse: number[], ende: number, tage = 20, jahr = 252): number {
  const r: number[] = [];
  for (let i = ende - tage + 1; i <= ende; i++) r.push(Math.log(schluesse[i] / schluesse[i - 1]));
  const m = mittel(r);
  return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(jahr) * 100;
}

/** Phase aus Tagesschlusskursen (älteste zuerst); null bei weniger als 60 Kursen. Krypto: 365 Handelstage je Jahr. */
export function phaseBerechnen(schluesse: number[], datum: string, tageJeJahr = 252): Marktphase | null {
  const n = schluesse.length;
  if (n < 60 || schluesse.some((x) => !(x > 0))) return null;
  const s = schluesse[n - 1];
  const sma50 = mittel(schluesse.slice(-50));
  const sma200 = n >= 200 ? mittel(schluesse.slice(-200)) : undefined;
  const vol20 = vol(schluesse, n - 1, 20, tageJeJahr);
  const volle = [];
  for (let e = Math.max(21, n - 250); e < n; e++) volle.push(vol(schluesse, e, 20, tageJeJahr));
  const sortiert = [...volle].sort((a, b) => a - b);
  const volMedian = sortiert[Math.floor(sortiert.length / 2)];
  const trend: Trend = s > sma50 && (sma200 === undefined || sma50 > sma200) ? 'aufwaerts' : s < sma50 && (sma200 === undefined || sma50 < sma200) ? 'abwaerts' : 'seitwaerts';
  const unruhe: Unruhe = vol20 > 1.25 * volMedian ? 'nervoes' : 'ruhig';
  return {
    datum,
    trend,
    unruhe,
    phase: `${trend}_${unruhe}`,
    schluss: runde(s, 2),
    sma50: runde(sma50, 2),
    ...(sma200 !== undefined ? { sma200: runde(sma200, 2) } : {}),
    vol20: runde(vol20, 1),
    volMedian: runde(volMedian, 1),
  };
}

/** Verlauf: Datum → Phase je Gruppe (aus lernen/marktphasen.json). */
export type PhasenVerlauf = Record<string, Partial<Record<MarktGruppe, string>>>;

/** Phase, die an einem Datum galt (letzte Messung am oder vor dem Datum). */
export function phaseAm(verlauf: PhasenVerlauf, datum: string, gruppe: MarktGruppe): string | undefined {
  let best: string | undefined;
  for (const d of Object.keys(verlauf)) if (d <= datum && (!best || d > best) && verlauf[d][gruppe]) best = d;
  return best ? verlauf[best][gruppe] : undefined;
}
