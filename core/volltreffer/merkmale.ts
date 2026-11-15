// Merkmale zum Stichtag (Plan Volltreffer V2): Was war am Ende des Stichtags aus den Kerzen bekannt?
// Nur Kerzen bis einschließlich Stichtag – eine Zukunftskerze darf kein Merkmal ändern (Test).
import type { Kerze } from './etikett.ts';

export interface Merkmale {
  /** Rendite über 1, 5 und 20 Handelstage in % */
  r1: number;
  r5: number | null;
  r20: number | null;
  /** Umsatz (Stück) heute gegen den Ø der 20 Tage davor */
  relVolumen: number | null;
  /** Tagesspanne heute gegen die Ø-Spanne der 20 Tage davor */
  relSpanne: number | null;
  /** Abstand des Schlusskurses zum Hoch der letzten 20 bzw. 250 Tage in % (≤ 0) */
  abstandHoch20: number | null;
  abstandHoch250: number | null;
  /** Lage des Schlusskurses in der Tagesspanne (0 = Tief, 1 = Hoch) */
  lageSchluss: number;
  /** Kurslücke zur Eröffnung in % */
  luecke: number;
  /** Schwankung: Standardabweichung der Tagesrenditen über 20 Tage in % */
  schwankung20: number | null;
  /** Ø Tagesumsatz in Währung über 20 Tage (Kurs × Stück) */
  umsatz20: number | null;
  /** Schlusskurs */
  kurs: number;
  /** Tage mit Kursdaten bis zum Stichtag */
  historie: number;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b - 1) * 100 : 0);
const mittel = (x: number[]) => (x.length ? x.reduce((s, v) => s + v, 0) / x.length : NaN);

/** Merkmale am Stichtag i. Braucht mindestens den Vortag; was mehr Geschichte braucht, ist sonst null. */
export function merkmale(kerzen: Kerze[], i: number): Merkmale | null {
  const k = kerzen[i];
  const vor = kerzen[i - 1];
  if (!k || !vor || !(k.c > 0) || !(vor.c > 0)) return null;
  const zurueck = (n: number) => (i - n >= 0 ? kerzen[i - n] : undefined);
  const r = (n: number) => {
    const a = zurueck(n);
    return a && a.c > 0 ? pct(k.c, a.c) : null;
  };
  const davor20 = kerzen.slice(Math.max(0, i - 20), i);
  const voll20 = davor20.length >= 20;
  const vol = davor20.map((x) => x.v ?? NaN).filter((x) => x > 0);
  const spannen = davor20.map((x) => (x.c > 0 ? (x.h - x.l) / x.c : NaN)).filter((x) => Number.isFinite(x));
  const hoch = (n: number) => Math.max(...kerzen.slice(Math.max(0, i - n + 1), i + 1).map((x) => x.h));
  const tagesR = kerzen
    .slice(Math.max(1, i - 19), i + 1)
    .map((x, j, arr) => {
      const v = j === 0 ? kerzen[Math.max(1, i - 19) - 1] : arr[j - 1];
      return v && v.c > 0 ? x.c / v.c - 1 : NaN;
    })
    .filter((x) => Number.isFinite(x));
  const m = mittel(tagesR);
  const umsaetze = kerzen.slice(Math.max(0, i - 19), i + 1).map((x) => (x.v ?? 0) * x.c);
  return {
    r1: pct(k.c, vor.c),
    r5: r(5),
    r20: r(20),
    relVolumen: voll20 && vol.length >= 10 && k.v !== undefined ? k.v / mittel(vol) : null,
    relSpanne: voll20 && spannen.length >= 10 && mittel(spannen) > 0 ? (k.h - k.l) / k.c / mittel(spannen) : null,
    abstandHoch20: i >= 19 ? pct(k.c, hoch(20)) : null,
    abstandHoch250: i >= 249 ? pct(k.c, hoch(250)) : null,
    lageSchluss: k.h > k.l ? (k.c - k.l) / (k.h - k.l) : 0.5,
    luecke: pct(k.o, vor.c),
    schwankung20: tagesR.length >= 19 ? Math.sqrt(mittel(tagesR.map((x) => (x - m) ** 2))) * 100 : null,
    umsatz20: i >= 19 && kerzen.slice(i - 19, i + 1).every((x) => x.v !== undefined) ? mittel(umsaetze) : null,
    kurs: k.c,
    historie: i + 1,
  };
}

/** Eine Einteilung: Name des Merkmals und Grenzen der Klassen (aufsteigend). */
export interface Einteilung {
  merkmal: keyof Merkmale | 'ueberrendite1' | 'marktR1' | 'boersenwert' | 'zahlen' | 'branche' | 'angebot' | 'registrierung' | 'grossaktionaer' | 'vertrag' | 'warnung' | 'fuehrung' | 'satzung';
  grenzen: number[];
  /** lesbare Namen der Klassen (eine mehr als Grenzen) */
  namen?: string[];
}

/** Klasse eines Werts (0 … grenzen.length) oder null, wenn der Wert fehlt. */
export function klasse(wert: number | null | undefined, grenzen: number[]): number | null {
  if (wert === null || wert === undefined || !Number.isFinite(wert)) return null;
  let n = 0;
  while (n < grenzen.length && wert >= grenzen[n]) n++;
  return n;
}

/** Lesbarer Name einer Klasse, z. B. „5 bis 10“, „unter 1“, „ab 100“. */
export function klassenName(e: Einteilung, n: number): string {
  if (e.namen?.[n]) return e.namen[n];
  const g = e.grenzen;
  const z = (x: number) => String(x).replace('.', ',');
  if (n === 0) return `unter ${z(g[0])}`;
  if (n === g.length) return `ab ${z(g[g.length - 1])}`;
  return `${z(g[n - 1])} bis ${z(g[n])}`;
}
