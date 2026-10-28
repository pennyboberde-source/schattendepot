// Wochenzeugnis (Plan Datenkrake S4): Code vergibt samstags eine Schulnote 1–6 für die Woche – Depot gegen den
// MSCI World, Daytrading nach Gebühren, Trefferquote, Claudes Tagesprognose, ehrliche Chancen (Kalibrierung) und das
// Schattenbuch. Fächer ohne genug Daten zählen nicht. Kein Urteil von Claude nötig, kostet kein Nutzungslimit.
import { runde } from './geld.ts';

export interface ZeugnisFach {
  fach: string;
  note: number;
  gewicht: number;
  wert: string;
}

export interface Wochenzeugnis {
  von: string;
  bis: string;
  kw: number;
  note: number | null;
  notenText: string;
  faecher: ZeugnisFach[];
}

export interface ZeugnisDaten {
  /** in der Woche abgeschlossene Depot-Orders */
  depot: { anzahl: number; netto: number; etfNetto: number; treffer: number; konfidenzSchnitt: number };
  daytrading: { anzahl: number; netto: number; treffer: number };
  prognose?: { n: number; quote: number };
  schattenbuch?: { n: number; quote: number };
}

/** Wert → Note über absteigende Schwellen (≥ erste Schwelle = 1, …, darunter 6). */
export function noteAus(wert: number, schwellen: [number, number, number, number, number]): number {
  const i = schwellen.findIndex((s) => wert >= s);
  return i === -1 ? 6 : i + 1;
}

export function notenText(n: number | null): string {
  if (n === null) return 'keine Note (zu wenig Daten)';
  const t = n < 1.5 ? 'sehr gut' : n < 2.5 ? 'gut' : n < 3.5 ? 'befriedigend' : n < 4.5 ? 'ausreichend' : n < 5.5 ? 'mangelhaft' : 'ungenügend';
  return `${n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${t})`;
}

/** ISO-Kalenderwoche */
export function kalenderwoche(datum: string): number {
  const d = new Date(`${datum}T12:00:00Z`);
  const tag = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - tag + 3);
  const erster = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d.getTime() - erster.getTime()) / 86400000 - 3 + ((erster.getUTCDay() + 6) % 7)) / 7);
}

const pz = (x: number) => `${x > 0 ? '+' : ''}${x.toLocaleString('de-DE', { maximumFractionDigits: 2 })} %`;

export function wochenzeugnis(d: ZeugnisDaten, von: string, bis: string, orderBetrag = 1000): Wochenzeugnis {
  const f: ZeugnisFach[] = [];
  if (d.depot.anzahl) {
    const vorsprung = ((d.depot.netto - d.depot.etfNetto) / (d.depot.anzahl * orderBetrag)) * 100;
    f.push({ fach: 'Depot gegen MSCI World', note: noteAus(vorsprung, [2, 1, 0, -1, -2]), gewicht: 3, wert: `${pz(runde(vorsprung, 2))} je Order (${d.depot.anzahl} Orders)` });
  }
  if (d.daytrading.anzahl) {
    const je = (d.daytrading.netto / (d.daytrading.anzahl * orderBetrag)) * 100;
    f.push({ fach: 'Daytrading nach Gebühren', note: noteAus(je, [0.5, 0.2, 0, -0.2, -0.5]), gewicht: 2, wert: `${pz(runde(je, 2))} je Trade (${d.daytrading.anzahl} Trades)` });
  }
  const n = d.depot.anzahl + d.daytrading.anzahl;
  if (n >= 3) {
    const quote = ((d.depot.treffer + d.daytrading.treffer) / n) * 100;
    f.push({ fach: 'Trefferquote', note: noteAus(quote, [60, 50, 45, 40, 30]), gewicht: 1, wert: `${runde(quote, 1).toLocaleString('de-DE')} % von ${n}` });
  }
  if (d.depot.anzahl >= 3) {
    const abw = Math.abs(d.depot.konfidenzSchnitt - (d.depot.treffer / d.depot.anzahl) * 100);
    f.push({ fach: 'Ehrliche Chancen (Kalibrierung)', note: noteAus(-abw, [-5, -10, -15, -20, -30]), gewicht: 1, wert: `${runde(abw, 1).toLocaleString('de-DE')} Punkte daneben` });
  }
  if (d.prognose && d.prognose.n >= 5) f.push({ fach: 'Claudes Tagesprognose', note: noteAus(d.prognose.quote, [65, 58, 52, 48, 42]), gewicht: 1, wert: `${d.prognose.quote.toLocaleString('de-DE')} % richtig (n=${d.prognose.n})` });
  if (d.schattenbuch && d.schattenbuch.n >= 10) f.push({ fach: 'Schattenbuch (Signale nach 1 Tag)', note: noteAus(d.schattenbuch.quote, [60, 55, 50, 45, 40]), gewicht: 1, wert: `${d.schattenbuch.quote.toLocaleString('de-DE')} % im Plus (n=${d.schattenbuch.n})` });
  const g = f.reduce((a, x) => a + x.gewicht, 0);
  const note = g ? runde(f.reduce((a, x) => a + x.note * x.gewicht, 0) / g, 1) : null;
  return { von, bis, kw: kalenderwoche(von), note, notenText: notenText(note), faecher: f };
}
