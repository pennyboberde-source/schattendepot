import { wertpapierSchluessel, type Signal } from '../../core/signale.ts';
import { erkenneSignalTyp, erwaehnteWerte, type UniversumWert } from '../../core/texterkennung.ts';
import type { Meldung } from './typen.ts';

export function signal(
  typ: string,
  wertpapier: Signal['wertpapier'],
  staerke: number,
  richtung: -1 | 0 | 1,
  zeit: string,
  quelle: string,
  fakt: string,
  link?: string,
): Signal {
  return {
    id: `${typ}:${wertpapierSchluessel(wertpapier).slice(2)}:${zeit.slice(0, 10)}`,
    wertpapier,
    typ,
    staerke: Math.max(0, Math.min(1, staerke)),
    richtung,
    zeit,
    quellen: [{ quelle, link, fakt: fakt.slice(0, 200) }],
  };
}

/** Schlagzeilen → Meldungen + Signale für erwähnte Werte des Universums. */
export function schlagzeilenAuswerten(eintraege: { titel: string; link: string; zeit?: string }[], quelle: string, universum: UniversumWert[], jetzt: Date, maxAlterStd = 24) {
  const meldungen: Meldung[] = [];
  const signale: Signal[] = [];
  for (const e of eintraege) {
    const zeit = e.zeit ?? jetzt.toISOString();
    if (jetzt.getTime() - new Date(zeit).getTime() > maxAlterStd * 3600000) continue;
    const werte = erwaehnteWerte(e.titel, universum);
    meldungen.push({ titel: e.titel, quelle, link: e.link, zeit, wertpapier: werte[0]?.name });
    if (werte.length === 0 || werte.length > 2) continue; // Sammelartikel ohne klaren Bezug überspringen
    const { typ, richtung } = erkenneSignalTyp(e.titel);
    for (const w of werte) signale.push(signal(typ, { name: w.name, ticker: w.ticker }, typ === 'nachricht' ? 0.3 : 0.7, richtung, zeit, quelle, e.titel, e.link));
  }
  return { meldungen, signale };
}
