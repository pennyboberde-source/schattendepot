// Marktumfeld: aufgezeichnete Beispielzeilen (gekürzt), keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { aenderungAm, breite, fedAbstand, parseAngst, parseStablecoins, parseVixCsv, summeBis, wertAm } from './umfeld.ts';

const CSV = ['DATE,OPEN,HIGH,LOW,CLOSE', '11/05/2026,17.0,18.0,16.5,17.500000', '11/06/2026,17.5,19.0,17.0,18.000000', '11/09/2026,18,20,17,20.000000', '11/10/2026,20,21,19,19.000000', '11/11/2026,19,19,18,18.500000', '11/12/2026,18.36,19.34,17.38,18.700000', '11/13/2026,18.78,20.92,17.64,19.300000', 'kaputt', ''].join('\r\n');

describe('VIX', () => {
  it('CSV lesen: Datum umstellen, aufsteigend, kaputte Zeilen weg', () => {
    const r = parseVixCsv(CSV);
    expect(r.length).toBe(7);
    expect(r[0]).toEqual(['2026-11-05', 17.5]);
    expect(r[6]).toEqual(['2026-11-13', 19.3]);
  });

  it('Wert am Tag: Wochenende nimmt den Freitag, zu alt oder zu früh → null', () => {
    const r = parseVixCsv(CSV);
    expect(wertAm(r, '2026-11-13')).toBe(19.3);
    expect(wertAm(r, '2026-11-15')).toBe(19.3);
    expect(wertAm(r, '2026-11-25')).toBeNull();
    expect(wertAm(r, '2026-11-01')).toBeNull();
  });

  it('5-Tage-Änderung in %', () => {
    const r = parseVixCsv(CSV);
    // 13.11. (19,3) gegen 5 Einträge davor = 06.11. (18,0)
    expect(aenderungAm(r, '2026-11-13')).toBe(7.2);
    expect(aenderungAm(r, '2026-11-09')).toBeNull();
  });
});

describe('Zinsentscheid der US-Notenbank', () => {
  const E = ['2026-10-28', '2026-12-09'];
  it('Abstand in Kalendertagen: vorher positiv, danach negativ, sonst 99', () => {
    expect(fedAbstand('2026-10-28', E)).toBe(0);
    expect(fedAbstand('2026-10-26', E)).toBe(2);
    expect(fedAbstand('2026-10-29', E)).toBe(-1);
    expect(fedAbstand('2026-11-04', E)).toBe(-7);
    expect(fedAbstand('2026-11-16', E)).toBe(99);
    expect(fedAbstand('2026-12-02', E)).toBe(7);
  });
});

describe('Marktbreite und Mehrtagesbewegung', () => {
  it('Anteil steigender Werte, erst ab genug Werten', () => {
    expect(breite([1, -1, 2, 0], 4)).toBe(50);
    expect(breite([1, 2], 20)).toBeNull();
  });
  it('Summe der letzten n Tage', () => {
    expect(summeBis([1, 2, 3, -1, 0.5, 2], 5)).toBe(6.5);
    expect(summeBis([1, 2], 1, 5)).toBeNull();
  });
});

describe('Krypto-Umfeld', () => {
  it('Fear & Greed aus alternative.me (Format wie /fng/?limit=0, Werte erfunden)', () => {
    const j = { name: 'Fear and Greed Index', data: [{ value: '10', value_classification: 'Extreme Fear', timestamp: '1794787200' }, { value: '55', value_classification: 'Greed', timestamp: '1794700800' }, { value: 'x', timestamp: '1794614400' }] };
    expect(parseAngst(j)).toEqual([
      ['2026-11-15', 55],
      ['2026-11-16', 10],
    ]);
  });
  it('Stablecoins aus DefiLlama (Format wie /stablecoincharts/all, Werte erfunden)', () => {
    const j = [{ date: '1794700800', totalCirculating: { peggedUSD: 1 }, totalCirculatingUSD: { peggedUSD: 300e9 } }, { date: '1794787200', totalCirculatingUSD: { peggedUSD: 303e9 } }, { date: '1794873600' }];
    const s = parseStablecoins(j);
    expect(s).toEqual([
      ['2026-11-15', 300e9],
      ['2026-11-16', 303e9],
    ]);
    expect(aenderungAm(s, '2026-11-16', 1)).toBe(1);
  });
});
