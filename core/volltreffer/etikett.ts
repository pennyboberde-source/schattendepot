// Volltreffer-Etikett (Plan Volltreffer, Abschnitt 3): Wäre eine 1.000-€-Order ab diesem Stichtag ein Volltreffer
// geworden – mindestens +400 € netto –, bevor der Stop (100/150/250 € Verlust) oder der Knock-out kam?
// Reine Funktionen auf Tageskerzen. Kein Rückschaufehler: Eingestiegen wird zur Eröffnung des Folgetags (mit Spread),
// danach entscheiden Hoch und Tief jedes Tags. Liegen Ziel und Stop am selben Tag, zählt der Stop. Eröffnet der Kurs
// jenseits von Stop oder Ziel, gilt der Eröffnungskurs.
// Nachziehstop (Spielart mit `nachziehAb`): Hat die Order bis zum Vortag zwischenzeitlich mindestens `nachziehAb` €
// gebracht, sichert der Stop ab dem nächsten Tag `nachziehAnteil` dieses besten Stands. Nachgezogen wird einmal am Tag
// nach dem Schluss (wie ein Händler, der abends den Stop anpasst) – so braucht es keine Annahme über den Verlauf im Tag.

export interface Kerze {
  datum: string;
  o: number;
  h: number;
  l: number;
  c: number;
  /** Stück (optional, für Merkmale) */
  v?: number;
}

export interface EtikettKosten {
  /** Einsatz je Order in € */
  einsatz: number;
  /** Volltreffer ab diesem Nettogewinn in € */
  ziel: number;
  /** Beinahe-Treffer ab diesem Nettogewinn in € (Ziel nicht erreicht) */
  beinahe: number;
  /** Spread des direkten Geschäfts hin und zurück in % (die Hälfte je Seite) */
  spreadProzent: number;
  /** Entgelt je Order beim direkten Geschäft in € (Smartbroker+ gettex 0 €, Krypto direkt Trade Republic 1 €) */
  entgeltDirekt: number;
  /** Spread des Turbos hin und zurück in % des Turbopreises */
  turboSpreadProzent: number;
  /** Entgelt je Turbo-Order in € (UniCredit über Smartbroker+ 0 €) */
  entgeltTurbo: number;
  /** Finanzierung des Turbos in % p. a. auf den Basiswert-Gegenwert (Hebel × Einsatz), je Kalendertag */
  finanzierungProzentJahr: number;
}

export interface Spielart {
  /** 1 = direkt, sonst Turbo mit diesem Hebel */
  hebel: number;
  /** short nur über Turbos */
  richtung: 'long' | 'short';
  /** Stop bei diesem Verlust in € (netto) */
  stopEuro: number;
  /** Nachziehstop ab diesem besten Zwischenstand in € (fehlt = ohne Nachziehstop) */
  nachziehAb?: number;
  /** Anteil des besten Zwischenstands, den der Nachziehstop sichert (0,5 = die Hälfte) */
  nachziehAnteil?: number;
}

export interface Ausgang {
  /** gesichert = Ausstieg am Nachziehstop */
  art: 'treffer' | 'niete' | 'zeit' | 'gesichert';
  /** Handelstag des Ausstiegs (1 = Einstiegstag) */
  tag: number;
  /** Ergebnis in € nach allen Kosten */
  netto: number;
  /** bester Zwischenstand in € (am Tageshoch bzw. -tief), höchstens bis zum Ausstieg */
  bestNetto: number;
  knockout?: boolean;
  /** Beinahe-Treffer: kein Volltreffer, aber zwischenzeitlich mindestens `beinahe` € */
  beinahe?: boolean;
}

const runde2 = (x: number) => Math.round(x * 100) / 100;
const kalendertage = (von: string, bis: string) => Math.max(0, Math.round((Date.parse(`${bis}T12:00:00Z`) - Date.parse(`${von}T12:00:00Z`)) / 86400000));

/**
 * Rechenmodell einer Spielart. Die Bewegung m ist die Veränderung des Basiswerts seit dem Einstieg in Handelsrichtung
 * (long: Kurs/Einstieg − 1, short: −(Kurs/Einstieg − 1)).
 *   direkt: Wert = Einsatz × (1 + m) × (1 − s/2)/(1 + s/2)
 *   Turbo:  Wert = Einsatz × (1 − t/2)² × max(0, 1 + Hebel × m), Knock-out bei m ≤ −1/Hebel; dazu Finanzierung je Kalendertag
 */
export function spielartModell(sp: Spielart, k: EtikettKosten) {
  const turbo = sp.hebel > 1;
  if (!turbo && sp.richtung === 'short') throw new Error('short nur über Turbos');
  const entgelte = 2 * (turbo ? k.entgeltTurbo : k.entgeltDirekt);
  const faktor = turbo ? (1 - k.turboSpreadProzent / 200) ** 2 : (1 - k.spreadProzent / 200) / (1 + k.spreadProzent / 200);
  const finanz = (tage: number) => (turbo ? (sp.hebel * k.einsatz * k.finanzierungProzentJahr * tage) / 36500 : 0);
  const ko = turbo ? -1 / sp.hebel : -Infinity;
  /** Netto in € bei Bewegung m nach `tage` Kalendertagen */
  const netto = (m: number, tage: number) => {
    const wert = turbo ? k.einsatz * faktor * Math.max(0, 1 + sp.hebel * m) : k.einsatz * faktor * (1 + m);
    return wert - k.einsatz - entgelte - finanz(tage);
  };
  /** Bewegung, bei der das Netto genau `n` € beträgt */
  const bewegung = (n: number, tage: number) => {
    const x = (k.einsatz + entgelte + finanz(tage) + n) / (k.einsatz * faktor);
    return turbo ? (x - 1) / sp.hebel : x - 1;
  };
  return { turbo, netto, bewegung, ko };
}

/**
 * Ausgang einer Spielart ab Stichtag `i` (der Tag, an dessen Ende das Signal bekannt ist) für jedes Fenster
 * (Haltedauer in Handelstagen, gezählt ab dem Einstiegstag). `null`, wenn die Kerzen für das Fenster nicht reichen.
 */
export function etikett(kerzen: Kerze[], i: number, sp: Spielart, k: EtikettKosten, fenster: number[]): (Ausgang | null)[] {
  const einstieg = kerzen[i + 1];
  if (!einstieg || !(einstieg.o > 0)) return fenster.map(() => null);
  const mod = spielartModell(sp, k);
  const d = sp.richtung === 'long' ? 1 : -1;
  const s0 = einstieg.o;
  const bew = (kurs: number) => d * (kurs / s0 - 1);
  const maxF = Math.max(...fenster);
  let ausgang: Ausgang | null = null;
  let best = -Infinity;
  /** Zwischenstand je Tag bis zum Ausstieg, für die Fenster ohne Ausstieg */
  const stand: { netto: number; best: number }[] = [];
  for (let j = 1; j <= maxF; j++) {
    const kz = kerzen[i + j];
    if (!kz) break;
    const tage = kalendertage(einstieg.datum, kz.datum);
    const mZiel = mod.bewegung(k.ziel, tage);
    // Nachziehstop: aus dem besten Stand bis zum Vortag (am Einstiegstag gibt es noch keinen)
    const gesichert = sp.nachziehAb !== undefined && j > 1 && best >= sp.nachziehAb ? (sp.nachziehAnteil ?? 0.5) * best : null;
    const stopArt: Ausgang['art'] = gesichert !== null && gesichert > -sp.stopEuro ? 'gesichert' : 'niete';
    const mStop = mod.bewegung(stopArt === 'gesichert' ? gesichert! : -sp.stopEuro, tage);
    const gunst = bew(d === 1 ? kz.h : kz.l);
    const ungunst = bew(d === 1 ? kz.l : kz.h);
    const ende = (art: Ausgang['art'], m: number, ko = false): Ausgang => {
      // beim Knock-out ist der Turbo wertlos (vorsichtig: kein Restwert) – das Modell liefert dann −Einsatz − Kosten
      const netto = runde2(mod.netto(ko ? mod.ko : m, tage));
      return { art, tag: j, netto, bestNetto: runde2(Math.max(best, netto)), ...(ko ? { knockout: true } : {}) };
    };
    // Eröffnung jenseits von Stop/Knock-out oder Ziel (ab Tag 2; am Einstiegstag ist die Eröffnung der Einstieg)
    if (j > 1) {
      const mo = bew(kz.o);
      if (mo <= mod.ko) ausgang = ende('niete', mo, true);
      else if (mo <= mStop) ausgang = ende(stopArt, mo);
      else if (mo >= mZiel) {
        best = Math.max(best, mod.netto(mo, tage));
        ausgang = ende('treffer', mo);
      }
      if (ausgang) break;
    }
    // im Tagesverlauf: Stop vor Ziel (vorsichtig – die Reihenfolge innerhalb des Tags ist unbekannt)
    if (ungunst <= mStop) {
      ausgang = mStop <= mod.ko ? ende('niete', mod.ko, true) : ende(stopArt, mStop);
      break;
    }
    best = Math.max(best, mod.netto(gunst, tage));
    if (gunst >= mZiel) {
      ausgang = ende('treffer', mZiel);
      break;
    }
    stand.push({ netto: runde2(mod.netto(bew(kz.c), tage)), best: runde2(best) });
  }
  return fenster.map((f) => {
    if (ausgang && ausgang.tag <= f) return { ...ausgang, ...(ausgang.art !== 'treffer' && ausgang.bestNetto >= k.beinahe ? { beinahe: true } : {}) };
    const st = stand[f - 1];
    if (!st) return null;
    return { art: 'zeit', tag: f, netto: st.netto, bestNetto: st.best, ...(st.best >= k.beinahe && st.netto < k.ziel ? { beinahe: true } : {}) };
  });
}

/**
 * Episoden: Ein Sprung beginnt am ersten Treffer-Tag nach mindestens `abstand` Handelstagen ohne Treffer.
 * `treffer[i]` = war der Stichtag i ein Volltreffer? Rückgabe: Indizes der Episodenbeginne.
 */
export function sprungEpisoden(treffer: boolean[], abstand = 10): number[] {
  const beginne: number[] = [];
  let letzter = -Infinity;
  for (let i = 0; i < treffer.length; i++) {
    if (!treffer[i]) continue;
    if (i - letzter > abstand) beginne.push(i);
    letzter = i;
  }
  return beginne;
}

export interface NachziehEinstellung {
  /** Nachziehstop ab diesem besten Zwischenstand in € */
  ab: number;
  /** gesicherter Anteil des besten Stands */
  anteil: number;
  /** nur für diese Stops zusätzlich eine Spielart mit Nachziehstop */
  stops: number[];
}

/** Alle Spielarten aus einer Einstellung: direkt nur long, Turbos long und short; mit `nachzieh` zusätzlich je Stop eine Spielart mit Nachziehstop. */
export function spielarten(hebel: number[], stops: number[], nachzieh?: NachziehEinstellung): Spielart[] {
  const liste: Spielart[] = [];
  for (const h of hebel)
    for (const r of h > 1 ? (['long', 'short'] as const) : (['long'] as const))
      for (const s of stops) {
        liste.push({ hebel: h, richtung: r, stopEuro: s });
        if (nachzieh?.stops.includes(s)) liste.push({ hebel: h, richtung: r, stopEuro: s, nachziehAb: nachzieh.ab, nachziehAnteil: nachzieh.anteil });
      }
  return liste;
}

export const spielartText = (sp: Spielart) =>
  `${sp.hebel > 1 ? `Turbo ${sp.richtung === 'long' ? 'long' : 'short'} Hebel ${sp.hebel}` : 'direkt'}, Stop ${sp.stopEuro} €${sp.nachziehAb !== undefined ? `, Nachziehstop ab ${sp.nachziehAb} €` : ''}`;
