import { describe, expect, it } from 'vitest';
import { haltefristFortschreiben } from './haltefrist.ts';

describe('Haltefrist im Vorwärtstest', () => {
  it('zählt verfehlte Tage in Folge, ein bestandener Tag setzt zurück, gleicher Tag zählt einmal', () => {
    let h = haltefristFortschreiben({ verfehlt: {} }, ['a', 'b'], ['a'], '2026-11-17');
    expect(h.verfehlt).toEqual({ a: ['2026-11-17'] });
    h = haltefristFortschreiben(h, ['a', 'b'], ['a', 'b'], '2026-11-17');
    expect(h.verfehlt).toEqual({ a: ['2026-11-17'], b: ['2026-11-17'] });
    h = haltefristFortschreiben(h, ['a', 'b'], ['a'], '2026-11-18');
    expect(h.verfehlt).toEqual({ a: ['2026-11-17', '2026-11-18'] });
    h = haltefristFortschreiben(h, ['b'], ['b'], '2026-11-19');
    expect(h.verfehlt).toEqual({ b: ['2026-11-19'] });
  });
});
