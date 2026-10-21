import { describe, expect, it } from 'vitest';
import { dateiInfo, parseGettex } from './gettex.ts';

// Aufgezeichnete Zeilen aus posttrade.20261021.19.00.mund.csv.gz (gekürzt)
const CSV = [
  'DE0007164600,18:52:01.161808,EUR,205.90,10',
  'DE0007164600,18:59:11.161808,EUR,206.05,20',
  'US0378331005,18:59:08.022987,EUR,306.55,25',
  'IE00B4L5Y983,18:52:03.517896,EUR,131.07,15',
  'XS0000000000,18:50:00.000000,USD,99.5,1',
  '',
].join('\n');

describe('gettex Nachhandelsdaten', () => {
  it('letztes Geschäft je ISIN in EUR, Zeit in UTC', () => {
    const m = parseGettex(CSV, '2026-10-21');
    expect(m.get('DE0007164600')).toEqual({ isin: 'DE0007164600', zeit: '2026-10-21T18:59:11.161Z', kurs: 206.05 });
    expect(m.get('IE00B4L5Y983')?.kurs).toBe(131.07);
    expect(m.has('XS0000000000')).toBe(false); // nur EUR
  });
  it('Filter auf gesuchte ISINs', () => {
    expect([...parseGettex(CSV, '2026-10-21', new Set(['US0378331005'])).keys()]).toEqual(['US0378331005']);
  });
  it('Dateiname → Datum und Sortierschlüssel', () => {
    expect(dateiInfo('https://erdk.bayerische-boerse.de:8000/delayed-data/MUNC-MUND/posttrade/posttrade.20261021.19.00.mund.csv.gz')).toEqual({ datum: '2026-10-21', schluessel: '202610211900' });
    expect(dateiInfo('https://x/y.csv')).toBeNull();
  });
});
