// Probelauf auf einer Kopie der Daten (Plan Volltreffer, Abschnitt 5): echte Kurse, aber nichts wird committet,
// keine Mitteilungen, kein Ereignislauf. Aufruf: node jobs/probelauf.ts [schattenbuch|jobs|alles]
//   schattenbuch: Tageskandidaten des heutigen Tags neu aufnehmen (wie ein frischer Hauptlauf), Statistik neu rechnen,
//                 Daytrading-Bilanz mit der Regel „virtuell“ rechnen und die Abnahmewerte von V0 ausgeben.
//   jobs:         Sammler (stündlich), Kurswächter und Daytrading je einmal auf der Kopie laufen lassen.
//   umzug:        wie jobs, aber zweimal hintereinander – zeigt den Umzug in den privaten Zustand (erster Lauf schreibt
//                 privat, zweiter entfernt die alten öffentlichen Kopien).
// Zusatz „ohne-privat“ (z. B. node jobs/probelauf.ts jobs ohne-privat): so tun, als sei der private Zustand nicht
// erreichbar (Token abgelaufen) – die Jobs müssen dann normal weiterarbeiten und dürfen nichts davon öffentlich schreiben.
// Der private Zustand (PRIVAT_DIR, Standard _privat) wird ebenfalls nur als Kopie benutzt; fehlt er, beginnt die
// Kopie leer (wie der erste Lauf nach dem Umzug).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const art = process.argv[2] || 'schattenbuch';
const quelle = process.env.DATEN_DIR ?? '_daten';
const kopie = mkdtempSync(join(tmpdir(), 'probelauf-'));
cpSync(quelle, kopie, { recursive: true, filter: (p) => !/[\\/]\.git([\\/]|$)/.test(p) });
// Privater Zustand: nie den echten Checkout benutzen, immer eine Kopie (oder bei „ohne-privat“ einen Pfad, den es nicht gibt)
const ohnePrivat = process.argv.includes('ohne-privat');
const privatQuelle = process.env.PRIVAT_DIR ?? '_privat';
const privatKopie = mkdtempSync(join(tmpdir(), 'probelauf-privat-'));
const privatEcht = existsSync(join(privatQuelle, 'LIES-MICH.md'));
if (!ohnePrivat) {
  if (privatEcht) cpSync(privatQuelle, privatKopie, { recursive: true, filter: (p) => !/[\\/]\.git([\\/]|$)/.test(p) });
  else writeFileSync(join(privatKopie, 'LIES-MICH.md'), '# Probelauf: leerer privater Zustand\n');
}
const privatDir = ohnePrivat ? join(privatKopie, 'nicht-erreichbar') : privatKopie;
// Ab hier arbeitet alles auf den Kopien – und ohne Mitteilungen/Ereignislauf
Object.assign(process.env, { DATEN_DIR: kopie, PRIVAT_DIR: privatDir, PUSH_SUBSCRIPTION: '', VAPID_PRIVATE_KEY: '', ROUTINE_FIRE_URL: '', ROUTINE_FIRE_TOKEN: '', OHNE_UEBERNAHME: '1' });
console.log(`Probelauf „${art}“ auf Datenkopie ${kopie} (Original ${quelle} bleibt unberührt).`);
console.log(ohnePrivat ? 'Privater Zustand: absichtlich NICHT erreichbar (Test „ohne-privat“).' : `Privater Zustand: Kopie ${privatKopie} – ${privatEcht ? `aus ${privatQuelle}` : 'leer begonnen (kein Checkout vorhanden)'}.`);

const lese = <T>(datei: string, standard: T): T => (existsSync(join(kopie, datei)) ? (JSON.parse(readFileSync(join(kopie, datei), 'utf8')) as T) : standard);
const prozent = (teil: number, ganz: number) => (ganz ? `${Math.round((teil / ganz) * 1000) / 10} %` : '–');

if (art === 'schattenbuch' || art === 'alles') {
  // Module erst jetzt laden: sie lesen DATEN_DIR beim Import
  const { berlin } = await import('../core/kalender.ts');
  const { trackingAktualisieren, trackingText } = await import('./lib/tracking.ts');
  const { abgeleitetSchreiben } = await import('./lib/abgeleitet.ts');
  const { leseTracking, schreibeTracking } = await import('./lib/privat.ts');
  type Eintrag = import('../core/statistik.ts').TrackingEintrag;
  const jetzt = new Date(process.env.JETZT ?? Date.now());
  const heute = berlin(jetzt).datum;
  const istKandidat = (t: Eintrag) => (t.art ?? 'kandidat') === 'kandidat';

  // Schattenbuch aus dem privaten Zustand (Kopie); vor dem Umzug noch aus der alten öffentlichen Datei
  const vorher = leseTracking();
  const heuteVorher = vorher.filter((t) => t.datum === heute && istKandidat(t));
  console.log(`\n== Schattenbuch ==\nLive-Stand heute (${heute}): ${heuteVorher.filter((t) => t.start).length} von ${heuteVorher.length} Tageskandidaten mit Startkurs.`);
  // Frischer Hauptlauf: die heutigen Tageskandidaten in der Kopie entfernen und neu aufnehmen
  if (!schreibeTracking(vorher.filter((t) => !(t.datum === heute && istKandidat(t))))) console.log('Privater Zustand nicht erreichbar – das Schattenbuch setzt aus (so gewollt), nichts wird öffentlich geschrieben.');
  const protokoll = {};
  const erg = await trackingAktualisieren(jetzt, protokoll, { modus: 'haupt' });
  console.log(`Neuer Ablauf: ${trackingText(erg)}`);
  console.log(`ABNAHME Startkurs-Quote: ${erg.heuteMitStart} von ${erg.heuteKandidaten} = ${prozent(erg.heuteMitStart, erg.heuteKandidaten)} (Ziel: mindestens 95 %)`);
  console.log(`Kursquellen: ${JSON.stringify(protokoll)}`);
  const nachher = leseTracking();
  console.log(`1-Stunden-Messungen: ${vorher.filter((t) => typeof t.r1h === 'number').length} vorher, ${nachher.filter((t) => typeof t.r1h === 'number').length} gültig, ${nachher.filter((t) => typeof t.r1hGeschlossen === 'number').length} herausgenommen (Startkurs bei geschlossenem Markt).`);

  const alt = lese<{ zusammenfassung?: string }>('statistik.json', {});
  const { statistik } = abgeleitetSchreiben(jetzt);
  const zeile = (text: string | undefined, wort: string) => (text ?? '').split('\n').find((z) => z.includes(wort)) ?? '(keine Zeile)';
  console.log(`\n== Ehrliche Fallzahlen ==\nALT:  ${zeile(alt.zusammenfassung, 'Mitverfolgte Kandidaten').slice(0, 700)}`);
  console.log(`NEU:  ${zeile(statistik.zusammenfassung, 'Mitverfolgte Kandidaten').slice(0, 900)}`);
  console.log(`NEU:  ${zeile(statistik.zusammenfassung, 'Noch zu wenige').slice(0, 600)}`);
  const hs = statistik.kandidaten.nachSignalTyp.handelsstopp;
  console.log(`ABNAHME handelsstopp: ${hs ? `Ø 1 Woche ${hs.oe1W} %, Median ${hs.med1W} %, n=${hs.n1W} Messungen (${hs.anzahl} Werte, ${hs.eintraege} Einträge im Buch)` : 'nicht im Buch'}`);
  const g = statistik.kandidaten.gesamt;
  console.log(`Gesamt: ${g.eintraege} Einträge, ${g.anzahl} Werte (Episoden), Messungen 1 T ${g.n1T}, 1 W ${g.n1W}; Ø 1 W ${g.oe1W} %, Median ${g.med1W} %.`);
  console.log(`\n== Autopilot ==\nBewiesen: ${(statistik.autopilot ?? []).filter((x) => x.bewiesen).map((x) => `${x.typ}/${x.gruppe}`).join(', ') || 'kein Signaltyp'}`);
  for (const x of (statistik.autopilot ?? []).slice(0, 5)) console.log(`  ${x.typ}/${x.gruppe}: ${x.faelle} Fälle, ${x.chance} % im Plus, Ø ${x.oeNetto} % → ${x.bewiesen ? 'bewiesen' : 'nicht bewiesen'}`);

  // Daytrading: sichtbare Bilanz ohne die virtuellen Gruppen (aus dem Protokoll der Kopie, ohne Netz)
  const { tradesAusEreignissen } = await import('../core/daytrading/kern.ts');
  const { uebersichtBerechnen } = await import('../core/daytrading/auswertung.ts');
  type DtEreignis = import('../core/daytrading/kern.ts').DtEreignis;
  type Regel = import('../core/daytrading/kern.ts').VirtuellRegel;
  const regel = (JSON.parse(readFileSync(join(process.cwd(), 'config', 'daytrading.json'), 'utf8')) as { virtuell?: Regel }).virtuell;
  const pfad = join(kopie, 'daytrading/ereignisse.jsonl');
  const trades = tradesAusEreignissen(existsSync(pfad) ? readFileSync(pfad, 'utf8').split('\n').filter((z) => z.trim()).map((z) => JSON.parse(z) as DtEreignis) : []);
  const u = uebersichtBerechnen(trades, heute, jetzt.toISOString(), {}, regel);
  const rueck = uebersichtBerechnen(trades, heute, jetzt.toISOString(), {}, regel ? { ...regel, rueckwirkend: true } : undefined);
  // Selbstverbesserung: Buch, Kennzahlen und Übersicht auf der Kopie (ohne Issue-Abfrage)
  const { verbesserungTaeglich } = await import('./lib/verbesserung.ts');
  const vb = await verbesserungTaeglich(jetzt, { ohneNetz: true });
  const buch = lese<{ kandidaten?: { rang: number; id: string; titel: string }[] }>('lernen/verbesserung/kandidaten.json', {}).kandidaten ?? [];
  console.log(`\n== Verbesserungsbuch ==\n${vb?.kandidaten ?? 0} Kandidaten, ${vb?.bewertet ?? 0} Bewertung(en).`);
  for (const k of buch.slice(0, 12)) console.log(`  [${k.rang}] ${k.id}: ${k.titel.slice(0, 110)}`);

  console.log(`\n== Daytrading ==\nSichtbare Bilanz (Kennzeichen am Ereignis, alte Trades bleiben): ${u.gesamt.anzahl} Trades, ${u.gesamt.netto} €; virtuell bisher ${u.virtuell?.gesamt.anzahl ?? 0} Trades.`);
  console.log(`Zum Vergleich – dieselbe Regel rückwirkend auf alle bisherigen Trades: sichtbar ${rueck.gesamt.anzahl} Trades, ${rueck.gesamt.netto} €; virtuell ${rueck.virtuell?.gesamt.anzahl ?? 0} Trades, ${rueck.virtuell?.gesamt.netto ?? 0} € (Turbo ${rueck.virtuell?.gruppen.turbo.netto} €, Short ${rueck.virtuell?.gruppen.short.netto} €, Krypto ${rueck.virtuell?.gruppen.krypto.netto} €).`);
}

// Umzug in den privaten Zustand: wo liegt was? Öffentlich darf nach dem zweiten Lauf nichts davon mehr stehen.
const PRIVATE_DATEIEN = ['kandidaten-tracking.json', 'kurse.json', 'schlusskurse.json', 'daytrading/zustand.json'];
function umzugBericht(titel: string) {
  console.log(`\n== Privater Zustand: ${titel} ==`);
  for (const d of PRIVATE_DATEIEN) console.log(`  ${d}: privat ${existsSync(join(privatDir, d)) ? 'ja' : 'nein'} · öffentlich ${existsSync(join(kopie, d)) ? 'NOCH DA' : 'weg'}`);
  const pos = lese<{ offen?: Record<string, unknown>[]; vorgemerkt?: Record<string, unknown>[] }>('positionen.json', {});
  const alle = [...(pos.offen ?? []), ...(pos.vorgemerkt ?? [])];
  console.log(`  positionen.json: ${alle.length} Positionen, ${alle.filter((o) => 'letzterKurs' in o).length} mit Kurs (letzterKurs), ${alle.filter((o) => 'stand' in o).length} mit Stand in Prozent`);
  const ordner = join(kopie, 'verlauf');
  const dateien = existsSync(ordner) ? readdirSync(ordner).filter((d) => d.endsWith('.json')) : [];
  const alt = dateien.filter((d) => Array.isArray(JSON.parse(readFileSync(join(ordner, d), 'utf8')))).length;
  console.log(`  verlauf/: ${dateien.length} Dateien, ${alt} noch als Kursreihe in Euro`);
}

if (art === 'jobs' || art === 'alles' || art === 'umzug') {
  const lauf = (name: string, args: string[]) => {
    console.log(`\n== ${name} ==`);
    try {
      console.log(execFileSync('node', args, { env: process.env, encoding: 'utf8' }).trim().split('\n').slice(-25).join('\n'));
    } catch (e) {
      console.log(`FEHLER in ${name}: ${(e as Error).message.split('\n').slice(0, 12).join('\n')}`);
      process.exitCode = 1;
    }
  };
  umzugBericht('vorher');
  for (const runde of art === 'umzug' ? [1, 2] : [1]) {
    if (art === 'umzug') console.log(`\n######## Runde ${runde} ########`);
    lauf('Sammler (stündlich)', ['jobs/sammler.ts', 'stuendlich']);
    lauf('Kurswächter', ['jobs/waechter.ts']);
    lauf('Daytrading', ['jobs/daytrading.ts']);
    umzugBericht(`nach Runde ${runde}`);
  }
  const u = lese<{ gesamt?: { anzahl: number; netto: number }; virtuell?: { gesamt: { anzahl: number; netto: number } } }>('daytrading/uebersicht.json', {});
  console.log(`\nDaytrading-Übersicht der Kopie: sichtbar ${u.gesamt?.anzahl ?? 0} Trades/${u.gesamt?.netto ?? 0} €, virtuell ${u.virtuell?.gesamt.anzahl ?? 0} Trades/${u.virtuell?.gesamt.netto ?? 0} €.`);
}
console.log('\nProbelauf beendet – nichts wurde in die Live-Daten geschrieben.');
