// Lesen/Schreiben im Checkout des daten-Branches (Standard: _daten) und Laden der Konfiguration.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GebuehrenConfig } from '../../core/gebuehren.ts';
import type { SpreadConfig } from '../../core/spreads.ts';
import type { SteuerConfig } from '../../core/steuern.ts';
import type { Ereignis } from '../../core/typen.ts';

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
  hebelMax: number;
  haltedauerMinMinuten: number;
  haltedauerMaxTage: number;
  ereignisSchwelleProzent: number;
  ereignisLaeufeProTag: number;
  ausfallWarnungUhrzeit: string;
  ausfallWarnungAktiv?: boolean;
  ruhezeit: { von: string; bis: string };
  pushTypen: Record<string, boolean>;
  vergleichsEtf: { name: string; isin: string };
}

export function ladeConfig() {
  return {
    gebuehren: config<GebuehrenConfig>('gebuehren.json'),
    steuern: config<SteuerConfig>('steuern.json'),
    spreads: config<SpreadConfig>('spreads.json'),
    einstellungen: config<Einstellungen>('einstellungen.json'),
    push: config<{ vapidPublicKey: string; vapidSubject: string }>('push.json'),
  };
}

export const APP_URL = process.env.APP_URL ?? 'https://pennyboberde-source.github.io/schattendepot/';
