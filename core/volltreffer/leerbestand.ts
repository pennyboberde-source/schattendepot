// Leerverkaufsbestand je US-Wert (FINRA Equity Short Interest, zwei Stichtage im Monat, frei abrufbar Jahre zurück;
// seit 16.11.2026): offene Leerverkaufspositionen zum Stichtag (settlement date), „Tage zum Eindecken“ (Bestand ÷ Ø
// Tagesumsatz, von FINRA gerechnet) und Änderung zum vorigen Stichtag – Squeeze-Gefahr für die Short-Muster.
// FINRA veröffentlicht 12–18 Tage nach dem Stichtag (montags gegen 11 Uhr UTC). Im Rückblick gilt eine Datei erst ab
// ihrem Veröffentlichungstag (Last-Modified der Datei, sonst Stichtag + 21 Tage) – nie früher, kein Rückschaufehler.
// Rohdaten nur privat im Archiv (leerbestand/JJJJ/JJJJ-MM-TT.csv.gz, Name = Stichtag). Reine Funktionen.

export interface LeerbestandZeile {
  bestand: number;
  /** Bestand zum vorigen Stichtag (null bei Split oder ohne Angabe) */
  vorher: number | null;
  adv: number | null;
  /** Tage zum Eindecken laut FINRA */
  tage: number | null;
}

const zahl = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === '') return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

/** FINRA-Datei shrtJJJJMMTT.csv (Spalten mit „|“, Werte in Anführungszeichen, Kopfzeile mit Namen) → Kürzel → Werte */
export function parseFinraShortInterest(text: string): Map<string, LeerbestandZeile> {
  const aus = new Map<string, LeerbestandZeile>();
  const zeilen = text.split(/\r?\n/);
  const kopf = (zeilen[0] ?? '').split('|').map((x) => x.replace(/"/g, '').trim());
  const sp = (n: string) => kopf.indexOf(n);
  const [iS, iB, iV, iA, iT, iSplit] = ['symbolCode', 'currentShortPositionQuantity', 'previousShortPositionQuantity', 'averageDailyVolumeQuantity', 'daysToCoverQuantity', 'stockSplitFlag'].map(sp);
  if (iS < 0 || iB < 0) return aus;
  for (const z of zeilen.slice(1)) {
    if (!z.trim()) continue;
    const t = z.split('|').map((x) => x.replace(/"/g, '').trim());
    const bestand = zahl(t[iB]);
    if (!t[iS] || bestand === null || bestand < 0) continue;
    const split = iSplit >= 0 && t[iSplit] !== '';
    // Kürzel wie bei Massive (BRK.B); FINRA schreibt Klassen mit Punkt, Leerzeichen oder Schrägstrich
    aus.set(t[iS].toUpperCase().replace(/[ /]/g, '.'), {
      bestand,
      vorher: split ? null : iV >= 0 ? zahl(t[iV]) : null,
      adv: iA >= 0 ? zahl(t[iA]) : null,
      tage: iT >= 0 ? zahl(t[iT]) : null,
    });
  }
  return aus;
}

/** Kompakt fürs Archiv: erste Zeile der Veröffentlichungszeitpunkt, dann Kürzel,Bestand,Vorher,Ø Umsatz,Tage */
export function leerbestandCsv(m: Map<string, LeerbestandZeile>, veroeffentlicht: string | null): string {
  const f = (x: number | null) => (x === null ? '' : String(x));
  const zeilen = [...m].sort((a, b) => a[0].localeCompare(b[0])).map(([s, v]) => `${s},${Math.round(v.bestand)},${f(v.vorher === null ? null : Math.round(v.vorher))},${f(v.adv === null ? null : Math.round(v.adv))},${f(v.tage)}`);
  return [`#veroeffentlicht=${veroeffentlicht ?? ''}`, 'kuerzel,bestand,vorher,adv,tage', ...zeilen].join('\n') + '\n';
}

/** Tage, die ein Stichtag spätestens nach dem Stichtag veröffentlicht gilt, wenn die Datei keine Zeit trägt */
export const ERSATZ_VERZUG_TAGE = 21;

const tagPlus = (datum: string, tage: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + tage * 86400000).toISOString().slice(0, 10);

/**
 * Archiv-CSV zurück → ab wann bekannt (Tag, UTC) und je Kürzel Tage zum Eindecken und Änderung des Bestands in %
 * (eine Nachkommastelle; null bei Split, ohne Vorwert oder Vorwert 0).
 */
export function leerbestandAusCsv(text: string, stichtag: string): { ab: string; werte: Map<string, { tage: number | null; aenderung: number | null; bestand: number }> } {
  const zeilen = text.split('\n');
  const v = /^#veroeffentlicht=(\S*)/.exec(zeilen[0] ?? '')?.[1] ?? '';
  const ab = /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : tagPlus(stichtag, ERSATZ_VERZUG_TAGE);
  const werte = new Map<string, { tage: number | null; aenderung: number | null; bestand: number }>();
  for (const z of zeilen.slice(zeilen[0]?.startsWith('#') ? 2 : 1)) {
    const [s, b, vo, , t] = z.split(',');
    const bestand = zahl(b);
    if (!s || bestand === null) continue;
    const vorher = zahl(vo);
    const tage = zahl(t);
    werte.set(s, { tage: tage === null ? null : Math.round(tage * 100) / 100, aenderung: vorher !== null && vorher > 0 ? Math.round(((bestand - vorher) / vorher) * 1000) / 10 : null, bestand });
  }
  // nie vor dem Stichtag selbst (falls Last-Modified fehlerhaft wäre)
  return { ab: ab < stichtag ? tagPlus(stichtag, ERSATZ_VERZUG_TAGE) : ab, werte };
}

/**
 * Welche Datei gilt an einem Stichtag des Rückblicks? Die mit dem jüngsten Stichtag, die an diesem Tag schon
 * veröffentlicht war (ab ≤ datum) und höchstens maxAlterTage alt ist; -1 = keine (unbekannt).
 * dateien: aufsteigend nach Stichtag.
 */
export function leerbestandDatei(dateien: { stichtag: string; ab: string }[], datum: string, maxAlterTage = 45): number {
  const grenze = tagPlus(datum, -maxAlterTage);
  for (let i = dateien.length - 1; i >= 0; i--) {
    const d = dateien[i];
    if (d.stichtag < grenze) return -1;
    if (d.ab <= datum) return i;
  }
  return -1;
}

/**
 * FINRA-Stichtage eines Monats nach der Regel „der 15. und der letzte Tag des Monats, fällt er nicht auf einen
 * Handelstag, der Handelstag davor“ – mit bis zu 4 früheren Handelstagen als Ersatz, falls FINRA abweicht.
 */
export function stichtagKandidaten(jahr: number, monat: number, istHandelstag: (d: string) => boolean): string[][] {
  const tag = (t: number) => `${jahr}-${String(monat).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const kandidaten = (start: string) => {
    const aus: string[] = [];
    for (let d = start; aus.length < 5 && d >= tag(1); d = tagPlus(d, -1)) if (istHandelstag(d)) aus.push(d);
    return aus;
  };
  return [kandidaten(tag(15)), kandidaten(tag(letzter))];
}
