import { describe, expect, it } from 'vitest';
import { namePasst, produktLesen, pruefenFaellig, suchname, turboDa, turboStand } from './turbos.ts';

describe('Turbos je Basiswert (OpenFIGI-Namen)', () => {
  it('Suchname aus dem Firmennamen', () => {
    expect(suchname('SOUNDHOUND AI INC-A')).toBe('SOUNDHOUND AI');
    expect(suchname('PLUG POWER INC')).toBe('PLUG POWER');
    expect(suchname('Alphabet Inc. Class A')).toBe('ALPHABET');
    expect(suchname('ASML HOLDING NV-NY REG SHS')).toBe('ASML NY REG SHS');
  });

  it('Produktname zerlegen (Formate wie bei Bloomberg)', () => {
    expect(produktLesen('VONTOBE-PW27 SOUNDHOUND AI')).toEqual({ emittent: 'VONTOBE', richtung: 'short', jahr: 2027, basiswert: 'SOUNDHOUND AI' });
    expect(produktLesen('GS     -CW27 PLUG POWER IN')).toEqual({ emittent: 'GS', richtung: 'long', jahr: 2027, basiswert: 'PLUG POWER IN' });
    expect(produktLesen('BAYER H-CW27 NASDAQ 100 ST')?.richtung).toBe('long');
    expect(produktLesen('irgendwas ohne Muster')).toBeNull();
    // unbekannte Art (z. B. Zertifikat) zählt nicht
    expect(produktLesen('XYZ-ZT27 PLUG POWER IN')).toBeNull();
  });

  it('gekürzte Namen passen, fremde nicht', () => {
    expect(namePasst('PLUG POWER IN', 'PLUG POWER INC')).toBe(true);
    expect(namePasst('SOUNDHOUND AI', 'SOUNDHOUND AI INC-A')).toBe(true);
    expect(namePasst('PLUG POWER IN', 'PLUGGED ENERGY CORP')).toBe(false);
    expect(namePasst('AB', 'AB INC')).toBe(false);
  });

  it('Stand: nur gültige Jahrgänge, je Richtung gezählt', () => {
    const namen = ['VONTOBE-PW25 SOUNDHOUND AI', 'VONTOBE-PW27 SOUNDHOUND AI', 'VONTOBE-CW26 SOUNDHOUND AI', 'VONTOBE-CW27 SOUNDHOUND AI', 'GS     -CW27 SOUNDBITE MEDI'];
    const s = turboStand(namen, 'SOUNDHOUND AI INC-A', '2026-11-16');
    expect(s).toMatchObject({ long: 2, short: 1, emittenten: ['VONTOBE'] });
    expect(turboDa(s, 'short')).toBe(true);
    expect(turboDa(turboStand(['VONTOBE-PW25 SOUNDHOUND AI'], 'SOUNDHOUND AI INC-A', '2026-11-16'), 'short')).toBe(false);
    expect(turboDa(undefined, 'long')).toBeNull();
  });

  it('erneut prüfen nach Ablauf der Gültigkeit', () => {
    const s = turboStand([], 'X', '2026-11-01');
    expect(pruefenFaellig(s, '2026-11-14', 14)).toBe(false);
    expect(pruefenFaellig(s, '2026-11-15', 14)).toBe(true);
    expect(pruefenFaellig(undefined, '2026-11-15', 14)).toBe(true);
  });
});
