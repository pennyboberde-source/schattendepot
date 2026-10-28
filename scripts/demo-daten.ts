// Erzeugt Demo-Daten für Entwicklung und E2E-Tests (demo/daten). Nie deployen.
// Aufruf: node scripts/demo-daten.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GebuehrenConfig } from '../core/gebuehren.ts';
import { ergebnis, kaufen, verkaufen, zielkurs } from '../core/rendite.ts';
import { statistikBerechnen } from '../core/statistik.ts';
import { steuernBerechnen, type SteuerConfig } from '../core/steuern.ts';
import type { Order, OrderPlan } from '../core/typen.ts';
import { beobachtung, kerzenVerarbeiten } from '../core/daytrading/ablauf.ts';
import { uebersichtBerechnen } from '../core/daytrading/auswertung.ts';
import { ortszeitZuUtc, sitzung, tradesAusEreignissen, type Kerze } from '../core/daytrading/kern.ts';

const root = join(dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const cfg = JSON.parse(readFileSync(join(root, 'config/gebuehren.json'), 'utf8')) as GebuehrenConfig;
const steuerCfg = JSON.parse(readFileSync(join(root, 'config/steuern.json'), 'utf8')) as SteuerConfig;
const ziel = join(root, 'demo/daten');

function schreibe(datei: string, inhalt: unknown) {
  const pfad = join(ziel, datei);
  mkdirSync(dirname(pfad), { recursive: true });
  writeFileSync(pfad, typeof inhalt === 'string' ? inhalt : JSON.stringify(inhalt, null, 2) + '\n');
}

const plan = (name: string, isin: string, strategie: OrderPlan['strategie'], konfidenz: number, extra: Partial<OrderPlan> = {}): OrderPlan => ({
  wertpapier: { name, isin, anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien' },
  strategie,
  these: `DEMO: ${name} – fiktive These für die Entwicklung.`,
  ausloeser: 'DEMO-Signal',
  signalIds: ['demo-1'],
  quellen: [{ name: 'Beispielquelle', link: 'https://example.org/' }],
  konfidenz,
  pflichtOrder: false,
  erwarteteRenditeNetto: 3,
  zielNettoProzent: 5,
  stopProzent: -3,
  verkaufstermin: '2026-10-29T16:00:00Z',
  risiken: ['Demo-Risiko'],
  einflussLektionen: 'Demo: keine Lektionen vorhanden.',
  ...extra,
});

function geschlossen(id: string, p: OrderPlan, stueck: number, kk: number, vk: number, kaufZeit: string, verkaufZeit: string, grund: 'ziel' | 'stop'): Order {
  const k = kaufen(stueck, kk, cfg);
  const v = verkaufen(stueck, vk, cfg);
  const e = ergebnis(k, v);
  return {
    id,
    status: 'geschlossen',
    vorgemerktUm: kaufZeit,
    vorgemerktVon: 'morgenlauf',
    plan: p,
    zielkurs: zielkurs(k, p.zielNettoProzent, cfg),
    stopkurs: Math.round(kk * (1 + p.stopProzent / 100) * 100) / 100,
    verkaufstermin: p.verkaufstermin,
    kauf: { zeit: kaufZeit, stueck, kurs: kk, kurswert: k.kurswert, entgelt: k.entgelt, betrag: k.betrag, kursquelle: 'demo', synthetisch: true },
    verkauf: { zeit: verkaufZeit, stueck, kurs: vk, kurswert: v.kurswert, entgelt: v.entgelt, betrag: v.betrag, kursquelle: 'demo', synthetisch: true, grund },
    anpassungen: [],
    ergebnis: { ...e, steuer: 0, nachSteuern: e.netto },
    bericht: 'DEMO-Abschlussbericht: Verlauf, These, Signale, Learnings.',
  };
}

const abgeschlossen = [
  geschlossen('2026-10-14-demo-a', plan('Demo Alpha AG', 'DE000DEMO0001', 'insider_kauf', 65), 10, 95.2, 101.4, '2026-10-14T07:15:00Z', '2026-10-16T13:30:00Z', 'ziel'),
  geschlossen('2026-10-15-demo-b', plan('Demo Beta SE', 'DE000DEMO0002', 'analysten_hochstufung', 55), 4, 240, 232.5, '2026-10-15T07:15:00Z', '2026-10-17T09:45:00Z', 'stop'),
];
const steuer = steuernBerechnen(
  abgeschlossen.map((o) => ({ id: o.id, zeit: o.verkauf!.zeit, ergebnis: o.ergebnis!.netto, topf: 'aktien' as const })),
  steuerCfg,
);
for (const o of abgeschlossen) Object.assign(o.ergebnis!, steuer.proFall[o.id]);

const kOffen = kaufen(4, 238.1, cfg);
const offen: Order = {
  id: '2026-10-21-demo-c',
  status: 'offen',
  vorgemerktUm: '2026-10-21T05:35:00Z',
  vorgemerktVon: 'morgenlauf',
  plan: plan('Demo Gamma AG', 'DE000DEMO0003', 'quartalszahlen_momentum', 60),
  zielkurs: zielkurs(kOffen, 5, cfg),
  stopkurs: 230.96,
  verkaufstermin: '2026-10-29T16:00:00Z',
  kauf: { zeit: '2026-10-21T06:00:00Z', stueck: 4, kurs: 238.1, kurswert: kOffen.kurswert, entgelt: kOffen.entgelt, betrag: kOffen.betrag, kursquelle: 'demo', synthetisch: true },
  anpassungen: [],
  letzterKurs: { wert: 241.3, zeit: '2026-10-21T12:45:00Z', quelle: 'demo', verzoegertMin: 15, synthetisch: false },
};
const vorgemerkt: Order = {
  id: '2026-10-21-demo-d',
  status: 'vorgemerkt',
  vorgemerktUm: '2026-10-21T05:35:00Z',
  vorgemerktVon: 'morgenlauf',
  plan: plan('Demo Delta ETF', 'IE000DEMO004', 'sektor_rotation', 45, { pflichtOrder: true }),
  verkaufstermin: '2026-11-04T16:00:00Z',
  anpassungen: [],
};

const netto = abgeschlossen.reduce((s, o) => s + o.ergebnis!.netto, 0);
const nachSteuern = abgeschlossen.reduce((s, o) => s + o.ergebnis!.nachSteuern, 0);
const stand = '2026-10-21T12:45:00Z';
schreibe('positionen.json', { stand, offen: [offen], vorgemerkt: [vorgemerkt] });
schreibe('abgeschlossen.json', { stand, orders: abgeschlossen });
schreibe('kennzahlen.json', {
  stand,
  anzahlOffen: 1,
  anzahlGeschlossen: abgeschlossen.length,
  netto: Math.round(netto * 100) / 100,
  nachSteuern: Math.round(nachSteuern * 100) / 100,
  trefferquote: 50,
  etfNetto: -12.4,
  kurve: [
    { datum: '2026-10-14', depot: 0, etf: 0 },
    { datum: '2026-10-16', depot: abgeschlossen[0].ergebnis!.netto, etf: -9.8 },
    { datum: '2026-10-17', depot: Math.round(netto * 100) / 100, etf: -12.4 },
  ],
});
schreibe('system.json', { stand, letzterWaechterLauf: stand, letzterSammlerLauf: '2026-10-21T04:30:00Z', letzterClaudeLauf: { zeit: '2026-10-21T05:35:00Z', typ: 'Morgenlauf' } });
schreibe('lagebild/index.json', { tage: ['2026-10-21'] });
const lagebild = {
  datum: '2026-10-21',
  erstellt: '2026-10-21T04:30:00Z',
  briefing: ['DEMO: Insider-Cluster-Kauf bei Demo Alpha', 'DEMO: US-Inflationsdaten 14:30', 'DEMO: Quartalszahlen Demo Gamma'],
  makro: ['DEMO: Leitzins unverändert'],
  termine: [{ zeit: '14:30', text: 'DEMO: US-Verbraucherpreise' }],
  meldungen: [{ titel: 'DEMO-Meldung', quelle: 'Beispielquelle', link: 'https://example.org/meldung' }],
  insider: [{ wertpapier: 'Demo Alpha AG', text: '3 Vorstände kaufen', link: 'https://example.org/insider' }],
  kandidaten: [{ name: 'Demo Gamma AG', isin: 'DE000DEMO0003', score: 78, fakten: ['Gewinnüberraschung +12 %'], quellen: [{ name: 'Beispielquelle', link: 'https://example.org/k' }] }],
};
schreibe('lagebild/heute.json', lagebild);
schreibe('lagebild/2026-10-21.json', lagebild);
schreibe('quellenstatus.json', { stand, quellen: [{ id: 'demo', name: 'Demo-Quelle', zuletztOk: stand, kontingent: { genutzt: 3, limit: 25, zeitraum: 'Tag' } }] });
schreibe('lernen/lektionen.md', '# Lektionen (DEMO)\n\n1. Demo-Regel – Beleg: 2026-10-14-demo-a – Stärke: schwach\n');
const tracking = [
  { datum: '2026-10-14', schluessel: 'T:ACME', name: 'Acme', ticker: 'ACME', score: 3, typen: ['insider_cluster_kauf'], quellen: ['OpenInsider'], start: 10, r1T: 1.2, r1W: 3.4 },
  { datum: '2026-10-14', schluessel: 'T:BETA', name: 'Beta', ticker: 'BETA', score: 1, typen: ['nachricht'], quellen: ['CNBC Top News'], start: 20, r1T: -0.5, r1W: -1.1 },
];
schreibe('kandidaten-tracking.json', tracking);
schreibe('verlauf/2026-10-21-demo-c.json', [
  ['2026-10-21T06:00:00Z', 238.1],
  ['2026-10-21T08:00:00Z', 239.4],
  ['2026-10-21T10:00:00Z', 237.9],
  ['2026-10-21T12:45:00Z', 241.3],
]);
schreibe('statistik.json', {
  ...statistikBerechnen([...abgeschlossen, offen], tracking, stand),
  // S2 (DEMO): Autopilot-Beweise und Ziel/Stop-Vorschläge aus dem Schattenbuch
  autopilot: [
    { typ: 'insider_cluster_kauf', gruppe: 'aktie', faelle: 24, chance: 54.2, oeNetto: 1.8, huerde: 2.78, bewiesen: true },
    { typ: 'neulistung', gruppe: 'krypto', faelle: 9, chance: 33.3, oeNetto: -1.2, huerde: 0.7, bewiesen: false },
  ],
  zielStop: [{ typ: 'insider_cluster_kauf', faelle: 14, zielBruttoProzent: 8, zielNettoProzent: 5.2, stopProzent: -5, oeNetto: 1.9, ohneRegelOeNetto: 0.6, huerde: 2.78 }],
});
schreibe('gewichte.json', { stand, signale: { insider_cluster_kauf: 3.3 }, quellen: { 'CNBC Top News': 0.9 } });
schreibe('lernen/gewichtsaenderungen.json', [{ datum: '2026-10-17', art: 'signal', name: 'insider_cluster_kauf', alt: 3, neu: 3.3, grund: 'DEMO: Ø 1-Wochen-Rendite 3,4 % (n=9)' }]);
// S3 (DEMO): Daytrading – zwei Trades nach der Eröffnungsspannen-Regel, mit echter Kern-Logik erzeugt
{
  const d = '2026-10-21';
  const lese = (n: string) => JSON.parse(readFileSync(join(root, 'config', n), 'utf8')) as GebuehrenConfig;
  const k = (hhmm: string, o: number, h: number, l: number, c: number): Kerze => ({ t: ortszeitZuUtc(d, hhmm, 'Europe/Berlin').toISOString(), o, h, l, c, v: 100, n: 5 });
  const lauf = {
    datum: d,
    sitzungen: { eu: sitzung(d, { aktiv: true, zeitzone: 'Europe/Berlin', eroeffnung: '09:00', keineEinstiegeNach: '17:00', flatBis: '17:25' }, 15) },
    regeln: { minSpannenKerzen: 2, volumenFaktor: 0 },
    plan: { zielR: 2, stopProzentLevel: 2, minRisikoProzent: 0.05 },
    spreads: { aktie: 0.15, spekulativ: 1, krypto: 0.5, turbo: 0.5 },
    orderBetrag: 1000,
    maxTradesJeTag: 40,
    maxOffen: 30,
    emittent: 'UniCredit (synthetisch)',
    gebuehren: { smartbroker: lese('gebuehren-smartbroker.json'), consors: cfg, traderepublic: lese('gebuehren-traderepublic.json'), krypto: cfg },
  };
  const beob = [
    beobachtung({ basis: 'DE000DEMO0001', herkunft: 'code_scan', markt: 'eu', name: 'Demo Alpha AG', isin: 'DE000DEMO0001', instrumentLong: 'aktie', hebel: 5, spekulativ: false }, 'orb', ['long', 'short']),
    beobachtung({ basis: 'DE000DEMO0002', herkunft: 'claude', markt: 'eu', name: 'Demo Beta AG', isin: 'DE000DEMO0002', instrumentLong: 'aktie', hebel: 5, spekulativ: false, chance: 55, these: 'DEMO' }, 'orb', ['long', 'short']),
  ];
  const r = kerzenVerarbeiten(
    new Map([
      ['DE000DEMO0001', [k('09:00', 100, 101, 99.5, 100.5), k('09:05', 100.5, 101.5, 100, 101), k('09:10', 101, 101.2, 100.2, 100.8), k('09:20', 101.4, 102, 101.3, 101.9), k('09:25', 102, 102.5, 101.9, 102.4), k('09:30', 102.4, 105.1, 102.3, 105)]],
      ['DE000DEMO0002', [k('09:00', 50, 50.5, 49.5, 50), k('09:05', 50, 50.2, 49.8, 50), k('09:10', 50, 50.1, 49.9, 50), k('09:15', 49.9, 50, 49.2, 49.3), k('09:20', 49.2, 49.3, 49, 49.1), k('09:40', 49.6, 50.2, 49.5, 50.1)]],
    ]),
    beob,
    [],
    lauf,
    { heuteEroeffnet: 0, vergeben: new Set<string>() },
  );
  schreibe('daytrading/uebersicht.json', { ...uebersichtBerechnen(tradesAusEreignissen(r.ereignisse), d, stand), beobachtet: { code_scan: 21, claude: 1, autopilot: 0 } });
  schreibe('daytrading/autopilot.json', { stand, horizont: 'r1h', beweise: [] });
}
console.log('Demo-Daten geschrieben nach', ziel);
