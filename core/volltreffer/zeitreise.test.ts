import { describe, expect, it } from 'vitest';
import { auswaehlen, bilanz, nachspielen, ZeitStat, type Kandidat } from './zeitreise.ts';

describe('Zeitreise: Auswahl nur aus der Vergangenheit (19.11.2026)', () => {
  // Gruppe 0 = „alle“ (Grundrate), Gruppe 1 = gutes Muster, Gruppe 2 = erst später gut, Gruppe 3 = nur in einer Hälfte gut
  const st = new ZeitStat(10, 4, 1);
  for (let b = 0; b < 10; b++) {
    for (let i = 0; i < 40; i++) st.add(b, 0, 0, i % 5 === 0 ? 400 : -150, i % 5 === 0); // Grundrate: Ø −40
    for (let i = 0; i < 20; i++) st.add(b, 1, 0, i % 3 === 0 ? 400 : -150, i % 3 === 0); // Ø +33
    for (let i = 0; i < 20; i++) st.add(b, 2, 0, b >= 6 ? (i % 2 === 0 ? 400 : -150) : -150, b >= 6 && i % 2 === 0);
    for (let i = 0; i < 20; i++) st.add(b, 3, 0, b < 3 ? (i % 2 === 0 ? 400 : -150) : -150, b < 3 && i % 2 === 0);
  }
  st.kumulieren();
  const r = { mindestFaelleHaelfte: 30, mindestQuote: 10, maxMuster: 10, maxJeBaustein: 3, abstand: 1, ersterAbschnitt: 4 };
  const w = (b: number) => auswaehlen(st, b, r, (g) => g > 0, () => 0, (g) => [`b${g}`]).map((x) => x.g);
  it('wählt nur, was in beiden Hälften der Vergangenheit im Plus war – ohne Blick nach vorn', () => {
    expect(w(3)).toEqual([]); // zu früh
    expect(w(5)).toEqual([1]); // Gruppe 2 ist erst ab Abschnitt 6 gut – bei b=5 unbekannt
    expect(w(9)).toContain(1);
    expect(w(9)).not.toContain(3); // nur früher gut
  });
  it('Bereichssummen stimmen nach dem Kumulieren', () => {
    expect(st.bereich(1, 0, 0, 9).n).toBe(200);
    expect(st.bereich(1, 0, 5, 9).n).toBe(100);
    expect(st.bereich(1, 0, 3, 2).n).toBe(0);
  });
  it('Vielfalt: höchstens maxJeBaustein je Baustein', () => {
    const x = auswaehlen(st, 9, { ...r, maxJeBaustein: 1 }, (g) => g > 0, () => 0, () => ['gleich']);
    expect(x).toHaveLength(1);
  });
});

describe('Zeitreise: Depot nachspielen', () => {
  const k = (tag: number, wert: string, wertung: number, netto: number, dauer = 3): Kandidat => ({ tag, wert, wertung, netto, treffer: netto >= 400, dauer, muster: 'm' });
  it('höchstens maxOffen gleichzeitig, je Wert eine, beste Wertung zuerst, Platz frei nach dem Ausstieg', () => {
    const o = nachspielen([k(0, 'A', 5, 400), k(0, 'B', 9, -150), k(0, 'C', 1, 400), k(1, 'A', 9, 400), k(4, 'C', 1, 400)], { maxOffen: 2, maxJeTag: 3 });
    // Tag 0: B (9) und A (5); C hat keinen Platz. Tag 1: A ist schon offen. Tag 4: A und B sind raus (Ausstieg Tag 3) → C
    expect(o.map((x) => `${x.einstieg}${x.wert}`)).toEqual(['1A', '1B', '5C']);
    const b = bilanz(o, (t) => (t < 5 ? '2025-01' : '2025-02'));
    expect(b).toMatchObject({ orders: 3, volltreffer: 2, netto: 650, maxRueckgang: 150 });
    expect(b.monate).toEqual([
      { monat: '2025-01', orders: 2, volltreffer: 1, netto: 250 },
      { monat: '2025-02', orders: 1, volltreffer: 1, netto: 400 },
    ]);
  });
});
