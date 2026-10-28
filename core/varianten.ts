// Varianten-Schattenbuch (Nutzer 28.10.2026: „nicht nur Hebel – herausfiltern, wo was zum Einsatz kommt“):
// Für jedes gemessene Signal wird virtuell durchgerechnet, was jede Spielart gebracht hätte –
// Richtung (mit dem Signal / dagegen), Instrument (Aktie bzw. Turbo mit Hebel 2–50) und Haltedauer (1/3/5/10 Handelstage).
// Gewählt wird die beste Variante nach einem vorsichtigen Maß (Ø minus ein Standardfehler), damit nicht der Zufall
// einer kleinen Stichprobe gewinnt. Grob, aber ehrlich: zwischen den Messpunkten ist der Verlauf unbekannt.
import { runde } from './geld.ts';
import type { TrackingEintrag } from './statistik.ts';
import type { MarktGruppe } from './autopilot.ts';

export type Horizont = 'r1T' | 'r3T' | 'r1W' | 'r10T';
export const HORIZONT_TAGE: Record<Horizont, number> = { r1T: 1, r3T: 3, r1W: 5, r10T: 10 };
const HORIZONTE: Horizont[] = ['r1T', 'r3T', 'r1W', 'r10T'];

export interface Variante {
  richtung: 'mit' | 'gegen';
  hebel: number;
  horizont: Horizont;
  faelle: number;
  /** Anteil der Fälle mit Gewinn nach Kosten in % */
  chance: number;
  /** Ø Ergebnis nach Kosten in % des Einsatzes */
  oeNetto: number;
  /** vorsichtiges Maß: Ø minus ein Standardfehler */
  wertung: number;
  /** Anteil der Fälle mit Knock-out in % */
  knockout: number;
  /** höchster vertretbarer Hebel (Anteil der Kelly-Grenze aus Vorteil und Schwankung, max. hebelMax) */
  hebelGrenze?: number;
}

export interface VariantenErgebnis {
  typ: string;
  gruppe: MarktGruppe;
  beste: Variante | null;
  /** zum Vergleich: einfach mit dem Signal kaufen, ohne Hebel, gleiche Haltedauer wie die beste Variante */
  basis: Variante | null;
  /** Volltreffer: Anteil der Fälle, in denen der Wert binnen 2 Wochen mindestens `schwelle` % in Signalrichtung lief (an einem Messpunkt) */
  volltreffer?: { anteil: number; faelle: number; schwelle: number };
}

export interface VariantenKosten {
  /** Spread hin und zurück in % für die Aktie bzw. das Krypto-Direktgeschäft (Gebühren Smartbroker+ 0 €) */
  aktie: number;
  krypto: number;
  /** Spread des Turbos hin und zurück in % */
  turbo: number;
  /** Finanzierungskosten des Turbos in % p. a. auf den Basiswert-Gegenwert (≈ Hebel × Einsatz) */
  finanzierungProzentJahr: number;
  /** Knock-out schon bei diesem Anteil des Abstands (z. B. 0,6): zwischen den Messpunkten sind Tiefs unbekannt → vorsichtig */
  koPuffer?: number;
}

const HEBEL_AKTIE = [1, 2, 3, 5, 10, 20, 30, 50];

/** Ergebnis einer Variante für einen Fall (in % des Einsatzes) oder null, wenn der Messpunkt fehlt. */
export function fallErgebnis(t: TrackingEintrag, richtung: 'mit' | 'gegen', hebel: number, horizont: Horizont, kosten: VariantenKosten, krypto: boolean): { ergebnis: number; knockout: boolean } | null {
  const bis = HORIZONTE.indexOf(horizont);
  const pfad = HORIZONTE.slice(0, bis + 1).map((h) => t[h]);
  const r = pfad[pfad.length - 1];
  if (typeof r !== 'number') return null;
  const d = richtung === 'mit' ? 1 : -1;
  if (hebel === 1) return { ergebnis: d * r - (krypto ? kosten.krypto : kosten.aktie), knockout: false };
  // Turbo: Knock-out, sobald ein Messpunkt die Schwelle (−100 % / Hebel) erreicht
  const ko = pfad.some((x) => typeof x === 'number' && d * x <= (-100 / hebel) * (kosten.koPuffer ?? 1));
  const finanz = (hebel * kosten.finanzierungProzentJahr * HORIZONT_TAGE[horizont]) / 365;
  return { ergebnis: ko ? -100 : Math.max(-100, hebel * d * r) - kosten.turbo - finanz, knockout: ko };
}

/** Tatsächliche Handelsrichtung: Signal long (Score > 0) „mit“ = kaufen; „gegen“ dreht um. */
export const handelLong = (t: TrackingEintrag, richtung: 'mit' | 'gegen') => (t.score > 0) === (richtung === 'mit');

function variante(faelle: TrackingEintrag[], richtung: 'mit' | 'gegen', hebel: number, horizont: Horizont, kosten: VariantenKosten, krypto: boolean): Variante | null {
  // ohne Hebel geht nur Kaufen (kein Leerverkauf) → nur Fälle, in denen die Variante long handelt
  const e = (hebel === 1 ? faelle.filter((t) => handelLong(t, richtung)) : faelle).map((t) => fallErgebnis(t, richtung, hebel, horizont, kosten, krypto)).filter((x): x is { ergebnis: number; knockout: boolean } => !!x);
  if (e.length < 3) return null;
  const n = e.length;
  const m = e.reduce((a, x) => a + x.ergebnis, 0) / n;
  const sd = Math.sqrt(e.reduce((a, x) => a + (x.ergebnis - m) ** 2, 0) / Math.max(1, n - 1));
  return {
    richtung,
    hebel,
    horizont,
    faelle: n,
    chance: runde((e.filter((x) => x.ergebnis > 0).length / n) * 100, 1),
    oeNetto: runde(m, 2),
    wertung: runde(m - sd / Math.sqrt(n), 2),
    knockout: runde((e.filter((x) => x.knockout).length / n) * 100, 1),
  };
}

/**
 * Beste Variante je Signaltyp und Marktgruppe. Krypto nur direkt mit dem Signal (kein Krypto-Turbo, kein Short).
 * Ohne Hebel nur Fälle, die long gehandelt würden (Aktien lassen sich nicht leerverkaufen); short geht über Turbos.
 */
export function variantenSchattenbuch(
  tracking: TrackingEintrag[],
  gruppeVon: (t: TrackingEintrag) => MarktGruppe | null,
  kosten: VariantenKosten,
  e: { mindestFaelle: number; mindestChance: number; volltrefferProzent?: number; kellyAnteil?: number; hebelMax?: number },
): VariantenErgebnis[] {
  const je = new Map<string, { typ: string; gruppe: MarktGruppe; faelle: TrackingEintrag[] }>();
  for (const t of tracking) {
    if (t.art === 'prognose' || t.pump) continue;
    const g = gruppeVon(t);
    if (!g) continue;
    for (const typ of new Set(t.typen)) {
      const k = `${typ}|${g}`;
      if (!je.has(k)) je.set(k, { typ, gruppe: g, faelle: [] });
      je.get(k)!.faelle.push(t);
    }
  }
  const out: VariantenErgebnis[] = [];
  for (const { typ, gruppe, faelle } of je.values()) {
    const krypto = gruppe === 'krypto';
    const alle: Variante[] = [];
    for (const horizont of HORIZONTE) {
      for (const hebel of krypto ? [1] : HEBEL_AKTIE) {
        for (const richtung of krypto ? (['mit'] as const) : (['mit', 'gegen'] as const)) {
          const v = variante(faelle, richtung, hebel, horizont, kosten, krypto);
          if (v) alle.push(v);
        }
      }
    }
    if (!alle.length) continue;
    // Klug begrenzen (Nutzer: „nicht immer Hebel 20“): erlaubt ist höchstens der Anteil (Standard ½) der Kelly-Grenze
    // μ/σ² der ungehebelten Bewegung je Richtung und Haltedauer – mehr Hebel nur bei starkem UND gleichmäßigem Vorteil.
    const grenze = (richtung: 'mit' | 'gegen', horizont: Horizont) => {
      const r = faelle.map((t) => t[horizont]).filter((x): x is number => typeof x === 'number').map((x) => (richtung === 'mit' ? x : -x) - (krypto ? kosten.krypto : kosten.aktie));
      if (r.length < 3) return 1;
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const sd = Math.max(0.5, Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)));
      return m <= 0 ? 1 : Math.min(e.hebelMax ?? 50, (e.kellyAnteil ?? 0.5) * ((100 * m) / sd ** 2));
    };
    for (const v of alle) v.hebelGrenze = runde(grenze(v.richtung, v.horizont), 1);
    const tauglich = alle.filter((v) => v.faelle >= e.mindestFaelle && v.chance >= e.mindestChance && v.wertung > 0 && (v.hebel === 1 || v.hebel <= (v.hebelGrenze ?? 1)));
    const beste = tauglich.sort((a, b) => b.wertung - a.wertung)[0] ?? null;
    const basis = alle.find((v) => v.richtung === 'mit' && v.hebel === 1 && v.horizont === (beste?.horizont ?? 'r3T')) ?? null;
    const schwelle = e.volltrefferProzent ?? 15;
    const gemessen = faelle.filter((t) => HORIZONTE.some((h) => typeof t[h] === 'number'));
    const treffer = gemessen.filter((t) => Math.max(...HORIZONTE.map((h) => (typeof t[h] === 'number' ? (t[h] as number) : -Infinity))) >= schwelle).length;
    out.push({ typ, gruppe, beste, basis, ...(gemessen.length ? { volltreffer: { anteil: runde((treffer / gemessen.length) * 100, 1), faelle: gemessen.length, schwelle } } : {}) });
  }
  return out.sort((a, b) => (b.beste?.wertung ?? -999) - (a.beste?.wertung ?? -999));
}

/** Text für Kontext/App: „mit dem Signal, Turbo Hebel 3, 1 Woche: Ø +6,1 %, 58 % im Plus (n=34)“ */
export function varianteText(v: Variante): string {
  const was = v.hebel === 1 ? 'direkt' : `Turbo Hebel ${v.hebel}`;
  const dauer = v.horizont === 'r1T' ? '1 Tag' : v.horizont === 'r3T' ? '3 Tage' : v.horizont === 'r1W' ? '1 Woche' : '2 Wochen';
  return `${v.richtung === 'mit' ? 'mit dem Signal' : 'gegen das Signal'}, ${was}, ${dauer}: Ø ${v.oeNetto > 0 ? '+' : ''}${v.oeNetto.toLocaleString('de-DE')} %, ${v.chance.toLocaleString('de-DE')} % im Plus${v.knockout ? `, ${v.knockout.toLocaleString('de-DE')} % Knock-out` : ''} (n=${v.faelle})${v.hebel > 1 && v.hebelGrenze ? `; Hebel-Grenze ${v.hebelGrenze.toLocaleString('de-DE')}` : ''}`;
}
