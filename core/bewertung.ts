// Kurs eines Instruments in Euro: direkt, per Wechselkurs umgerechnet oder synthetisch
// (Knock-out/Turbo aus dem Basiswert, Krypto-ETN aus dem Kryptokurs).
import { runde } from './geld.ts';
import type { Hebel, KryptoEtn, Kurs, Kursbasis, OrderPlan } from './typen.ts';

/** EUR/USD als „USD je 1 EUR“, z. B. 1.08. */
export type EurUsd = number;

function kursStellen(x: number): number {
  return x < 10 ? 4 : 3;
}

/** Rechnet einen Kurs in Euro um (USD → EUR). EUR-Kurse bleiben unverändert. */
export function inEuro(k: Kurs, waehrung: Kursbasis['waehrung'], eurUsd?: EurUsd): Kurs {
  if (waehrung === 'EUR') return k;
  if (!eurUsd || !(eurUsd > 0)) throw new Error('Wechselkurs EUR/USD fehlt');
  const f = (x?: number) => (x === undefined ? undefined : runde(x / eurUsd, kursStellen(x / eurUsd)));
  return {
    ...k,
    wert: f(k.wert)!,
    geld: f(k.geld),
    brief: f(k.brief),
    vortag: f(k.vortag),
    synthetisch: true,
    hinweis: [k.hinweis, `umgerechnet zu ${eurUsd} USD/EUR`].filter(Boolean).join('; '),
  };
}

export interface HebelWert {
  /** Wert je Produkt in Euro */
  wert: number;
  knockout: boolean;
  /** Hebel = Basiswert × Bezugsverhältnis / Produktpreis */
  hebel: number;
}

/** Innerer Wert eines Knock-outs/Turbos. Basiswert S in seiner Währung; Ergebnis in Euro. */
export function hebelWert(h: Hebel, s: number, eurUsd?: EurUsd): HebelWert {
  const knockout = h.richtung === 'long' ? s <= h.koSchwelle : s >= h.koSchwelle;
  const inner = h.richtung === 'long' ? s - h.basispreis : h.basispreis - s;
  const roh = knockout ? 0 : Math.max(0, inner) * h.bezugsverhaeltnis;
  const fx = h.basiswert.kursbasis.waehrung === 'USD' ? eurUsd : 1;
  if (!fx) throw new Error('Wechselkurs EUR/USD fehlt');
  const wert = runde(roh / fx, 4);
  const hebel = wert > 0 ? runde(((s / fx) * h.bezugsverhaeltnis) / wert, 2) : Infinity;
  return { wert, knockout, hebel };
}

/** Synthetischer ETN-Kurs: Basiswert (EUR) × Anteil, abzüglich laufender Kosten seit `seit`. */
export function etnWert(etn: KryptoEtn, basisEur: number, seit: Date, jetzt: Date): number {
  const jahre = Math.max(0, (jetzt.getTime() - seit.getTime()) / (365.25 * 86400000));
  return runde(basisEur * etn.anteilProStueck * (1 - (etn.kostenProzentJahr / 100) * jahre), 4);
}

/** Welche Kursbasis braucht ein Plan? */
export function benoetigteKursbasis(p: OrderPlan): Kursbasis {
  if (p.hebel) return p.hebel.basiswert.kursbasis;
  if (p.etn) return p.etn.basiswert;
  if (!p.wertpapier.kursbasis) throw new Error(`Keine Kursbasis für ${p.wertpapier.name}`);
  return p.wertpapier.kursbasis;
}

export interface InstrumentKurs {
  kurs: Kurs;
  knockout: boolean;
  hebel?: number;
  /** Tagesveränderung des Instruments bzw. Basiswerts in % (für Ereignisläufe) */
  tagesProzent?: number;
}

/**
 * Kurs des gehandelten Instruments in Euro aus dem Kurs seiner Kursbasis.
 * `basis` ist in der Währung der Kursbasis; `etnSeit` = Kaufzeitpunkt (Kostenabzug).
 */
export function instrumentKurs(p: OrderPlan, basis: Kurs, eurUsd: EurUsd | undefined, jetzt: Date, etnSeit?: Date): InstrumentKurs {
  const kb = benoetigteKursbasis(p);
  const tagesProzent = basis.vortag ? runde((basis.wert / basis.vortag - 1) * 100, 2) : undefined;
  if (p.hebel) {
    const hw = hebelWert(p.hebel, basis.wert, eurUsd);
    return {
      kurs: { wert: hw.wert, zeit: basis.zeit, quelle: basis.quelle, verzoegertMin: basis.verzoegertMin, synthetisch: true, hinweis: `berechnet aus ${p.hebel.basiswert.name} ${basis.wert}` },
      knockout: hw.knockout,
      hebel: hw.hebel,
      tagesProzent,
    };
  }
  if (p.etn) {
    const eur = inEuro(basis, kb.waehrung, eurUsd);
    const wert = etnWert(p.etn, eur.wert, etnSeit ?? jetzt, jetzt);
    return {
      kurs: { wert, zeit: basis.zeit, quelle: basis.quelle, verzoegertMin: basis.verzoegertMin, synthetisch: true, hinweis: `berechnet aus ${kb.symbol} ${eur.wert} €` },
      knockout: false,
      tagesProzent,
    };
  }
  return { kurs: inEuro(basis, kb.waehrung, eurUsd), knockout: false, tagesProzent };
}
