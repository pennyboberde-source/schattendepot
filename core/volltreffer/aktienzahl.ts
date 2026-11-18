// F4 Squeeze-Paket (18.11.2026): Aktienzahl je US-Firma aus den SEC-XBRL-„frames“ (dei:EntityCommonStockSharesOutstanding,
// Deckblatt jeder 10-Q/10-K: „Zum <Tag> waren X Aktien ausstehend“). Eine Abfrage je Quartal liefert alle Firmen.
// Daraus im Rückblick: Aktienzahl (Streubesitz-Näherung), Börsenwert und Leerbestand in % der Aktien.
// Ohne Rückschaufehler: ein Wert gilt erst VERZUG Tage nach seinem Stichtag (Deckblatt-Datum liegt kurz vor der Einreichung).
// Reine Funktionen.

export interface AktienzahlArchiv {
  stand: string;
  /** abgerufene Quartals-Frames (z. B. CY2025Q3I) → Abrufzeit */
  frames: Record<string, string>;
  /** CIK → [Stichtag JJJJ-MM-TT, Aktien][] aufsteigend */
  je: Record<string, [string, number][]>;
}

/** Quartals-Frames (Stichtag am Quartalsende) von `ab` bis einschließlich des laufenden Quartals */
export function framesBis(ab: string, heute: string): string[] {
  const aus: string[] = [];
  let j = Number(ab.slice(0, 4));
  let q = Math.floor((Number(ab.slice(5, 7)) - 1) / 3) + 1;
  const jh = Number(heute.slice(0, 4));
  const qh = Math.floor((Number(heute.slice(5, 7)) - 1) / 3) + 1;
  while (j < jh || (j === jh && q <= qh)) {
    aus.push(`CY${j}Q${q}I`);
    q === 4 ? ((q = 1), j++) : q++;
  }
  return aus;
}

/** Antwort von /api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/<frame>.json → Einträge */
export function frameLesen(json: unknown): { cik: string; end: string; val: number }[] {
  const d = json as { data?: { cik?: number; end?: string; val?: number }[] };
  return (d.data ?? []).filter((x) => x.cik && x.end && Number(x.val) > 0).map((x) => ({ cik: String(x.cik), end: x.end!.slice(0, 10), val: Number(x.val) }));
}

/** Einträge ins Archiv übernehmen (gleicher Stichtag → neuester Wert gewinnt), aufsteigend sortiert */
export function frameEinarbeiten(a: AktienzahlArchiv, eintraege: { cik: string; end: string; val: number }[]): number {
  let neu = 0;
  for (const e of eintraege) {
    const l = a.je[e.cik] ?? (a.je[e.cik] = []);
    const i = l.findIndex((x) => x[0] === e.end);
    if (i >= 0) {
      if (l[i][1] !== e.val) l[i][1] = e.val;
      continue;
    }
    l.push([e.end, e.val]);
    neu++;
  }
  for (const l of Object.values(a.je)) l.sort((x, y) => x[0].localeCompare(y[0]));
  return neu;
}

const tagPlus = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Aktienzahl an einem Tag: jüngster Wert mit Stichtag + verzug ≤ datum, höchstens maxAlter Tage alt; null = unbekannt */
export function aktienzahlAm(liste: [string, number][] | undefined, datum: string, verzug = 10, maxAlter = 400): number | null {
  if (!liste?.length) return null;
  for (let i = liste.length - 1; i >= 0; i--) {
    const [end, val] = liste[i];
    if (tagPlus(end, verzug) > datum) continue;
    return tagPlus(end, maxAlter) >= datum ? val : null;
  }
  return null;
}
