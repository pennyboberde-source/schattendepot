// Schreibt alle aus dem Ereignisprotokoll abgeleiteten Dateien neu (Positionen, Abgeschlossen, Kennzahlen, Statistik, Kalender).
import { ableiten } from '../../core/ableiten.ts';
import { termineIcs } from '../../core/ics.ts';
import { lernhinweise, wirksamesRisikoBudget } from '../../core/lernhinweise.ts';
import { statistikBerechnen, type TrackingEintrag } from '../../core/statistik.ts';
import { leereVorlaufStatistik, vorlaufLift, type VorlaufStatistik } from '../../core/datenkrake.ts';
import type { Kurs } from '../../core/typen.ts';
import { APP_URL, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './dateien.ts';

export function abgeleitetSchreiben(jetzt: Date) {
  const cfg = ladeConfig();
  const kurse = leseJson<Record<string, Kurs>>('kurse.json', {});
  const stand = jetzt.toISOString();
  const a = ableiten(leseEreignisse(), kurse, cfg, stand);
  schreibeJson('positionen.json', a.positionen);
  schreibeJson('abgeschlossen.json', a.abgeschlossen);
  schreibeJson('kennzahlen.json', a.kennzahlen);
  const statistik = statistikBerechnen(a.orders, leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []), stand);
  statistik.lernhinweise = lernhinweise(statistik);
  statistik.risikoBudget = wirksamesRisikoBudget(cfg.einstellungen.risikoBudget, statistik);
  statistik.vorlauf = vorlaufLift(leseJson<VorlaufStatistik>('lernen/vorlauf.json', leereVorlaufStatistik()));
  const lift = statistik.vorlauf.filter((v) => v.lift !== null).slice(0, 4);
  if (lift.length) statistik.zusammenfassung += `
Vorlauf vor Kursraketen (Hot Stuff, Lift > 1 = kündigt Raketen besser an als Zufall): ${lift.map((v) => `${v.typ} ${v.quote} % (Lift ${v.lift}, n=${v.signale})`).join('; ')}.`;
  if (statistik.lernhinweise.length) {
    statistik.zusammenfassung += `\nLern-Hinweise (vom Code abgeleitet):\n${statistik.lernhinweise.map((h) => `- ${h}`).join('\n')}`;
  }
  schreibeJson('statistik.json', statistik);
  schreibeText('termine.ics', termineIcs(a.orders, stand, APP_URL));
  return { ...a, statistik };
}
