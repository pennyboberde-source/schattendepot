import { describe, expect, it } from 'vitest';
import { apewisdomLesen, leiheCsv, leiheLesen, stimmungText } from './stimmung.ts';

describe('Leihgebühren (Interactive Brokers usa.txt)', () => {
  it('liest Kürzel, Gebühr und Verfügbarkeit, überspringt Kopf und Ende', () => {
    const text = '#BOF|2026.11.20|10:15:02\n#SYM|CUR|NAME|CON|ISIN|REBATERATE|FEERATE|AVAILABLE|\nAAPL|USD|APPLE INC|265598|US0378331005|3.3546|0.25|>10000000|\nGDHG|USD|GOLDEN HEAVEN|1|KYG|-150.2|152.5|1500|\n#EOF|2\n';
    const l = leiheLesen(text);
    expect(l).toEqual([
      { kuerzel: 'AAPL', gebuehr: 0.25, verfuegbar: 10000000 },
      { kuerzel: 'GDHG', gebuehr: 152.5, verfuegbar: 1500 },
    ]);
    expect(leiheCsv(l).split('\n')[2]).toBe('GDHG,152.5,1500');
  });
  it('ohne Kopfzeile: nichts', () => expect(leiheLesen('irgendwas')).toEqual([]));
});

describe('ApeWisdom', () => {
  it('liest Rang, Nennungen und Stand vor 24 Stunden', () => {
    const r = apewisdomLesen({ count: 2, pages: 12, currentPage: 1, results: [{ rank: 1, ticker: 'gme', name: 'GameStop', mentions: '420', upvotes: 900, rank_24h_ago: '3', mentions_24h_ago: 120 }, { rank: 2, ticker: '', mentions: 1 }] });
    expect(r.seiten).toBe(12);
    expect(r.nennungen).toEqual([{ kuerzel: 'GME', rang: 1, nennungen: 420, upvotes: 900, rangVor24h: 3, nennungenVor24h: 120 }]);
  });
  it('fremdes Format: leer', () => expect(apewisdomLesen({ fehler: 1 })).toEqual({ seiten: 0, nennungen: [] }));
});

describe('Stimmung für die Lauerliste', () => {
  it('nur Klassen, nichts Bemerkenswertes → null', () => {
    expect(stimmungText({ kuerzel: 'GME', rang: 3, nennungen: 600, upvotes: 1, rangVor24h: 9, nennungenVor24h: 100 }, { kuerzel: 'GME', gebuehr: 150, verfuegbar: 2000 })).toBe('Reddit Top 10, Nennungen über 5-fach in 24 Std. · Leihgebühr über 100 % p. a. (Squeeze-Gefahr, Short teuer)');
    expect(stimmungText(undefined, { kuerzel: 'X', gebuehr: 0.3, verfuegbar: 1e7 })).toBeNull();
    expect(stimmungText({ kuerzel: 'Y', rang: 500, nennungen: 1, upvotes: 0, rangVor24h: null, nennungenVor24h: null }, undefined)).toBeNull();
  });
});
