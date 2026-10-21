// Übernimmt Entscheidungen der Claude-Routinen von Branches claude/lauf-* in den daten-Branch.
// Läuft als eigene Action (Push auf claude/**) und zusätzlich zu Beginn jedes Kurswächter-Laufs (falls eine
// Übernahme-Action wegen der Concurrency-Gruppe verworfen wurde). Idempotent: bereits übernommene Dateien werden übersprungen.
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ordersAusEreignissen } from '../../core/ableiten.ts';
import { entscheidungUebernehmen, type Entscheidung } from '../../core/entscheidung.ts';
import { pushAngepasst, pushBericht, pushBriefing, pushWarnung, type PushNachricht } from '../../core/push.ts';
import type { Order } from '../../core/typen.ts';
import { DATEN_DIR, haengeEreignisseAn, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './dateien.ts';

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

const schema = JSON.parse(readFileSync(join(process.cwd(), 'schema', 'entscheidung.schema.json'), 'utf8'));
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const pruefe = ajv.compile(schema);

const TYP_TEXT: Record<Entscheidung['typ'], string> = { morgenlauf: 'Morgenlauf', abendlauf: 'Abendlauf', ereignislauf: 'Ereignislauf', wochenrueckblick: 'Wochenrückblick' };

function briefingSpeichern(e: Entscheidung) {
  const datei = `lagebild/${e.datum}.json`;
  const lb = leseJson<Record<string, unknown>>(datei, { datum: e.datum, erstellt: e.erstellt, makro: [], termine: [], meldungen: [], insider: [], kandidaten: [] });
  lb.briefing = e.briefing;
  schreibeJson(datei, lb);
  schreibeJson('lagebild/heute.json', lb);
  const index = leseJson<{ tage: string[] }>('lagebild/index.json', { tage: [] });
  if (!index.tage.includes(e.datum)) index.tage = [e.datum, ...index.tage].slice(0, 90);
  schreibeJson('lagebild/index.json', index);
}

export interface UebernahmeErgebnis {
  dateien: number;
  pushes: PushNachricht[];
  geloeschteBranches: string[];
}

export function uebernehmeAlle(jetzt: Date): UebernahmeErgebnis {
  const cfg = ladeConfig();
  const ergebnis: UebernahmeErgebnis = { dateien: 0, pushes: [], geloeschteBranches: [] };
  let branches: string[] = [];
  try {
    branches = git('ls-remote', '--heads', 'origin', 'claude/lauf-*')
      .split('\n')
      .filter(Boolean)
      .map((z) => z.split('\t')[1].replace('refs/heads/', ''));
  } catch (e) {
    console.error(`ls-remote fehlgeschlagen: ${(e as Error).message}`);
    return ergebnis;
  }

  for (const branch of branches) {
    try {
      git('fetch', '-q', 'origin', `refs/heads/${branch}`);
    } catch (e) {
      console.error(`Fetch ${branch} fehlgeschlagen: ${(e as Error).message}`);
      continue;
    }
    const dateien = git('ls-tree', '-r', '--name-only', 'FETCH_HEAD', 'laeufe/')
      .split('\n')
      .filter((d) => /^laeufe\/[\w.-]+\.json$/.test(d));
    for (const pfad of dateien) {
      const name = pfad.slice('laeufe/'.length);
      if (existsSync(join(DATEN_DIR, 'laeufe', name)) || existsSync(join(DATEN_DIR, 'laeufe', 'ungueltig', name))) continue;
      const roh = git('show', `FETCH_HEAD:${pfad}`);
      let e: Entscheidung;
      try {
        e = JSON.parse(roh) as Entscheidung;
      } catch {
        schreibeText(`laeufe/ungueltig/${name}`, roh);
        ergebnis.pushes.push(pushWarnung(`Claude-Ergebnis ${name} ist kein gültiges JSON – nicht übernommen.`, jetzt.toISOString()));
        continue;
      }
      const gueltig: boolean = pruefe(e as unknown);
      if (!gueltig) {
        const fehler = (pruefe.errors ?? []).slice(0, 5).map((f) => `${f.instancePath || '/'} ${f.message}`).join('; ');
        schreibeText(`laeufe/ungueltig/${name}`, roh);
        schreibeText(`laeufe/ungueltig/${name}.fehler.txt`, fehler + '\n');
        ergebnis.pushes.push(pushWarnung(`${TYP_TEXT[e.typ] ?? 'Claude-Lauf'}: Ergebnis verletzt das Schema (${fehler.slice(0, 120)}) – nicht übernommen.`, jetzt.toISOString()));
        console.error(`Schemafehler ${name}: ${fehler}`);
        continue;
      }

      const vorher = ordersAusEreignissen(leseEreignisse());
      const u = entscheidungUebernehmen(e, vorher, jetzt, cfg.einstellungen);
      const neu = haengeEreignisseAn(u.ereignisse);
      const nachher = ordersAusEreignissen(leseEreignisse());
      const nachId = new Map<string, Order>(nachher.map((o) => [o.id, o]));
      schreibeText(`laeufe/${name}`, roh.endsWith('\n') ? roh : roh + '\n');
      ergebnis.dateien++;

      if (e.briefing?.length) {
        briefingSpeichern(e);
        ergebnis.pushes.push(pushBriefing(e.briefing, jetzt.toISOString()));
      }
      if (e.lektionen && e.typ !== 'ereignislauf') schreibeText('lernen/lektionen.md', e.lektionen.endsWith('\n') ? e.lektionen : e.lektionen + '\n');
      if (e.gewichtsvorschlaege?.length) {
        const v = leseJson<unknown[]>('lernen/vorschlaege.json', []);
        schreibeJson('lernen/vorschlaege.json', [...e.gewichtsvorschlaege.map((g) => ({ ...g, datum: e.datum, status: 'offen' })), ...v].slice(0, 200));
      }
      if (e.wochenrueckblick) {
        schreibeText(`wochen/${e.datum}.md`, e.wochenrueckblick.text + '\n');
        ergebnis.pushes.push({ typ: 'wochenrueckblick', titel: '📊 Wochenrückblick', text: e.wochenrueckblick.push, ziel: '#/lernen', tag: `woche-${e.datum}`, erstellt: jetzt.toISOString() });
      }
      for (const ev of neu) {
        const o = ev.orderId ? nachId.get(ev.orderId) : undefined;
        if (ev.typ === 'angepasst' && o) ergebnis.pushes.push(pushAngepasst(o, (ev.daten as { anpassung: Order['anpassungen'][0] }).anpassung));
        if (ev.typ === 'bericht' && o) ergebnis.pushes.push(pushBericht(o, (ev.daten as { learnings: string[] }).learnings.length, jetzt.toISOString()));
      }
      for (const h of u.hinweise.filter((h) => /abgelehnt|Pflicht-Order fehlt/.test(h))) ergebnis.pushes.push(pushWarnung(h, jetzt.toISOString()));
      for (const h of u.hinweise) console.log(`Hinweis ${name}: ${h}`);

      const system = leseJson<Record<string, unknown>>('system.json', {});
      system.letzterClaudeLauf = { zeit: jetzt.toISOString(), typ: TYP_TEXT[e.typ] };
      schreibeJson('system.json', system);
      // Offene Ereignisse wurden diesem Lauf im Kontext gezeigt → erledigt (Wochenrückblick behandelt keine Positionen)
      if (e.typ !== 'wochenrueckblick') schreibeJson('offene-ereignisse.json', leseJson<{ zeit: string }[]>('offene-ereignisse.json', []).filter((x) => x.zeit > e.erstellt));
      console.log(`${name}: ${neu.length} Ereignisse übernommen.`);
    }
    // Alles ist im daten-Branch archiviert (gültig unter laeufe/, ungültig unter laeufe/ungueltig/) → Branch aufräumen.
    try {
      git('push', '-q', 'origin', '--delete', branch);
      ergebnis.geloeschteBranches.push(branch);
    } catch (e) {
      console.error(`Branch ${branch} konnte nicht gelöscht werden: ${(e as Error).message}`);
    }
  }
  return ergebnis;
}
