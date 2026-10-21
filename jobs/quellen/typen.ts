import type { Signal } from '../../core/signale.ts';
import type { UniversumWert } from '../../core/texterkennung.ts';

export interface Meldung {
  titel: string;
  quelle: string;
  link: string;
  zeit?: string;
  wertpapier?: string;
}

export interface QuellenErgebnis {
  signale: Signal[];
  makro?: string[];
  termine?: { zeit: string; text: string }[];
  meldungen?: Meldung[];
  insider?: { wertpapier: string; text: string; link: string }[];
  /** Anzahl HTTP-Abfragen (für Kontingent und Quellenstatus) */
  abfragen: number;
}

export type Laufart = 'haupt' | 'stuendlich' | 'samstag';

export interface QuellenKontext {
  jetzt: Date;
  laufart: Laufart;
  universum: UniversumWert[];
  /** offene Positionen (Name, Ticker) – für gezielte Nachrichten */
  offen: { id: string; name: string; ticker?: string }[];
}

export interface Quelle {
  id: string;
  name: string;
  /** Umgebungsvariable mit Gratis-Schlüssel (fehlt → Quelle wird übersprungen) */
  schluessel?: string;
  laeufe: Laufart[];
  /** Gratis-Tageskontingent (Abfragen) – wird nie überschritten */
  tageslimit?: number;
  /** maximale Abfragen je Lauf */
  maxProLauf: number;
  abrufen(ctx: QuellenKontext): Promise<QuellenErgebnis>;
}

export const leer = (): QuellenErgebnis => ({ signale: [], abfragen: 0 });
