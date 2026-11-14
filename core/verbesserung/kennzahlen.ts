// Kennzahlen der Selbstverbesserung: eine kleine, feste Liste messbarer Größen. Jede übernommene Änderung nennt
// eine davon als Messkriterium; der Code schreibt sie täglich fort (lernen/verbesserung/kennzahlen.json) und
// bewertet nach 2 bis 4 Wochen, ob die Änderung gewirkt hat. Claude rechnet hier nichts.
import type { DtUebersicht } from '../daytrading/auswertung.ts';
import type { Statistik, TrackingEintrag } from '../statistik.ts';
import type { Aenderung, Leitplanken, ProtokollEintrag } from './typen.ts';

export interface KennzahlDef {
  name: string;
  einheit: string;
  /** stand = Wert des Tages (Mittel über ein Fenster), summe = laufende Summe (Veränderung je Tag) */
  art: 'stand' | 'summe';
}

export const KENNZAHLEN: Record<string, KennzahlDef> = {
  'schattenbuch.startkursQuote': { name: 'Tageskandidaten mit Startkurs', einheit: '%', art: 'stand' },
  'schattenbuch.messungen1W': { name: 'Schattenbuch: 1-Wochen-Messungen', einheit: 'Messungen', art: 'summe' },
  'schattenbuch.quote1T': { name: 'Schattenbuch: im Plus nach 1 Tag', einheit: '%', art: 'stand' },
  'schattenbuch.median1W': { name: 'Schattenbuch: Median nach 1 Woche', einheit: '%', art: 'stand' },
  'depot.netto': { name: 'Depot: Ergebnis nach Gebühren', einheit: '€', art: 'summe' },
  'depot.vsEtf': { name: 'Depot: Vorsprung vor dem MSCI World', einheit: '€', art: 'summe' },
  'depot.trefferquote': { name: 'Depot: Trefferquote', einheit: '%', art: 'stand' },
  'autopilot.oeNetto': { name: 'Autopilot: Ø Ergebnis je Order', einheit: '%', art: 'stand' },
  'daytrading.netto': { name: 'Daytrading (sichtbar): Ergebnis nach Gebühren', einheit: '€', art: 'summe' },
  'daytrading.quote': { name: 'Daytrading (sichtbar): Trefferquote', einheit: '%', art: 'stand' },
  'daytrading.oeR': { name: 'Daytrading (sichtbar): Ø R je Trade', einheit: 'R', art: 'stand' },
  'prognose.quote1T': { name: 'Claudes Tagesprognose: Richtung richtig', einheit: '%', art: 'stand' },
  'quellen.ok': { name: 'Quellen, die in den letzten 26 Stunden geliefert haben', einheit: 'Quellen', art: 'stand' },
  'quellen.ohneSignale': { name: 'Quellen ohne Signal im letzten Lauf', einheit: 'Quellen', art: 'stand' },
  'signale.proTag': { name: 'Signale am Tag', einheit: 'Signale', art: 'stand' },
  'zeugnis.note': { name: 'Wochenzeugnis: Note', einheit: 'Note', art: 'stand' },
};

export interface KennzahlEingaben {
  jetzt: Date;
  heute: string;
  tracking: TrackingEintrag[];
  statistik?: Partial<Statistik> | null;
  depot?: { netto?: number; etfNetto?: number; trefferquote?: number | null } | null;
  daytrading?: Pick<DtUebersicht, 'gesamt'> | null;
  quellen?: { zuletztOk?: string; signale?: number }[];
  signaleHeute?: number | null;
  zeugnisNote?: number | null;
}

const zahl = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function kennzahlenHeute(e: KennzahlEingaben): Record<string, number | null> {
  const kandidaten = e.tracking.filter((t) => t.datum === e.heute && (t.art ?? 'kandidat') === 'kandidat');
  const g = e.statistik?.kandidaten?.gesamt;
  const vor26h = e.jetzt.getTime() - 26 * 3600000;
  return {
    'schattenbuch.startkursQuote': kandidaten.length ? Math.round((kandidaten.filter((t) => t.start).length / kandidaten.length) * 1000) / 10 : null,
    'schattenbuch.messungen1W': zahl(g?.n1W),
    'schattenbuch.quote1T': zahl(g?.quote1T),
    'schattenbuch.median1W': zahl(g?.med1W),
    'depot.netto': zahl(e.depot?.netto),
    'depot.vsEtf': zahl(e.depot?.netto) !== null && zahl(e.depot?.etfNetto) !== null ? Math.round((e.depot!.netto! - e.depot!.etfNetto!) * 100) / 100 : null,
    'depot.trefferquote': zahl(e.depot?.trefferquote),
    'autopilot.oeNetto': zahl(e.statistik?.nachHerkunft?.autopilot?.oeNetto),
    'daytrading.netto': zahl(e.daytrading?.gesamt?.netto),
    'daytrading.quote': zahl(e.daytrading?.gesamt?.quote),
    'daytrading.oeR': zahl(e.daytrading?.gesamt?.oeR),
    'prognose.quote1T': zahl(e.statistik?.prognose?.quote1T),
    'quellen.ok': e.quellen ? e.quellen.filter((q) => q.zuletztOk && Date.parse(q.zuletztOk) >= vor26h).length : null,
    'quellen.ohneSignale': e.quellen ? e.quellen.filter((q) => q.signale === 0).length : null,
    'signale.proTag': zahl(e.signaleHeute),
    'zeugnis.note': zahl(e.zeugnisNote),
  };
}

/** Tageswerte: Datum → Kennzahl → Wert */
export type Zeitreihe = Record<string, Record<string, number | null>>;

export function zeitreiheFortschreiben(alt: Zeitreihe, datum: string, werte: Record<string, number | null>, behalteTage = 150): Zeitreihe {
  const grenze = new Date(Date.parse(`${datum}T12:00:00Z`) - behalteTage * 86400000).toISOString().slice(0, 10);
  return Object.fromEntries(Object.entries({ ...alt, [datum]: werte }).filter(([d]) => d >= grenze).sort(([a], [b]) => a.localeCompare(b)));
}

const tagPlus = (datum: string, tage: number) => new Date(Date.parse(`${datum}T12:00:00Z`) + tage * 86400000).toISOString().slice(0, 10);
const tageZwischen = (von: string, bis: string) => Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86400000);

/** Wert einer Kennzahl in einem Fenster: Mittel (stand) bzw. Veränderung je Tag (summe). null = zu wenige Tageswerte. */
export function fensterWert(reihe: Zeitreihe, kennzahl: string, von: string, bis: string): number | null {
  const punkte = Object.entries(reihe)
    .filter(([d, w]) => d >= von && d <= bis && typeof w[kennzahl] === 'number')
    .map(([d, w]) => [d, w[kennzahl] as number] as const)
    .sort(([a], [b]) => a.localeCompare(b));
  if (KENNZAHLEN[kennzahl]?.art === 'summe') {
    if (punkte.length < 2) return null;
    const tage = tageZwischen(punkte[0][0], punkte[punkte.length - 1][0]);
    return tage >= 3 ? (punkte[punkte.length - 1][1] - punkte[0][1]) / tage : null;
  }
  return punkte.length >= 3 ? punkte.reduce((a, [, w]) => a + w, 0) / punkte.length : null;
}

export interface Bewertung {
  urteil: 'besser' | 'gleich' | 'schlechter' | 'nicht messbar';
  vorher: number | null;
  nachher: number | null;
  text: string;
}

const de = (x: number) => (Math.round(x * 100) / 100).toLocaleString('de-DE');

/**
 * Hat eine übernommene Änderung gewirkt? Vergleicht die Kennzahl ihres Messkriteriums im Fenster vor der Übernahme
 * mit dem Fenster danach. null = noch nicht fällig (zu früh oder noch zu wenige Tageswerte).
 */
export function aenderungBewerten(a: Aenderung, uebernommenAm: string, reihe: Zeitreihe, heute: string, cfg: Leitplanken['bewertung']): Bewertung | null {
  const tage = tageZwischen(uebernommenAm, heute);
  if (tage < cfg.fruehestensNachTagen) return null;
  const k = a.messkriterium.kennzahl;
  const def = KENNZAHLEN[k];
  const vorher = fensterWert(reihe, k, tagPlus(uebernommenAm, -cfg.fensterTage), tagPlus(uebernommenAm, -1));
  const nachher = fensterWert(reihe, k, tagPlus(uebernommenAm, 1), heute);
  if (!def || vorher === null || nachher === null) {
    if (tage < cfg.spaetestensNachTagen) return null;
    return { urteil: 'nicht messbar', vorher, nachher, text: `„${a.titel}“: ${def?.name ?? k} ließ sich nicht vergleichen (zu wenige Tageswerte).` };
  }
  const schwelle = Math.max(Math.abs(vorher) * (cfg.schwelleProzent / 100), 1e-9);
  const delta = (nachher - vorher) * (a.messkriterium.richtung === 'steigt' ? 1 : -1);
  const urteil = delta > schwelle ? 'besser' : delta < -schwelle ? 'schlechter' : 'gleich';
  const je = def.art === 'summe' ? ' je Tag' : '';
  return { urteil, vorher, nachher, text: `„${a.titel}“: ${def.name} ${de(vorher)} → ${de(nachher)} ${def.einheit}${je} (sollte ${a.messkriterium.richtung === 'steigt' ? 'steigen' : 'fallen'}) – ${urteil}.` };
}

/** Neue Bewertungen für alle Übernahmen, die fällig, noch nicht bewertet und nicht zurückgenommen sind. */
export function faelligeBewertungen(protokoll: ProtokollEintrag[], reihe: Zeitreihe, heute: string, jetzt: string, cfg: Leitplanken['bewertung']): Extract<ProtokollEintrag, { typ: 'bewertet' }>[] {
  const zurueck = new Set(protokoll.filter((p) => p.typ === 'zurueckgenommen').map((p) => p.merge));
  const bewertet = new Set(protokoll.filter((p) => p.typ === 'bewertet').map((p) => `${p.merge}|${p.aenderung}`));
  const out: Extract<ProtokollEintrag, { typ: 'bewertet' }>[] = [];
  for (const u of protokoll) {
    if (u.typ !== 'uebernommen' || zurueck.has(u.merge)) continue;
    for (const a of u.aenderungen) {
      if (bewertet.has(`${u.merge}|${a.id}`)) continue;
      const b = aenderungBewerten(a, u.zeit.slice(0, 10), reihe, heute, cfg);
      if (b) out.push({ typ: 'bewertet', zeit: jetzt, merge: u.merge, aenderung: a.id, kennzahl: a.messkriterium.kennzahl, ...b });
    }
  }
  return out;
}

/**
 * Wache: Sind nach der Übernahme die letzten `n` abgeschlossenen Läufe eines Workflows in Folge ausgefallen?
 * Gibt den Namen des Workflows zurück, sonst null.
 */
export function wacheUrteil(laeufe: { workflow: string; conclusion: string | null; createdAt: string }[], seit: string, n: number): string | null {
  const je = new Map<string, { conclusion: string | null; createdAt: string }[]>();
  for (const l of laeufe) if (l.createdAt > seit && l.conclusion && l.conclusion !== 'cancelled' && l.conclusion !== 'skipped') je.set(l.workflow, [...(je.get(l.workflow) ?? []), l]);
  for (const [workflow, l] of je) {
    const neueste = l.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, n);
    if (neueste.length >= n && neueste.every((x) => x.conclusion === 'failure' || x.conclusion === 'timed_out')) return workflow;
  }
  return null;
}
