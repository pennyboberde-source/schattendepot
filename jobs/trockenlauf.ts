// Trockenlauf des Kurswächters mit echten Kursen, aber in einer Kopie der Daten (nichts wird committet, keine Pushes).
// Merkt Test-Orders (US-Aktie, EU-Aktie, Krypto-ETN, Knock-out) vor und lässt den Wächter einen Lauf machen.
// Aufruf: node jobs/trockenlauf.ts
import { execFileSync } from 'node:child_process';
import { appendFileSync, cpSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Ereignis, OrderPlan } from '../core/typen.ts';

const quelle = process.env.DATEN_DIR ?? '_daten';
const kopie = mkdtempSync(join(tmpdir(), 'trockenlauf-'));
cpSync(quelle, kopie, { recursive: true, filter: (p) => !p.includes('.git') });

const vor = new Date(Date.now() - 45 * 60000).toISOString(); // vor den (bis 15 Min. verzögerten) gettex-Kursen
const basis = (name: string, isin: string, extra: Partial<OrderPlan>): OrderPlan => ({
  wertpapier: { name, isin, anlageklasse: 'aktie', spreadKlasse: 'aktie_large', handelsplatz: 'TGT', steuertopf: 'aktien' },
  strategie: 'sonstige',
  these: 'TROCKENLAUF – Test der Kursabfrage und Ausführung.',
  ausloeser: 'Trockenlauf',
  signalIds: [],
  quellen: [],
  konfidenz: 50,
  pflichtOrder: false,
  erwarteteRenditeNetto: 3,
  zielNettoProzent: 5,
  stopProzent: -5,
  verkaufstermin: new Date(Date.now() + 3 * 86400000).toISOString(),
  risiken: ['Test'],
  einflussLektionen: '',
  ...extra,
});
const tests: [string, OrderPlan][] = [
  ['test-us', basis('Apple (Test)', 'US0378331005', { wertpapier: { name: 'Apple (Test)', isin: 'US0378331005', anlageklasse: 'aktie', spreadKlasse: 'aktie_large', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'us', symbol: 'AAPL', waehrung: 'USD' } } })],
  ['test-eu', basis('SAP (Test)', 'DE0007164600', { wertpapier: { name: 'SAP (Test)', isin: 'DE0007164600', anlageklasse: 'aktie', spreadKlasse: 'aktie_dax', handelsplatz: 'TGT', steuertopf: 'aktien', kursbasis: { markt: 'eu', symbol: 'SAP.DE', waehrung: 'EUR' } } })],
  [
    'test-etn',
    basis('Bitcoin-ETN (Test)', 'DE000A27Z304', {
      wertpapier: { name: 'Bitcoin-ETN (Test)', isin: 'DE000A27Z304', anlageklasse: 'krypto_etn', spreadKlasse: 'krypto_etn', handelsplatz: 'TGT', steuertopf: 'sonstige' },
      etn: { basiswert: { markt: 'krypto', symbol: 'BTC', waehrung: 'EUR' }, anteilProStueck: 0.001, kostenProzentJahr: 0 },
    }),
  ],
  [
    'test-ko',
    basis('Turbo Long Apple (Test)', 'DE000TEST0001', {
      wertpapier: { name: 'Turbo Long Apple (Test)', isin: 'DE000TEST0001', anlageklasse: 'hebel', spreadKlasse: 'hebel', handelsplatz: 'TGT', steuertopf: 'sonstige' },
      hebel: { typ: 'knockout', richtung: 'long', emittent: 'Test', basiswert: { name: 'Apple', kursbasis: { markt: 'us', symbol: 'AAPL', waehrung: 'USD' } }, basispreis: 150, koSchwelle: 150, bezugsverhaeltnis: 0.1 },
    }),
  ],
];
const ereignisse: Ereignis[] = tests.map(([id, plan]) => ({ id: `${vor}-vorgemerkt-${id}`, zeit: vor, typ: 'vorgemerkt', quelle: 'system', orderId: id, daten: { plan, verkaufstermin: plan.verkaufstermin } }));
appendFileSync(join(kopie, 'ereignisse.jsonl'), ereignisse.map((e) => JSON.stringify(e)).join('\n') + '\n');

const env = { ...process.env, DATEN_DIR: kopie, OHNE_UEBERNAHME: '1', PUSH_SUBSCRIPTION: '', ROUTINE_FIRE_URL: '', ROUTINE_FIRE_TOKEN: '' };
console.log(execFileSync('node', ['jobs/waechter.ts'], { env, encoding: 'utf8' }));

const neu = readFileSync(join(kopie, 'ereignisse.jsonl'), 'utf8').trim().split('\n').map((z) => JSON.parse(z) as Ereignis).filter((e) => e.quelle === 'waechter');
console.log('--- Ergebnis Trockenlauf ---');
for (const e of neu) {
  const d = e.daten as { kauf?: { stueck: number; kurs: number; betrag: number; kursquelle: string }; grund?: string };
  console.log(`${e.orderId}: ${e.typ}${d.kauf ? ` ${d.kauf.stueck} Stk. à ${d.kauf.kurs} € = ${d.kauf.betrag} € (${d.kauf.kursquelle})` : ''}${d.grund ? ` – ${d.grund}` : ''}`);
}
for (const t of tests) if (!neu.some((e) => e.orderId === t[0])) console.log(`${t[0]}: noch nicht ausgeführt (kein neuer Kurs oder außerhalb der Handelszeit)`);
const system = JSON.parse(readFileSync(join(kopie, 'system.json'), 'utf8'));
console.log('Kursabrufe:', JSON.stringify(system.kursabrufe ?? {}, null, 1));
console.log('Hinweise:', (system.hinweise ?? []).join(' | ') || '–');
