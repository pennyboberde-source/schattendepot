// Verlauf je Order für die Kurve im Order-Detail. Seit dem 14.11.2026 (Lösung B des Nutzers) steht im öffentlichen
// Datenzweig keine Kursreihe in Euro mehr, sondern die Veränderung seit dem Kauf in Prozent, auf eine Nachkommastelle.
import { runde } from './geld.ts';

export interface VerlaufProzent {
  einheit: 'prozent';
  /** [Zeit (ISO), Veränderung seit Kauf in %] */
  punkte: [string, number][];
}

/** altes Format: Kursreihe in Euro */
export type VerlaufAlt = [string, number][];

export const istVerlaufProzent = (v: unknown): v is VerlaufProzent => !!v && typeof v === 'object' && !Array.isArray(v) && (v as VerlaufProzent).einheit === 'prozent' && Array.isArray((v as VerlaufProzent).punkte);

const prozent = (kurs: number, kaufkurs: number) => runde((kurs / kaufkurs - 1) * 100, 1);

/** Alte Kursreihe (Euro) in Prozent seit Kauf umrechnen; ein Verlauf im neuen Format bleibt, wie er ist. */
export function verlaufInProzent(v: VerlaufProzent | VerlaufAlt | null | undefined, kaufkurs: number): VerlaufProzent {
  if (istVerlaufProzent(v)) return v;
  if (!Array.isArray(v) || !(kaufkurs > 0)) return { einheit: 'prozent', punkte: [] };
  return { einheit: 'prozent', punkte: v.filter((p) => Array.isArray(p) && typeof p[1] === 'number' && p[1] > 0).map((p) => [p[0], prozent(p[1], kaufkurs)]) };
}

/** Einen Punkt anhängen (ein Punkt je Kurszeit, höchstens `max` Punkte). */
export function verlaufPunkt(v: VerlaufProzent, zeit: string, kurs: number, kaufkurs: number, max = 2500): VerlaufProzent {
  if (!(kaufkurs > 0) || !(kurs > 0) || v.punkte.at(-1)?.[0] === zeit) return v;
  return { einheit: 'prozent', punkte: [...v.punkte, [zeit, prozent(kurs, kaufkurs)] as [string, number]].slice(-max) };
}
