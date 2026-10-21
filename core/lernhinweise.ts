// Selbstlernen ohne menschliches Urteil: Der Code leitet aus der Statistik konkrete Hinweise ab
// und passt das Risiko-Budget innerhalb fester Leitplanken an. Claude erhält beides im Kontext.
import type { Gruppe, Statistik } from './statistik.ts';

const MIN = { kalibrierung: 8, gruppe: 5, tracking: 10 };
const p = (x: number) => `${x > 0 ? '+' : ''}${x.toFixed(1).replace('.', ',')} %`;

function besteUndSchlechteste(g: Record<string, Gruppe>, min: number): { beste?: [string, Gruppe]; schlechteste?: [string, Gruppe] } {
  const l = Object.entries(g).filter(([, v]) => v.anzahl >= min);
  if (l.length < 2) return {};
  l.sort((a, b) => b[1].oeNetto - a[1].oeNetto);
  return { beste: l[0], schlechteste: l[l.length - 1] };
}

export function lernhinweise(s: Statistik): string[] {
  const h: string[] = [];

  for (const k of s.kalibrierung.filter((x) => x.anzahl >= MIN.kalibrierung)) {
    const d = k.tatsaechlich - k.erwartet;
    if (d <= -15) h.push(`Konfidenz ${k.stufe} zu optimistisch: versprochen ~${Math.round(k.erwartet)} %, eingetreten ${Math.round(k.tatsaechlich)} % (n=${k.anzahl}) → Schätzungen in diesem Bereich um ~${Math.round(-d)} Punkte senken.`);
    if (d >= 15) h.push(`Konfidenz ${k.stufe} zu vorsichtig: versprochen ~${Math.round(k.erwartet)} %, eingetreten ${Math.round(k.tatsaechlich)} % (n=${k.anzahl}) → hier mutiger schätzen.`);
  }

  const e = s.erwartetVsTatsaechlich;
  if (e.anzahl >= MIN.gruppe && e.erwartet - e.tatsaechlich > 1.5) h.push(`Erwartete Renditen zu hoch angesetzt: erwartet Ø ${p(e.erwartet)}, erreicht Ø ${p(e.tatsaechlich)} → realistischer planen oder Ziele näher setzen.`);

  for (const [titel, gruppen] of [
    ['Strategie', s.nachStrategie],
    ['Haltedauer', s.nachHaltedauer],
    ['Anlageklasse', s.nachAnlageklasse],
  ] as const) {
    const { beste, schlechteste } = besteUndSchlechteste(gruppen, MIN.gruppe);
    if (beste && beste[1].oeNetto > 0) h.push(`${titel} mit bestem Ergebnis: ${beste[0]} (Ø ${p(beste[1].oeNetto)}, Treffer ${Math.round(beste[1].quote)} %, n=${beste[1].anzahl}) → bevorzugen.`);
    if (schlechteste && schlechteste[1].oeNetto < 0) h.push(`${titel} mit schlechtestem Ergebnis: ${schlechteste[0]} (Ø ${p(schlechteste[1].oeNetto)}, n=${schlechteste[1].anzahl}) → meiden oder Vorgehen ändern.`);
  }

  const vg = s.nachVerkaufsgrund ?? {};
  const gesamt = Object.values(vg).reduce((a, g) => a + g.anzahl, 0);
  if (gesamt >= 8) {
    const anteil = (k: string) => (vg[k]?.anzahl ?? 0) / gesamt;
    if (anteil('stop') > 0.5) h.push(`${Math.round(anteil('stop') * 100)} % der Verkäufe waren Stops → Stops zu eng oder Einstiege zu früh; Einstieg nach Bestätigung oder Stop weiter setzen.`);
    if (anteil('termin') > 0.5 && (vg.termin?.oeNetto ?? 0) < 1) h.push(`${Math.round(anteil('termin') * 100)} % endeten am Verkaufstermin mit wenig Ertrag (Ø ${p(vg.termin?.oeNetto ?? 0)}) → Ziele näher oder Haltedauer kürzer.`);
    if (anteil('ziel') > 0.5) h.push(`${Math.round(anteil('ziel') * 100)} % erreichten das Ziel → Ziele dürfen ehrgeiziger sein.`);
  }

  const rk = s.nachRisikoklasse ?? {};
  if ((rk.spekulativ?.anzahl ?? 0) >= MIN.gruppe && (rk.normal?.anzahl ?? 0) >= MIN.gruppe) {
    const d = rk.spekulativ.oeNetto - rk.normal.oeNetto;
    h.push(`Spekulativ vs. normal: Ø ${p(rk.spekulativ.oeNetto)} vs. ${p(rk.normal.oeNetto)} → Spekulation ${d > 0 ? 'lohnt sich bisher (Budget wächst)' : 'lohnt sich bisher nicht (Budget schrumpft)'}.`);
  }
  if (s.pflicht.anzahl >= MIN.gruppe && s.ueberzeugung.anzahl >= MIN.gruppe && s.pflicht.oeNetto > s.ueberzeugung.oeNetto)
    h.push(`Pflicht-Orders schneiden besser ab als Überzeugungs-Orders (Ø ${p(s.pflicht.oeNetto)} vs. ${p(s.ueberzeugung.oeNetto)}) → eigene Überzeugung kritisch prüfen.`);

  const sig = Object.entries(s.kandidaten.nachSignalTyp).filter(([, v]) => v.anzahl >= MIN.tracking && v.oe1W !== null);
  if (sig.length >= 2) {
    sig.sort((a, b) => b[1].oe1W! - a[1].oe1W!);
    const [bn, bv] = sig[0];
    const [sn, sv] = sig[sig.length - 1];
    if (bv.oe1W! > 0) h.push(`Stärkstes Signal (auch ohne Kauf gemessen): ${bn} Ø ${p(bv.oe1W!)} nach 1 Woche (n=${bv.anzahl}).`);
    if (sv.oe1W! < 0) h.push(`Schwächstes Signal: ${sn} Ø ${p(sv.oe1W!)} nach 1 Woche (n=${sv.anzahl}) → nicht darauf verlassen.`);
  }
  return h;
}

export interface RisikoBudgetWirksam {
  maxSpekulativJeLauf: number;
  maxAnteilSpekulativ: number;
  stopMinProzent: number;
  mindestKursEuro: number;
  begruendung: string;
}

/** Risiko-Budget lernt mit: wächst, wenn Spekulation nachweislich besser ist, schrumpft, wenn sie verliert. Leitplanken 10–50 %, 1–2 je Lauf. */
export function wirksamesRisikoBudget(
  basis: { maxSpekulativJeLauf: number; maxAnteilSpekulativ: number; stopMinProzent: number; mindestKursEuro: number },
  s: Statistik | null,
): RisikoBudgetWirksam {
  const sp = s?.nachRisikoklasse?.spekulativ;
  const no = s?.nachRisikoklasse?.normal;
  if (!sp || sp.anzahl < 10) return { ...basis, begruendung: `Grundeinstellung (erst ${sp?.anzahl ?? 0} von 10 spekulativen Orders für eine Anpassung)` };
  const vergleich = no?.oeNetto ?? 0;
  if (sp.oeNetto > vergleich + 1 && sp.quote >= 35)
    return { ...basis, maxSpekulativJeLauf: Math.min(2, basis.maxSpekulativJeLauf + 1), maxAnteilSpekulativ: Math.round(Math.min(0.5, basis.maxAnteilSpekulativ * 1.5) * 100) / 100, begruendung: `erweitert: spekulativ Ø ${p(sp.oeNetto)} vs. normal ${p(vergleich)} (n=${sp.anzahl})` };
  if (sp.oeNetto < Math.min(-3, vergleich - 2))
    return { ...basis, maxSpekulativJeLauf: 1, maxAnteilSpekulativ: Math.round(Math.max(0.1, basis.maxAnteilSpekulativ * 0.5) * 100) / 100, begruendung: `verkleinert: spekulativ Ø ${p(sp.oeNetto)} vs. normal ${p(vergleich)} (n=${sp.anzahl})` };
  return { ...basis, begruendung: `unverändert: spekulativ Ø ${p(sp.oeNetto)} vs. normal ${p(vergleich)} (n=${sp.anzahl})` };
}
