import { describe, expect, it } from 'vitest';
import { amtsblattLesen, aufrufeLesen, gdeltLesen, spitze, spitzenKlasse, suchName, tageSeitErwaehnung, themenFuer, weltgeschehenLesen, wikidataKuerzel, wikiText } from './kontext.ts';

// Aufgezeichnete Beispielantworten (gekürzt, Format wie die Dienste sie liefern)
const GDELT = {
  query_details: { title: '(tariff OR tariffs)', date_resolution: 'day' },
  timeline: [
    {
      series: 'Article Count',
      data: [
        { date: '20250105T000000Z', value: 120, norm: 90000 },
        { date: '20250106T000000Z', value: 300, norm: 100000 },
        { date: '20250106T120000Z', value: 50, norm: 10000 },
      ],
    },
  ],
};
const AUFRUFE = { items: [{ project: 'en.wikipedia', article: 'Nvidia', granularity: 'daily', timestamp: '2025010500', access: 'all-access', agent: 'user', views: 5100 }, { project: 'en.wikipedia', article: 'Nvidia', granularity: 'daily', timestamp: '2025010600', access: 'all-access', agent: 'user', views: 23000 }] };
const WIKIDATA = {
  head: { vars: ['ticker', 'artikel'] },
  results: {
    bindings: [
      { ticker: { type: 'literal', value: 'NVDA' }, artikel: { type: 'uri', value: 'https://en.wikipedia.org/wiki/Nvidia' } },
      { ticker: { type: 'literal', value: 'gme' }, artikel: { type: 'uri', value: 'https://en.wikipedia.org/wiki/GameStop' } },
      { ticker: { type: 'literal', value: 'ABC' }, artikel: { type: 'uri', value: 'https://en.wikipedia.org/wiki/Firma_A' } },
      { ticker: { type: 'literal', value: 'ABC' }, artikel: { type: 'uri', value: 'https://en.wikipedia.org/wiki/Firma_B' } },
      { ticker: { type: 'literal', value: 'BRK.B' }, artikel: { type: 'uri', value: 'https://en.wikipedia.org/wiki/Berkshire_Hathaway' } },
    ],
  },
};
const PORTAL = `{{Current events|year=2025|month=01|day=06|content=
<!-- All news items below this line -->
'''Armed conflicts and attacks'''
* [[Russian invasion of Ukraine]]
** [[Ukrainian Armed Forces|Ukrainian forces]] launch a new offensive in the [[Kursk Oblast]] of Russia. ([[Reuters]])
'''Business and economy'''
* [[Nvidia]] shares rise after the company unveils new chips at [[Consumer Electronics Show|CES]]. <ref>[https://example.com x]</ref>
* Short line.
;Politics and elections
* [[Justin Trudeau]] announces his resignation as [[Prime Minister of Canada]] and leader of the Liberal Party. ([[CBC News|CBC]])
}}`;
const AMTSBLATT = { '2025-01-06': { count: 4, name: 'January 6th, 2025' }, '2025-01-07': { count: 0, name: 'x' }, '2025-01-08': 2 };

describe('Kontext-Geschichte: Quellen lesen (18.11.2026)', () => {
  it('GDELT-Zeitreihe: Treffer und Gesamtvolumen je Tag (mehrere Punkte addiert)', () => {
    expect(gdeltLesen(GDELT)).toEqual({ treffer: { '2025-01-05': 120, '2025-01-06': 350 }, gesamt: { '2025-01-05': 90000, '2025-01-06': 110000 } });
    expect(gdeltLesen(null)).toEqual({ treffer: {}, gesamt: {} });
  });
  it('Wikipedia-Seitenaufrufe je Tag', () => {
    expect(aufrufeLesen(AUFRUFE)).toEqual({ '2025-01-05': 5100, '2025-01-06': 23000 });
  });
  it('Wikidata: Kürzel → Artikel, mehrdeutige fallen weg', () => {
    expect(wikidataKuerzel(WIKIDATA)).toEqual({ NVDA: 'Nvidia', GME: 'GameStop', 'BRK.B': 'Berkshire_Hathaway' });
  });
  it('Weltgeschehen: Kategorien und Ereignisse ohne Wiki-Auszeichnung', () => {
    const e = weltgeschehenLesen(PORTAL);
    expect(e.map((x) => x.k)).toEqual(['Armed conflicts and attacks', 'Business and economy', 'Politics and elections']);
    expect(e[0].t).toBe('Russian invasion of Ukraine – Ukrainian forces launch a new offensive in the Kursk Oblast of Russia. (Reuters)');
    expect(e[1].t).toBe('Nvidia shares rise after the company unveils new chips at CES.');
    expect(wikiText("'''Fett''' und [[A|B]] {{v}}")).toBe('Fett und B');
  });
  it('Federal Register: Tageszählung aus beiden Formen', () => {
    expect(amtsblattLesen(AMTSBLATT)).toEqual({ '2025-01-06': 4, '2025-01-07': 0, '2025-01-08': 2 });
  });
});

describe('Kontext-Geschichte: Spitzen und Zuordnung', () => {
  const reihe: Record<string, number> = {};
  for (let i = 1; i <= 30; i++) reihe[new Date(Date.parse('2025-01-31T12:00:00Z') - i * 86400000).toISOString().slice(0, 10)] = 99;
  reihe['2025-01-31'] = 399;
  it('Spitze = Tag gegen den Median der 30 Tage davor', () => {
    expect(spitze(reihe, '2025-01-31')).toBe(4);
    expect(spitze(reihe, '2025-01-30')).toBe(1);
    expect(spitze({ '2025-01-31': 5 }, '2025-01-31')).toBeNull();
    expect(spitzenKlasse(4)).toBe('Sturm');
    expect(spitzenKlasse(1.5)).toBe('erhöht');
  });
  it('Spitze als Anteil am Gesamtvolumen: Wachstum der Quellen ist keine Spitze', () => {
    const g: Record<string, number> = {};
    for (const d of Object.keys(reihe)) g[d] = d === '2025-01-31' ? 400000 : 100000;
    expect(spitze(reihe, '2025-01-31', 30, 1, g)).toBe(1);
  });
  it('Themen je Branche und Coin, Suchnamen, Tage seit Erwähnung', () => {
    const themen = [
      { id: 'chips', name: 'Chips', gdelt: 'x', sic: [[3670, 3679]] as [number, number][] },
      { id: 'krypto', name: 'Krypto', gdelt: 'y', krypto: true },
    ];
    expect(themenFuer(themen, 'aktie', 3674).map((t) => t.id)).toEqual(['chips']);
    expect(themenFuer(themen, 'krypto', null).map((t) => t.id)).toEqual(['krypto']);
    expect(suchName('NVIDIA CORP')).toBe('NVIDIA');
    expect(suchName('First Inc.')).toBeNull();
    expect(tageSeitErwaehnung(new Set(['2025-01-29']), '2025-01-31')).toBe(2);
    expect(tageSeitErwaehnung(new Set(['2024-12-01']), '2025-01-31')).toBeNull();
  });
});

describe('Kontext-Geschichte: schnelle Spitzen-Folge', () => {
  it('liefert dasselbe wie spitze() für jeden Tag', async () => {
    const { alsFolge, kalenderTage, spitzenFolge } = await import('./kontext.ts');
    const tage = kalenderTage('2025-01-01', '2025-03-31');
    const reihe: Record<string, number> = {};
    const gesamt: Record<string, number> = {};
    tage.forEach((d, i) => {
      if (i % 7 !== 3) reihe[d] = 50 + ((i * 37) % 90) + (i === 70 ? 900 : 0);
      gesamt[d] = 1000 + i * 10;
    });
    for (const [fenster, t, mitG] of [[30, 1, false], [30, 2, true], [60, 5, false]] as const) {
      const f = spitzenFolge(alsFolge(reihe, tage), fenster, t, mitG ? alsFolge(gesamt, tage) : undefined);
      tage.forEach((d, i) => {
        const e = spitze(reihe, d, fenster, t, mitG ? gesamt : undefined);
        if (e === null) expect(Number.isNaN(f[i])).toBe(true);
        else expect(f[i]).toBeCloseTo(e, 2);
      });
    }
    expect(kalenderTage('2025-02-27', '2025-03-01')).toEqual(['2025-02-27', '2025-02-28', '2025-03-01']);
  });
});
