// Privater Zustand (Lösung B, 14.11.2026): nie öffentlich schreiben, ohne Checkout nur lesen,
// die alte öffentliche Kopie erst entfernen, wenn die private aus einem früheren Lauf vorliegt.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const ordner: string[] = [];
const neuerOrdner = () => {
  const d = mkdtempSync(join(tmpdir(), 'privat-test-'));
  ordner.push(d);
  return d;
};
const schreibe = (pfad: string, inhalt: unknown) => {
  mkdirSync(join(pfad, '..'), { recursive: true });
  writeFileSync(pfad, JSON.stringify(inhalt));
};
const lies = (pfad: string) => JSON.parse(readFileSync(pfad, 'utf8'));

/** privat.ts liest PRIVAT_DIR/DATEN_DIR und den Anfangsstand beim Import – deshalb je Fall frisch laden. */
async function laden(daten: string, privat: string) {
  vi.resetModules();
  vi.stubEnv('DATEN_DIR', daten);
  vi.stubEnv('PRIVAT_DIR', privat);
  return import('./privat.ts');
}

afterEach(() => {
  vi.unstubAllEnvs();
  for (const d of ordner.splice(0)) rmSync(d, { recursive: true, force: true });
});

const eintrag = { datum: '2026-11-13', ticker: 'ABC', signalTypen: ['insider_kauf'], start: 12.5 };

describe('privater Zustand', () => {
  it('ohne Checkout: liest die alte öffentliche Datei, schreibt nichts – auch nicht öffentlich', async () => {
    const daten = neuerOrdner();
    const privat = join(neuerOrdner(), 'fehlt');
    schreibe(join(daten, 'kandidaten-tracking.json'), [eintrag]);
    const p = await laden(daten, privat);
    expect(p.privatDa()).toBe(false);
    expect(p.trackingErreichbar()).toBe(true);
    expect(p.leseTracking()).toEqual([eintrag]);
    expect(p.lesePrivat('kurse.json', { leer: true })).toEqual({ daten: { leer: true }, quelle: 'leer' });
    expect(p.schreibeTracking([])).toBe(false);
    expect(p.schreibePrivat('kurse.json', { x: 1 })).toBe(false);
    expect(lies(join(daten, 'kandidaten-tracking.json'))).toEqual([eintrag]);
    expect(existsSync(join(daten, 'kurse.json'))).toBe(false);
    expect(existsSync(privat)).toBe(false);
  });

  it('ohne Checkout und ohne öffentliche Datei ist das Schattenbuch nicht erreichbar', async () => {
    const p = await laden(neuerOrdner(), join(neuerOrdner(), 'fehlt'));
    expect(p.trackingErreichbar()).toBe(false);
    expect(p.leseTracking()).toEqual([]);
  });

  it('erster Lauf nach dem Umzug: liest öffentlich, schreibt privat und lässt die öffentliche Kopie noch stehen', async () => {
    const daten = neuerOrdner();
    const privat = neuerOrdner();
    writeFileSync(join(privat, 'LIES-MICH.md'), '# privat\n');
    schreibe(join(daten, 'kandidaten-tracking.json'), [eintrag]);
    schreibe(join(daten, 'daytrading/zustand.json'), { tag: '2026-11-13' });
    const p = await laden(daten, privat);
    expect(p.privatDa()).toBe(true);
    expect(p.lesePrivat('kandidaten-tracking.json', []).quelle).toBe('oeffentlich');
    expect(p.schreibeTracking([eintrag, { ...eintrag, ticker: 'XYZ' }] as never)).toBe(true);
    expect(p.schreibePrivat('daytrading/zustand.json', { tag: '2026-11-14' })).toBe(true);
    expect(lies(join(privat, 'kandidaten-tracking.json'))).toHaveLength(2);
    expect(lies(join(privat, 'daytrading/zustand.json'))).toEqual({ tag: '2026-11-14' });
    // Umzug noch nicht gesichert → öffentliche Kopie bleibt (falls der private Push scheitert)
    expect(existsSync(join(daten, 'kandidaten-tracking.json'))).toBe(true);
    expect(existsSync(join(daten, 'daytrading/zustand.json'))).toBe(true);
    // gelesen wird ab jetzt privat
    expect(p.lesePrivat('kandidaten-tracking.json', []).quelle).toBe('privat');
    expect(p.leseTracking()).toHaveLength(2);
  });

  it('zweiter Lauf: die private Datei lag schon beim Start vor → die öffentliche Kopie wird entfernt', async () => {
    const daten = neuerOrdner();
    const privat = neuerOrdner();
    writeFileSync(join(privat, 'LIES-MICH.md'), '# privat\n');
    schreibe(join(privat, 'kandidaten-tracking.json'), [eintrag, { ...eintrag, ticker: 'XYZ' }]);
    schreibe(join(privat, 'daytrading/zustand.json'), { tag: '2026-11-14' });
    schreibe(join(daten, 'kandidaten-tracking.json'), [eintrag]);
    schreibe(join(daten, 'daytrading/zustand.json'), { tag: '2026-11-13' });
    schreibe(join(daten, 'kurse.json'), { o1: { wert: 1 } });
    const p = await laden(daten, privat);
    expect(p.leseTracking()).toHaveLength(2);
    expect(p.schreibeTracking([eintrag] as never)).toBe(true);
    expect(p.schreibePrivat('daytrading/zustand.json', { tag: '2026-11-15' })).toBe(true);
    expect(existsSync(join(daten, 'kandidaten-tracking.json'))).toBe(false);
    expect(existsSync(join(daten, 'daytrading/zustand.json'))).toBe(false);
    // kurse.json lag beim Start noch nicht privat vor → bleibt bis zum nächsten Lauf öffentlich stehen
    expect(p.schreibePrivat('kurse.json', { o1: { wert: 2 } })).toBe(true);
    expect(existsSync(join(daten, 'kurse.json'))).toBe(true);
  });

  it('eine leere private Datei gilt als nicht vorhanden', async () => {
    const daten = neuerOrdner();
    const privat = neuerOrdner();
    writeFileSync(join(privat, 'LIES-MICH.md'), '# privat\n');
    writeFileSync(join(privat, 'kurse.json'), '  \n');
    schreibe(join(daten, 'kurse.json'), { o1: { wert: 1 } });
    const p = await laden(daten, privat);
    expect(p.lesePrivat('kurse.json', {})).toEqual({ daten: { o1: { wert: 1 } }, quelle: 'oeffentlich' });
  });
});
