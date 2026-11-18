import { describe, expect, it } from 'vitest';
import { aktienzahlAm, frameEinarbeiten, frameLesen, framesBis, type AktienzahlArchiv } from './aktienzahl.ts';

describe('F4: Aktienzahl aus SEC-Frames', () => {
  it('Quartals-Frames bis heute', () => {
    expect(framesBis('2024-08-01', '2025-02-10')).toEqual(['CY2024Q3I', 'CY2024Q4I', 'CY2025Q1I']);
  });

  it('Frame lesen und einarbeiten, gleicher Stichtag überschreibt', () => {
    const a: AktienzahlArchiv = { stand: '', frames: {}, je: {} };
    const e = frameLesen({ data: [{ cik: 320193, end: '2025-04-18', val: 15000000000 }, { cik: 1, end: '2025-04-30', val: 0 }] });
    expect(e).toEqual([{ cik: '320193', end: '2025-04-18', val: 15000000000 }]);
    expect(frameEinarbeiten(a, e)).toBe(1);
    expect(frameEinarbeiten(a, [{ cik: '320193', end: '2025-01-20', val: 15100000000 }, { cik: '320193', end: '2025-04-18', val: 14900000000 }])).toBe(1);
    expect(a.je['320193']).toEqual([['2025-01-20', 15100000000], ['2025-04-18', 14900000000]]);
  });

  it('gilt erst nach dem Verzug, nicht zu alt', () => {
    const l: [string, number][] = [['2025-01-20', 100], ['2025-04-18', 90]];
    expect(aktienzahlAm(l, '2025-04-20')).toBe(100);
    expect(aktienzahlAm(l, '2025-04-28')).toBe(90);
    expect(aktienzahlAm(l, '2025-01-25')).toBeNull();
    expect(aktienzahlAm(l, '2026-06-01')).toBeNull();
    expect(aktienzahlAm(undefined, '2025-04-28')).toBeNull();
  });
});
