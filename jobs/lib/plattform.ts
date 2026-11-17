// Hebelprodukte je US-Kürzel aus der amtlichen Liste ESMA FIRDS für die Plattformwahl der Depot-Orders (17.11.2026).
// Die Liste liegt privat im Archiv (stamm/gettex-hebel.json.gz, stamm/isin-kuerzel.json); der Kurswächter holt nur diese
// zwei Dateien per Sparse-Checkout nach _archiv. Fehlt eine davon oder ist die Liste nicht frisch/vollständig → null
// (Plattformwahl unverändert). Nie Inhalte loggen, nur Zählungen.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { hebelJeKuerzel } from '../../core/plattform.ts';
import type { HebelStand } from '../../core/volltreffer/firds.ts';

const ARCHIV = process.env.ARCHIV_DIR ?? '_archiv';

export function hebelListeLaden(heute: string): { je: Map<string, HebelStand> | null; usMaxHebel: number; cfd: { maxHebelPrivat: number; maxHebelProfi: number }; hinweis: string } {
  const vt = JSON.parse(readFileSync(join(process.env.CONFIG_DIR ?? 'config', 'volltreffer.json'), 'utf8')) as {
    hebel?: { maxAlterTage?: number; mindestZugeordnet?: number };
    plattformen?: { usBroker?: { maxHebel?: number }; cfd?: { maxHebelPrivat?: number; maxHebelProfi?: number } };
  };
  const usMaxHebel = vt.plattformen?.usBroker?.maxHebel ?? 2;
  const cfd = { maxHebelPrivat: vt.plattformen?.cfd?.maxHebelPrivat ?? 5, maxHebelProfi: vt.plattformen?.cfd?.maxHebelProfi ?? 20 };
  const pf = join(ARCHIV, 'stamm', 'gettex-hebel.json.gz');
  const zf = join(ARCHIV, 'stamm', 'isin-kuerzel.json');
  if (!existsSync(pf) || !existsSync(zf)) return { je: null, usMaxHebel, cfd, hinweis: 'Hebel-Liste (FIRDS) nicht da – Plattform wie bisher' };
  try {
    const liste = JSON.parse(gunzipSync(readFileSync(pf)).toString('utf8')) as { quelle: string; basiswerte: Record<string, HebelStand> };
    const zu = JSON.parse(readFileSync(zf, 'utf8')) as Record<string, string | null>;
    const r = hebelJeKuerzel(liste, zu, heute, { maxAlterTage: vt.hebel?.maxAlterTage ?? 21, mindestZugeordnet: vt.hebel?.mindestZugeordnet ?? 0.9 });
    const hinweis = `Hebel-Liste FIRDS ${liste.quelle}: ${r.zugeordnet}/${r.isins} zugeordnet, ${r.je.size} Kürzel → ${r.vollstaendig ? 'Plattformwahl aktiv' : 'nicht vollständig – Plattform wie bisher'}`;
    return { je: r.vollstaendig ? r.je : null, usMaxHebel, cfd, hinweis };
  } catch (e) {
    return { je: null, usMaxHebel, cfd, hinweis: `Hebel-Liste (FIRDS) nicht lesbar: ${(e as Error).message.slice(0, 80)}` };
  }
}
