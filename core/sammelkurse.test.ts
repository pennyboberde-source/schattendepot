// Plan Volltreffer V1: Sammelkurse – gettex-Tageskerzen, US-Sammelabruf (Massive), Kraken-Stand aller Paare.
// Nur aufgezeichnete Beispielantworten, keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { gettexCsv, gettexTagStatus, gettexZeilen, kryptoCsv, parseGettexArchiv, parseKrakenAlle, parseMassive, parseUsArchiv, tageInFolge, usCsv, type Tageskerze } from './sammelkurse.ts';
import { istHandelstag } from './kalender.ts';

describe('gettex: Tageskerzen je ISIN', () => {
  // Zeilen wie in posttrade.20261113.17.15.mund.csv.gz: ISIN, Zeit (UTC), Währung, Kurs, Stück
  const FRUEH = ['DE0007164600,07:31:02.154496,EUR,210.5,10', 'DE0007164600,07:44:59.000001,EUR,211.2,5', 'US67066G1040,07:35:00.100000,EUR,120,2'].join('\n');
  const SPAET = ['DE0007164600,21:59:55.907847,EUR,209.8,20', 'DE0007164600,16:00:00.000000,EUR,214,1', 'DE000PM04TH5,17:00:00.154496,EUR,330,0', 'XS1234567890,17:00:01.000000,USD,99.5,1000', 'US67066G1040,17:10:00.000000,EUR,0,5', ''].join('\n');

  it('Eröffnung, Hoch, Tief, Schluss, Stück, Umsatz – unabhängig von der Reihenfolge der Dateien', () => {
    const kerzen = new Map<string, Tageskerze>();
    // spätes Fenster zuerst eingerechnet: Eröffnung und Schluss müssen trotzdem stimmen
    expect(gettexZeilen(kerzen, SPAET)).toBe(2);
    expect(gettexZeilen(kerzen, FRUEH)).toBe(3);
    expect(kerzen.get('DE0007164600')).toEqual({ o: 210.5, h: 214, l: 209.8, c: 209.8, stueck: 36, umsatz: 210.5 * 10 + 211.2 * 5 + 209.8 * 20 + 214, geschaefte: 4, von: '07:31:02', bis: '21:59:55' });
    expect(kerzen.get('US67066G1040')).toMatchObject({ o: 120, c: 120, geschaefte: 1 });
  });

  it('Kursstellungen ohne Stückzahl, Fremdwährungen und Nullkurse sind keine Geschäfte', () => {
    const kerzen = new Map<string, Tageskerze>();
    gettexZeilen(kerzen, SPAET);
    expect([...kerzen.keys()]).toEqual(['DE0007164600']);
  });

  it('Archivformat hin und zurück', () => {
    const kerzen = new Map<string, Tageskerze>();
    gettexZeilen(kerzen, FRUEH);
    const csv = gettexCsv(kerzen);
    expect(csv.split('\n')[0]).toBe('isin,o,h,l,c,stueck,umsatz,geschaefte,von,bis');
    expect(csv.split('\n')[1]).toBe('DE0007164600,210.5,211.2,210.5,211.2,15,3161,2,07:31:02,07:44:59');
    expect(parseGettexArchiv(csv).get('US67066G1040')).toEqual({ o: 120, h: 120, l: 120, c: 120, stueck: 2, umsatz: 240, geschaefte: 1, von: '07:35:00', bis: '07:35:00' });
  });

  it('Vollständigkeit: 62 Fenster von 07:30 bis 23:00 Berlin (Dateiname = Fensterende in UTC)', () => {
    const handel = { von: '07:30', bis: '23:00' };
    // Winterzeit: 06:45 … 22:00 UTC
    const alle = [...Array(62)].map((_, i) => new Date(Date.UTC(2026, 10, 13, 6, 45) + i * 900000).toISOString().replace(/[-T:]/g, '').slice(0, 12));
    expect(alle[0]).toBe('202611130645');
    expect(alle[61]).toBe('202611132200');
    expect(gettexTagStatus([...alle, ...alle], '2026-11-13', handel)).toEqual({ fenster: 62, erwartet: 62, vollstaendig: true, erstesEnde: '2026-11-13T06:45:00.000Z' });
    // wie am 14.11.2026 um 18 Uhr: nur noch die Fenster ab 17:15 UTC abrufbar
    expect(gettexTagStatus(alle.slice(42), '2026-11-13', handel)).toMatchObject({ fenster: 20, erwartet: 62, vollstaendig: false });
    // ein fehlendes Fenster mitten am Tag ist verschmerzbar, das letzte nicht
    expect(gettexTagStatus(alle.filter((_, i) => i !== 30), '2026-11-13', handel).vollstaendig).toBe(true);
    expect(gettexTagStatus(alle.slice(0, 61), '2026-11-13', handel).vollstaendig).toBe(false);
    // Sommerzeit: eine Stunde früher in UTC
    expect(gettexTagStatus([], '2026-07-01', handel).erstesEnde).toBe('2026-07-01T05:45:00.000Z');
  });
});

describe('US: Sammelabruf Massive (Daily Market Summary)', () => {
  const ANTWORT = {
    adjusted: false,
    queryCount: 3,
    resultsCount: 3,
    status: 'OK',
    results: [
      { T: 'NVDA', v: 182345678, vw: 141.2345, o: 140.1, c: 142.05, h: 143, l: 139.5, t: 1794603600000, n: 1234567 },
      { T: 'ZETA', v: 4500000, vw: 18.4, o: 18.1, c: 18.7, h: 18.9, l: 17.95, t: 1794603600000, n: 30111 },
      { T: 'NVSEF', v: 1200, o: 0.31, c: 0.33, h: 0.33, l: 0.3, t: 1794603600000, otc: true },
      { T: 'KAPUTT', v: 10, o: 0, c: 0, h: 0, l: 0, t: 1 },
    ],
  };

  it('liest alle Werte eines Handelstags, lässt Nullkurse weg', () => {
    const p = parseMassive(ANTWORT);
    expect(p.bereinigt).toBe(false);
    expect(p.kerzen.map((k) => k.ticker)).toEqual(['NVDA', 'ZETA', 'NVSEF']);
    expect(p.kerzen[0]).toEqual({ ticker: 'NVDA', o: 140.1, h: 143, l: 139.5, c: 142.05, v: 182345678, vw: 141.2345, n: 1234567 });
    expect(p.kerzen[2]).toMatchObject({ ticker: 'NVSEF', otc: true });
  });

  it('kein Handelstag, Fehlerantwort', () => {
    expect(parseMassive({ status: 'OK', resultsCount: 0, queryCount: 0, adjusted: false })).toEqual({ kerzen: [], bereinigt: false });
    expect(parseMassive({ status: 'ERROR', error: 'API Key was not provided' }).fehler).toBe('API Key was not provided');
    expect(parseMassive({ status: 'NOT_AUTHORIZED', message: "You are not entitled to this data." }).fehler).toMatch(/not entitled/);
    expect(parseMassive(null).fehler).toBe('keine JSON-Antwort');
  });

  it('Archivformat hin und zurück', () => {
    const csv = usCsv(parseMassive(ANTWORT).kerzen);
    expect(csv.split('\n').slice(0, 3)).toEqual(['ticker,o,h,l,c,v,vw,n,otc', 'NVDA,140.1,143,139.5,142.05,182345678,141.2345,1234567,', 'NVSEF,0.31,0.33,0.3,0.33,1200,,,1']);
    expect(parseUsArchiv(csv).get('ZETA')).toEqual({ ticker: 'ZETA', o: 18.1, h: 18.9, l: 17.95, c: 18.7, v: 4500000, vw: 18.4, n: 30111 });
    expect(parseUsArchiv(csv).get('NVSEF')?.otc).toBe(true);
  });
});

describe('Krypto: Kraken-Ticker aller Paare', () => {
  // gekürzte echte Antwort vom 14.11.2026
  const ANTWORT = {
    error: [],
    result: {
      AIXBTEUR: { a: ['0.01223000', '57136', '57136.000'], b: ['0.01183000', '24865', '24865.000'], c: ['0.01186000', '46960.50422'], v: ['263468.49828', '281747.31820'], p: ['0.01224605', '0.01228718'], t: [13, 14], l: ['0.01186000', '0.01186000'], h: ['0.01275000', '0.01288000'], o: '0.01255000' },
      TOTEUR: { a: ['0', '0', '0'], b: ['0', '0', '0'], c: ['0', '0'], v: ['0', '0'], p: ['0', '0'], t: [0, 0], l: ['0', '0'], h: ['0', '0'], o: '0' },
    },
  };

  it('Stand und 24-Stunden-Werte je Paar, Paare ohne Kurs entfallen', () => {
    const r = parseKrakenAlle(ANTWORT, { AIXBTEUR: 'AIXBT/EUR' });
    expect(r.staende).toEqual([{ paar: 'AIXBTEUR', name: 'AIXBT/EUR', letzter: 0.01186, geld: 0.01183, brief: 0.01223, hoch24: 0.01288, tief24: 0.01186, volumen24: 281747.3182, vwap24: 0.01228718, geschaefte24: 14, eroeffnung: 0.01255 }]);
    expect(kryptoCsv(r.staende).split('\n')[1]).toBe('AIXBTEUR,AIXBT/EUR,0.01186,0.01183,0.01223,0.01288,0.01186,281747.3182,0.01228718,14,0.01255');
  });

  it('Fehlerantwort', () => {
    expect(parseKrakenAlle({ error: ['EService:Unavailable'], result: {} }).fehler).toBe('EService:Unavailable');
    expect(parseKrakenAlle(null).fehler).toBe('keine JSON-Antwort');
  });
});

describe('Archiv-Stand: Tage in Folge', () => {
  it('Wochenenden und Feiertage unterbrechen die Folge nicht, ein fehlender Handelstag schon', () => {
    // Fr 13.11., Mo 16.11., Di 17.11. → drei Handelstage in Folge
    expect(tageInFolge(['2026-11-13', '2026-11-16', '2026-11-17'], istHandelstag)).toBe(3);
    // Do 12.11. fehlt → die Folge beginnt am Freitag
    expect(tageInFolge(['2026-11-11', '2026-11-13', '2026-11-16'], istHandelstag)).toBe(2);
    // Krypto: jeder Kalendertag zählt
    expect(tageInFolge(['2026-11-13', '2026-11-14', '2026-11-16'], () => true)).toBe(1);
    expect(tageInFolge([], istHandelstag)).toBe(0);
  });
});
