import { describe, expect, it } from 'vitest';
import { istBiotech, sponsorName, studienLesen, tageBisStudie } from './studien.ts';

describe('F3: Studien-Termine', () => {
  it('Biotech nach SIC, Sponsorname ohne Rechtsform', () => {
    expect(istBiotech(2834)).toBe(true);
    expect(istBiotech(3842)).toBe(true);
    expect(istBiotech(7372)).toBe(false);
    expect(sponsorName('Viking Therapeutics, Inc.')).toBe('Viking Therapeutics');
    expect(sponsorName('ACME HOLDINGS CORP')).toBe('ACME');
  });

  it('liest nur Phase 2/3 mit Termin', () => {
    const s = studienLesen({
      studies: [
        { protocolSection: { identificationModule: { nctId: 'NCT1' }, statusModule: { overallStatus: 'RECRUITING', primaryCompletionDateStruct: { date: '2027-01', type: 'ESTIMATED' } }, designModule: { phases: ['PHASE2'] } } },
        { protocolSection: { identificationModule: { nctId: 'NCT2' }, statusModule: { overallStatus: 'COMPLETED', primaryCompletionDateStruct: { date: '2025-03-01', type: 'ACTUAL' } }, designModule: { phases: ['PHASE1'] } } },
      ],
    });
    expect(s).toEqual([{ nct: 'NCT1', phase: 'PHASE2', status: 'RECRUITING', ende: '2027-01', endeArt: 'erwartet' }]);
    expect(tageBisStudie(s, '2026-11-18')).toBe(58);
    expect(tageBisStudie(s, '2026-01-01')).toBeNull();
    expect(tageBisStudie([{ ...s[0], status: 'COMPLETED' }], '2026-11-18')).toBeNull();
  });
});
