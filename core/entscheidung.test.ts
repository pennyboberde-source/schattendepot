import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { describe, expect, it } from 'vitest';
import schema from '../schema/entscheidung.schema.json';
import { ordersAusEreignissen } from './ableiten.ts';
import { entscheidungUebernehmen, type Entscheidung } from './entscheidung.ts';
import type { OrderPlan } from './typen.ts';

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);
const pruefe = ajv.compile(schema);
const cfg = { haltedauerMinMinuten: 15, haltedauerMaxTage: 31, hebelMax: 10 };

const plan: OrderPlan = {
  wertpapier: { name: 'Beispiel AG', isin: 'DE0007164600', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'SAP.DE', waehrung: 'EUR' } },
  strategie: 'quartalszahlen_momentum',
  these: 'Prognoseerhöhung und Gewinnüberraschung, Momentum sollte einige Tage anhalten.',
  ausloeser: 'Ad-hoc-Mitteilung 07:02',
  signalIds: ['sig-1'],
  quellen: [{ name: 'EQS', link: 'https://www.eqs-news.com/' }],
  konfidenz: 62,
  pflichtOrder: false,
  erwarteteRenditeNetto: 3,
  zielNettoProzent: 5,
  stopProzent: -3,
  verkaufstermin: '2026-10-29T15:00:00Z',
  risiken: ['Gewinnmitnahmen'],
  einflussLektionen: 'Lektion 3: Prognoseerhöhungen im DAX tragen 3–5 Tage.',
};

const morgen: Entscheidung = { typ: 'morgenlauf', datum: '2026-10-21', erstellt: '2026-10-21T05:40:00Z', briefing: ['Punkt 1', 'Punkt 2', 'Punkt 3'], orders: [plan] };

describe('Schema', () => {
  it('gültige Entscheidung besteht', () => {
    expect(pruefe(morgen)).toBe(true);
  });
  it('fehlerhafte ISIN, Konfidenz > 100 und unbekannte Felder fallen durch', () => {
    const kaputt = { ...morgen, extra: 1, orders: [{ ...plan, konfidenz: 120, wertpapier: { ...plan.wertpapier, isin: 'XX' } }] };
    expect(pruefe(kaputt)).toBe(false);
    expect(pruefe.errors!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Übernahme', () => {
  const jetzt = new Date('2026-10-21T05:45:00Z');

  it('Vormerkung mit eindeutiger ID, Briefing und Lauf-Eintrag', () => {
    const u = entscheidungUebernehmen({ ...morgen, orders: [plan, plan] }, [], jetzt, cfg);
    const ids = u.ereignisse.filter((e) => e.typ === 'vorgemerkt').map((e) => e.orderId);
    expect(ids).toEqual(['2026-10-21-beispiel-ag', '2026-10-21-beispiel-ag-2']);
    expect(u.ereignisse.some((e) => e.typ === 'briefing')).toBe(true);
    expect(u.ereignisse.at(-1)!.typ).toBe('lauf');
  });

  it('Verkaufstermin wird auf maximal 31 Tage begrenzt', () => {
    const u = entscheidungUebernehmen({ ...morgen, orders: [{ ...plan, verkaufstermin: '2027-03-01T10:00:00Z' }] }, [], jetzt, cfg);
    expect((u.ereignisse[0].daten as { verkaufstermin: string }).verkaufstermin).toBe('2026-11-21T05:45:00.000Z');
    expect(u.hinweise[0]).toMatch(/begrenzt/);
  });

  it('unplausible Pläne werden abgelehnt', () => {
    const hebelOhneAngaben = { ...plan, wertpapier: { ...plan.wertpapier, anlageklasse: 'hebel' as const } };
    const pflichtZuSicher = { ...plan, pflichtOrder: true, konfidenz: 80 };
    const u = entscheidungUebernehmen({ ...morgen, orders: [hebelOhneAngaben, pflichtZuSicher] }, [], jetzt, cfg);
    expect(u.ereignisse.filter((e) => e.typ === 'vorgemerkt')).toHaveLength(0);
    expect(u.hinweise).toHaveLength(2);
  });

  it('Anpassungen nur für offene Orders; Bericht nur für abgeschlossene', () => {
    const vor = entscheidungUebernehmen(morgen, [], jetzt, cfg).ereignisse;
    const orders = ordersAusEreignissen(vor);
    const u = entscheidungUebernehmen(
      {
        typ: 'abendlauf',
        datum: '2026-10-21',
        erstellt: '2026-10-21T20:20:00Z',
        anpassungen: [
          { orderId: '2026-10-21-beispiel-ag', feld: 'verkaufstermin', neu: '2026-11-03T15:00:00Z', begruendung: 'Zahlen kommen später' },
          { orderId: '2026-10-21-beispiel-ag', feld: 'ziel', neu: 260, begruendung: 'noch nicht gekauft' },
          { orderId: 'gibt-es-nicht', feld: 'stop', neu: 1, begruendung: 'unbekannt' },
        ],
        berichte: [{ orderId: '2026-10-21-beispiel-ag', text: 'x'.repeat(60), learnings: ['a'] }],
      },
      orders,
      new Date('2026-10-21T20:25:00Z'),
      cfg,
    );
    expect(u.ereignisse.filter((e) => e.typ === 'angepasst')).toHaveLength(1);
    expect(u.hinweise).toHaveLength(3);
  });

  it('Risiko-Budget: höchstens 1 spekulative Order je Lauf, Spread-Klasse wird erzwungen, Stop-Grenze', () => {
    const rb = { maxSpekulativJeLauf: 1, maxAnteilSpekulativ: 0.3, stopMinProzent: -25, mindestKursEuro: 0.1 };
    const spek = { ...plan, risikoklasse: 'spekulativ' as const, wertpapier: { ...plan.wertpapier, name: 'Rakete Inc', spreadKlasse: 'aktie_neben' as const } };
    const zuWeit = { ...spek, wertpapier: { ...spek.wertpapier, name: 'Zu Weit Inc' }, stopProzent: -40 };
    const u = entscheidungUebernehmen({ ...morgen, orders: [spek, spek, plan] }, [], jetzt, { ...cfg, risikoBudget: rb });
    const vorgemerkt = u.ereignisse.filter((e) => e.typ === 'vorgemerkt');
    expect(vorgemerkt).toHaveLength(2);
    expect((vorgemerkt[0].daten as { plan: OrderPlan }).plan.wertpapier.spreadKlasse).toBe('spekulativ');
    expect(u.hinweise.some((h) => h.includes('Risiko-Budget'))).toBe(true);
    const u2 = entscheidungUebernehmen({ ...morgen, orders: [zuWeit] }, [], jetzt, { ...cfg, risikoBudget: rb });
    expect(u2.hinweise[0]).toMatch(/Stop -40 % weiter als erlaubt/);
    expect(pruefe({ ...morgen, orders: [spek] })).toBe(true);
  });

  it('Morgenlauf ohne Order ist erlaubt (keine Pflicht-Orders mehr, keine Warnung)', () => {
    expect(entscheidungUebernehmen({ ...morgen, orders: [] }, [], jetzt, cfg).hinweise.some((h) => /Pflicht-Order/.test(h))).toBe(false);
  });
});
