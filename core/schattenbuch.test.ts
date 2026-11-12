// Plan Volltreffer V0: Schattenbuch entstopfen, r1h nur bei offenem Markt, ehrliche Fallzahlen, Beweisschwelle.
import { describe, expect, it } from 'vitest';
import { autopilotOrders, signalBeweise, type AutopilotEinstellungen } from './autopilot.ts';
import { episodenVertreter, median } from './episoden.ts';
import { marktOffen } from './kalender.ts';
import { r1hBereinigen, schattenbuchSchritt, type SchattenbuchConfig, type TagesKandidat } from './schattenbuch.ts';
import { statistikBerechnen, trackingGruppe, type TrackingEintrag } from './statistik.ts';
import type { Kursbasis } from './typen.ts';

const CFG: SchattenbuchConfig = { kandidatenProTag: 40, maxAbrufeProLauf: 5, maxStartAbrufeProLauf: 60, maxStartVersuche: 3, nyseFeiertage: ['2026-11-26'] };
// Donnerstag, 12.11.2026, 06:00 Berlin (Hauptlauf) bzw. 16:00 Berlin (Stundenlauf, US-Markt offen)
const MORGENS = new Date('2026-11-12T05:00:00Z');
const NACHMITTAGS = new Date('2026-11-12T15:00:00Z');
const kandidat = (i: number, extra: Partial<TagesKandidat> = {}): TagesKandidat => ({ schluessel: `T:K${i}`, name: `Kandidat ${i}`, ticker: `K${i}`, score: 2, typen: ['insider_kauf'], quellen: ['Q'], ...extra });
const eintrag = (extra: Partial<TrackingEintrag>): TrackingEintrag => ({ datum: '2026-11-11', schluessel: 'T:X', name: 'X', ticker: 'X', score: 1, typen: ['nachricht'], quellen: ['Q'], art: 'kandidat', ...extra });

function kursquelle(ohneKurs: (symbol: string) => boolean = () => false) {
  const aufrufe: string[] = [];
  const holen = async (kb: Kursbasis) => {
    aufrufe.push(kb.symbol);
    return ohneKurs(kb.symbol) ? null : 100;
  };
  return { aufrufe, holen };
}

describe('Schattenbuch entstopfen', () => {
  it('neue Kandidaten bekommen den Startkurs vor den Nachmessungen und aus einem eigenen Kontingent', async () => {
    // 70 alte Einträge warten auf ihre 1-Tages-Messung – früher verbrauchten sie das ganze Kontingent
    const liste = [...Array(70)].map((_, i) => eintrag({ schluessel: `T:M${i}`, ticker: `M${i}`, start: 50 }));
    const q = kursquelle();
    const erg = await schattenbuchSchritt(liste, MORGENS, CFG, { modus: 'haupt', kandidaten: [...Array(50)].map((_, i) => kandidat(i)) }, q.holen);
    const heute = liste.filter((t) => t.datum === '2026-11-12');
    expect(heute).toHaveLength(40);
    expect(heute.every((t) => t.start === 100 && t.startZeit === MORGENS.toISOString())).toBe(true);
    expect(q.aufrufe.slice(0, 40)).toEqual([...Array(40)].map((_, i) => `K${i}`));
    expect(erg).toMatchObject({ aufgenommen: 40, startAbrufe: 40, messAbrufe: 5, gemessen: 5, heuteKandidaten: 40, heuteMitStart: 40 });
    expect(liste.filter((t) => typeof t.r1T === 'number')).toHaveLength(5);
  });

  it('Werte ohne abrufbaren Kurs werden durch Nachrücker ersetzt', async () => {
    const liste: TrackingEintrag[] = [];
    const q = kursquelle((s) => ['K3', 'K7', 'K20'].includes(s));
    const erg = await schattenbuchSchritt(liste, MORGENS, CFG, { modus: 'haupt', kandidaten: [...Array(50)].map((_, i) => kandidat(i)) }, q.holen);
    expect(erg.ohneKurs).toEqual(['K3', 'K7', 'K20']);
    expect(liste).toHaveLength(40);
    expect(liste.every((t) => t.start)).toBe(true);
    expect(liste.map((t) => t.ticker)).toContain('K42');
    expect(liste.map((t) => t.ticker)).not.toContain('K7');
  });

  it('gestörte Kursquelle: Kandidaten ohne Startkurs, Nachholen am selben Tag, nie später', async () => {
    const liste: TrackingEintrag[] = [];
    const tot = kursquelle(() => true);
    const erg = await schattenbuchSchritt(liste, MORGENS, CFG, { modus: 'haupt', kandidaten: [...Array(50)].map((_, i) => kandidat(i)) }, tot.holen);
    expect(erg).toMatchObject({ ausfall: true, aufgenommen: 40, heuteMitStart: 0 });
    expect(liste.map((t) => t.ticker)).toEqual([...Array(40)].map((_, i) => `K${i}`));

    // Stundenlauf am selben Tag: die Quelle liefert wieder → alle 40 werden nachgeholt (eigenes Kontingent)
    const ok = kursquelle();
    const spaeter = await schattenbuchSchritt(liste, NACHMITTAGS, CFG, { modus: 'stuendlich' }, ok.holen);
    expect(spaeter).toMatchObject({ nachgeholt: 40, heuteMitStart: 40, startAbrufe: 40 });
    expect(liste.every((t) => t.startZeit === NACHMITTAGS.toISOString())).toBe(true);

    // Eintrag von gestern ohne Startkurs bleibt für immer ohne – ein späterer Kurs wäre ein falscher Startpunkt
    const alt = [eintrag({ schluessel: 'T:ALT', ticker: 'ALT' })];
    const q = kursquelle();
    const morgen = await schattenbuchSchritt(alt, NACHMITTAGS, CFG, { modus: 'stuendlich' }, q.holen);
    expect(morgen.nachgeholt).toBe(0);
    expect(alt[0].start).toBeUndefined();
    expect(q.aufrufe).toHaveLength(0);
  });

  it('höchstens drei Fehlversuche je Eintrag – danach kein Abruf mehr', async () => {
    const liste = [eintrag({ datum: '2026-11-12', schluessel: 'T:NIX', ticker: 'NIX' })];
    const q = kursquelle(() => true);
    for (let i = 0; i < 5; i++) await schattenbuchSchritt(liste, new Date(NACHMITTAGS.getTime() + i * 3600000), CFG, { modus: 'stuendlich' }, q.holen);
    expect(q.aufrufe).toHaveLength(3);
    expect(liste[0]).toMatchObject({ startVersuche: 3 });
    expect(liste[0].start).toBeUndefined();
  });

  it('Claudes Tagesprognosen bekommen ihren Startkurs vor den Kandidaten', async () => {
    const liste = [eintrag({ datum: '2026-11-12', schluessel: 'T:KAND', ticker: 'KAND' }), eintrag({ datum: '2026-11-12', schluessel: 'prognose:us:PROG', ticker: 'PROG', art: 'prognose' })];
    const q = kursquelle();
    await schattenbuchSchritt(liste, NACHMITTAGS, CFG, { modus: 'stuendlich' }, q.holen);
    expect(q.aufrufe).toEqual(['PROG', 'KAND']);
  });

  it('Messung nur im Fenster ihres Messpunkts, pünktliche zuerst', async () => {
    // 4 Handelstage alt: die 1-Tages-Messung ist verpasst und bleibt leer, die 3-Tages-Messung ist fällig
    const alt = eintrag({ datum: '2026-11-06', schluessel: 'T:ALT', ticker: 'ALT', start: 50 });
    const puenktlich = eintrag({ datum: '2026-11-11', schluessel: 'T:NEU', ticker: 'NEU', start: 50 });
    const liste = [alt, puenktlich];
    const q = kursquelle();
    await schattenbuchSchritt(liste, MORGENS, { ...CFG, maxAbrufeProLauf: 1 }, { modus: 'stuendlich' }, q.holen);
    expect(q.aufrufe).toEqual(['NEU']);
    expect(puenktlich.r1T).toBe(100);
    await schattenbuchSchritt(liste, MORGENS, CFG, { modus: 'stuendlich' }, q.holen);
    expect(alt.r1T).toBeUndefined();
    expect(alt.r3T).toBe(100);
  });
});

describe('Reaktion nach 1 Stunde nur bei offenem Markt', () => {
  it('Marktzeiten: US 09:30–16:00 New York, Xetra 09:00–17:30, Krypto immer', () => {
    expect(marktOffen('us', new Date('2026-11-12T15:00:00Z'))).toBe(true); // 10:00 New York
    expect(marktOffen('us', new Date('2026-11-12T05:00:00Z'))).toBe(false); // 06:00 Berlin
    expect(marktOffen('us', new Date('2026-11-12T21:00:00Z'))).toBe(false); // 16:00 New York = Schluss
    expect(marktOffen('us', new Date('2026-11-14T15:00:00Z'))).toBe(false); // Samstag
    expect(marktOffen('us', new Date('2026-11-26T15:00:00Z'), { nyseFeiertage: ['2026-11-26'] })).toBe(false); // Thanksgiving
    expect(marktOffen('us', new Date('2026-07-01T13:45:00Z'))).toBe(true); // Sommerzeit: 09:45 New York
    expect(marktOffen('eu', new Date('2026-11-12T09:00:00Z'))).toBe(true); // 10:00 Berlin
    expect(marktOffen('eu', new Date('2026-11-12T17:00:00Z'))).toBe(false); // 18:00 Berlin
    expect(marktOffen('eu', new Date('2026-12-25T10:00:00Z'))).toBe(false); // Feiertag
    expect(marktOffen('krypto', new Date('2026-11-14T03:00:00Z'))).toBe(true);
  });

  it('Startkurs vor Börsenbeginn → keine 1-Stunden-Messung; Start und Messung im Handel → Messung', async () => {
    const frueh = eintrag({ datum: '2026-11-12', schluessel: 'T:FRUEH', ticker: 'FRUEH', start: 50, startZeit: '2026-11-12T05:00:00Z' });
    const imHandel = eintrag({ datum: '2026-11-12', schluessel: 'T:OFFEN', ticker: 'OFFEN', start: 50, startZeit: '2026-11-12T15:00:00Z' });
    const coin = eintrag({ datum: '2026-11-12', schluessel: 'T:SOL', ticker: 'SOL', markt: 'krypto', start: 50, startZeit: '2026-11-12T05:00:00Z' });
    const q = kursquelle();
    await schattenbuchSchritt([frueh, coin], new Date('2026-11-12T06:00:00Z'), CFG, { modus: 'stuendlich' }, q.holen);
    expect(frueh.r1h).toBeUndefined();
    expect(coin.r1h).toBe(100);
    await schattenbuchSchritt([imHandel], new Date('2026-11-12T16:00:00Z'), CFG, { modus: 'stuendlich' }, q.holen);
    expect(imHandel.r1h).toBe(100);
    // Messung nach Börsenschluss zählt ebenfalls nicht
    const spaet = eintrag({ datum: '2026-11-12', schluessel: 'T:SPAET', ticker: 'SPAET', start: 50, startZeit: '2026-11-12T20:30:00Z' });
    await schattenbuchSchritt([spaet], new Date('2026-11-12T21:30:00Z'), CFG, { modus: 'stuendlich' }, q.holen);
    expect(spaet.r1h).toBeUndefined();
  });

  it('alte Messungen mit Startkurs bei geschlossenem Markt zählen nicht mehr, der Wert bleibt erhalten', () => {
    const t = eintrag({ start: 50, startZeit: '2026-11-11T05:00:00Z', r1h: 0 });
    expect(r1hBereinigen(t)).toBe(true);
    expect(t.r1h).toBeUndefined();
    expect(t.r1hGeschlossen).toBe(0);
    const ok = eintrag({ start: 50, startZeit: '2026-11-11T15:00:00Z', r1h: 1.2 });
    expect(r1hBereinigen(ok)).toBe(false);
    expect(ok.r1h).toBe(1.2);
  });
});

describe('Ehrliche Fallzahlen', () => {
  it('Episoden: derselbe Wert zählt binnen 10 Handelstagen einmal, Vertreter ist der erste Eintrag mit Startkurs', () => {
    const l = [
      { schluessel: 'T:BRK-A', datum: '2026-11-10' },
      { schluessel: 'T:BRK-A', datum: '2026-11-11', start: 5 },
      { schluessel: 'T:BRK-A', datum: '2026-11-12', start: 6 },
      { schluessel: 'T:ZZZ', datum: '2026-11-11', start: 1 },
      { schluessel: 'T:BRK-A', datum: '2026-11-27', start: 7 }, // 11 Handelstage nach dem 12.11. → neue Episode
    ];
    expect(episodenVertreter(l)).toEqual([l[1], l[3], l[4]]);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 40])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('n ist die Zahl der Messungen des Messpunkts, daneben steht der Median', () => {
    // wie „handelsstopp“ am 11.11.: 36 Einträge, aber nur 4 Wochen-Messungen – eine davon ein Ausreißer
    const l: TrackingEintrag[] = [
      ...[180, 4, 2, 2.44].map((r1W, i) => eintrag({ datum: '2026-11-02', schluessel: `T:H${i}`, typen: ['handelsstopp'], start: 1, r1T: 1, r1W })),
      ...[...Array(32)].map((_, i) => eintrag({ datum: '2026-11-09', schluessel: `T:U${i}`, typen: ['handelsstopp'] })),
    ];
    const g = trackingGruppe(l);
    expect(g).toMatchObject({ anzahl: 36, eintraege: 36, n1W: 4, n1T: 4, oe1W: 47.11, med1W: 3.22, quote1W: 100 });
    const st = statistikBerechnen([], l, 'jetzt');
    expect(st.zusammenfassung).not.toContain('n=36');
    expect(st.zusammenfassung).toContain('handelsstopp (n=4)');
  });

  it('Wiederholungen desselben Werts blähen n nicht auf', () => {
    const l = ['2026-11-02', '2026-11-03', '2026-11-04'].map((datum) => eintrag({ datum, schluessel: 'T:BRK-A', start: 1, r1W: 3 }));
    l.push(eintrag({ datum: '2026-11-02', schluessel: 'T:AAA', start: 1, r1W: -1 }));
    expect(trackingGruppe(l)).toMatchObject({ anzahl: 2, eintraege: 4, n1W: 2, oe1W: 1 });
    // Claudes Tagesprognosen: jedes Urteil zählt
    expect(trackingGruppe(l, false)).toMatchObject({ anzahl: 4, n1W: 4 });
  });
});

describe('Autopilot-Beweisschwelle (Monatsprüfung 2026-11, Vorschlag 1)', () => {
  const HUERDEN = { aktie: 0.6, krypto: 0.7 };
  const SCHWELLE = { horizont: 'r3T' as const, mindestFaelle: 30, mindestChance: 55, mindestOeNetto: 1 };
  const fall = (i: number, typ: string, r3T: number): TrackingEintrag => eintrag({ datum: '2026-11-02', schluessel: `T:${typ}${i}`, ticker: `A${i}`, score: 2, typen: [typ], start: 10, r3T });

  it('gewinn_ueberraschung (47 % im Plus, Ø +0,05 %) gilt nicht mehr als bewiesen', () => {
    const l = [...Array(55)].map((_, i) => fall(i, 'gewinn_ueberraschung', i < 26 ? 2 : -0.63));
    const [alt] = signalBeweise(l, { horizont: 'r3T', mindestFaelle: 20, mindestChance: 40 }, HUERDEN);
    expect(alt).toMatchObject({ faelle: 55, chance: 47.3, bewiesen: true });
    const [neu] = signalBeweise(l, SCHWELLE, HUERDEN);
    expect(neu).toMatchObject({ faelle: 55, chance: 47.3, bewiesen: false });
  });

  it('bewiesen ab 30 Fällen, 55 % im Plus und Ø +1 % nach Gebühren – Wiederholungen zählen nicht', () => {
    const gut = [...Array(30)].map((_, i) => fall(i, 'insider_kauf', i < 18 ? 5 : -1));
    expect(signalBeweise(gut, SCHWELLE, HUERDEN)[0]).toMatchObject({ faelle: 30, chance: 60, bewiesen: true });
    expect(signalBeweise(gut.slice(1), SCHWELLE, HUERDEN)[0].bewiesen).toBe(false);
    // derselbe Wert an 30 Tagen hintereinander ist ein Fall, kein Beweis
    const einWert = [...Array(30)].map((_, i) => ({ ...fall(0, 'insider_kauf', 5), datum: `2026-10-${String(1 + i).padStart(2, '0')}` }));
    expect(signalBeweise(einWert, SCHWELLE, HUERDEN)).toHaveLength(0);
  });

  it('die Schwelle gilt auch für die beste Spielart aus dem Varianten-Schattenbuch', () => {
    const E: AutopilotEinstellungen = { aktiv: true, mindestFaelle: 30, mindestChance: 55, mindestOeNetto: 1, horizont: 'r3T', maxJeLauf: 2, maxJeTag: 4, maxOffen: 8, zielNettoProzent: 6, stopProzent: -6, maerkte: ['us', 'krypto'] };
    const k = { schluessel: 'T:FUN', name: 'Six Flags', ticker: 'FUN', score: 3, typen: ['insider_cluster_kauf'], quellen: ['Q'] };
    const variante = (chance: number, oeNetto: number) => [{ typ: 'insider_cluster_kauf', gruppe: 'aktie' as const, beste: { richtung: 'mit' as const, hebel: 1, horizont: 'r3T' as const, faelle: 41, chance, oeNetto, wertung: 0.2, knockout: 0 }, basis: null }];
    // so kaufte der Autopilot am 12.11.2026: 48,8 % im Plus, Ø +0,84 %
    expect(autopilotOrders([k], [], [], MORGENS, E, { varianten: variante(48.8, 0.84) }).ereignisse).toHaveLength(0);
    expect(autopilotOrders([k], [], [], MORGENS, E, { varianten: variante(58, 1.4) }).ereignisse).toHaveLength(1);
  });
});
