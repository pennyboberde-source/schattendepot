import { describe, expect, it } from 'vitest';
import universumDatei from '../config/universum.json';
import { erkenneSignalTyp, erwaehnteWerte, type UniversumWert } from './texterkennung.ts';

const u = universumDatei.werte as UniversumWert[];

describe('Zuordnung von Schlagzeilen', () => {
  it('längster Alias gewinnt, ganze Wörter', () => {
    expect(erwaehnteWerte('Siemens Energy hebt Prognose an', u).map((w) => w.ticker)).toEqual(['ENR.DE']);
    expect(erwaehnteWerte('Siemens und SAP im Plus', u).map((w) => w.ticker).sort()).toEqual(['SAP.DE', 'SIE.DE']);
    expect(erwaehnteWerte('Sapphire Rising', u)).toEqual([]);
  });
});

describe('Signal-Typ aus Schlagzeile', () => {
  it.each([
    ['Rheinmetall hebt Prognose für 2026 an', 'prognose_erhoehung', 1],
    ['Zalando senkt seine Prognose', 'prognose_senkung', -1],
    ['Nvidia raises guidance after record quarter', 'prognose_erhoehung', 1],
    ['Commerzbank: Übernahmeangebot von Unicredit', 'uebernahmeangebot', 1],
    ['Goldman stuft Infineon auf „Kaufen“ hoch', 'analysten_hochstufung', 1],
    ['Apple beats estimates on iPhone sales', 'gewinn_ueberraschung', 1],
    ['DAX schließt leicht im Plus', 'nachricht', 0],
  ])('%s → %s', (text, typ, richtung) => {
    expect(erkenneSignalTyp(text)).toEqual({ typ, richtung });
  });
});
