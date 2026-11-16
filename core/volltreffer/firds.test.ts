import { describe, expect, it } from 'vitest';
import { FirdsLeser, HebelZaehler, hebelDa, produktLesen } from './firds.ts';

// Aufbau wie ein FIRDS-Datensatz (Klasse R), Werte erfunden
const satz = (isin: string, mic: string, typ: string, basis = 'US0000000001', zusatz = '') =>
  `<RefData><FinInstrmGnlAttrbts><Id>${isin}</Id><FullNm>TEST TURBO</FullNm><ClssfctnTp>RFBTPB</ClssfctnTp></FinInstrmGnlAttrbts><Issr>X</Issr><TradgVnRltdAttrbts><Id>${mic}</Id><IssrReq>true</IssrReq>${zusatz}</TradgVnRltdAttrbts><DerivInstrmAttrbts><UndrlygInstrm><Sngl><ISIN>${basis}</ISIN></Sngl></UndrlygInstrm><OptnTp>${typ}</OptnTp></DerivInstrmAttrbts></RefData>`;

describe('FIRDS: Hebelprodukte je Basiswert', () => {
  it('liest Richtung, Basiswert und Platz; gekündigte und abgelaufene Produkte zählen nicht', () => {
    expect(produktLesen(satz('DE000AAA0001', 'MUND', 'PUTO'), '2026-11-16')).toEqual({ isin: 'DE000AAA0001', basis: 'US0000000001', richtung: 'short', mic: 'MUND' });
    expect(produktLesen(satz('DE000AAA0002', 'MUND', 'CALL'), '2026-11-16')?.richtung).toBe('long');
    expect(produktLesen(satz('DE000AAA0003', 'MUND', 'OTHR'), '2026-11-16')).toBeNull();
    expect(produktLesen(satz('DE000AAA0004', 'MUND', 'PUTO', 'US0000000001', '<TermntnDt>2026-11-10T22:00:00Z</TermntnDt>'), '2026-11-16')).toBeNull();
    expect(produktLesen(satz('DE000AAA0005', 'MUND', 'PUTO', 'US0000000001', '<TermntnDt>2026-12-31T22:00:00Z</TermntnDt>'), '2026-11-16')).not.toBeNull();
    expect(produktLesen(satz('DE000AAA0006', 'MUND', 'PUTO').replace('</UndrlygInstrm>', '</UndrlygInstrm><XpryDt>2026-11-01</XpryDt>'), '2026-11-16')).toBeNull();
  });

  it('Datenstrom in beliebigen Stücken (Datensätze über Stückgrenzen hinweg)', () => {
    const text = satz('DE000AAA0001', 'MUND', 'PUTO') + satz('DE000AAA0002', 'STUB', 'CALL') + satz('DE000AAA0003', 'MUND', 'CALL', 'US0000000002');
    const l = new FirdsLeser('2026-11-16');
    const aus = [...l.teil(text.slice(0, 100)), ...l.teil(text.slice(100, 455)), ...l.teil(text.slice(455))];
    expect(aus.map((p) => p.isin)).toEqual(['DE000AAA0001', 'DE000AAA0002', 'DE000AAA0003']);
  });

  it('zählt gettex und andere Börsen getrennt (ein Produkt steht je Platz einmal)', () => {
    const z = new HebelZaehler('MUND', new Set(['STUB', 'STUH', 'FRAB']));
    const l = new FirdsLeser('2026-11-16');
    for (const p of l.teil(satz('A1', 'MUND', 'PUTO') + satz('A1XXXXXXXXXX', 'STUB', 'PUTO') + satz('A2XXXXXXXXXX', 'STUB', 'PUTO') + satz('A2XXXXXXXXXX', 'STUH', 'PUTO') + satz('A3XXXXXXXXXX', 'XXXX', 'CALL'))) z.add(p);
    // A1 ist zu kurz (keine ISIN) → zählt nicht; STUB 2 Puts, STUH 1 → größter Einzelplatz 2
    expect(z.ergebnis()).toEqual({ US0000000001: { l: [0, 0], s: [0, 2] } });
    const e = z.ergebnis().US0000000001;
    expect(hebelDa(e, 'short', true)).toBe(false);
    expect(hebelDa(e, 'short', false)).toBe(true);
    expect(hebelDa(undefined, 'long', false)).toBe(false);
  });
});
