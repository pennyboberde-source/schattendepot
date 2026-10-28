// Tests mit aufgezeichneten (gekürzten) Beispielantworten vom 28.10.2026 – keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { angstGierAuswerten, appRaengeAuswerten, cotAuswerten, dvolAuswerten, handelsstoppsAuswerten, polymarketZeilen, type CotZeile } from './stimmungrand.ts';

const jetzt = new Date('2026-10-28T15:00:00Z');

describe('Nasdaq-Handelsstopps', () => {
  const item = (sym: string, name: string, code: string, datum = '10/28/2026') =>
    `<item><title>${sym}</title><ndaq:HaltDate>${datum}</ndaq:HaltDate><ndaq:IssueSymbol>${sym}</ndaq:IssueSymbol><ndaq:IssueName>${name}</ndaq:IssueName><ndaq:ReasonCode>${code}</ndaq:ReasonCode></item>`;
  const xml = `<rss><channel>${item('NIPG', 'NIP Group Inc. American Dep Sh', 'LUDP')}${item('NIPG', 'NIP Group Inc. American Dep Sh', 'LUDP')}${item('BAD', 'Bad Corp', 'H10')}${item('NEWS', 'News Inc', 'T1')}${item('ALT', 'Alt Inc', 'LUDP', '10/20/2026')}</channel></rss>`;
  it('fasst je Wert zusammen, alte Stopps fallen raus, Aussetzung ist negativ', () => {
    const r = handelsstoppsAuswerten(xml, jetzt);
    expect(r.signale.map((s) => `${s.wertpapier.ticker}:${s.richtung}`)).toEqual(['BAD:-1', 'NEWS:0', 'NIPG:0']);
    expect(r.signale[2].quellen[0].fakt).toContain('Volatilitätspause (Limit Up/Down), 2 Stopps');
    expect(r.makro[0]).toBe('Nasdaq-Handelsstopps (2 Tage): 4, davon Volatilitätspausen 2, Nachrichten 1');
  });
});

describe('App-Store-Ränge', () => {
  const namen = ['ChatGPT', 'Kalshi: Trade Sports & Events', ...Array.from({ length: 10 }, (_, i) => `App ${i}`), 'Coinbase: Buy Bitcoin & Ether', 'Robinhood: Trading & Investing'];
  it('Sprung um ≥ 20 Plätze oder neu in den Top 50 → Signal für die börsennotierte Firma', () => {
    const r = appRaengeAuswerten(namen, { Coinbase: 60, Robinhood: 20 }, jetzt);
    expect(r.raenge).toMatchObject({ Kalshi: 2, Coinbase: 13, Robinhood: 14 });
    expect(r.signale.map((s) => s.wertpapier.ticker)).toEqual(['COIN']);
    expect(r.makro[0]).toContain('Coinbase #13 (vorher #60)');
  });
});

describe('Fear & Greed, DVOL', () => {
  it('Extremwert wird Signal, Quelle steht neben dem Wert', () => {
    const r = angstGierAuswerten([{ value: '12', value_classification: 'Extreme Fear' }, { value: '20', value_classification: 'Fear' }], jetzt);
    expect(r.makro[0]).toBe('Krypto Fear & Greed: 12 (Extreme Fear), gestern 20 – Quelle: alternative.me');
    expect(r.signale[0]).toMatchObject({ typ: 'stimmung_extrem' });
    expect(angstGierAuswerten([{ value: '51', value_classification: 'Neutral' }], jetzt).signale).toHaveLength(0);
  });
  it('DVOL-Sprung ab 15 %', () => {
    const reihe = [[1, 0, 0, 0, 37.4], [2, 0, 0, 0, 38], [3, 0, 0, 0, 45]];
    const r = dvolAuswerten('BTC', reihe, jetzt);
    expect(r.signale[0].quellen[0].fakt).toContain('+18,4 %');
    expect(r.makro[0]).toContain('BTC-Volatilität DVOL (Deribit): 45');
  });
});

describe('Polymarket', () => {
  it('zeigt die zwei wahrscheinlichsten Ausgänge, große Änderungen markiert', () => {
    const r = polymarketZeilen([
      { title: 'Fed Decision in December?', markets: [
        { id: 'a', groupItemTitle: '25 bps decrease', outcomePrices: '["0.62","0.38"]' },
        { id: 'b', groupItemTitle: 'No change', outcomePrices: '["0.37","0.63"]' },
        { id: 'x', groupItemTitle: 'Company F', outcomePrices: '["0.5","0.5"]' },
        { id: 'c', groupItemTitle: '50+ bps decrease', outcomePrices: '["0.0045","0.9955"]' },
      ] },
      { title: 'Recession in 2026?', markets: [{ id: 'd', question: 'Recession in 2026?', outcomePrices: '["0.12","0.88"]' }] },
      { title: 'Schon entschieden', markets: [{ id: 'e', outcomePrices: '["0.999","0.001"]' }] },
    ], { a: 0.5 });
    expect(r.zeilen).toEqual(['Polymarket „Fed Decision in December?“ – 25 bps decrease: 62 % (+12 Pkt.), No change: 37 %', 'Polymarket „Recession in 2026?“ – 12 %']);
    expect(r.preise).toEqual({ a: 0.62, b: 0.37, d: 0.12 });
  });
});

describe('CFTC COT', () => {
  it('Netto in % des OI und Perzentil; Extrem → Signal', () => {
    const zeilen: CotZeile[] = Array.from({ length: 30 }, (_, i) => ({
      market_and_exchange_names: 'GOLD - COMMODITY EXCHANGE INC.',
      report_date_as_yyyy_mm_dd: new Date(Date.UTC(2026, 3, 1 + i * 7)).toISOString(),
      open_interest_all: '400000',
      noncomm_positions_long_all: String(200000 + i * 1000),
      noncomm_positions_short_all: '50000',
    }));
    const r = cotAuswerten(zeilen, jetzt);
    expect(r.signale[0]).toMatchObject({ typ: 'cot_extrem', wertpapier: { ticker: 'XAU' } });
    expect(r.makro[0]).toContain('Gold +45 % (Vorw. +45, P100)');
  });
});
