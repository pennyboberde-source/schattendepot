// Autopilot im Sammler: bewiesene Signaltypen aus dem Schattenbuch → Vormerkungen (Ausführung im Kurswächter).
import { ordersAusEreignissen } from '../../core/ableiten.ts';
import { autopilotOrders, beweiseVereinen, sammelBeweise, signalBeweise, type AutopilotKandidat, type SammelTyp } from '../../core/autopilot.ts';
import type { Statistik } from '../../core/statistik.ts';
import { huerdenAusConfig, variantenKosten } from './abgeleitet.ts';
import { marktGruppe } from '../../core/autopilot.ts';
import { variantenSchattenbuch } from '../../core/varianten.ts';
import { APP_URL, haengeEreignisseAn, ladeConfig, leseEreignisse, leseJson } from './dateien.ts';
import { leseTracking, trackingErreichbar } from './privat.ts';

export function autopilotLauf(jetzt: Date, kandidaten: AutopilotKandidat[]): { neu: number; hinweise: string[] } {
  const cfg = ladeConfig();
  const e = cfg.einstellungen.autopilot;
  if (!e?.aktiv) return { neu: 0, hinweise: ['Autopilot aus'] };
  if (!trackingErreichbar()) return { neu: 0, hinweise: ['Autopilot setzt aus – Schattenbuch (privater Zustand) nicht erreichbar'] };
  const tracking = leseTracking();
  const schwelle = { horizont: e.horizont, mindestFaelle: e.mindestFaelle, mindestChance: e.mindestChance ?? cfg.einstellungen.mindestChance ?? 40, mindestOeNetto: e.mindestOeNetto };
  const huerden = huerdenAusConfig(cfg);
  // Einzelabruf-Schattenbuch und Sammelkurse (alle Signale, großes n) – je Typ zählt die größere Messung (17.11.2026)
  const sammel = leseJson<{ typen?: SammelTyp[] }>('lernen/schattenbuch/sammelkurse.json', {}).typen ?? [];
  const beweise = beweiseVereinen(signalBeweise(tracking, schwelle, huerden), sammelBeweise(sammel, schwelle, huerden), e.mindestFaelle);
  const st = leseJson<Partial<Statistik>>('statistik.json', {});
  const varianten = variantenSchattenbuch(tracking, marktGruppe, variantenKosten(cfg), { mindestFaelle: cfg.einstellungen.varianten?.mindestFaelle ?? 25, mindestChance: cfg.einstellungen.mindestChance ?? 40, kellyAnteil: cfg.einstellungen.varianten?.kellyAnteil ?? 0.5, hebelMax: cfg.einstellungen.varianten?.hebelMax ?? 50 });
  // Q4 Gegenwind: der nächtliche Rückblick schreibt die Marktlage des letzten Stichtags (höchstens 5 Tage alt)
  const gw = leseJson<{ gegenwind?: { datum: string; aktiv: boolean; grund: string } }>('volltreffer/uebersicht.json', {}).gegenwind;
  const gwFrisch = gw?.aktiv && (jetzt.getTime() - Date.parse(`${gw.datum}T22:00:00Z`)) / 86400000 <= 5;
  const r = autopilotOrders(kandidaten, beweise, ordersAusEreignissen(leseEreignisse()), jetzt, e, { zielStop: st.zielStop, appUrl: APP_URL, varianten, ...(gwFrisch ? { ohneShortAktien: `Gegenwind (${gw!.grund})` } : {}) });
  const neu = haengeEreignisseAn(r.ereignisse);
  return { neu: neu.length, hinweise: r.hinweise };
}
