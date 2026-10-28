import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../../schema/entscheidung.schema.json';
import { daytradingFehler, type DaytradingWunsch } from '../entscheidung.ts';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const pruefe = ajv.compile(schema);

const sap: DaytradingWunsch = { name: 'SAP', markt: 'eu', isin: 'DE0007164600', setup: 'orb', richtung: 'beide', instrument: 'aktie', chance: 45, these: 'Zahlen vor Börsenstart, hohes Interesse' };

describe('Daytrading-Watchlist (Morgenlauf)', () => {
  it('Schema: bis 5 Einträge, Turbo-Hebel 2–10', () => {
    const e = { typ: 'morgenlauf', datum: '2026-10-29', erstellt: '2026-10-29T06:40:00Z', daytrading: [sap, { ...sap, name: 'Turbo', instrument: 'turbo', hebel: 8 }] };
    expect(pruefe(e)).toBe(true);
    expect(pruefe({ ...e, daytrading: [{ ...sap, hebel: 20 }] })).toBe(false);
    expect(pruefe({ ...e, daytrading: [sap, sap, sap, sap, sap, sap] })).toBe(false);
  });
  it('fachlich: ISIN für Aktien, Kürzel für Krypto (nur long), Level braucht Kurs', () => {
    expect(daytradingFehler(sap)).toBeNull();
    expect(daytradingFehler({ ...sap, isin: undefined })).toMatch(/ISIN/);
    expect(daytradingFehler({ ...sap, markt: 'krypto', isin: undefined, symbol: 'BTC', richtung: 'short' })).toMatch(/nur long/);
    expect(daytradingFehler({ ...sap, setup: 'level' })).toMatch(/Level/);
    expect(daytradingFehler({ ...sap, markt: 'krypto', isin: undefined, symbol: 'BTC', richtung: 'long' })).toBeNull();
  });
});
