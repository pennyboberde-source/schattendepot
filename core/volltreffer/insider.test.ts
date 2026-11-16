// Insider-Käufe (SEC Formular 4): aufgezeichnete Beispiel-Ausschnitte (gekürzt), keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { formular4Dateien, kaeufeAusDatensatz, kaeufeVereinen, kaufAusMeldung, kuerzelNormal, quartaleZwischen, quartalsEnde, quartalVon, secDatum } from './insider.ts';

const SUB = ['ACCESSION_NUMBER\tFILING_DATE\tPERIOD_OF_REPORT\tDOCUMENT_TYPE\tISSUERCIK\tISSUERNAME\tISSUERTRADINGSYMBOL', '0001-26-1\t02-SEP-2026\t29-AUG-2026\t4\t111\tKAUF AG\tKAUF', '0001-26-2\t03-SEP-2026\t01-SEP-2026\t4\t222\tVERKAUF AG\tVERK', '0001-26-3\t04-SEP-2026\t02-SEP-2026\t4/A\t111\tKAUF AG\tKAUF', '0001-26-4\t05-SEP-2026\t03-SEP-2026\t4\t333\tKLEIN AG\tKLEIN'].join('\n');
const TRANS = ['ACCESSION_NUMBER\tNONDERIV_TRANS_SK\tSECURITY_TITLE\tTRANS_DATE\tTRANS_CODE\tTRANS_SHARES\tTRANS_PRICEPERSHARE\tTRANS_ACQUIRED_DISP_CD', '0001-26-1\t1\tCommon\t29-AUG-2026\tP\t10000\t5.5\tA', '0001-26-1\t2\tCommon\t29-AUG-2026\tP\t2000\t5.6\tA', '0001-26-2\t3\tCommon\t01-SEP-2026\tS\t50000\t9\tD', '0001-26-3\t4\tCommon\t02-SEP-2026\tP\t99999\t9\tA', '0001-26-4\t5\tCommon\t03-SEP-2026\tP\t100\t3\tA'].join('\n');

describe('Quartals-Datensatz', () => {
  it('nur Formular 4 mit Kaufcode P und „erworben“, je Meldung summiert, ab Mindestwert; ohne Uhrzeit = nach Schluss', () => {
    const { kaeufe, fehlt } = kaeufeAusDatensatz(SUB, TRANS);
    expect(fehlt).toEqual([]);
    expect([...kaeufe]).toEqual([['KAUF', [['2026-09-02', '17:00', 66200]]]]);
  });
  it('fehlende Spalten werden gemeldet statt still falsch gelesen', () => {
    expect(kaeufeAusDatensatz('A\tB\n1\t2', TRANS).fehlt).toContain('SUBMISSION.FILING_DATE');
  });
  it('Datumsformate und Kürzel', () => {
    expect(secDatum('02-SEP-2026')).toBe('2026-09-02');
    expect(secDatum('2026-09-02 00:00:00')).toBe('2026-09-02');
    expect(secDatum('kaputt')).toBeNull();
    expect(kuerzelNormal('brk-b')).toBe('BRK.B');
    expect(kuerzelNormal('ABC, ABCW')).toBe('ABC');
    expect(kuerzelNormal('NONE')).toBeNull();
  });
});

const MELDUNG = `<SEC-DOCUMENT>0001-26-9.txt : 20261113
<SEC-HEADER>0001-26-9.hdr.sgml : 20261113
<ACCEPTANCE-DATETIME>20261113163005
ACCESSION NUMBER:		0001-26-9
CONFORMED SUBMISSION TYPE:	4
</SEC-HEADER>
<DOCUMENT><TYPE>4<TEXT><XML>
<ownershipDocument>
<issuer><issuerCik>0000111</issuerCik><issuerName>Kauf AG</issuerName><issuerTradingSymbol>KAUF</issuerTradingSymbol></issuer>
<nonDerivativeTable>
<nonDerivativeTransaction><transactionCoding><transactionFormType>4</transactionFormType><transactionCode>P</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>20000</value></transactionShares><transactionPricePerShare><value>2.50</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
<nonDerivativeTransaction><transactionCoding><transactionCode>S</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>3</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
</nonDerivativeTable></ownershipDocument></XML></TEXT></DOCUMENT></SEC-DOCUMENT>`;

describe('Einzelne Formular-4-Meldung', () => {
  it('Kauf mit Annahmezeit, Verkäufe zählen nicht', () => {
    expect(kaufAusMeldung(MELDUNG)).toEqual({ kuerzel: 'KAUF', datum: '2026-11-13', zeit: '16:30', wert: 50000 });
  });
  it('zu klein, kein Formular 4 oder ohne Kauf → null', () => {
    expect(kaufAusMeldung(MELDUNG, 60000)).toBeNull();
    expect(kaufAusMeldung(MELDUNG.replace('SUBMISSION TYPE:\t4', 'SUBMISSION TYPE:\t4/A'))).toBeNull();
    expect(kaufAusMeldung(MELDUNG.replace('<transactionCode>P', '<transactionCode>M'))).toBeNull();
  });
  it('Tagesverzeichnis: Dateien der Formular-4-Meldungen', () => {
    const idx = ['4           KAUF AG                                                       111         20261113    edgar/data/111/0001-26-9.txt', '4/A         KAUF AG                                                       111         20261113    edgar/data/111/0001-26-8.txt', '8-K         KAUF AG                                                       111         20261113    edgar/data/111/0001-26-7.txt', '4           NOCHMAL                                                       222         20261113    edgar/data/111/0001-26-9.txt'].join('\n');
    expect(formular4Dateien(idx)).toEqual(['edgar/data/111/0001-26-9.txt']);
  });
});

describe('Zusammenführen und Quartale', () => {
  it('je Kürzel und Tag ein Eintrag (größter Wert, früheste Zeit) – wiederholbar', () => {
    const a = kaeufeVereinen({ KAUF: [['2026-09-02', '17:00', 66200]] }, new Map([['KAUF', [['2026-09-02', '16:30', 50000] as [string, string, number], ['2026-09-10', '09:00', 20000] as [string, string, number]]]]));
    expect(a.KAUF).toEqual([['2026-09-02', '16:30', 66200], ['2026-09-10', '09:00', 20000]]);
    expect(kaeufeVereinen(a, { KAUF: a.KAUF })).toEqual(a);
  });
  it('Quartale', () => {
    expect(quartalVon('2026-11-16')).toBe('2026q4');
    expect(quartaleZwischen('2024-11-10', '2025-04-01')).toEqual(['2024q4', '2025q1', '2025q2']);
    expect(quartalsEnde('2026q3')).toBe('2026-09-30');
  });
});
