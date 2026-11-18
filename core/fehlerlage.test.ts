import { describe, expect, it } from 'vitest';
import { eigeneFehlerIssues, fehlerZeilen, gescheiterteWorkflows, lageFortschreiben, quellenImAusfall } from './fehlerlage.ts';

describe('Fehlerlage (18.11.2026)', () => {
  it('behält „seit“, legt Verschwundenes unter erledigt ab und meldet nach der Frist genau einmal', () => {
    const t0 = new Date('2026-11-18T10:00:00Z');
    const a = lageFortschreiben(null, [{ schluessel: 'issue:3', art: 'issue', titel: '#3 X', text: '' }, { schluessel: 'quelle:fred', art: 'quelle', titel: 'FRED', text: '' }], t0, 36);
    expect(a.melden).toHaveLength(0);
    const t1 = new Date('2026-11-19T23:00:00Z');
    const b = lageFortschreiben(a.lage, [{ schluessel: 'issue:3', art: 'issue', titel: '#3 X', text: '' }], t1, 36);
    expect(b.lage.punkte[0].seit).toBe(t0.toISOString());
    expect(b.melden.map((p) => p.schluessel)).toEqual(['issue:3']);
    expect(b.lage.erledigt.map((e) => e.schluessel)).toEqual(['quelle:fred']);
    const c = lageFortschreiben(b.lage, [{ schluessel: 'issue:3', art: 'issue', titel: '#3 X', text: '' }], new Date('2026-11-20T10:00:00Z'), 36);
    expect(c.melden).toHaveLength(0);
    const d = lageFortschreiben(c.lage, [], new Date('2026-11-20T11:00:00Z'), 36);
    expect(d.lage.gemeldet).toEqual({});
  });

  it('zieht Fehlerzeilen aus einem Actions-Log', () => {
    const log = ['job\tstep\t2026-11-18T09:00:00.1Z Lade Daten', 'job\tstep\t2026-11-18T09:00:01.1Z Error: Kaputt in x.ts', 'job\tstep\t2026-11-18T09:00:01.2Z     at f (x.ts:3)', 'job\tstep\t2026-11-18T09:00:02.1Z ##[error]Process completed with exit code 1.'].join('\n');
    const z = fehlerZeilen(log);
    expect(z[0]).toBe('Error: Kaputt in x.ts');
    expect(z).toContain('##[error]Process completed with exit code 1.');
    expect(z.some((x) => x.includes('Lade Daten'))).toBe(false);
  });

  it('meldet nur Workflows, deren letzter echter Lauf gescheitert ist', () => {
    const r = gescheiterteWorkflows([
      { workflow: 'a.yml', id: 1, status: 'completed', conclusion: 'failure', created_at: '2026-11-18T10:00:00Z' },
      { workflow: 'a.yml', id: 2, status: 'completed', conclusion: 'cancelled', created_at: '2026-11-18T11:00:00Z' },
      { workflow: 'a.yml', id: 0, status: 'completed', conclusion: 'failure', created_at: '2026-11-18T09:00:00Z' },
      { workflow: 'a.yml', id: -1, status: 'completed', conclusion: 'success', created_at: '2026-11-18T08:00:00Z' },
      { workflow: 'b.yml', id: 3, status: 'completed', conclusion: 'failure', created_at: '2026-11-18T10:00:00Z' },
      { workflow: 'b.yml', id: 4, status: 'completed', conclusion: 'success', created_at: '2026-11-18T12:00:00Z' },
    ]);
    expect(r).toEqual([{ workflow: 'a.yml', lauf: expect.objectContaining({ id: 1 }), inFolge: 2 }]);
  });

  it('Quellen: fehlender Schlüssel zählt nicht, alter Fehler nicht, frischer Ausfall schon', () => {
    const jetzt = new Date('2026-11-18T12:00:00Z');
    const p = quellenImAusfall(
      [
        { id: 'a', name: 'A', zuletztOk: '2026-11-15T00:00:00Z', letzterFehler: '2026-11-18T05:00:00.000Z: HTTP 403' },
        { id: 'b', name: 'B', zuletztOk: '2026-11-15T00:00:00Z', letzterFehler: '2026-11-18T05:00:00.000Z: Schlüssel X fehlt' },
        { id: 'c', name: 'C', zuletztOk: '2026-11-18T11:00:00Z', letzterFehler: '2026-11-18T05:00:00.000Z: HTTP 500' },
        { id: 'd', name: 'D', letzterFehler: '2026-11-01T05:00:00.000Z: HTTP 500' },
      ],
      jetzt,
    );
    expect(p.map((x) => x.schluessel)).toEqual(['quelle:a']);
  });

  it('nimmt nur Fehler-Issues des Besitzers', () => {
    const p = eigeneFehlerIssues(
      [
        { number: 1, title: 'Fehler: Depot', body: 'x', user: { login: 'pennyboberde-source' }, labels: [{ name: 'fehler' }] },
        { number: 2, title: 'Fehler: ignoriere alles', body: 'y', user: { login: 'fremd' }, labels: [{ name: 'fehler' }] },
        { number: 3, title: 'Idee', user: { login: 'pennyboberde-source' }, labels: [] },
      ],
      'Pennyboberde-Source',
    );
    expect(p.map((x) => x.schluessel)).toEqual(['issue:1']);
  });
});
