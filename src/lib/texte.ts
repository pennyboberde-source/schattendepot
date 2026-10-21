import type { Strategie, Verkaufsgrund } from '../../core/typen.ts';

export const STRATEGIE_TEXT: Record<Strategie, string> = {
  quartalszahlen_momentum: 'Quartalszahlen-Momentum',
  insider_kauf: 'Insider-Kauf',
  analysten_hochstufung: 'Analysten-Hochstufung',
  ueberreaktion_rebound: 'Überreaktion/Rebound',
  sektor_rotation: 'Sektor-Rotation',
  makro_termin: 'Makro-Termin',
  chart_ausbruch: 'Chart-Ausbruch',
  stimmungswelle: 'Stimmungswelle',
  uebernahme: 'Übernahme',
  sonstige: 'Sonstige',
};

export const VERKAUFSGRUND_TEXT: Record<Verkaufsgrund, string> = {
  ziel: 'Ziel erreicht',
  stop: 'Stop ausgelöst',
  termin: 'Verkaufstermin',
  knockout: 'Knock-out',
  claude: 'Entscheidung Claude',
};
