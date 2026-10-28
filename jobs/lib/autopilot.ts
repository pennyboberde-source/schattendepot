// Autopilot im Sammler: bewiesene Signaltypen aus dem Schattenbuch → Vormerkungen (Ausführung im Kurswächter).
import { ordersAusEreignissen } from '../../core/ableiten.ts';
import { autopilotOrders, signalBeweise, type AutopilotKandidat } from '../../core/autopilot.ts';
import type { Statistik, TrackingEintrag } from '../../core/statistik.ts';
import { huerdenAusConfig, variantenKosten } from './abgeleitet.ts';
import { marktGruppe } from '../../core/autopilot.ts';
import { variantenSchattenbuch } from '../../core/varianten.ts';
import { APP_URL, haengeEreignisseAn, ladeConfig, leseEreignisse, leseJson } from './dateien.ts';

export function autopilotLauf(jetzt: Date, kandidaten: AutopilotKandidat[]): { neu: number; hinweise: string[] } {
  const cfg = ladeConfig();
  const e = cfg.einstellungen.autopilot;
  if (!e?.aktiv) return { neu: 0, hinweise: ['Autopilot aus'] };
  const tracking = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []);
  const beweise = signalBeweise(tracking, { horizont: e.horizont, mindestFaelle: e.mindestFaelle, mindestChance: cfg.einstellungen.mindestChance ?? 40 }, huerdenAusConfig(cfg));
  const st = leseJson<Partial<Statistik>>('statistik.json', {});
  const varianten = variantenSchattenbuch(tracking, marktGruppe, variantenKosten(cfg), { mindestFaelle: cfg.einstellungen.varianten?.mindestFaelle ?? 25, mindestChance: cfg.einstellungen.mindestChance ?? 40 });
  const r = autopilotOrders(kandidaten, beweise, ordersAusEreignissen(leseEreignisse()), jetzt, e, { zielStop: st.zielStop, appUrl: APP_URL, varianten });
  const neu = haengeEreignisseAn(r.ereignisse);
  return { neu: neu.length, hinweise: r.hinweise };
}
