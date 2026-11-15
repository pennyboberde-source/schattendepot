// Kursreihen für Rückblick und Zensus: aus den Tagesdateien des privaten Archivs je Wert eine Reihe von Tageskerzen,
// splitbereinigt. Reine Funktionen.
import type { Kerze } from './etikett.ts';

/** Gewöhnliche US-Aktie (keine Warrants, Units, Rechte, Vorzugs- oder Sonderklassen außer A/B). */
export function istUsAktie(ticker: string): boolean {
  if (!/^[A-Z]{1,5}(\.[AB])?$/.test(ticker)) return false;
  return !(ticker.length === 5 && /[WUR]$/.test(ticker));
}

export interface Split {
  datum: string;
  /** aus `von` alten Aktien werden `zu` neue */
  von: number;
  zu: number;
}

/**
 * Kurse vor einem Split auf den heutigen Stand umrechnen (Kurse × von/zu, Stück × zu/von), damit ein Split kein
 * Kurssprung ist. Mehrere Splits wirken nacheinander.
 */
export function splitBereinigen(kerzen: Kerze[], splits: Split[]): Kerze[] {
  if (!splits.length) return kerzen;
  return kerzen.map((k) => {
    let f = 1;
    for (const s of splits) if (k.datum < s.datum && s.von > 0 && s.zu > 0) f *= s.von / s.zu;
    return f === 1 ? k : { ...k, o: k.o * f, h: k.h * f, l: k.l * f, c: k.c * f, ...(k.v !== undefined ? { v: k.v / f } : {}) };
  });
}

const VERHAELTNISSE = [5, 8, 10, 15, 20, 25, 30, 40, 50, 100];

/**
 * Nicht gemeldete Splits erkennen: Eine Kurslücke über Nacht, die bis auf 2 % einem üblichen Verhältnis ab 1:5 bzw.
 * 5:1 entspricht, gilt als Split – die Reihe wird dort geteilt (lieber einen echten Sprung verlieren als einen Split
 * als Volltreffer zählen). Gibt die Teilreihen zurück.
 */
export function unbekannteSplitsTeilen(kerzen: Kerze[]): Kerze[][] {
  const teile: Kerze[][] = [];
  let start = 0;
  for (let i = 1; i < kerzen.length; i++) {
    const v = kerzen[i - 1].c;
    const q = v > 0 ? kerzen[i].o / v : 1;
    const passt = VERHAELTNISSE.some((r) => Math.abs(q * r - 1) <= 0.02 || Math.abs(q / r - 1) <= 0.02);
    if (passt) {
      teile.push(kerzen.slice(start, i));
      start = i;
    }
  }
  teile.push(kerzen.slice(start));
  return teile.filter((t) => t.length > 0);
}

const KLEINE_SPLITS = [1.5, 2, 3, 4];

/**
 * Split-Verdacht für die Klumpen-Prüfung: Liegt zwischen den Kerzen `von` und `bis` eine Kurslücke über Nacht, die bis auf
 * 1 % einem kleinen Split-Verhältnis (3:2, 2:1, 3:1, 4:1 oder umgekehrt) entspricht? Kleine Splits teilt
 * `unbekannteSplitsTeilen` nicht – sie könnten einen Short- oder Long-Volltreffer vortäuschen, deshalb wird gezählt.
 */
export function splitVerdacht(kerzen: Kerze[], von: number, bis: number): boolean {
  for (let j = Math.max(1, von); j <= Math.min(bis, kerzen.length - 1); j++) {
    const v = kerzen[j - 1].c;
    const q = v > 0 ? kerzen[j].o / v : 1;
    if (KLEINE_SPLITS.some((r) => Math.abs(q * r - 1) <= 0.01 || Math.abs(q / r - 1) <= 0.01)) return true;
  }
  return false;
}

/** Kraken-Paarname „XBT/EUR“ → Basis und Notierung. */
export function kryptoPaar(name: string): { basis: string; quote: string } | null {
  const [basis, quote] = name.split('/');
  return basis && quote ? { basis, quote } : null;
}

/** Median einer Zahlenliste (leer → 0). */
export function median(x: number[]): number {
  if (!x.length) return 0;
  const s = [...x].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
