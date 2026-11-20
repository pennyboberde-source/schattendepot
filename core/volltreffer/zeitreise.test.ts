import { describe, expect, it } from 'vitest';
import { auswaehlen, bilanz, ergebnisseMischen, nachspielen, tagesKennzahlen, zrAktiv, zrBremse, zrBuchFortschreiben, zrZeiten, ZeitStat, type Kandidat, type ZrBuchEintrag, type ZrMuster } from './zeitreise.ts';

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

describe('Zeitreise-Regel live (20.11.2026)', () => {
  const m = (k: string): ZrMuster => ({ schluessel: k, gruppe: k, gruppenSchluessel: `aktie|${k}`, sp: '2S150', fenster: 10, wertung: 3, quote: 25, ev: 20 });
  it('Buch: neu gewählt, abgewählt, unverändert – nur anhängen', () => {
    const buch: ZrBuchEintrag[] = [];
    buch.push(...zrBuchFortschreiben(buch, [m('a'), m('b')], () => '2026-11-20', true));
    expect(buch.map((e) => `${e.schluessel}:${e.status}`)).toEqual(['a:gewaehlt', 'b:gewaehlt']);
    expect(zrBuchFortschreiben(buch, [m('a'), m('b')], () => '2026-11-23', true)).toEqual([]);
    buch.push(...zrBuchFortschreiben(buch, [m('b'), m('c')], () => '2026-12-01', true));
    expect(buch.slice(2).map((e) => `${e.schluessel}:${e.status}:${e.am}`)).toEqual(['a:abgewaehlt:2026-12-01', 'c:gewaehlt:2026-12-01']);
    expect([...zrAktiv(buch).keys()].sort()).toEqual(['b', 'c']);
    // veraltete Datei: nichts ändern
    expect(zrBuchFortschreiben(buch, null, () => '2026-12-02', true)).toEqual([]);
    // Regel aus (Bremse): alle aktiven abwählen
    const aus = zrBuchFortschreiben(buch, [m('b'), m('c')], () => '2026-12-03', false, 'Bremse');
    expect(aus.map((e) => `${e.schluessel}:${e.status}`).sort()).toEqual(['b:abgewaehlt', 'c:abgewaehlt']);
  });
  it('Zeiten: Stichtag ab „gewaehlt“, vor „abgewaehlt“; erneut gewählt = zweites Fenster', () => {
    const buch: ZrBuchEintrag[] = [
      { schluessel: 'a', status: 'gewaehlt', am: '2026-11-20' },
      { schluessel: 'a', status: 'abgewaehlt', am: '2026-12-01' },
      { schluessel: 'a', status: 'gewaehlt', am: '2026-12-16' },
    ];
    expect(zrZeiten(buch).get('a')).toEqual([{ von: '2026-11-20', bis: '2026-12-01' }, { von: '2026-12-16', bis: null }]);
  });
  it('Bremse: Verlustgrenze sofort, Durchschnitt erst ab mindestOrders', () => {
    const r = { mindestOrders: 8, minOe: -20, maxVerlust: 750 };
    const o = (art: string, netto: number) => ({ art, netto });
    expect(zrBremse([o('niete', -160), o('niete', -160), o('offen', -100)], r).aus).toBe(false);
    expect(zrBremse([o('niete', -160), o('niete', -160), o('niete', -160), o('niete', -160), o('offen', -120)], r).aus).toBe(true);
    const sieben = Array.from({ length: 7 }, () => o('zeit', -40));
    expect(zrBremse(sieben, r).aus).toBe(false);
    expect(zrBremse([...sieben, o('zeit', -40)], r).aus).toBe(true);
    expect(zrBremse([...sieben, o('treffer', 420)], r).aus).toBe(false);
  });
});

describe('Prüfungen der Zeitreise', () => {
  it('ergebnisseMischen tauscht nur innerhalb von Tag, Markt und Spielart und behält die Summen', () => {
    // 4 Fälle, 2 Spielarten: Tag 1 Markt 0 (z0, z1), Tag 1 Markt 1 (z2), Tag 2 Markt 0 (z3)
    const tag = [1, 1, 1, 2];
    const markt = [0, 0, 1, 0];
    const netto = Float32Array.from([10, 1, 20, 2, 30, 3, 40, Number.NaN]);
    const art = Uint8Array.from([1, 0, 0, 0, 1, 0, 1, 0]);
    const aus = Int32Array.from([5, 6, 7, 8, 9, 10, 11, 12]);
    let getauscht = 0;
    for (let s = 1; s <= 20 && !getauscht; s++) {
      const n = netto.slice();
      const a = art.slice();
      const u = aus.slice();
      getauscht = ergebnisseMischen(4, 2, (z) => tag[z], (z) => markt[z], n, a, u, s);
      // Tag 1 Markt 0 Spielart 0: {10, 20} bleiben unter sich, mit ihrem Volltreffer-Kennzeichen und Ausstieg
      expect(new Set([n[0], n[2]])).toEqual(new Set([10, 20]));
      expect(n[0] === 10 ? [a[0], u[0]] : [a[2], u[2]]).toEqual([1, 5]);
      expect([n[4], n[6], Number.isNaN(n[7])]).toEqual([30, 40, true]);
      expect(n[5]).toBe(3);
    }
    expect(getauscht).toBeGreaterThan(0);
  });

  it('tagesKennzahlen zählt den Tag als Einheit und teilt in zwei Hälften', () => {
    const k = tagesKennzahlen([
      { tag: 1, netto: 400, treffer: true },
      { tag: 1, netto: -150, treffer: false },
      { tag: 1, netto: -150, treffer: false },
      { tag: 2, netto: -150, treffer: false },
    ]);
    expect(k.faelle).toBe(4);
    expect(k.quote).toBe(25);
    expect(k.oe).toBe(-12.5);
    expect(k.tage).toBe(2);
    expect(k.oeTag).toBe(-58.3); // (33,3 − 150) / 2
    expect(k.haelften.map((h) => h.faelle)).toEqual([3, 1]);
  });
});
