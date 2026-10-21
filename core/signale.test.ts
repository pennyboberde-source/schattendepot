import { describe, expect, it } from 'vitest';
import cfgDatei from '../config/signale.json';
import { kandidaten, signalPunkte, wertpapierSchluessel, zusammenfuehren, type Signal, type SignalConfig } from './signale.ts';

const cfg = cfgDatei as unknown as SignalConfig;
const sig = (teil: Partial<Signal> & Pick<Signal, 'typ'>): Signal => ({
  id: `${teil.typ}-${Math.random()}`,
  wertpapier: { name: 'Beispiel AG', ticker: 'BSP' },
  staerke: 0.6,
  richtung: 1,
  zeit: '2026-10-21T06:00:00Z',
  quellen: [{ quelle: 'finnhub', fakt: 'x' }],
  ...teil,
});

describe('Wertpapier-Schlüssel', () => {
  it('Ticker vor ISIN vor Name, Rechtsform egal', () => {
    expect(wertpapierSchluessel({ name: 'SAP SE', ticker: 'sap.de' })).toBe('T:SAP');
    expect(wertpapierSchluessel({ name: 'SAP SE', isin: 'DE0007164600' })).toBe('I:DE0007164600');
    expect(wertpapierSchluessel({ name: 'Beispiel AG' })).toBe(wertpapierSchluessel({ name: 'Beispiel' }));
  });
});

describe('Zusammenführen doppelter Meldungen', () => {
  it('gleicher Typ + Wertpapier aus zwei Quellen → ein stärkeres Signal', () => {
    const r = zusammenfuehren(
      [sig({ typ: 'insider_kauf' }), sig({ typ: 'insider_kauf', quellen: [{ quelle: 'sec', fakt: 'Form 4' }], zeit: '2026-10-21T09:00:00Z' })],
      cfg,
    );
    expect(r).toHaveLength(1);
    expect(r[0].quellen.map((q) => q.quelle)).toEqual(['finnhub', 'sec']);
    expect(r[0].staerke).toBe(0.81); // 0.6 × (1 + 0.35)
  });

  it('dieselbe Quelle doppelt zählt nicht als unabhängig', () => {
    const r = zusammenfuehren([sig({ typ: 'nachricht' }), sig({ typ: 'nachricht', zeit: '2026-10-21T07:00:00Z' })], cfg);
    expect(r[0].staerke).toBe(0.6);
  });

  it('außerhalb des Zeitfensters (48 h) bleiben es zwei Signale', () => {
    const r = zusammenfuehren([sig({ typ: 'insider_kauf' }), sig({ typ: 'insider_kauf', zeit: '2026-10-24T07:00:00Z' })], cfg);
    expect(r).toHaveLength(2);
  });
});

describe('Bewertung', () => {
  it('Typ-Gewicht × Stärke × Quellengewicht; Lernschleife überschreibt', () => {
    const s = sig({ typ: 'insider_cluster_kauf', staerke: 1 });
    expect(signalPunkte(s, cfg)).toBe(3);
    expect(signalPunkte(s, cfg, { signale: { insider_cluster_kauf: 2 }, quellen: { finnhub: 0.5 } })).toBe(1);
  });

  it('Kandidaten: Richtung zählt, neutrale Signale verstärken', () => {
    const k = kandidaten(
      [
        sig({ typ: 'prognose_erhoehung', staerke: 1 }),
        sig({ typ: 'volumen_ungewoehnlich', richtung: 0, staerke: 1 }),
        sig({ typ: 'prognose_senkung', richtung: -1, staerke: 1, wertpapier: { name: 'Minus AG', ticker: 'MIN' } }),
        sig({ typ: 'nachricht', richtung: 0, staerke: 0.2, wertpapier: { name: 'Klein AG', ticker: 'KLN' } }),
      ],
      cfg,
    );
    expect(k.map((c) => [c.wertpapier.ticker, c.score])).toEqual([
      ['BSP', 3.5],
      ['MIN', -3],
      ['KLN', 0.05],
    ]);
  });
});
