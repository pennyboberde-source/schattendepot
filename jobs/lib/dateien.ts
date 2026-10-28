// Lesen/Schreiben im Checkout des daten-Branches (Standard: _daten) und Laden der Konfiguration.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GebuehrenConfig } from '../../core/gebuehren.ts';
import type { SpreadConfig } from '../../core/spreads.ts';
import type { SteuerConfig } from '../../core/steuern.ts';
import type { Ereignis, Kursbasis } from '../../core/typen.ts';

export const DATEN_DIR = process.env.DATEN_DIR ?? '_daten';
const ROOT = process.cwd();

export function leseJson<T>(datei: string, standard: T): T {
  const pfad = join(DATEN_DIR, datei);
  if (!existsSync(pfad)) return standard;
  const roh = readFileSync(pfad, 'utf8').replace(/^﻿/, '');
  return roh.trim() ? (JSON.parse(roh) as T) : standard;
}

export function schreibeJson(datei: string, inhalt: unknown) {
  schreibeText(datei, JSON.stringify(inhalt, null, 2) + '\n');
}

export function schreibeText(datei: string, inhalt: string) {
  const pfad = join(DATEN_DIR, datei);
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, inhalt);
}

export function leseText(datei: string, standard = ''): string {
  const pfad = join(DATEN_DIR, datei);
  return existsSync(pfad) ? readFileSync(pfad, 'utf8') : standard;
}

export function leseEreignisse(): Ereignis[] {
  return leseText('ereignisse.jsonl')
    .split('\n')
    .filter((z) => z.trim())
    .map((z) => JSON.parse(z) as Ereignis);
}

/** Hängt Ereignisse an (nie umschreiben). Bereits vorhandene IDs werden übersprungen. */
export function haengeEreignisseAn(neu: Ereignis[]): Ereignis[] {
  const vorhanden = new Set(leseEreignisse().map((e) => e.id));
  const wirklichNeu = neu.filter((e) => !vorhanden.has(e.id));
  if (wirklichNeu.length) appendFileSync(join(DATEN_DIR, 'ereignisse.jsonl'), wirklichNeu.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return wirklichNeu;
}

function config<T>(datei: string): T {
  return JSON.parse(readFileSync(join(ROOT, 'config', datei), 'utf8')) as T;
}

export interface Einstellungen {
  orderBetrag: number;
  /** Berichte vor diesem Zeitpunkt dürfen einmal neu geschrieben werden */
  berichteNeuVor?: string;
  /** Gebührenmodell des Depots (Datei in config/), Standard gebuehren-smartbroker.json */
  gebuehrenDatei?: string;
  hebelMax: number;
  haltedauerMinMinuten: number;
  haltedauerMaxTage: number;
  ereignisSchwelleProzent: number;
  ereignisLaeufeProTag: number;
  ausfallWarnungUhrzeit: string;
  ausfallWarnungAktiv?: boolean;
  ruhezeit: { von: string; bis: string };
  pushTypen: Record<string, boolean>;
  vergleichsEtf: { name: string; isin: string; kursbasis: Kursbasis; ersatz: Kursbasis };
  tracking: { kandidatenProTag: number; maxAbrufeProLauf: number };
  /** Mindest-Chance in % für jeden Kauf (Plan Datenkrake) */
  mindestChance?: number;
  risikoBudget: { maxSpekulativJeLauf: number; maxAnteilSpekulativ: number; stopMinProzent: number; mindestKursEuro: number };
  /** Höchstzahl neuer Orders je Claude-Lauf (S2) */
  claudeOrders?: Partial<Record<'morgenlauf' | 'mittagslauf' | 'abendlauf' | 'ereignislauf' | 'wochenrueckblick', number>>;
  /** Varianten-Schattenbuch: Mindestfälle und Turbo-Finanzierung */
  varianten?: { mindestFaelle: number; finanzierungProzentJahr: number; koPuffer?: number; volltrefferProzent?: number; kellyAnteil?: number; hebelMax?: number };
  verkaufsregeln?: import('../../core/waechter.ts').Verkaufsregeln;
  autopilot?: import('../../core/autopilot.ts').AutopilotEinstellungen;
  zielStop?: import('../../core/zielstop.ts').ZielStopEinstellungen;
}

export function ladeConfig() {
  const einstellungen = config<Einstellungen>('einstellungen.json');
  return {
    /** Gebührenmodell des Depots: Smartbroker+ */
    gebuehren: config<GebuehrenConfig>(einstellungen.gebuehrenDatei ?? 'gebuehren-smartbroker.json'),
    gebuehrenSmartbroker: config<GebuehrenConfig>('gebuehren-smartbroker.json'),
    steuern: config<SteuerConfig>('steuern.json'),
    spreads: config<SpreadConfig>('spreads.json'),
    einstellungen,
    push: config<{ vapidPublicKey: string; vapidSubject: string }>('push.json'),
  };
}

export const APP_URL = process.env.APP_URL ?? 'https://pennyboberde-source.github.io/schattendepot/';
