// Wartet vor dem Rückblick auf den jüngsten US-Handelstag im privaten Archiv (21.11.2026).
// Hintergrund: Massive stellt den Tag X erst gegen 05:00–05:40 UTC am Tag X+1 bereit. Rechnet der Rückblick vorher,
// sieht er nur X−1 – die sichtbaren Orders zum Stichtag X erschienen dann erst, nachdem ihr Einstieg (Eröffnung X+1)
// schon vorbei war. Deshalb: Rückblick nach dem Archivlauf, und dieser Schritt wartet höchstens WARTE_MINUTEN auf die Datei.
// Fehlt sie danach noch (Feiertag, Ausfall), rechnet der Rückblick trotzdem – mit Hinweis im Log.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { erwarteterUsTag } from '../core/volltreffer/ustag.ts';

const ARCHIV = process.env.ARCHIV_DIR ?? '_archiv';
const MAX = Number(process.env.WARTE_MINUTEN ?? 60);
const feiertage = new Set((JSON.parse(readFileSync(join(process.cwd(), 'config', 'daytrading.json'), 'utf8')) as { nyseFeiertage?: string[] }).nyseFeiertage ?? []);
const tag = erwarteterUsTag(new Date(), feiertage);
const datei = join(ARCHIV, 'us', tag.slice(0, 4), `${tag}.csv.gz`);
const start = Date.now();
for (;;) {
  if (existsSync(datei)) {
    console.log(`US-Tag ${tag} liegt im Archiv (nach ${Math.round((Date.now() - start) / 60000)} Min.).`);
    break;
  }
  if (Date.now() - start >= MAX * 60000) {
    console.log(`US-Tag ${tag} fehlt nach ${MAX} Min. – Rückblick rechnet mit dem bisherigen Stand (Feiertag oder Archiv verspätet).`);
    break;
  }
  await new Promise((r) => setTimeout(r, 180000));
  try {
    execFileSync('git', ['-C', ARCHIV, 'pull', '-q', '--ff-only'], { stdio: 'inherit' });
  } catch {
    console.log('Archiv-Pull fehlgeschlagen – nächster Versuch in 3 Min.');
  }
}
