// Kalender-Effekte (ohne Datenquelle, reiner Code): bekannte Termine, an denen Märkte sich oft anders verhalten.
import { istHandelstag, naechsterHandelstag } from './kalender.ts';

function dritterFreitag(jahr: number, monat: number): string {
  const d = new Date(Date.UTC(jahr, monat - 1, 1));
  const ersterFreitag = 1 + ((5 - d.getUTCDay() + 7) % 7);
  return `${jahr}-${String(monat).padStart(2, '0')}-${String(ersterFreitag + 14).padStart(2, '0')}`;
}

function letzterHandelstagImMonat(datum: string): boolean {
  return naechsterHandelstag(datum).slice(0, 7) !== datum.slice(0, 7);
}

function ersterHandelstagImMonat(datum: string): boolean {
  const [j, m] = datum.split('-').map(Number);
  let d = `${j}-${String(m).padStart(2, '0')}-01`;
  while (!istHandelstag(d)) d = naechsterHandelstag(d);
  return d === datum;
}

export function kalenderEffekte(datum: string): string[] {
  const [j, m] = datum.split('-').map(Number);
  const e: string[] = [];
  if (datum === dritterFreitag(j, m)) e.push(m % 3 === 0 ? 'Großer Verfallstag (Hexensabbat): Optionen/Futures verfallen, Indizes werden angepasst – oft hohe Umsätze und Ausschläge.' : 'Monatlicher Optionsverfall: erhöhte Umsätze möglich.');
  if (letzterHandelstagImMonat(datum)) e.push(m % 3 === 0 ? 'Letzter Handelstag des Quartals: Fonds hübschen Depots auf („Window Dressing“).' : 'Letzter Handelstag des Monats: Monatswechsel-Effekt (Zuflüsse rund um den Monatsanfang).');
  if (ersterHandelstagImMonat(datum)) e.push('Erster Handelstag des Monats: historisch überdurchschnittlich (Monatswechsel-Effekt).');
  const morgen = new Date(`${datum}T12:00:00Z`);
  morgen.setUTCDate(morgen.getUTCDate() + 1);
  const m2 = morgen.toISOString().slice(0, 10);
  if (morgen.getUTCDay() !== 6 && morgen.getUTCDay() !== 0 && !istHandelstag(m2)) e.push('Morgen Börsenfeiertag: Tag vor Feiertagen ist historisch oft freundlich, Umsätze dünner.');
  return e;
}
