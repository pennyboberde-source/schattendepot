// Kopiert Laufzeitdaten (Checkout des daten-Branches oder demo/daten) nach dist/daten.
// Aufruf: node scripts/daten-einbinden.mjs <quellordner>
import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';

const quelle = process.argv[2];
if (!quelle || !existsSync(quelle)) {
  console.error(`Quellordner fehlt oder existiert nicht: ${quelle}`);
  process.exit(1);
}
if (!existsSync('dist')) {
  console.error('dist/ fehlt – zuerst "npm run build".');
  process.exit(1);
}
const ziel = join('dist', 'daten');
rmSync(ziel, { recursive: true, force: true });
cpSync(quelle, ziel, {
  recursive: true,
  filter: (pfad) => !['.git', '.github', 'node_modules'].includes(basename(pfad)),
});
console.log(`Daten aus ${quelle} nach ${ziel} kopiert.`);
