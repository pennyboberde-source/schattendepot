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
  /** Abschnitte zwischen dem Abschnitt, in dem das Ergebnis eines Falls feststand (Ausstieg), und der Auswahl mindestens */
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
  /** Plattform mit ungeprüfter Handelbarkeit (CFD/außerbörslich) */
  ungeprueft?: boolean;
}

export interface Order {
  einstieg: number;
  ausstieg: number;
  wert: string;
  netto: number;
  treffer: boolean;
  muster: string;
  ungeprueft?: boolean;
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
      offen.push({ einstieg, ausstieg: einstieg + Math.max(0, k.dauer - 1), wert: k.wert, netto: k.netto, treffer: k.treffer, muster: k.muster, ...(k.ungeprueft ? { ungeprueft: true } : {}) });
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

// ---------- Live-Regel (Nutzer 20.11.2026: „Ja, darfst du machen … sei bereit, sehr schnell zurück zur 6er-Regel zu
// gehen“): die Auswahl des laufenden Halbmonats ordert sichtbar, mit Bremse ----------

/** Muster der Zeitreise-Auswahl des laufenden Halbmonats (lernen/zeitreise.json › aktuell.muster) */
export interface ZrMuster {
  schluessel: string;
  gruppe: string;
  gruppenSchluessel: string;
  sp: string;
  fenster: number;
  wertung: number;
  quote: number;
  ev: number;
  tage?: number;
}

/** Eintrag im Zeitreise-Buch (lernen/muster/zeitreise-buch.json, nur anhängen) */
export interface ZrBuchEintrag extends Partial<ZrMuster> {
  schluessel: string;
  /** gewaehlt: gilt für Stichtage ab `am`; abgewaehlt: gilt nicht mehr für Stichtage ab `am`; bremse: Regel gestoppt */
  status: 'gewaehlt' | 'abgewaehlt' | 'bremse';
  am: string;
  grund?: string;
}

/** Je Schlüssel der jüngste Eintrag mit Status „gewaehlt“ (ohne folgendes „abgewaehlt“) */
export function zrAktiv(eintraege: ZrBuchEintrag[]): Map<string, ZrBuchEintrag> {
  const m = new Map<string, ZrBuchEintrag>();
  for (const e of eintraege) {
    if (e.status === 'gewaehlt') m.set(e.schluessel, e);
    else if (e.status === 'abgewaehlt') m.delete(e.schluessel);
  }
  return m;
}

/**
 * Neue Einträge für das Buch: Muster, die neu in der Auswahl sind → „gewaehlt“, nicht mehr enthaltene → „abgewaehlt“,
 * jeweils am neuesten Stichtag ihres Markts (`ab`). Ist die Regel aus (Schalter, Bremse) → alle aktiven „abgewaehlt“.
 * `aktuell` = null (Zeitreise-Datei fehlt oder ist veraltet) → nichts ändern.
 */
export function zrBuchFortschreiben(eintraege: ZrBuchEintrag[], aktuell: ZrMuster[] | null, ab: (m: ZrMuster | ZrBuchEintrag) => string, an: boolean, grund?: string): ZrBuchEintrag[] {
  const aktiv = zrAktiv(eintraege);
  const neu: ZrBuchEintrag[] = [];
  if (!an) {
    for (const e of aktiv.values()) neu.push({ schluessel: e.schluessel, status: 'abgewaehlt', am: ab(e), ...(grund ? { grund } : {}) });
    return neu;
  }
  if (!aktuell) return neu;
  const jetzt = new Set(aktuell.map((m) => m.schluessel));
  for (const e of aktiv.values()) if (!jetzt.has(e.schluessel)) neu.push({ schluessel: e.schluessel, status: 'abgewaehlt', am: ab(e), grund: 'nicht mehr in der Auswahl des Halbmonats' });
  for (const m of aktuell) if (!aktiv.has(m.schluessel)) neu.push({ ...m, status: 'gewaehlt', am: ab(m) });
  return neu;
}

/** Gültigkeitszeiten je Muster: Stichtag ≥ von und < bis (bis = null: gilt noch) */
export function zrZeiten(eintraege: ZrBuchEintrag[]): Map<string, { von: string; bis: string | null }[]> {
  const z = new Map<string, { von: string; bis: string | null }[]>();
  for (const e of eintraege) {
    const liste = z.get(e.schluessel) ?? [];
    const letzte = liste[liste.length - 1];
    if (e.status === 'gewaehlt' && (!letzte || letzte.bis !== null)) liste.push({ von: e.am, bis: null });
    else if (e.status === 'abgewaehlt' && letzte && letzte.bis === null) letzte.bis = e.am;
    if (liste.length) z.set(e.schluessel, liste);
  }
  return z;
}

export interface ZrBremsRegel {
  /** ab so vielen abgeschlossenen Orders zählt der Durchschnitt */
  mindestOrders: number;
  /** Ø je abgeschlossener Order darunter (€) → Bremse */
  minOe: number;
  /** Summe abgeschlossen + Stand der offenen ≤ −maxVerlust (€) → Bremse, unabhängig von der Zahl */
  maxVerlust: number;
}

/** Bremse der Zeitreise-Regel: zu schlechte Orders seit dem Start → zurück zur strengen Regel */
export function zrBremse(orders: { art: string; netto: number | null }[], r: ZrBremsRegel): { aus: boolean; grund: string; abgeschlossen: number; summe: number; offen: number } {
  const fertig = orders.filter((o) => o.art !== 'offen' && o.art !== 'lauert');
  const summe = Math.round(fertig.reduce((s, o) => s + (o.netto ?? 0), 0) * 100) / 100;
  const offen = Math.round(orders.filter((o) => o.art === 'offen').reduce((s, o) => s + (o.netto ?? 0), 0) * 100) / 100;
  const oe = fertig.length ? summe / fertig.length : 0;
  const zahl = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 0 });
  if (summe + offen <= -r.maxVerlust) return { aus: true, grund: `Summe ${zahl(summe + offen)} € (abgeschlossen ${zahl(summe)} €, offen ${zahl(offen)} €) erreicht die Grenze −${zahl(r.maxVerlust)} €`, abgeschlossen: fertig.length, summe, offen };
  if (fertig.length >= r.mindestOrders && oe < r.minOe) return { aus: true, grund: `Ø ${zahl(oe)} € je Order nach ${fertig.length} Orders unter ${zahl(r.minOe)} €`, abgeschlossen: fertig.length, summe, offen };
  return { aus: false, grund: `${fertig.length} abgeschlossen, Summe ${zahl(summe)} €, offen ${zahl(offen)} €`, abgeschlossen: fertig.length, summe, offen };
}

// ---------- Prüfungen der Zeitreise (20.11.2026): Zufallsprobe (Placebo) und Modell-Zeitreise ----------

/**
 * Zufallsprobe: vertauscht die Ergebnisse (netto, Volltreffer ja/nein, Ausstiegstag) je Tag, Markt und Spielart zufällig
 * unter den Fällen dieses Tages (nur Fälle mit Ergebnis). Was danach noch gewinnt, kommt aus der Wahl der Tage und
 * Richtungen (die Marktlage bleibt an ihrem Tag), nicht aus der Wahl der Werte. Fester Zufallsstart, verändert die Felder.
 */
export function ergebnisseMischen(
  zeilen: number,
  spielarten: number,
  tagVon: (z: number) => number,
  marktVon: (z: number) => number,
  netto: Float32Array,
  art: Uint8Array,
  aus: Int32Array,
  saat = 1,
): number {
  let a = saat >>> 0;
  const zufall = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const reihenfolge = Array.from({ length: zeilen }, (_, z) => z).sort((p, q) => tagVon(p) - tagVon(q) || marktVon(p) - marktVon(q) || p - q);
  let getauscht = 0;
  let i = 0;
  const idx: number[] = [];
  while (i < reihenfolge.length) {
    let e = i;
    while (e < reihenfolge.length && tagVon(reihenfolge[e]) === tagVon(reihenfolge[i]) && marktVon(reihenfolge[e]) === marktVon(reihenfolge[i])) e++;
    for (let j = 0; j < spielarten; j++) {
      idx.length = 0;
      for (let k = i; k < e; k++) if (!Number.isNaN(netto[reihenfolge[k] * spielarten + j])) idx.push(reihenfolge[k] * spielarten + j);
      for (let k = idx.length - 1; k > 0; k--) {
        const r = Math.floor(zufall() * (k + 1));
        if (r === k) continue;
        const x = idx[k];
        const y = idx[r];
        const n = netto[x];
        netto[x] = netto[y];
        netto[y] = n;
        const t = art[x];
        art[x] = art[y];
        art[y] = t;
        const u = aus[x];
        aus[x] = aus[y];
        aus[y] = u;
        getauscht++;
      }
    }
    i = e;
  }
  return getauscht;
}

/** Kennzahlen mit dem Tag als Einheit: Ø der Tages-Ø und sein Standardfehler, dazu je Hälfte des Zeitraums */
export interface TagesKennzahlen {
  faelle: number;
  volltreffer: number;
  quote: number;
  oe: number;
  tage: number;
  oeTag: number;
  seTag: number;
  haelften: { faelle: number; quote: number; oe: number; oeTag: number; tage: number }[];
}

export function tagesKennzahlen(faelle: { tag: number; netto: number; treffer: boolean }[]): TagesKennzahlen {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const teil = (l: typeof faelle) => {
    const je = new Map<number, [number, number]>();
    for (const f of l) {
      const t = je.get(f.tag) ?? [0, 0];
      t[0] += f.netto;
      t[1]++;
      je.set(f.tag, t);
    }
    const ms = [...je.values()].map(([s, n]) => s / n);
    const m = ms.length ? ms.reduce((s, x) => s + x, 0) / ms.length : 0;
    const sd = ms.length > 1 ? Math.sqrt(ms.reduce((s, x) => s + (x - m) ** 2, 0) / (ms.length - 1)) : 0;
    const vt = l.filter((f) => f.treffer).length;
    return { faelle: l.length, volltreffer: vt, quote: l.length ? r1((vt / l.length) * 100) : 0, oe: l.length ? r1(l.reduce((s, f) => s + f.netto, 0) / l.length) : 0, tage: ms.length, oeTag: r1(m), seTag: ms.length > 1 ? r1(sd / Math.sqrt(ms.length)) : 0 };
  };
  const g = teil(faelle);
  const tage = [...new Set(faelle.map((f) => f.tag))].sort((a, b) => a - b);
  const mitte = tage.length ? tage[Math.floor(tage.length / 2)] : 0;
  const h = [teil(faelle.filter((f) => f.tag < mitte)), teil(faelle.filter((f) => f.tag >= mitte))].map(({ faelle: n, quote, oe, oeTag, tage: t }) => ({ faelle: n, quote, oe, oeTag, tage: t }));
  return { ...g, haelften: h };
}
