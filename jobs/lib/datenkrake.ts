// Datenkrake im Job: alle Signale des Tages verdichtet speichern, Hot-Stuff-Rückblick, Vorlauf-Statistik, Quellen-Wächter.
// Schreibt nur neue Dateien (signale/tag/, lernen/hotstuff/, lernen/vorlauf.json) – bestehende Formate bleiben unverändert.
import { hotStuff, leereVorlaufStatistik, RAKETEN, verdichten, vorlaufFortschreiben, zusammenlegen, type HistorienTag, type KompaktSignal, type VorlaufStatistik } from '../../core/datenkrake.ts';
import { pushWarnung, type PushNachricht } from '../../core/push.ts';
import type { Signal } from '../../core/signale.ts';
import { leseJson, schreibeJson } from './dateien.ts';

const tagMinus = (datum: string, n: number) => new Date(Date.parse(`${datum}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);

/** Signale dieses Laufs in die Tagesdatei einfügen (alle Läufe eines Tages zusammen). */
export function tagesSignaleSpeichern(datum: string, signale: Signal[], jetzt: Date): KompaktSignal[] {
  const alt = leseJson<{ signale?: KompaktSignal[] }>(`signale/tag/${datum}.json`, {});
  const neu = zusammenlegen(alt.signale ?? [], verdichten(signale));
  schreibeJson(`signale/tag/${datum}.json`, { stand: jetzt.toISOString(), anzahl: neu.length, signale: neu });
  return neu;
}

/** Signal-Historie der letzten Tage: Tagesdatei, sonst (für ältere Tage) die Kandidaten des Hauptlaufs. */
export function historieLaden(bisDatum: string, tage: number): HistorienTag[] {
  const out: HistorienTag[] = [];
  for (let n = 1; n <= tage; n++) {
    const d = tagMinus(bisDatum, n);
    const tag = leseJson<{ signale?: KompaktSignal[] }>(`signale/tag/${d}.json`, {});
    if (tag.signale?.length) {
      out.push({ datum: d, signale: tag.signale.map((x) => ({ s: x.s, typ: x.typ, q: x.q })) });
      continue;
    }
    const k = leseJson<{ kandidaten?: { schluessel: string; typen: string[]; quellen: string[] }[] }>(`signale/${d}.json`, {});
    if (k.kandidaten?.length) out.push({ datum: d, signale: k.kandidaten.flatMap((x) => x.typen.map((typ) => ({ s: x.schluessel, typ, q: x.quellen }))) });
  }
  return out;
}

/**
 * Hot-Stuff-Rückblick (im Hauptlauf): Raketen von gestern und heute früh → welche Signale gingen voraus?
 * Danach reife Signal-Tage (7–30 Tage alt) einmalig auswerten: Wurde der Wert in den 7 Tagen danach zur Rakete?
 */
export function hotStuffAuswerten(datum: string, heute: KompaktSignal[], jetzt: Date) {
  const gestern = leseJson<{ signale?: KompaktSignal[] }>(`signale/tag/${tagMinus(datum, 1)}.json`, {}).signale ?? [];
  const raketen = [...heute, ...gestern.filter((x) => RAKETEN.has(x.typ))];
  const historie = historieLaden(datum, 12);
  const r = hotStuff(raketen, historie.filter((h) => h.datum < tagMinus(datum, 1)), datum, 10);
  const mover = r.mover.sort((a, b) => b.vorzeichen.length - a.vorzeichen.length).slice(0, 40);
  const bericht = { datum, stand: jetzt.toISOString(), anzahl: r.mover.length, abdeckung: r.abdeckung, mover };
  schreibeJson(`lernen/hotstuff/${datum}.json`, bericht);
  schreibeJson('lernen/hotstuff-letzte.json', bericht);

  // Vorlauf-Statistik fortschreiben
  let stat = leseJson<VorlaufStatistik>('lernen/vorlauf.json', leereVorlaufStatistik());
  const lang = historieLaden(datum, 30);
  const raketenAm = new Map<string, Set<string>>();
  for (const h of lang) raketenAm.set(h.datum, new Set(h.signale.filter((x) => RAKETEN.has(x.typ)).map((x) => x.s)));
  raketenAm.set(datum, new Set(raketen.map((x) => x.s)));
  for (const h of lang) {
    const alter = Math.round((Date.parse(datum) - Date.parse(h.datum)) / 86400000);
    if (alter < 7 || stat.tage.includes(h.datum)) continue;
    const danach = new Set<string>();
    for (let n = 1; n <= 7; n++) for (const s of raketenAm.get(tagMinus(h.datum, -n)) ?? []) danach.add(s);
    stat = vorlaufFortschreiben(stat, h, danach);
  }
  if (!stat.verlauf.some((v) => v.datum === datum)) stat = { ...stat, verlauf: [...stat.verlauf, { datum, mover: r.mover.length, abdeckung: r.abdeckung }].slice(-180) };
  schreibeJson('lernen/vorlauf.json', stat);
  return bericht;
}

export interface QuellenStatus {
  id: string;
  name: string;
  zuletztOk?: string;
  letzterFehler?: string;
}

/** Quellen-Wächter: Quelle seit über 2 Tagen ohne Erfolg (fehlender Schlüssel zählt nicht) → höchstens 1 Push pro Tag. */
export function quellenWaechter(status: QuellenStatus[], jetzt: Date, system: { quellenWarnung?: string }, datum: string): PushNachricht | null {
  const grenze = jetzt.getTime() - 48 * 3600000;
  const aus = status.filter((q) => q.letzterFehler && !/Schlüssel .* fehlt|Tageskontingent/.test(q.letzterFehler) && (!q.zuletztOk || Date.parse(q.zuletztOk) < grenze) && Date.parse(q.letzterFehler.slice(0, 24)) > grenze);
  if (!aus.length || system.quellenWarnung === datum) return null;
  system.quellenWarnung = datum;
  return pushWarnung(`Quelle seit über 2 Tagen ausgefallen: ${aus.map((q) => q.name).join(', ')}. Details unter Quellen.`, jetzt.toISOString());
}
