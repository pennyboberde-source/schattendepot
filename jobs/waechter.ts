// Kurswächter (GitHub Action, alle 15 Min., reiner Code). Aufruf: node jobs/waechter.ts
// 1. Kurse für vorgemerkte/offene Orders holen  2. core/waechter entscheiden lassen
// 3. Ereignisse anhängen, abgeleitete Dateien schreiben  4. Pushes senden  5. ggf. Ereignislauf feuern
import { ordersAusEreignissen } from '../core/ableiten.ts';
import { benoetigteKursbasis } from '../core/bewertung.ts';
import { berlin, inHandelszeit } from '../core/kalender.ts';
import { kalibrierteQuote } from '../core/statistik.ts';
import type { Kurs } from '../core/typen.ts';
import { pushesFuerEreignisse, waechterLauf } from '../core/waechter.ts';
import { holeEurUsd, holeKurs, type Abrufprotokoll } from './kurse/anbieter.ts';
import { abgeleitetSchreiben } from './lib/abgeleitet.ts';
import { haengeEreignisseAn, ladeConfig, leseEreignisse, leseJson, schreibeJson } from './lib/dateien.ts';
import { pushen } from './lib/pushen.ts';
import { ereignisBehandeln } from './lib/routine.ts';
import { uebernehmeAlle } from './lib/uebernahme.ts';

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
// Liegengebliebene Claude-Ergebnisse zuerst übernehmen (falls deren Action verworfen wurde).
const uebernahme = process.env.OHNE_UEBERNAHME ? { dateien: 0, pushes: [], geloeschteBranches: [] } : uebernehmeAlle(jetzt);
const ereignisse = leseEreignisse();
const orders = ordersAusEreignissen(ereignisse);
const aktiv = orders.filter((o) => o.status === 'vorgemerkt' || o.status === 'offen');

// Kurse nur in (bzw. kurz vor) der Handelszeit holen – spart Kontingent.
const kursZeit = inHandelszeit(jetzt) || inHandelszeit(new Date(jetzt.getTime() + 20 * 60000));
const protokoll: Abrufprotokoll = {};
const basisKurse: Record<string, Kurs> = {};
let eurUsd: number | undefined;
let etfKurs: Kurs | undefined;
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
    // EU-Werte: nur Tagesschlusskurs verfügbar (Alpha Vantage, knappes Kontingent) → einmal täglich ab 20:30 Uhr.
    if (kb.markt === 'eu') {
      const euCache = leseJson<Record<string, string>>('eu-abrufe.json', {});
      if (b.minuten < 20 * 60 + 30 || euCache[kb.symbol] === b.datum) continue;
      euCache[kb.symbol] = b.datum;
      schreibeJson('eu-abrufe.json', euCache);
    }
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
  // Vergleichs-ETF (für „Schattendepot vs. ETF“): EUNL über Xetra, sonst URTH (USD) umgerechnet
  const etf = cfg.einstellungen.vergleichsEtf;
  const etfRoh = await holeKurs(etf.kursbasis, jetzt, protokoll);
  if (brauchtUsd || (etfRoh && etf.kursbasis.waehrung === 'USD')) eurUsd = await holeEurUsd(jetzt, protokoll);
  if (etfRoh && etf.kursbasis.waehrung === 'EUR') etfKurs = etfRoh;
  else if (etfRoh && eurUsd) etfKurs = { ...etfRoh, wert: etfRoh.wert / eurUsd, synthetisch: true, hinweis: `${etf.kursbasis.symbol} umgerechnet` };
}

const system = leseJson<System>('system.json', {});
const heuteLaeufe = system.ereignislaeufe?.[b.datum] ?? [];
const r = waechterLauf({
  jetzt,
  orders,
  basisKurse,
  eurUsd,
  etfKurs,
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
// Kursverlauf je Position (für das Order-Detail): ein Punkt pro Lauf, höchstens 2.500
for (const [id, k] of Object.entries(r.kurse)) {
  const verlauf = leseJson<[string, number][]>(`verlauf/${id}.json`, []);
  if (verlauf.at(-1)?.[0] !== k.zeit) schreibeJson(`verlauf/${id}.json`, [...verlauf, [k.zeit, k.wert] as [string, number]].slice(-2500));
}

const a = abgeleitetSchreiben(jetzt);

if (neu.some((e) => e.typ === 'warnung')) system.ausfallWarnung = b.datum;
const ereignisPushes = [];
if (r.ereignislauf) {
  const o = a.orders.find((x) => x.id === r.ereignislauf!.orderId);
  const pct = (neu.find((e) => e.typ === 'ereignislauf')?.daten as { tagesProzent?: number } | undefined)?.tagesProzent;
  ereignisPushes.push(await ereignisBehandeln(r.ereignislauf.orderId, o?.plan.wertpapier.name ?? r.ereignislauf.orderId, `Kursausschlag ${pct !== undefined && pct > 0 ? '+' : ''}${pct ?? '?'} % heute`, r.ereignislauf.text, jetzt));
  system.ereignislaeufe = { [b.datum]: [...heuteLaeufe, r.ereignislauf.orderId] };
}
system.stand = jetzt.toISOString();
system.letzterWaechterLauf = jetzt.toISOString();
system.hinweise = r.hinweise;
if (Object.keys(protokoll).length) system.kursabrufe = protokoll;
schreibeJson('system.json', system);

const pushes = [...uebernahme.pushes, ...pushesFuerEreignisse(neu, a.orders, (k) => kalibrierteQuote(a.statistik, k)), ...ereignisPushes];
const gesendet = await pushen(pushes, jetzt);
console.log(
  `Wächter ${b.datum} ${String(b.stunde).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}: ${aktiv.length} aktiv, ${Object.keys(basisKurse).length} Kurse, ${neu.length} Ereignisse, ${gesendet} Push(es).`,
);
for (const h of r.hinweise) console.log(`Hinweis: ${h}`);
