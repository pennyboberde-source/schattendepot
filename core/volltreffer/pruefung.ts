// Musterprüfung (Plan Volltreffer V3): Je Gruppe (alle Fälle, Einzelmerkmal, Zweierkombination, Hypothese) wird je
// Spielart und Fenster gezählt, wie oft eine 1.000-€-Order zum Volltreffer wurde und was sie im Schnitt nach Kosten
// brachte – getrennt nach zwei Zeiträumen. Bestanden hat nur, was in BEIDEN Zeiträumen mindestens 100 Fälle und einen
// Erwartungswert über null zeigt; gereiht wird nach dem schwächeren Zeitraum abzüglich eines Standardfehlers.
import type { Ausgang, Kerze, Spielart } from './etikett.ts';
import type { Merkmale } from './merkmale.ts';

// ---------- Zählwerk ----------
const STATS = 6; // n, treffer, beinahe, summe, quadrate, knockout

/** Zähler in einem flachen Feld: Gruppe × Spielart × Fenster × Zeitraum. */
export class Zaehlwerk {
  readonly feld: Float64Array;
  readonly gruppen: number;
  readonly spielarten: number;
  readonly fenster: number;
  readonly zeitraeume: number;
  constructor(gruppen: number, spielarten: number, fenster: number, zeitraeume = 2) {
    this.gruppen = gruppen;
    this.spielarten = spielarten;
    this.fenster = fenster;
    this.zeitraeume = zeitraeume;
    this.feld = new Float64Array(gruppen * spielarten * fenster * zeitraeume * STATS);
  }
  private pos(g: number, s: number, f: number, z: number) {
    return (((g * this.spielarten + s) * this.fenster + f) * this.zeitraeume + z) * STATS;
  }
  add(g: number, s: number, f: number, z: number, a: Ausgang) {
    const p = this.pos(g, s, f, z);
    const x = this.feld;
    x[p]++;
    if (a.art === 'treffer') x[p + 1]++;
    else if (a.beinahe) x[p + 2]++;
    x[p + 3] += a.netto;
    x[p + 4] += a.netto * a.netto;
    if (a.knockout) x[p + 5]++;
  }
  werte(g: number, s: number, f: number, z: number): Kennzahl {
    const p = this.pos(g, s, f, z);
    return kennzahl(this.feld[p], this.feld[p + 1], this.feld[p + 2], this.feld[p + 3], this.feld[p + 4], this.feld[p + 5]);
  }
  /** beide Zeiträume zusammen */
  gesamt(g: number, s: number, f: number): Kennzahl {
    let n = 0,
      t = 0,
      b = 0,
      su = 0,
      q = 0,
      ko = 0;
    for (let z = 0; z < this.zeitraeume; z++) {
      const p = this.pos(g, s, f, z);
      n += this.feld[p];
      t += this.feld[p + 1];
      b += this.feld[p + 2];
      su += this.feld[p + 3];
      q += this.feld[p + 4];
      ko += this.feld[p + 5];
    }
    return kennzahl(n, t, b, su, q, ko);
  }
}

export interface Kennzahl {
  /** Fälle */
  n: number;
  treffer: number;
  beinahe: number;
  /** Trefferanteil in % */
  quote: number;
  /** Erwartungswert je Order in € nach Kosten */
  ev: number;
  /** Standardfehler des Erwartungswerts in € */
  se: number;
  knockout: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;

function kennzahl(n: number, treffer: number, beinahe: number, summe: number, quadrate: number, knockout: number): Kennzahl {
  if (!n) return { n: 0, treffer: 0, beinahe: 0, quote: 0, ev: 0, se: 0, knockout: 0 };
  const ev = summe / n;
  const varianz = n > 1 ? Math.max(0, (quadrate - n * ev * ev) / (n - 1)) : 0;
  return { n, treffer, beinahe, quote: r2((treffer / n) * 100), ev: r1(ev), se: r1(Math.sqrt(varianz / n)), knockout };
}

// ---------- Bewertung ----------
export interface Pruefergebnis {
  gruppe: string;
  spielart: string;
  fenster: number;
  zeitraeume: Kennzahl[];
  gesamt: Kennzahl;
  /** Trefferanteil gegen die Grundrate derselben Spielart und desselben Fensters */
  lift: number | null;
  /** Anteil aller Volltreffer (dieser Spielart/dieses Fensters), den die Gruppe erfasst, in % */
  erfassung: number;
  /** Rangwert: schwächerer Zeitraum (Ø netto) abzüglich eines Standardfehlers */
  wertung: number;
  bestanden: boolean;
}

export function pruefen(gruppe: string, spielart: string, fenster: number, zeitraeume: Kennzahl[], basis: Kennzahl, mindestFaelle = 100): Pruefergebnis {
  const gesamt = zeitraeume.reduce(
    (a, k) => {
      const n = a.n + k.n;
      return { n, treffer: a.treffer + k.treffer, beinahe: a.beinahe + k.beinahe, ev: n ? (a.ev * a.n + k.ev * k.n) / n : 0, knockout: a.knockout + k.knockout };
    },
    { n: 0, treffer: 0, beinahe: 0, ev: 0, knockout: 0 },
  );
  const schwach = zeitraeume.reduce((a, k) => (k.ev - k.se < a.ev - a.se ? k : a), zeitraeume[0]);
  const bestanden = zeitraeume.every((k) => k.n >= mindestFaelle && k.ev > 0);
  const quote = gesamt.n ? (gesamt.treffer / gesamt.n) * 100 : 0;
  return {
    gruppe,
    spielart,
    fenster,
    zeitraeume,
    gesamt: { n: gesamt.n, treffer: gesamt.treffer, beinahe: gesamt.beinahe, quote: r2(quote), ev: r1(gesamt.ev), se: r1(Math.max(...zeitraeume.map((k) => k.se))), knockout: gesamt.knockout },
    lift: basis.quote > 0 ? r2(quote / basis.quote) : null,
    erfassung: basis.treffer > 0 ? r1((gesamt.treffer / basis.treffer) * 100) : 0,
    wertung: r1(schwach.ev - schwach.se),
    bestanden,
  };
}

// ---------- Hypothesen als Kerzen-Regeln ----------
// Was Signale braucht, die es rückwirkend nicht gibt (Nachrichten, Handelsstopps, Leerverkauf, Termine, Funding), wird
// hier als Kerzen-Variante geprüft und läuft im Original nur vorwärts. Jede Regel meldet den Auslöse-Tag (Stichtag):
// Am Ende dieses Tags ist alles bekannt, eingestiegen wird zur Eröffnung des Folgetags.
export interface Hypothese {
  nr: string;
  name: string;
  /** die Regel in Worten (wird so ins Hypothesen-Buch geschrieben) */
  regel: string;
  markt: 'aktie' | 'krypto' | 'alle';
  richtung: 'long' | 'short';
  ausgeloest: (k: Kerze[], m: (Merkmale | null)[], i: number) => boolean;
}

const verfall = 3;
/** Gab es in den `verfall` Tagen vor i einen Auslöser-Vorlauf (Setup), der die Bedingung erfüllt? */
const setupVor = (m: (Merkmale | null)[], i: number, bed: (x: Merkmale, j: number) => boolean) => {
  for (let j = i - 1; j >= Math.max(0, i - verfall); j--) {
    const x = m[j];
    if (x && bed(x, j)) return j;
  }
  return -1;
};
const neuesHoch = (k: Kerze[], i: number, n: number) => i >= n && k[i].c > Math.max(...k.slice(i - n, i).map((x) => x.h));

export const HYPOTHESEN: Hypothese[] = [
  {
    nr: 'C1k',
    name: 'Fortsetzung nach hartem Anlass (Kerzen-Variante)',
    regel: 'Nebenwert (Ø Umsatz 20 Tage unter 50 Mio.) steigt an einem Tag um mindestens 10 % bei mindestens fünffachem Umsatz und schließt im obersten Fünftel der Tagesspanne; Auslöser: einer der 3 Folgetage schließt über dem Hoch dieses Tags.',
    markt: 'aktie',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      const s = setupVor(m, i, (x) => x.r1 >= 10 && (x.relVolumen ?? 0) >= 5 && x.lageSchluss >= 0.8 && (x.umsatz20 ?? Infinity) < 5e7);
      return s >= 0 && k[i].c > k[s].h;
    },
  },
  {
    nr: 'C2k',
    name: 'Ungewöhnlicher Umsatz ohne Kursbewegung (Kerzen-Variante von Mehrfach-Handelsstopp)',
    regel: 'An mindestens 2 der letzten 3 Tage mindestens fünffacher Umsatz bei weniger als 3 % Kursbewegung; Auslöser: Schluss über dem höchsten Hoch dieser Tage.',
    markt: 'aktie',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      const tage = [i - 1, i - 2, i - 3].filter((j) => j >= 0 && m[j] && (m[j]!.relVolumen ?? 0) >= 5 && Math.abs(m[j]!.r1) < 3);
      return tage.length >= 2 && k[i].c > Math.max(...tage.map((j) => k[j].h));
    },
  },
  {
    nr: 'C3k',
    name: 'Squeeze-Aufstellung (Kerzen-Variante)',
    regel: 'Wert liegt mindestens 60 % unter dem 250-Tage-Hoch und schwankt stark (über 5 % am Tag); Auslöser: Schluss auf neuem 20-Tage-Hoch bei mindestens dreifachem Umsatz.',
    markt: 'aktie',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      const x = m[i];
      return !!x && (x.abstandHoch250 ?? 0) <= -60 && (x.schwankung20 ?? 0) > 5 && (x.relVolumen ?? 0) >= 3 && neuesHoch(k, i, 20);
    },
  },
  {
    nr: 'C6k',
    name: 'Hebel auf Standardwerte nach enger Schwankung',
    regel: 'Großer Wert (Ø Umsatz 20 Tage ab 100 Mio.) mit enger Schwankung (unter 1,5 % am Tag); Auslöser: Schluss auf neuem 20-Tage-Hoch.',
    markt: 'aktie',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      const x = m[i];
      return !!x && (x.umsatz20 ?? 0) >= 1e8 && (x.schwankung20 ?? 99) < 1.5 && neuesHoch(k, i, 20);
    },
  },
  {
    nr: 'C7k',
    name: 'Krypto-Ausbruch aus mehrwöchiger Spanne',
    regel: 'Coin lag 20 Tage in einer Spanne von höchstens 30 %; Auslöser: Schluss über dem 20-Tage-Hoch bei mindestens dreifachem Umsatz.',
    markt: 'krypto',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      if (i < 21) return false;
      const vor = k.slice(i - 20, i);
      const hoch = Math.max(...vor.map((x) => x.h));
      const tief = Math.min(...vor.map((x) => x.l));
      return tief > 0 && hoch / tief - 1 <= 0.3 && k[i].c > hoch && (m[i]?.relVolumen ?? 0) >= 3;
    },
  },
  {
    nr: 'C9k',
    name: 'Rückprall nach Ausverkauf',
    regel: 'Tagesverlust ab 25 %; Auslöser: der erste der 3 Folgetage, der höher schließt als am Vortag (ohne Prüfung auf Verwässerung/Insolvenz – rückwirkend nicht möglich).',
    markt: 'alle',
    richtung: 'long',
    ausgeloest: (k, m, i) => {
      const s = setupVor(m, i, (x) => x.r1 <= -25);
      if (s < 0 || !(k[i].c > k[i - 1].c)) return false;
      for (let j = s + 1; j < i; j++) if (k[j].c > k[j - 1].c) return false; // nur der erste höhere Schluss
      return true;
    },
  },
  {
    nr: 'C10',
    name: 'Kontrollmuster: Tagesgewinner',
    regel: 'Tagesgewinn ab 20 %, ohne Auslöser-Regel (Vergleich: kaufen, was schon gestiegen ist).',
    markt: 'alle',
    richtung: 'long',
    ausgeloest: (_k, m, i) => (m[i]?.r1 ?? 0) >= 20,
  },
];

/** Fälle einer Hypothese je Wert: nach einem Fall zählt derselbe Wert erst nach `sperre` Handelstagen wieder (ehrliche Fallzahl). */
export function hypothesenFaelle(h: Hypothese, k: Kerze[], m: (Merkmale | null)[], sperre = 10, ab = 1): number[] {
  const faelle: number[] = [];
  let letzter = -Infinity;
  for (let i = ab; i < k.length; i++) {
    if (i - letzter <= sperre) continue;
    if (h.ausgeloest(k, m, i)) {
      faelle.push(i);
      letzter = i;
    }
  }
  return faelle;
}

export const spielartSchluessel = (sp: Spielart) => `${sp.hebel}${sp.richtung === 'long' ? 'L' : 'S'}${sp.stopEuro}`;
