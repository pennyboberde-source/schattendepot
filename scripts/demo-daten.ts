// Erzeugt Demo-Daten für Entwicklung und E2E-Tests (demo/daten). Nie deployen.
// Aufruf: node scripts/demo-daten.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { GebuehrenConfig } from '../core/gebuehren.ts';
import { ergebnis, kaufen, verkaufen, zielkurs } from '../core/rendite.ts';
import { steuernBerechnen, type SteuerConfig } from '../core/steuern.ts';
import type { Order, OrderPlan } from '../core/typen.ts';

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
console.log('Demo-Daten geschrieben nach', ziel);
