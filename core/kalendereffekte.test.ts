import { describe, expect, it } from 'vitest';
import { kalenderEffekte } from './kalendereffekte.ts';

describe('Kalender-Effekte', () => {
  it('großer Verfallstag im Dezember, Quartalsende, Feiertags-Vortag', () => {
    expect(kalenderEffekte('2026-12-18')[0]).toMatch(/Großer Verfallstag/);
    expect(kalenderEffekte('2026-12-30').join(' ')).toMatch(/Quartals/);
    expect(kalenderEffekte('2026-12-23').join(' ')).toMatch(/Morgen Börsenfeiertag/);
    expect(kalenderEffekte('2026-11-02').join(' ')).toMatch(/Erster Handelstag/);
    expect(kalenderEffekte('2026-10-21')).toEqual([]);
  });
});
