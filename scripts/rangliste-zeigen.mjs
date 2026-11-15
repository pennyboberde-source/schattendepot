// Zeigt die verdichtete Rangliste des Rückblicks (nur öffentliche Kennzahlen) – für Proben von rueckblick.yml.
// Aufruf: DATEN_DIR=<Ordner> node scripts/rangliste-zeigen.mjs
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.env.DATEN_DIR ?? '_daten';
const lies = (p) => (existsSync(join(dir, p)) ? JSON.parse(readFileSync(join(dir, p), 'utf8')) : null);
const r = lies('lernen/muster/rangliste.json');
if (!r) {
  console.log('keine Rangliste');
  process.exit(0);
}
const z = (k) => `n ${k.n}, Quote ${k.quote} %, Ø ${k.ev} € ± ${k.se}, ${k.tage ?? '?'} Tage, größter Tag ${k.groessterTag ?? '?'} %`;
console.log(`Bestanden: ${r.bestandenZahl}, davon mit Vorteil: ${r.mitVorteilZahl}. Zeitraum ${r.zeitraum.von} bis ${r.zeitraum.bis}, Grenze ${r.zeitraum.grenze}.`);
for (const [i, e] of r.bestanden.slice(0, 25).entries()) {
  console.log(`${i + 1}. ${e.gruppe} – ${e.spielart}, ${e.fenster} T – Wertung ${e.wertung}${e.vorteil ? ', Vorteil' : ''}`);
  console.log(`   A: ${z(e.zeitraumA)} | B: ${z(e.zeitraumB)}`);
}
const buch = lies('lernen/muster/muster-buch.json');
if (buch) {
  const letzte = new Map();
  for (const e of buch.eintraege) letzte.set(e.schluessel, e);
  const imTest = [...letzte.values()].filter((e) => e.status !== 'beendet');
  console.log(`Muster-Buch: ${imTest.length} im Vorwärtstest, ${[...letzte.values()].length - imTest.length} beendet.`);
}
