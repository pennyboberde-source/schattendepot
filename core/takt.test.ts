import { describe, expect, it } from 'vitest';
import { faellig, letzterSlot } from './takt.ts';

const d = (s: string) => new Date(s);

describe('Taktgeber', () => {
  it('letzter fälliger Zeitpunkt für Listen, Bereiche, Schritte und Wochentage', () => {
    expect(letzterSlot(['40 5 * * *'], d('2026-11-18T07:51:30Z'))?.toISOString()).toBe('2026-11-18T05:40:00.000Z');
    expect(letzterSlot(['40 5 * * *'], d('2026-11-18T05:39:00Z'))?.toISOString()).toBe('2026-11-17T05:40:00.000Z');
    expect(letzterSlot(['4,19,34,49 6-21 * * 1-5'], d('2026-11-18T07:51:00Z'))?.toISOString()).toBe('2026-11-18T07:49:00.000Z');
    // Samstag 21.11.: werktags-Cron zeigt auf Freitag 21:49
    expect(letzterSlot(['4,19,34,49 6-21 * * 1-5'], d('2026-11-21T10:00:00Z'))?.toISOString()).toBe('2026-11-20T21:49:00.000Z');
    expect(letzterSlot(['3,13,23,33,43,53 5-23 * * *'], d('2026-11-18T04:00:00Z'))?.toISOString()).toBe('2026-11-17T23:53:00.000Z');
    expect(letzterSlot(['0 */4 * * *'], d('2026-11-18T07:59:00Z'))?.toISOString()).toBe('2026-11-18T04:00:00.000Z');
    expect(letzterSlot(['20 3 * * 0'], d('2026-11-18T07:00:00Z'))?.toISOString()).toBe('2026-11-15T03:20:00.000Z');
  });

  it('anstoßen nur nach Kulanz und ohne Lauf seit dem Zeitpunkt', () => {
    const w = { datei: 'rueckblick.yml', crons: ['40 5 * * *'], kulanz: 20 };
    expect(faellig(w, d('2026-11-18T05:50:00Z'), d('2026-11-17T05:41:00Z')).anstossen).toBe(false);
    expect(faellig(w, d('2026-11-18T06:01:00Z'), d('2026-11-17T05:41:00Z')).anstossen).toBe(true);
    expect(faellig(w, d('2026-11-18T06:01:00Z'), d('2026-11-18T05:52:00Z')).anstossen).toBe(false);
    expect(faellig(w, d('2026-11-18T06:01:00Z'), null).anstossen).toBe(true);
  });
});
