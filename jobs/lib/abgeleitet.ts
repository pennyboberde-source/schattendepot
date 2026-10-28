// Schreibt alle aus dem Ereignisprotokoll abgeleiteten Dateien neu (Positionen, Abgeschlossen, Kennzahlen, Statistik, Kalender).
import { ableiten } from '../../core/ableiten.ts';
import { termineIcs } from '../../core/ics.ts';
import { lernhinweise, wirksamesRisikoBudget } from '../../core/lernhinweise.ts';
import { statistikBerechnen, type TrackingEintrag } from '../../core/statistik.ts';
import { leereVorlaufStatistik, vorlaufLift, type VorlaufStatistik } from '../../core/datenkrake.ts';
import { kostenHuerdeProzent, marktGruppe, signalBeweise, type MarktGruppe } from '../../core/autopilot.ts';
import { zielStopVorschlaege } from '../../core/zielstop.ts';
import type { Kurs } from '../../core/typen.ts';
import { APP_URL, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './dateien.ts';

/** Kostenhürde hin und zurück je Marktgruppe (1.000 € Order): Aktie = Consorsbank + Nebenwert-Spread, Krypto = Trade Republic. */
export function huerdenAusConfig(cfg: ReturnType<typeof ladeConfig>): Record<MarktGruppe, number> {
  const b = cfg.einstellungen.orderBetrag;
  return {
    aktie: kostenHuerdeProzent(b, cfg.gebuehren, cfg.gebuehren.standardHandelsplatz, cfg.spreads.klassen.aktie_neben.prozent),
    krypto: kostenHuerdeProzent(b, cfg.gebuehren, 'TRK', cfg.spreads.klassen.krypto.prozent),
  };
}

export function abgeleitetSchreiben(jetzt: Date) {
  const cfg = ladeConfig();
  const kurse = leseJson<Record<string, Kurs>>('kurse.json', {});
  const stand = jetzt.toISOString();
  const a = ableiten(leseEreignisse(), kurse, cfg, stand);
  schreibeJson('positionen.json', a.positionen);
  schreibeJson('abgeschlossen.json', a.abgeschlossen);
  schreibeJson('kennzahlen.json', a.kennzahlen);
  const tracking = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []);
  const statistik = statistikBerechnen(a.orders, tracking, stand, leseJson('lernen/marktphasen.json', {}));
  // S2: Autopilot-Beweise und Ziel/Stop-Vorschläge aus dem Schattenbuch
  const huerden = huerdenAusConfig(cfg);
  const ap = cfg.einstellungen.autopilot;
  if (ap) statistik.autopilot = signalBeweise(tracking, { horizont: ap.horizont, mindestFaelle: ap.mindestFaelle, mindestChance: cfg.einstellungen.mindestChance ?? 40 }, huerden).slice(0, 30);
  if (cfg.einstellungen.zielStop) statistik.zielStop = zielStopVorschlaege(tracking, (t) => huerden[marktGruppe(t) ?? 'aktie'], cfg.einstellungen.zielStop);
  const bewiesen = (statistik.autopilot ?? []).filter((x) => x.bewiesen);
  if (bewiesen.length) statistik.zusammenfassung += `\nAutopilot – bewiesene Signaltypen (kauft sie selbst): ${bewiesen.map((x) => `${x.typ}/${x.gruppe} ${x.chance} %, Ø ${x.oeNetto} % (n=${x.faelle})`).join('; ')}.`;
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
