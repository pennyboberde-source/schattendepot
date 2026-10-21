// Wirtschaftskalender (ForexFactory-Export, frei abrufbar; robots.txt erlaubt): wichtige Termine des Tages für das Briefing.
import { berlin } from '../../core/kalender.ts';
import { holeJson } from '../lib/netz.ts';
import type { Quelle } from './typen.ts';

interface Termin {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

const LAENDER: Record<string, string> = { USD: 'USA', EUR: 'Eurozone', GBP: 'UK', CNY: 'China', JPY: 'Japan', CHF: 'Schweiz' };

export function kalenderTermine(liste: Termin[], jetzt: Date): { zeit: string; text: string }[] {
  const heute = berlin(jetzt).datum;
  return liste
    .filter((t) => (t.impact === 'High' || (t.impact === 'Medium' && (t.country === 'USD' || t.country === 'EUR'))) && LAENDER[t.country])
    .map((t) => ({ t, b: berlin(new Date(t.date)) }))
    .filter(({ b }) => b.datum === heute)
    .sort((x, y) => x.b.minuten - y.b.minuten)
    .map(({ t, b }) => ({
      zeit: `${String(b.stunde).padStart(2, '0')}:${String(b.minute).padStart(2, '0')}`,
      text: `${LAENDER[t.country]}: ${t.title}${t.impact === 'High' ? ' (wichtig)' : ''}${t.forecast ? ` – Prognose ${t.forecast}` : ''}${t.previous ? `, zuvor ${t.previous}` : ''}`,
    }));
}

export const wirtschaftskalender: Quelle = {
  id: 'wirtschaftskalender',
  name: 'Wirtschaftskalender (ForexFactory)',
  laeufe: ['haupt'],
  maxProLauf: 1,
  async abrufen(ctx) {
    const liste = await holeJson<Termin[]>('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
    return { signale: [], termine: kalenderTermine(liste, ctx.jetzt), abfragen: 1 };
  },
};
