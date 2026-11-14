// Selbstverbesserung (Plan Volltreffer, Meilenstein VS): gemeinsame Typen für Leitplanken, Manifest und Protokoll.

export type Regel = 'frei' | { min: number; max: number };

export interface Leitplanken {
  aktiv: boolean;
  wochenbudget: { maxAenderungen: number; maxZeilen: number; zeilenOhne?: string[] };
  branchPrefix: string;
  erlaubtePfade: string[];
  verbotenePfade: string[];
  nieLoeschen: string[];
  /** Datei, in der neue Quellen angemeldet werden – Einträge dürfen nur dazukommen */
  quellenRegister: string;
  keineNeuenMitteilungen: string[];
  /** je Config-Datei: JSON-Pfad → Spanne oder "frei" (der Schlüssel "hinweis" ist nur Erklärung) */
  stellschrauben: Record<string, Record<string, Regel> | string>;
  bewertung: { fruehestensNachTagen: number; spaetestensNachTagen: number; fensterTage: number; schwelleProzent: number };
  wache: { stunden: number; ausfaelleInFolge: number; workflows: string[] };
  buch: { maxKandidaten: number; sperreNachUmsetzungTage: number; quelleOhneSignaleTage: number; quelleAusgefallenStunden: number };
  quellenIdeen?: { name: string; notiz: string }[];
}

export const BEREICHE = ['depot', 'daytrading', 'volltreffer', 'datenkrake', 'quellen', 'oberflaeche', 'routinen', 'system'] as const;
export type Bereich = (typeof BEREICHE)[number];

/** Messkriterium einer Änderung: eine Kennzahl aus core/verbesserung/kennzahlen.ts, die steigen oder fallen soll. */
export interface Messkriterium {
  kennzahl: string;
  richtung: 'steigt' | 'faellt';
  /** Wert zum Zeitpunkt der Änderung (aus dem Kontext) */
  ausgangswert?: number | null;
  zielwert?: number;
  /** ein Satz in einfachen Worten, z. B. „Startkurs-Quote steigt von 3 % auf über 90 %“ */
  text: string;
}

export interface Aenderung {
  id: string;
  titel: string;
  bereich: Bereich;
  /** ID des Kandidaten aus dem Verbesserungsbuch, falls die Änderung daraus stammt */
  kandidat?: string;
  hypothese: string;
  messkriterium: Messkriterium;
  /** geänderte Dateien dieser Änderung */
  dateien: string[];
}

/** Datei verbesserung/aenderungen/<datum>.json auf dem Branch claude/verbesserung-<datum> */
export interface Manifest {
  datum: string;
  zusammenfassung: string;
  aenderungen: Aenderung[];
  /** nötige Freigaben des Nutzers (z. B. Gratis-Schlüssel für eine neue Quelle) – die Quelle läuft ohne Secret einfach nicht */
  freigaben?: { titel: string; anleitung: string; secret?: string }[];
  nichtUmgesetzt?: { kandidat: string; grund: string }[];
}

export interface DateiAenderung {
  pfad: string;
  /** A = neu, M = geändert, D = gelöscht, R = umbenannt */
  status: 'A' | 'M' | 'D' | 'R';
  plus: number;
  minus: number;
  /** bei Umbenennung: alter Pfad */
  alt?: string;
}

/** Ein Kandidat im Verbesserungsbuch (lernen/verbesserung/kandidaten.json) */
export interface Kandidat {
  id: string;
  bereich: Bereich;
  titel: string;
  /** Beleg mit Zahlen */
  beleg: string;
  /** erwarteter Nutzen, höher = wichtiger */
  rang: number;
  herkunft: 'ruecknahme' | 'fehler' | 'monatspruefung' | 'wochenzeugnis' | 'lernhinweis' | 'quelle' | 'gewichtsvorschlag' | 'quellenidee';
  seit: string;
}

/** Zeilen in lernen/verbesserung/protokoll.jsonl (nur anhängen) */
export type ProtokollEintrag =
  | { typ: 'uebernommen'; zeit: string; datum: string; branch: string; sha: string; merge: string; zeilen: number; tests: { unit: number; e2e: number }; zusammenfassung: string; aenderungen: Aenderung[]; freigaben?: Manifest['freigaben'] }
  | { typ: 'abgelehnt'; zeit: string; branch: string; sha: string; gruende: string[]; link?: string }
  | { typ: 'zurueckgenommen'; zeit: string; merge: string; revert: string; grund: string; ausloeser: 'nutzer' | 'wache' | 'bewertung' }
  | { typ: 'bewertet'; zeit: string; merge: string; aenderung: string; kennzahl: string; urteil: 'besser' | 'gleich' | 'schlechter' | 'nicht messbar'; vorher: number | null; nachher: number | null; text: string };
