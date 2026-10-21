// Datums- und Zeitanzeige in Europe/Berlin.
const tz = 'Europe/Berlin';
const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('de-DE', { timeZone: tz, ...o });
const datumFmt = fmt({ weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
const kurzFmt = fmt({ weekday: 'short', day: '2-digit', month: '2-digit' });
const uhrFmt = fmt({ hour: '2-digit', minute: '2-digit' });

export const datum = (iso: string) => datumFmt.format(new Date(iso));
export const datumKurz = (iso: string) => kurzFmt.format(new Date(iso));
export const uhrzeit = (iso: string) => uhrFmt.format(new Date(iso));
export const datumUhr = (iso: string) => `${kurzFmt.format(new Date(iso))}, ${uhrFmt.format(new Date(iso))}`;

/** "vor 12 Min.", "vor 3 Std.", sonst Datum. */
export function relativ(iso: string, jetzt = Date.now()): string {
  const min = Math.round((jetzt - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 24 * 60) return `vor ${Math.round(min / 60)} Std.`;
  return datumUhr(iso);
}

/** Restzeit bis `iso`: "2 T 4 Std.", "3 Std. 10 Min.", "fällig". */
export function countdown(iso: string, jetzt = Date.now()): string {
  const min = Math.round((new Date(iso).getTime() - jetzt) / 60000);
  if (min <= 0) return 'fällig';
  const t = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  if (t > 0) return `${t} T ${h} Std.`;
  return h > 0 ? `${h} Std. ${min % 60} Min.` : `${min} Min.`;
}
