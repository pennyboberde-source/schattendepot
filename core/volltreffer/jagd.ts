// Bereich „Volltreffer“, virtuell (Plan Volltreffer V4): Aus den Fällen der Muster im Vorwärtstest werden virtuelle
// Jagden – höchstens `maxOffen` gleichzeitig, bei Gleichstand das Muster mit der besseren Wertung zuerst, und nach
// einem Tag mit `tagesVerlustGrenze` € realisierten Verlusten am Folgetag keine neue Jagd. Alles wird aus den
// Tageskerzen nachgerechnet; es gibt keinen Zustand, der sich nachträglich ändern ließe.
import { euro } from '../geld.ts';

export interface JagdFall {
  /** Schlüssel des Musters (Gruppe|Spielart|Fenster) */
  muster: string;
  /** Wertung des Musters im Rückblick (Rang bei Gleichstand) */
  wertung: number;
  wert: string;
  markt: 'aktie' | 'krypto';
  /** Stichtag (Signal bekannt zum Schluss) */
  stichtag: string;
  /** Einstiegstag (Eröffnung); null = noch kein Folgetag */
  einstieg: string | null;
  /** Tag des Ausstiegs; null = läuft noch */
  ende: string | null;
  /** gesichert = Ausstieg am Nachziehstop */
  art: 'treffer' | 'niete' | 'zeit' | 'gesichert' | 'offen' | 'lauert';
  /** Ergebnis in € (bei offenen Jagden der Stand zum letzten Schluss) */
  netto: number | null;
  /** Handelstag der Jagd (1 = Einstiegstag) */
  tag: number | null;
  fenster: number;
  spielart: string;
  /** V5: Claudes Urteil im Morgenlauf (falls abgegeben) */
  urteil?: 'ja' | 'nein';
  grund?: string;
}

export interface JagdRegeln {
  maxOffen: number;
  tagesVerlustGrenze: number;
  /** V6: höchstens eine offene Jagd je Wert (derselbe Wert aus zwei Mustern wird nicht doppelt gehandelt) */
  einmalJeWert?: boolean;
}

/** Wählt aus allen Fällen die virtuellen Jagden (Reihenfolge: Einstieg, dann Wertung). */
export function jagdenWaehlen(faelle: JagdFall[], r: JagdRegeln): { jagden: JagdFall[]; uebersprungen: number } {
  const mitEinstieg = faelle.filter((f) => f.einstieg).sort((a, b) => a.einstieg!.localeCompare(b.einstieg!) || b.wertung - a.wertung);
  const offen: JagdFall[] = [];
  const jagden: JagdFall[] = [];
  const verlustAm = new Map<string, number>();
  /** Verlusttag (Grenze erreicht) → erster Einstiegstag danach: nur an diesem Tag ist gesperrt */
  const sperrtag = new Map<string, string>();
  let uebersprungen = 0;
  for (const f of mitEinstieg) {
    const tag = f.einstieg!;
    // beendete Jagden freigeben (Ausstieg vor dem Einstiegstag)
    for (let n = offen.length - 1; n >= 0; n--) if (offen[n].ende && offen[n].ende! < tag) offen.splice(n, 1);
    // Tagesverlustgrenze: nach einem Tag mit zu viel realisiertem Verlust ist der nächste Einstiegstag gesperrt
    let gesperrt = false;
    for (const [d, v] of verlustAm) {
      if (d >= tag || v < r.tagesVerlustGrenze) continue;
      if (!sperrtag.has(d)) sperrtag.set(d, tag);
      if (sperrtag.get(d) === tag) gesperrt = true;
    }
    const doppelt = !!r.einmalJeWert && offen.some((o) => o.wert === f.wert && o.markt === f.markt);
    if (offen.length >= r.maxOffen || gesperrt || doppelt) {
      uebersprungen++;
      continue;
    }
    offen.push(f);
    jagden.push(f);
    if (f.ende && f.netto !== null && f.netto < 0) verlustAm.set(f.ende, (verlustAm.get(f.ende) ?? 0) - f.netto);
  }
  return { jagden, uebersprungen };
}

export interface JagdKennzahlen {
  /** abgeschlossene Jagden */
  anzahl: number;
  volltreffer: number;
  /** Volltreffer-Quote in % */
  quote: number;
  /** Ø Verlust der Nieten in € */
  oeNiete: number;
  /** Erwartungswert je Jagd in € */
  ev: number;
  summe: number;
  offen: number;
}

export function jagdKennzahlen(jagden: JagdFall[]): JagdKennzahlen {
  const fertig = jagden.filter((j) => j.art === 'treffer' || j.art === 'niete' || j.art === 'zeit' || j.art === 'gesichert');
  const nieten = fertig.filter((j) => (j.netto ?? 0) < 0);
  const summe = fertig.reduce((s, j) => s + (j.netto ?? 0), 0);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    anzahl: fertig.length,
    volltreffer: fertig.filter((j) => j.art === 'treffer').length,
    quote: fertig.length ? r1((fertig.filter((j) => j.art === 'treffer').length / fertig.length) * 100) : 0,
    oeNiete: nieten.length ? r1(nieten.reduce((s, j) => s + (j.netto ?? 0), 0) / nieten.length) : 0,
    ev: fertig.length ? r1(summe / fertig.length) : 0,
    summe: Math.round(summe * 100) / 100,
    offen: jagden.filter((j) => j.art === 'offen').length,
  };
}

/** Der Teil von volltreffer/uebersicht.json, den die Abendbilanz liest */
export interface JagdUebersicht {
  kennzahlen: JagdKennzahlen;
  offen: JagdFall[];
  abgeschlossen: JagdFall[];
}

const ZEICHEN: Record<string, string> = { treffer: '🎯', niete: '❌', zeit: '⏱️', gesichert: '🔒' };
const jagdSchluessel = (j: JagdFall) => `${j.muster}|${j.wert}|${j.einstieg}`;

/**
 * Abendbilanz der virtuellen Jagden (Plan V4: Jagden erscheinen nur hier, nie als Einzelmitteilung). Meldet nur, was seit
 * der letzten Bilanz neu ist – begonnene und beendete Jagden, erkannt an ihren Schlüsseln in `gemeldet`. Nichts Neues → null.
 * Die Jagden rechnet der Rückblick früh aus den Tageskerzen bis zum Vortag; die Bilanz sagt deshalb „Stand heute früh“.
 */
export function jagdBilanz(u: JagdUebersicht, gemeldet: string[]): { titel: string; text: string; gemeldet: string[] } | null {
  const schon = new Set(gemeldet);
  const neuEnde = u.abgeschlossen.filter((j) => !schon.has(`${jagdSchluessel(j)}|ende`));
  const neuStart = u.offen.filter((j) => !schon.has(`${jagdSchluessel(j)}|start`));
  if (!neuEnde.length && !neuStart.length) return null;
  const summe = neuEnde.reduce((s, j) => s + (j.netto ?? 0), 0);
  const k = u.kennzahlen;
  const teile = [
    ...neuEnde.map((j) => `${ZEICHEN[j.art] ?? ''} ${j.wert} ${euro(j.netto ?? 0, { vorzeichen: true })}`.trim()),
    ...neuStart.map((j) => `▶️ ${j.wert} (${j.spielart.split(',')[0]})`),
    u.offen.length ? `${u.offen.length} laufen` : '',
    k.anzahl ? `bisher ${k.anzahl} beendet, ${k.volltreffer} Volltreffer, Ø ${euro(k.ev, { vorzeichen: true })} je Jagd` : '',
  ].filter(Boolean);
  const titel = neuEnde.length ? `🎯 Volltreffer-Jagden: ${neuEnde.length} beendet, ${euro(summe, { vorzeichen: true })}` : `🎯 Volltreffer-Jagden: ${neuStart.length} neu`;
  const neueSchluessel = [...neuEnde.flatMap((j) => [`${jagdSchluessel(j)}|ende`, `${jagdSchluessel(j)}|start`]), ...neuStart.map((j) => `${jagdSchluessel(j)}|start`)];
  return { titel, text: `${teile.join(' · ')} – virtuell, Stand heute früh`, gemeldet: [...new Set([...gemeldet, ...neueSchluessel])].slice(-600) };
}
