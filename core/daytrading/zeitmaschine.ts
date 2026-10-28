// Time Machine (portiert aus trader-timemachine): 60 Tage 5-Minuten-Kerzen voller Sitzungen.
// 1. Monte Carlo: ab der Einstiegskerze für jede restliche Kerze eine vergangene Kerze derselben Tageszeit (± 2) ziehen,
//    auf den aktuellen Kurs skalieren, Stop vor Ziel prüfen – 10.000 Wiederholungen mit festem Startwert (Seed 19).
// 2. Historie: dieselbe Regel (Eröffnungsspanne, Stop Mitte, Ziel R) auf jeder vergangenen Sitzung nachspielen.
// Simulierte Wahrscheinlichkeiten sind keine Vorhersage.
import { runde } from '../geld.ts';
import type { DtRichtung, ZeitmaschinenErgebnis } from './kern.ts';

export interface SKerze {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Deterministischer Zufall (mulberry32), damit jeder Lauf wiederholbar ist. */
export function zufall(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface ZmPlan {
  richtung: DtRichtung;
  /** Index der Einstiegskerze in der Sitzung (0 = erste Kerze nach Eröffnung) */
  einstiegIndex: number;
  /** Index der letzten Kerze vor „flat bis“ (exklusiv) */
  bisIndex: number;
  /** Stop/Ziel relativ zum Einstieg, z. B. stop 0,99 und ziel 1,02 (long) */
  stopFaktor: number;
  zielFaktor: number;
  zielR: number;
}

/** Monte-Carlo-Wahrscheinlichkeiten aus Kerzen-Verhältnissen vergangener Sitzungen (alle gleich lang). */
export function monteCarlo(sitzungen: SKerze[][], p: ZmPlan, wiederholungen = 10000, seed = 19): Omit<ZeitmaschinenErgebnis, 'historie'> {
  const rnd = zufall(seed);
  const n = sitzungen[0]?.length ?? 0;
  // Verhältnisse je Kerze zur Schlusskurs der Vorkerze
  const ratios = sitzungen.map((s) => s.map((k, i) => (i === 0 ? null : { o: k.o / s[i - 1].c, h: k.h / s[i - 1].c, l: k.l / s[i - 1].c, c: k.c / s[i - 1].c })));
  const long = p.richtung === 'long';
  let ziel = 0;
  let stop = 0;
  let gruen = 0;
  for (let w = 0; w < wiederholungen; w++) {
    let kurs = 1;
    let ergebnis: 'ziel' | 'stop' | null = null;
    for (let i = Math.max(1, p.einstiegIndex); i < Math.min(p.bisIndex, n); i++) {
      const tag = Math.floor(rnd() * ratios.length);
      const j = Math.min(n - 1, Math.max(1, i + Math.floor(rnd() * 5) - 2));
      const r = ratios[tag][j]!;
      const h = kurs * r.h;
      const l = kurs * r.l;
      if (long ? l <= p.stopFaktor : h >= p.stopFaktor) {
        ergebnis = 'stop';
        break;
      }
      if (long ? h >= p.zielFaktor : l <= p.zielFaktor) {
        ergebnis = 'ziel';
        break;
      }
      kurs *= r.c;
    }
    if (ergebnis === 'ziel') ziel++;
    else if (ergebnis === 'stop') stop++;
    if (ergebnis === 'ziel' || (!ergebnis && (long ? kurs > 1 : kurs < 1))) gruen++;
  }
  const pz = (x: number) => runde((x / wiederholungen) * 100, 1);
  const schwelle = runde(100 / (1 + p.zielR), 1);
  const seite = ziel + stop;
  const anteil = seite ? (ziel / seite) * 100 : 0;
  const abstand = anteil - schwelle;
  const urteil = !seite
    ? 'Keine Wiederholung erreicht Ziel oder Stop'
    : Math.abs(abstand) < 5
      ? p.zielR === 1
        ? 'Nahe am Münzwurf'
        : 'Nahe an der Gewinnschwelle'
      : Math.abs(abstand) < 15
        ? abstand > 0
          ? 'Neigt zum Ziel'
          : 'Neigt zum Stop'
        : abstand > 0
          ? 'Deutlich Richtung Ziel'
          : 'Deutlich Richtung Stop';
  return { zielZuerst: pz(ziel), stopZuerst: pz(stop), keins: pz(wiederholungen - seite), gruen: pz(gruen), schwelle, urteil, wiederholungen, seed, sitzungen: sitzungen.length };
}

/** Eröffnungsspannen-Regel auf vergangenen Sitzungen nachspielen (echte Historie, keine Simulation). */
export function historie(
  sitzungen: SKerze[][],
  r: { richtung: DtRichtung; spanneKerzen: number; letzteEinstiegsKerze: number; flatIndex: number; zielR: number },
): { faelle: number; ziel: number; stop: number; oeR: number } {
  let faelle = 0;
  let ziel = 0;
  let stop = 0;
  let summeR = 0;
  const long = r.richtung === 'long';
  for (const s of sitzungen) {
    const sp = s.slice(0, r.spanneKerzen);
    const hoch = Math.max(...sp.map((k) => k.h));
    const tief = Math.min(...sp.map((k) => k.l));
    const mitte = (hoch + tief) / 2;
    let i = r.spanneKerzen;
    while (i <= r.letzteEinstiegsKerze && !(long ? s[i].c > hoch : s[i].c < tief)) i++;
    if (i > r.letzteEinstiegsKerze || i + 1 >= r.flatIndex) continue;
    const ein = s[i + 1].o;
    const risiko = Math.abs(ein - mitte);
    if (!(risiko > 0) || (long ? mitte >= ein : mitte <= ein)) continue;
    const zielK = long ? ein + r.zielR * risiko : ein - r.zielR * risiko;
    faelle++;
    let rr: number | null = null;
    for (let j = i + 1; j < r.flatIndex; j++) {
      if (long ? s[j].l <= mitte : s[j].h >= mitte) {
        rr = -1;
        stop++;
        break;
      }
      if (long ? s[j].h >= zielK : s[j].l <= zielK) {
        rr = r.zielR;
        ziel++;
        break;
      }
    }
    summeR += rr ?? ((long ? 1 : -1) * (s[Math.min(r.flatIndex, s.length - 1)].o - ein)) / risiko;
  }
  return { faelle, ziel, stop, oeR: faelle ? runde(summeR / faelle, 2) : 0 };
}

/** Twelve-Data-Werte (neueste zuerst, Zeit in New York) → volle Sitzungen mit genau `kerzen` 5-Minuten-Kerzen ab 09:30. */
export function volleSitzungen(werte: { datetime: string; open: string; high: string; low: string; close: string }[], vorDatum: string, kerzen = 78): SKerze[][] {
  const tage = new Map<string, { zeit: string; k: SKerze }[]>();
  for (const w of werte) {
    const [d, z] = w.datetime.split(' ');
    if (d >= vorDatum || !z || z < '09:30' || z >= '16:00') continue;
    if (!tage.has(d)) tage.set(d, []);
    tage.get(d)!.push({ zeit: z, k: { o: +w.open, h: +w.high, l: +w.low, c: +w.close } });
  }
  return [...tage.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, l]) => l.sort((a, b) => a.zeit.localeCompare(b.zeit)).map((x) => x.k))
    .filter((s) => s.length === kerzen && s.every((k) => k.c > 0));
}
