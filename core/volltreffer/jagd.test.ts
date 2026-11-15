import { describe, expect, it } from 'vitest';
import { jagdBilanz, jagdenWaehlen, jagdKennzahlen, type JagdFall } from './jagd.ts';

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

  it('Ausstieg am Nachziehstop zählt als abgeschlossene Jagd (kein Volltreffer)', () => {
    const k = jagdKennzahlen([fall('A', 'x', 'y', 'gesichert', 150), fall('B', 'x', 'y', 'niete', -150)]);
    expect(k).toMatchObject({ anzahl: 2, volltreffer: 0, quote: 0, ev: 0, offen: 0 });
  });
});

describe('Abendbilanz der Jagden', () => {
  /** Euro-Beträge haben ein geschütztes Leerzeichen vor dem €-Zeichen */
  const n = (s: string) => s.replace(/\u00a0/g, ' ');
  const offen = fall('ABC', '2026-12-03', null, 'offen', 35);
  const treffer = fall('XYZ', '2026-12-01', '2026-12-02', 'treffer', 400);
  const stop = fall('QQQ', '2026-12-01', '2026-12-02', 'niete', -150);
  const u = { kennzahlen: jagdKennzahlen([treffer, stop, offen]), offen: [offen], abgeschlossen: [treffer, stop] };

  it('meldet Beendete und Neue mit Summe, Stand und „virtuell“', () => {
    const b = jagdBilanz(u, [])!;
    expect(n(b.titel)).toBe('🎯 Volltreffer-Jagden: 2 beendet, +250,00 €');
    expect(n(b.text)).toContain('🎯 XYZ +400,00 €');
    expect(n(b.text)).toContain('❌ QQQ −150,00 €');
    expect(n(b.text)).toContain('▶️ ABC (direkt)');
    expect(n(b.text)).toContain('bisher 2 beendet, 1 Volltreffer');
    expect(n(b.text)).toMatch(/virtuell, Stand heute früh$/);
  });

  it('nichts doppelt: am nächsten Abend ohne Neues keine Bilanz', () => {
    const b = jagdBilanz(u, [])!;
    expect(jagdBilanz(u, b.gemeldet)).toBeNull();
    // die laufende Jagd endet → nur sie wird gemeldet
    const fertig = { ...offen, ende: '2026-12-05', art: 'gesichert' as const, netto: 120 };
    const b2 = jagdBilanz({ ...u, offen: [], abgeschlossen: [fertig, treffer, stop] }, b.gemeldet)!;
    expect(n(b2.titel)).toBe('🎯 Volltreffer-Jagden: 1 beendet, +120,00 €');
    expect(n(b2.text)).toContain('🔒 ABC +120,00 €');
    expect(n(b2.text)).not.toContain('XYZ');
  });

  it('ohne Jagden keine Bilanz', () => {
    expect(jagdBilanz({ kennzahlen: jagdKennzahlen([]), offen: [], abgeschlossen: [] }, [])).toBeNull();
  });
});
