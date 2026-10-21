// Datenmodell des Schattendepots. Die JSON-Schemas in schema/ spiegeln diese Typen
// und werden für alles geprüft, was eine Routine oder ein Job schreibt.
import type { SpreadKlasse } from './spreads.ts';
import type { Steuertopf } from './steuern.ts';

export type Anlageklasse = 'aktie' | 'etf' | 'etc' | 'hebel' | 'krypto_etn';

export type Strategie =
  | 'quartalszahlen_momentum'
  | 'insider_kauf'
  | 'analysten_hochstufung'
  | 'ueberreaktion_rebound'
  | 'sektor_rotation'
  | 'makro_termin'
  | 'chart_ausbruch'
  | 'stimmungswelle'
  | 'uebernahme'
  | 'sonstige';

export type Verkaufsgrund = 'ziel' | 'stop' | 'termin' | 'knockout' | 'claude';

export type Laufquelle = 'morgenlauf' | 'abendlauf' | 'ereignislauf' | 'wochenrueckblick' | 'waechter' | 'sammler' | 'system';

export interface Wertpapier {
  name: string;
  isin: string;
  wkn?: string;
  ticker?: string;
  anlageklasse: Anlageklasse;
  spreadKlasse: SpreadKlasse;
  /** Kürzel aus config/gebuehren.json, Standard "TGT". */
  handelsplatz: string;
  steuertopf: Steuertopf;
  teilfreistellung?: number;
}

/** Hebelprodukt eines echten Emittenten; Kurs ggf. synthetisch aus dem Basiswert. */
export interface Hebel {
  typ: 'knockout' | 'turbo' | 'optionsschein';
  richtung: 'long' | 'short';
  emittent: string;
  basiswert: { name: string; isin?: string; ticker?: string };
  basispreis: number;
  koSchwelle: number;
  bezugsverhaeltnis: number;
}

/** Kurs mit Herkunft – jede Ausführung und jede Anzeige nennt Zeitpunkt und Quelle. */
export interface Kurs {
  wert: number;
  geld?: number;
  brief?: number;
  zeit: string;
  quelle: string;
  verzoegertMin?: number;
  synthetisch?: boolean;
}

/** Was Claude im Morgen-/Ereignislauf vormerkt. Ausgeführt wird erst beim nächsten Kurscheck. */
export interface OrderPlan {
  wertpapier: Wertpapier;
  hebel?: Hebel;
  strategie: Strategie;
  these: string;
  ausloeser: string;
  signalIds: string[];
  quellen: { name: string; link: string }[];
  /** Geschätzte Erfolgschance in % (Wahrscheinlichkeit, nach Gebühren mit Gewinn zu schließen). */
  konfidenz: number;
  pflichtOrder: boolean;
  /** Erwartete Rendite nach Gebühren in % des Kapitaleinsatzes. */
  erwarteteRenditeNetto: number;
  /** Ziel als Netto-Rendite in %, Stop als Kursveränderung in % (negativ). */
  zielNettoProzent: number;
  stopProzent: number;
  verkaufstermin: string;
  risiken: string[];
  einflussLektionen: string;
}

export interface Ausfuehrung {
  zeit: string;
  stueck: number;
  kurs: number;
  kurswert: number;
  entgelt: { provision: number; handelsplatz: number; gesamt: number; stufe: string; freetrade: boolean };
  betrag: number;
  kursquelle: string;
  synthetisch: boolean;
}

export interface Anpassung {
  zeit: string;
  quelle: Laufquelle;
  feld: 'ziel' | 'stop' | 'verkaufstermin';
  alt: string | number;
  neu: string | number;
  begruendung: string;
}

export type OrderStatus = 'vorgemerkt' | 'offen' | 'geschlossen' | 'verworfen';

export interface Order {
  id: string;
  status: OrderStatus;
  vorgemerktUm: string;
  vorgemerktVon: Laufquelle;
  plan: OrderPlan;
  /** Absolute Werte, beim Kauf aus dem Plan berechnet und danach nur per Anpassung geändert. */
  zielkurs?: number;
  stopkurs?: number;
  verkaufstermin: string;
  kauf?: Ausfuehrung;
  verkauf?: Ausfuehrung & { grund: Verkaufsgrund };
  anpassungen: Anpassung[];
  letzterKurs?: Kurs;
  ergebnis?: { kursProzent: number; netto: number; nettoProzent: number; gebuehren: number; steuer: number; nachSteuern: number };
  etfVergleich?: { netto: number; nettoProzent: number };
  bericht?: string;
  verwerfGrund?: string;
}

export type EreignisTyp =
  | 'vorgemerkt'
  | 'gekauft'
  | 'angepasst'
  | 'verkauft'
  | 'verworfen'
  | 'bericht'
  | 'briefing'
  | 'warnung'
  | 'lauf';

/** Eintrag im Ereignisprotokoll (daten/ereignisse.jsonl). Wird nur angehängt, nie geändert. */
export interface Ereignis {
  id: string;
  zeit: string;
  typ: EreignisTyp;
  quelle: Laufquelle;
  orderId?: string;
  daten: Record<string, unknown>;
  begruendung?: string;
}

export const PFLICHTHINWEIS = 'Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.';
