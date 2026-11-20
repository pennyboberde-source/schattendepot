import { describe, expect, it } from 'vitest';
import { eftsLesen, katalysatorKlasse, kuerzelAusName } from './volltext.ts';

describe('SEC-Volltextsuche (Q2)', () => {
  it('Kürzel aus dem Anzeigenamen', () => {
    expect(kuerzelAusName('Ainos, Inc.  (AIMD, AIMDW)  (CIK 0001014763)')).toEqual(['AIMD', 'AIMDW']);
    expect(kuerzelAusName('Private Fund LLC  (CIK 0000000001)')).toEqual([]);
    expect(kuerzelAusName('Berkshire  (BRK-B, BRK-A)  (CIK 0001067983)')).toEqual(['BRK-B', 'BRK-A']);
  });
  it('Antwort lesen', () => {
    const r = eftsLesen({ hits: { total: { value: 2 }, hits: [{ _source: { display_names: ['Highway Holdings Ltd  (HIHO)  (CIK 0000123)'], file_date: '2026-11-16', form: '8-K' } }, { _source: { file_date: 'kaputt' } }] } });
    expect(r).toEqual({ gesamt: 2, treffer: [{ kuerzel: ['HIHO'], datum: '2026-11-16', form: '8-K' }] });
    expect(eftsLesen({ fehler: 'x' })).toBeNull();
  });
  it('Klasse: keiner, eine Richtung, gemischt, unbekannt', () => {
    const arten = ['long', 'short', 'binaer'] as const;
    expect(katalysatorKlasse([99, 99, 99], [...arten], 5)).toBe(0);
    expect(katalysatorKlasse([2, 99, 99], [...arten], 5)).toBe(1);
    expect(katalysatorKlasse([99, 0, 30], [...arten], 5)).toBe(2);
    expect(katalysatorKlasse([99, 99, 4], [...arten], 5)).toBe(3);
    expect(katalysatorKlasse([1, 3, 99], [...arten], 5)).toBe(4);
    expect(katalysatorKlasse([null, null, null], [...arten], 5)).toBeNull();
  });
});
