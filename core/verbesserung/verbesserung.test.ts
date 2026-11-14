// Plan Volltreffer VS: Leitplanken-Prüfung, Kennzahlen/Bewertung, Wache und Verbesserungsbuch.
import { describe, expect, it } from 'vitest';
import leitplankenDatei from '../../config/verbesserung.json';
import einstellungen from '../../config/einstellungen.json';
import signale from '../../config/signale.json';
import daytrading from '../../config/daytrading.json';
import { monatsVorschlaege, verbesserungsbuch } from './buch.ts';
import { aenderungBewerten, faelligeBewertungen, fensterWert, kennzahlenHeute, KENNZAHLEN, wacheUrteil, zeitreiheFortschreiben, type Zeitreihe } from './kennzahlen.ts';
import { branchPruefen, configPruefen, globPasst, manifestPruefen, mitteilungenPruefen, pfadePruefen, registerPruefen, umfangPruefen, type PruefEingabe } from './pruefung.ts';
import type { Aenderung, DateiAenderung, Leitplanken, Manifest, ProtokollEintrag } from './typen.ts';
import { uebersichtBauen, verbesserungenImZeitraum } from './uebersicht.ts';

const L = leitplankenDatei as unknown as Leitplanken;
const datei = (pfad: string, extra: Partial<DateiAenderung> = {}): DateiAenderung => ({ pfad, status: 'M', plus: 5, minus: 2, ...extra });
const mitAenderung = <T>(basis: T, f: (kopie: T) => void): string => {
  const kopie = JSON.parse(JSON.stringify(basis)) as T;
  f(kopie);
  return JSON.stringify(kopie);
};
const AENDERUNG: Aenderung = { id: 'gewicht-kursrakete', titel: 'Gewicht der Kursrakete senken', bereich: 'datenkrake', kandidat: 'monatspruefung:2026-11:6', hypothese: 'Kursraketen verlieren im Schattenbuch nach einer Woche – ein kleineres Gewicht hält sie aus den Kandidaten.', messkriterium: { kennzahl: 'schattenbuch.quote1T', richtung: 'steigt', ausgangswert: 48, text: 'Anteil der Kandidaten im Plus nach 1 Tag steigt von 48 % auf über 50 %.' }, dateien: ['config/signale.json'] };
const MANIFEST: Manifest = { datum: '2026-11-14', zusammenfassung: 'Gewicht der Kursrakete gesenkt', aenderungen: [AENDERUNG] };
const KENN = Object.keys(KENNZAHLEN);

describe('Leitplanken: Pfade und Umfang', () => {
  it('Pfadmuster', () => {
    expect(globPasst('core/**', 'core/daytrading/auswertung.ts')).toBe(true);
    expect(globPasst('routine/*.md', 'routine/morgenlauf.md')).toBe(true);
    expect(globPasst('routine/*.md', 'routine/unter/x.md')).toBe(false);
    expect(globPasst('**/*.test.ts', 'core/a.test.ts')).toBe(true);
    expect(globPasst('**/*.test.ts', 'a.test.ts')).toBe(true);
    expect(globPasst('.github/**', '.github/workflows/sammler.yml')).toBe(true);
    expect(globPasst('config/signale.json', 'config/signale.jsonx')).toBe(false);
  });

  it('erlaubt: Stellschrauben, neue Quelle, App-Karte, Test, Routinen-Text, Manifest', () => {
    const erlaubt = ['config/signale.json', 'jobs/quellen/usaspending.ts', 'jobs/quellen/zusatz.ts', 'src/views/Lernen.tsx', 'core/lernhinweise.ts', 'core/lernhinweise.test.ts', 'routine/abendlauf.md', 'verbesserung/aenderungen/2026-11-14.json', 'e2e/grundgeruest.spec.ts'];
    expect(pfadePruefen(erlaubt.map((p) => datei(p)), L)).toEqual([]);
  });

  it('verboten: Workflows, Leitplanken, Übernahme, Abrechnung, Mitteilungen, Abhängigkeiten', () => {
    for (const p of ['.github/workflows/sammler.yml', '.github/workflows/neu.yml', 'config/verbesserung.json', 'core/verbesserung/pruefung.ts', 'jobs/verbesserung.ts', 'jobs/lib/verbesserung.ts', 'routine/verbesserung.md', 'core/gebuehren.ts', 'core/waechter.ts', 'core/push.ts', 'package.json', 'package-lock.json', 'jobs/sammler.ts', 'jobs/uebernahme.ts', 'jobs/lib/pushen.ts', 'scripts/daten-sichern.sh', 'schema/entscheidung.schema.json', 'config/gebuehren-smartbroker.json', 'CLAUDE.md', 'STAND.md', 'routine/kontext.mjs', 'vite.config.ts'])
      expect(pfadePruefen([datei(p)], L), p).toHaveLength(1);
    expect(pfadePruefen([datei('../ausbruch.ts')], L)[0]).toMatch(/ungültiger Pfad/);
  });

  it('keine Quelle und kein Test wird gelöscht', () => {
    expect(pfadePruefen([datei('jobs/quellen/gdelt.ts', { status: 'D' })], L)[0]).toMatch(/darf nicht gelöscht/);
    expect(pfadePruefen([datei('core/signale.test.ts', { status: 'D' })], L)[0]).toMatch(/darf nicht gelöscht/);
    expect(pfadePruefen([datei('src/views/Alt.tsx', { status: 'D' })], L)).toEqual([]);
  });

  it('höchstens 400 geänderte Zeilen – Manifest und Demo-Daten zählen nicht', () => {
    expect(umfangPruefen([datei('core/a.ts', { plus: 300, minus: 100 }), datei('demo/daten/statistik.json', { plus: 900, minus: 900 }), datei('verbesserung/aenderungen/2026-11-14.json', { status: 'A', plus: 40, minus: 0 })], L)).toEqual({ zeilen: 400, verstoesse: [] });
    expect(umfangPruefen([datei('core/a.ts', { plus: 301, minus: 100 })], L).verstoesse[0]).toMatch(/401 geänderte Zeilen/);
  });
});

describe('Leitplanken: Stellschrauben in config/', () => {
  const alt = JSON.stringify(einstellungen);
  const pruefe = (f: (e: typeof einstellungen) => void) => configPruefen('config/einstellungen.json', alt, mitAenderung(einstellungen, f), L);

  it('innerhalb der Spanne erlaubt, Hinweistexte frei', () => {
    expect(pruefe((e) => {
      e.autopilot.mindestFaelle = 40;
      e.autopilot.beweisHinweis = 'strenger';
      e.verkaufsregeln.zeitAusstieg.nachTagen = 5;
    })).toEqual([]);
  });

  it('außerhalb der Spanne, gesperrte Werte und entfernte Schlüssel abgelehnt', () => {
    // der Verbesserungslauf darf den Autopiloten strenger machen, aber nicht lockerer als vom Nutzer entschieden
    expect(pruefe((e) => void (e.autopilot.mindestFaelle = 20))[0]).toMatch(/autopilot\.mindestFaelle: 20 liegt außerhalb der Spanne 30 bis 100/);
    expect(pruefe((e) => void (e.autopilot.mindestChance = 45))).toHaveLength(1);
    expect(pruefe((e) => void (e.hebelMax = 200))[0]).toMatch(/hebelMax: keine freigegebene Stellschraube/);
    expect(pruefe((e) => void (e.orderBetrag = 5000))).toHaveLength(1);
    expect(pruefe((e) => void (e.pushTypen.briefing = false))).toHaveLength(1);
    expect(pruefe((e) => void (e.risikoBudget.stopMinProzent = -60))).toHaveLength(1);
    expect(pruefe((e) => void delete (e.autopilot as Partial<typeof e.autopilot>).mindestOeNetto)[0]).toMatch(/darf nicht entfernt werden/);
    expect(configPruefen('config/einstellungen.json', alt, '{kaputt', L)[0]).toMatch(/kein gültiges JSON/);
    expect(configPruefen('config/steuern.json', '{}', '{"a":1}', L)[0]).toMatch(/keine Stellschrauben freigegeben/);
    expect(configPruefen('config/neu.json', null, '{}', L)[0]).toMatch(/nur eine Bau-Sitzung/);
  });

  it('Signalgewichte in Grenzen, neue Signaltypen erlaubt, Grenzen selbst gesperrt', () => {
    const a = JSON.stringify(signale);
    const p = (f: (s: typeof signale) => void) => configPruefen('config/signale.json', a, mitAenderung(signale, f), L);
    expect(p((s) => void (s.typen.kursrakete.gewicht = 0.5))).toEqual([]);
    expect(p((s) => void ((s.typen as Record<string, unknown>).staatsauftrag = { name: 'Staatsauftrag', gewicht: 1, richtung: 1 }))).toEqual([]);
    expect(p((s) => void (s.typen.kursrakete.gewicht = 9))).toHaveLength(1);
    expect(p((s) => void (s.grenzen.max = 10))).toHaveLength(1);
    expect(p((s) => void delete (s.typen as Record<string, unknown>).kursrakete)).not.toEqual([]);
  });

  it('Entscheidungen des Nutzers im Daytrading bleiben gesperrt', () => {
    const a = JSON.stringify(daytrading);
    const p = (f: (d: typeof daytrading) => void) => configPruefen('config/daytrading.json', a, mitAenderung(daytrading, f), L);
    expect(p((d) => void (d.virtuell.aktiv = false))[0]).toMatch(/virtuell\.aktiv: keine freigegebene Stellschraube/);
    expect(p((d) => void (d.spreads.aktie = 0))).toHaveLength(1);
    expect(p((d) => void (d.maxTradesJeTag = 30))).toEqual([]);
    expect(p((d) => void d.nyseFeiertage.push('2028-01-01'))).toEqual([]);
  });
});

describe('Leitplanken: Quellen, Mitteilungen, Manifest', () => {
  it('im Quellen-Register kommt nur dazu', () => {
    const alt = 'export const ZUSATZ_QUELLEN: Quelle[] = [usaSpending, openFda];';
    expect(registerPruefen(alt, 'export const ZUSATZ_QUELLEN: Quelle[] = [usaSpending, openFda, ezbPresse];')).toEqual([]);
    expect(registerPruefen(alt, 'export const ZUSATZ_QUELLEN: Quelle[] = [usaSpending];')[0]).toMatch(/openFda wurde aus dem Register entfernt/);
    expect(registerPruefen(alt, null)).toHaveLength(1);
  });

  it('keine zusätzlichen Mitteilungen', () => {
    expect(mitteilungenPruefen([{ pfad: 'jobs/quellen/neu.ts', zeile: '  return { signale, pushes: [meldung], abfragen: 1 };' }], L)).toHaveLength(1);
    expect(mitteilungenPruefen([{ pfad: 'core/lernhinweise.ts', zeile: 'const n = pushes.push(x);' }], L)).toHaveLength(1);
    expect(mitteilungenPruefen([{ pfad: 'core/neu.test.ts', zeile: 'expect(r.pushes).toEqual([]); const p: PushNachricht = x;' }, { pfad: 'routine/abendlauf.md', zeile: 'pushen( ist nur Text' }, { pfad: 'core/a.ts', zeile: 'const x = 1;' }], L)).toEqual([]);
  });

  it('Manifest: Form, Kennzahl, Umfang, Zuordnung der Dateien', () => {
    const opt = { kennzahlen: KENN, maxAenderungen: 3, geaenderteDateien: ['config/signale.json'] };
    expect(manifestPruefen(MANIFEST, opt)).toEqual({ manifest: MANIFEST, verstoesse: [] });
    expect(manifestPruefen({ ...MANIFEST, aenderungen: [{ ...AENDERUNG, messkriterium: { ...AENDERUNG.messkriterium, kennzahl: 'gefuehl' } }] }, opt).verstoesse[0]).toMatch(/keine bekannte Kennzahl/);
    expect(manifestPruefen({ ...MANIFEST, aenderungen: [1, 2, 3, 4].map((i) => ({ ...AENDERUNG, id: `aenderung-${i}` })) }, opt).verstoesse.join(' ')).toMatch(/4 Änderungen, erlaubt sind 3/);
    expect(manifestPruefen(MANIFEST, { ...opt, geaenderteDateien: ['config/signale.json', 'core/signale.ts'] }).verstoesse[0]).toMatch(/core\/signale\.ts: geändert, aber keiner Änderung im Manifest zugeordnet/);
    expect(manifestPruefen({ ...MANIFEST, aenderungen: [{ ...AENDERUNG, dateien: ['core/erfunden.ts'] }] }, opt).verstoesse.join(' ')).toMatch(/gar nicht geändert/);
    expect(manifestPruefen({ ...MANIFEST, aenderungen: [{ ...AENDERUNG, hypothese: '' }] }, opt).verstoesse[0]).toMatch(/hypothese fehlt/);
    expect(manifestPruefen('kein Objekt', opt).verstoesse).toHaveLength(1);
  });
});

describe('Leitplanken: ganzer Branch', () => {
  const neuSignale = mitAenderung(signale, (s) => void (s.typen.kursrakete.gewicht = 0.5));
  const eingabe = (extra: Partial<PruefEingabe> = {}, dateien = [datei('config/signale.json', { plus: 1, minus: 1 }), datei('verbesserung/aenderungen/2026-11-14.json', { status: 'A', plus: 20, minus: 0 })]): PruefEingabe => ({
    dateien,
    alt: (p) => (p === 'config/signale.json' ? JSON.stringify(signale) : null),
    neu: (p) => (p === 'config/signale.json' ? neuSignale : p === 'verbesserung/aenderungen/2026-11-14.json' ? JSON.stringify(MANIFEST) : null),
    neueZeilen: [{ pfad: 'config/signale.json', zeile: '"gewicht": 0.5' }],
    kennzahlen: KENN,
    ...extra,
  });

  it('eine Stellschraube mit Manifest besteht', () => {
    expect(branchPruefen(eingabe(), L)).toEqual({ ok: true, gruende: [], zeilen: 2, manifest: MANIFEST });
  });

  it('ohne Manifest, mit verbotenem Pfad oder ausgeschaltet → abgelehnt', () => {
    expect(branchPruefen(eingabe({}, [datei('config/signale.json')]), L).gruende.join(' ')).toMatch(/genau ein neues Manifest/);
    const verboten = branchPruefen(eingabe({}, [datei('config/signale.json'), datei('.github/workflows/sammler.yml'), datei('verbesserung/aenderungen/2026-11-14.json', { status: 'A' })]), L);
    expect(verboten.ok).toBe(false);
    expect(verboten.gruende.join(' ')).toMatch(/\.github\/workflows\/sammler\.yml: gesperrt/);
    expect(branchPruefen(eingabe(), { ...L, aktiv: false }).gruende[0]).toMatch(/ausgeschaltet/);
    expect(branchPruefen(eingabe({}, []), L).gruende.join(' ')).toMatch(/keine Änderung gegenüber main/);
  });
});

describe('Kennzahlen, Bewertung und Wache', () => {
  const reihe = (werte: Record<string, number | null>): Zeitreihe => Object.fromEntries(Object.entries(werte).map(([d, w]) => [d, { 'schattenbuch.quote1T': w, 'depot.netto': w }]));
  const CFG = L.bewertung;

  it('Tageswerte: Startkurs-Quote, Quellen, Zeitreihe', () => {
    const jetzt = new Date('2026-11-14T05:00:00Z');
    const k = kennzahlenHeute({
      jetzt,
      heute: '2026-11-14',
      tracking: [
        { datum: '2026-11-14', schluessel: 'T:A', name: 'A', score: 1, typen: [], quellen: [], start: 5 },
        { datum: '2026-11-14', schluessel: 'T:B', name: 'B', score: 1, typen: [], quellen: [] },
        { datum: '2026-11-13', schluessel: 'T:C', name: 'C', score: 1, typen: [], quellen: [] },
      ],
      depot: { netto: -329.31, etfNetto: 14.91, trefferquote: 35.3 },
      quellen: [{ zuletztOk: '2026-11-14T04:00:00Z', signale: 3 }, { zuletztOk: '2026-11-02T04:00:00Z', signale: 0 }, { signale: 0 }],
      zeugnisNote: 4.9,
    });
    expect(k).toMatchObject({ 'schattenbuch.startkursQuote': 50, 'depot.netto': -329.31, 'depot.vsEtf': -344.22, 'quellen.ok': 1, 'quellen.ohneSignale': 2, 'zeugnis.note': 4.9, 'daytrading.netto': null });
    expect(Object.keys(k).sort()).toEqual(KENN.sort());
    const z = zeitreiheFortschreiben({ '2026-01-01': { a: 1 }, '2026-11-13': { a: 2 } }, '2026-11-14', { a: 3 });
    expect(Object.keys(z)).toEqual(['2026-11-13', '2026-11-14']);
  });

  it('Fensterwert: Mittel für Stände, Veränderung je Tag für Summen', () => {
    const r = reihe({ '2026-11-01': 40, '2026-11-02': 44, '2026-11-03': 48, '2026-11-05': 60 });
    expect(fensterWert(r, 'schattenbuch.quote1T', '2026-11-01', '2026-11-03')).toBe(44);
    expect(fensterWert(r, 'depot.netto', '2026-11-01', '2026-11-05')).toBe(5);
    expect(fensterWert(r, 'schattenbuch.quote1T', '2026-11-04', '2026-11-05')).toBeNull();
  });

  it('bewertet erst nach 14 Tagen: besser, schlechter, nicht messbar', () => {
    const vorher = { '2026-11-08': 46, '2026-11-10': 48, '2026-11-12': 50 };
    const besser = reihe({ ...vorher, '2026-11-20': 55, '2026-11-24': 57, '2026-11-27': 56 });
    expect(aenderungBewerten(AENDERUNG, '2026-11-14', besser, '2026-11-21', CFG)).toBeNull();
    expect(aenderungBewerten(AENDERUNG, '2026-11-14', besser, '2026-11-28', CFG)).toMatchObject({ urteil: 'besser', vorher: 48, nachher: 56 });
    const schlechter = reihe({ ...vorher, '2026-11-20': 41, '2026-11-24': 40, '2026-11-27': 42 });
    const b = aenderungBewerten(AENDERUNG, '2026-11-14', schlechter, '2026-11-28', CFG)!;
    expect(b.urteil).toBe('schlechter');
    expect(b.text).toMatch(/sollte steigen/);
    expect(aenderungBewerten({ ...AENDERUNG, messkriterium: { ...AENDERUNG.messkriterium, richtung: 'faellt' } }, '2026-11-14', schlechter, '2026-11-28', CFG)!.urteil).toBe('besser');
    // zu wenige Tageswerte: warten bis zum spätesten Termin, dann „nicht messbar“
    expect(aenderungBewerten(AENDERUNG, '2026-11-14', reihe(vorher), '2026-11-30', CFG)).toBeNull();
    expect(aenderungBewerten(AENDERUNG, '2026-11-14', reihe(vorher), '2026-12-12', CFG)!.urteil).toBe('nicht messbar');
  });

  it('fällige Bewertungen: nur einmal und nicht für Zurückgenommenes', () => {
    const u: ProtokollEintrag = { typ: 'uebernommen', zeit: '2026-11-14T12:00:00Z', datum: '2026-11-14', branch: 'claude/verbesserung-2026-11-14', sha: 'a', merge: 'm1', zeilen: 2, tests: { unit: 1, e2e: 1 }, zusammenfassung: 'x', aenderungen: [AENDERUNG] };
    const r = reihe({ '2026-11-08': 46, '2026-11-10': 48, '2026-11-12': 50, '2026-11-20': 41, '2026-11-24': 40, '2026-11-27': 42 });
    const neu = faelligeBewertungen([u], r, '2026-11-28', '2026-11-28T05:00:00Z', CFG);
    expect(neu).toHaveLength(1);
    expect(neu[0]).toMatchObject({ typ: 'bewertet', merge: 'm1', aenderung: 'gewicht-kursrakete', urteil: 'schlechter' });
    expect(faelligeBewertungen([u, ...neu], r, '2026-11-29', 'x', CFG)).toEqual([]);
    expect(faelligeBewertungen([u, { typ: 'zurueckgenommen', zeit: 'x', merge: 'm1', revert: 'r', grund: 'g', ausloeser: 'nutzer' }], r, '2026-11-28', 'x', CFG)).toEqual([]);
  });

  it('Wache: zwei Ausfälle in Folge nach der Übernahme', () => {
    const seit = '2026-11-14T12:00:00Z';
    const l = (workflow: string, createdAt: string, conclusion: string | null) => ({ workflow, createdAt, conclusion });
    expect(wacheUrteil([l('sammler.yml', '2026-11-14T13:00:00Z', 'failure'), l('sammler.yml', '2026-11-14T14:00:00Z', 'failure'), l('waechter.yml', '2026-11-14T14:00:00Z', 'success')], seit, 2)).toBe('sammler.yml');
    expect(wacheUrteil([l('sammler.yml', '2026-11-14T13:00:00Z', 'failure'), l('sammler.yml', '2026-11-14T14:00:00Z', 'success')], seit, 2)).toBeNull();
    expect(wacheUrteil([l('sammler.yml', '2026-11-14T13:00:00Z', 'success'), l('sammler.yml', '2026-11-14T14:00:00Z', 'failure')], seit, 2)).toBeNull();
    // Ausfälle vor der Übernahme und laufende/abgebrochene Läufe zählen nicht
    expect(wacheUrteil([l('sammler.yml', '2026-11-14T10:00:00Z', 'failure'), l('sammler.yml', '2026-11-14T11:00:00Z', 'failure'), l('sammler.yml', '2026-11-14T13:00:00Z', 'failure'), l('sammler.yml', '2026-11-14T14:00:00Z', null), l('sammler.yml', '2026-11-14T15:00:00Z', 'cancelled')], seit, 2)).toBeNull();
  });
});

describe('Verbesserungsbuch', () => {
  const MD = '# Monatsprüfung\n\nText.\n\n## Vorschläge\n1. **autopilot:** Freigabe nur bei n ≥ 30. – Beleg 47,3 %/Ø +0,05 % (n=55).\n5. **depot:** Mindest-Stopabstand an die Schwankung koppeln. – Stop-Verkäufe 0/6 im Plus, Ø −7,88 %.\n8. **quellen:** gettex-Scanner filtern. – 1 W Ø −26,33 % (n=10).\n';
  const jetzt = new Date('2026-11-14T08:00:00Z');
  const basis = { jetzt, heute: '2026-11-14', protokoll: [] as ProtokollEintrag[] };

  it('liest die Vorschläge der Monatsprüfung mit Bereich und Beleg', () => {
    const v = monatsVorschlaege('2026-11', MD);
    expect(v.map((k) => k.id)).toEqual(['monatspruefung:2026-11:1', 'monatspruefung:2026-11:5', 'monatspruefung:2026-11:8']);
    expect(v[1]).toMatchObject({ bereich: 'depot', titel: 'Mindest-Stopabstand an die Schwankung koppeln.', beleg: 'Stop-Verkäufe 0/6 im Plus, Ø −7,88 %.', herkunft: 'monatspruefung' });
    expect(v[2].bereich).toBe('quellen');
    expect(monatsVorschlaege('2026-11', MD.replace(/\n/g, '\r\n')).map((k) => k.id)).toEqual(v.map((k) => k.id));
  });

  it('Rang: Rücknahme vor Fehler vor Monatsprüfung vor Zeugnis; Erledigtes fehlt', () => {
    const protokoll: ProtokollEintrag[] = [
      { typ: 'uebernommen', zeit: '2026-10-17T12:00:00Z', datum: '2026-10-17', branch: 'b', sha: 's', merge: 'abcdef1234', zeilen: 1, tests: { unit: 1, e2e: 1 }, zusammenfassung: 'x', aenderungen: [AENDERUNG] },
      { typ: 'bewertet', zeit: '2026-11-13T05:00:00Z', merge: 'abcdef1234', aenderung: 'gewicht-kursrakete', kennzahl: 'schattenbuch.quote1T', urteil: 'schlechter', vorher: 48, nachher: 41, text: '„Gewicht“: 48 → 41 % – schlechter.' },
    ];
    const { kandidaten } = verbesserungsbuch(
      {
        ...basis,
        protokoll,
        monatspruefung: { monat: '2026-11', text: MD },
        zeugnis: { kw: 46, faecher: [{ fach: 'Depot gegen MSCI World', note: 5, gewicht: 3, wert: '-1,48 % je Order (6 Orders)' }, { fach: 'Claudes Tagesprognose', note: 2, gewicht: 1, wert: '61,1 % richtig' }] },
        lernhinweise: ['53 % der Verkäufe waren Stops → Stops zu eng oder Einstiege zu früh.'],
        issues: [{ nummer: 7, titel: 'Kurve zeigt `falsche`\nWerte' }],
        erledigt: ['monatspruefung:2026-11:1'],
      },
      L,
    );
    expect(kandidaten.map((k) => k.id).slice(0, 5)).toEqual(['ruecknahme:abcdef1:gewicht-kursrakete', 'fehler:7', 'monatspruefung:2026-11:5', 'monatspruefung:2026-11:8', 'zeugnis:depot-gegen-msci-world']);
    expect(kandidaten[1].titel).toBe('Fehler-Issue #7: Kurve zeigt falsche Werte');
    expect(kandidaten.find((k) => k.id === 'zeugnis:depot-gegen-msci-world')).toMatchObject({ rang: 36, bereich: 'depot', seit: '2026-11-14' });
    expect(kandidaten.some((k) => k.id === 'monatspruefung:2026-11:1' || k.id.startsWith('zeugnis:claudes'))).toBe(false);
    expect(kandidaten.some((k) => k.herkunft === 'quellenidee')).toBe(true);
  });

  it('frisch umgesetzte Kandidaten sind vier Wochen gesperrt, nach einer Rücknahme wieder offen', () => {
    const u: ProtokollEintrag = { typ: 'uebernommen', zeit: '2026-11-07T12:00:00Z', datum: '2026-11-07', branch: 'b', sha: 's', merge: 'm1', zeilen: 1, tests: { unit: 1, e2e: 1 }, zusammenfassung: 'x', aenderungen: [{ ...AENDERUNG, kandidat: 'monatspruefung:2026-11:5' }] };
    const ids = (protokoll: ProtokollEintrag[]) => verbesserungsbuch({ ...basis, protokoll, monatspruefung: { monat: '2026-11', text: MD } }, L).kandidaten.map((k) => k.id);
    expect(ids([u])).not.toContain('monatspruefung:2026-11:5');
    expect(ids([u, { typ: 'zurueckgenommen', zeit: 'x', merge: 'm1', revert: 'r', grund: 'g', ausloeser: 'nutzer' }])).toContain('monatspruefung:2026-11:5');
  });

  it('Quellen: Ausfall sofort, „ohne Signal“ erst nach 7 Tagen, fehlender Schlüssel nur als Randnotiz', () => {
    const quellen = [
      { id: 'gdelt', name: 'GDELT', zuletztOk: '2026-11-02T19:52:39Z', signale: 0, letzterFehler: 'HTTP 429' },
      { id: 'fred', name: 'FRED', zuletztOk: '2026-11-14T07:00:00Z', signale: 0 },
      { id: 'youtube', name: 'YouTube', letzterFehler: '2026-10-21: Schlüssel YOUTUBE_API_KEY fehlt' },
      { id: 'rss', name: 'RSS', zuletztOk: '2026-11-14T07:00:00Z', signale: 12 },
    ];
    const erster = verbesserungsbuch({ ...basis, quellen }, L);
    expect(erster.kandidaten.find((k) => k.id === 'quelle:gdelt:ausfall')).toMatchObject({ rang: 45, bereich: 'quellen' });
    expect(erster.kandidaten.find((k) => k.id === 'quelle:youtube:schluessel')?.rang).toBe(8);
    expect(erster.kandidaten.some((k) => k.id === 'quelle:fred:ohne-signale')).toBe(false);
    expect(erster.ohneSignaleSeit).toEqual({ fred: '2026-11-14' });
    const spaeter = verbesserungsbuch({ ...basis, heute: '2026-11-21', jetzt: new Date('2026-11-21T08:00:00Z'), quellen: quellen.map((q) => (q.id === 'fred' ? { ...q, zuletztOk: '2026-11-21T07:00:00Z' } : q)), ohneSignaleSeit: erster.ohneSignaleSeit, vorher: erster.kandidaten }, L);
    expect(spaeter.kandidaten.find((k) => k.id === 'quelle:fred:ohne-signale')?.titel).toMatch(/seit 7 Tagen kein Signal/);
    expect(spaeter.kandidaten.find((k) => k.id === 'quelle:gdelt:ausfall')?.seit).toBe('2026-11-14');
  });
});

describe('Übersicht „Was sich verbessert hat“', () => {
  it('zeigt Übernahmen mit Urteil und Rücknahme, Ablehnungen und offene Freigaben', () => {
    const p: ProtokollEintrag[] = [
      { typ: 'uebernommen', zeit: '2026-11-14T12:30:00Z', datum: '2026-11-14', branch: 'b', sha: 's1', merge: 'm1', zeilen: 12, tests: { unit: 250, e2e: 36 }, zusammenfassung: 'Gewicht gesenkt', aenderungen: [AENDERUNG], freigaben: [{ titel: 'Schlüssel für Quelle X', anleitung: 'Konto anlegen …', secret: 'X_API_KEY' }] },
      { typ: 'abgelehnt', zeit: '2026-11-21T12:30:00Z', branch: 'claude/verbesserung-2026-11-21', sha: 's2', gruende: ['.github/workflows/sammler.yml: gesperrt'], link: 'https://github.com/x/y/pull/3' },
      { typ: 'bewertet', zeit: '2026-11-28T05:00:00Z', merge: 'm1', aenderung: 'gewicht-kursrakete', kennzahl: 'schattenbuch.quote1T', urteil: 'besser', vorher: 48, nachher: 56, text: 'besser' },
    ];
    const u = uebersichtBauen(p, [], L, '2026-11-28T06:00:00Z', 'x/y');
    expect(u.rueckgaengigLink).toBe('https://github.com/x/y/actions/workflows/verbesserung-zurueck.yml');
    expect(u.uebernahmen[0]).toMatchObject({ merge: 'm1', status: 'aktiv', aenderungen: [{ titel: AENDERUNG.titel, urteil: 'besser', messkriterium: AENDERUNG.messkriterium.text }] });
    expect(u.abgelehnt[0].gruende).toEqual(['.github/workflows/sammler.yml: gesperrt']);
    expect(u.freigaben).toHaveLength(1);
    const zurueck = uebersichtBauen([...p, { typ: 'zurueckgenommen', zeit: 'x', merge: 'm1', revert: 'r1', grund: 'zwei Ausfälle', ausloeser: 'wache' }], [], L, '2026-11-28T06:00:00Z', 'x/y');
    expect(zurueck.uebernahmen[0]).toMatchObject({ status: 'zurückgenommen', grund: 'zwei Ausfälle' });
    expect(zurueck.freigaben).toEqual([]);
    expect(verbesserungenImZeitraum(p, '2026-11-09', '2026-11-15')).toEqual([AENDERUNG.titel]);
    expect(verbesserungenImZeitraum(p, '2026-11-16', '2026-11-22')).toEqual([]);
  });
});
