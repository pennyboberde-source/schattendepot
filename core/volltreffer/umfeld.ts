// Marktumfeld als Merkmale für den Rückblick (seit 16.11.2026): Angstbarometer VIX (Stand und 5-Tage-Änderung),
// Abstand zum Zinsentscheid der US-Notenbank (Termine stehen lange vorher fest – kein Rückschaufehler) und die
// Marktbreite (Anteil steigender Werte am Stichtag). Reine Funktionen.

/** Gespeicherter Stand (privat: stamm/umfeld.json.gz) */
export interface UmfeldArchiv {
  stand: string;
  /** VIX-Schlusskurse [Tag, Schluss], aufsteigend */
  vix: [string, number][];
}

/** CBOE VIX_History.csv (DATE,OPEN,HIGH,LOW,CLOSE; Datum MM/DD/YYYY) → [Tag, Schluss] aufsteigend */
export function parseVixCsv(text: string): [string, number][] {
  const aus: [string, number][] = [];
  for (const z of text.split(/\r?\n/)) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4}),[^,]*,[^,]*,[^,]*,([0-9.]+)\s*$/.exec(z);
    if (!m) continue;
    const wert = Number(m[4]);
    if (Number.isFinite(wert) && wert > 0) aus.push([`${m[3]}-${m[1]}-${m[2]}`, wert]);
  }
  return aus.sort((a, b) => a[0].localeCompare(b[0]));
}

/** Index des letzten Eintrags am oder vor dem Tag (−1, wenn keiner) – Reihe aufsteigend */
function letzterIndex(reihe: [string, number][], datum: string): number {
  let lo = 0;
  let hi = reihe.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (reihe[mid][0] <= datum) {
      best = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return best;
}

/** Letzter bekannter Wert am Tag (Wochenenden/Feiertage: der vom letzten Handelstag); null, wenn älter als `maxTage` */
export function wertAm(reihe: [string, number][], datum: string, maxTage = 5): number | null {
  const i = letzterIndex(reihe, datum);
  if (i < 0) return null;
  const alter = (Date.parse(`${datum}T00:00:00Z`) - Date.parse(`${reihe[i][0]}T00:00:00Z`)) / 86400000;
  return alter <= maxTage ? reihe[i][1] : null;
}

/** Änderung in % gegenüber dem Wert `schritte` Einträge davor (null ohne Daten) */
export function aenderungAm(reihe: [string, number][], datum: string, schritte = 5, maxTage = 5): number | null {
  const i = letzterIndex(reihe, datum);
  if (i < schritte || wertAm(reihe, datum, maxTage) === null) return null;
  return Math.round((reihe[i][1] / reihe[i - schritte][1] - 1) * 1000) / 10;
}

/**
 * Abstand in Kalendertagen zum nächstgelegenen Zinsentscheid (Entscheidungstag = zweiter Sitzungstag): 0 am Tag selbst,
 * positiv vor dem Entscheid, negativ danach; `ohne` (Standard 99), wenn keiner binnen `max` Tagen liegt. Liegen ein
 * vergangener und ein kommender Entscheid gleich nah, zählt der kommende.
 */
export function fedAbstand(datum: string, entscheidungen: string[], max = 7, ohne = 99): number {
  const t = Date.parse(`${datum}T00:00:00Z`);
  let best: number | null = null;
  for (const e of entscheidungen) {
    const d = Math.round((Date.parse(`${e}T00:00:00Z`) - t) / 86400000);
    if (Math.abs(d) > max) continue;
    if (best === null || Math.abs(d) < Math.abs(best) || (Math.abs(d) === Math.abs(best) && d > best)) best = d;
  }
  return best ?? ohne;
}

/** Marktbreite: Anteil der Werte mit positiver Tagesrendite in % (null bei weniger als `mindest` Werten) */
export function breite(r1: number[], mindest = 20): number | null {
  if (r1.length < mindest) return null;
  return Math.round((r1.filter((x) => x > 0).length / r1.length) * 1000) / 10;
}

/** Summe der letzten `n` Tageswerte bis einschließlich Tag i (Marktbewegung über mehrere Tage, näherungsweise) */
export function summeBis(werte: number[], i: number, n = 5): number | null {
  if (i + 1 < n) return null;
  let s = 0;
  for (let k = i - n + 1; k <= i; k++) s += werte[k];
  return Math.round(s * 100) / 100;
}
