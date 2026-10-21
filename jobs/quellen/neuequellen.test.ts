import { describe, expect, it } from 'vitest';
import type { Kandidat } from '../../core/signale.ts';
import { aggregiere, auffaellige } from '../kurse/gettex.ts';
import { analystenTrend, nachzahlenDrift } from './anreicherung.ts';
import { finraSignale, parseFinra } from './finra.ts';

const jetzt = new Date('2026-10-21T10:00:00Z');

describe('gettex-Kursraketen-Scanner', () => {
  it('erkennt starke Bewegung mit vielen Geschäften und Umsatz', () => {
    const zeilen = Array.from({ length: 20 }, (_, i) => `US0000000001,18:${String(10 + i).padStart(2, '0')}:00.000000,EUR,${(0.03 + i * 0.002).toFixed(3)},${100000}`);
    zeilen.push('DE0007164600,18:10:00.000000,EUR,206,10', 'DE0007164600,18:50:00.000000,EUR,207,10');
    const t = auffaellige(aggregiere([{ csv: zeilen.join('\n'), datum: '2026-10-21' }]));
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ isin: 'US0000000001', erster: 0.03, letzter: 0.068, geschaefte: 20 });
    expect(Math.round(t[0].prozent)).toBe(127);
  });
});

describe('FINRA Leerverkaufsquote', () => {
  const kopf = 'Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market';
  it('starker Anstieg der Quote bei Mindestvolumen wird Signal', () => {
    const heute = parseFinra(`${kopf}\n20261020|GME|3000000|0|4000000|Q\n20261020|AAPL|5000000|0|13000000|Q\n20261020|TINY|90000|0|100000|Q`);
    const vortag = parseFinra(`${kopf}\n20261019|GME|1600000|0|4000000|Q\n20261019|AAPL|5000000|0|13000000|Q\n20261019|TINY|10000|0|100000|Q`);
    const s = finraSignale(heute, vortag, '2026-10-20', jetzt);
    expect(s.map((x) => x.wertpapier.ticker)).toEqual(['GME']);
    expect(s[0].quellen[0].fakt).toContain('Leerverkaufsquote 75 % (+35 Pkt.');
  });
});

describe('Anreicherung', () => {
  it('Analysten-Trend: mehr Kaufempfehlungen → Hochstufung', () => {
    const s = analystenTrend(
      [
        { period: '2026-09-01', strongBuy: 2, buy: 4, hold: 6, sell: 0, strongSell: 0 },
        { period: '2026-10-01', strongBuy: 4, buy: 5, hold: 3, sell: 0, strongSell: 0 },
      ],
      'Acme',
      'ACME',
      jetzt,
    );
    expect(s).toMatchObject({ typ: 'analysten_hochstufung', richtung: 1 });
  });
  it('kleine Änderung → kein Signal', () => {
    expect(analystenTrend([{ period: '2026-10-01', strongBuy: 5, buy: 5, hold: 5, sell: 0, strongSell: 0 }, { period: '2026-09-01', strongBuy: 5, buy: 5, hold: 5, sell: 0, strongSell: 0 }], 'A', 'A', jetzt)).toBeNull();
  });
  it('Drift nach Quartalszahlen nur bei bestätigender Kursreaktion', () => {
    const k: Kandidat = {
      schluessel: 'T:NFLX',
      wertpapier: { name: 'Netflix', ticker: 'NFLX' },
      score: 2,
      signale: [{ id: 'x', wertpapier: { name: 'Netflix', ticker: 'NFLX' }, typ: 'gewinn_ueberraschung', staerke: 0.6, richtung: 1, zeit: 'z', quellen: [{ quelle: 'Finnhub', fakt: 'EPS 5,6 vs. 5,0' }] }],
    };
    expect(nachzahlenDrift(k, 4.5, jetzt)).toMatchObject({ typ: 'nachzahlen_drift', richtung: 1 });
    expect(nachzahlenDrift(k, -3, jetzt)).toBeNull();
    expect(nachzahlenDrift(k, 1, jetzt)).toBeNull();
  });
});
