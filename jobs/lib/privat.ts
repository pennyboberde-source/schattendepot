// Privater Zustand (Plan Volltreffer V1, Entscheidung des Nutzers vom 14.11.2026: Lösung B).
// Arbeitsdaten, die Kurse enthalten – Schattenbuch mit Startkursen und Einzelmessungen, Tagesstände der Positionen,
// Arbeitsstand des Daytradings –, liegen nicht mehr im öffentlichen Datenzweig, sondern im Zweig `zustand` des
// privaten Repos (Checkout unter PRIVAT_DIR, Standard _privat). Öffentlich bleiben die Ausführungskurse der eigenen
// Orders und verdichtete Statistik.
//
// Fehlt der private Checkout (Token abgelaufen, Probelauf ohne Zugang, lokale Entwicklung), läuft jeder Job weiter:
// Lesen fällt auf die alte öffentliche Datei zurück, solange es sie noch gibt; geschrieben wird dann NICHTS –
// niemals landen diese Daten wieder im öffentlichen Zweig, und niemals überschreibt ein Lauf ohne Zugang den
// privaten Stand mit leeren Daten.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { TrackingEintrag } from '../../core/statistik.ts';
import { DATEN_DIR } from './dateien.ts';

export const PRIVAT_DIR = process.env.PRIVAT_DIR ?? '_privat';
const MARKE = 'LIES-MICH.md';

/** Ist der private Zustand ausgecheckt? */
export const privatDa = (): boolean => existsSync(join(PRIVAT_DIR, MARKE));

// Welche Dateien lagen schon beim Start privat vor (also aus einem früheren, gesicherten Lauf)?
const beimStart = new Set<string>();
(function merke(ordner: string, vor = '') {
  if (!privatDa() || !existsSync(ordner)) return;
  for (const e of readdirSync(ordner, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    if (e.isDirectory()) merke(join(ordner, e.name), `${vor}${e.name}/`);
    else beimStart.add(`${vor}${e.name}`);
  }
})(PRIVAT_DIR);

const lies = <T>(pfad: string): T | undefined => {
  if (!existsSync(pfad)) return undefined;
  const roh = readFileSync(pfad, 'utf8').replace(/^﻿/, '');
  return roh.trim() ? (JSON.parse(roh) as T) : undefined;
};

/**
 * Datei lesen, die früher öffentlich war: zuerst privat, sonst die alte öffentliche Kopie (Umzug, Probelauf),
 * sonst der Standardwert. `quelle` sagt, woher die Daten kommen.
 */
export function lesePrivat<T>(datei: string, standard: T): { daten: T; quelle: 'privat' | 'oeffentlich' | 'leer' } {
  if (privatDa()) {
    const p = lies<T>(join(PRIVAT_DIR, datei));
    if (p !== undefined) return { daten: p, quelle: 'privat' };
  }
  const o = lies<T>(join(DATEN_DIR, datei));
  return o !== undefined ? { daten: o, quelle: 'oeffentlich' } : { daten: standard, quelle: 'leer' };
}

/**
 * Privat schreiben. Ohne privaten Checkout wird nichts geschrieben (false). Lag die Datei schon beim Start privat vor,
 * ist der Umzug gesichert – dann wird die alte öffentliche Kopie entfernt.
 */
export function schreibePrivat(datei: string, inhalt: unknown): boolean {
  if (!privatDa()) return false;
  const pfad = join(PRIVAT_DIR, datei);
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, JSON.stringify(inhalt, null, 1) + '\n');
  const alt = join(DATEN_DIR, datei);
  if (beimStart.has(datei) && existsSync(alt)) unlinkSync(alt);
  return true;
}

// ---------- Schattenbuch ----------
const TRACKING = 'kandidaten-tracking.json';

/** Ist das Schattenbuch erreichbar (privat oder – vor dem Umzug – noch öffentlich)? */
export const trackingErreichbar = (): boolean => privatDa() || existsSync(join(DATEN_DIR, TRACKING));

export function leseTracking(): TrackingEintrag[] {
  return lesePrivat<TrackingEintrag[]>(TRACKING, []).daten;
}

/** Schattenbuch schreiben – nur privat. Gibt false zurück, wenn der private Zustand fehlt (dann bleibt alles, wie es war). */
export function schreibeTracking(liste: TrackingEintrag[]): boolean {
  return schreibePrivat(TRACKING, liste);
}
