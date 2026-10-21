// Schreibt alle aus dem Ereignisprotokoll abgeleiteten Dateien neu (Positionen, Abgeschlossen, Kennzahlen, Kalender).
import { ableiten } from '../../core/ableiten.ts';
import { termineIcs } from '../../core/ics.ts';
import type { Kurs } from '../../core/typen.ts';
import { APP_URL, ladeConfig, leseEreignisse, leseJson, schreibeJson, schreibeText } from './dateien.ts';

export function abgeleitetSchreiben(jetzt: Date) {
  const cfg = ladeConfig();
  const kurse = leseJson<Record<string, Kurs>>('kurse.json', {});
  const stand = jetzt.toISOString();
  const a = ableiten(leseEreignisse(), kurse, cfg, stand);
  schreibeJson('positionen.json', a.positionen);
  schreibeJson('abgeschlossen.json', a.abgeschlossen);
  schreibeJson('kennzahlen.json', a.kennzahlen);
  schreibeText('termine.ics', termineIcs(a.orders, stand, APP_URL));
  return a;
}
