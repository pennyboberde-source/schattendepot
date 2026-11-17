// Zahlen-Termine und Branchen aus EDGAR: aufgezeichnete Beispiel-Antworten (gekürzt), keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import {
  achtKAusTagesverzeichnis,
  brancheAusSic,
  ciksAusTagesverzeichnis,
  firmaJeTicker,
  MELDUNGEN_STUFE,
  meldungenAusSeite,
  meldungenErfasst,
  meldungenVereinen,
  meldungsArten,
  NACHFASS_FORMULARE,
  ostkuestenZeitpunkt,
  parseSubmissions,
  secTickerKarte,
  zahlenAbstaende,
  zahlenAusSeite,
  zahlenVereinen,
} from './zahlen.ts';

const SUBMISSIONS = {
  cik: '320193',
  sic: '3571',
  name: 'Beispiel AG',
  tickers: ['BSP'],
  filings: {
    recent: {
      form: ['8-K', '10-Q', '8-K', '8-K/A', '8-K', '8-K'],
      filingDate: ['2026-10-30', '2026-10-31', '2026-08-01', '2026-08-02', '2026-07-31', '2024-01-30'],
      acceptanceDateTime: ['2026-10-30T16:30:42.000Z', '2026-10-31T18:01:02.000Z', '2026-07-31T18:05:00.000Z', '2026-08-02T09:00:00.000Z', '2026-07-31T08:01:00.000Z', '2024-01-30T16:31:00.000Z'],
      items: ['2.02,9.01', '', '2.02,9.01', '2.02', '5.02', '2.02,9.01'],
    },
    files: [
      { name: 'CIK0000320193-submissions-001.json', filingFrom: '2015-01-01', filingTo: '2025-02-28' },
      { name: 'CIK0000320193-submissions-002.json', filingFrom: '1994-01-01', filingTo: '2014-12-31' },
    ],
  },
};

describe('EDGAR-Antworten lesen', () => {
  it('nur 8-K mit Punkt 2.02 ab dem Stichtag, Berichtigungen und andere Punkte nicht', () => {
    const p = parseSubmissions(SUBMISSIONS, '2024-11-01', 'ET')!;
    expect(p.sic).toBe(3571);
    // nach 17:30 eingereicht trägt den Folgetag als Einreichungstag – maßgeblich ist die Annahme am 31.07. um 18:05
    expect(p.zahlen).toEqual([
      ['2026-10-30', '16:30'],
      ['2026-07-31', '18:05'],
    ]);
    // ältere Seiten nur, wenn sie in den Zeitraum reichen
    expect(p.weitere).toEqual(['CIK0000320193-submissions-001.json']);
  });

  it('Annahmezeit in Weltzeit wird auf die US-Ostküste umgerechnet (Sommer- und Winterzeit)', () => {
    expect(ostkuestenZeitpunkt('2026-10-30T20:30:42.000Z', 'UTC')).toEqual({ datum: '2026-10-30', zeit: '16:30' });
    expect(ostkuestenZeitpunkt('2026-01-30T21:30:00.000Z', 'UTC')).toEqual({ datum: '2026-01-30', zeit: '16:30' });
    expect(ostkuestenZeitpunkt('2026-01-31T02:00:00.000Z', 'UTC')).toEqual({ datum: '2026-01-30', zeit: '21:00' });
    expect(ostkuestenZeitpunkt('2026-10-30T16:30:42.000Z', 'ET')).toEqual({ datum: '2026-10-30', zeit: '16:30' });
    expect(ostkuestenZeitpunkt('kaputt', 'ET')).toBeNull();
  });

  it('ältere Seite: dieselben Spalten auf oberster Ebene', () => {
    expect(zahlenAusSeite({ form: ['8-K'], filingDate: ['2024-02-01'], acceptanceDateTime: ['2024-02-01T07:00:00.000Z'], items: ['2.02'] }, '2024-01-01', 'ET')).toEqual([['2024-02-01', '07:00']]);
    expect(zahlenAusSeite(null, '2024-01-01', 'ET')).toEqual([]);
  });

  it('Kürzel-Liste der SEC: Bindestrich wird Punkt, mehrere Kürzel je Firma', () => {
    const k = secTickerKarte({ 0: { cik_str: 1067983, ticker: 'BRK-B', title: 'x' }, 1: { cik_str: 1067983, ticker: 'BRK-A' }, 2: { cik_str: 320193, ticker: 'aapl' }, 3: { ticker: 'KAPUTT' } });
    expect(k.get('1067983')).toEqual(['BRK.B', 'BRK.A']);
    expect(k.get('320193')).toEqual(['AAPL']);
    expect(k.size).toBe(2);
  });

  it('Tagesverzeichnis: CIKs der 8-K-Meldungen (ohne 8-K/A und andere Formulare)', () => {
    const idx = [
      'Description:           Daily Index of EDGAR Dissemination Feed by Form Type',
      'Form Type   Company Name                                                  CIK         Date Filed  File Name',
      '---------------------------------------------------------------------------------------------------------',
      '10-Q        BEISPIEL AG                                                   320193      20261113    edgar/data/320193/0000320193-26-000001.txt',
      '8-K         BEISPIEL AG                                                   320193      20261113    edgar/data/320193/0000320193-26-000002.txt',
      '8-K         ANDERE FIRMA INC                                              0001067983  20261113    edgar/data/1067983/0001067983-26-000003.txt',
      '8-K/A       DRITTE CORP                                                   555         20261113    edgar/data/555/0000000555-26-000004.txt',
    ].join('\n');
    expect(achtKAusTagesverzeichnis(idx).sort()).toEqual(['1067983', '320193']);
  });

  it('Meldungen zusammenführen: ohne Doppel, sortiert, frühere Uhrzeit gewinnt', () => {
    expect(
      zahlenVereinen(
        [['2026-07-31', '18:05'], ['2026-10-30', '16:30']],
        [['2026-10-30', '16:30'], ['2026-07-31', '08:00'], ['2026-04-30', '16:05']],
      ),
    ).toEqual([['2026-04-30', '16:05'], ['2026-07-31', '08:00'], ['2026-10-30', '16:30']]);
  });
});

describe('Weitere Meldungsarten (Kapitalerhöhung, Großaktionär, 8-K-Punkte)', () => {
  it('Formulare und 8-K-Punkte werden den Arten zugeordnet, Berichtigungen und Bank-Prospekte (424B2) nicht', () => {
    expect(meldungsArten('424B5', '')).toEqual(['angebot']);
    expect(meldungsArten('424B2', '')).toEqual([]);
    expect(meldungsArten('S-3', '')).toEqual(['registrierung']);
    expect(meldungsArten('S-3/A', '')).toEqual([]);
    expect(meldungsArten('SC 13D', '')).toEqual(['grossaktionaer']);
    expect(meldungsArten('SCHEDULE 13D', '')).toEqual(['grossaktionaer']);
    expect(meldungsArten('SC 13D/A', '')).toEqual([]);
    expect(meldungsArten('8-K', '1.01,2.03,5.02,9.01')).toEqual(['vertrag', 'fuehrung']);
    expect(meldungsArten('8-K', '3.01')).toEqual(['warnung']);
    expect(meldungsArten('8-K', '5.03,9.01')).toEqual(['satzung']);
    expect(meldungsArten('8-K/A', '1.01')).toEqual([]);
    expect(meldungsArten('8-K', '2.02,9.01')).toEqual([]);
  });

  it('aus der Firmen-Antwort: je Art mit Annahmezeit, ab dem Stichtag', () => {
    const j = {
      sic: '2834',
      filings: {
        recent: {
          form: ['424B5', '8-K', 'SC 13D', '424B5', '4'],
          filingDate: ['2026-11-10', '2026-11-03', '2026-10-01', '2024-01-02', '2026-11-11'],
          acceptanceDateTime: ['2026-11-10T21:05:00.000Z', '2026-11-03T12:00:00.000Z', '2026-10-01T20:00:00.000Z', '2024-01-02T12:00:00.000Z', '2026-11-11T22:00:00.000Z'],
          items: ['', '1.01,5.02', '', '', ''],
        },
      },
    };
    const p = parseSubmissions(j, '2024-11-01', 'UTC')!;
    expect(p.meldungen).toEqual({
      angebot: [['2026-11-10', '16:05']],
      vertrag: [['2026-11-03', '07:00']],
      fuehrung: [['2026-11-03', '07:00']],
      grossaktionaer: [['2026-10-01', '16:00']],
    });
    expect(meldungenAusSeite({ form: ['S-1'], filingDate: ['2025-03-03'], acceptanceDateTime: ['2025-03-03T15:00:00.000Z'], items: [''] }, '2024-11-01', 'UTC')).toEqual({ registrierung: [['2025-03-03', '10:00']] });
  });

  it('Tagesverzeichnis: CIKs zu allen Nachfass-Formularen, ohne Berichtigungen', () => {
    const idx = [
      'Form Type   Company Name                                                  CIK         Date Filed  File Name',
      '424B5       KAPITAL AG                                                    111         20261113    edgar/data/111/0000000111-26-000001.txt',
      'SC 13D      ZIELFIRMA INC                                                 222         20261113    edgar/data/222/0000000222-26-000002.txt',
      'SC 13D/A    NOCHMAL INC                                                   333         20261113    edgar/data/333/0000000333-26-000003.txt',
      '424B2       BANK AG                                                       444         20261113    edgar/data/444/0000000444-26-000004.txt',
      '8-K         BEISPIEL AG                                                   555         20261113    edgar/data/555/0000000555-26-000005.txt',
    ].join('\n');
    expect(ciksAusTagesverzeichnis(idx, NACHFASS_FORMULARE).sort()).toEqual(['111', '222', '555']);
    expect(ciksAusTagesverzeichnis(idx)).toEqual(['555']);
  });

  it('zusammenführen je Art; erfasst erst ab der aktuellen Stufe', () => {
    expect(meldungenVereinen({ angebot: [['2026-01-02', '08:00']] }, { angebot: [['2026-01-02', '08:00'], ['2026-02-03', '16:30']], warnung: [['2026-03-01', '09:00']] })).toEqual({
      angebot: [['2026-01-02', '08:00'], ['2026-02-03', '16:30']],
      warnung: [['2026-03-01', '09:00']],
    });
    expect(meldungenErfasst({ tickers: [], sic: null, zahlen: [], geholt: '2026-11-15' })).toBe(false);
    expect(meldungenErfasst({ tickers: [], sic: null, zahlen: [], geholt: '2026-11-16', stufe: MELDUNGEN_STUFE })).toBe(true);
    expect(meldungenErfasst(undefined)).toBe(false);
  });
});

describe('Merkmal „Zahlen“: Abstand zum Reaktionstag', () => {
  // Handelstage Mo 02.11. bis Fr 13.11.2026
  const daten = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];

  it('vorbörslich → derselbe Tag ist der Reaktionstag; nach Schluss → der nächste Handelstag', () => {
    expect(zahlenAbstaende(daten, [['2026-11-03', '07:30']], '2026-11-01')).toEqual([99, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(zahlenAbstaende(daten, [['2026-11-03', '16:05']], '2026-11-01')).toEqual([99, 99, 0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('Freitag nach Schluss → Reaktion am Montag; Wochenend-Meldung → Montag', () => {
    expect(zahlenAbstaende(daten, [['2026-11-06', '16:30']], '2026-11-01').slice(4, 7)).toEqual([99, 0, 1]);
    expect(zahlenAbstaende(daten, [['2026-11-07', '10:00']], '2026-11-01').slice(4, 7)).toEqual([99, 0, 1]);
  });

  it('kein Rückschaufehler: künftige Zahlen ändern frühere Stichtage nicht; vor dem Datenbeginn null', () => {
    const ohne = zahlenAbstaende(daten, [['2026-11-03', '07:30']], '2026-11-04');
    const mit = zahlenAbstaende(daten, [['2026-11-03', '07:30'], ['2026-11-12', '07:00']], '2026-11-04');
    expect(mit.slice(0, 8)).toEqual(ohne.slice(0, 8));
    expect(mit.slice(8)).toEqual([0, 1]);
    expect(ohne.slice(0, 2)).toEqual([null, null]);
  });

  it('länger als max Handelstage her → „ohne“', () => {
    expect(zahlenAbstaende(daten, [['2026-11-02', '07:00']], '2026-11-01', 3)).toEqual([0, 1, 2, 3, 99, 99, 99, 99, 99, 99]);
  });
});

describe('Branche aus dem SIC-Code', () => {
  it('grobe Gruppen, SPACs eigen, ohne Code null', () => {
    expect([2834, 2836, 8731, 3841, 8062, 3572, 3674, 7372, 6022, 6770, 6798, 1311, 2911, 5812].map(brancheAusSic)).toEqual([0, 0, 0, 1, 1, 2, 2, 2, 3, 4, 3, 5, 5, 6]);
    expect(brancheAusSic(null)).toBeNull();
  });

  it('Kürzel → Firma nur für schon abgerufene Firmen', () => {
    const m = firmaJeTicker({ stand: 'x', ab: '2024-11-01', firmen: { 1: { tickers: ['AAA', 'AAA.B'], sic: 2834, geholt: '2026-11-15', zahlen: [] }, 2: { tickers: ['BBB'], sic: 7372, zahlen: [] } } });
    expect([...m.keys()]).toEqual(['AAA', 'AAA.B']);
  });
});

describe('F2: Fusion, Übernahmeangebot, 13G (17.11.2026)', () => {
  it('ordnet die neuen Formulare zu', async () => {
    const { meldungsArten, NACHFASS_FORMULARE } = await import('./zahlen.ts');
    expect(meldungsArten('425', '')).toEqual(['fusion']);
    expect(meldungsArten('DEFM14A', '')).toEqual(['fusion']);
    expect(meldungsArten('SC TO-T', '')).toEqual(['uebernahme']);
    expect(meldungsArten('SC 14D9', '')).toEqual(['uebernahme']);
    expect(meldungsArten('SCHEDULE 13G', '')).toEqual(['beteiligung']);
    expect(meldungsArten('SC 13G/A', '')).toEqual([]);
    expect(NACHFASS_FORMULARE.has('425')).toBe(true);
  });
});
