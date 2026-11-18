// Fehlerlage sammeln (18.11.2026) – läuft stündlich im Workflow „Selbstverbesserung“ (verbesserung.yml, Job fehlerlage).
// Schreibt `fehler/lage.json` in den daten-Zweig: offene Fehler-Issues des Besitzers, gescheiterte Workflows (letzter
// echter Lauf auf main), Quellen im Ausfall, abgewiesene Routinen-Ausgaben. Meldet Punkte, die länger als
// `fehler.meldenNachStunden` offen sind, einmal mit 🔴❗ (dann braucht es eine Bau-Sitzung). Alles geschwärzt.
// Aufruf: node jobs/fehlerlage.ts   (GH_TOKEN, GITHUB_REPOSITORY, GITHUB_REPOSITORY_OWNER, DATEN_DIR)
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { eigeneFehlerIssues, fehlerZeilen, gescheiterteWorkflows, lageFortschreiben, quellenImAusfall, type FehlerLage, type FehlerPunktNeu, type QuellenStand, type WorkflowLauf } from '../core/fehlerlage.ts';
import type { PushNachricht } from '../core/push.ts';
import { DATEN_DIR, leseJson, schreibeJson } from './lib/dateien.ts';
import { schwaerzen } from './lib/schwaerzen.ts';

const REPO = process.env.GITHUB_REPOSITORY || 'pennyboberde-source/schattendepot';
const BESITZER = process.env.GITHUB_REPOSITORY_OWNER || REPO.split('/')[0];
const jetzt = new Date(process.env.JETZT ?? Date.now());
const cfg = (JSON.parse(readFileSync('config/verbesserung.json', 'utf8')) as { fehler?: { meldenNachStunden?: number; ohneWorkflows?: string[] } }).fehler ?? {};

const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 60e6, stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
const versuch = <T>(f: () => T, wo: string): T | null => {
  try {
    return f();
  } catch (e) {
    console.log(`${wo}: ${schwaerzen((e as Error).message).slice(0, 200)}`);
    return null;
  }
};

const punkte: FehlerPunktNeu[] = [];

// 1. Fehler-Meldungen aus der App (nur vom Besitzer)
const issues = versuch(() => JSON.parse(gh(['api', `repos/${REPO}/issues?labels=fehler&state=open&per_page=50`])), 'Issues');
if (issues) punkte.push(...eigeneFehlerIssues(issues, BESITZER).map((p) => ({ ...p, titel: schwaerzen(p.titel), text: schwaerzen(p.text) })));

// 2. Workflows, deren letzter echter Lauf auf main gescheitert ist
const ohne = new Set(cfg.ohneWorkflows ?? []);
const dateien = readdirSync('.github/workflows').filter((d) => /\.ya?ml$/.test(d) && !ohne.has(d));
const laeufe: WorkflowLauf[] = [];
for (const d of dateien) {
  const j = versuch(() => JSON.parse(gh(['api', `repos/${REPO}/actions/workflows/${d}/runs?per_page=10&branch=main`])) as { workflow_runs?: WorkflowLauf[] }, `Läufe ${d}`);
  for (const l of j?.workflow_runs ?? []) laeufe.push({ workflow: d, id: l.id, status: l.status, conclusion: l.conclusion, created_at: l.created_at, html_url: l.html_url });
}
for (const g of gescheiterteWorkflows(laeufe)) {
  const log = versuch(() => gh(['run', 'view', String(g.lauf.id), '--repo', REPO, '--log-failed']), `Log ${g.workflow}`) ?? '';
  const zeilen = fehlerZeilen(schwaerzen(log)).join('\n');
  punkte.push({
    schluessel: `workflow:${g.workflow}`,
    art: 'workflow',
    titel: `Workflow ${g.workflow}: ${g.inFolge} Lauf${g.inFolge === 1 ? '' : 'e'} in Folge gescheitert`,
    text: `Letzter Lauf ${g.lauf.id} vom ${g.lauf.created_at}.\n${zeilen || '(keine Fehlerzeilen im Log gefunden)'}`.slice(0, 4000),
    ...(g.lauf.html_url ? { link: g.lauf.html_url } : {}),
  });
}

// 3. Quellen im Ausfall
const qs = leseJson<{ quellen?: QuellenStand[] }>('quellenstatus.json', {}).quellen ?? [];
punkte.push(...quellenImAusfall(qs, jetzt).map((p) => ({ ...p, text: schwaerzen(p.text) })));

// 4. vom Schema abgewiesene Routinen-Ausgaben der letzten 3 Tage
const ordner = join(DATEN_DIR, 'laeufe', 'ungueltig');
if (existsSync(ordner)) {
  const grenze = new Date(jetzt.getTime() - 3 * 86400000).toISOString().slice(0, 10);
  for (const f of readdirSync(ordner).filter((x) => x.endsWith('.fehler.txt') && x.slice(0, 10) >= grenze)) {
    const name = f.replace(/\.fehler\.txt$/, '');
    punkte.push({ schluessel: `lauf:${name}`, art: 'lauf', titel: `Routinen-Ausgabe ${name} abgewiesen`, text: schwaerzen(readFileSync(join(ordner, f), 'utf8')).slice(0, 1500) });
  }
}

// Lage fortschreiben – nur schreiben, wenn sich etwas geändert hat oder der Stand älter als 6 Stunden ist
const alt = leseJson<FehlerLage | null>('fehler/lage.json', null);
const { lage, melden } = lageFortschreiben(alt, punkte, jetzt, cfg.meldenNachStunden ?? 36);
const kern = (l: FehlerLage | null) => JSON.stringify(l ? { p: l.punkte.map((p) => [p.schluessel, p.titel, p.text, p.seit]), g: l.gemeldet, e: l.erledigt } : null);
const veraltet = !alt || jetzt.getTime() - Date.parse(alt.stand) > 6 * 3600000;
if (kern(alt) !== kern(lage) || veraltet) schreibeJson('fehler/lage.json', lage);
console.log(`Fehlerlage: ${lage.punkte.length} offen (${['issue', 'workflow', 'quelle', 'lauf'].map((a) => `${lage.punkte.filter((p) => p.art === a).length} ${a}`).join(', ')}), ${melden.length} neu zu melden.`);
for (const p of lage.punkte) console.log(`- ${p.schluessel} seit ${p.seit.slice(0, 16)}`);

if (melden.length) {
  const iso = jetzt.toISOString();
  const nachricht: PushNachricht = {
    typ: 'warnung',
    titel: '🔴❗ Fehler braucht eine Bau-Sitzung',
    text: `Der Fehlerlauf konnte das nicht selbst beheben: ${melden.map((p) => p.titel).join(' · ')}`.slice(0, 400),
    ziel: '#/einstellungen',
    tag: `fehlerlage-${melden.map((p) => p.schluessel).join('-')}`.slice(0, 120),
    erstellt: iso,
  };
  const { pushen } = await import('./lib/pushen.ts');
  const n = await pushen([nachricht], jetzt).catch((e: Error) => {
    console.log(`Mitteilung fehlgeschlagen: ${schwaerzen(e.message)}`);
    return 0;
  });
  console.log(`${n} Mitteilung(en) gesendet.`);
}
