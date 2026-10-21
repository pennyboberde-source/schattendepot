// Reine Anzeige-Einstellungen, nur auf diesem Gerät (localStorage, ausfallsicher).
import { useState } from 'preact/hooks';

const PREFIX = 'schattendepot:';

export function leseLokal<T>(schluessel: string, standard: T): T {
  try {
    const roh = localStorage.getItem(PREFIX + schluessel);
    return roh === null ? standard : (JSON.parse(roh) as T);
  } catch {
    return standard;
  }
}

export function schreibeLokal<T>(schluessel: string, wert: T) {
  try {
    localStorage.setItem(PREFIX + schluessel, JSON.stringify(wert));
  } catch {
    /* privater Modus o. Ä. – Einstellung gilt dann nur bis zum Neuladen */
  }
}

export function useEinstellung<T>(schluessel: string, standard: T): [T, (w: T) => void] {
  const [wert, setWert] = useState<T>(() => leseLokal(schluessel, standard));
  return [
    wert,
    (w: T) => {
      schreibeLokal(schluessel, w);
      setWert(w);
    },
  ];
}
