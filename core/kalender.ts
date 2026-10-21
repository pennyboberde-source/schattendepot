// Zeit in Europe/Berlin, Handelstage (deutsche Börsenfeiertage) und Handelszeiten.
// GitHub-Cron läuft in UTC – Sommer-/Winterzeit wird hier über Intl korrekt behandelt.

const TZ = 'Europe/Berlin';
const teileFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const WOCHENTAG: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export interface BerlinZeit {
  jahr: number;
  monat: number;
  tag: number;
  stunde: number;
  minute: number;
  /** 1 = Montag … 7 = Sonntag */
  wochentag: number;
  /** "JJJJ-MM-TT" */
  datum: string;
  /** Minuten seit Mitternacht (Berliner Ortszeit) */
  minuten: number;
}

export function berlin(d: Date): BerlinZeit {
  const t: Record<string, string> = {};
  for (const p of teileFmt.formatToParts(d)) t[p.type] = p.value;
  const jahr = Number(t.year);
  const monat = Number(t.month);
  const tag = Number(t.day);
  const stunde = Number(t.hour);
  const minute = Number(t.minute);
  return {
    jahr,
    monat,
    tag,
    stunde,
    minute,
    wochentag: WOCHENTAG[t.weekday],
    datum: `${t.year}-${t.month}-${t.day}`,
    minuten: stunde * 60 + minute,
  };
}

/** "HH:MM" → Minuten seit Mitternacht. */
export function uhrzeitMinuten(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** UTC-Zeitpunkt zu Berliner Datum + Uhrzeit (berücksichtigt Sommer-/Winterzeit). */
export function berlinZuUtc(datum: string, hhmm = '00:00'): Date {
  const [j, mo, t] = datum.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  // Erst als UTC annehmen, dann um den Berliner Versatz zu diesem Zeitpunkt korrigieren (2 Durchläufe für Umstellungstage).
  let utc = Date.UTC(j, mo - 1, t, h, mi);
  for (let i = 0; i < 2; i++) {
    const b = berlin(new Date(utc));
    const istMinuten = Date.UTC(b.jahr, b.monat - 1, b.tag, b.stunde, b.minute);
    const sollMinuten = Date.UTC(j, mo - 1, t, h, mi);
    utc += sollMinuten - istMinuten;
  }
  return new Date(utc);
}

/** Ostersonntag (gregorianisch, Algorithmus nach Meeus/Jones/Butcher) als "JJJJ-MM-TT". */
export function ostersonntag(jahr: number): string {
  const a = jahr % 19;
  const b = Math.floor(jahr / 100);
  const c = jahr % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monat = Math.floor((h + l - 7 * m + 114) / 31);
  const tag = ((h + l - 7 * m + 114) % 31) + 1;
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(tag).padStart(2, '0')}`;
}

function verschiebe(datum: string, tage: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

/** Börsenfeiertage Tradegate/Xetra: Neujahr, Karfreitag, Ostermontag, 1. Mai, 24.–26.12., 31.12. */
export function boersenfeiertage(jahr: number): Set<string> {
  const ostern = ostersonntag(jahr);
  return new Set([
    `${jahr}-01-01`,
    verschiebe(ostern, -2),
    verschiebe(ostern, 1),
    `${jahr}-05-01`,
    `${jahr}-12-24`,
    `${jahr}-12-25`,
    `${jahr}-12-26`,
    `${jahr}-12-31`,
  ]);
}

export function istHandelstag(datum: string): boolean {
  const wt = new Date(`${datum}T12:00:00Z`).getUTCDay();
  if (wt === 0 || wt === 6) return false;
  return !boersenfeiertage(Number(datum.slice(0, 4))).has(datum);
}

export interface Handelszeit {
  von: string;
  bis: string;
}

/** Tradegate: 08:00–22:00 Uhr an Handelstagen. */
export const TRADEGATE: Handelszeit = { von: '08:00', bis: '22:00' };

export function inHandelszeit(d: Date, zeit: Handelszeit = TRADEGATE): boolean {
  const b = berlin(d);
  return istHandelstag(b.datum) && b.minuten >= uhrzeitMinuten(zeit.von) && b.minuten < uhrzeitMinuten(zeit.bis);
}

export function naechsterHandelstag(datum: string): string {
  let d = verschiebe(datum, 1);
  while (!istHandelstag(d)) d = verschiebe(d, 1);
  return d;
}

/** Handelstage zwischen zwei Daten (ohne Start, mit Ende). */
export function handelstageZwischen(von: string, bis: string): number {
  let n = 0;
  for (let d = verschiebe(von, 1); d <= bis; d = verschiebe(d, 1)) if (istHandelstag(d)) n++;
  return n;
}

/** Ist `jetzt` innerhalb der Ruhezeit (z. B. 22:30–07:00, über Mitternacht)? */
export function inRuhezeit(jetzt: Date, ruhe: { von: string; bis: string }): boolean {
  const m = berlin(jetzt).minuten;
  const von = uhrzeitMinuten(ruhe.von);
  const bis = uhrzeitMinuten(ruhe.bis);
  return von <= bis ? m >= von && m < bis : m >= von || m < bis;
}
