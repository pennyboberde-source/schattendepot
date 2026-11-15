import { describe, expect, it } from 'vitest';
import { boersenwertAm, boersenwertCsv, krakenZuSymbol, parseBoersenwertCsv, parseGeckoChart, parseGeckoMarkets, symbolZuId } from './boersenwert.ts';

describe('Börsenwert der Coins (CoinGecko)', () => {
  // Form wie die Antworten von /coins/markets und /coins/{id}/market_chart (Werte erfunden)
  const MAERKTE = [
    { id: 'bitcoin', symbol: 'btc', market_cap: 1.2e12, market_cap_rank: 1 },
    { id: 'kleine-kopie', symbol: 'eth', market_cap: 3e6, market_cap_rank: 2400 },
    { id: 'ethereum', symbol: 'eth', market_cap: 4e11, market_cap_rank: 2 },
    { id: 'ohne-wert', symbol: 'xyz', market_cap: null },
  ];

  it('Kürzel → ID: bei doppelten Kürzeln gewinnt der größte Börsenwert', () => {
    const m = parseGeckoMarkets(MAERKTE);
    expect(m).toHaveLength(3);
    const ids = symbolZuId(m);
    expect(ids.get('ETH')).toBe('ethereum');
    expect(ids.get('BTC')).toBe('bitcoin');
    expect(krakenZuSymbol('XBT')).toBe('BTC');
    expect(krakenZuSymbol('SOL')).toBe('SOL');
  });

  it('Tagesverlauf: letzter Wert je UTC-Tag', () => {
    const t = Date.UTC(2026, 0, 5);
    const r = parseGeckoChart({ market_caps: [[t, 100], [t + 3600000, 120], [t + 86400000, 130], [t + 2 * 86400000, 0]] });
    expect(r).toEqual([
      { datum: '2026-01-05', cap: 120 },
      { datum: '2026-01-06', cap: 130 },
    ]);
    expect(parseGeckoChart({ error: 'x' })).toEqual([]);
  });

  it('CSV vereinen und lesen – der neuere Eintrag gewinnt', () => {
    const { csv, zeilen } = boersenwertCsv([{ datum: '2026-01-05', symbol: 'BTC', cap: 1 }], [{ datum: '2026-01-05', symbol: 'BTC', cap: 2 }, { datum: '2026-01-04', symbol: 'ETH', cap: 3 }]);
    expect(zeilen).toBe(2);
    expect(parseBoersenwertCsv(csv)).toEqual([
      { datum: '2026-01-04', symbol: 'ETH', cap: 3 },
      { datum: '2026-01-05', symbol: 'BTC', cap: 2 },
    ]);
  });

  it('Wert am Stichtag: nie aus der Zukunft, höchstens 3 Tage alt', () => {
    const reihe = new Map([
      ['2026-01-02', 50],
      ['2026-01-10', 90],
    ]);
    expect(boersenwertAm(reihe, '2026-01-04')).toBe(50);
    expect(boersenwertAm(reihe, '2026-01-06')).toBeNull();
    expect(boersenwertAm(reihe, '2026-01-09')).toBeNull();
    expect(boersenwertAm(reihe, '2026-01-10')).toBe(90);
    expect(boersenwertAm(undefined, '2026-01-10')).toBeNull();
  });
});
