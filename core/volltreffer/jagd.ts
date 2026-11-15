// Bereich „Volltreffer“, virtuell (Plan Volltreffer V4): Aus den Fällen der Muster im Vorwärtstest werden virtuelle
// Jagden – höchstens `maxOffen` gleichzeitig, bei Gleichstand das Muster mit der besseren Wertung zuerst, und nach
// einem Tag mit `tagesVerlustGrenze` € realisierten Verlusten am Folgetag keine neue Jagd. Alles wird aus den
// Tageskerzen nachgerechnet; es gibt keinen Zustand, der sich nachträglich ändern ließe.

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
  art: 'treffer' | 'niete' | 'zeit' | 'offen' | 'lauert';
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
    if (offen.length >= r.maxOffen || gesperrt) {
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
  const fertig = jagden.filter((j) => j.art === 'treffer' || j.art === 'niete' || j.art === 'zeit');
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
