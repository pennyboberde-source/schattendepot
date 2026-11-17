// B Stufe 2a (17.11.2026): gettex-Kurse passender Hebelprodukte mitschreiben – für Werte auf der Lauerliste und in Jagden.
// gettex hält die 15-Minuten-Dateien nur rund 24 Stunden vor; ohne Mitschrift gäbe es später keine echten Turbo-Kurse für die
// Auswertung (2b: Hebel/Knock-out schätzen, echte Ergebnisse). Zeilen mit Stück 0 sind Kursstellungen (je ISIN einmal je
// Datei), Zeilen mit Stück > 0 echte Geschäfte. Alles privat (Archiv), nie öffentlich. Reine Funktionen.

export type ProdukteJeBasis = Record<string, [string, 'C' | 'P'][]>;

/**
 * Auswahl der mitzuschreibenden Produkte: je Basiswert-ISIN und gewünschter Richtung höchstens `maxJeRichtung` Produkte,
 * gleichmäßig über die (nach ISIN sortierte) Liste verteilt – ohne Kenntnis des Knock-outs gibt es keine bessere Wahl;
 * 2b schätzt den Hebel später aus dem Kursverlauf.
 */
export function produktAuswahl(produkte: ProdukteJeBasis, wunsch: Map<string, Set<'C' | 'P'>>, maxJeRichtung: number): Map<string, { b: string; t: 'C' | 'P' }> {
  const aus = new Map<string, { b: string; t: 'C' | 'P' }>();
  for (const [b, richtungen] of wunsch) {
    const liste = produkte[b] ?? [];
    for (const t of richtungen) {
      const l = liste.filter((x) => x[1] === t);
      const schritt = Math.max(1, l.length / maxJeRichtung);
      for (let i = 0; i < l.length && aus.size < 1e6; i += schritt) {
        const [isin] = l[Math.floor(i)];
        aus.set(isin, { b, t });
      }
    }
  }
  return aus;
}

/** Richtungen aus dem Spielart-Text („Turbo short Hebel 2 …“ → P, „Turbo long …“ → C, „direkt“ → beide). */
export function richtungenAus(spielart: string): ('C' | 'P')[] {
  if (/short/i.test(spielart)) return ['P'];
  if (/long/i.test(spielart)) return ['C'];
  return ['C', 'P'];
}

/**
 * Zeilen einer gettex-Datei für die ausgewählten Produkte übernehmen. `kursstellungen` = false: nur echte Geschäfte
 * (spart Platz – Kursstellungen nur in jedem n-ten Fenster). Ausgabe „isin,zeit,kurs,stueck“ (Zeit HH:MM:SS UTC).
 */
export function hebelZeilen(ziel: string[], csv: string, auswahl: Map<string, unknown>, kursstellungen: boolean): number {
  let n = 0;
  for (const zeile of csv.split('\n')) {
    const k = zeile.indexOf(',');
    if (k !== 12 || !auswahl.has(zeile.slice(0, 12))) continue;
    const [isin, zeit, waehrung, kursText, stueckText] = zeile.split(',');
    if (waehrung !== 'EUR') continue;
    const kurs = Number(kursText);
    const stueck = Number(stueckText);
    if (!(kurs > 0) || !(stueck >= 0)) continue;
    if (stueck === 0 && !kursstellungen) continue;
    ziel.push(`${isin},${zeit.slice(0, 8)},${kurs},${stueck}`);
    n++;
  }
  return n;
}
