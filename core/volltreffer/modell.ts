// Gesamtmodell (Quantensprung, vom Nutzer freigegeben am 16.11.2026): statt Einzelmustern aus höchstens zwei Merkmalen
// bewertet ein Modell jeden Fall aus ALLEN Merkmalen zugleich. Verfahren: Gradient Boosting mit flachen Entscheidungs-
// bäumen (Tiefe 3 → Zusammenspiel von bis zu drei Merkmalen je Baum) auf den Klassen der Einteilungen (fehlender Wert =
// eigene Klasse 0). Ziel: Ergebnis der Order nach Kosten in € (gekappt). Selbst geschrieben, ohne fremde Pakete,
// deterministisch (fester Zufallsstart). Reine Funktionen.

export interface ModellEinstellungen {
  baeume: number;
  tiefe: number;
  /** Schrittweite (Schrumpfung) je Baum */
  lernrate: number;
  /** Mindestzahl Fälle je Blatt (gegen Auswendiglernen) */
  minBlatt: number;
  /** Anteil der Fälle je Baum (zufällig, fester Start) */
  anteil: number;
  /** Ziel wird auf [-kappe, +kappe] € begrenzt (Ausreißer bestimmen sonst die Bäume) */
  kappe: number;
  /** L2-Dämpfung der Blattwerte */
  lambda: number;
  start?: number;
}

/** Ein Baum als flache Felder: Knoten mit merkmal ≥ 0 teilen nach „Klasse ≤ schwelle“ → links, sonst rechts */
export interface Baum {
  merkmal: number[];
  schwelle: number[];
  links: number[];
  rechts: number[];
  wert: number[];
}

export interface Modell {
  basis: number;
  baeume: Baum[];
  merkmale: number;
}

/** Einfacher, fester Zufallsgenerator (mulberry32) */
function zufall(start: number) {
  let a = start >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Trainiert das Modell. X: Klassen je Fall (Zeilen nacheinander, p Merkmale, Werte 0…stufen-1), y: Ergebnis in €,
 * zeilen: welche Zeilen zum Training gehören; erlaubt: nur diese Merkmale dürfen teilen (z. B. ohne marktweite Größen).
 */
export function trainieren(X: Uint8Array, p: number, y: Float32Array, zeilen: Int32Array, e: ModellEinstellungen, erlaubt?: boolean[]): Modell {
  const n = zeilen.length;
  if (!n) return { basis: 0, baeume: [], merkmale: p };
  const stufen = 1 + X.reduce((m, v) => (v > m ? v : m), 0);
  const yk = new Float64Array(n);
  let summe = 0;
  for (let j = 0; j < n; j++) {
    yk[j] = Math.max(-e.kappe, Math.min(e.kappe, y[zeilen[j]]));
    summe += yk[j];
  }
  const basis = summe / n;
  const pred = new Float64Array(n).fill(basis);
  const rnd = zufall(e.start ?? 7);
  const baeume: Baum[] = [];
  const knotenVon = new Int32Array(n);
  const hS = new Float64Array(p * stufen);
  const hN = new Float64Array(p * stufen);
  for (let b = 0; b < e.baeume; b++) {
    // Stichprobe dieses Baums
    const auswahl: number[] = [];
    for (let j = 0; j < n; j++) if (rnd() < e.anteil) auswahl.push(j);
    const baum: Baum = { merkmal: [-1], schwelle: [0], links: [-1], rechts: [-1], wert: [0] };
    for (const j of auswahl) knotenVon[j] = 0;
    let ebene = [0];
    for (let t = 0; t < e.tiefe && ebene.length; t++) {
      const naechste: number[] = [];
      for (const knoten of ebene) {
        hS.fill(0);
        hN.fill(0);
        let S = 0;
        let N = 0;
        for (const j of auswahl) {
          if (knotenVon[j] !== knoten) continue;
          const r = yk[j] - pred[j];
          S += r;
          N++;
          const o = zeilen[j] * p;
          for (let f = 0; f < p; f++) {
            const k = f * stufen + X[o + f];
            hS[k] += r;
            hN[k]++;
          }
        }
        if (N < 2 * e.minBlatt) continue;
        const elternGuete = (S * S) / (N + e.lambda);
        let besteGuete = 0;
        let bestesF = -1;
        let besteS = 0;
        for (let f = 0; f < p; f++) {
          if (erlaubt && !erlaubt[f]) continue;
          let sl = 0;
          let nl = 0;
          for (let s = 0; s < stufen - 1; s++) {
            sl += hS[f * stufen + s];
            nl += hN[f * stufen + s];
            const nr = N - nl;
            if (nl < e.minBlatt || nr < e.minBlatt) continue;
            const sr = S - sl;
            const g = (sl * sl) / (nl + e.lambda) + (sr * sr) / (nr + e.lambda) - elternGuete;
            if (g > besteGuete) {
              besteGuete = g;
              bestesF = f;
              besteS = s;
            }
          }
        }
        if (bestesF < 0) continue;
        const l = baum.merkmal.length;
        baum.merkmal.push(-1, -1);
        baum.schwelle.push(0, 0);
        baum.links.push(-1, -1);
        baum.rechts.push(-1, -1);
        baum.wert.push(0, 0);
        baum.merkmal[knoten] = bestesF;
        baum.schwelle[knoten] = besteS;
        baum.links[knoten] = l;
        baum.rechts[knoten] = l + 1;
        for (const j of auswahl) if (knotenVon[j] === knoten) knotenVon[j] = X[zeilen[j] * p + bestesF] <= besteS ? l : l + 1;
        naechste.push(l, l + 1);
      }
      ebene = naechste;
    }
    // Blattwerte aus der Stichprobe (gedämpft, geschrumpft)
    const bs = new Float64Array(baum.merkmal.length);
    const bn = new Float64Array(baum.merkmal.length);
    for (const j of auswahl) {
      bs[knotenVon[j]] += yk[j] - pred[j];
      bn[knotenVon[j]]++;
    }
    for (let k = 0; k < baum.merkmal.length; k++) if (baum.merkmal[k] < 0) baum.wert[k] = (e.lernrate * bs[k]) / (bn[k] + e.lambda);
    baeume.push(baum);
    // Vorhersage aller Trainingszeilen nachführen
    for (let j = 0; j < n; j++) pred[j] += blatt(baum, X, zeilen[j] * p);
  }
  return { basis, baeume, merkmale: p };
}

function blatt(b: Baum, X: Uint8Array, o: number): number {
  let k = 0;
  while (b.merkmal[k] >= 0) k = X[o + b.merkmal[k]] <= b.schwelle[k] ? b.links[k] : b.rechts[k];
  return b.wert[k];
}

/** Bewertung (erwartetes Ergebnis in €) für eine Zeile */
export function bewerten(m: Modell, X: Uint8Array, zeile: number): number {
  let s = m.basis;
  const o = zeile * m.merkmale;
  for (const b of m.baeume) s += blatt(b, X, o);
  return s;
}

/** Wichtigkeit je Merkmal: wie oft es in den Bäumen teilt (für das Log – welche Merkmale tragen?) */
export function wichtigkeit(m: Modell): number[] {
  const z = new Array(m.merkmale).fill(0);
  for (const b of m.baeume) for (const f of b.merkmal) if (f >= 0) z[f]++;
  return z;
}

/** Schwelle für „die obersten q Prozent“ einer Bewertungsliste */
export function schwelleFuer(bewertungen: Float64Array | number[], q: number): number {
  const s = Float64Array.from(bewertungen).sort();
  if (!s.length) return Infinity;
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(s.length * (1 - q / 100))));
  return s[i];
}

/**
 * Auswahl je Tag (Querschnitt): an jedem Tag die obersten q % der Fälle dieses Tages nach Bewertung, mindestens einer.
 * Kein fester Schwellwert über die Zeit – so wählt das Modell nicht ganze Tage aus, sondern die besten Werte eines Tages.
 */
export function tagesAuswahl(zeilen: number[], bewertung: number[], tagVon: (zeile: number) => number, q: number): number[] {
  const je = new Map<number, number[]>();
  zeilen.forEach((z, k) => (je.get(tagVon(z)) ?? je.set(tagVon(z), []).get(tagVon(z))!).push(k));
  const aus: number[] = [];
  for (const ks of je.values()) {
    ks.sort((a, b) => bewertung[b] - bewertung[a]);
    const n = Math.max(1, Math.round((ks.length * q) / 100));
    for (const k of ks.slice(0, n)) aus.push(zeilen[k]);
  }
  return aus;
}

/**
 * Rang je Tag als Anteil (0 = schlechtester, 1 = bester Fall dieses Tages; ein einzelner Fall = 1). Für „Muster × Modell“:
 * Fälle eines Musters werden behalten, wenn das Modell sie im oberen Teil ihres Tages sieht.
 */
export function tagesRang(zeilen: number[], bewertung: number[], tagVon: (zeile: number) => number): Float64Array {
  const je = new Map<number, number[]>();
  zeilen.forEach((z, k) => (je.get(tagVon(z)) ?? je.set(tagVon(z), []).get(tagVon(z))!).push(k));
  const aus = new Float64Array(zeilen.length);
  for (const ks of je.values()) {
    ks.sort((a, b) => bewertung[a] - bewertung[b]);
    ks.forEach((k, i) => (aus[k] = ks.length > 1 ? i / (ks.length - 1) : 1));
  }
  return aus;
}

/** Ziel gegen den Tagesdurchschnitt: y − Ø(y) desselben Tages (das Modell lernt, welcher Wert besser ist als die anderen) */
export function gegenTag(y: Float32Array, zeilen: number[], tagVon: (zeile: number) => number): Float32Array {
  const su = new Map<number, [number, number]>();
  for (const z of zeilen) {
    const t = su.get(tagVon(z)) ?? [0, 0];
    t[0] += y[z];
    t[1]++;
    su.set(tagVon(z), t);
  }
  const aus = new Float32Array(y.length).fill(Number.NaN);
  for (const z of zeilen) {
    const [s, n] = su.get(tagVon(z))!;
    aus[z] = y[z] - s / n;
  }
  return aus;
}

/**
 * Auswahl wie bei den Mustern: je Wert höchstens ein Fall in `sperre` Handelstagen (der erste ausgewählte zählt).
 * faelle: aufsteigend nach Tag je Wert vorsortiert nicht nötig – wird hier sortiert.
 */
export function mitSperre<T extends { wert: number; tag: number }>(faelle: T[], sperre: number): T[] {
  const s = [...faelle].sort((a, b) => a.wert - b.wert || a.tag - b.tag);
  const aus: T[] = [];
  let letzterWert = -1;
  let letzterTag = -1e9;
  for (const f of s) {
    if (f.wert !== letzterWert) {
      letzterWert = f.wert;
      letzterTag = -1e9;
    }
    if (f.tag - letzterTag <= sperre) continue;
    aus.push(f);
    letzterTag = f.tag;
  }
  return aus;
}
