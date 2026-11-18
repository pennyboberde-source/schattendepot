// Taktgeber (18.11.2026): läuft als ein langer Job rund um die Uhr, liest die Zeitpläne der Workflows aus
// .github/workflows/*.yml und stößt jeden Workflow an, dessen letzter fälliger Zeitpunkt länger als seine Kulanz
// zurückliegt, ohne dass seitdem ein Lauf begonnen hat (GitHub lässt Zeitpläne oft aus). Kurz vor dem Laufzeit-Limit
// stößt er sich selbst neu an. Ohne Geheimnisse: nur das Action-Token mit actions:write. Log nur Workflow-Namen.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { faellig, type TaktWorkflow } from '../core/takt.ts';

const REPO = process.env.GITHUB_REPOSITORY ?? 'pennyboberde-source/schattendepot';
const TOKEN = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN ?? '';
const TROCKEN = process.env.TAKT_TROCKEN === '1';
const cfg = JSON.parse(readFileSync('config/takt.json', 'utf8')) as { workflows: { datei: string; kulanz: number }[]; abstandSekunden: number; laufzeitMinuten: number };

function cronsAus(datei: string): string[] {
  const text = readFileSync(join('.github/workflows', datei), 'utf8');
  return [...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

const zeit = () => new Date().toISOString().slice(11, 16);
const WF: TaktWorkflow[] = cfg.workflows
  .filter((w) => readdirSync('.github/workflows').includes(w.datei))
  .map((w) => ({ datei: w.datei, crons: cronsAus(w.datei), kulanz: w.kulanz }))
  .filter((w) => w.crons.length);

async function api(pfad: string, init?: RequestInit): Promise<Response> {
  return fetch(`https://api.github.com/repos/${REPO}/${pfad}`, {
    ...init,
    headers: { ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(20000),
  });
}

async function letzterLauf(datei: string): Promise<Date | null | undefined> {
  const r = await api(`actions/workflows/${datei}/runs?per_page=1`);
  if (!r.ok) {
    console.log(`${zeit()} UTC: ${datei} – Läufe nicht lesbar (HTTP ${r.status})`);
    return undefined;
  }
  const j = (await r.json()) as { workflow_runs?: { created_at: string }[] };
  const t = j.workflow_runs?.[0]?.created_at;
  return t ? new Date(t) : null;
}

async function anstossen(datei: string): Promise<boolean> {
  if (TROCKEN) return true;
  const r = await api(`actions/workflows/${datei}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: 'main' }), headers: { 'Content-Type': 'application/json' } });
  return r.status === 204;
}

console.log(`Taktgeber: ${WF.map((w) => `${w.datei} (${w.crons.length} Zeitpläne, Kulanz ${w.kulanz} Min.)`).join(', ')}`);
const start = Date.now();
for (;;) {
  for (const w of WF) {
    try {
      const l = await letzterLauf(w.datei);
      if (l === undefined) continue;
      const f = faellig(w, new Date(), l);
      if (f.anstossen) console.log(`${zeit()} UTC: ${w.datei} fällig seit ${f.slot!.toISOString().slice(11, 16)} – ${(await anstossen(w.datei)) ? 'angestoßen' : 'Anstoßen fehlgeschlagen'}`);
    } catch (e) {
      console.log(`${zeit()} UTC: ${w.datei} – ${(e as Error).message.slice(0, 80)}`);
    }
  }
  if (TROCKEN || (Date.now() - start) / 60000 >= cfg.laufzeitMinuten) break;
  await new Promise((r) => setTimeout(r, cfg.abstandSekunden * 1000));
}
if (!TROCKEN) {
  const ok = await anstossen('takt.yml');
  console.log(ok ? 'Laufzeit erreicht – Taktgeber neu angestoßen.' : '::warning::Neustart des Taktgebers fehlgeschlagen – ein Zeitplan zündet neu.');
}
