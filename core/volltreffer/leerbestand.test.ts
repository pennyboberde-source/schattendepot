import { describe, expect, it } from 'vitest';
import { leerbestandAusCsv, leerbestandCsv, leerbestandDatei, parseFinraShortInterest, stichtagKandidaten } from './leerbestand.ts';

// Aufbau wie die FINRA-Datei shrtJJJJMMTT.csv (Kopfzeile echt, Werte erfunden)
const FINRA = [
  '"accountingYearMonthNumber"|"symbolCode"|"issueName"|"issuerServicesGroupExchangeCode"|"marketClassCode"|"currentShortPositionQuantity"|"previousShortPositionQuantity"|"stockSplitFlag"|"averageDailyVolumeQuantity"|"daysToCoverQuantity"|"revisionFlag"|"changePercent"|"changePreviousNumber"|"settlementDate"',
  '"20261015"|"XYZ"|"Beispiel AG"|"A"|"NYSE"|"1500000"|"1000000"||"500000"|"3.00"||"50.00"|"500000"|"2026-10-15"',
  '"20261015"|"ABC B"|"Klasse B"|"A"|"NYSE"|"200"|"400"||"0"|""||"-50.00"|"-200"|"2026-10-15"',
  '"20261015"|"SPL"|"Split Inc"|"A"|"NNM"|"9000"|"3000"|"S"|"3000"|"3.00"||"200.00"|"6000"|"2026-10-15"',
  '',
].join('\r\n');

describe('Leerverkaufsbestand (FINRA)', () => {
  it('liest die FINRA-Datei über die Spaltennamen', () => {
    const m = parseFinraShortInterest(FINRA);
    expect(m.size).toBe(3);
    expect(m.get('XYZ')).toEqual({ bestand: 1500000, vorher: 1000000, adv: 500000, tage: 3 });
    // Klasse mit Leerzeichen wie bei Massive mit Punkt; ohne Tage zum Eindecken → null
    expect(m.get('ABC.B')).toEqual({ bestand: 200, vorher: 400, adv: 0, tage: null });
    // Split: Vorwert nicht vergleichbar
    expect(m.get('SPL')?.vorher).toBeNull();
  });

  it('Archiv-CSV hin und zurück: Änderung in %, Veröffentlichungstag', () => {
    const csv = leerbestandCsv(parseFinraShortInterest(FINRA), '2026-11-02T11:00:21.000Z');
    const { ab, werte } = leerbestandAusCsv(csv, '2026-10-15');
    expect(ab).toBe('2026-11-02');
    expect(werte.get('XYZ')).toEqual({ tage: 3, aenderung: 50, bestand: 1500000 });
    expect(werte.get('ABC.B')).toEqual({ tage: null, aenderung: -50, bestand: 200 });
    expect(werte.get('SPL')).toEqual({ tage: 3, aenderung: null, bestand: 9000 });
  });

  it('ohne Veröffentlichungszeit (oder unsinnige) gilt der Stichtag + 21 Tage', () => {
    const csv = leerbestandCsv(parseFinraShortInterest(FINRA), null);
    expect(leerbestandAusCsv(csv, '2026-10-15').ab).toBe('2026-11-05');
    const frueh = leerbestandCsv(parseFinraShortInterest(FINRA), '2026-10-01T10:00:00Z');
    expect(leerbestandAusCsv(frueh, '2026-10-15').ab).toBe('2026-11-05');
  });

  it('gilt erst ab der Veröffentlichung, nie zu alt', () => {
    const dateien = [
      { stichtag: '2026-09-15', ab: '2026-09-28' },
      { stichtag: '2026-09-30', ab: '2026-10-12' },
      { stichtag: '2026-10-15', ab: '2026-11-02' },
    ];
    // Stichtag 15.10. ist am 30.10. noch nicht veröffentlicht → die Datei vom 30.09.
    expect(leerbestandDatei(dateien, '2026-10-30')).toBe(1);
    expect(leerbestandDatei(dateien, '2026-11-02')).toBe(2);
    expect(leerbestandDatei(dateien, '2026-09-27')).toBe(-1);
    // ohne neuere Datei nach 45 Tagen unbekannt
    expect(leerbestandDatei(dateien, '2026-11-29')).toBe(2);
    expect(leerbestandDatei(dateien, '2026-12-01')).toBe(-1);
  });

  it('Stichtag-Kandidaten: der 15. und der Monatsletzte, sonst der Handelstag davor', () => {
    const werktag = (d: string) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()) && d !== '2024-11-28';
    // Nov. 2024: 15. ist ein Freitag, der 30. ein Samstag → 29.
    expect(stichtagKandidaten(2024, 11, werktag).map((k) => k[0])).toEqual(['2024-11-15', '2024-11-29']);
    // Okt. 2026: 31. ist ein Samstag → 30.; Ersatz davor ohne Wochenende
    const okt = stichtagKandidaten(2026, 10, werktag);
    expect(okt[1]).toEqual(['2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26']);
    expect(okt[0][0]).toBe('2026-10-15');
  });
});
