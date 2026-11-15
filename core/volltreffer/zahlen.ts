// Zahlen-Termine und Branchen aus den amtlichen SEC-Meldungen (EDGAR, frei abrufbar, ohne Schlüssel): Jede US-Firma
// meldet ihre Quartalszahlen per Formular 8-K mit Punkt 2.02 („Results of Operations and Financial Condition“) – mit
// Annahmezeit, also vor oder nach Börse. Dazu liefert EDGAR je Firma den Branchen-Code (SIC). Reine Funktionen.

/** Gespeicherter Stand (privat: stamm/us-zahlen.json.gz) */
export interface ZahlenArchiv {
  stand: string;
  /** Meldungen ab diesem Tag sind vollständig erfasst */
  ab: string;
  /** letzter Tag, dessen EDGAR-Tagesverzeichnis nachgefasst wurde */
  tageBis?: string;
  firmen: Record<string, ZahlenFirma>;
}
export interface ZahlenFirma {
  tickers: string[];
  sic: number | null;
  /** Tag des letzten Abrufs der Meldungen dieser Firma (fehlt = noch nie) */
  geholt?: string;
  /** Zahlen-Meldungen: [Tag, Uhrzeit US-Ostküste HH:MM] */
  zahlen: [string, string][];
  /** Stand der Meldungsarten beim letzten Abruf (fehlt oder kleiner als MELDUNGEN_STUFE = Meldungsarten noch nicht erfasst) */
  stufe?: number;
  /** weitere Meldungen je Art (siehe MELDUNG_ARTEN): [Tag, Uhrzeit US-Ostküste] */
  meldungen?: Record<string, [string, string][]>;
}

/**
 * Weitere Meldungsarten aus denselben EDGAR-Antworten (seit 16.11.2026). Jede wird im Rückblick ein Merkmal „Handelstage
 * seit der letzten Meldung dieser Art“. Kapitalerhöhungen verwässern (Kandidat für Short-Muster), Großaktionäre und
 * Großverträge sind Kandidaten für Long-Muster, Warnungen (Insolvenz, Delisting-Hinweis, Bilanzkorrektur, Abschreibung)
 * für beides. Berichtigungen (…/A) zählen nicht.
 */
export const MELDUNG_ARTEN = ['angebot', 'registrierung', 'grossaktionaer', 'vertrag', 'warnung', 'fuehrung', 'satzung'] as const;
export type MeldungArt = (typeof MELDUNG_ARTEN)[number];
/** Erhöhen, wenn sich die Arten ändern: dann holt der Archivlauf alle Firmen einmal neu */
export const MELDUNGEN_STUFE = 1;
const ANGEBOT = new Set(['424B1', '424B3', '424B4', '424B5', '424B7']);
const REGISTRIERUNG = new Set(['S-1', 'S-3', 'F-1', 'F-3']);
const GROSSAKTIONAER = new Set(['SC 13D', 'SCHEDULE 13D']);
/** Formulare, die im EDGAR-Tagesverzeichnis ein Nachfassen auslösen */
export const NACHFASS_FORMULARE = new Set(['8-K', ...ANGEBOT, ...REGISTRIERUNG, ...GROSSAKTIONAER]);

/** Meldungsarten eines Formulars (8-K nach Punkten) */
export function meldungsArten(form: string, items: string): MeldungArt[] {
  if (ANGEBOT.has(form)) return ['angebot'];
  if (REGISTRIERUNG.has(form)) return ['registrierung'];
  if (GROSSAKTIONAER.has(form)) return ['grossaktionaer'];
  if (form !== '8-K') return [];
  const p = new Set(items.split(',').map((x) => x.trim()));
  const aus: MeldungArt[] = [];
  if (p.has('1.01')) aus.push('vertrag');
  if (p.has('1.03') || p.has('2.06') || p.has('3.01') || p.has('4.02')) aus.push('warnung');
  if (p.has('5.02')) aus.push('fuehrung');
  if (p.has('5.03')) aus.push('satzung');
  return aus;
}

/** company_tickers.json der SEC → Kürzel (Schreibweise wie bei Massive: BRK.B) je CIK */
export function secTickerKarte(json: unknown): Map<string, string[]> {
  const karte = new Map<string, string[]>();
  if (!json || typeof json !== 'object') return karte;
  for (const e of Object.values(json as Record<string, { cik_str?: number; ticker?: string }>)) {
    if (!e || typeof e.cik_str !== 'number' || typeof e.ticker !== 'string') continue;
    const cik = String(e.cik_str);
    const t = e.ticker.toUpperCase().replace(/-/g, '.');
    const l = karte.get(cik) ?? karte.set(cik, []).get(cik)!;
    if (!l.includes(t)) l.push(t);
  }
  return karte;
}

interface Spalten {
  filingDate?: string[];
  acceptanceDateTime?: string[];
  form?: string[];
  items?: string[];
}

/**
 * Tag und Uhrzeit der Annahme an der US-Ostküste. `zone` sagt, wie EDGAR die Zeit angibt: 'ET' = Ortszeit (das „Z“ am
 * Ende ist dann nur Schreibweise), 'UTC' = echte Weltzeit, die umgerechnet wird.
 */
export function ostkuestenZeitpunkt(annahme: string, zone: 'ET' | 'UTC'): { datum: string; zeit: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(annahme ?? '');
  if (!m) return null;
  if (zone === 'ET') return { datum: m[1], zeit: `${m[2]}:${m[3]}` };
  const d = new Date(annahme);
  if (Number.isNaN(d.getTime())) return null;
  const teile = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const wert = (t: string) => teile.find((p) => p.type === t)?.value ?? '00';
  return { datum: `${wert('year')}-${wert('month')}-${wert('day')}`, zeit: `${wert('hour')}:${wert('minute')}` };
}

/** Zahlen-Meldungen (8-K mit Punkt 2.02, ohne Berichtigungen 8-K/A) aus den Spalten einer EDGAR-Antwort, ab einem Tag */
export function zahlenAusSpalten(s: Spalten, ab: string, zone: 'ET' | 'UTC'): [string, string][] {
  const aus: [string, string][] = [];
  const n = s.form?.length ?? 0;
  for (let i = 0; i < n; i++) {
    if (s.form![i] !== '8-K') continue;
    const datum = s.filingDate?.[i];
    if (!datum || datum < ab) continue;
    const punkte = (s.items?.[i] ?? '').split(',').map((x) => x.trim());
    if (!punkte.includes('2.02')) continue;
    // maßgeblich ist der Zeitpunkt der Annahme (nach 17:30 Eingereichtes trägt schon den nächsten Tag als Einreichungstag);
    // ohne Annahmezeit: Einreichungstag, vorbörslich angenommen
    const z = ostkuestenZeitpunkt(s.acceptanceDateTime?.[i] ?? '', zone);
    aus.push(z ? [z.datum, z.zeit] : [datum, '08:00']);
  }
  return aus;
}

/** Weitere Meldungen je Art (MELDUNG_ARTEN) aus den Spalten einer EDGAR-Antwort, ab einem Tag */
export function meldungenAusSpalten(s: Spalten, ab: string, zone: 'ET' | 'UTC'): Partial<Record<MeldungArt, [string, string][]>> {
  const aus: Partial<Record<MeldungArt, [string, string][]>> = {};
  const n = s.form?.length ?? 0;
  for (let i = 0; i < n; i++) {
    const datum = s.filingDate?.[i];
    if (!datum || datum < ab) continue;
    const arten = meldungsArten(s.form![i], s.items?.[i] ?? '');
    if (!arten.length) continue;
    const z = ostkuestenZeitpunkt(s.acceptanceDateTime?.[i] ?? '', zone);
    const eintrag: [string, string] = z ? [z.datum, z.zeit] : [datum, '08:00'];
    for (const a of arten) (aus[a] ??= []).push(eintrag);
  }
  return aus;
}

/** Antwort von data.sec.gov/submissions/CIK##########.json: Branchen-Code, Zahlen- und weitere Meldungen, ältere Seiten (falls nötig) */
export function parseSubmissions(
  json: unknown,
  ab: string,
  zone: 'ET' | 'UTC',
): { sic: number | null; zahlen: [string, string][]; meldungen: Partial<Record<MeldungArt, [string, string][]>>; weitere: string[] } | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as { sic?: string | number; filings?: { recent?: Spalten; files?: { name?: string; filingFrom?: string; filingTo?: string }[] } };
  if (!j.filings?.recent) return null;
  const sicZahl = Number(j.sic);
  return {
    sic: Number.isFinite(sicZahl) && sicZahl > 0 ? sicZahl : null,
    zahlen: zahlenAusSpalten(j.filings.recent, ab, zone),
    meldungen: meldungenAusSpalten(j.filings.recent, ab, zone),
    weitere: (j.filings.files ?? []).filter((f) => f.name && (f.filingTo ?? '9999') >= ab).map((f) => f.name!),
  };
}

/** Ältere Seite (CIK##########-submissions-001.json): dieselben Spalten auf oberster Ebene */
export const zahlenAusSeite = (json: unknown, ab: string, zone: 'ET' | 'UTC') => (json && typeof json === 'object' ? zahlenAusSpalten(json as Spalten, ab, zone) : []);
export const meldungenAusSeite = (json: unknown, ab: string, zone: 'ET' | 'UTC') => (json && typeof json === 'object' ? meldungenAusSpalten(json as Spalten, ab, zone) : {});

/** EDGAR-Tagesverzeichnis form.JJJJMMTT.idx → CIKs mit einem der Formulare an diesem Tag (Standard: nur 8-K) */
export function ciksAusTagesverzeichnis(text: string, formulare: Set<string> = new Set(['8-K'])): string[] {
  const ciks = new Set<string>();
  for (const z of text.split('\n')) {
    // Formular-Spalte: die ersten 12 Zeichen (kann Leerzeichen enthalten, „SC 13D“); längere Namen laufen über – dann
    // kann eine Berichtigung mitgezählt werden, das kostet nur einen Abruf (genau gelesen wird die Firmen-Antwort)
    const m = /\s(\d{1,10})\s+(\d{8}|\d{4}-\d{2}-\d{2})\s+\S+\s*$/.exec(z);
    if (m && formulare.has(z.slice(0, 12).trim())) ciks.add(String(Number(m[1])));
  }
  return [...ciks];
}
export const achtKAusTagesverzeichnis = (text: string) => ciksAusTagesverzeichnis(text);

/** Meldungen zusammenführen (nur wachsen, sortiert, ohne Doppel) */
export function zahlenVereinen(alt: [string, string][], neu: [string, string][]): [string, string][] {
  const m = new Map(alt.map((z) => [z[0], z]));
  for (const z of neu) if (!m.has(z[0]) || m.get(z[0])![1] > z[1]) m.set(z[0], z);
  return [...m.values()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** Meldungen je Art zusammenführen (je Art wie zahlenVereinen) */
export function meldungenVereinen(alt: Record<string, [string, string][]>, neu: Partial<Record<string, [string, string][]>>): Record<string, [string, string][]> {
  const aus: Record<string, [string, string][]> = { ...alt };
  for (const [art, liste] of Object.entries(neu)) if (liste?.length) aus[art] = zahlenVereinen(aus[art] ?? [], liste);
  return aus;
}

/** Börsenschluss US-Ostküste: Meldungen bis 16:00 wirken am selben Handelstag, spätere am nächsten */
const SCHLUSS = '16:00';

/**
 * Abstand in Handelstagen zwischen jedem Stichtag (Kerzendaten der Reihe, aufsteigend) und dem letzten Reaktionstag auf
 * Zahlen. 0 = der Stichtag selbst ist der Reaktionstag (Zahlen vorbörslich, im Handel oder am Vorabend nach Schluss),
 * 1 = Vortag usw.; `ohne` (Standard 99), wenn binnen `max` Handelstagen keine Zahlen kamen; null vor `ab` (keine Daten).
 * Nur Vergangenes zählt – künftige Termine fließen nicht ein.
 */
export function zahlenAbstaende(daten: string[], zahlen: [string, string][], ab: string, max = 60, ohne = 99): (number | null)[] {
  // Reaktionstag je Meldung: erster Handelstag am Meldetag (vor Schluss) bzw. danach (nach Schluss)
  const reaktion = new Set<number>();
  let j = 0;
  for (const [datum, zeit] of [...zahlen].sort((a, b) => a[0].localeCompare(b[0]))) {
    const nach = zeit >= SCHLUSS;
    while (j < daten.length && (daten[j] < datum || (nach && daten[j] === datum))) j++;
    if (j < daten.length) reaktion.add(j);
  }
  const aus: (number | null)[] = [];
  let letzte = -1;
  for (let i = 0; i < daten.length; i++) {
    if (reaktion.has(i)) letzte = i;
    if (daten[i] < ab) aus.push(null);
    else aus.push(letzte >= 0 && i - letzte <= max ? i - letzte : ohne);
  }
  return aus;
}

/** Branchen aus dem SIC-Code (grob, für das Merkmal „Branche“) */
export const BRANCHEN = ['Pharma/Biotech', 'Medizintechnik/Gesundheit', 'Technologie', 'Finanzen/Immobilien', 'SPAC/Mantelgesellschaft', 'Energie/Rohstoffe', 'Sonstige'] as const;
export function brancheAusSic(sic: number | null | undefined): number | null {
  if (!sic) return null;
  if ((sic >= 2830 && sic <= 2836) || sic === 8731) return 0;
  if ((sic >= 3840 && sic <= 3851) || (sic >= 8000 && sic <= 8099)) return 1;
  if ((sic >= 3570 && sic <= 3579) || (sic >= 3600 && sic <= 3699) || (sic >= 7370 && sic <= 7379)) return 2;
  if (sic === 6770) return 4;
  if (sic >= 6000 && sic <= 6799) return 3;
  if ((sic >= 1000 && sic <= 1499) || (sic >= 2900 && sic <= 2999)) return 5;
  return 6;
}

/** Meldungsarten dieser Firma vollständig erfasst? (sonst gilt das Merkmal als unbekannt, nicht als „keine Meldung“) */
export const meldungenErfasst = (f: ZahlenFirma | undefined): boolean => !!f?.geholt && (f.stufe ?? 0) >= MELDUNGEN_STUFE;

/** Kürzel → Firma (für den Rückblick) */
export function firmaJeTicker(a: ZahlenArchiv): Map<string, ZahlenFirma> {
  const m = new Map<string, ZahlenFirma>();
  for (const f of Object.values(a.firmen)) if (f.geholt) for (const t of f.tickers) m.set(t, f);
  return m;
}
