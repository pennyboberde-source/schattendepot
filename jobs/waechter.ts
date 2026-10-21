// Kurswächter (GitHub Action, alle 15 Min., reiner Code). Aufruf: node jobs/waechter.ts
// 1. Kurse für vorgemerkte/offene Orders holen  2. core/waechter entscheiden lassen
// 3. Ereignisse anhängen, abgeleitete Dateien schreiben  4. Pushes senden  5. ggf. Ereignislauf feuern
import { ordersAusEreignissen } from '../core/ableiten.ts';
import { benoetigteKursbasis } from '../core/bewertung.ts';
import { berlin, inHandelszeit } from '../core/kalender.ts';
import type { Kurs } from '../core/typen.ts';
import { pushesFuerEreignisse, waechterLauf } from '../core/waechter.ts';
import { holeEurUsd, holeKurs, type Abrufprotokoll } from './kurse/anbieter.ts';
import { abgeleitetSchreiben } from './lib/abgeleitet.ts';
import { haengeEreignisseAn, ladeConfig, leseEreignisse, leseJson, schreibeJson } from './lib/dateien.ts';
import { pushen } from './lib/pushen.ts';
import { feuereEreignislauf } from './lib/routine.ts';

interface System {
  stand?: string;
  letzterWaechterLauf?: string;
  ausfallWarnung?: string;
  ereignislaeufe?: Record<string, string[]>;
  hinweise?: string[];
  kursabrufe?: Abrufprotokoll;
  [k: string]: unknown;
}

const jetzt = new Date(process.env.JETZT ?? Date.now());
const cfg = ladeConfig();
const b = berlin(jetzt);
const ereignisse = leseEreignisse();
const orders = ordersAusEreignissen(ereignisse);
const aktiv = orders.filter((o) => o.status === 'vorgemerkt' || o.status === 'offen');

// Kurse nur in (bzw. kurz vor) der Handelszeit holen – spart Kontingent.
const kursZeit = inHandelszeit(jetzt) || inHandelszeit(new Date(jetzt.getTime() + 20 * 60000));
const protokoll: Abrufprotokoll = {};
const basisKurse: Record<string, Kurs> = {};
let eurUsd: number | undefined;
if (kursZeit && aktiv.length) {
  const cache = new Map<string, Kurs | null>();
  for (const o of aktiv) {
    let kb;
    try {
      kb = benoetigteKursbasis(o.plan);
    } catch (e) {
      console.error((e as Error).message);
      continue;
    }
    const schluessel = `${kb.markt}:${kb.symbol}`;
    if (!cache.has(schluessel)) cache.set(schluessel, await holeKurs(kb, jetzt, protokoll));
    const k = cache.get(schluessel);
    if (k) basisKurse[o.id] = k;
  }
  const brauchtUsd = aktiv.some((o) => {
    try {
      return benoetigteKursbasis(o.plan).waehrung === 'USD';
    } catch {
      return false;
    }
  });
  if (brauchtUsd) eurUsd = await holeEurUsd(jetzt, protokoll);
}

const system = leseJson<System>('system.json', {});
const heuteLaeufe = system.ereignislaeufe?.[b.datum] ?? [];
const r = waechterLauf({
  jetzt,
  orders,
  basisKurse,
  eurUsd,
  cfg: { gebuehren: cfg.gebuehren, spreads: cfg.spreads, einstellungen: cfg.einstellungen },
  heute: {
    ereignisLaeufe: heuteLaeufe.length,
    ereignislaufOrders: heuteLaeufe,
    ausfallWarnung: system.ausfallWarnung === b.datum,
    vorgemerkt: ereignisse.some((e) => e.typ === 'vorgemerkt' && berlin(new Date(e.zeit)).datum === b.datum),
  },
});

const neu = haengeEreignisseAn(r.ereignisse);
const kurse = leseJson<Record<string, Kurs>>('kurse.json', {});
const offeneIds = new Set(aktiv.map((o) => o.id));
for (const id of Object.keys(kurse)) if (!offeneIds.has(id)) delete kurse[id];
Object.assign(kurse, r.kurse);
schreibeJson('kurse.json', kurse);

const a = abgeleitetSchreiben(jetzt);

if (neu.some((e) => e.typ === 'warnung')) system.ausfallWarnung = b.datum;
if (r.ereignislauf) {
  const f = await feuereEreignislauf(r.ereignislauf.text);
  console.log(`Ereignislauf: ${f.ok ? 'gestartet' : 'nicht gestartet'} – ${f.info}`);
  if (f.ok) system.ereignislaeufe = { [b.datum]: [...heuteLaeufe, r.ereignislauf.orderId] };
}
system.stand = jetzt.toISOString();
system.letzterWaechterLauf = jetzt.toISOString();
system.hinweise = r.hinweise;
if (Object.keys(protokoll).length) system.kursabrufe = protokoll;
schreibeJson('system.json', system);

const pushes = pushesFuerEreignisse(neu, a.orders);
const gesendet = await pushen(pushes, jetzt);
console.log(
  `Wächter ${b.datum} ${String(b.stunde).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}: ${aktiv.length} aktiv, ${Object.keys(basisKurse).length} Kurse, ${neu.length} Ereignisse, ${gesendet} Push(es).`,
);
for (const h of r.hinweise) console.log(`Hinweis: ${h}`);
