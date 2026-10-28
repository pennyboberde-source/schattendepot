// Datensammler (GitHub Action, reiner Code, KEIN Claude). Aufruf: node jobs/sammler.ts [haupt|stuendlich|samstag|auto]
// Hauptlauf ~06:30: alle Quellen → Signale → Bewertung → lagebild/<datum>.md (für Claude) + .json (App).
// Stündlich 08–22 Uhr: Nachrichten zu offenen Positionen; starke Meldung → Ereignislauf (max. 1/Tag, geteilt mit Kurswächter).
import { ordersAusEreignissen } from '../core/ableiten.ts';
import { berlin, istHandelstag } from '../core/kalender.ts';
import { lagebildJson, lagebildMarkdown, type LagebildDaten } from '../core/lagebild.ts';
import { kandidaten, zusammenfuehren, type Gewichte, type Signal, type SignalConfig } from '../core/signale.ts';
import type { PushNachricht } from '../core/push.ts';
import type { UniversumWert } from '../core/texterkennung.ts';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATEN_DIR, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './lib/dateien.ts';
import { kontingentFrei, kontingentGenutzt, kontingentZaehlen } from './lib/netz.ts';
import { gewichteAnpassen, type Grenzen, type Vorschlag } from '../core/gewichte.ts';
import { abgeleitetSchreiben } from './lib/abgeleitet.ts';
import { pushen } from './lib/pushen.ts';
import { ereignisBehandeln } from './lib/routine.ts';
import { schwaerzen } from './lib/schwaerzen.ts';
import { trackingAktualisieren } from './lib/tracking.ts';
import { gdelt } from './quellen/gdelt.ts';
import { apeWisdom, fred, krakenKrypto } from './quellen/maerkte.ts';
import { openInsider } from './quellen/openinsider.ts';
import { rssQuellen } from './quellen/rss.ts';
import { alphaVantage, finnhub, fmp } from './quellen/schluesselquellen.ts';
import type { Laufart, Quelle, QuellenErgebnis } from './quellen/typen.ts';
import { wirtschaftskalender } from './quellen/wirtschaftskalender.ts';
import { sec8k } from './quellen/sec.ts';
import { finra } from './quellen/finra.ts';
import { gettexScanner } from './quellen/gettexscanner.ts';
import { anreichern } from './quellen/anreicherung.ts';
import { aufmerksamkeit } from './quellen/aufmerksamkeit.ts';
import { youtube } from './quellen/youtube.ts';
import { kalenderEffekte } from '../core/kalendereffekte.ts';
import { aehnlicheFaelle, aehnlichText, pumpVerdacht, verdichten } from '../core/datenkrake.ts';
import type { TrackingEintrag } from '../core/statistik.ts';
import { hotStuffAuswerten, quellenWaechter, tagesSignaleSpeichern } from './lib/datenkrake.ts';
import { defiLlama, krakenFutures, upbit } from './quellen/kryptorand.ts';
import { finraShortInterest, shortSeller } from './quellen/shortdaten.ts';
import { appRaenge, cftcCot, handelsstopps, kryptoStimmung, polymarket } from './quellen/stimmungrand.ts';

// Bestehende Quellen bleiben immer drin; neue werden nur hinten angehängt (Randquellen seit 28.10.2026).
const QUELLEN: Quelle[] = [...rssQuellen, openInsider, apeWisdom, fred, krakenKrypto, finnhub, fmp, alphaVantage, gdelt, wirtschaftskalender, sec8k, finra, gettexScanner, aufmerksamkeit, youtube, upbit, krakenFutures, defiLlama, finraShortInterest, shortSeller, handelsstopps, appRaenge, kryptoStimmung, polymarket, cftcCot];
const STARK_NEGATIV = new Set(['prognose_senkung', 'gewinn_enttaeuschung', 'analysten_abstufung', 'shortreport']);
const STARK = new Set([...STARK_NEGATIV, 'uebernahmeangebot', 'prognose_erhoehung']);

const jetzt = new Date(process.env.JETZT ?? Date.now());
const b = berlin(jetzt);
const conf = <T>(d: string) => JSON.parse(readFileSync(join(process.cwd(), 'config', d), 'utf8')) as T;
const signalCfg = conf<SignalConfig>('signale.json');
const universum = conf<{ werte: UniversumWert[] }>('universum.json').werte;

/** Datenkrake-Hinweise je Kandidat: Ähnliche Fälle aus dem Schattenbuch und Pump-Verdacht. */
function kandidatenHinweise(top: ReturnType<typeof kandidaten>, tracking: TrackingEintrag[]): Record<string, string> {
  const h: Record<string, string> = {};
  for (const k of top) {
    const typen = [...new Set(k.signale.map((s) => s.typ))];
    const teile = [aehnlichText(aehnlicheFaelle(typen, k.score < 0 ? -1 : 1, tracking))];
    if (pumpVerdacht(typen, { fakten: k.signale.flatMap((s) => s.quellen.map((q) => q.fakt)) })) teile.push('⚠ Pump-Verdacht: nur Stimmung/Rakete, nichts Handfestes');
    const text = teile.filter(Boolean).join(' · ');
    if (text) h[k.schluessel] = text;
  }
  return h;
}

function laufartBestimmen(): Laufart | null {
  const arg = process.argv[2] ?? 'auto';
  if (arg !== 'auto') return arg as Laufart;
  if (b.wochentag === 6) return 'samstag';
  if (!istHandelstag(b.datum)) return null;
  if (b.minuten >= 5 * 60 + 30 && b.minuten < 7 * 60 + 30) return existsSync(join(DATEN_DIR, `lagebild/${b.datum}.md`)) ? null : 'haupt';
  if (b.minuten >= 8 * 60 && b.minuten < 22 * 60) return 'stuendlich';
  return null;
}

const laufart = laufartBestimmen();
if (!laufart) {
  console.log(`Sammler: kein Lauf fällig (${b.datum} ${b.stunde}:${String(b.minute).padStart(2, '0')}).`);
  process.exit(0);
}

const orders = ordersAusEreignissen(leseEreignisse());
const offen = orders
  .filter((o) => o.status === 'offen' || o.status === 'vorgemerkt')
  .map((o) => ({ id: o.id, name: o.plan.wertpapier.name, ticker: o.plan.wertpapier.kursbasis?.symbol ?? o.plan.wertpapier.ticker }));
const ctx = { jetzt, laufart, universum, offen };

interface Status {
  id: string;
  name: string;
  zuletztOk?: string;
  letzterFehler?: string;
  kontingent?: { genutzt: number; limit: number; zeitraum: string };
  signale?: number;
}
const statusAlt = leseJson<{ quellen: Status[] }>('quellenstatus.json', { quellen: [] });
const status = new Map(statusAlt.quellen.map((q) => [q.id, q]));

async function mitZeitlimit<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Zeitlimit ${ms / 1000} s`)), ms))]);
}

const aktive = QUELLEN.filter((q) => q.laeufe.includes(laufart));
const ergebnisse = await Promise.all(
  aktive.map(async (q): Promise<[Quelle, QuellenErgebnis | null]> => {
    const st: Status = status.get(q.id) ?? { id: q.id, name: q.name };
    st.name = q.name;
    status.set(q.id, st);
    if (q.schluessel && !process.env[q.schluessel]?.trim()) {
      st.letzterFehler = `${jetzt.toISOString()}: Schlüssel ${q.schluessel} fehlt`;
      return [q, null];
    }
    const kid = `q-${q.id}`;
    if (q.tageslimit && !kontingentFrei(kid, jetzt, q.maxProLauf, q.tageslimit)) {
      st.letzterFehler = `${jetzt.toISOString()}: Tageskontingent erschöpft`;
      return [q, null];
    }
    try {
      const r = await mitZeitlimit(q.abrufen(ctx), 45000);
      kontingentZaehlen(kid, jetzt, r.abfragen);
      st.zuletztOk = jetzt.toISOString();
      st.signale = r.signale.length;
      return [q, r];
    } catch (e) {
      kontingentZaehlen(kid, jetzt, 1);
      st.letzterFehler = schwaerzen(`${jetzt.toISOString()}: ${(e as Error).message}`).slice(0, 200);
      return [q, null];
    } finally {
      if (q.tageslimit) st.kontingent = { genutzt: kontingentGenutzt(kid, jetzt), limit: q.tageslimit, zeitraum: 'Tag' };
    }
  }),
);
schreibeJson('quellenstatus.json', { stand: jetzt.toISOString(), quellen: [...status.values()].sort((a, c) => a.name.localeCompare(c.name)) });

const alleSignale: Signal[] = ergebnisse.flatMap(([, r]) => r?.signale ?? []);
let zusammen = zusammenfuehren(alleSignale, signalCfg);

// Gelegenheiten des Tages (Kursraketen u. a.) für den Mittagslauf sammeln
{
  const heuteGel = leseJson<{ datum: string; liste: unknown[] }>('gelegenheiten.json', { datum: b.datum, liste: [] });
  const liste = heuteGel.datum === b.datum ? (heuteGel.liste as { id: string }[]) : [];
  for (const s of zusammen.filter((x) => x.typ === 'kursrakete' || x.typ === 'nachzahlen_drift' || x.typ === 'uebernahmeangebot')) {
    if (!liste.some((g) => g.id === s.id)) liste.push({ id: s.id, zeit: s.zeit, typ: s.typ, wertpapier: s.wertpapier, fakt: s.quellen[0]?.fakt, link: s.quellen[0]?.link, quellen: s.quellen.map((q) => q.quelle) } as { id: string });
  }
  schreibeJson('gelegenheiten.json', { datum: b.datum, liste: liste.slice(-60) });
}
const system = leseJson<Record<string, unknown> & { ereignislaeufe?: Record<string, string[]> }>('system.json', {});
system.letzterSammlerLauf = jetzt.toISOString();
const pushes: PushNachricht[] = [];
// Quellen-Wächter: Quelle > 2 Tage ohne Erfolg → 1 Push pro Tag
{
  const qw = quellenWaechter([...status.values()], jetzt, system as { quellenWarnung?: string }, b.datum);
  if (qw) pushes.push(qw);
}

if (laufart === 'haupt' || laufart === 'samstag') {
  const gewichte = leseJson<Gewichte>('gewichte.json', {});
  let top = kandidaten(zusammen, signalCfg, gewichte);
  // Zweite Stufe: Analysten-Trend und Drift nach Quartalszahlen für die besten US-Kandidaten
  const extra = await anreichern(top, jetzt);
  if (extra.signale.length) {
    zusammen = zusammenfuehren([...alleSignale, ...extra.signale], signalCfg);
    top = kandidaten(zusammen, signalCfg, gewichte);
  }
  console.log(`Anreicherung: ${extra.signale.length} Signale aus ${extra.abfragen} Abfragen.`);
  const meldungen = ergebnisse.flatMap(([, r]) => r?.meldungen ?? []);
  const daten: LagebildDaten = {
    datum: b.datum,
    erstellt: jetzt.toISOString(),
    makro: [...kalenderEffekte(b.datum).map((k) => `Kalender: ${k}`), ...ergebnisse.flatMap(([, r]) => r?.makro ?? [])],
    termine: ergebnisse.flatMap(([, r]) => r?.termine ?? []),
    meldungen: meldungen.filter((m) => !offen.some((o) => o.name === m.wertpapier)).sort((x, y) => (y.zeit ?? '').localeCompare(x.zeit ?? '')),
    insider: ergebnisse.flatMap(([, r]) => r?.insider ?? []),
    positionen: offen.map((o) => ({ id: o.id, name: o.name, meldungen: meldungen.filter((m) => m.wertpapier === o.name).slice(0, 3) })),
    kandidaten: top,
    quellen: ergebnisse.map(([q, r]) => ({ id: q.id, name: q.name, ok: !!r, signale: r?.signale.length ?? 0 })),
    hinweise: kandidatenHinweise(top, leseJson<TrackingEintrag[]>('kandidaten-tracking.json', [])),
  };
  const typNamen = Object.fromEntries(Object.entries(signalCfg.typen).map(([k, v]) => [k, v.name]));
  schreibeText(`lagebild/${b.datum}.md`, lagebildMarkdown(daten, typNamen) + '\n');
  const alt = leseJson<{ briefing?: string[] }>(`lagebild/${b.datum}.json`, {});
  const json = lagebildJson(daten, alt.briefing);
  schreibeJson(`lagebild/${b.datum}.json`, json);
  schreibeJson('lagebild/heute.json', json);
  const index = leseJson<{ tage: string[] }>('lagebild/index.json', { tage: [] });
  if (!index.tage.includes(b.datum)) index.tage = [b.datum, ...index.tage].slice(0, 90);
  schreibeJson('lagebild/index.json', index);
  // Verdichtete Signale versionieren (Rohdaten nicht) – Grundlage für das Mitverfolgen von Nicht-Käufen (M5).
  schreibeJson(`signale/${b.datum}.json`, {
    stand: jetzt.toISOString(),
    kandidaten: top.map((k) => {
      const typen = [...new Set(k.signale.map((s) => s.typ))];
      const markt = k.wertpapier.markt ?? k.signale.find((s) => s.wertpapier.markt)?.wertpapier.markt;
      const pump = pumpVerdacht(typen, { fakten: k.signale.flatMap((s) => s.quellen.map((q) => q.fakt)) });
      return { schluessel: k.schluessel, name: k.wertpapier.name, ticker: k.wertpapier.ticker, isin: k.wertpapier.isin, ...(markt ? { markt } : {}), ...(pump ? { pump } : {}), score: k.score, typen, quellen: [...new Set(k.signale.flatMap((s) => s.quellen.map((q) => q.quelle)))] };
    }),
    anzahlSignale: zusammen.length,
  });
  console.log(`Lagebild ${b.datum}: ${zusammen.length} Signale, ${top.length} Kandidaten, Länge ${lagebildMarkdown(daten, typNamen).length} Zeichen.`);

  // Lernschleife: Kandidaten mitverfolgen (Nicht-Käufe), Statistik neu rechnen
  const abrufe = await trackingAktualisieren(jetzt, {}, { modus: 'haupt', schnelle: verdichten(zusammen) });
  // Hot-Stuff-Rückblick: Raketen und ihre Vorzeichen, Vorlauf-Statistik (vor der Statistik, damit sie mit einfließt)
  const hs = hotStuffAuswerten(b.datum, verdichten(zusammen), jetzt);
  const { statistik } = abgeleitetSchreiben(jetzt);
  console.log(`Tracking: ${abrufe} Kursabrufe. Hot Stuff: ${hs.anzahl} Raketen, ${hs.abdeckung ?? '–'} % mit Vorzeichen.`);

  // Samstags: Gewichte anpassen (in Grenzen, ab Mindestfallzahl; Claude-Vorschläge nur, wenn die Daten sie stützen)
  if (laufart === 'samstag') {
    const r = gewichteAnpassen(
      gewichte,
      signalCfg as SignalConfig & { grenzen: Grenzen },
      statistik.kandidaten.nachSignalTyp,
      statistik.kandidaten.nachQuelle,
      leseJson<Vorschlag[]>('lernen/vorschlaege.json', []),
      b.datum,
    );
    schreibeJson('gewichte.json', { stand: jetzt.toISOString(), ...r.gewichte });
    const verlauf = leseJson<unknown[]>('lernen/gewichtsaenderungen.json', []);
    schreibeJson('lernen/gewichtsaenderungen.json', [...r.aenderungen, ...verlauf].slice(0, 300));
    const offeneVorschlaege = leseJson<Vorschlag[]>('lernen/vorschlaege.json', []);
    schreibeJson('lernen/vorschlaege.json', offeneVorschlaege.map((v) => r.vorschlaegeErledigt.find((e) => e.name === v.name && e.datum === v.datum && e.art === v.art) ?? v));
    console.log(`Gewichte: ${r.aenderungen.length} Änderung(en).`);
  }
}

// Datenkrake: alle Signale dieses Laufs in die Tagesdatei; tagsüber schnelle Signale ins Schattenbuch (Reaktionszeit)
tagesSignaleSpeichern(b.datum, zusammen, jetzt);
if (laufart === 'stuendlich') {
  const n = await trackingAktualisieren(jetzt, {}, { modus: 'stuendlich', schnelle: verdichten(zusammen) });
  console.log(`Schattenbuch (stündlich): ${n} Kursabrufe.`);
}

// Starke Meldung zu offener Position → Ereignislauf (höchstens 1 pro Tag insgesamt)
const cfg = ladeConfig();
const heute = system.ereignislaeufe?.[b.datum] ?? [];
const kritisch = zusammen.find(
  (s) => STARK.has(s.typ) && offen.some((o) => o.ticker && s.wertpapier.ticker && o.ticker.replace(/\..*$/, '') === s.wertpapier.ticker.replace(/\..*$/, '')) && !heute.includes(s.wertpapier.ticker ?? ''),
);
if (kritisch && heute.length < cfg.einstellungen.ereignisLaeufeProTag && istHandelstag(b.datum)) {
  const o = offen.find((x) => x.ticker?.replace(/\..*$/, '') === kritisch.wertpapier.ticker?.replace(/\..*$/, ''))!;
  const typName = signalCfg.typen[kritisch.typ]?.name ?? kritisch.typ;
  const text = `Wichtige Meldung zu offener Position ${o.name} (Order ${o.id}): ${typName}. ${kritisch.quellen.map((q) => `${q.quelle}: ${q.fakt} ${q.link ?? ''}`).join(' | ')}`;
  pushes.push(await ereignisBehandeln(o.id, o.name, typName, text, jetzt));
  system.ereignislaeufe = { [b.datum]: [...heute, o.id] };
}
schreibeJson('system.json', system);
await pushen(pushes, jetzt);
console.log(`Sammler (${laufart}): ${ergebnisse.filter(([, r]) => r).length}/${aktive.length} Quellen ok.`);
