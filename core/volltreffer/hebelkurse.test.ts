import { describe, expect, it } from 'vitest';
import { GettexProdukte } from './firds.ts';
import { hebelZeilen, produktAuswahl, richtungenAus } from './hebelkurse.ts';

describe('B Stufe 2a: Kurse passender Hebelprodukte', () => {
  it('Produkte je Basiswert nur von gettex, je Richtung', () => {
    const g = new GettexProdukte('MUND');
    g.add({ isin: 'DE000A', basis: 'US1', richtung: 'long', mic: 'MUND' });
    g.add({ isin: 'DE000B', basis: 'US1', richtung: 'short', mic: 'MUND' });
    g.add({ isin: 'DE000C', basis: 'US1', richtung: 'short', mic: 'XSTU' });
    g.add({ isin: 'DE000A', basis: 'US1', richtung: 'long', mic: 'MUND' });
    expect(g.ergebnis()).toEqual({ US1: [['DE000A', 'C'], ['DE000B', 'P']] });
  });

  it('Auswahl gleichmäßig verteilt und begrenzt, nur gewünschte Richtung', () => {
    const l = Array.from({ length: 10 }, (_, i) => [`DE00000000${String(i).padStart(2, '0')}`, i % 2 ? 'P' : 'C'] as [string, 'C' | 'P']);
    const a = produktAuswahl({ US1: l }, new Map([['US1', new Set(['P'] as const)]]), 2);
    expect([...a.keys()]).toEqual(['DE0000000001', 'DE0000000005']);
    expect(a.get('DE0000000001')).toEqual({ b: 'US1', t: 'P' });
    expect(produktAuswahl({}, new Map([['US9', new Set(['C'] as const)]]), 5).size).toBe(0);
  });

  it('Richtung aus der Spielart', () => {
    expect(richtungenAus('Turbo short Hebel 2, Stop 150 €')).toEqual(['P']);
    expect(richtungenAus('Turbo long Hebel 3')).toEqual(['C']);
    expect(richtungenAus('direkt, Stop 250 €')).toEqual(['C', 'P']);
  });

  it('Zeilen: Geschäfte immer, Kursstellungen nur wenn gewünscht', () => {
    const csv = 'DE0000000001,09:15:01.123456,EUR,1.23,0\nDE0000000001,09:16:02.000000,EUR,1.25,500\nDE0000000009,09:15:01.1,EUR,2,0\nDE0000000001,09:17:00.0,USD,1.2,10\n';
    const a = new Map([['DE0000000001', 1]]);
    const z: string[] = [];
    expect(hebelZeilen(z, csv, a, false)).toBe(1);
    expect(z).toEqual(['DE0000000001,09:16:02,1.25,500']);
    const z2: string[] = [];
    expect(hebelZeilen(z2, csv, a, true)).toBe(2);
    expect(z2[0]).toBe('DE0000000001,09:15:01,1.23,0');
  });
});
