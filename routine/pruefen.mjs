// Prüft eine Ergebnisdatei gegen schema/entscheidung.schema.json, bevor sie gepusht wird.
// Aufruf: node routine/pruefen.mjs laeufe/<datum>-<typ>.json
// Braucht ajv: falls nicht installiert → npm install --no-save --silent ajv@8 ajv-formats@3
import { readFileSync } from 'node:fs';

const datei = process.argv[2];
if (!datei) {
  console.error('Aufruf: node routine/pruefen.mjs laeufe/<datei>.json');
  process.exit(2);
}
let Ajv, addFormats;
try {
  Ajv = (await import('ajv')).default;
  addFormats = (await import('ajv-formats')).default;
} catch {
  console.error('ajv fehlt → zuerst: npm install --no-save --silent ajv@8 ajv-formats@3');
  process.exit(2);
}
const schema = JSON.parse(readFileSync('schema/entscheidung.schema.json', 'utf8'));
let daten;
try {
  daten = JSON.parse(readFileSync(datei, 'utf8'));
} catch (e) {
  console.error(`Kein gültiges JSON: ${e.message}`);
  process.exit(1);
}
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const ok = ajv.validate(schema, daten);
if (!ok) {
  for (const f of ajv.errors) console.error(`✗ ${f.instancePath || '/'} ${f.message}${f.params?.additionalProperty ? ` (${f.params.additionalProperty})` : ''}`);
  process.exit(1);
}
// Zusätzliche fachliche Kurzprüfung (wie core/entscheidung.ts)
const fehler = [];
for (const o of daten.orders ?? []) {
  const k = o.wertpapier.anlageklasse;
  if (k === 'hebel' && !o.hebel) fehler.push(`${o.wertpapier.name}: Hebel-Angaben fehlen`);
  if (k === 'krypto_etn' && !o.etn) fehler.push(`${o.wertpapier.name}: ETN-Angaben fehlen`);
  if (k !== 'hebel' && k !== 'krypto_etn' && !o.wertpapier.kursbasis) fehler.push(`${o.wertpapier.name}: kursbasis fehlt`);
  if (o.pflichtOrder && o.konfidenz > 50) fehler.push(`${o.wertpapier.name}: Pflicht-Order braucht konfidenz ≤ 50`);
}
if (daten.typ === 'morgenlauf' && !(daten.orders ?? []).length) fehler.push('Morgenlauf braucht mindestens 1 Order (notfalls Pflicht-Order)');
if (fehler.length) {
  for (const f of fehler) console.error(`✗ ${f}`);
  process.exit(1);
}
console.log(`✓ ${datei} ist gültig (${(daten.orders ?? []).length} Order(s), ${(daten.anpassungen ?? []).length} Anpassung(en), ${(daten.berichte ?? []).length} Bericht(e)).`);
