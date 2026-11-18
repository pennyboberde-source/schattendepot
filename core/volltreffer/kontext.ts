// Kontext-Geschichte (Quantensprung 3, Nutzer 18.11.2026: „Kursbewegungen der letzten 2 Jahre der wirtschaftlichen,
// politischen und allgemeinen Lage zuordnen – und das auch jetzt permanent; kostenlose Quellen mit Rückblick; kreativ,
// nicht nur Wirtschaft und Politik“). Vier freie Quellen, alle mit Geschichte und laufend abrufbar:
//   1. GDELT DOC 2.0 (Nachrichten weltweit, 65 Sprachen, durchsuchbar ab 2017): Tagesvolumen je Thema (Zölle, Krieg,
//      Fed, Pleiten, Hacks, Seuchen, Stürme, KI, Krypto, FDA …) – „Worüber spricht die Welt?“
//   2. Wikipedia-Seitenaufrufe (ab 2015, je Artikel und Tag): Aufmerksamkeit je Firma/Coin – Studien zeigen, dass
//      Aufmerksamkeits-Spitzen großen Bewegungen vorausgehen oder sie begleiten.
//   3. Wikipedia „Portal:Current events“ (täglich von Menschen zusammengefasstes Weltgeschehen): Kategorien,
//      Schlagzeilen, Firmen-Erwähnungen – lesbar für Claude und als Zählung für den Code.
//   4. Federal Register (US-Amtsblatt, ab 1994): Präsidenten-Erlasse, Zölle, Sanktionen, Exportkontrollen je Tag.
// Reine Funktionen (Lesen der Antworten, Spitzen, Zuordnung); Abruf in jobs/archiv.ts, Merkmale in jobs/rueckblick.ts.

export interface Thema {
  id: string;
  name: string;
  /** GDELT-Suchausdruck (OR nur in Klammern, Phrasen in Anführungszeichen, Wörter ab 3 Buchstaben) */
  gdelt: string;
  /** politisch (fließt in den Politik-Druck) */
  politik?: boolean;
  /** SIC-Bereiche der Branchen, für die das Thema Rücken- oder Gegenwind ist */
  sic?: [number, number][];
  /** gilt für Coins */
  krypto?: boolean;
}

/** Tageswerte einer Reihe: Datum (JJJJ-MM-TT) → Wert */
export type Tagesreihe = Record<string, number>;

const datumAus = (s: string): string | null => {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/**
 * GDELT DOC 2.0, mode=timelinevolraw (oder timelinevol), format=json. Antwort: { timeline: [{ series, data: [{ date:
 * "20250105T000000Z", value, norm? }] }] }. Mehrere Punkte je Tag (bei kurzen Zeiträumen) werden addiert. Rückgabe:
 * Treffer je Tag und – falls geliefert – alle beobachteten Artikel des Tages (norm), damit Wachstum der Quellenbasis
 * nicht als Themen-Spitze erscheint.
 */
export function gdeltLesen(json: unknown): { treffer: Tagesreihe; gesamt: Tagesreihe } {
  const treffer: Tagesreihe = {};
  const gesamt: Tagesreihe = {};
  const tl = (json as { timeline?: { data?: { date?: string; value?: number; norm?: number }[] }[] } | null)?.timeline ?? [];
  for (const s of tl.slice(0, 1))
    for (const p of s.data ?? []) {
      const d = datumAus(String(p.date ?? ''));
      if (!d || typeof p.value !== 'number' || !Number.isFinite(p.value)) continue;
      treffer[d] = (treffer[d] ?? 0) + p.value;
      if (typeof p.norm === 'number' && Number.isFinite(p.norm)) gesamt[d] = (gesamt[d] ?? 0) + p.norm;
    }
  return { treffer, gesamt };
}

/** Wikimedia REST pageviews per-article (daily): { items: [{ timestamp: "2025010500", views }] } */
export function aufrufeLesen(json: unknown): Tagesreihe {
  const out: Tagesreihe = {};
  for (const it of (json as { items?: { timestamp?: string; views?: number }[] } | null)?.items ?? []) {
    const d = datumAus(String(it.timestamp ?? ''));
    if (d && typeof it.views === 'number') out[d] = it.views;
  }
  return out;
}

/**
 * Wikidata-SPARQL (JSON): Zeilen mit ticker und artikel (URL des englischen Wikipedia-Artikels). Ergebnis: Kürzel →
 * Artikel-Titel (wie in der URL, z. B. „Nvidia“). Mehrdeutige Kürzel (zwei Firmen) fallen weg.
 */
export function wikidataKuerzel(json: unknown): Record<string, string> {
  const je = new Map<string, Set<string>>();
  for (const b of (json as { results?: { bindings?: Record<string, { value?: string }>[] } } | null)?.results?.bindings ?? []) {
    const t = b.ticker?.value?.trim().toUpperCase();
    const url = b.artikel?.value ?? '';
    const titel = decodeURIComponent(url.split('/wiki/')[1] ?? '');
    if (!t || !titel || !/^[A-Z0-9.\-]{1,10}$/.test(t)) continue;
    (je.get(t) ?? je.set(t, new Set()).get(t)!).add(titel);
  }
  const out: Record<string, string> = {};
  for (const [t, s] of je) if (s.size === 1) out[t] = [...s][0];
  return out;
}

export interface Ereignis {
  /** Kategorie wie im Portal (z. B. „Business and economy“, „Armed conflicts and attacks“) */
  k: string;
  /** Text ohne Wiki-Auszeichnung */
  t: string;
}

/** Wiki-Auszeichnung entfernen: [[Ziel|Text]] → Text, [[Ziel]] → Ziel, Vorlagen, Verweise, Fett/Kursiv */
export function wikiText(s: string): string {
  return s
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\[https?:\/\/\S+\s+([^\]]+)\]/g, '')
    .replace(/\[https?:\/\/[^\]]+\]/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Wikitext einer Tagesseite des Portals „Current events“ → Ereignisse je Kategorie. Kategorien stehen als
 * „'''Name'''“ oder „;Name“ in einer eigenen Zeile, Einträge als Aufzählung (*, **). Übergeordnete Punkte (nur ein
 * Verweis auf das Großthema) werden dem Text der Unterpunkte vorangestellt.
 */
export function weltgeschehenLesen(wikitext: string): Ereignis[] {
  const out: Ereignis[] = [];
  let k = '';
  const oben: string[] = [];
  for (const roh of wikitext.split('\n')) {
    const z = roh.trim();
    const kat = /^(?:'''([^']+)'''|;\s*(.+))$/.exec(z);
    if (kat) {
      k = wikiText(kat[1] ?? kat[2] ?? '');
      oben.length = 0;
      continue;
    }
    const m = /^(\*+)\s*(.*)$/.exec(z);
    if (!m || !k) continue;
    const tiefe = m[1].length;
    const text = wikiText(m[2]);
    if (!text) continue;
    oben.length = tiefe - 1;
    oben[tiefe - 1] = text;
    // Ein Punkt ist ein Ereignis, wenn er ein Satz ist (Verb, mindestens 6 Wörter) – Großthemen-Zeilen nicht
    if (text.split(' ').length >= 6) out.push({ k, t: [...oben.slice(0, tiefe - 1).filter((x) => x.split(' ').length < 6), text].join(' – ').slice(0, 400) });
  }
  return out;
}

/** Federal Register facets/daily: { "2025-01-05": { count, name } } oder { "2025-01-05": count } */
export function amtsblattLesen(json: unknown): Tagesreihe {
  const out: Tagesreihe = {};
  if (!json || typeof json !== 'object') return out;
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    const d = datumAus(k);
    const n = typeof v === 'number' ? v : typeof (v as { count?: unknown })?.count === 'number' ? (v as { count: number }).count : null;
    if (d && n !== null) out[d] = n;
  }
  return out;
}

const tagPlus = (datum: string, tage: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + tage * 86400000).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Spitze: Wert am Tag (bzw. das Höchste der letzten `tage` Tage bis einschließlich datum) geteilt durch den Median der
 * `fenster` Kalendertage davor (+1 gegen Null). `null`, wenn weniger als die Hälfte der Vortage Werte hat.
 * Mit `gesamt` wird je Tag zuerst durch das Gesamtvolumen geteilt (Anteil statt Anzahl).
 */
export function spitze(reihe: Tagesreihe | undefined, datum: string, fenster = 30, tage = 1, gesamt?: Tagesreihe): number | null {
  if (!reihe) return null;
  const wert = (d: string) => {
    const v = reihe[d];
    if (v === undefined) return undefined;
    if (!gesamt) return v + 1;
    const g = gesamt[d];
    return g ? ((v + 1) / g) * 1e6 : undefined;
  };
  const vor: number[] = [];
  for (let i = tage; i < tage + fenster; i++) {
    const v = wert(tagPlus(datum, -i));
    if (v !== undefined) vor.push(v);
  }
  if (vor.length < fenster / 2) return null;
  let jetzt: number | undefined;
  for (let i = 0; i < tage; i++) {
    const v = wert(tagPlus(datum, -i));
    if (v !== undefined) jetzt = Math.max(jetzt ?? -Infinity, v);
  }
  const m = median(vor);
  return jetzt === undefined || !m ? null : Math.round((jetzt / m) * 100) / 100;
}

export const sicPasst = (sic: number | null | undefined, bereiche: [number, number][] | undefined) => !!sic && !!bereiche?.some(([a, b]) => sic >= a && sic <= b);

/** Themen, die ein Wert spürt: über die SIC-Branche (Aktien) bzw. als Coin */
export function themenFuer(themen: Thema[], markt: 'aktie' | 'krypto', sic: number | null | undefined): Thema[] {
  return themen.filter((t) => (markt === 'krypto' ? t.krypto : sicPasst(sic, t.sic)));
}

/** Firmennamen für die Suche im Weltgeschehen: Rechtsform weg, mindestens 5 Zeichen, nicht zu allgemein */
export function suchName(titel: string): string | null {
  const n = titel
    .replace(/[,.]/g, ' ')
    .replace(/\b(inc|corp|corporation|co|company|ltd|plc|holdings?|group|n\s?v|s\s?a|ag|se|lp|llc|class [a-z]|the|trust|fund|etf|technologies|international)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (n.length < 5 || /^(first|american|united|general|global|national|new|international|energy|capital|bank)$/i.test(n)) return null;
  return n;
}

/** Tage seit der letzten Erwähnung (0 = am Stichtag) innerhalb von `max` Tagen, sonst null */
export function tageSeitErwaehnung(erwaehnt: Set<string> | undefined, datum: string, max = 20): number | null {
  if (!erwaehnt) return null;
  for (let i = 0; i <= max; i++) if (erwaehnt.has(tagPlus(datum, -i))) return i;
  return null;
}

/** Klasse einer Spitze für Texte: ruhig / erhöht / Welle / Sturm */
export function spitzenKlasse(x: number | null): 'unbekannt' | 'ruhig' | 'erhöht' | 'Welle' | 'Sturm' {
  if (x === null) return 'unbekannt';
  return x >= 4 ? 'Sturm' : x >= 2 ? 'Welle' : x >= 1.4 ? 'erhöht' : 'ruhig';
}

/** Kalendertage von `ab` bis `bis` (einschließlich) */
export function kalenderTage(ab: string, bis: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${ab}T12:00:00Z`), e = Date.parse(`${bis}T12:00:00Z`); t <= e; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/**
 * Wie `spitze`, aber für alle Tage einer Reihe auf einmal (schnell, für den Rückblick): Werte je Kalendertag
 * (NaN = fehlt), optional Gesamtvolumen je Tag. Ergebnis je Tag die Spitze oder NaN.
 */
export function spitzenFolge(werte: Float64Array, fenster = 30, tage = 1, gesamt?: Float64Array): Float32Array {
  const n = werte.length;
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const v = werte[i];
    if (Number.isNaN(v)) w[i] = NaN;
    else if (!gesamt) w[i] = v + 1;
    else w[i] = gesamt[i] ? ((v + 1) / gesamt[i]) * 1e6 : NaN;
  }
  const out = new Float32Array(n).fill(NaN);
  const puffer: number[] = [];
  for (let i = 0; i < n; i++) {
    puffer.length = 0;
    for (let j = i - tage - fenster + 1; j <= i - tage; j++) if (j >= 0 && !Number.isNaN(w[j])) puffer.push(w[j]);
    if (puffer.length < fenster / 2) continue;
    let jetzt = -Infinity;
    for (let j = i - tage + 1; j <= i; j++) if (j >= 0 && !Number.isNaN(w[j])) jetzt = Math.max(jetzt, w[j]);
    if (jetzt === -Infinity) continue;
    puffer.sort((a, b) => a - b);
    const m = puffer.length >> 1;
    const med = puffer.length % 2 ? puffer[m] : (puffer[m - 1] + puffer[m]) / 2;
    if (med) out[i] = Math.round((jetzt / med) * 100) / 100;
  }
  return out;
}

/** Tagesreihe → Werte je Kalendertag (NaN = fehlt) */
export function alsFolge(reihe: Tagesreihe | undefined, tage: string[]): Float64Array {
  const f = new Float64Array(tage.length).fill(NaN);
  if (reihe) tage.forEach((d, i) => {
    const v = reihe[d];
    if (v !== undefined) f[i] = v;
  });
  return f;
}
