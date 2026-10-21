// Übernahme-Action: Entscheidungen der Claude-Routinen prüfen, übernehmen, Pushes senden. Aufruf: node jobs/uebernahme.ts
import { abgeleitetSchreiben } from './lib/abgeleitet.ts';
import { pushen } from './lib/pushen.ts';
import { uebernehmeAlle } from './lib/uebernahme.ts';

const jetzt = new Date();
const r = uebernehmeAlle(jetzt);
if (r.dateien) abgeleitetSchreiben(jetzt);
const gesendet = await pushen(r.pushes, jetzt);
console.log(`Übernahme: ${r.dateien} Datei(en), ${gesendet} Push(es), gelöschte Branches: ${r.geloeschteBranches.join(', ') || '–'}`);
