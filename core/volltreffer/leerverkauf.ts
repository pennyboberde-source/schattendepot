// Leerverkaufsvolumen je Aktie und Tag (FINRA Reg SHO Daily Short Sale Volume, frei abrufbar, Jahre zurück; seit
// 16.11.2026): Anteil der Leerverkäufe am gemeldeten Umsatz. Merkmale im Rückblick: der Anteil am Stichtag und seine
// Abweichung vom eigenen 20-Tage-Schnitt (plötzlich viel mehr Leerverkäufe = Druck oder Squeeze-Treibstoff).
// Rohdaten nur privat im Archiv (leerverkauf/JJJJ-MM-TT.csv.gz). Reine Funktionen.

/** Eine FINRA-Datei (CNMSshvolJJJJMMTT.txt: Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market) → Kürzel → Anteil */
export function parseFinraShvol(text: string): Map<string, { short: number; total: number }> {
  const aus = new Map<string, { short: number; total: number }>();
  for (const z of text.split(/\r?\n/)) {
    const t = z.split('|');
    if (t.length < 5 || !/^\d{8}$/.test(t[0])) continue;
    const short = Number(t[2]);
    const total = Number(t[4]);
    if (!t[1] || !Number.isFinite(short) || !Number.isFinite(total) || total <= 0) continue;
    // Kürzel wie bei Massive (BRK.B); FINRA schreibt Klassen mit Punkt oder Leerzeichen
    aus.set(t[1].trim().toUpperCase().replace(/[ /]/g, '.'), { short, total });
  }
  return aus;
}

/** Kompakt fürs Archiv: Kürzel,Leerverkauf,Umsatz (ganze Stück) */
export function leerverkaufCsv(m: Map<string, { short: number; total: number }>): string {
  const zeilen = [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([s, v]) => `${s},${Math.round(v.short)},${Math.round(v.total)}`);
  return ['kuerzel,leerverkauf,umsatz', ...zeilen].join('\n') + '\n';
}

/** Archiv-CSV zurück → Kürzel → Anteil der Leerverkäufe in % (eine Nachkommastelle) */
export function leerquotenAusCsv(text: string): Map<string, number> {
  const aus = new Map<string, number>();
  for (const z of text.split('\n').slice(1)) {
    const [s, a, b] = z.split(',');
    const short = Number(a);
    const total = Number(b);
    if (s && total > 0 && Number.isFinite(short)) aus.set(s, Math.round((short / total) * 1000) / 10);
  }
  return aus;
}

/**
 * Je Stichtag (Kerzendaten einer Reihe, aufsteigend): Leerverkaufsanteil am Tag und Abweichung vom Schnitt der 20 Tage
 * davor (Prozentpunkte; erst ab 10 Vortagen mit Daten). Nur Vergangenes und der Stichtag selbst (FINRA veröffentlicht
 * die Datei am Abend des Handelstags).
 */
export function leerquotenReihe(daten: string[], quoteAm: (datum: string) => number | undefined): { quote: (number | null)[]; abweichung: (number | null)[] } {
  const quote = daten.map((d) => quoteAm(d) ?? null);
  const abweichung = quote.map((q, i) => {
    if (q === null) return null;
    const vor = quote.slice(Math.max(0, i - 20), i).filter((x): x is number => x !== null);
    if (vor.length < 10) return null;
    return Math.round((q - vor.reduce((a, b) => a + b, 0) / vor.length) * 10) / 10;
  });
  return { quote, abweichung };
}

/** Dateiname bei FINRA für einen Tag (JJJJ-MM-TT) */
export const finraDatei = (datum: string) => `CNMSshvol${datum.replace(/-/g, '')}.txt`;
