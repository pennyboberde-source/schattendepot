// Schattenbuch der Datenkrake: Kandidaten und schnelle Ereignis-Signale werden virtuell „gekauft“ und nachverfolgt –
// Kurs nach ~1 Stunde (Reaktionszeit), 1, 3, 5, 10 und 21 Handelstagen. So lernt das System, welche Signale und
// Quellen taugen, ohne dafür Orders zu brauchen. Die Ablauflogik steht getestet in core/schattenbuch.ts
// (Plan Volltreffer V0: Startkurse zuerst und mit eigenem Kontingent); hier nur Dateien, Kursabruf und Tempo.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KompaktSignal } from '../../core/datenkrake.ts';
import { berlin } from '../../core/kalender.ts';
import { kursbasisAusTicker } from '../../core/autopilot.ts';
import { r1hBereinigen, SCHNELLE_TYPEN, schattenbuchSchritt, type SchrittErgebnis, type TagesKandidat } from '../../core/schattenbuch.ts';
import { plausibilitaetPruefen } from '../../core/statistik.ts';
import type { Kursbasis } from '../../core/typen.ts';
import { holeKurs, type Abrufprotokoll } from '../kurse/anbieter.ts';
import { ladeConfig, leseJson } from './dateien.ts';
import { leseTracking, privatDa, schreibeTracking } from './privat.ts';

// Kursbasis aus dem Kürzel: liegt in core/autopilot.ts (auch der Autopilot braucht sie)
export { kursbasisAusTicker, SCHNELLE_TYPEN };

export interface TrackingOptionen {
  /** haupt: Tageskandidaten aufnehmen; stuendlich: nachholen, messen, schnelle Signale aufnehmen */
  modus?: 'haupt' | 'stuendlich';
  /** frische Signale dieses Laufs (für schnelle Aufnahme tagsüber) */
  schnelle?: KompaktSignal[];
}

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function trackingAktualisieren(jetzt: Date, protokoll: Abrufprotokoll, opt: TrackingOptionen = {}): Promise<SchrittErgebnis> {
  // Das Schattenbuch liegt im privaten Zustand. Ist er nicht ausgecheckt, setzt der Lauf aus – ohne etwas zu verändern
  // und ohne Kursabrufe (sie ließen sich nicht sichern). Gelesen wird beim ersten Lauf noch die alte öffentliche Datei.
  if (!privatDa()) return { startAbrufe: 0, messAbrufe: 0, aufgenommen: 0, ohneKurs: [], ausfall: false, nachgeholt: 0, gemessen: 0, heuteKandidaten: 0, heuteMitStart: 0, ausgesetzt: true };
  const { einstellungen } = ladeConfig();
  const tr = einstellungen.tracking;
  const heute = berlin(jetzt).datum;
  const liste = leseTracking();
  const nyseFeiertage = (JSON.parse(readFileSync(join(process.cwd(), 'config', 'daytrading.json'), 'utf8')) as { nyseFeiertage?: string[] }).nyseFeiertage ?? [];
  const kandidaten = leseJson<{ kandidaten?: TagesKandidat[] }>(`signale/${heute}.json`, {}).kandidaten ?? [];

  // Tempo: Finnhub erlaubt 60 Abrufe je Minute – ab einer Schwelle je Lauf zwischen den Abrufen kurz warten
  let netz = 0;
  const holen = async (kb: Kursbasis): Promise<number | null> => {
    if (netz >= (tr.abrufPauseAb ?? 45)) await pause(tr.abrufPauseMs ?? 1200);
    netz++;
    return (await holeKurs(kb, jetzt, protokoll))?.wert ?? null;
  };

  const erg = await schattenbuchSchritt(liste, jetzt, { ...tr, nyseFeiertage }, { modus: opt.modus ?? 'haupt', kandidaten, schnelle: opt.schnelle }, holen);

  // 1-Stunden-Messungen mit Startkurs bei geschlossenem Markt zählen nicht mehr (Wert bleibt als r1hGeschlossen erhalten)
  for (const t of liste) r1hBereinigen(t, nyseFeiertage);
  // Unplausible Messungen verwerfen (Aktienzusammenlegung/Kursfehler, Fix 06.11.2026)
  for (const t of liste) plausibilitaetPruefen(t);

  // Aufräumen: ein Jahr behalten
  const grenze = new Date(jetzt.getTime() - 366 * 86400000).toISOString().slice(0, 10);
  const gesichert = schreibeTracking(liste.filter((t) => t.datum >= grenze));
  return gesichert ? erg : { ...erg, ausgesetzt: true };
}

/** Eine Zeile fürs Actions-Log. */
export function trackingText(e: SchrittErgebnis): string {
  if (e.ausgesetzt && !e.startAbrufe && !e.messAbrufe) return 'ausgesetzt – privater Zustand nicht erreichbar';
  return [
    `${e.startAbrufe} Startkurs-Abrufe, ${e.messAbrufe} Mess-Abrufe`,
    e.aufgenommen ? `${e.aufgenommen} Kandidaten neu` : '',
    e.nachgeholt ? `${e.nachgeholt} Startkurse nachgeholt` : '',
    `${e.gemessen} Messwerte`,
    e.heuteKandidaten ? `heute ${e.heuteMitStart} von ${e.heuteKandidaten} Kandidaten mit Startkurs` : '',
    e.ohneKurs.length ? `ohne Kurs ersetzt: ${e.ohneKurs.join(', ')}` : '',
    e.ausfall ? 'Kursquelle gestört – Startkurse werden in den Stundenläufen nachgeholt' : '',
    e.ausgesetzt ? 'NICHT GESICHERT – privater Zustand nicht erreichbar' : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
