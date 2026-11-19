// Schnell-SEC (Quantensprung „Echtzeit“, Nutzer 19.11.2026): SEC-Meldungen (Prospekt 424B5, Shelf S-3, wesentliche
// 8-K) im Takt des Kurswächters (alle 15 Min.) statt nur im stündlichen Sammler. Neue Meldungen gehen in die
// Tagesdatei der Datenkrake und an den Autopilot; der Kurswächter direkt danach führt Vormerkungen zum dann aktuellen
// Kurs aus. Läuft als eigener Schritt im Workflow kurswaechter (Fehler stoppen den Wächter nie).
// Aufruf: node jobs/schnell.ts   (SEC_KONTAKT)
import { berlin, istHandelstag } from '../core/kalender.ts';
import { nurNeue, reaktionMinuten, schnellZeit } from '../core/schnell.ts';
import { kandidaten, zusammenfuehren, type Gewichte, type SignalConfig } from '../core/signale.ts';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { autopilotLauf } from './lib/autopilot.ts';
import { abgeleitetSchreiben } from './lib/abgeleitet.ts';
import { leseJson, schreibeJson } from './lib/dateien.ts';
import { tagesSignaleSpeichern } from './lib/datenkrake.ts';
import { kompakt } from './lib/kompakt.ts';
import { schwaerzen } from './lib/schwaerzen.ts';
import { secSchnell } from './quellen/sec.ts';

const jetzt = new Date(process.env.JETZT ?? Date.now());
const b = berlin(jetzt);
if (!schnellZeit(jetzt.getUTCHours(), istHandelstag(b.datum))) {
  console.log('Schnell-SEC: außerhalb des Zeitfensters (werktags 7–21 Uhr UTC).');
  process.exit(0);
}
if (!process.env.SEC_KONTAKT?.trim()) {
  console.log('Schnell-SEC: SEC_KONTAKT fehlt – übersprungen.');
  process.exit(0);
}
try {
  const alle = await Promise.race([secSchnell(jetzt), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Zeitlimit 40 s')), 40000))]);
  const { neu, gesehen } = nurNeue(alle, leseJson<{ datum: string; ids: string[] } | null>('schnell/sec.json', null), b.datum);
  schreibeJson('schnell/sec.json', gesehen);
  if (!neu.length) {
    console.log(`Schnell-SEC: ${alle.length} Meldungen im Feed, keine neue.`);
    process.exit(0);
  }
  const cfg = JSON.parse(readFileSync(join(process.cwd(), 'config', 'signale.json'), 'utf8')) as SignalConfig;
  const zusammen = zusammenfuehren(neu, cfg);
  tagesSignaleSpeichern(b.datum, zusammen, jetzt);
  const liste = kandidaten(zusammen, cfg, leseJson<Gewichte>('gewichte.json', {})).map(kompakt);
  const ap = autopilotLauf(jetzt, liste);
  for (const h of ap.hinweise) console.log(h);
  if (ap.neu) abgeleitetSchreiben(jetzt);
  console.log(`Schnell-SEC: ${neu.length} neue Meldungen (${[...new Set(neu.map((s) => s.typ))].join(', ')}), Meldung im Median vor ${reaktionMinuten(neu, jetzt) ?? '–'} Min., Autopilot ${ap.neu} vorgemerkt.`);
} catch (e) {
  console.log(schwaerzen(`Schnell-SEC fehlgeschlagen: ${(e as Error).message}`));
}
