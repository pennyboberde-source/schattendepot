import { describe, expect, it } from 'vitest';
import signalCfg from '../../config/signale.json';
import { lagebildMarkdown, type LagebildDaten } from '../../core/lagebild.ts';
import { kandidaten, type SignalConfig } from '../../core/signale.ts';
import { apeWisdomAuswerten, fredMakro } from './maerkte.ts';
import { openInsiderAuswerten } from './openinsider.ts';
import { quartalszahlenAuswerten } from './schluesselquellen.ts';
import { kalenderTermine } from './wirtschaftskalender.ts';
import { secAuswerten } from './sec.ts';

const jetzt = new Date('2026-10-21T04:30:00Z');

describe('OpenInsider (aufgezeichnet, gekürzt)', () => {
  it('Cluster-Käufe ≥ 100.000 $ werden Signale, kleine nicht', () => {
    const cluster = `<table class="tinytable"><thead><tr><th>X</th><th>Filing Date</th><th>Trade Date</th><th>Ticker</th><th>Company Name</th><th>Industry</th><th>Ins</th><th>Trade Type</th><th>Price</th><th>Qty</th><th>Owned</th><th>ΔOwn</th><th>Value</th></tr></thead><tbody>
      <tr><td>M</td><td>2026-10-20</td><td>2026-10-17</td><td>ACME</td><td>Acme Corp</td><td>Tech</td><td>4</td><td>P - Purchase</td><td>$12.00</td><td>+50,000</td><td>1,000,000</td><td>+5%</td><td>+$600,000</td></tr>
      <tr><td></td><td>2026-10-20</td><td>2026-10-17</td><td>TINY</td><td>Tiny Inc</td><td>Bio</td><td>2</td><td>P - Purchase</td><td>$1.00</td><td>+5,000</td><td>10,000</td><td>+50%</td><td>+$5,000</td></tr></tbody></table>`;
    const r = openInsiderAuswerten(cluster, '', jetzt);
    expect(r.signale).toHaveLength(1);
    expect(r.signale[0]).toMatchObject({ typ: 'insider_cluster_kauf', wertpapier: { ticker: 'ACME' }, richtung: 1 });
    expect(r.insider![0].text).toContain('4 Insider kauften für 0.60 Mio. $');
  });
});

describe('ApeWisdom', () => {
  it('nur starke Zunahme mit Mindestzahl', () => {
    const r = apeWisdomAuswerten(
      { results: [ { ticker: 'GME', name: 'GameStop', mentions: 400, mentions_24h_ago: 50, rank: 1 }, { ticker: 'AAPL', name: 'Apple', mentions: 100, mentions_24h_ago: 90, rank: 2 }, { ticker: 'XYZ', name: 'X', mentions: 10, mentions_24h_ago: 1, rank: 3 } ] },
      jetzt,
    );
    expect(r.map((s) => s.wertpapier.ticker)).toEqual(['GME']);
  });
});

describe('FRED-Makro', () => {
  it('formatiert deutsch', () => {
    expect(fredMakro('observation_date,VIXCLS,DEXUSEU\n2026-10-19,16.8,1.0812\n2026-10-20,17.2,1.0840\n')).toEqual([
      'VIX: 17,2 (Vortag 16,8), Stand 2026-10-20',
      'EUR/USD: 1,0840 (Vortag 1,0812), Stand 2026-10-20',
    ]);
  });
});

describe('Quartalszahlen', () => {
  it('Termine heute und Überraschungen ≥ 5 %', () => {
    const r = quartalszahlenAuswerten(
      [
        { date: '2026-10-21', symbol: 'AAPL', hour: 'amc', epsEstimate: 1.5, epsActual: null, revenueEstimate: 9e10 },
        { date: '2026-10-20', symbol: 'NFLX', epsEstimate: 5, epsActual: 5.6, revenueEstimate: 1e10 },
        { date: '2026-10-20', symbol: 'SMALL', epsEstimate: 1, epsActual: 2, revenueEstimate: 1e7 },
      ],
      '2026-10-21',
      'Finnhub',
      new Set(['AAPL']),
      jetzt,
    );
    expect(r.termine).toEqual([{ zeit: 'nach US-Schluss', text: 'AAPL Quartalszahlen (Erwartung EPS 1.5)' }]);
    expect(r.signale.find((s) => s.typ === 'gewinn_ueberraschung')?.wertpapier.ticker).toBe('NFLX');
    expect(r.signale.some((s) => s.wertpapier.ticker === 'SMALL')).toBe(false);
  });
});

describe('SEC 8-K', () => {
  it('Items → Signale, nur bekannte Ticker', () => {
    const atom = `<feed><entry><title>8-K - ACME CORP (0000123456) (Filer)</title><link rel="alternate" href="https://www.sec.gov/a"/><summary type="html">&lt;b&gt;Filed:&lt;/b&gt; 2026-10-20 Item 1.01: Entry into a Material Definitive Agreement Item 9.01</summary><updated>2026-10-20T16:05:00-04:00</updated></entry>
      <entry><title>8-K - UNKNOWN LLC (0000999999) (Filer)</title><link rel="alternate" href="https://www.sec.gov/b"/><summary>Item 1.03</summary><updated>2026-10-20T16:05:00-04:00</updated></entry></feed>`;
    const s = secAuswerten(atom, new Map([[123456, { ticker: 'ACME', name: 'Acme Corp' }]]), jetzt);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ typ: 'grossauftrag', wertpapier: { ticker: 'ACME' }, richtung: 1 });
  });
});

describe('Wirtschaftskalender', () => {
  it('nur heute, wichtige USD/EUR-Termine, Berliner Zeit', () => {
    const t = kalenderTermine(
      [
        { title: 'CPI m/m', country: 'USD', date: '2026-10-21T08:30:00-04:00', impact: 'High', forecast: '0.3%', previous: '0.2%' },
        { title: 'ZEW Economic Sentiment', country: 'EUR', date: '2026-10-21T05:00:00-04:00', impact: 'Medium' },
        { title: 'Retail Sales', country: 'NZD', date: '2026-10-21T17:45:00-04:00', impact: 'High' },
        { title: 'Bank Holiday', country: 'USD', date: '2026-10-22T08:30:00-04:00', impact: 'High' },
        { title: 'Minor', country: 'USD', date: '2026-10-21T10:00:00-04:00', impact: 'Low' },
      ],
      new Date('2026-10-21T04:30:00Z'),
    );
    expect(t).toEqual([
      { zeit: '11:00', text: 'Eurozone: ZEW Economic Sentiment' },
      { zeit: '14:30', text: 'USA: CPI m/m (wichtig) – Prognose 0.3%, zuvor 0.2%' },
    ]);
  });
});

describe('Lagebild', () => {
  it('bleibt im Budget und enthält Signal-IDs', () => {
    const cfg = signalCfg as unknown as SignalConfig;
    const viele = Array.from({ length: 200 }, (_, i) => ({
      id: `nachricht:T${i}:2026-10-21`,
      wertpapier: { name: `Firma ${i}`, ticker: `T${i}` },
      typ: 'nachricht',
      staerke: 0.5,
      richtung: 1 as const,
      zeit: jetzt.toISOString(),
      quellen: [{ quelle: 'x', fakt: 'y'.repeat(140), link: 'https://example.org/' + i }],
    }));
    const l: LagebildDaten = { datum: '2026-10-21', erstellt: jetzt.toISOString(), makro: ['VIX 17'], termine: [], meldungen: [], insider: [], positionen: [], kandidaten: kandidaten(viele, cfg), quellen: [{ id: 'x', name: 'X', ok: true, signale: 200 }] };
    const md = lagebildMarkdown(l, {}, 6000);
    expect(md.length).toBeLessThanOrEqual(6000);
    expect(md).toContain('[nachricht:T');
  });
});
