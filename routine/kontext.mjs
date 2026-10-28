// Kompakter Kontext für einen Routinen-Lauf (spart Tokens: nur das Nötige, keine Rohdaten).
// Aufruf: node routine/kontext.mjs <morgenlauf|abendlauf|ereignislauf|wochenrueckblick> [orderId]
// Liest den daten-Branch per git (Fallback: raw.githubusercontent.com).
import { execFileSync } from 'node:child_process';

const typ = process.argv[2] ?? 'morgenlauf';
const orderArg = process.argv[3];
const REPO = 'pennyboberde-source/schattendepot';

let gitOk = true;
try {
  execFileSync('git', ['fetch', '-q', 'origin', 'daten'], { stdio: 'ignore' });
} catch {
  gitOk = false;
}

async function lies(datei) {
  if (gitOk) {
    try {
      return execFileSync('git', ['show', `origin/daten:${datei}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 20e6 });
    } catch {
      /* Datei fehlt */
    }
  }
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${REPO}/daten/${datei}`);
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
}
const json = async (d, std) => {
  const t = await lies(d);
  try {
    return t ? JSON.parse(t) : std;
  } catch {
    return std;
  }
};

// Berliner Datum/Zeit, Handelstag (Feiertage wie core/kalender.ts)
const teile = Object.fromEntries(
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date())
    .map((p) => [p.type, p.value]),
);
const datum = `${teile.year}-${teile.month}-${teile.day}`;
function ostern(j) {
  const a = j % 19, b = Math.floor(j / 100), c = j % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(j, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
}
const j = Number(teile.year);
const os = ostern(j);
const tag = (d) => d.toISOString().slice(0, 10);
const feiertage = new Set([`${j}-01-01`, tag(new Date(os.getTime() - 2 * 864e5)), tag(new Date(os.getTime() + 864e5)), `${j}-05-01`, `${j}-12-24`, `${j}-12-25`, `${j}-12-26`, `${j}-12-31`]);
const handelstag = !['Sat', 'Sun'].includes(teile.weekday) && !feiertage.has(datum);

const kurz = (s, n = 160) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s ?? '');
const pct = (a, b) => (a && b ? `${((a / b - 1) * 100).toFixed(1)} %` : '–');
const out = [];
const p = (...z) => out.push(...z);

p(`# Kontext ${typ} – ${datum} ${teile.hour}:${teile.minute} Berlin (${teile.weekday})`);
p(`Handelstag: ${handelstag ? 'JA' : 'NEIN (Wochenende/Börsenfeiertag)'}`);
p(`Ergebnisdatei: laeufe/${datum}-${typ}${typ === 'ereignislauf' ? `-${teile.hour}${teile.minute}` : ''}.json  ·  Branch: claude/lauf-${datum}-${typ}${typ === 'ereignislauf' ? `-${teile.hour}${teile.minute}` : ''}`);
p('Simulation mit fiktivem Geld – keine Anlageberatung.', '');

const statistik = await json('statistik.json', null);
const kennzahlen = await json('kennzahlen.json', null);
p('## 1. Statistik');
if (kennzahlen) p(`Abgeschlossen ${kennzahlen.anzahlGeschlossen}, offen ${kennzahlen.anzahlOffen}, Ergebnis nach Gebühren ${kennzahlen.netto} €, Trefferquote ${kennzahlen.trefferquote ?? '–'} %, vs. ETF ${(kennzahlen.netto - kennzahlen.etfNetto).toFixed(2)} €`);
if (statistik?.zusammenfassung) p(statistik.zusammenfassung);
if (statistik?.risikoBudget) p(`Risiko-Budget jetzt: max. ${statistik.risikoBudget.maxSpekulativJeLauf} spekulativ je Lauf, max. ${Math.round(statistik.risikoBudget.maxAnteilSpekulativ * 100)} % der Positionen (${statistik.risikoBudget.begruendung})`);
else p('(noch keine ausführliche Statistik)');
const gewichte = await json('gewichte.json', null);
if (gewichte?.signale) p(`Gewichte Signal-Typen: ${Object.entries(gewichte.signale).map(([k, v]) => `${k} ${v}`).join(', ')}`);
// Datenkrake: Was klappt im Schattenbuch (Signaltypen mit ≥ 5 gemessenen Fällen), knapp
const nachTyp = Object.entries(statistik?.kandidaten?.nachSignalTyp ?? {}).filter(([, v]) => v.anzahl >= 5 && v.quote1T != null);
if (nachTyp.length) {
  const sortiert = nachTyp.sort((a, b) => (b[1].oe1W ?? b[1].oe1T ?? 0) - (a[1].oe1W ?? a[1].oe1T ?? 0));
  const zeile = ([k, v]) => `${k} ${v.quote1T} % (1 T), Ø ${v.oe1W ?? '–'} % (1 W), n=${v.anzahl}`;
  p(`Schattenbuch – klappt am besten: ${sortiert.slice(0, 4).map(zeile).join('; ')}`);
  if (sortiert.length > 4) p(`Schattenbuch – klappt am schlechtesten: ${sortiert.slice(-3).map(zeile).join('; ')}`);
}
const pumpGr = statistik?.kandidaten?.nachRisiko?.pump_verdacht;
if (pumpGr?.anzahl >= 5) p(`Pump-Verdacht im Schattenbuch: n=${pumpGr.anzahl}, Ø ${pumpGr.oe1T ?? '–'} % nach 1 Tag, ${pumpGr.oe1W ?? '–'} % nach 1 Woche`);
p('');

p('## 2. Lektionen');
p((await lies('lernen/lektionen.md'))?.trim() || '(keine)', '');

const pos = await json('positionen.json', { offen: [], vorgemerkt: [] });
p(`## 3. Offene Positionen (${pos.offen.length})`);
for (const o of pos.offen) {
  const k = o.letzterKurs;
  p(
    `- ${o.id}: ${o.plan.wertpapier.name} (${o.plan.wertpapier.isin}) · ${o.kauf.stueck} Stk. Kauf ${o.kauf.kurs} € (${o.kauf.zeit.slice(0, 16)}) · jetzt ${k ? `${k.wert} € (${k.zeit.slice(11, 16)} UTC, ${k.quelle})` : '–'} = ${pct(k?.wert, o.kauf.kurs)} · Ziel ${o.zielkurs} € · Stop ${o.stopkurs} € · Verkauf ${o.verkaufstermin.slice(0, 16)} · Chance war ${o.plan.konfidenz} % · ${o.plan.strategie}`,
    `  These: ${kurz(o.plan.these)}`,
  );
}
if (pos.vorgemerkt.length) p(`Vorgemerkt (noch nicht ausgeführt): ${pos.vorgemerkt.map((o) => `${o.id} ${o.plan.wertpapier.name}`).join('; ')}`);
p('');

const offeneEreignisse = await json('offene-ereignisse.json', []);
if (offeneEreignisse.length && typ !== 'wochenrueckblick') {
  p(`## ⚡ Offene Ereignisse (${offeneEreignisse.length}) – bitte wie im Ereignislauf prüfen und ggf. anpassen`);
  for (const e of offeneEreignisse) p(`- ${e.zeit.slice(0, 16)} UTC · Order ${e.orderId}: ${kurz(e.text, 400)}`);
  p('');
}

if (typ === 'abendlauf' || typ === 'wochenrueckblick') {
  const abg = await json('abgeschlossen.json', { orders: [] });
  const offenBericht = abg.orders.filter((o) => !o.bericht);
  p(`## 4. Abgeschlossen ohne Bericht (${offenBericht.length})`);
  for (const o of offenBericht.slice(0, 8)) {
    p(
      `- ${o.id}: ${o.plan.wertpapier.name} · ${o.plan.strategie} · Chance war ${o.plan.konfidenz} %${o.plan.pflichtOrder ? ' (Pflicht)' : ''} · erhofft ${o.plan.erwarteteRenditeNetto} %`,
      `  Kauf ${o.kauf.kurs} € ${o.kauf.zeit.slice(0, 16)} → Verkauf ${o.verkauf.kurs} € ${o.verkauf.zeit.slice(0, 16)} (${o.verkauf.grund}) · Kurs ${o.ergebnis.kursProzent} % · netto ${o.ergebnis.netto} € (${o.ergebnis.nettoProzent} %) · ETF ${o.etfVergleich?.netto ?? '–'} €`,
      `  These: ${kurz(o.plan.these, 300)}`,
      `  Auslöser: ${kurz(o.plan.ausloeser)} · Signale: ${o.plan.signalIds.join(', ') || '–'} · Anpassungen: ${o.anpassungen.map((a) => `${a.feld}→${a.neu}`).join(', ') || '–'}`,
    );
  }
  if (offenBericht.length > 8) p(`(+${offenBericht.length - 8} weitere – im nächsten Lauf)`);
  // Hot Stuff: Kursraketen und ihre Vorzeichen → Lehren ziehen („hätte man es erkennen können?“)
  const hs = await json('lernen/hotstuff-letzte.json', null);
  if (hs?.mover?.length) {
    p('', `## 🔥 Hot Stuff ${hs.datum}: ${hs.anzahl} Kursraketen, ${hs.abdeckung ?? '–'} % hatten Vorzeichen in unseren Daten`);
    for (const m of hs.mover.slice(0, 10)) p(`- ${m.n}${m.t ? ` (${m.t})` : ''} ${m.typ}${m.r < 0 ? ' ↓' : ' ↑'}: ${m.vorzeichen.length ? m.vorzeichen.slice(0, 4).map((v) => `${v.typ} ${v.tageVorher} T vorher (${v.q.join('/')})`).join(', ') : 'keine Vorzeichen'}`);
    p('Aufgabe: 1–2 `learnings`/Lektionen dazu, welche Vorzeichen künftig ernster genommen werden sollten – oder warum es nicht erkennbar war.');
  }
  if (typ === 'wochenrueckblick') {
    const woche = abg.orders.filter((o) => Date.now() - new Date(o.verkauf.zeit).getTime() < 7 * 864e5);
    p('', `## Diese Woche geschlossen: ${woche.length}, netto ${woche.reduce((s, o) => s + o.ergebnis.netto, 0).toFixed(2)} €`);
    const gew = await json('lernen/gewichtsaenderungen.json', []);
    if (gew.length) p(`Gewichtsänderungen: ${gew.slice(0, 5).map((g) => `${g.name} ${g.alt}→${g.neu}`).join(', ')}`);
  }
  p('');
}

if (typ === 'ereignislauf' && orderArg) {
  const o = pos.offen.find((x) => x.id === orderArg);
  p('## Betroffene Position (vollständig)', o ? JSON.stringify(o, null, 1).slice(0, 6000) : `(Order ${orderArg} nicht offen)`, '');
}

if (typ === 'mittagslauf' || typ === 'morgenlauf') {
  const gel = await json('gelegenheiten.json', { datum: '', liste: [] });
  const liste = gel.datum === datum ? gel.liste : [];
  p(`## ⚡ Gelegenheiten heute (${liste.length}) – Kursraketen, Drift nach Zahlen, Übernahmen`);
  if (!liste.length) p('(keine)');
  for (const g of liste.slice(-25)) p(`- [${g.id}] ${g.wertpapier.name}${g.wertpapier.isin ? ' ' + g.wertpapier.isin : ''}${g.wertpapier.ticker ? ' (' + g.wertpapier.ticker + ')' : ''}: ${kurz(g.fakt, 200)} · ${g.quellen.join(', ')} ${g.link ?? ''}`);
  p('');
}

if (typ === 'morgenlauf' || typ === 'ereignislauf') {
  const lb = (await lies(`lagebild/${datum}.md`)) ?? (await lies('lagebild/heute.md'));
  p('## 5. Lagebild', lb?.trim() || '(heute kein Lagebild – Datensammler prüfen; Auswahl dann mit wenigen gezielten Websuchen)');
}

const pushes = await json('pushes.json', []);
const status = await json('system.json', {});
if (status.hinweise?.length) p('', `Hinweise Kurswächter: ${status.hinweise.join(' | ')}`);
if (pushes.length) p(`Letzte Push: ${pushes[0].titel}`);
console.log(out.join('\n'));
