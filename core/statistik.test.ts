import { describe, expect, it } from 'vitest';
import signalCfg from '../config/signale.json';
import { gewichteAnpassen, type Grenzen } from './gewichte.ts';
import type { SignalConfig } from './signale.ts';
import { kalibrierteQuote, statistikBerechnen, type TrackingEintrag } from './statistik.ts';
import type { Order } from './typen.ts';

function order(id: string, konfidenz: number, netto: number, extra: Partial<Order['plan']> = {}, tage = 2): Order {
  const kaufZeit = '2026-10-01T08:00:00Z';
  return {
    id,
    status: 'geschlossen',
    vorgemerktUm: kaufZeit,
    vorgemerktVon: 'morgenlauf',
    plan: {
      wertpapier: { name: id, isin: 'DE0000000001', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien' },
      strategie: 'insider_kauf',
      these: '',
      ausloeser: '',
      signalIds: ['insider_kauf:X:2026-10-01'],
      quellen: [{ name: 'OpenInsider', link: 'https://x' }],
      konfidenz,
      pflichtOrder: false,
      erwarteteRenditeNetto: 3,
      zielNettoProzent: 5,
      stopProzent: -3,
      verkaufstermin: kaufZeit,
      risiken: [],
      einflussLektionen: '',
      ...extra,
    },
    verkaufstermin: kaufZeit,
    kauf: { zeit: kaufZeit, stueck: 10, kurs: 100, kurswert: 1000, entgelt: { provision: 9.95, handelsplatz: 0.95, gesamt: 10.9 }, betrag: 1010.9, kursquelle: 't', synthetisch: false },
    verkauf: { zeit: new Date(Date.parse(kaufZeit) + tage * 86400000).toISOString(), stueck: 10, kurs: 101, kurswert: 1010, entgelt: { provision: 9.95, handelsplatz: 0.95, gesamt: 10.9 }, betrag: 999.1, kursquelle: 't', synthetisch: false, grund: 'ziel' },
    anpassungen: [],
    ergebnis: { kursProzent: 1, netto, nettoProzent: (netto / 1010.9) * 100, gebuehren: 21.8, steuer: 0, nachSteuern: netto },
  };
}

describe('Statistik', () => {
  const orders = [order('a', 80, 30), order('b', 80, -20), order('c', 45, 10, { pflichtOrder: true, strategie: 'sonstige' }), order('d', 85, 40, {}, 10)];
  const s = statistikBerechnen(orders, [], 'jetzt');

  it('Gesamt, Gruppen, Haltedauer', () => {
    expect(s.gesamt).toMatchObject({ anzahl: 4, treffer: 3, quote: 75, summeNetto: 60 });
    expect(s.nachStrategie.insider_kauf.anzahl).toBe(3);
    expect(s.nachSignalTyp.insider_kauf.anzahl).toBe(4);
    expect(s.nachHaltedauer['> 1 Woche'].anzahl).toBe(1);
    expect(s.pflicht.anzahl).toBe(1);
  });

  it('Kalibrierung: hält „80 %“, was es verspricht?', () => {
    expect(s.kalibrierung).toEqual([
      { stufe: '40–59 %', erwartet: 45, tatsaechlich: 100, anzahl: 1 },
      { stufe: '80–100 %', erwartet: 81.7, tatsaechlich: 66.7, anzahl: 3 },
    ]);
    expect(kalibrierteQuote(s, 90)).toEqual({ quote: 66.7, faelle: 3 });
    expect(s.zusammenfassung).toContain('Trefferquote 75 %');
  });

  it('Nicht-Käufe: Ø gerichtete Rendite je Signal-Typ', () => {
    const t: TrackingEintrag[] = [
      { datum: 'd', schluessel: 'T:A', name: 'A', score: 2, typen: ['insider_kauf'], quellen: ['OpenInsider'], r1W: 2 },
      { datum: 'd', schluessel: 'T:B', name: 'B', score: 2, typen: ['insider_kauf', 'nachricht'], quellen: ['FAZ'], r1W: -1 },
    ];
    const st = statistikBerechnen([], t, 'jetzt');
    expect(st.kandidaten.nachSignalTyp.insider_kauf).toEqual({ anzahl: 2, oe1h: null, oe1T: null, oe3T: null, oe1W: 0.5, oe10T: null, oe1M: null, quote1T: null, quote3T: null, quote1W: 50, n1T: 0, n3T: 0, n1W: 2 });
    expect(st.kandidaten.nachRisiko?.normal?.anzahl).toBe(2);
  });
});

describe('Gewichtsanpassung in Grenzen', () => {
  const cfg = signalCfg as unknown as SignalConfig & { grenzen: Grenzen };
  const tg = (anzahl: number, oe1W: number) => ({ anzahl, oe1T: null, oe1W, oe1M: null, quote1W: null });

  it('höchstens ±20 % pro Woche, erst ab 8 Fällen', () => {
    const r = gewichteAnpassen({}, cfg, { insider_kauf: tg(10, 10), nachricht: tg(3, 10), stimmung_social: tg(9, -1) }, {}, [], '2026-10-24');
    expect(r.gewichte.signale!.insider_kauf).toBe(1.8); // 1,5 × 1,2
    expect(r.gewichte.signale!.nachricht).toBeUndefined();
    expect(r.gewichte.signale!.stimmung_social).toBe(0.475); // 0,5 × 0,95
  });

  it('absolute Grenzen min/max', () => {
    const r = gewichteAnpassen({ signale: { insider_cluster_kauf: 2.9 } }, cfg, { insider_cluster_kauf: tg(20, 50) }, {}, [], 'd');
    expect(r.gewichte.signale!.insider_cluster_kauf).toBe(3);
  });

  it('Claude-Vorschläge nur bei genug Fällen und passender Richtung', () => {
    const r = gewichteAnpassen(
      {},
      cfg,
      {},
      { FAZ: tg(10, -2), CNBC: tg(2, 3) },
      [
        { art: 'quelle', name: 'FAZ', faktor: 1.3, begruendung: 'gefühlt gut' },
        { art: 'quelle', name: 'CNBC', faktor: 1.3, begruendung: 'gut' },
      ],
      'd',
    );
    expect(r.vorschlaegeErledigt.map((v) => v.status)).toEqual(['abgelehnt (Daten widersprechen)', 'abgelehnt (zu wenige Fälle)']);
    expect(r.gewichte.quellen!.FAZ).toBe(0.9); // nur die datengetriebene Anpassung (−2 % → ×0,9)
  });
});
