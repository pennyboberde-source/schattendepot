// Echte Handelbarkeit (Plan V1 „Liste der Basiswerte mit Turbos“, Quantensprung-Kandidat 2, 16.11.2026):
// Gibt es zu einer US-Aktie in Deutschland Hebelprodukte, und zwar in der Richtung des Musters (Call = long, Put = short)?
// Quelle: OpenFIGI-Suche (frei, ohne Schlüssel 5 Suchen je Minute) nach Optionsscheinen/Hebelprodukten an der Börse
// München (gettex). Bloomberg-Namen sehen so aus: „VONTOBE-PW27 SOUNDHOUND AI“, „GS     -CW27 PLUG POWER IN“
// (Emittent, CW/PW + Laufzeitjahr, gekürzter Name des Basiswerts). Abgelaufene Jahrgänge zählen nicht.
// Näherung: Ob es ein Knock-out oder ein klassischer Optionsschein ist, sagt der Name nicht – ein Emittent, der eine
// Aktie in einer Richtung abdeckt, bietet dort in aller Regel auch Turbos an. Reine Funktionen.

export interface TurboStand {
  /** Firmenname laut OpenFIGI (Kürzel an US-Börsen) */
  name: string;
  /** gültige Produkte (Laufzeitjahr ≥ heute) je Richtung, höchstens so viele, wie die gelesenen Seiten hergaben */
  long: number;
  short: number;
  emittenten: string[];
  /** Tag der Prüfung (JJJJ-MM-TT) */
  geprueft: string;
}

const ZUSATZ = /\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|LIMITED|PLC|HOLDINGS?|GROUP|SA|AG|NV|N V|SE|LP|L P|TRUST|CLASS [A-Z]|CL [A-Z]|ADR|SPON ADR|SPONSORED ADR|THE)\b/g;

/** Firmenname → Suchbegriff („SOUNDHOUND AI INC-A“ → „SOUNDHOUND AI“, „Plug Power Inc.“ → „PLUG POWER“) */
export function suchname(name: string): string {
  return name
    .toUpperCase()
    .replace(/-[A-Z]$/, '')
    .replace(/[.,&'()/]/g, ' ')
    .replace(/-/g, ' ')
    .replace(ZUSATZ, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const knapp = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * Passt der (gekürzte) Basiswert-Name eines Hebelprodukts zur Firma? Bloomberg kürzt den Namen (meist auf 13–15
 * Zeichen) – also muss einer der beiden Namen mit dem anderen beginnen, und zwar mit mindestens 4 Zeichen.
 */
export function namePasst(basiswert: string, firma: string): boolean {
  const a = knapp(basiswert);
  const b = knapp(suchname(firma));
  if (a.length < 4 || b.length < 4) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Name eines Hebelprodukts zerlegen: Emittent, Richtung, Laufzeitjahr (4-stellig), Basiswert */
export function produktLesen(name: string): { emittent: string; richtung: 'long' | 'short'; jahr: number; basiswert: string } | null {
  const m = /^(.+?)\s*-\s*([A-Z]{1,4})(\d{2})\s+(.+)$/.exec(name.replace(/\s+/g, ' ').trim());
  if (!m) return null;
  const art = m[2];
  // CW/C/TC… = Kaufoption (long), PW/P/TP… = Verkaufsoption (short); andere Kürzel (z. B. Zertifikate) zählen nicht
  const richtung = /^(CW|C|TC|MC|KC)$/.test(art) ? 'long' : /^(PW|P|TP|MP|KP)$/.test(art) ? 'short' : null;
  if (!richtung) return null;
  const yy = Number(m[3]);
  return { emittent: m[1].trim(), richtung, jahr: 2000 + yy, basiswert: m[4].trim() };
}

/** Suchtreffer (OpenFIGI data[].name) zu einem Stand zusammenfassen: nur passende Namen und gültige Jahrgänge */
export function turboStand(namen: string[], firma: string, heute: string): TurboStand {
  const jahr = Number(heute.slice(0, 4));
  let long = 0;
  let short = 0;
  const emittenten = new Set<string>();
  for (const n of namen) {
    const p = produktLesen(n);
    if (!p || p.jahr < jahr || !namePasst(p.basiswert, firma)) continue;
    if (p.richtung === 'long') long++;
    else short++;
    emittenten.add(p.emittent);
  }
  return { name: firma, long, short, emittenten: [...emittenten].sort(), geprueft: heute };
}

/** Gibt es ein Produkt in der Richtung der Spielart? null = noch nicht geprüft (dann gilt die Umsatz-Näherung) */
export function turboDa(stand: TurboStand | undefined, richtung: 'long' | 'short'): boolean | null {
  if (!stand) return null;
  return richtung === 'long' ? stand.long > 0 : stand.short > 0;
}

/** Muss neu geprüft werden? (nie geprüft oder älter als gueltigTage) */
export function pruefenFaellig(stand: TurboStand | undefined, heute: string, gueltigTage: number): boolean {
  if (!stand) return true;
  return (Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${stand.geprueft}T12:00:00Z`)) / 86400000 >= gueltigTage;
}
