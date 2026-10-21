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

const QUELLEN: Quelle[] = [...rssQuellen, openInsider, apeWisdom, fred, krakenKrypto, finnhub, fmp, alphaVantage, gdelt, wirtschaftskalender, sec8k];
const STARK_NEGATIV = new Set(['prognose_senkung', 'gewinn_enttaeuschung', 'analysten_abstufung']);
const STARK = new Set([...STARK_NEGATIV, 'uebernahmeangebot', 'prognose_erhoehung']);

const jetzt = new Date(process.env.JETZT ?? Date.now());
const b = berlin(jetzt);
const conf = <T>(d: string) => JSON.parse(readFileSync(join(process.cwd(), 'config', d), 'utf8')) as T;
const signalCfg = conf<SignalConfig>('signale.json');
const universum = conf<{ werte: UniversumWert[] }>('universum.json').werte;

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
const zusammen = zusammenfuehren(alleSignale, signalCfg);
const system = leseJson<Record<string, unknown> & { ereignislaeufe?: Record<string, string[]> }>('system.json', {});
system.letzterSammlerLauf = jetzt.toISOString();
const pushes: PushNachricht[] = [];

if (laufart === 'haupt' || laufart === 'samstag') {
  const gewichte = leseJson<Gewichte>('gewichte.json', {});
  const top = kandidaten(zusammen, signalCfg, gewichte);
  const meldungen = ergebnisse.flatMap(([, r]) => r?.meldungen ?? []);
  const daten: LagebildDaten = {
    datum: b.datum,
    erstellt: jetzt.toISOString(),
    makro: ergebnisse.flatMap(([, r]) => r?.makro ?? []),
    termine: ergebnisse.flatMap(([, r]) => r?.termine ?? []),
    meldungen: meldungen.filter((m) => !offen.some((o) => o.name === m.wertpapier)).sort((x, y) => (y.zeit ?? '').localeCompare(x.zeit ?? '')),
    insider: ergebnisse.flatMap(([, r]) => r?.insider ?? []),
    positionen: offen.map((o) => ({ id: o.id, name: o.name, meldungen: meldungen.filter((m) => m.wertpapier === o.name).slice(0, 3) })),
    kandidaten: top,
    quellen: ergebnisse.map(([q, r]) => ({ id: q.id, name: q.name, ok: !!r, signale: r?.signale.length ?? 0 })),
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
    kandidaten: top.map((k) => ({ schluessel: k.schluessel, name: k.wertpapier.name, ticker: k.wertpapier.ticker, isin: k.wertpapier.isin, score: k.score, typen: [...new Set(k.signale.map((s) => s.typ))], quellen: [...new Set(k.signale.flatMap((s) => s.quellen.map((q) => q.quelle)))] })),
    anzahlSignale: zusammen.length,
  });
  console.log(`Lagebild ${b.datum}: ${zusammen.length} Signale, ${top.length} Kandidaten, Länge ${lagebildMarkdown(daten, typNamen).length} Zeichen.`);

  // Lernschleife: Kandidaten mitverfolgen (Nicht-Käufe), Statistik neu rechnen
  const abrufe = await trackingAktualisieren(jetzt, {});
  const { statistik } = abgeleitetSchreiben(jetzt);
  console.log(`Tracking: ${abrufe} Kursabrufe.`);

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
