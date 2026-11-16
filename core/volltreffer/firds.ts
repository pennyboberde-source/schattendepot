// Echte Handelbarkeit, Stufe 1 von Quantensprung B (16.11.2026): Hebelprodukte je Basiswert aus dem amtlichen
// EU-Instrumentenregister ESMA FIRDS (frei, maschinell abrufbar). Die wöchentliche Vollliste der Klasse R
// (Optionsscheine, Turbos, Mini-Futures) nennt je Produkt und Handelsplatz: ISIN, Basiswert-ISIN, CALL/PUTO,
// Kündigung (TermntnDt) und Fälligkeit (XpryDt). gettex = MIC MUND. Basispreis/Knock-out fehlen bei Open-End-Turbos.
// Die XML-Dateien sind eine einzige Zeile (~470 MB je Teil) → stückweise an </RefData> trennen. Reine Funktionen.

export interface HebelProdukt {
  isin: string;
  /** ISIN des Basiswerts */
  basis: string;
  richtung: 'long' | 'short';
  /** Handelsplatz (MIC) */
  mic: string;
}

const feld = (s: string, re: RegExp) => re.exec(s)?.[1];

/** Ein Datensatz (Text zwischen <RefData> und </RefData>) → Produkt, wenn gültig an diesem Tag; sonst null */
export function produktLesen(r: string, heute: string): HebelProdukt | null {
  const typ = feld(r, /<OptnTp>([A-Z]+)<\/OptnTp>/);
  const richtung = typ === 'CALL' ? 'long' : typ === 'PUTO' ? 'short' : null;
  if (!richtung) return null;
  const basis = feld(r, /<UndrlygInstrm><Sngl><ISIN>([A-Z0-9]{12})<\/ISIN>/);
  const isin = feld(r, /<FinInstrmGnlAttrbts><Id>([A-Z0-9]{12})<\/Id>/);
  const mic = feld(r, /<TradgVnRltdAttrbts><Id>([A-Z0-9]{4})<\/Id>/);
  if (!basis || !isin || !mic) return null;
  // gekündigt (z. B. Knock-out) oder abgelaufen → nicht mehr handelbar
  const ende = feld(r, /<TermntnDt>(\d{4}-\d{2}-\d{2})/);
  if (ende && ende <= heute) return null;
  const faellig = feld(r, /<XpryDt>(\d{4}-\d{2}-\d{2})<\/XpryDt>/);
  if (faellig && faellig < heute) return null;
  return { isin, basis, richtung, mic };
}

/** Liest einen Datenstrom stückweise; liefert je Aufruf die vollständigen Datensätze */
export class FirdsLeser {
  private rest = '';
  private heute: string;
  constructor(heute: string) {
    this.heute = heute;
  }
  teil(text: string): HebelProdukt[] {
    const stuecke = (this.rest + text).split('</RefData>');
    this.rest = stuecke.pop() ?? '';
    const aus: HebelProdukt[] = [];
    for (const s of stuecke) {
      const p = produktLesen(s, this.heute);
      if (p) aus.push(p);
    }
    return aus;
  }
}

/** Zählstand je Basiswert: [gettex, andere deutsche Börse (größter Einzelplatz)] je Richtung */
export interface HebelStand {
  l: [number, number];
  s: [number, number];
}

/** Zähler: gettex-Einträge je Basiswert/Richtung; für andere Plätze je Platz, am Ende der größte (ein Produkt steht je Platz einmal) */
export class HebelZaehler {
  private gettex = new Map<string, [number, number]>();
  private andere = new Map<string, Map<string, [number, number]>>();
  private gettexMic: string;
  private andereMics: Set<string>;
  constructor(gettexMic: string, andereMics: Set<string>) {
    this.gettexMic = gettexMic;
    this.andereMics = andereMics;
  }
  add(p: HebelProdukt) {
    const k = p.richtung === 'long' ? 0 : 1;
    if (p.mic === this.gettexMic) {
      const g = this.gettex.get(p.basis) ?? this.gettex.set(p.basis, [0, 0]).get(p.basis)!;
      g[k]++;
    } else if (this.andereMics.has(p.mic)) {
      const m = this.andere.get(p.basis) ?? this.andere.set(p.basis, new Map()).get(p.basis)!;
      const a = m.get(p.mic) ?? m.set(p.mic, [0, 0]).get(p.mic)!;
      a[k]++;
    }
  }
  ergebnis(): Record<string, HebelStand> {
    const aus: Record<string, HebelStand> = {};
    for (const b of new Set([...this.gettex.keys(), ...this.andere.keys()])) {
      const g = this.gettex.get(b) ?? [0, 0];
      const a = [...(this.andere.get(b)?.values() ?? [])];
      const am = (k: 0 | 1) => a.reduce((m, x) => Math.max(m, x[k]), 0);
      aus[b] = { l: [g[0], am(0)], s: [g[1], am(1)] };
    }
    return aus;
  }
}

/** Gibt es ein Produkt in der Richtung? nurGettex: nur gettex zählt (wie das Gebührenmodell), sonst auch andere Börsen */
export function hebelDa(stand: HebelStand | undefined, richtung: 'long' | 'short', nurGettex: boolean): boolean {
  if (!stand) return false;
  const [g, a] = richtung === 'long' ? stand.l : stand.s;
  return g > 0 || (!nurGettex && a > 0);
}
