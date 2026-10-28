// Tests der Randquellen nur mit aufgezeichneten (gekürzten) Beispielantworten vom 28.10.2026 – keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { gebuehrenSprung, kimchiPraemie, krakenFuturesAuswerten, stablecoinMenge, upbitAuswerten, type UpbitMarkt } from './kryptorand.ts';
import { shortInterestAuswerten, shortReportsAuswerten, shortReportZiel, stichtagKandidaten } from './shortdaten.ts';

const jetzt = new Date('2026-10-28T06:30:00Z');

describe('Upbit', () => {
  const maerkte: UpbitMarkt[] = [
    { market: 'BTC-BERA', english_name: 'Berachain', market_event: { warning: false, caution: { PRICE_FLUCTUATIONS: true } } },
    { market: 'KRW-BTC', english_name: 'Bitcoin', market_event: { warning: false, caution: { PRICE_FLUCTUATIONS: false, TRADING_VOLUME_SOARING: false } } },
    { market: 'KRW-XYZ', english_name: 'Xyz Coin', market_event: { warning: true, caution: { TRADING_VOLUME_SOARING: true, DEPOSIT_AMOUNT_SOARING: true } } },
    { market: 'KRW-NEU', english_name: 'Neucoin', market_event: { warning: false, caution: {} } },
  ];
  const vorher = ['KRW-BTC', 'KRW-XYZ', ...Array.from({ length: 60 }, (_, i) => `KRW-A${i}`)];

  it('Warnhinweise und Neulistungen nur für KRW-Märkte', () => {
    const r = upbitAuswerten(maerkte, vorher, jetzt);
    expect(r.neu).toEqual(['KRW-NEU']);
    expect(r.signale.map((s) => `${s.typ}:${s.wertpapier.ticker}`)).toEqual(['upbit_warnung:XYZ', 'neulistung:NEU']);
    expect(r.signale[0].quellen[0].fakt).toContain('Investment-Warnung der Börse, Handelsvolumen schießt hoch, Einzahlungen schießen hoch');
  });

  it('erster Lauf ohne Vortagsliste meldet keine Neulistungen', () => {
    expect(upbitAuswerten(maerkte, null, jetzt).neu).toEqual([]);
  });

  it('Kimchi-Prämie', () => {
    // 1 BTC = 80.000 $, 1 $ = 1.400 ₩ → fair 112 Mio. ₩; Korea zahlt 114,24 Mio. ₩ → +2 %
    expect(kimchiPraemie(114_240_000, 80_000, 1_400)).toBeCloseTo(2, 5);
  });
});

describe('Kraken Futures', () => {
  const tickers = [
    { symbol: 'PF_XBTUSD', markPrice: 80365, openInterest: 2494.4, relativeFundingRate: 0.0000126, volumeQuote: 900_000_000 },
    { symbol: 'PF_HOTUSD', markPrice: 2, openInterest: 5_000_000, relativeFundingRate: 0.00008, volumeQuote: 20_000_000 },
    { symbol: 'PF_DUENNUSD', markPrice: 1, openInterest: 100, relativeFundingRate: 0.001, volumeQuote: 10_000 },
    { symbol: 'PF_XAUUSD', markPrice: 4000, openInterest: 10, relativeFundingRate: 0.00006, volumeQuote: 50_000_000 },
    { symbol: 'FF_SOLUSD_261225', markPrice: 101, openInterest: 9, relativeFundingRate: 0.01, volumeQuote: 9e9 },
  ];
  it('Funding p. a., extremes Funding und OI-Sprung', () => {
    const r = krakenFuturesAuswerten(tickers, { HOT: 6_000_000 }, jetzt);
    expect(r.makro[0]).toContain('BTC +11,0 %');
    expect(r.signale.map((s) => `${s.typ}:${s.wertpapier.ticker}`)).toEqual(['funding_extrem:HOT', 'open_interest_sprung:HOT', 'funding_extrem:XAU']);
    expect(r.signale[2].wertpapier.name).toBe('Gold (Rohstoff)');
    expect(r.signale[1].quellen[0].fakt).toContain('Open Interest +66,7 %');
    expect(Object.keys(r.oi)).toEqual(['BTC', 'HOT', 'XAU']); // dünne Märkte und Laufzeit-Futures fallen raus
  });
});

describe('DefiLlama', () => {
  it('Gebührensprung nur mit Token, Mindestgröße und ≥ 40 % Wachstum', () => {
    const fees = [
      { defillamaId: '1', name: 'Alpha', displayName: 'Alpha', total7d: 5_000_000, change_7dover7d: 80 },
      { defillamaId: '2', name: 'Beta', total7d: 5_000_000, change_7dover7d: 10 },
      { defillamaId: '3', name: 'Ohne Token', total7d: 9_000_000, change_7dover7d: 300 },
      { defillamaId: '4', name: 'Winzig', total7d: 50_000, change_7dover7d: 500 },
      { defillamaId: '5', name: 'Neustart', total7d: 1_600_000, change_7dover7d: 29393 },
    ];
    const prot = [{ id: '1', symbol: 'alp', mcap: 2e8 }, { id: '2', symbol: 'BET' }, { id: '3', symbol: '-' }, { id: '4', symbol: 'WIN' }, { id: '5', symbol: 'NEU' }];
    const s = gebuehrenSprung(fees, prot, jetzt);
    expect(s.map((x) => x.wertpapier.ticker)).toEqual(['ALP']);
    expect(s[0].quellen[0].fakt).toContain('+80,0 % gegenüber der Vorwoche');
  });
  it('Stablecoin-Menge', () => {
    const t = stablecoinMenge([
      { pegType: 'peggedUSD', circulating: { peggedUSD: 181e9 }, circulatingPrevWeek: { peggedUSD: 182e9 } },
      { pegType: 'peggedEUR', circulating: { peggedUSD: 1e9 }, circulatingPrevWeek: { peggedUSD: 1e9 } },
    ]);
    expect(t).toContain('181 Mrd $');
    expect(t).toContain('-0,55 %');
  });
});

describe('FINRA Short Interest', () => {
  it('Stichtage: Monatsmitte/-ende, Wochenende → Freitag, 5 Tage Abstand', () => {
    expect(stichtagKandidaten(new Date('2026-10-28T06:00:00Z'))).toEqual(['2026-10-15', '2026-09-30', '2026-09-15', '2026-08-31']);
    // 15.11.2026 ist ein Sonntag → Freitag 13.11.
    expect(stichtagKandidaten(new Date('2026-11-20T06:00:00Z'))[0]).toBe('2026-11-13');
  });
  it('Squeeze-Kandidat, Aufbau, Eindecken; Fonds und Dünnes fallen raus', () => {
    const z = (symbolCode: string, issueName: string, changePercent: number, daysToCoverQuantity: number, adv = 1_000_000, prev = 2_000_000) => ({
      symbolCode, issueName, changePercent, daysToCoverQuantity, averageDailyVolumeQuantity: adv, previousShortPositionQuantity: prev, currentShortPositionQuantity: prev * (1 + changePercent / 100),
    });
    const s = shortInterestAuswerten([
      z('SQZ', 'Squeeze Corp', 25, 12),
      { ...z('WHGRF', 'Whitehaven Coal Ord', 13, 126), marketClassCode: 'OTC' },
      { ...z('FMCKJ', 'Federal Home Loan Mortgage Cor', 11, 59), marketClassCode: 'OTC' },
      { ...z('PDBC', 'Invesco Optimum Yield Diversi', 422, 1), marketClassCode: 'NNM' },
      { ...z('PREF', 'Principal Spectrum Pref S', 300, 5), marketClassCode: 'ARCA' },
      { ...z('GTVH', 'Golden Triangle Ventures Inc', -70, 1), marketClassCode: 'OTC' },
      z('AUF', 'Aufbau Inc', 120, 2),
      z('ZU', 'Zudeck Ltd', -60, 1),
      z('ETFX', 'Some Bond ETF', 200, 2),
      z('KLEIN', 'Klein Inc', 300, 3, 50_000),
      z('NEU', 'Neu Inc', 50000, 2),
    ], '2026-10-15', jetzt);
    expect(s.map((x) => `${x.wertpapier.ticker}:${x.typ}:${x.richtung}`).sort()).toEqual(['AUF:leerverkauf_aenderung:-1', 'GTVH:leerverkauf_aenderung:1', 'SQZ:leerverkauf_quote:0', 'ZU:leerverkauf_aenderung:1']);
  });
});

describe('Short-Seller-Berichte', () => {
  it('Ziel aus dem Titel', () => {
    expect(shortReportZiel('T1 Energy (TE) &#8211; Whistleblower Series: Internal Docs')).toEqual({ name: 'T1 Energy', ticker: 'TE', boerse: undefined });
    expect(shortReportZiel('International Games System (TPEx:&#160;3293) &#8212; Profits and Dividends')).toEqual({ name: 'International Games System', ticker: '3293', boerse: 'TPEx' });
    expect(shortReportZiel('The Bear Cave #349')).toBeNull();
  });
  it('Signal nur bis 72 h, Meldung bis 7 Tage', () => {
    const r = shortReportsAuswerten([
      { titel: 'Frisch AG (FRSH) – Fraud', link: 'https://x/1', zeit: '2026-10-27T12:00:00Z' },
      { titel: 'Alt Inc (ALT) – Report', link: 'https://x/2', zeit: '2026-10-23T12:00:00Z' },
      { titel: 'The Bear Cave #349', link: 'https://x/3', zeit: '2026-10-25T14:00:00Z' },
      { titel: 'Uralt (UR) – x', link: 'https://x/4', zeit: '2026-09-01T12:00:00Z' },
    ], 'Grizzly Research', jetzt);
    expect(r.signale.map((s) => s.wertpapier.ticker)).toEqual(['FRSH']);
    expect(r.signale[0]).toMatchObject({ typ: 'shortreport', richtung: -1 });
    expect(r.meldungen).toHaveLength(3);
  });
});

describe('GDELT (S4: eine Abfrage statt vieler)', async () => {
  const { gdeltAbfrage, gdeltArtikel, suchname } = await import('./gdelt.ts');
  it('baut eine ODER-Abfrage aus allen Positionen ohne Rechtsform', () => {
    expect(suchname('Space Exploration Technologies Corp. (SpaceX)')).toBe('Space Exploration Technologies');
    expect(suchname('Lithia Motors Inc.')).toBe('Lithia Motors');
    const u = decodeURIComponent(gdeltAbfrage(['Lithia Motors Inc.', 'Galaxy Digital Inc.', 'Lithia Motors Inc.'], '24h'));
    expect(u).toContain('query=("Lithia Motors" OR "Galaxy Digital")');
    expect(u).toContain('timespan=24h');
  });
  it('erkennt die Klartext-Drosselung (aufgezeichnete Antwort vom 28.10.2026)', () => {
    expect(() => gdeltArtikel('Please limit requests to one every 5 seconds or contact kalev.leetaru5@gmail.com for larger queries.')).toThrow(/ohne JSON/);
    expect(gdeltArtikel('{"articles":[{"url":"https://x","title":"Lithia Motors beats","seendate":"20261028T120000Z"}]}')).toHaveLength(1);
  });
});

describe('Coinalyze (S4, Format laut OpenAPI-Spezifikation vom 28.10.2026)', async () => {
  const { fundingAuswerten, liquidationenAuswerten } = await import('./coinalyze.ts');
  const stunde = (t: number, l: number, s: number) => ({ t, l, s });
  it('Liquidations-Spitze: ≥ 3× Median und ≥ 1 Mio. $, überwiegend Longs → Gegenbewegung (+1)', () => {
    const history = [...Array(23)].map((_, i) => stunde(1793200000 + i * 3600, 300000, 200000)).concat([stunde(1793282800, 4000000, 500000)]);
    const r = liquidationenAuswerten([{ symbol: 'BTCUSDT_PERP.A', history }, { symbol: 'ETHUSDT_PERP.A', history: history.slice(0, -1) }]);
    expect(r.signale).toHaveLength(1);
    expect(r.signale[0]).toMatchObject({ typ: 'liquidationen_spitze', richtung: 1, wertpapier: { ticker: 'BTC', markt: 'krypto' } });
    expect(r.makro[0]).toMatch(/^Coinalyze BTC: Liquidationen 24 h 16,0|^Coinalyze BTC: Liquidationen 24 h 16\.0/);
  });
  it('vorhergesagtes Funding ≥ 0,05 % → überfüllt (−1)', () => {
    const s = fundingAuswerten([{ symbol: 'SOLUSDT_PERP.A', value: 0.08, update: 1793282800000 }, { symbol: 'BTCUSDT_PERP.A', value: 0.01, update: 1793282800000 }]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ typ: 'funding_extrem', richtung: -1, wertpapier: { ticker: 'SOL' } });
  });
});

describe('SEC Verwässerung (S4, gleiches Atom-Format wie 8-K)', async () => {
  const { verwaesserungAuswerten } = await import('./sec.ts');
  it('424B5 → Verwässerungssignal für bekannte Ticker', () => {
    const atom = `<feed><entry><title>424B5 - TINY BIO INC (0000123456) (Filer)</title><link rel="alternate" href="https://www.sec.gov/x"/><summary>Filed 2026-10-28</summary><updated>2026-10-28T08:05:00-04:00</updated></entry>
      <entry><title>424B5 - UNKNOWN LLC (0000999999) (Filer)</title><link rel="alternate" href="https://www.sec.gov/y"/><summary>x</summary><updated>2026-10-28T08:05:00-04:00</updated></entry></feed>`;
    const s = verwaesserungAuswerten(atom, '424B5', new Map([[123456, { ticker: 'TINY', name: 'Tiny Bio Inc' }]]), new Date('2026-10-28T13:00:00Z'));
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ typ: 'verwaesserung', richtung: -1, wertpapier: { ticker: 'TINY' } });
  });
});
