// Kleiner Merkzustand der Quellen zwischen zwei Läufen (z. B. Marktliste vom Vortag).
// Nur verdichtete Werte, keine Rohdaten. Liegt im Daten-Branch unter zustand/.
import { leseJson, schreibeJson } from '../lib/dateien.ts';

export const zustandLesen = <T>(name: string, standard: T): T => leseJson<T>(`zustand/${name}.json`, standard);
export const zustandSchreiben = (name: string, wert: unknown) => schreibeJson(`zustand/${name}.json`, wert);

/** Deutsche Zahl mit einer Nachkommastelle und Vorzeichen, z. B. „+3,2“. */
export const pz = (x: number, stellen = 1) => `${x > 0 ? '+' : ''}${x.toLocaleString('de-DE', { minimumFractionDigits: stellen, maximumFractionDigits: stellen })}`;
/** Große Beträge kurz: 1,2 Mrd / 34,5 Mio. */
export const kurz = (x: number) =>
  Math.abs(x) >= 1e9
    ? `${(x / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mrd`
    : Math.abs(x) >= 1e6
      ? `${(x / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 1 })} Mio`
      : Math.round(x).toLocaleString('de-DE');
