// Leerverkaufsvolumen (FINRA): aufgezeichnete Beispielzeilen (gekürzt), keine echten Abrufe.
import { describe, expect, it } from 'vitest';
import { finraDatei, leerquotenAusCsv, leerquotenReihe, leerverkaufCsv, parseFinraShvol } from './leerverkauf.ts';

const FINRA = ['Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market', '20261113|A|316826.314547|259|553450.606448|B,Q,N', '20261113|BRK B|1000|0|4000|N', '20261113|NULL|5|0|0|Q', 'kaputt', ''].join('\n');

describe('FINRA-Leerverkaufsdatei', () => {
  it('lesen: Kürzel wie bei Massive, Zeilen ohne Umsatz weg', () => {
    const m = parseFinraShvol(FINRA);
    expect([...m.keys()]).toEqual(['A', 'BRK.B']);
    expect(m.get('BRK.B')).toEqual({ short: 1000, total: 4000 });
  });
  it('kompakt ins Archiv und zurück als Anteil in %', () => {
    const csv = leerverkaufCsv(parseFinraShvol(FINRA));
    expect(csv).toBe('kuerzel,leerverkauf,umsatz\nA,316826,553451\nBRK.B,1000,4000\n');
    const q = leerquotenAusCsv(csv);
    expect(q.get('A')).toBe(57.2);
    expect(q.get('BRK.B')).toBe(25);
  });
  it('Dateiname', () => {
    expect(finraDatei('2026-11-13')).toBe('CNMSshvol20261113.txt');
  });
});

describe('Merkmale je Stichtag', () => {
  it('Anteil am Tag, Abweichung vom Schnitt der Vortage erst ab 10 Vortagen, Lücken bleiben null', () => {
    const daten = Array.from({ length: 13 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
    const werte = new Map(daten.map((d, i) => [d, i === 11 ? 70 : i === 5 ? undefined : 40]));
    const r = leerquotenReihe(daten, (d) => werte.get(d));
    expect(r.quote[5]).toBeNull();
    expect(r.abweichung[9]).toBeNull(); // 8 Vortage mit Daten
    expect(r.abweichung[10]).toBeNull(); // 9 Vortage mit Daten (einer fehlt)
    expect(r.abweichung[11]).toBe(30); // 10 Vortage mit Ø 40
    expect(r.abweichung[12]).toBe(-2.7); // Ø der Vortage jetzt mit der 70 darin
  });
});
