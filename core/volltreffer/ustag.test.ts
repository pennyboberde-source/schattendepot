import { describe, expect, it } from 'vitest';
import { erwarteterUsTag } from './ustag.ts';

describe('erwarteterUsTag', () => {
  it('nimmt den letzten Werktag vor heute (UTC)', () => {
    expect(erwarteterUsTag(new Date('2026-11-24T05:45:00Z'), new Set())).toBe('2026-11-23'); // Di → Mo
    expect(erwarteterUsTag(new Date('2026-11-23T05:45:00Z'), new Set())).toBe('2026-11-20'); // Mo → Fr
    expect(erwarteterUsTag(new Date('2026-11-22T05:45:00Z'), new Set())).toBe('2026-11-20'); // So → Fr
  });
  it('überspringt NYSE-Feiertage', () => {
    expect(erwarteterUsTag(new Date('2026-11-27T05:45:00Z'), new Set(['2026-11-26']))).toBe('2026-11-25'); // Thanksgiving
  });
});
