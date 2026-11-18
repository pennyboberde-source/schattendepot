// Bereich „Volltreffer“, Stufe 3 (Plan Volltreffer V6): Bewährte Muster handeln sichtbar – simuliert, 1.000 € je Order,
// mit Einzelmitteilungen. Der Nutzer hat am 15.11.2026 entschieden: kein Ja je Muster nötig („Bewährte Muster“), aber
// „Klasse vor Masse“ – kein Ordern bei Unsicherheit, lieber wenige Orders mit mehr Gewinn in Prozent. Deshalb strenger
// als Stufe 2: genug Fälle im Vorwärtstest, Ergebnis im Band des Rückblicks UND ein Muster, das oft trifft und im
// Rückblick deutlich verdient. Befördert und zurückgestuft wird nur nach vorn (Einträge im Muster-Buch mit Datum);
// sichtbar gehandelt werden nur Fälle, deren Stichtag in eine Beförderungszeit fällt – nie rückwirkend.
import { euro } from '../geld.ts';
import { jagdenWaehlen, jagdKennzahlen, type JagdFall, type JagdKennzahlen } from './jagd.ts';

export interface V6Regeln {
  /** abgeschlossene Fälle im Vorwärtstest mindestens */
  mindestFaelle: number;
  /** Volltreffer-Quote im Rückblick mindestens (%) */
  mindestQuote: number;
  /** Ø je Order im Rückblick mindestens (€ nach Kosten) */
  mindestEv: number;
  /** sichtbare Orders gleichzeitig höchstens */
  maxOffen: number;
  /** nach so viel realisiertem Verlust an einem Tag (€) am nächsten Einstiegstag keine neue sichtbare Order */
  tagesVerlustGrenze: number;
  /** Einsatz je Order (€) */
  einsatz: number;
  /**
   * Schnellspur (Nutzer 15.11.2026: „kannst auch von 20 Tests absehen, wenn du dir sicher bist“): Muster mit sehr
   * starker Wertung im Rückblick brauchen nur `mindestFaelle` abgeschlossene Fälle vorwärts – alle anderen Bedingungen gelten.
   */
  schnellspur?: { mindestWertung: number; mindestFaelle: number; mindestTage?: number };
  /**
   * Verschiedene Stichtage unter den abgeschlossenen Vorwärts-Fällen mindestens (18.11.2026): Fälle desselben Tages sind
   * ein Ereignis (wie die Klumpen-Prüfung im Rückblick). Befund 18.11.: ein Muster hatte 599 Vorwärts-Fälle aus 1–3
   * Tagen – ein einziger Markttag hätte es befördert oder versenkt.
   */
  mindestTage?: number;
}

export interface MusterStand {
  /** abgeschlossene Fälle im Vorwärtstest */
  faelle: number;
  /** Ø je Fall im Vorwärtstest (€) */
  ev: number;
  rueckblick: { quote: number; ev: number; se: number };
  /** Wertung im Rückblick (für die Schnellspur) */
  wertung?: number;
  /** verschiedene Stichtage der abgeschlossenen Vorwärts-Fälle */
  tage?: number;
  /** Ø je Tag (Mittel der Tagesmittel) – jeder Stichtag zählt gleich, egal wie viele Fälle er hat */
  evTage?: number;
}

/** Wie viele abgeschlossene Vorwärts-Fälle braucht dieses Muster? */
export const noetigeFaelle = (m: Pick<MusterStand, 'wertung'>, r: V6Regeln) => (r.schnellspur && (m.wertung ?? 0) >= r.schnellspur.mindestWertung ? Math.min(r.schnellspur.mindestFaelle, r.mindestFaelle) : r.mindestFaelle);

/** Erfüllt ein Muster heute die Bedingungen für Stufe 3? Mit Grund (für das Muster-Buch und die App). */
export function befoerderungPruefen(m: MusterStand, r: V6Regeln): { ok: boolean; grund: string } {
  const schnell = !!r.schnellspur && (m.wertung ?? 0) >= r.schnellspur.mindestWertung;
  const tageNoetig = schnell && r.schnellspur?.mindestTage !== undefined ? Math.min(r.schnellspur.mindestTage, r.mindestTage ?? 0) : (r.mindestTage ?? 0);
  // Ø vorwärts je Tag (Klumpen), falls bekannt
  const ev = m.evTage ?? m.ev;
  if (m.rueckblick.quote < r.mindestQuote) return { ok: false, grund: `Volltreffer-Quote im Rückblick ${m.rueckblick.quote} % unter ${r.mindestQuote} %` };
  if (m.rueckblick.ev < r.mindestEv) return { ok: false, grund: `Ø im Rückblick ${euro(m.rueckblick.ev)} unter ${euro(r.mindestEv)}` };
  const noetig = noetigeFaelle(m, r);
  if (m.faelle < noetig) return { ok: false, grund: `erst ${m.faelle} von ${noetig} Fällen im Vorwärtstest${noetig < r.mindestFaelle ? ' (Schnellspur)' : ''}` };
  if (tageNoetig && (m.tage ?? 0) < tageNoetig) return { ok: false, grund: `Fälle erst an ${m.tage ?? 0} von ${tageNoetig} verschiedenen Tagen` };
  if (ev <= 0) return { ok: false, grund: `vorwärts Ø ${euro(ev, { vorzeichen: true })}${m.evTage !== undefined ? ' je Tag' : ''} – nicht im Plus` };
  const band = m.rueckblick.ev - 2 * Math.max(m.rueckblick.se, 1);
  if (ev < band) return { ok: false, grund: `vorwärts Ø ${euro(ev)}${m.evTage !== undefined ? ' je Tag' : ''} unter dem Band des Rückblicks (${euro(band)})` };
  return { ok: true, grund: `${m.faelle} Fälle vorwärts${m.tage !== undefined ? ` an ${m.tage} Tagen` : ''}, Ø ${euro(ev, { vorzeichen: true })}${m.evTage !== undefined ? ' je Tag' : ''} im Band des Rückblicks (Quote ${m.rueckblick.quote} %, Ø ${euro(m.rueckblick.ev, { vorzeichen: true })})` };
}

export interface BuchEintragKurz {
  schluessel: string;
  status: string;
  am?: string;
}

/** Beförderungszeiten je Muster aus dem Muster-Buch (nur anhängen): befoerdert … zurueckgestuft/beendet */
export function stufe3Zeiten(eintraege: BuchEintragKurz[]): Map<string, { von: string; bis: string | null }[]> {
  const z = new Map<string, { von: string; bis: string | null }[]>();
  for (const e of eintraege) {
    const liste = z.get(e.schluessel) ?? [];
    const letzte = liste[liste.length - 1];
    if (e.status === 'befoerdert' && e.am && (!letzte || letzte.bis !== null)) liste.push({ von: e.am, bis: null });
    else if ((e.status === 'zurueckgestuft' || e.status === 'beendet') && e.am && letzte && letzte.bis === null) letzte.bis = e.am;
    if (liste.length) z.set(e.schluessel, liste);
  }
  return z;
}

/** Ist das Muster heute befördert? */
export const istBefoerdert = (zeiten: Map<string, { von: string; bis: string | null }[]>, schluessel: string) => zeiten.get(schluessel)?.some((x) => x.bis === null) ?? false;

/** Fiel der Stichtag in eine Beförderungszeit? (Stichtag am oder nach der Beförderung, vor dem Zurückstufen) */
export const inStufe3 = (zeiten: Map<string, { von: string; bis: string | null }[]>, f: JagdFall) =>
  zeiten.get(f.muster)?.some((x) => f.stichtag >= x.von && (x.bis === null || f.stichtag < x.bis)) ?? false;

export interface Stufe3Ergebnis {
  kennzahlen: JagdKennzahlen;
  /** Gewinn in % des eingesetzten Geldes (Summe / (Orders × Einsatz)) */
  rendite: number;
  offen: JagdFall[];
  abgeschlossen: JagdFall[];
  /** gewählt für die nächste Eröffnung (Stichtag heute bekannt, Einstieg folgt) */
  vorgemerkt: JagdFall[];
  uebersprungen: number;
}

/** Platzhalter für „Einstieg zur nächsten Eröffnung“: nach allen echten Tagen, damit die Auswahl dieselben Regeln nutzt */
const NAECHSTE = '9999-12-31';

/**
 * Sichtbare Orders: nur Fälle befördeter Muster (Stichtag in einer Beförderungszeit), ohne die Claude mit „nein“
 * beurteilt hat, wenn `ohneNein` (nur sinnvoll, wenn gemessen ist, dass „nein“ schlechter abschneidet); je Wert
 * höchstens eine offene Order. Lauernde Fälle laufen mit, damit die vorgemerkten nach denselben Regeln gewählt werden
 * wie am nächsten Morgen die echten.
 */
export function stufe3Waehlen(faelle: JagdFall[], zeiten: Map<string, { von: string; bis: string | null }[]>, r: V6Regeln, ohneNein = false, klumpen?: { klumpe: (f: JagdFall) => string | null; maxJeKlumpen: number }): Stufe3Ergebnis {
  const kandidaten = faelle
    .filter((f) => inStufe3(zeiten, f) && !(ohneNein && f.urteil === 'nein'))
    .map((f) => (f.art === 'lauert' ? { ...f, einstieg: NAECHSTE } : f));
  const { jagden, uebersprungen } = jagdenWaehlen(kandidaten, { maxOffen: r.maxOffen, tagesVerlustGrenze: r.tagesVerlustGrenze, einmalJeWert: true, ...(klumpen ?? {}) });
  const echt = jagden.filter((j) => j.einstieg !== NAECHSTE);
  const vorgemerkt = jagden.filter((j) => j.einstieg === NAECHSTE).map((j) => ({ ...j, einstieg: null }));
  const k = jagdKennzahlen(echt);
  return {
    kennzahlen: k,
    rendite: k.anzahl ? Math.round((k.summe / (k.anzahl * r.einsatz)) * 1000) / 10 : 0,
    offen: echt.filter((j) => j.art === 'offen'),
    abgeschlossen: echt.filter((j) => j.art !== 'offen').sort((a, b) => (b.ende ?? '').localeCompare(a.ende ?? '')),
    vorgemerkt,
    uebersprungen,
  };
}

export interface Mitteilung {
  titel: string;
  text: string;
  tag: string;
  typ: 'gekauft' | 'verkauft';
}

const ZEICHEN: Record<string, string> = { treffer: '🎯 Volltreffer!', niete: '❌ Stop', zeit: '⏱️ Zeit abgelaufen', gesichert: '🔒 Gewinn gesichert' };
const schluesselVon = (j: JagdFall) => `${j.muster}|${j.wert}|${j.stichtag}`;

/**
 * Einzelmitteilungen der sichtbaren Orders (V6): vorgemerkt (Einstieg zur nächsten Eröffnung), gestartet (falls die
 * Vormerkung nicht gemeldet wurde) und beendet – je Order und Ereignis höchstens einmal (Gedächtnis `gemeldet`).
 */
export function stufe3Mitteilungen(s: Pick<Stufe3Ergebnis, 'offen' | 'abgeschlossen' | 'vorgemerkt'>, gemeldet: string[]): { neu: Mitteilung[]; gemeldet: string[] } {
  const schon = new Set(gemeldet);
  const neu: Mitteilung[] = [];
  const merke: string[] = [];
  const kurz = (j: JagdFall) => j.spielart.split(',').slice(0, 2).join(',');
  for (const j of s.vorgemerkt) {
    const k = `${schluesselVon(j)}|vor`;
    if (schon.has(k)) continue;
    neu.push({ typ: 'gekauft', titel: `🎯 Volltreffer-Order: ${j.wert}`, text: `${kurz(j)} – Einstieg zur nächsten Eröffnung, 1.000 € (simuliert). Ziel +400 €, Stop laut Spielart, höchstens ${j.fenster} Tage.`, tag: `v6-${j.wert}-${j.stichtag}` });
    merke.push(k);
  }
  for (const j of s.offen) {
    const k = `${schluesselVon(j)}|vor`;
    if (schon.has(k) || merke.includes(k)) continue;
    neu.push({ typ: 'gekauft', titel: `🎯 Volltreffer-Order läuft: ${j.wert}`, text: `${kurz(j)} – eingestiegen ${j.einstieg} zur Eröffnung, Stand ${euro(j.netto ?? 0, { vorzeichen: true })} (simuliert).`, tag: `v6-${j.wert}-${j.stichtag}` });
    merke.push(k);
  }
  for (const j of s.abgeschlossen) {
    const k = `${schluesselVon(j)}|ende`;
    if (schon.has(k)) continue;
    neu.push({ typ: 'verkauft', titel: `${ZEICHEN[j.art] ?? 'Beendet'} ${j.wert} ${euro(j.netto ?? 0, { vorzeichen: true })}`, text: `${kurz(j)} – Volltreffer-Order beendet am ${j.ende} nach ${j.tag ?? '?'} Tag(en) (simuliert).`, tag: `v6-ende-${j.wert}-${j.stichtag}` });
    merke.push(k, `${schluesselVon(j)}|vor`);
  }
  return { neu, gemeldet: [...new Set([...gemeldet, ...merke])].slice(-800) };
}
