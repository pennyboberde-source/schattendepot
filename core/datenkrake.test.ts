import { describe, expect, it } from 'vitest';
import { aehnlicheFaelle, aehnlichText, hotStuff, korrigierteChance, leereVorlaufStatistik, pumpVerdacht, verdichten, vorlaufFortschreiben, vorlaufLift, zusammenlegen, type KompaktSignal } from './datenkrake.ts';
import { entscheidungUebernehmen } from './entscheidung.ts';
import type { Signal } from './signale.ts';
import type { TrackingEintrag } from './statistik.ts';

const sig = (id: string, typ: string, ticker: string, quelle = 'Q', richtung: -1 | 0 | 1 = 1): Signal => ({
  id, typ, richtung, staerke: 0.5, zeit: '2026-10-28T10:00:00Z', wertpapier: { name: ticker, ticker }, quellen: [{ quelle, fakt: 'x' }],
});

describe('Verdichten und Zusammenlegen', () => {
  it('kompakt, gleiche ID nur einmal, Quellen vereinigt', () => {
    const a = verdichten([sig('insider_kauf:AAA:2026-10-28', 'insider_kauf', 'AAA', 'OpenInsider')]);
    const b = verdichten([{ ...sig('insider_kauf:AAA:2026-10-28', 'insider_kauf', 'AAA', 'SEC'), staerke: 0.9 }, sig('kursrakete:BBB:2026-10-28', 'kursrakete', 'BBB')]);
    const z = zusammenlegen(a, b);
    expect(z).toHaveLength(2);
    expect(z[0]).toMatchObject({ s: 'T:AAA', typ: 'insider_kauf', st: 0.9, q: ['OpenInsider', 'SEC'] });
  });
});

describe('Hot Stuff', () => {
  const k = (s: string, typ: string): KompaktSignal => ({ id: `${typ}:${s}`, s, n: s, typ, r: 1, st: 1, q: ['Q'], z: '' });
  it('Rakete mit Vorzeichen aus den Vortagen, Raketen zählen nicht als Vorzeichen', () => {
    const r = hotStuff([k('T:AAA', 'kursrakete'), k('T:BBB', 'tagesgewinner'), k('T:CCC', 'insider_kauf')], [
      { datum: '2026-10-26', signale: [{ s: 'T:AAA', typ: 'insider_cluster_kauf', q: ['OpenInsider'] }, { s: 'T:AAA', typ: 'kursrakete', q: ['gettex'] }] },
      { datum: '2026-10-10', signale: [{ s: 'T:BBB', typ: 'stimmung_social', q: ['ApeWisdom'] }] },
    ], '2026-10-28');
    expect(r.mover.map((m) => m.s)).toEqual(['T:AAA', 'T:BBB']);
    expect(r.mover[0].vorzeichen).toEqual([{ typ: 'insider_cluster_kauf', tageVorher: 2, q: ['OpenInsider'] }]);
    expect(r.mover[1].vorzeichen).toEqual([]); // 18 Tage zurück liegt außerhalb des Fensters
    expect(r.abdeckung).toBe(50);
  });

  it('Vorlauf: jeder Signal-Tag genau einmal, Lift gegen die Grundrate', () => {
    let st = leereVorlaufStatistik();
    const tag = { datum: '2026-10-20', signale: [
      { s: 'T:A', typ: 'insider_kauf', q: ['OpenInsider'] }, { s: 'T:B', typ: 'insider_kauf', q: ['OpenInsider'] },
      { s: 'T:C', typ: 'nachricht', q: ['FAZ'] }, { s: 'T:D', typ: 'nachricht', q: ['FAZ'] }, { s: 'T:A', typ: 'kursrakete', q: ['gettex'] },
    ] };
    st = vorlaufFortschreiben(st, tag, new Set(['T:A']));
    st = vorlaufFortschreiben(st, tag, new Set(['T:A'])); // doppelt → ignoriert
    expect(st.jeTyp.insider_kauf).toEqual({ signale: 2, vorRakete: 1 });
    expect(st.jeTyp.nachricht).toEqual({ signale: 2, vorRakete: 0 });
    expect(st.gesamt).toEqual({ signale: 4, vorRakete: 1 });
    const lift = vorlaufLift(st, 1);
    expect(lift[0]).toEqual({ typ: 'insider_kauf', quote: 50, lift: 2, signale: 2 });
  });
});

describe('Ähnliche Fälle', () => {
  const t = (typen: string[], r1W: number, score = 2): TrackingEintrag => ({ datum: 'd', schluessel: 'x', name: 'x', score, typen, quellen: [], r1W });
  it('gleiche Richtung, gemeinsame Typen, mindestens 3 Fälle', () => {
    const tr = [t(['insider_kauf', 'analysten_hochstufung'], 4), t(['insider_kauf', 'analysten_hochstufung', 'nachricht'], -2), t(['analysten_hochstufung', 'insider_kauf'], 7), t(['insider_kauf'], 9), t(['insider_kauf', 'analysten_hochstufung'], 5, -1)];
    const a = aehnlicheFaelle(['insider_kauf', 'analysten_hochstufung', 'nachricht'], 1, tr);
    expect(a).toEqual({ anzahl: 3, treffer: 2, quote: 66.7, oe: 3, feld: 'r1W' });
    expect(aehnlichText(a)).toBe('In 3 ähnlichen Fällen 2 im Plus, Ø +3 % nach 1 Woche');
    expect(aehnlicheFaelle(['nachricht'], 1, tr)).toBeNull();
  });
});

describe('Pump-Verdacht', () => {
  it('nur Stimmung/Rakete ohne Handfestes', () => {
    expect(pumpVerdacht(['stimmung_social', 'kursrakete'])).toBe(true);
    expect(pumpVerdacht(['kursrakete'], { kurs: 0.4 })).toBe(true);
    expect(pumpVerdacht(['kursrakete'], { kurs: 12 })).toBe(false);
    expect(pumpVerdacht(['stimmung_social', 'kursrakete', 'insider_kauf'])).toBe(false);
    expect(pumpVerdacht(['upbit_warnung'], { fakten: ['Upbit-Hinweis X: Handel auf wenige Konten konzentriert'] })).toBe(true);
  });
});

describe('Chancen-Korrektur und Mindest-Chance', () => {
  const kal = [{ stufe: '60–79 %', erwartet: 70, tatsaechlich: 30, anzahl: 10 }];
  it('verrechnet mit der Wirklichkeit, erst ab 3 Fällen', () => {
    expect(korrigierteChance(70, kal)).toEqual({ chance: 50, faelle: 10 });
    expect(korrigierteChance(45, kal)).toEqual({ chance: 45, faelle: 0 });
    expect(korrigierteChance(70, [{ ...kal[0], anzahl: 2 }])).toEqual({ chance: 70, faelle: 2 });
  });

  const plan = {
    wertpapier: { name: 'Acme', isin: 'US0000000001', ticker: 'ACME', anlageklasse: 'aktie' as const, spreadKlasse: 'aktie_large' as const, handelsplatz: 'TGT', steuertopf: 'aktien' as const, kursbasis: { markt: 'us' as const, symbol: 'ACME', waehrung: 'USD' as const } },
    strategie: 'insider_kauf' as const, these: 't', ausloeser: 'a', signalIds: [], quellen: [], konfidenz: 70, pflichtOrder: false,
    erwarteteRenditeNetto: 3, zielNettoProzent: 8, stopProzent: -6, verkaufstermin: '2026-11-10T15:00:00Z', risiken: [], einflussLektionen: '',
  };
  const e = { typ: 'morgenlauf' as const, datum: '2026-10-29', erstellt: '2026-10-29T06:40:00Z' };
  const cfg = { haltedauerMinMinuten: 15, haltedauerMaxTage: 31, hebelMax: 10, mindestChance: 40 };
  const jetzt = new Date('2026-10-29T06:45:00Z');

  it('unter 40 % oder ohne Gewinnerwartung → abgelehnt; korrigierte Chance wird gespeichert', () => {
    const u = entscheidungUebernehmen({ ...e, orders: [{ ...plan, konfidenz: 30 }, { ...plan, erwarteteRenditeNetto: -1 }, plan] }, [], jetzt, { ...cfg, kalibrierung: kal });
    expect(u.hinweise.join(' | ')).toContain('Chance 30 % unter 40 %');
    expect(u.hinweise.join(' | ')).toContain('kein positiver Erwartungswert');
    const vorgemerkt = u.ereignisse.filter((x) => x.typ === 'vorgemerkt');
    expect(vorgemerkt).toHaveLength(1);
    expect((vorgemerkt[0].daten as { plan: { chanceKorrigiert?: number } }).plan.chanceKorrigiert).toBe(50);
  });

  it('korrigierte Chance unter 40 % → abgelehnt mit Begründung', () => {
    const u = entscheidungUebernehmen({ ...e, orders: [{ ...plan, konfidenz: 62 }] }, [], jetzt, { ...cfg, kalibrierung: [{ ...kal[0], tatsaechlich: 0, anzahl: 30 }] });
    expect(u.hinweise[0]).toContain('Claude schätzte 62 %, korrigiert nach 30 Fällen');
  });
});
