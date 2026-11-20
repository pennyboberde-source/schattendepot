import type { JagdFall } from './jagd.ts';

/** Ein Eintrag des Trefferbuchs (Volltreffer: Stichtag des Sprungbeginns, Einstieg zur nächsten Eröffnung) */
export interface BuchTreffer {
  datum: string;
  wert: string;
  markt: 'aktie' | 'krypto';
}

export interface Abdeckung {
  /** erster Stichtag des Vorwärtstests – nur Volltreffer ab hier zählen (vorher gab es keine Vorwärts-Fälle) */
  ab: string | null;
  fensterTage: number;
  volltreffer: number;
  /** ein Vorwärts-Fall desselben Werts bis zu fensterTage vor dem Sprungbeginn (Richtung/Spielart egal) */
  erkannt: number;
  /** ein Vorwärts-Fall desselben Werts im Fenster um den Sprungbeginn endete wirklich als Volltreffer */
  richtig: number;
  /** davon als virtuelle Jagd gelaufen bzw. als sichtbare Order */
  gejagt: number;
  sichtbar: number;
  anteilErkannt: number;
  anteilRichtig: number;
  /** Treffsicherheit: abgeschlossene Vorwärts-Fälle ab `ab` und wie viele davon Volltreffer waren */
  vorwaerts: { faelle: number; treffer: number; quote: number; tage: number };
  /** die letzten Stichtage: Volltreffer im Trefferbuch und davon richtig erwischt */
  jeTag: { datum: string; volltreffer: number; erkannt: number; richtig: number }[];
}

const FERTIG = new Set(['treffer', 'niete', 'zeit', 'gesichert']);
const tag = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
const r1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Abdeckung des Trefferbuchs (20.11.2026): Wie viele der Volltreffer seit Beginn des Vorwärtstests hatte der Code vorher
 * auf dem Schirm, und wie viele hat er in der richtigen Spielart wirklich erwischt? Dazu die Treffsicherheit der
 * Vorwärts-Fälle – Abdeckung allein ließe sich mit sehr vielen Fällen erkaufen.
 */
export function abdeckungBerechnen(buch: BuchTreffer[], vorwaerts: JagdFall[], jagden: JagdFall[], sichtbar: JagdFall[], fensterTage = 7, letzteTage = 10): Abdeckung {
  const mitEinstieg = vorwaerts.filter((f) => f.einstieg);
  const ab = mitEinstieg.length ? mitEinstieg.reduce((m, f) => (f.stichtag < m ? f.stichtag : m), mitEinstieg[0].stichtag) : null;
  const index = (l: JagdFall[]) => {
    const m = new Map<string, JagdFall[]>();
    for (const f of l) {
      const k = `${f.markt}|${f.wert.toUpperCase()}`;
      (m.get(k) ?? m.set(k, []).get(k)!).push(f);
    }
    return m;
  };
  const iv = index(vorwaerts);
  const ij = index(jagden);
  const is = index(sichtbar);
  const relevant = ab ? buch.filter((b) => b.datum >= ab) : [];
  let erkannt = 0;
  let richtig = 0;
  let gejagt = 0;
  let sicht = 0;
  const proTag = new Map<string, { volltreffer: number; erkannt: number; richtig: number }>();
  for (const b of relevant) {
    const k = `${b.markt}|${b.wert.toUpperCase()}`;
    const t0 = tag(b.datum);
    const vor = (f: JagdFall) => tag(f.stichtag) <= t0 && t0 - tag(f.stichtag) <= fensterTage;
    const um = (f: JagdFall) => f.art === 'treffer' && Math.abs(tag(f.stichtag) - t0) <= fensterTage;
    const e = (iv.get(k) ?? []).some(vor);
    const r = (iv.get(k) ?? []).some(um);
    if (e) erkannt++;
    if (r) richtig++;
    if ((ij.get(k) ?? []).some(um)) gejagt++;
    if ((is.get(k) ?? []).some(um)) sicht++;
    const p = proTag.get(b.datum) ?? proTag.set(b.datum, { volltreffer: 0, erkannt: 0, richtig: 0 }).get(b.datum)!;
    p.volltreffer++;
    if (e) p.erkannt++;
    if (r) p.richtig++;
  }
  const fertig = ab ? vorwaerts.filter((f) => FERTIG.has(f.art) && f.stichtag >= ab) : [];
  const treffer = fertig.filter((f) => f.art === 'treffer').length;
  return {
    ab,
    fensterTage,
    volltreffer: relevant.length,
    erkannt,
    richtig,
    gejagt,
    sichtbar: sicht,
    anteilErkannt: relevant.length ? r1((erkannt / relevant.length) * 100) : 0,
    anteilRichtig: relevant.length ? r1((richtig / relevant.length) * 100) : 0,
    vorwaerts: { faelle: fertig.length, treffer, quote: fertig.length ? r1((treffer / fertig.length) * 100) : 0, tage: new Set(fertig.map((f) => f.stichtag)).size },
    jeTag: [...proTag.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, letzteTage)
      .map(([datum, v]) => ({ datum, ...v })),
  };
}
