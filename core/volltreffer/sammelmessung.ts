// Schattenbuch auf Sammelkursen (Plan V1 Teil b, seit 16.11.2026): Jedes Signal der Datenkrake wird aus den Tageskerzen
// des privaten Archivs gemessen – nicht nur die 40 Tageskandidaten mit Einzelabruf. Start ist der erste handelbare Kurs
// NACH dem Signaltag (Eröffnung des nächsten Handelstags; die Uhrzeit des Signals im Tag ist bei Tagesdaten unbekannt,
// so gibt es keinen Rückschaufehler). Gemessen werden Schlusskurse nach 1, 3, 5, 10 und 21 Handelstagen, höchster und
// tiefster Stand seit dem Start und die Vergleichsgruppe: Überrendite gegen den Markt (Median aller handelbaren Werte)
// und gegen Werte gleicher Größenklasse (Ø-Tagesumsatz) über dieselben Tage. Reine Funktionen.
import type { Kerze } from './etikett.ts';
import { median } from './reihen.ts';

export const SAMMEL_PUNKTE: [name: 'r1T' | 'r3T' | 'r1W' | 'r10T' | 'r1M', tage: number][] = [
  ['r1T', 1],
  ['r3T', 3],
  ['r1W', 5],
  ['r10T', 10],
  ['r1M', 21],
];
export type SammelPunkt = (typeof SAMMEL_PUNKTE)[number][0];

export interface SammelErgebnis {
  /** Index der Startkerze */
  j: number;
  r: Partial<Record<SammelPunkt, number>>;
  ueberMarkt: Partial<Record<SammelPunkt, number>>;
  ueberKlasse: Partial<Record<SammelPunkt, number>>;
  /** höchster/tiefster Stand seit dem Start in % (über die Tage bis heute, höchstens 21) */
  hoch: number;
  tief: number;
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Index der Startkerze: erster Handelstag nach dem Signaltag; null, wenn die Reihe den Signaltag nicht abdeckt */
export function startIndex(kerzen: Kerze[], signalTag: string): number | null {
  const j = kerzen.findIndex((k) => k.datum > signalTag);
  if (j < 1 || !(kerzen[j].o > 0)) return null;
  return j;
}

/**
 * Misst ein Signal. tagesRendite: Markt- bzw. Klassenrendite eines Tages in % (Schluss gegen Vortagsschluss) – für die
 * Vergleichsgruppe wird sie über dieselben Tage aufsummiert (Näherung).
 */
export function signalMessen(kerzen: Kerze[], signalTag: string, markt: (d: string) => number | null, klasse: (d: string) => number | null): SammelErgebnis | null {
  const j = startIndex(kerzen, signalTag);
  if (j === null) return null;
  const s = kerzen[j].o;
  const aus: SammelErgebnis = { j, r: {}, ueberMarkt: {}, ueberKlasse: {}, hoch: 0, tief: 0 };
  let hoch = s;
  let tief = s;
  for (let t = 0; t < 21 && j + t < kerzen.length; t++) {
    hoch = Math.max(hoch, kerzen[j + t].h);
    tief = Math.min(tief, kerzen[j + t].l);
  }
  aus.hoch = r1((hoch / s - 1) * 100);
  aus.tief = r1((tief / s - 1) * 100);
  for (const [name, n] of SAMMEL_PUNKTE) {
    const e = kerzen[j + n - 1];
    if (!e) break;
    const r = (e.c / s - 1) * 100;
    aus.r[name] = r1(r);
    let m = 0;
    let kl = 0;
    let mOk = true;
    let kOk = true;
    for (let t = 0; t < n; t++) {
      const d = kerzen[j + t].datum;
      const a = markt(d);
      const b = klasse(d);
      if (a === null) mOk = false;
      else m += a;
      if (b === null) kOk = false;
      else kl += b;
    }
    if (mOk) aus.ueberMarkt[name] = r1(r - m);
    if (kOk) aus.ueberKlasse[name] = r1(r - kl);
  }
  return aus;
}

/** Größenklasse nach Ø-Tagesumsatz (Näherung für die Größe, solange es keinen Börsenwert für Aktien gibt) */
export const GROESSEN_GRENZEN = [5e6, 20e6, 50e6];
export function groessenKlasse(umsatz20: number | null): number {
  let k = 0;
  while (k < GROESSEN_GRENZEN.length && (umsatz20 ?? 0) >= GROESSEN_GRENZEN[k]) k++;
  return k;
}

/**
 * Verdichtung je Signaltyp: n, Ø, Median, Anteil im Plus, Median der Überrenditen.
 * Mit `huerde` (Kosten hin und zurück in %, wie beim Autopilot) zusätzlich `netto`: Anteil über der Hürde und Ø nach Kosten –
 * daraus prüft der Autopilot des Depots seine Beweisschwelle auf der großen Fallzahl (17.11.2026).
 */
export function verdichten(liste: SammelErgebnis[], huerde?: number) {
  const je = (name: SammelPunkt) => {
    const w = liste.map((x) => x.r[name]).filter((x): x is number => x !== undefined);
    const um = liste.map((x) => x.ueberMarkt[name]).filter((x): x is number => x !== undefined);
    const uk = liste.map((x) => x.ueberKlasse[name]).filter((x): x is number => x !== undefined);
    return {
      n: w.length,
      mittel: w.length ? r1(w.reduce((a, b) => a + b, 0) / w.length) : null,
      median: w.length ? r1(median(w)) : null,
      imPlus: w.length ? r1((w.filter((x) => x > 0).length / w.length) * 100) : null,
      ueberMarkt: um.length ? r1(median(um)) : null,
      ueberKlasse: uk.length ? r1(median(uk)) : null,
      ...(huerde !== undefined && w.length
        ? { netto: { imPlus: r1((w.filter((x) => x > huerde).length / w.length) * 100), mittel: Math.round((w.reduce((a, b) => a + b, 0) / w.length - huerde) * 100) / 100 } }
        : {}),
    };
  };
  return {
    faelle: liste.length,
    punkte: Object.fromEntries(SAMMEL_PUNKTE.map(([name]) => [name, je(name)])) as Record<SammelPunkt, ReturnType<typeof je>>,
    hoch: liste.length ? r1(median(liste.map((x) => x.hoch))) : null,
    tief: liste.length ? r1(median(liste.map((x) => x.tief))) : null,
  };
}
