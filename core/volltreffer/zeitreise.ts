// Zeitreise (Quantensprung, Nutzer 19.11.2026: „alle drei Quantensprünge, Reihenfolge nach deiner Einschätzung“):
// Der ganze Ablauf – Muster wählen, Jagden und höchstens 3 sichtbare Orders, je Wert eine, Kosten – wird über zwei
// Jahre Tag für Tag nachgespielt, als wäre er live gelaufen. Jede Auswahl kennt nur Fälle, deren Ergebnis zu diesem
// Zeitpunkt schon feststand (Halbmonate, mindestens einer Abstand). Ergebnis: eine ehrliche Depotkurve mit Volltreffern
// je Monat und größtem Rückgang statt Einzelstatistiken je Muster.
// Reine Bausteine (getestet in zeitreise.test.ts); die Fälle rechnet jobs/rueckblick.ts im Modus ZEITREISE=1.

/** Zählstand je Halbmonat, Gruppe und Spielart – kumuliert (Bereichssummen in O(1)) */
export class ZeitStat {
  readonly abschnitte: number;
  readonly gruppen: number;
  readonly spielarten: number;
  readonly n: Float32Array;
  readonly t: Float32Array;
  readonly sum: Float64Array;
  readonly sq: Float64Array;
  private kumuliert = false;
  constructor(abschnitte: number, gruppen: number, spielarten: number) {
    this.abschnitte = abschnitte;
    this.gruppen = gruppen;
    this.spielarten = spielarten;
    const l = abschnitte * gruppen * spielarten;
    this.n = new Float32Array(l);
    this.t = new Float32Array(l);
    this.sum = new Float64Array(l);
    this.sq = new Float64Array(l);
  }
  private pos(b: number, g: number, s: number) {
    return (b * this.gruppen + g) * this.spielarten + s;
  }
  /** ein Fall – oder ein Tag als Einheit: netto = Ø des Tages, treffer = Anteil der Volltreffer an dem Tag (0..1) */
  add(b: number, g: number, s: number, netto: number, treffer: boolean | number) {
    const p = this.pos(b, g, s);
    this.n[p]++;
    this.t[p] += typeof treffer === 'number' ? treffer : treffer ? 1 : 0;
    this.sum[p] += netto;
    this.sq[p] += netto * netto;
  }
  /** einmal nach dem Zählen: Summen entlang der Abschnitte aufaddieren */
  kumulieren() {
    if (this.kumuliert) return;
    const schritt = this.gruppen * this.spielarten;
    for (let b = 1; b < this.abschnitte; b++)
      for (let i = 0; i < schritt; i++) {
        const p = b * schritt + i;
        const q = p - schritt;
        this.n[p] += this.n[q];
        this.t[p] += this.t[q];
        this.sum[p] += this.sum[q];
        this.sq[p] += this.sq[q];
      }
    this.kumuliert = true;
  }
  /** Fälle der Abschnitte von..bis (einschließlich); erst nach kumulieren() */
  bereich(g: number, s: number, von: number, bis: number): { n: number; t: number; sum: number; sq: number } {
    if (bis < von || bis < 0) return { n: 0, t: 0, sum: 0, sq: 0 };
    const p = this.pos(bis, g, s);
    if (von <= 0) return { n: this.n[p], t: this.t[p], sum: this.sum[p], sq: this.sq[p] };
    const q = this.pos(von - 1, g, s);
    return { n: this.n[p] - this.n[q], t: this.t[p] - this.t[q], sum: this.sum[p] - this.sum[q], sq: this.sq[p] - this.sq[q] };
  }
}

export interface AuswahlRegeln {
  /** Einheiten (seit v2: Tage mit Fällen) je Hälfte der Vergangenheit mindestens */
  mindestFaelleHaelfte: number;
  /** Volltreffer-Quote insgesamt mindestens (%) */
  mindestQuote: number;
  /** so viele Muster höchstens (wie der Vorwärtstest) */
  maxMuster: number;
  /** höchstens so viele Muster je Baustein (Merkmal=Klasse) */
  maxJeBaustein: number;
  /** Abschnitte, die zwischen Fall und Auswahl mindestens liegen (Ergebnis muss feststehen) */
  abstand: number;
  /** ab diesem Abschnitt wird gewählt (davor reicht die Geschichte nicht) */
  ersterAbschnitt: number;
}

export interface Gewaehlt {
  g: number;
  s: number;
  wertung: number;
  ev: number;
  quote: number;
  n: number;
}

const kennzahl = (x: { n: number; t: number; sum: number; sq: number }) => {
  const ev = x.n ? x.sum / x.n : 0;
  const varianz = x.n > 1 ? Math.max(0, (x.sq - x.n * ev * ev) / (x.n - 1)) : 0;
  return { n: x.n, ev, se: x.n ? Math.sqrt(varianz / x.n) : Infinity, quote: x.n ? (x.t / x.n) * 100 : 0 };
};

/**
 * Muster-Auswahl zu Beginn von Abschnitt `b` nur aus Fällen bis `b - abstand`: in beiden Hälften der Vergangenheit
 * mindestens `mindestFaelleHaelfte` Fälle und Ø im Plus, insgesamt besser als die Grundrate (Gruppe „alle“ derselben
 * Spielart) und Quote ≥ mindestQuote. Wertung = (Ø − Grundrate) / Standardfehler. Die besten `maxMuster`, Vielfalt je
 * Baustein; je Gruppe nur die beste Spielart.
 */
export function auswaehlen(st: ZeitStat, b: number, r: AuswahlRegeln, kandidatGruppe: (g: number) => boolean, alleGruppe: (g: number) => number, bausteine: (g: number) => string[]): Gewaehlt[] {
  const bis = b - r.abstand;
  if (b < r.ersterAbschnitt || bis < 1) return [];
  const mitte = Math.floor(bis / 2);
  const grund = new Map<string, number>();
  const besteJe = new Map<number, Gewaehlt>();
  for (let g = 0; g < st.gruppen; g++) {
    if (!kandidatGruppe(g)) continue;
    for (let s = 0; s < st.spielarten; s++) {
      const a = kennzahl(st.bereich(g, s, 0, mitte));
      const c = kennzahl(st.bereich(g, s, mitte + 1, bis));
      if (a.n < r.mindestFaelleHaelfte || c.n < r.mindestFaelleHaelfte || a.ev <= 0 || c.ev <= 0) continue;
      const ges = kennzahl(st.bereich(g, s, 0, bis));
      if (ges.quote < r.mindestQuote) continue;
      const ag = alleGruppe(g);
      const gk = `${ag}|${s}`;
      if (!grund.has(gk)) grund.set(gk, kennzahl(st.bereich(ag, s, 0, bis)).ev);
      const vorteil = ges.ev - grund.get(gk)!;
      if (vorteil <= 0 || !(ges.se > 0)) continue;
      const w = vorteil / ges.se;
      const alt = besteJe.get(g);
      if (!alt || w > alt.wertung) besteJe.set(g, { g, s, wertung: Math.round(w * 100) / 100, ev: Math.round(ges.ev * 10) / 10, quote: Math.round(ges.quote * 10) / 10, n: ges.n });
    }
  }
  const belegt = new Map<string, number>();
  const out: Gewaehlt[] = [];
  for (const x of [...besteJe.values()].sort((p, q) => q.wertung - p.wertung)) {
    if (out.length >= r.maxMuster) break;
    const bs = bausteine(x.g);
    if (bs.some((k) => (belegt.get(k) ?? 0) >= r.maxJeBaustein)) continue;
    for (const k of bs) belegt.set(k, (belegt.get(k) ?? 0) + 1);
    out.push(x);
  }
  return out;
}

export interface Kandidat {
  /** Handelstag-Index des Stichtags (Einstieg zur nächsten Eröffnung) */
  tag: number;
  wert: string;
  wertung: number;
  netto: number;
  treffer: boolean;
  /** Handelstage bis zum Ausstieg */
  dauer: number;
  /** Muster (für die Statistik) */
  muster: string;
}

export interface Order {
  einstieg: number;
  ausstieg: number;
  wert: string;
  netto: number;
  treffer: boolean;
  muster: string;
}

/**
 * Depot nachspielen: je Tag die Kandidaten nach Wertung, höchstens `maxOffen` Orders gleichzeitig, je Wert eine, höchstens
 * `maxJeTag` neue am Tag. Eine Order belegt ihren Platz vom Einstieg (Tag nach dem Stichtag) bis zum Ausstieg.
 */
export function nachspielen(kandidaten: Kandidat[], r: { maxOffen: number; maxJeTag: number }): Order[] {
  const jeTag = new Map<number, Kandidat[]>();
  for (const k of kandidaten) (jeTag.get(k.tag) ?? jeTag.set(k.tag, []).get(k.tag)!).push(k);
  const offen: Order[] = [];
  const fertig: Order[] = [];
  for (const tag of [...jeTag.keys()].sort((a, b) => a - b)) {
    const einstieg = tag + 1;
    for (let i = offen.length - 1; i >= 0; i--) if (offen[i].ausstieg < einstieg) fertig.push(...offen.splice(i, 1));
    let neu = 0;
    for (const k of jeTag.get(tag)!.sort((a, b) => b.wertung - a.wertung)) {
      if (offen.length >= r.maxOffen || neu >= r.maxJeTag) break;
      if (offen.some((o) => o.wert === k.wert)) continue;
      offen.push({ einstieg, ausstieg: einstieg + Math.max(0, k.dauer - 1), wert: k.wert, netto: k.netto, treffer: k.treffer, muster: k.muster });
      neu++;
    }
  }
  return [...fertig, ...offen].sort((a, b) => a.einstieg - b.einstieg || a.wert.localeCompare(b.wert));
}

export interface Bilanz {
  orders: number;
  volltreffer: number;
  quote: number;
  netto: number;
  oe: number;
  /** größter Rückgang der Summe der abgeschlossenen Orders (€) */
  maxRueckgang: number;
  monate: { monat: string; orders: number; volltreffer: number; netto: number }[];
}

/** Bilanz einer nachgespielten Order-Liste; `monatVon(tag)` ordnet den Ausstiegstag einem Monat (JJJJ-MM) zu */
export function bilanz(orders: Order[], monatVon: (tag: number) => string): Bilanz {
  const zu = [...orders].sort((a, b) => a.ausstieg - b.ausstieg);
  let summe = 0;
  let hoch = 0;
  let rueck = 0;
  const monate = new Map<string, { orders: number; volltreffer: number; netto: number }>();
  for (const o of zu) {
    summe += o.netto;
    hoch = Math.max(hoch, summe);
    rueck = Math.max(rueck, hoch - summe);
    const m = monatVon(o.ausstieg);
    const x = monate.get(m) ?? monate.set(m, { orders: 0, volltreffer: 0, netto: 0 }).get(m)!;
    x.orders++;
    if (o.treffer) x.volltreffer++;
    x.netto += o.netto;
  }
  const vt = zu.filter((o) => o.treffer).length;
  return {
    orders: zu.length,
    volltreffer: vt,
    quote: zu.length ? Math.round((vt / zu.length) * 1000) / 10 : 0,
    netto: Math.round(summe),
    oe: zu.length ? Math.round((summe / zu.length) * 10) / 10 : 0,
    maxRueckgang: Math.round(rueck),
    monate: [...monate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([monat, x]) => ({ monat, orders: x.orders, volltreffer: x.volltreffer, netto: Math.round(x.netto) })),
  };
}
