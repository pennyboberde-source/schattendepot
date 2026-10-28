import { describe, expect, it } from 'vitest';
import { phaseAm, phaseBerechnen, phaseText } from './marktphase.ts';

/** Kursreihe mit fester täglicher Rendite und optionalem Zickzack (Schwankung) */
const reihe = (n: number, r: number, zick = 0, ab = 0) => [...Array(n)].map((_, i) => 100 * (1 + r) ** i * (i >= ab && i % 2 ? 1 + zick : 1));

describe('Marktphase', () => {
  it('Aufwärts und ruhig bei stetigem Anstieg', () => {
    const p = phaseBerechnen(reihe(260, 0.002, 0.001), '2026-10-28')!;
    expect(p).toMatchObject({ trend: 'aufwaerts', unruhe: 'ruhig', phase: 'aufwaerts_ruhig' });
    expect(p.sma200).toBeDefined();
  });
  it('Abwärts und nervös, wenn zuletzt die Schwankung stark steigt', () => {
    const p = phaseBerechnen(reihe(260, -0.002, 0.03, 240), '2026-10-28')!;
    expect(p.trend).toBe('abwaerts');
    expect(p.unruhe).toBe('nervoes');
    expect(phaseText(p.phase)).toBe('Abwärts, nervös');
  });
  it('zu wenig Kurse → keine Phase; Verlauf liefert die zuletzt gültige Phase', () => {
    expect(phaseBerechnen(reihe(40, 0.001), 'x')).toBeNull();
    const v = { '2026-10-26': { aktien: 'aufwaerts_ruhig' }, '2026-10-28': { aktien: 'abwaerts_nervoes', krypto: 'seitwaerts_ruhig' } };
    expect(phaseAm(v, '2026-10-27', 'aktien')).toBe('aufwaerts_ruhig');
    expect(phaseAm(v, '2026-10-29', 'krypto')).toBe('seitwaerts_ruhig');
    expect(phaseAm(v, '2026-10-25', 'aktien')).toBeUndefined();
  });
});
