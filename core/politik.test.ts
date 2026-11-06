import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  enthaelt,
  grosseEreignisse,
  politikPushText,
  politikRisiko,
  politikSignale,
  politikZeilen,
  polymarketSprungSignale,
  richtungVon,
  themenErkennen,
  type PolitikConfig,
} from './politik.ts';
import { federalRegisterMeldungen, polymarketPreise } from '../jobs/quellen/politik.ts';

const cfg = JSON.parse(readFileSync(join(process.cwd(), 'config', 'politik-themen.json'), 'utf8')) as PolitikConfig;
const jetzt = new Date('2026-11-06T10:00:00Z');
const thema = (id: string) => cfg.themen.find((t) => t.id === id)!;

describe('Politik-Radar: Texterkennung', () => {
  it('kurze Wörter nur als ganzes Wort', () => {
    expect(enthaelt('NATO-Gipfel beschließt mehr Geld', 'nato')).toBe(true);
    expect(enthaelt('Senator fordert Aufklärung', 'nato')).toBe(false);
    expect(enthaelt('Bank of America senkt Ziel', 'ban')).toBe(false);
    expect(enthaelt('US eskaliert Zollstreit: neue Strafzölle', 'eskal')).toBe(true);
  });
  it('Richtung: negativ schlägt positiv, sonst Standard', () => {
    expect(richtungVon('Bundestag beschließt Sondervermögen für Bundeswehr', thema('ruestung'))).toBe(1);
    expect(richtungVon('Boxer-Auftrag der Bundeswehr verschoben', thema('ruestung'))).toBe(-1);
    expect(richtungVon('Trump verhängt neue Zölle auf EU-Autos', thema('zoelle_handel'))).toBe(-1);
    expect(richtungVon('EU und USA: Einigung im Zollstreit', thema('zoelle_handel'))).toBe(1);
    expect(richtungVon('Zölle: Gespräche gehen weiter', thema('zoelle_handel'))).toBe(-1); // Standard
  });
});

describe('Politik-Radar: Themen, Signale, Risiko', () => {
  const meldungen = [
    { titel: 'Trump verhängt neue Zölle auf EU-Autos', quelle: 'tagesschau Ausland', link: 'https://a', zeit: '2026-11-06T08:00:00Z' },
    { titel: 'Trump imposes new tariffs on European cars', quelle: 'CNBC Politics', link: 'https://b', zeit: '2026-11-06T07:30:00Z' },
    { titel: 'Trump verhängt neue Zölle auf EU-Autos', quelle: 'tagesschau Wirtschaft', link: 'https://c', zeit: '2026-11-06T08:05:00Z' }, // Duplikat
    { titel: 'Waffenruhe in der Ukraine: Verhandlungen in Genf', quelle: 'tagesschau Ausland', link: 'https://d', zeit: '2026-11-06T06:00:00Z' },
    { titel: 'Alte Meldung zu Zöllen', quelle: 'CNBC World', link: 'https://e', zeit: '2026-11-04T06:00:00Z' }, // zu alt
    { titel: 'Wetter: Sonne am Wochenende', quelle: 'tagesschau Inland', link: 'https://f', zeit: '2026-11-06T06:00:00Z' },
  ];
  const treffer = themenErkennen(meldungen, cfg, jetzt);

  it('ordnet Meldungen Themen zu, ohne Duplikate und alte Meldungen', () => {
    const z = treffer.find((t) => t.thema.id === 'zoelle_handel')!;
    expect(z.meldungen).toHaveLength(2);
    expect(z.quellen).toBe(2);
    expect(z.richtung).toBe(-1);
    expect(treffer.find((t) => t.thema.id === 'ukraine_russland')?.richtung).toBe(1);
    expect(treffer.some((t) => t.thema.id === 'wahlen_regierung')).toBe(false);
  });

  it('Signale je betroffenem Wert in Wirkungsrichtung', () => {
    const s = politikSignale(treffer, jetzt);
    const vw = s.find((x) => x.wertpapier.ticker === 'VOW3.DE')!;
    expect(vw).toMatchObject({ typ: 'politik_massnahme', richtung: -1 });
    expect(vw.staerke).toBeCloseTo(0.55, 2);
    // Waffenruhe positiv → Rüstungswerte (richtung −1) fallen
    expect(s.find((x) => x.wertpapier.ticker === 'RHM.DE')).toMatchObject({ richtung: -1 });
    expect(s.every((x) => x.id.startsWith('politik_massnahme:'))).toBe(true);
  });

  it('Risiko-Index und Zeilen', () => {
    const idx = politikRisiko(treffer);
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThanOrEqual(100);
    const z = politikZeilen(treffer, idx, cfg.risikoHochAb);
    expect(z[0]).toMatch(/^Politik-Risiko: \d+\/100/);
    expect(z.join('\n')).toContain('Volkswagen ↓');
  });

  it('Push nur bei großen Ereignissen, je Thema einmal am Tag', () => {
    const r1 = grosseEreignisse(treffer, cfg, {}, '2026-11-06');
    expect(r1.neu.map((t) => t.thema.id)).toEqual(['zoelle_handel']);
    const r2 = grosseEreignisse(treffer, cfg, r1.zustand, '2026-11-06');
    expect(r2.neu).toEqual([]);
    const r3 = grosseEreignisse(treffer, cfg, r1.zustand, '2026-11-07');
    expect(r3.neu).toHaveLength(1);
    const p = politikPushText(r1.neu[0], ['BMW.DE']);
    expect(p.titel).toBe('🏛️ Politik: Zölle/Handelskonflikte');
    expect(p.text).toContain('Betrifft offene Position: BMW');
  });
});

describe('Politik-Radar: Prognosemärkte und Abruf-Hilfen', () => {
  it('Polymarket-Sprung → Signal in Wirkungsrichtung', () => {
    const preise = [
      { id: '1', titel: 'Russia x Ukraine ceasefire in 2026?', p: 0.42 },
      { id: '2', titel: 'Fed decision in December?', p: 0.6 },
    ];
    const r = polymarketSprungSignale(preise, { '1': 0.25, '2': 0.58 }, cfg, jetzt);
    expect(r.zeilen).toHaveLength(1);
    const rhm = r.signale.find((s) => s.wertpapier.ticker === 'RHM.DE')!;
    expect(rhm).toMatchObject({ typ: 'politik_wahrscheinlichkeit', richtung: -1 });
    expect(polymarketSprungSignale(preise, {}, cfg, jetzt).signale).toEqual([]); // ohne Vorwert kein Sprung
  });

  it('Federal Register und Polymarket-Antworten (aufgezeichnet) werden gelesen', () => {
    const fr = federalRegisterMeldungen({
      results: [
        { title: 'Adjusting Imports of Automobiles and Automobile Parts Into the United States', publication_date: '2026-11-06', html_url: 'https://www.federalregister.gov/d/2026-1' },
        { title: 'ohne Link', publication_date: '2026-11-06' },
      ],
    });
    expect(fr).toHaveLength(1);
    expect(themenErkennen(fr, cfg, jetzt)[0].thema.id).toBe('zoelle_handel');
    const pm = polymarketPreise([
      { title: 'Government shutdown?', slug: 'shutdown', markets: [{ id: 'a', question: 'Government shutdown by Dec 31?', outcomePrices: '["0.31","0.69"]' }] },
      { title: 'Wahl', markets: [{ id: 'b', groupItemTitle: 'Person A', outcomePrices: '["0.5","0.5"]' }, { id: 'c', question: 'x', outcomePrices: '["0.995","0.005"]' }] },
    ]);
    expect(pm).toEqual([{ id: 'a', titel: 'Government shutdown by Dec 31?', p: 0.31, link: 'https://polymarket.com/event/shutdown' }]);
  });
});
