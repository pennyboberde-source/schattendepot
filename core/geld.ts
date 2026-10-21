// Rundung und deutsche Formatierung – gemeinsam für App, Push-Texte und Berichte.

/** Kaufmännisch auf `stellen` Nachkommastellen runden (Standard: Cent), robust gegen Gleitkomma-Reste. */
export function runde(x: number, stellen = 2): number {
  const f = 10 ** stellen;
  const v = Math.round(Number((Math.abs(x) * f).toPrecision(15))) / f;
  return x < 0 ? -v : v;
}

const NBSP = ' ';
const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const zahlFmt = (min: number, max: number) =>
  new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });

/** 1234.5 → "1.234,50 €"; Kurse unter 1 € mit bis zu 4 Nachkommastellen. Minus als echtes Minuszeichen. */
export function euro(x: number, opt: { vorzeichen?: boolean } = {}): string {
  const text = Math.abs(x) < 1 && x !== 0 ? `${zahlFmt(2, 4).format(x)}${NBSP}€` : euroFmt.format(x);
  return (opt.vorzeichen && x > 0 ? `+${text}` : text.replace('-', '−')).replace(/ /g, NBSP);
}

/** 5.4 → "+5,4 %" (mit Vorzeichen). */
export function prozent(x: number, opt: { vorzeichen?: boolean; stellen?: number } = {}): string {
  const { vorzeichen = true, stellen = 1 } = opt;
  const text = `${zahlFmt(stellen, stellen).format(Math.abs(x))}${NBSP}%`;
  if (x > 0 && vorzeichen) return `+${text}`;
  if (x < 0 && runde(x, stellen) !== 0) return `−${text}`;
  return text;
}

export function zahl(x: number, stellen = 2): string {
  return zahlFmt(stellen, stellen).format(x);
}
