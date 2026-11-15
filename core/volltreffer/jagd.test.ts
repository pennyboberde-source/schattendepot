import { describe, expect, it } from 'vitest';
import { jagdenWaehlen, jagdKennzahlen, type JagdFall } from './jagd.ts';

const fall = (wert: string, einstieg: string | null, ende: string | null, art: JagdFall['art'], netto: number | null, wertung = 10): JagdFall => ({ muster: 'm', wertung, wert, markt: 'aktie', stichtag: einstieg ?? '2026-12-31', einstieg, ende, art, netto, tag: 1, fenster: 10, spielart: 'direkt, Stop 150 €' });

describe('Virtuelle Jagden', () => {
  it('höchstens maxOffen gleichzeitig; bei Gleichstand die bessere Wertung zuerst', () => {
    const f = [fall('A', '2026-12-01', '2026-12-05', 'niete', -150, 5), fall('B', '2026-12-01', '2026-12-03', 'treffer', 400, 20), fall('C', '2026-12-01', null, 'offen', 30, 10), fall('D', '2026-12-04', null, 'offen', 10)];
    const { jagden, uebersprungen } = jagdenWaehlen(f, { maxOffen: 2, tagesVerlustGrenze: 450 });
    expect(jagden.map((j) => j.wert)).toEqual(['B', 'C', 'D']);
    expect(uebersprungen).toBe(1);
  });

  it('nach einem Tag mit 450 € Verlust keine neue Jagd am Folgetag', () => {
    const f = [fall('A', '2026-12-01', '2026-12-02', 'niete', -250), fall('B', '2026-12-01', '2026-12-02', 'niete', -250), fall('C', '2026-12-03', null, 'offen', 0), fall('E', '2026-12-03', null, 'offen', 0), fall('D', '2026-12-04', null, 'offen', 0)];
    const { jagden } = jagdenWaehlen(f, { maxOffen: 5, tagesVerlustGrenze: 450 });
    expect(jagden.map((j) => j.wert)).toEqual(['A', 'B', 'D']);
  });

  it('Fälle ohne Einstieg (lauern noch) werden keine Jagd', () => {
    expect(jagdenWaehlen([fall('A', null, null, 'lauert', null)], { maxOffen: 5, tagesVerlustGrenze: 450 }).jagden).toEqual([]);
  });

  it('Kennzahlen: Quote, Ø Verlust der Nieten, Erwartungswert, offene', () => {
    const k = jagdKennzahlen([fall('A', 'x', 'y', 'treffer', 400), fall('B', 'x', 'y', 'niete', -150), fall('C', 'x', 'y', 'zeit', -50), fall('D', 'x', null, 'offen', 20)]);
    expect(k).toEqual({ anzahl: 3, volltreffer: 1, quote: 33.3, oeNiete: -100, ev: 66.7, summe: 200, offen: 1 });
  });
});
