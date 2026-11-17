// Schreibt alle aus dem Ereignisprotokoll abgeleiteten Dateien neu (Positionen, Abgeschlossen, Kennzahlen, Statistik, Kalender).
import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { ableiten, ohneTagesstand } from '../../core/ableiten.ts';
import { istVerlaufProzent, verlaufInProzent, type VerlaufAlt, type VerlaufProzent } from '../../core/verlauf.ts';
import { termineIcs } from '../../core/ics.ts';
import { lernhinweise, wirksamesRisikoBudget } from '../../core/lernhinweise.ts';
import { statistikBerechnen, type Statistik } from '../../core/statistik.ts';
import { leereVorlaufStatistik, vorlaufLift, type VorlaufStatistik } from '../../core/datenkrake.ts';
import { beweiseVereinen, kostenHuerdeProzent, marktGruppe, sammelBeweise, signalBeweise, type MarktGruppe, type SammelTyp } from '../../core/autopilot.ts';
import { zielStopVorschlaege } from '../../core/zielstop.ts';
import { varianteText, variantenSchattenbuch, type VariantenKosten } from '../../core/varianten.ts';
import type { Kurs, Order } from '../../core/typen.ts';
import { APP_URL, DATEN_DIR, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './dateien.ts';
import { lesePrivat, leseTracking, trackingErreichbar } from './privat.ts';

/** Kostenhürde hin und zurück je Marktgruppe (1.000 € Order): Aktie = Smartbroker+ (gettex) + Nebenwert-Spread, Krypto = Trade Republic. */
export function huerdenAusConfig(cfg: ReturnType<typeof ladeConfig>): Record<MarktGruppe, number> {
  const b = cfg.einstellungen.orderBetrag;
  return {
    aktie: kostenHuerdeProzent(b, cfg.gebuehren, cfg.gebuehren.standardHandelsplatz, cfg.spreads.klassen.aktie_neben.prozent),
    krypto: kostenHuerdeProzent(b, cfg.gebuehren, 'TRK', cfg.spreads.klassen.krypto.prozent),
  };
}

/** Kosten der Spielarten: Spread hin und zurück (Gebühren Smartbroker+ 0 €), Turbo-Spread und Finanzierung. */
export function variantenKosten(cfg: ReturnType<typeof ladeConfig>): VariantenKosten {
  const h = huerdenAusConfig(cfg);
  return { aktie: h.aktie, krypto: h.krypto, turbo: cfg.spreads.klassen.hebel.prozent, finanzierungProzentJahr: cfg.einstellungen.varianten?.finanzierungProzentJahr ?? 5, koPuffer: cfg.einstellungen.varianten?.koPuffer ?? 0.6 };
}

/**
 * Alte Kursreihen (Euro) im öffentlichen Ordner verlauf/ auf Prozent seit Kauf umstellen (einmalig je Datei).
 * Reihen von Orders, die nie gekauft wurden, lassen sich nicht umrechnen und werden entfernt.
 */
export function verlaufUmstellen(orders: Order[]): number {
  const ordner = join(DATEN_DIR, 'verlauf');
  if (!existsSync(ordner)) return 0;
  let n = 0;
  for (const datei of readdirSync(ordner).filter((d) => d.endsWith('.json'))) {
    const pfad = join(ordner, datei);
    let inhalt: VerlaufProzent | VerlaufAlt | null = null;
    try {
      inhalt = JSON.parse(readFileSync(pfad, 'utf8')) as VerlaufProzent | VerlaufAlt;
    } catch {
      continue;
    }
    if (istVerlaufProzent(inhalt)) continue;
    const kaufkurs = orders.find((o) => o.id === datei.slice(0, -5))?.kauf?.kurs;
    if (kaufkurs && kaufkurs > 0) schreibeJson(`verlauf/${datei}`, verlaufInProzent(inhalt, kaufkurs));
    else unlinkSync(pfad);
    n++;
  }
  return n;
}

/**
 * `kurse`: Der Kurswächter reicht seine frischen Tagesstände direkt durch; sonst kommen sie aus dem privaten Zustand.
 * Öffentlich geschrieben werden die Positionen ohne Kurs (nur Veränderung in Prozent).
 */
export function abgeleitetSchreiben(jetzt: Date, opt: { kurse?: Record<string, Kurs> } = {}) {
  const cfg = ladeConfig();
  const kurse = opt.kurse ?? lesePrivat<Record<string, Kurs>>('kurse.json', {}).daten;
  const stand = jetzt.toISOString();
  const a = ableiten(leseEreignisse(), kurse, cfg, stand);
  schreibeJson('positionen.json', { ...a.positionen, offen: a.positionen.offen.map(ohneTagesstand), vorgemerkt: a.positionen.vorgemerkt.map(ohneTagesstand) });
  verlaufUmstellen(a.orders);
  schreibeJson('abgeschlossen.json', a.abgeschlossen);
  schreibeJson('kennzahlen.json', a.kennzahlen);
  // Schattenbuch aus dem privaten Zustand. Ist es nicht erreichbar, bleiben seine Kennzahlen aus der vorigen Statistik stehen.
  const erreichbar = trackingErreichbar();
  const tracking = erreichbar ? leseTracking() : [];
  const vorher = erreichbar ? null : leseJson<Statistik | null>('statistik.json', null);
  if (!erreichbar) console.log('Schattenbuch (privater Zustand) nicht erreichbar – seine Kennzahlen bleiben auf dem letzten Stand.');
  const statistik = statistikBerechnen(a.orders, tracking, stand, leseJson('lernen/marktphasen.json', {}), { schattenbuchAus: vorher });
  // S2: Autopilot-Beweise und Ziel/Stop-Vorschläge aus dem Schattenbuch
  const huerden = huerdenAusConfig(cfg);
  const ap = cfg.einstellungen.autopilot;
  if (ap && erreichbar) {
    const schwelle = { horizont: ap.horizont, mindestFaelle: ap.mindestFaelle, mindestChance: ap.mindestChance ?? cfg.einstellungen.mindestChance ?? 40, mindestOeNetto: ap.mindestOeNetto };
    const sammel = leseJson<{ typen?: SammelTyp[] }>('lernen/schattenbuch/sammelkurse.json', {}).typen ?? [];
    statistik.autopilot = beweiseVereinen(signalBeweise(tracking, schwelle, huerden), sammelBeweise(sammel, schwelle, huerden), ap.mindestFaelle).slice(0, 30);
  }
  if (cfg.einstellungen.zielStop && erreichbar) statistik.zielStop = zielStopVorschlaege(tracking, (t) => huerden[marktGruppe(t) ?? 'aktie'], cfg.einstellungen.zielStop);
  if (!erreichbar && vorher) Object.assign(statistik, { autopilot: vorher.autopilot, zielStop: vorher.zielStop, varianten: vorher.varianten });
  if (erreichbar) statistik.varianten = variantenSchattenbuch(tracking, marktGruppe, variantenKosten(cfg), { mindestFaelle: cfg.einstellungen.varianten?.mindestFaelle ?? 25, mindestChance: cfg.einstellungen.mindestChance ?? 40, volltrefferProzent: cfg.einstellungen.varianten?.volltrefferProzent ?? 15, kellyAnteil: cfg.einstellungen.varianten?.kellyAnteil ?? 0.5, hebelMax: cfg.einstellungen.varianten?.hebelMax ?? 50 }).slice(0, 40);
  const vTop = (statistik.varianten ?? []).filter((v) => v.beste).slice(0, 6);
  if (vTop.length) statistik.zusammenfassung += `\nBeste Spielart je Signal (Varianten-Schattenbuch, vorsichtig bewertet): ${vTop.map((v) => `${v.typ}/${v.gruppe}: ${varianteText(v.beste!)}`).join('; ')}.`;
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
