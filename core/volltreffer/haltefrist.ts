// Haltefrist im Vorwärtstest (17.11.2026): Ein Muster wird erst beendet, wenn es an mehreren Rückblick-Tagen in Folge
// nicht mehr mit Vorteil besteht. Sonst wechselte der Vorwärtstest täglich fast vollständig (17.11.: 55 beendet, 55 neu)
// und kein Muster sammelte je genug Fälle für die Beförderung (V6). Reine Funktion.

export interface Haltefrist {
  /** je Muster-Schlüssel die Tage (JJJJ-MM-TT), an denen es in Folge verfehlt hat */
  verfehlt: Record<string, string[]>;
}

/** Zählstand fortschreiben: wer heute verfehlt, bekommt den Tag dazu; wer besteht oder nicht mehr im Test ist, fällt heraus. */
export function haltefristFortschreiben(alt: Haltefrist, imTest: string[], verfehlt: string[], heute: string): Haltefrist {
  const v = new Set(verfehlt);
  const neu: Record<string, string[]> = {};
  for (const k of imTest) if (v.has(k)) neu[k] = [...new Set([...(alt.verfehlt?.[k] ?? []), heute])];
  return { verfehlt: neu };
}
