// Rückblick und Musterprüfung (Plan Volltreffer V3, mit Sprung-Zensus aus V2): rechnet über die ganze Kursgeschichte
// im privaten Archiv (US-Aktien, Kraken-Coins) für jeden handelbaren Wert und Tag aus, ob eine 1.000-€-Order ein
// Volltreffer geworden wäre, und prüft Merkmale, Zweierkombinationen und Hypothesen in zwei getrennten Zeiträumen.
// Aufruf: node jobs/rueckblick.ts   (ARCHIV_DIR = Checkout des privaten Archivs, DATEN_DIR = Datenzweig)
// Öffentlich (DATEN_DIR/lernen/muster/): nur verdichtete Kennzahlen. Privat (ARCHIV_DIR/auswertung/): Zensus mit Werten.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';
import { orderentgelt } from '../core/gebuehren.ts';
import { parseKryptoKerzenArchiv, parseUsArchiv, parseUsSplitsArchiv } from '../core/sammelkurse.ts';
import { etikett, spielarten, spielartText, sprungEpisoden, type EtikettKosten, type Kerze, type Spielart } from '../core/volltreffer/etikett.ts';
import { klasse, klassenName, merkmale, type Einteilung, type Merkmale } from '../core/volltreffer/merkmale.ts';
import { HYPOTHESEN, hypothesenFaelle, pruefen, Zaehlwerk, type Pruefergebnis } from '../core/volltreffer/pruefung.ts';
import { istUsAktie, kryptoPaar, median, splitBereinigen, unbekannteSplitsTeilen, type Split } from '../core/volltreffer/reihen.ts';
import { ladeConfig, leseJson, schreibeJson } from './lib/dateien.ts';

type Markt = 'aktie' | 'krypto';
interface VtConfig {
  etikett: { einsatz: number; ziel: number; beinahe: number; hebel: number[]; stops: number[]; standardStop: number; fenster: number[]; episodeAbstand: number; finanzierungProzentJahr: number; turboSpreadKlasse: string; turboEmittent: string };
  handelbar: {
    aktie: { mindestKurs: number; mindestUmsatzStichtag: number; turboAbUmsatz20: number; spread: { abUmsatz20: number; klasse: string }[]; handelsplatz: string };
    krypto: { mindestUmsatzStichtag: number; turboBasiswerte: string[]; ohneBasis: string[]; mindestSchwankung20: number; spreadKlasse: string; handelsplatz: string };
  };
  pruefung: { mindestFaelle: number; sperreTage: number; paareFenster: number[]; rangliste: number; einteilungen: Einteilung[] };
}

const t0 = Date.now();
const ARCHIV = process.env.ARCHIV_DIR ?? '_archiv';
const vt = JSON.parse(readFileSync(join(process.cwd(), 'config', 'volltreffer.json'), 'utf8')) as VtConfig;
const cfg = ladeConfig();
const jetzt = new Date(process.env.JETZT ?? Date.now());
const heute = jetzt.toISOString().slice(0, 10);
const log = (text: string) => console.log(`[${Math.round((Date.now() - t0) / 1000)} s] ${text}`);
const gz = (pfad: string) => gunzipSync(readFileSync(pfad)).toString('utf8');
const tagesDateien = (markt: string) => {
  const o = join(ARCHIV, markt);
  if (!existsSync(o)) return [];
  return readdirSync(o)
    .flatMap((jahr) => (/^\d{4}$/.test(jahr) ? readdirSync(join(o, jahr)).map((d) => join(o, jahr, d)) : []))
    .filter((p) => /\d{4}-\d{2}-\d{2}\.csv\.gz$/.test(p))
    .sort();
};
const datumAus = (pfad: string) => pfad.match(/(\d{4}-\d{2}-\d{2})\.csv\.gz$/)![1];

if (!existsSync(ARCHIV)) {
  console.error(`Archiv-Ordner ${ARCHIV} fehlt (Checkout des privaten Repos).`);
  process.exit(1);
}

// ---------- 1. Reihen laden ----------
interface Reihe {
  schluessel: string;
  markt: Markt;
  kerzen: Kerze[];
}
const reihen: Reihe[] = [];

// US-Aktien: eine Datei je Handelstag mit allen Werten → je Wert eine Reihe
{
  const dateien = tagesDateien('us');
  const je = new Map<string, Kerze[]>();
  for (const p of dateien) {
    const datum = datumAus(p);
    for (const k of parseUsArchiv(gz(p)).values()) {
      if (k.otc || !istUsAktie(k.ticker)) continue;
      let r = je.get(k.ticker);
      if (!r) je.set(k.ticker, (r = []));
      r.push({ datum, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
  }
  const splitDatei = join(ARCHIV, 'stamm', 'us-splits.csv.gz');
  const splits = new Map<string, Split[]>();
  if (existsSync(splitDatei)) for (const s of parseUsSplitsArchiv(gz(splitDatei))) (splits.get(s.ticker) ?? splits.set(s.ticker, []).get(s.ticker)!).push(s);
  let geteilt = 0;
  for (const [ticker, kerzen] of je) {
    const teile = unbekannteSplitsTeilen(splitBereinigen(kerzen, splits.get(ticker) ?? []));
    geteilt += teile.length - 1;
    teile.forEach((t, n) => reihen.push({ schluessel: `T:${ticker}${n ? `#${n}` : ''}`, markt: 'aktie', kerzen: t }));
  }
  log(`US: ${dateien.length} Handelstage, ${je.size} Aktien, ${[...splits.values()].flat().length} gemeldete Splits, ${geteilt} Reihen an nicht gemeldeten Splits geteilt.`);
}

// Krypto: Tageskerzen aller Kraken-Paare → je Coin eine Reihe (Euro bevorzugt, sonst Dollar)
{
  const dateien = tagesDateien('krypto-kerzen');
  const je = new Map<string, Map<string, Kerze[]>>();
  const ohne = new Set(vt.handelbar.krypto.ohneBasis);
  for (const p of dateien) {
    const datum = datumAus(p);
    for (const k of parseKryptoKerzenArchiv(gz(p)).values()) {
      const pq = kryptoPaar(k.name);
      if (!pq || ohne.has(pq.basis)) continue;
      const nachQuote = je.get(pq.basis) ?? je.set(pq.basis, new Map()).get(pq.basis)!;
      (nachQuote.get(pq.quote) ?? nachQuote.set(pq.quote, []).get(pq.quote)!).push({ datum, o: k.o, h: k.h, l: k.l, c: k.c, v: k.v });
    }
  }
  for (const [basis, nachQuote] of je) {
    const kerzen = nachQuote.get('EUR') ?? nachQuote.get('USD');
    if (kerzen?.length) reihen.push({ schluessel: `K:${basis}`, markt: 'krypto', kerzen });
  }
  log(`Krypto: ${dateien.length} Tage, ${je.size} Coins.`);
}
if (!reihen.length) {
  console.error('Keine Kursreihen im Archiv – erst die Kursgeschichte laden (Workflow historie.yml).');
  process.exit(1);
}

// ---------- 2. Kosten je Wertklasse ----------
const spreadProzent = (klasseName: string) => (cfg.spreads.klassen as Record<string, { prozent: number }>)[klasseName]?.prozent ?? 3;
const kosten = (markt: Markt, umsatz20: number | null): EtikettKosten => {
  const h = vt.handelbar;
  const e = vt.etikett;
  const basis = { einsatz: e.einsatz, ziel: e.ziel, beinahe: e.beinahe, turboSpreadProzent: spreadProzent(e.turboSpreadKlasse), entgeltTurbo: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.aktie.handelsplatz, emittent: e.turboEmittent }).gesamt, finanzierungProzentJahr: e.finanzierungProzentJahr };
  if (markt === 'krypto') return { ...basis, spreadProzent: spreadProzent(h.krypto.spreadKlasse), entgeltDirekt: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.krypto.handelsplatz }).gesamt };
  const klasseName = h.aktie.spread.find((s) => (umsatz20 ?? 0) >= s.abUmsatz20)?.klasse ?? 'spekulativ';
  return { ...basis, spreadProzent: spreadProzent(klasseName), entgeltDirekt: orderentgelt(e.einsatz, cfg.gebuehren, { handelsplatz: h.aktie.handelsplatz }).gesamt };
};
const kostenCache = new Map<string, EtikettKosten>();
const kostenFuer = (markt: Markt, umsatz20: number | null) => {
  const s = markt === 'krypto' ? 'krypto' : (vt.handelbar.aktie.spread.find((x) => (umsatz20 ?? 0) >= x.abUmsatz20)?.klasse ?? 'spekulativ');
  return kostenCache.get(s) ?? kostenCache.set(s, kosten(markt, umsatz20)).get(s)!;
};

/** Gilt der Wert am Stichtag als handelbar (Näherung)? */
function handelbar(r: Reihe, m: Merkmale, k: Kerze): boolean {
  if (r.markt === 'aktie') return m.kurs >= vt.handelbar.aktie.mindestKurs && (k.v ?? 0) * k.c >= vt.handelbar.aktie.mindestUmsatzStichtag;
  return (k.v ?? 0) * k.c >= vt.handelbar.krypto.mindestUmsatzStichtag && (m.schwankung20 === null || m.schwankung20 >= vt.handelbar.krypto.mindestSchwankung20);
}
const turboErlaubt = (r: Reihe, m: Merkmale) => (r.markt === 'krypto' ? vt.handelbar.krypto.turboBasiswerte.includes(r.schluessel.slice(2)) : (m.umsatz20 ?? 0) >= vt.handelbar.aktie.turboAbUmsatz20);

// ---------- 3. Durchgang 1: Merkmale, Marktbewegung je Tag, Zeiträume ----------
// Merkmale werden nicht vorgehalten (Speicher), sondern im zweiten Durchgang neu berechnet
const r1JeTag: Record<Markt, Map<string, number[]>> = { aktie: new Map(), krypto: new Map() };
for (const r of reihen) {
  r.kerzen.forEach((_, i) => {
    const x = merkmale(r.kerzen, i);
    if (!x || !handelbar(r, x, r.kerzen[i])) return;
    const d = r.kerzen[i].datum;
    (r1JeTag[r.markt].get(d) ?? r1JeTag[r.markt].set(d, []).get(d)!).push(x.r1);
  });
}
const marktR1: Record<Markt, Map<string, number>> = { aktie: new Map(), krypto: new Map() };
for (const markt of ['aktie', 'krypto'] as Markt[]) for (const [d, xs] of r1JeTag[markt]) marktR1[markt].set(d, xs.length >= 20 ? median(xs) : 0);
const alleTage = [...new Set([...r1JeTag.aktie.keys(), ...r1JeTag.krypto.keys()])].sort();
const grenze = alleTage[Math.floor(alleTage.length / 2)] ?? heute;
log(`Merkmale berechnet. Stichtage von ${alleTage[0]} bis ${alleTage[alleTage.length - 1]}; Zeitraum B ab ${grenze}.`);

// ---------- 4. Gruppen und Zählwerk ----------
const E = vt.pruefung.einteilungen;
const MAERKTE: Markt[] = ['aktie', 'krypto'];
const gruppen: string[] = [];
const gid = new Map<string, number>();
const neueGruppe = (name: string) => (gid.has(name) ? gid.get(name)! : (gid.set(name, gruppen.length), gruppen.push(name), gruppen.length - 1));
const klassenZahl = (e: Einteilung) => e.grenzen.length + 1;
for (const markt of MAERKTE) {
  neueGruppe(`${markt}|alle`);
  E.forEach((e, a) => {
    for (let c = 0; c < klassenZahl(e); c++) neueGruppe(`${markt}|${a}=${c}`);
  });
  for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) for (let ca = 0; ca < klassenZahl(E[a]); ca++) for (let cb = 0; cb < klassenZahl(E[b]); cb++) neueGruppe(`${markt}|${a}=${ca}&${b}=${cb}`);
  for (const h of HYPOTHESEN) if (h.markt === 'alle' || h.markt === markt) neueGruppe(`${markt}|hyp=${h.nr}`);
}
const SP = spielarten(vt.etikett.hebel, vt.etikett.stops);
const F = vt.etikett.fenster;
const standard = SP.map((s) => s.stopEuro === vt.etikett.standardStop);
const paarF = F.map((f) => vt.pruefung.paareFenster.includes(f));
const zw = new Zaehlwerk(gruppen.length, SP.length, F.length, 2);
log(`${gruppen.length} Gruppen, ${SP.length} Spielarten, ${F.length} Fenster.`);

const merkmalWert = (e: Einteilung, m: Merkmale, kontext: { marktR1: number; ueberrendite1: number }): number | null =>
  e.merkmal === 'marktR1' ? kontext.marktR1 : e.merkmal === 'ueberrendite1' ? kontext.ueberrendite1 : (m[e.merkmal as keyof Merkmale] as number | null);

// ---------- 5. Durchgang 2: Etiketten, Zensus, Hypothesen ----------
interface Episode {
  datum: string;
  schluessel: string;
  markt: Markt;
  spielart: string;
  fenster: number;
  netto: number;
  tag: number;
  umsatz20: number | null;
  r1: number;
  relVolumen: number | null;
}
const episoden: Episode[] = [];
let stichtage = 0;
const hypFaelle: Record<string, number> = {};

for (const r of reihen) {
  const k = r.kerzen;
  const m = k.map((_, i) => merkmale(k, i));
  const treffer: boolean[] = new Array(k.length).fill(false);
  const bester: (Episode | null)[] = new Array(k.length).fill(null);
  const ausg = (i: number, sp: Spielart, x: Merkmale) => etikett(k, i, sp, kostenFuer(r.markt, x.umsatz20), F);
  for (let i = 1; i < k.length - 1; i++) {
    const x = m[i];
    if (!x || !handelbar(r, x, k[i])) continue;
    stichtage++;
    const mr = marktR1[r.markt].get(k[i].datum) ?? 0;
    const kontext = { marktR1: mr, ueberrendite1: x.r1 - mr };
    const z = k[i].datum < grenze ? 0 : 1;
    const klassen = E.map((e) => klasse(merkmalWert(e, x, kontext), e.grenzen));
    const gAlle = gid.get(`${r.markt}|alle`)!;
    const gEinzel = klassen.map((c, a) => (c === null ? -1 : gid.get(`${r.markt}|${a}=${c}`)!));
    const gPaare: number[] = [];
    for (let a = 0; a < E.length; a++) for (let b = a + 1; b < E.length; b++) if (klassen[a] !== null && klassen[b] !== null) gPaare.push(gid.get(`${r.markt}|${a}=${klassen[a]}&${b}=${klassen[b]}`)!);
    const turbo = turboErlaubt(r, x);
    SP.forEach((sp, s) => {
      if (sp.hebel > 1 && !turbo) return;
      const a = ausg(i, sp, x);
      a.forEach((au, f) => {
        if (!au) return;
        zw.add(gAlle, s, f, z, au);
        if (!standard[s]) return;
        for (const g of gEinzel) if (g >= 0) zw.add(g, s, f, z, au);
        if (paarF[f]) for (const g of gPaare) zw.add(g, s, f, z, au);
        // Zensus: Volltreffer mit Standard-Stop binnen 10 Handelstagen
        if (au.art === 'treffer' && F[f] <= 10 && (!bester[i] || au.netto > bester[i]!.netto)) {
          treffer[i] = true;
          bester[i] = { datum: k[i].datum, schluessel: r.schluessel.replace(/#\d+$/, ''), markt: r.markt, spielart: spielartText(sp), fenster: F[f], netto: au.netto, tag: au.tag, umsatz20: x.umsatz20, r1: Math.round(x.r1 * 10) / 10, relVolumen: x.relVolumen === null ? null : Math.round(x.relVolumen * 10) / 10 };
        }
      });
    });
  }
  for (const i of sprungEpisoden(treffer, vt.etikett.episodeAbstand)) if (bester[i]) episoden.push(bester[i]!);
  // Hypothesen: eigene Fälle (derselbe Wert erst nach der Sperre wieder)
  for (const h of HYPOTHESEN) {
    if (h.markt !== 'alle' && h.markt !== r.markt) continue;
    const g = gid.get(`${r.markt}|hyp=${h.nr}`)!;
    for (const i of hypothesenFaelle(h, k, m, vt.pruefung.sperreTage)) {
      const x = m[i];
      if (!x || i >= k.length - 1 || !handelbar(r, x, k[i])) continue;
      hypFaelle[h.nr] = (hypFaelle[h.nr] ?? 0) + 1;
      const z = k[i].datum < grenze ? 0 : 1;
      const turbo = turboErlaubt(r, x);
      SP.forEach((sp, s) => {
        if (sp.hebel > 1 && !turbo) return;
        ausg(i, sp, x).forEach((au, f) => au && zw.add(g, s, f, z, au));
      });
    }
  }
}
log(`${stichtage} handelbare Stichtage, ${episoden.length} Sprung-Episoden, Hypothesen-Fälle: ${JSON.stringify(hypFaelle)}.`);

// ---------- 6. Auswertung ----------
const gruppenText = (name: string) => {
  const [markt, rest] = name.split('|');
  const marktText = markt === 'aktie' ? 'Aktien' : 'Krypto';
  if (rest === 'alle') return `${marktText}: alle handelbaren Stichtage`;
  if (rest.startsWith('hyp=')) {
    const h = HYPOTHESEN.find((x) => x.nr === rest.slice(4))!;
    return `${marktText}: ${h.nr} ${h.name}`;
  }
  return `${marktText}: ${rest
    .split('&')
    .map((t) => {
      const [a, c] = t.split('=').map(Number);
      return `${E[a].merkmal} ${klassenName(E[a], c)}`;
    })
    .join(' und ')}`;
};
const ergebnisse: (Pruefergebnis & { schluessel: string; art: 'alle' | 'einzel' | 'paar' | 'hypothese' })[] = [];
for (const name of gruppen) {
  const g = gid.get(name)!;
  const markt = name.split('|')[0];
  const gA = gid.get(`${markt}|alle`)!;
  const art = name.endsWith('|alle') ? 'alle' : name.includes('hyp=') ? 'hypothese' : name.includes('&') ? 'paar' : 'einzel';
  SP.forEach((sp, s) => {
    F.forEach((f, fi) => {
      const ges = zw.gesamt(g, s, fi);
      if (!ges.n) return;
      const p = pruefen(gruppenText(name), spielartText(sp), f, [zw.werte(g, s, fi, 0), zw.werte(g, s, fi, 1)], zw.gesamt(gA, s, fi), vt.pruefung.mindestFaelle);
      ergebnisse.push({ ...p, schluessel: name, art });
    });
  });
}
// je Gruppe die beste Spielart/das beste Fenster (nach Wertung)
const besteJeGruppe = new Map<string, (typeof ergebnisse)[number]>();
for (const e of ergebnisse) {
  const b = besteJeGruppe.get(e.schluessel);
  if (!b || (e.bestanden && !b.bestanden) || (e.bestanden === b.bestanden && e.wertung > b.wertung)) besteJeGruppe.set(e.schluessel, e);
}
const beste = [...besteJeGruppe.values()];
const sortiert = (l: typeof beste) => [...l].sort((a, b) => b.wertung - a.wertung);
const kurz = (e: (typeof ergebnisse)[number]) => ({
  gruppe: e.gruppe,
  spielart: e.spielart,
  fenster: e.fenster,
  bestanden: e.bestanden,
  wertung: e.wertung,
  faelle: e.gesamt.n,
  quote: e.gesamt.quote,
  lift: e.lift,
  erfassung: e.erfassung,
  evGesamt: e.gesamt.ev,
  zeitraumA: { n: e.zeitraeume[0].n, quote: e.zeitraeume[0].quote, ev: e.zeitraeume[0].ev, se: e.zeitraeume[0].se },
  zeitraumB: { n: e.zeitraeume[1].n, quote: e.zeitraeume[1].quote, ev: e.zeitraeume[1].ev, se: e.zeitraeume[1].se },
  knockoutQuote: e.gesamt.n ? Math.round((e.gesamt.knockout / e.gesamt.n) * 1000) / 10 : 0,
});
const bestanden = sortiert(beste.filter((e) => e.bestanden));
const grundraten = ergebnisse.filter((e) => e.art === 'alle').map(kurz);
const hypothesen = sortiert(beste.filter((e) => e.art === 'hypothese')).map(kurz);
const n = vt.pruefung.rangliste;

const rangliste = {
  stand: jetzt.toISOString(),
  hinweis: 'Rückblick über die Kursgeschichte im privaten Archiv (nur verdichtete Kennzahlen). 1.000-€-Order, Volltreffer = mindestens +400 € netto, Einstieg zur Eröffnung des Folgetags. Bestanden = in beiden Zeiträumen mindestens 100 Fälle und Ø nach Kosten über null; Rang = schwächerer Zeitraum minus ein Standardfehler. Handelbarkeit ist eine Näherung. Einzelmerkmale und Kombinationen zählen jeden Stichtag (überlappende Fälle – Standardfehler eher zu klein); Hypothesen zählen je Wert höchstens einmal in 10 Handelstagen.',
  zeitraum: { von: alleTage[0], bis: alleTage[alleTage.length - 1], grenze },
  umfang: { stichtage, reihen: reihen.length, episoden: episoden.length, aktien: reihen.filter((r) => r.markt === 'aktie').length, coins: reihen.filter((r) => r.markt === 'krypto').length },
  bestandenZahl: bestanden.length,
  bestanden: bestanden.slice(0, n).map(kurz),
  besteOhneBestehen: sortiert(beste.filter((e) => !e.bestanden && e.art !== 'alle')).slice(0, 15).map(kurz),
  hypothesen,
};
schreibeJson('lernen/muster/rangliste.json', rangliste);
schreibeJson('lernen/muster/grundraten.json', { stand: jetzt.toISOString(), hinweis: 'Grundrate je Markt, Spielart und Fenster: alle handelbaren Stichtage.', grundraten });

// Hypothesen-Buch: nur anhängen – neue Hypothesen als „Idee“, danach je Lauf das Ergebnis des Rückblicks
const buch = leseJson<{ eintraege: Record<string, unknown>[] }>('lernen/muster/hypothesen.json', { eintraege: [] });
for (const h of HYPOTHESEN) {
  if (!buch.eintraege.some((e) => e.nr === h.nr)) buch.eintraege.push({ nr: h.nr, datum: heute, status: 'idee', name: h.name, regel: h.regel, markt: h.markt, richtung: h.richtung });
  const besteH = hypothesen.filter((x) => x.gruppe.includes(` ${h.nr} `));
  const top = besteH.sort((a, b) => b.wertung - a.wertung)[0];
  if (top) buch.eintraege.push({ nr: h.nr, datum: heute, status: top.bestanden ? 'rueckblick_bestanden' : 'rueckblick_nicht_bestanden', spielart: top.spielart, fenster: top.fenster, faelle: top.faelle, quote: top.quote, evA: top.zeitraumA.ev, evB: top.zeitraumB.ev, wertung: top.wertung });
}
schreibeJson('lernen/muster/hypothesen.json', buch);

// privat: Zensus mit Werten und die vollständige Prüfung
const aus = join(ARCHIV, 'auswertung');
mkdirSync(aus, { recursive: true });
const zensusCsv = ['datum,schluessel,markt,spielart,fenster,netto,tag,umsatz20,r1,relVolumen', ...episoden.sort((a, b) => a.datum.localeCompare(b.datum)).map((e) => [e.datum, e.schluessel, e.markt, `"${e.spielart}"`, e.fenster, e.netto, e.tag, e.umsatz20 === null ? '' : Math.round(e.umsatz20), e.r1, e.relVolumen ?? ''].join(','))].join('\n');
writeFileSync(join(aus, `zensus-${heute}.csv.gz`), gzipSync(Buffer.from(zensusCsv + '\n', 'utf8'), { level: 9 }));
writeFileSync(join(aus, `pruefung-${heute}.json.gz`), gzipSync(Buffer.from(JSON.stringify(sortiert(beste).map(kurz)), 'utf8'), { level: 9 }));

// Log: nur Zählungen und verdichtete Kennzahlen
log(`Fertig: ${bestanden.length} Gruppen bestanden. Beste: ${bestanden
  .slice(0, 5)
  .map((e) => `${e.gruppe} – ${e.spielart}, ${e.fenster} T: Quote ${e.gesamt.quote} %, Ø ${e.gesamt.ev} € (A ${e.zeitraeume[0].ev}, B ${e.zeitraeume[1].ev})`)
  .join(' | ') || '–'}`);
for (const h of hypothesen) log(`${h.gruppe}: ${h.spielart}, ${h.fenster} T – ${h.faelle} Fälle, Quote ${h.quote} %, Ø A ${h.zeitraumA.ev} € / B ${h.zeitraumB.ev} € → ${h.bestanden ? 'BESTANDEN' : 'nicht bestanden'}`);
