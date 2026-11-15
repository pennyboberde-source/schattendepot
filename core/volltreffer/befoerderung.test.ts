// Stufe 3 (V6): Beförderung, Beförderungszeiten, Auswahl der sichtbaren Orders, Einzelmitteilungen.
import { describe, expect, it } from 'vitest';
import { befoerderungPruefen, inStufe3, istBefoerdert, stufe3Mitteilungen, stufe3Waehlen, stufe3Zeiten, type V6Regeln } from './befoerderung.ts';
import type { JagdFall } from './jagd.ts';

const R: V6Regeln = { mindestFaelle: 20, mindestQuote: 25, mindestEv: 30, maxOffen: 2, tagesVerlustGrenze: 300, einsatz: 1000 };
const n = (s: string) => s.replace(/ /g, ' ');

describe('Beförderung prüfen (Klasse vor Masse)', () => {
  const gut = { faelle: 22, ev: 48, rueckblick: { quote: 34, ev: 59, se: 25 } };
  it('besteht mit genug Fällen, im Plus und im Band des Rückblicks', () => {
    const p = befoerderungPruefen(gut, R);
    expect(p.ok).toBe(true);
    expect(n(p.grund)).toContain('22 Fälle vorwärts');
  });
  it('fällt durch: zu selten Volltreffer, zu wenig Gewinn im Rückblick, zu wenig Fälle, im Minus, unter dem Band', () => {
    expect(befoerderungPruefen({ ...gut, rueckblick: { ...gut.rueckblick, quote: 18 } }, R).ok).toBe(false);
    expect(befoerderungPruefen({ ...gut, rueckblick: { ...gut.rueckblick, ev: 20 } }, R).ok).toBe(false);
    expect(n(befoerderungPruefen({ ...gut, faelle: 12 }, R).grund)).toContain('erst 12 von 20');
    expect(befoerderungPruefen({ ...gut, ev: -5 }, R).ok).toBe(false);
    // Band: 59 − 2 × 25 = 9 → vorwärts 8 liegt darunter
    expect(befoerderungPruefen({ ...gut, ev: 8 }, R).ok).toBe(false);
    expect(befoerderungPruefen({ ...gut, ev: 10 }, R).ok).toBe(true);
  });
});

describe('Beförderungszeiten aus dem Muster-Buch', () => {
  const buch = [
    { schluessel: 'A', status: 'vorwaertstest' },
    { schluessel: 'A', status: 'befoerdert', am: '2026-12-03' },
    { schluessel: 'A', status: 'befoerdert', am: '2026-12-04' },
    { schluessel: 'A', status: 'zurueckgestuft', am: '2026-12-20' },
    { schluessel: 'A', status: 'befoerdert', am: '2027-01-10' },
    { schluessel: 'B', status: 'befoerdert', am: '2026-12-05' },
    { schluessel: 'B', status: 'beendet', am: '2026-12-08' },
  ];
  it('Zeiten von–bis, doppelte Beförderung zählt nicht, beendet schließt', () => {
    const z = stufe3Zeiten(buch);
    expect(z.get('A')).toEqual([
      { von: '2026-12-03', bis: '2026-12-20' },
      { von: '2027-01-10', bis: null },
    ]);
    expect(z.get('B')).toEqual([{ von: '2026-12-05', bis: '2026-12-08' }]);
    expect(istBefoerdert(z, 'A')).toBe(true);
    expect(istBefoerdert(z, 'B')).toBe(false);
  });
  it('nur Stichtage in einer Beförderungszeit – nie rückwirkend', () => {
    const z = stufe3Zeiten(buch);
    const f = (stichtag: string) => ({ muster: 'A', stichtag }) as JagdFall;
    expect(inStufe3(z, f('2026-12-02'))).toBe(false);
    expect(inStufe3(z, f('2026-12-03'))).toBe(true);
    expect(inStufe3(z, f('2026-12-20'))).toBe(false);
    expect(inStufe3(z, f('2027-02-01'))).toBe(true);
  });
});

const fall = (wert: string, stichtag: string, einstieg: string | null, ende: string | null, art: JagdFall['art'], netto: number | null, muster = 'A', wertung = 10): JagdFall => ({
  muster,
  wertung,
  wert,
  markt: 'aktie',
  stichtag,
  einstieg,
  ende,
  art,
  netto,
  tag: einstieg ? 2 : null,
  fenster: 10,
  spielart: 'Turbo short Hebel 2, Stop 150 €',
});

describe('Sichtbare Orders wählen', () => {
  const zeiten = stufe3Zeiten([
    { schluessel: 'A', status: 'befoerdert', am: '2026-12-01' },
    { schluessel: 'B', status: 'befoerdert', am: '2026-12-01' },
  ]);
  it('nur ab der Beförderung, je Wert eine Order, höchstens maxOffen, lauernde werden vorgemerkt', () => {
    const s = stufe3Waehlen(
      [
        fall('ALT', '2026-11-30', '2026-12-01', '2026-12-03', 'treffer', 410),
        fall('XYZ', '2026-12-01', '2026-12-02', '2026-12-04', 'treffer', 405),
        fall('XYZ', '2026-12-01', '2026-12-02', null, 'offen', 20, 'B', 5),
        fall('QQQ', '2026-12-03', '2026-12-04', null, 'offen', -40),
        fall('NEU', '2026-12-07', null, null, 'lauert', null),
        fall('ZWO', '2026-12-07', null, null, 'lauert', null, 'B', 3),
      ],
      zeiten,
      R,
    );
    expect(s.abgeschlossen.map((j) => j.wert)).toEqual(['XYZ']);
    expect(s.offen.map((j) => j.wert)).toEqual(['QQQ']);
    // ein Platz frei (QQQ läuft, maxOffen 2) → nur der Fall mit der besseren Wertung wird vorgemerkt
    expect(s.vorgemerkt.map((j) => [j.wert, j.einstieg])).toEqual([['NEU', null]]);
    expect(s.kennzahlen.anzahl).toBe(1);
    expect(s.rendite).toBe(40.5);
  });
  it('Claudes „nein“ nur ausfiltern, wenn verlangt', () => {
    const f = { ...fall('NEIN', '2026-12-07', null, null, 'lauert', null), urteil: 'nein' as const, grund: 'Werbung' };
    expect(stufe3Waehlen([f], zeiten, R).vorgemerkt).toHaveLength(1);
    expect(stufe3Waehlen([f], zeiten, R, true).vorgemerkt).toHaveLength(0);
  });
});

describe('Einzelmitteilungen', () => {
  it('Vormerkung, dann Ende – je Ereignis einmal; ohne Vormerkung kommt „läuft“', () => {
    const vor = fall('NEU', '2026-12-07', null, null, 'lauert', null);
    const m1 = stufe3Mitteilungen({ vorgemerkt: [vor], offen: [], abgeschlossen: [] }, []);
    expect(m1.neu.map((m) => m.titel)).toEqual(['🎯 Volltreffer-Order: NEU']);
    // am nächsten Morgen läuft sie – nichts Neues
    const m2 = stufe3Mitteilungen({ vorgemerkt: [], offen: [{ ...vor, einstieg: '2026-12-08', art: 'offen', netto: 30 }], abgeschlossen: [] }, m1.gemeldet);
    expect(m2.neu).toEqual([]);
    // beendet mit Volltreffer
    const m3 = stufe3Mitteilungen({ vorgemerkt: [], offen: [], abgeschlossen: [{ ...vor, einstieg: '2026-12-08', ende: '2026-12-10', art: 'treffer', netto: 412.5 }] }, m2.gemeldet);
    expect(n(m3.neu[0].titel)).toBe('🎯 Volltreffer! NEU +412,50 €');
    expect(stufe3Mitteilungen({ vorgemerkt: [], offen: [], abgeschlossen: [{ ...vor, ende: '2026-12-10', art: 'treffer', netto: 412.5 }] }, m3.gemeldet).neu).toEqual([]);
    // ohne Vormerkung: „läuft“
    const m4 = stufe3Mitteilungen({ vorgemerkt: [], offen: [fall('QQQ', '2026-12-03', '2026-12-04', null, 'offen', -40)], abgeschlossen: [] }, []);
    expect(m4.neu[0].titel).toBe('🎯 Volltreffer-Order läuft: QQQ');
  });
});
