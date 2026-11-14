// Selbstverbesserung (Plan Volltreffer VS) – das Skript der Übernahme-Action. Läuft IMMER aus dem Stand von main
// (Zeitplan bzw. von Hand), nie aus dem Branch, der geprüft wird.
//   node jobs/verbesserung.ts finden                         → neuen Branch claude/verbesserung-* suchen, Wache
//   node jobs/verbesserung.ts pruefen <branch> <sha>         → Leitplanken + Tests + Probelauf auf dem Probe-Merge
//   node jobs/verbesserung.ts uebernehmen <ergebnis.json>    → Leitplanken erneut, zusammenführen, pushen, protokollieren
//   node jobs/verbesserung.ts ablehnen <ergebnis.json>       → Pull Request (oder Issue) mit Begründung, Mitteilung
//   node jobs/verbesserung.ts zurueck <merge|letzte> <ausloeser> [grund] → Übernahme zurücknehmen
//   node jobs/verbesserung.ts vorpruefen                     → Leitplanken-Prüfung des eigenen Commits (für den Verbesserungslauf, vor dem Push)
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KENNZAHLEN, wacheUrteil } from '../core/verbesserung/kennzahlen.ts';
import { branchPruefen } from '../core/verbesserung/pruefung.ts';
import type { DateiAenderung, Leitplanken, Manifest, ProtokollEintrag } from '../core/verbesserung/typen.ts';
import type { PushNachricht } from '../core/push.ts';

const ROOT = process.cwd();
const REPO = process.env.GITHUB_REPOSITORY || 'pennyboberde-source/schattendepot';
const BOT = ['-c', 'user.name=schattendepot-bot', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com'];
const leitplanken = () => JSON.parse(readFileSync(join(ROOT, 'config', 'verbesserung.json'), 'utf8')) as Leitplanken;

const git = (args: string[], cwd = ROOT) => execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 80e6, stdio: ['ignore', 'pipe', 'pipe'] }).replace(/\s+$/, '');
const versuch = <T>(f: () => T): T | null => {
  try {
    return f();
  } catch {
    return null;
  }
};
function ausgabe(name: string, wert: string) {
  console.log(`→ ${name}=${wert}`);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${wert.replace(/[\r\n]+/g, ' ')}\n`);
}
const branchOk = (l: Leitplanken, b: string) => b.startsWith(l.branchPrefix) && /^[A-Za-z0-9._/-]+$/.test(b) && !b.includes('..');

export interface Ergebnis {
  ok: boolean;
  branch: string;
  sha: string;
  mainSha: string;
  gruende: string[];
  zeilen: number;
  manifest?: Manifest;
  tests?: { unit: number; e2e: number };
  geprueftUm: string;
}

/** Protokoll aus dem daten-Branch lesen, ohne ihn auszuchecken. */
function protokollVonDaten(): ProtokollEintrag[] {
  versuch(() => git(['fetch', '-q', '--depth', '1', 'origin', '+refs/heads/daten:refs/remotes/origin/daten']));
  const text = versuch(() => git(['show', 'origin/daten:lernen/verbesserung/protokoll.jsonl'])) ?? '';
  return text.split('\n').filter((z) => z.trim()).map((z) => JSON.parse(z) as ProtokollEintrag);
}

/** Probe-Merge des Branches auf den aktuellen main in einem eigenen Arbeitsordner (ohne Commit). */
function probeMerge(branch: string, sha: string, lokal = false): { dir: string; mainSha: string; fehler?: string } {
  git(['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main', ...(lokal ? [] : [`+refs/heads/${branch}:refs/remotes/origin/${branch}`])]);
  const mainSha = git(['rev-parse', 'origin/main']);
  const dir = mkdtempSync(join(tmpdir(), 'verbesserung-'));
  if (!lokal && git(['rev-parse', `origin/${branch}`]) !== sha) return { dir, mainSha, fehler: 'Der Branch hat sich seit dem Fund geändert – der nächste Lauf prüft den neuen Stand' };
  git(['worktree', 'add', '-q', '--detach', '--force', dir, 'origin/main']);
  try {
    git([...BOT, 'merge', '--no-commit', '--no-ff', sha], dir);
  } catch (e) {
    const text = String((e as { stdout?: string }).stdout ?? '') + String((e as { stderr?: string }).stderr ?? '');
    if (!/Already up to date/i.test(text)) return { dir, mainSha, fehler: `Konflikt mit dem aktuellen Stand von main (zum Beispiel durch eine Bau-Sitzung): ${text.split('\n').filter((z) => /CONFLICT|Konflikt/.test(z)).slice(0, 4).join(' | ') || text.slice(0, 200)}` };
  }
  return { dir, mainSha };
}

/** Leitplanken-Prüfung des Probe-Merges gegen main (rein lesend, ohne Code des Branches auszuführen). */
function statischPruefen(dir: string, l: Leitplanken) {
  const null0 = (s: string) => s.split('\0').filter((x) => x.length);
  const status = null0(git(['diff', '--cached', '--no-renames', '--name-status', '-z', 'origin/main'], dir));
  const zeilen = new Map(
    null0(git(['diff', '--cached', '--no-renames', '--numstat', '-z', 'origin/main'], dir)).map((z) => {
      const [plus, minus, ...pfad] = z.split('\t');
      return [pfad.join('\t'), { plus: Number(plus) || 0, minus: Number(minus) || 0 }];
    }),
  );
  const dateien: DateiAenderung[] = [];
  for (let i = 0; i + 1 < status.length; i += 2) dateien.push({ pfad: status[i + 1], status: (status[i][0] === 'A' ? 'A' : status[i][0] === 'D' ? 'D' : 'M') as DateiAenderung['status'], ...(zeilen.get(status[i + 1]) ?? { plus: 0, minus: 0 }) });
  const neueZeilen: { pfad: string; zeile: string }[] = [];
  let pfad = '';
  for (const z of git(['-c', 'core.quotepath=false', 'diff', '--cached', '--no-renames', '-U0', 'origin/main'], dir).split('\n')) {
    if (z.startsWith('+++ ')) pfad = z.slice(4).replace(/^b\//, '');
    else if (z.startsWith('+') && !z.startsWith('+++')) neueZeilen.push({ pfad, zeile: z.slice(1) });
  }
  return branchPruefen(
    {
      dateien,
      alt: (p) => versuch(() => git(['show', `origin/main:${p}`], dir)),
      neu: (p) => (existsSync(join(dir, p)) ? readFileSync(join(dir, p), 'utf8') : null),
      neueZeilen,
      kennzahlen: Object.keys(KENNZAHLEN),
    },
    l,
  );
}

/** Befehl im Ordner des Kandidaten ausführen – mit kleiner Umgebung, ohne Tokens der Action. */
function lauf(name: string, dir: string, cmd: string, args: string[], extra: Record<string, string | undefined> = {}, timeoutMin = 10): { fehler?: string; text: string } {
  const env: Record<string, string> = { CI: '1' };
  for (const k of ['PATH', 'Path', 'HOME', 'USERPROFILE', 'SystemRoot', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'LANG', 'PLAYWRIGHT_BROWSERS_PATH']) if (process.env[k]) env[k] = process.env[k]!;
  for (const [k, w] of Object.entries(extra)) if (w) env[k] = w;
  try {
    const text = execFileSync(cmd, args, { cwd: dir, env, encoding: 'utf8', maxBuffer: 80e6, timeout: timeoutMin * 60000, stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
    return { text };
  } catch (e) {
    const x = e as { stdout?: string; stderr?: string; message: string };
    const text = `${x.stdout ?? ''}\n${x.stderr ?? ''}`;
    const ende = text.split('\n').filter((z) => z.trim()).slice(-6).join(' | ').replace(/\u001b\[[0-9;]*m/g, '').slice(0, 500);
    return { fehler: `${name} fehlgeschlagen: ${ende || x.message.slice(0, 200)}`, text };
  }
}

/** Tests und Probelauf auf dem Probe-Merge. Vergleichswerte (Zahl der Tests) kommen vom Stand auf main. */
function dynamischPruefen(dir: string): { gruende: string[]; tests: { unit: number; e2e: number } } {
  const gruende: string[] = [];
  const tests = { unit: 0, e2e: 0 };
  const tmp = mkdtempSync(join(tmpdir(), 'verbesserung-tests-'));
  if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
  const unitZahl = (ordner: string, datei: string) => {
    const r = lauf('Unit-Tests', ordner, 'npx', ['vitest', 'run', '--reporter=json', `--outputFile=${datei}`]);
    const j = versuch(() => JSON.parse(readFileSync(datei, 'utf8')) as { numTotalTests: number; numPassedTests: number; numFailedTests: number });
    return { r, j };
  };
  const e2eListe = (ordner: string) => Number(lauf('E2E-Liste', ordner, 'npx', ['playwright', 'test', '--list']).text.match(/Total: (\d+) tests?/)?.[1] ?? 0);

  const t = lauf('Typprüfung (tsc)', dir, 'npx', ['tsc', '--noEmit']);
  if (t.fehler) return { gruende: [t.fehler], tests };
  const basis = unitZahl(ROOT, join(tmp, 'unit-main.json'));
  const kand = unitZahl(dir, join(tmp, 'unit-kandidat.json'));
  tests.unit = kand.j?.numPassedTests ?? 0;
  if (kand.r.fehler || !kand.j || kand.j.numFailedTests > 0) gruende.push(kand.r.fehler ?? 'Unit-Tests: Ergebnis nicht lesbar');
  else if (basis.j && kand.j.numPassedTests < basis.j.numTotalTests) gruende.push(`Unit-Tests: nur ${kand.j.numPassedTests} bestanden, auf main sind es ${basis.j.numTotalTests} – Tests dürfen nicht weniger werden`);
  if (gruende.length) return { gruende, tests };

  const bau = lauf('Build', dir, 'npm', ['run', 'build']);
  if (bau.fehler) return { gruende: [bau.fehler], tests };
  const einbinden = lauf('Demo-Daten einbinden', dir, 'node', ['scripts/daten-einbinden.mjs', 'demo/daten']);
  const e2e = einbinden.fehler ? einbinden : lauf('E2E-Tests', dir, 'npx', ['playwright', 'test', '--reporter=line'], {}, 15);
  const bestanden = Number(e2e.text.match(/(\d+) passed/)?.[1] ?? 0);
  tests.e2e = bestanden;
  const soll = e2eListe(ROOT);
  if (e2e.fehler) gruende.push(e2e.fehler);
  else if (bestanden < soll) gruende.push(`E2E-Tests: nur ${bestanden} bestanden, auf main sind es ${soll} – Tests dürfen nicht weniger werden`);
  if (gruende.length) return { gruende, tests };

  // Probelauf von Sammler, Kurswächter und Daytrading auf einer Kopie der Daten (echte Kurse, nichts wird geschrieben)
  const probe = lauf('Probelauf auf Datenkopie', dir, 'node', ['jobs/probelauf.ts', 'jobs'], { DATEN_DIR: join(ROOT, '_daten'), FINNHUB_API_KEY: process.env.FINNHUB_API_KEY, TWELVEDATA_API_KEY: process.env.TWELVEDATA_API_KEY, FMP_API_KEY: process.env.FMP_API_KEY, ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY }, 12);
  if (probe.fehler) gruende.push(probe.fehler);
  else if (/FEHLER in /.test(probe.text)) gruende.push(`Probelauf auf Datenkopie: ${probe.text.split('\n').filter((z) => z.startsWith('FEHLER in')).join(' | ').slice(0, 400)}`);
  return { gruende, tests };
}

async function mitteilen(nachrichten: PushNachricht[], jetzt: Date) {
  // erst hier laden: braucht node_modules (web-push) und liest DATEN_DIR
  const { pushen } = await import('./lib/pushen.ts');
  const n = await pushen(nachrichten, jetzt).catch((e: Error) => {
    console.error(`Mitteilung fehlgeschlagen: ${e.message}`);
    return 0;
  });
  console.log(`${n} Mitteilung(en) gesendet.`);
}

const befehl = process.argv[2];
const jetzt = new Date(process.env.JETZT ?? Date.now());
const iso = jetzt.toISOString();

if (befehl === 'finden') {
  const l = leitplanken();
  const protokoll = protokollVonDaten();
  const bekannt = new Set(protokoll.flatMap((p) => (p.typ === 'uebernommen' || p.typ === 'abgelehnt' ? [p.sha] : [])));
  const koepfe = (versuch(() => git(['ls-remote', '--heads', 'origin', `${l.branchPrefix}*`])) ?? '')
    .split('\n')
    .filter((z) => z.trim())
    .map((z) => ({ sha: z.split(/\s+/)[0], branch: z.split(/\s+/)[1].replace('refs/heads/', '') }))
    .filter((k) => branchOk(l, k.branch) && !bekannt.has(k.sha))
    .sort((a, b) => a.branch.localeCompare(b.branch));
  if (!l.aktiv) console.log('Selbstverbesserung ist ausgeschaltet (config/verbesserung.json › aktiv) – es wird nichts übernommen.');
  else if (koepfe.length) {
    ausgabe('branch', koepfe[0].branch);
    ausgabe('sha', koepfe[0].sha);
  } else console.log('Kein neuer Verbesserungs-Branch.');

  // Wache: zwei Ausfälle in Folge nach einer Übernahme → zurücknehmen
  const zurueck = new Set(protokoll.filter((p) => p.typ === 'zurueckgenommen').map((p) => p.merge));
  const letzte = protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'uebernommen' }> => p.typ === 'uebernommen' && !zurueck.has(p.merge)).sort((a, b) => b.zeit.localeCompare(a.zeit))[0];
  if (letzte && jetzt.getTime() - Date.parse(letzte.zeit) < l.wache.stunden * 3600000) {
    const laeufe = l.wache.workflows.flatMap((wf) => {
      const roh = versuch(() => execFileSync('gh', ['run', 'list', '--repo', REPO, '--workflow', wf, '-L', '10', '--json', 'conclusion,createdAt'], { encoding: 'utf8' }));
      return roh ? (JSON.parse(roh) as { conclusion: string | null; createdAt: string }[]).map((x) => ({ ...x, workflow: wf })) : [];
    });
    const w = wacheUrteil(laeufe, letzte.zeit, l.wache.ausfaelleInFolge);
    if (w) {
      ausgabe('zurueck', letzte.merge);
      ausgabe('grund', `${l.wache.ausfaelleInFolge} Läufe von ${w} sind nach der Übernahme in Folge ausgefallen`);
    } else console.log(`Wache: Übernahme ${letzte.merge.slice(0, 7)} vom ${letzte.datum} – Läufe in Ordnung.`);
  }
} else if (befehl === 'pruefen') {
  const [branch, sha] = process.argv.slice(3);
  const l = leitplanken();
  if (!branch || !sha || !branchOk(l, branch)) throw new Error('Aufruf: node jobs/verbesserung.ts pruefen <branch> <sha>');
  const m = probeMerge(branch, sha);
  const e: Ergebnis = { ok: false, branch, sha, mainSha: m.mainSha, gruende: [], zeilen: 0, geprueftUm: iso };
  if (m.fehler) e.gruende.push(m.fehler);
  else {
    const s = statischPruefen(m.dir, l);
    Object.assign(e, { gruende: s.gruende, zeilen: s.zeilen, ...(s.manifest ? { manifest: s.manifest } : {}) });
    if (s.ok && !process.env.VERBESSERUNG_NUR_STATISCH) {
      const d = dynamischPruefen(m.dir);
      e.gruende.push(...d.gruende);
      e.tests = d.tests;
    }
    e.ok = e.gruende.length === 0;
  }
  versuch(() => git(['worktree', 'remove', '--force', m.dir]));
  writeFileSync(process.env.ERGEBNIS ?? join(ROOT, 'verbesserung-ergebnis.json'), JSON.stringify(e, null, 2));
  console.log(e.ok ? `✓ ${branch} besteht die Prüfung: ${e.manifest?.aenderungen.length} Änderung(en), ${e.zeilen} Zeilen, ${e.tests?.unit ?? '–'} Unit-Tests, ${e.tests?.e2e ?? '–'} E2E-Tests.` : `✗ ${branch} wird abgelehnt:\n- ${e.gruende.join('\n- ')}`);
  ausgabe('ok', e.ok ? 'ja' : 'nein');
} else if (befehl === 'uebernehmen') {
  const e = JSON.parse(readFileSync(process.argv[3], 'utf8')) as Ergebnis;
  const l = leitplanken();
  if (!e.ok || !e.manifest || !branchOk(l, e.branch)) throw new Error('Ergebnis der Prüfung ist nicht „bestanden“');
  const m = probeMerge(e.branch, e.sha);
  if (m.fehler || m.mainSha !== e.mainSha) {
    console.log(m.fehler ?? 'main hat sich seit der Prüfung bewegt – der nächste Lauf prüft neu.');
    ausgabe('uebernommen', 'nein');
  } else {
    // Leitplanken noch einmal prüfen – hier läuft kein Code des Branches, nur der von main
    const s = statischPruefen(m.dir, l);
    if (!s.ok || !s.manifest) throw new Error(`Leitplanken-Prüfung vor der Übernahme gescheitert:\n- ${s.gruende.join('\n- ')}`);
    const titel = `Verbesserung ${s.manifest.datum}: ${s.manifest.zusammenfassung}`.slice(0, 180);
    const text = [titel, '', ...s.manifest.aenderungen.map((a) => `- ${a.titel} (${a.bereich}) – Messkriterium: ${a.messkriterium.text}`), '', `Automatisch übernommen aus ${e.branch} nach Leitplanken-Prüfung, ${e.tests?.unit ?? '?'} Unit-Tests, ${e.tests?.e2e ?? '?'} E2E-Tests und Probelauf auf einer Datenkopie.`].join('\n');
    git([...BOT, 'commit', '-q', '-m', text], m.dir);
    const merge = git(['rev-parse', 'HEAD'], m.dir);
    git(['push', '-q', 'origin', 'HEAD:refs/heads/main'], m.dir);
    console.log(`Übernommen: ${merge.slice(0, 7)} auf main.`);
    const { protokollAnhaengen, uebersichtSchreiben } = await import('./lib/verbesserung.ts');
    protokollAnhaengen([{ typ: 'uebernommen', zeit: iso, datum: s.manifest.datum, branch: e.branch, sha: e.sha, merge, zeilen: s.zeilen, tests: e.tests ?? { unit: 0, e2e: 0 }, zusammenfassung: s.manifest.zusammenfassung, aenderungen: s.manifest.aenderungen, ...(s.manifest.freigaben?.length ? { freigaben: s.manifest.freigaben } : {}) }]);
    uebersichtSchreiben(jetzt, l);
    const n = s.manifest.aenderungen.length;
    const nachrichten: PushNachricht[] = [{ typ: 'bericht', titel: `🛠️ Verbesserung: ${n} Änderung${n === 1 ? '' : 'en'} übernommen`, text: `${s.manifest.aenderungen.map((a) => a.titel).join(' · ')} · Rückgängig machen: in der App unter Lernen`.slice(0, 400), ziel: '#/lernen', tag: `verbesserung-${s.manifest.datum}`, erstellt: iso }];
    for (const f of s.manifest.freigaben ?? []) nachrichten.push({ typ: 'warnung', titel: `🔴❗ Freigabe nötig: ${f.titel}`.slice(0, 120), text: 'Die Anleitung steht in der App unter Lernen › Was sich verbessert hat.', ziel: '#/lernen', tag: `verbesserung-freigabe-${s.manifest.datum}`, erstellt: iso });
    await mitteilen(nachrichten, jetzt);
    versuch(() => git(['push', '-q', 'origin', '--delete', e.branch]));
    ausgabe('uebernommen', 'ja');
  }
  versuch(() => git(['worktree', 'remove', '--force', m.dir]));
} else if (befehl === 'ablehnen') {
  const e = JSON.parse(readFileSync(process.argv[3], 'utf8')) as Ergebnis;
  const l = leitplanken();
  if (e.ok || !branchOk(l, e.branch)) throw new Error('Nichts abzulehnen');
  const gh = (args: string[]) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const koerper = join(tmpdir(), `verbesserung-ablehnung-${Date.now()}.md`);
  const vergleich = `https://github.com/${REPO}/compare/main...${e.branch}`;
  writeFileSync(koerper, [`Der Verbesserungslauf hat den Branch \`${e.branch}\` abgeliefert. Die Übernahme-Action hat ihn **nicht übernommen**:`, '', ...e.gruende.map((g) => `- ${g}`), '', `Vergleich: ${vergleich}`, '', 'Was jetzt? Nichts tun heißt: Die Änderung bleibt draußen. Soll sie doch hinein, kann eine Bau-Sitzung sie prüfen und anpassen.', '', 'Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.'].join('\n'));
  const titel = `Verbesserung ${e.branch.replace(l.branchPrefix, '')} – nicht übernommen`;
  let link =
    versuch(() => (JSON.parse(gh(['pr', 'list', '--repo', REPO, '--head', e.branch, '--state', 'open', '--json', 'url'])) as { url: string }[])[0]?.url) ??
    versuch(() => gh(['pr', 'create', '--repo', REPO, '--base', 'main', '--head', e.branch, '--title', titel, '--body-file', koerper])) ??
    versuch(() => gh(['issue', 'create', '--repo', REPO, '--title', titel, '--body-file', koerper]));
  link = link?.split('\n').pop() || vergleich;
  console.log(`Abgelehnt: ${e.gruende.length} Grund/Gründe, Begründung unter ${link}`);
  const { protokollAnhaengen, uebersichtSchreiben } = await import('./lib/verbesserung.ts');
  protokollAnhaengen([{ typ: 'abgelehnt', zeit: iso, branch: e.branch, sha: e.sha, gruende: e.gruende.slice(0, 20), link }]);
  uebersichtSchreiben(jetzt, l);
  await mitteilen([{ typ: 'warnung', titel: '🛠️ Verbesserung nicht übernommen', text: `${e.gruende.slice(0, 2).join(' · ')}${e.gruende.length > 2 ? ` · und ${e.gruende.length - 2} weitere` : ''} · Details in der App unter Lernen`.slice(0, 400), ziel: '#/lernen', tag: `verbesserung-abgelehnt-${e.sha.slice(0, 7)}`, erstellt: iso }], jetzt);
} else if (befehl === 'zurueck') {
  const [wunsch = 'letzte', ausloeser = 'nutzer', ...rest] = process.argv.slice(3);
  const grund = rest.join(' ').trim() || 'vom Nutzer zurückgenommen';
  const { leseProtokoll, protokollAnhaengen, uebersichtSchreiben } = await import('./lib/verbesserung.ts');
  const protokoll = leseProtokoll();
  const schon = new Set(protokoll.filter((p) => p.typ === 'zurueckgenommen').map((p) => p.merge));
  const offen = protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'uebernommen' }> => p.typ === 'uebernommen' && !schon.has(p.merge)).sort((a, b) => b.zeit.localeCompare(a.zeit));
  const ziel = wunsch === 'letzte' || !wunsch ? offen[0] : offen.find((p) => /^[0-9a-f]{7,40}$/.test(wunsch) && p.merge.startsWith(wunsch));
  if (!ziel) {
    console.log('Keine passende, noch aktive Übernahme gefunden – nichts zurückzunehmen.');
    ausgabe('zurueckgenommen', 'nein');
  } else {
    git(['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']);
    const dir = mkdtempSync(join(tmpdir(), 'verbesserung-zurueck-'));
    git(['worktree', 'add', '-q', '--detach', '--force', dir, 'origin/main']);
    const warnung = async (text: string) => mitteilen([{ typ: 'warnung', titel: '⚠️ Rücknahme der Verbesserung gescheitert', text: `${text} – bitte eine Bau-Sitzung starten.`.slice(0, 400), ziel: '#/lernen', tag: `verbesserung-zurueck-fehler-${ziel.merge.slice(0, 7)}`, erstellt: iso }], jetzt);
    const rev = versuch(() => git([...BOT, 'revert', '-m', '1', '--no-edit', ziel.merge], dir));
    if (rev === null) {
      await warnung(`Die Übernahme vom ${ziel.datum} lässt sich nicht automatisch zurücknehmen (spätere Änderungen an denselben Stellen)`);
      throw new Error('git revert gescheitert');
    }
    if (!existsSync(join(dir, 'node_modules'))) symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'junction');
    const kaputt = lauf('Typprüfung (tsc)', dir, 'npx', ['tsc', '--noEmit']).fehler ?? lauf('Unit-Tests', dir, 'npx', ['vitest', 'run']).fehler;
    if (kaputt) {
      await warnung(`Nach der Rücknahme der Übernahme vom ${ziel.datum} sind die Tests rot`);
      throw new Error(kaputt);
    }
    const revert = git(['rev-parse', 'HEAD'], dir);
    git(['push', '-q', 'origin', 'HEAD:refs/heads/main'], dir);
    versuch(() => git(['worktree', 'remove', '--force', dir]));
    protokollAnhaengen([{ typ: 'zurueckgenommen', zeit: iso, merge: ziel.merge, revert, grund, ausloeser: ausloeser === 'wache' || ausloeser === 'bewertung' ? ausloeser : 'nutzer' }]);
    uebersichtSchreiben(jetzt, leitplanken());
    await mitteilen([{ typ: 'bericht', titel: '↩️ Verbesserung zurückgenommen', text: `Übernahme vom ${ziel.datum} (${ziel.aenderungen.map((a) => a.titel).join(' · ')}) ist rückgängig gemacht. Grund: ${grund}`.slice(0, 400), ziel: '#/lernen', tag: `verbesserung-zurueck-${ziel.merge.slice(0, 7)}`, erstellt: iso }], jetzt);
    console.log(`Zurückgenommen: ${ziel.merge.slice(0, 7)} → ${revert.slice(0, 7)} auf main.`);
    ausgabe('zurueckgenommen', 'ja');
  }
} else if (befehl === 'vorpruefen') {
  // Für den Verbesserungslauf: prüft den eigenen, schon committeten Stand gegen die Leitplanken, bevor er pusht
  const l = leitplanken();
  if (git(['status', '--porcelain', '--untracked-files=no'])) console.log('Hinweis: Es gibt noch nicht committete Änderungen – geprüft wird nur der Commit.');
  const m = probeMerge('(lokal)', git(['rev-parse', 'HEAD']), true);
  const s = m.fehler ? { ok: false, gruende: [m.fehler], zeilen: 0 } : statischPruefen(m.dir, l);
  versuch(() => git(['worktree', 'remove', '--force', m.dir]));
  console.log(s.ok ? `✓ Leitplanken eingehalten (${s.zeilen} von ${l.wochenbudget.maxZeilen} Zeilen). Die Action prüft zusätzlich tsc, Unit-Tests, E2E-Tests und einen Probelauf.` : `✗ Die Action würde diesen Stand ablehnen:\n- ${s.gruende.join('\n- ')}`);
  process.exitCode = s.ok ? 0 : 1;
} else {
  console.error('Aufruf: node jobs/verbesserung.ts finden | vorpruefen | pruefen <branch> <sha> | uebernehmen <ergebnis.json> | ablehnen <ergebnis.json> | zurueck <merge|letzte> <ausloeser> [grund]');
  process.exit(2);
}
