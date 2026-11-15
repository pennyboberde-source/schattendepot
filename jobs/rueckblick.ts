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
import { schluesselNormal } from '../core/signale.ts';

type Markt = 'aktie' | 'krypto';
interface VtConfig {
  etikett: { einsatz: number; ziel: number; beinahe: number; zensusMaxHebel: number; hebel: number[]; stops: number[]; standardStop: number; fenster: number[]; episodeAbstand: number; finanzierungProzentJahr: number; turboSpreadKlasse: string; turboEmittent: string };
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
    const name = ({ XBT: 'BTC', XDG: 'DOGE' } as Record<string, string>)[basis] ?? basis;
    if (kerzen?.length) reihen.push({ schluessel: `K:${name}`, markt: 'krypto', kerzen });
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

// Handelbarkeits-Karte aus gettex (stamm/handelbar.json): sobald sie auf mindestens 10 gettex-Tagen beruht, zählen nur
// US-Aktien, die an gettex gehandelt werden (heutige Karte auf die Vergangenheit angewandt – Näherung). Vorher: Umsatzregel.
const gettexUs: Set<string> | null = (() => {
  const p = join(ARCHIV, 'stamm', 'handelbar.json');
  if (!existsSync(p)) return null;
  const h = JSON.parse(readFileSync(p, 'utf8')) as { gettexTage: number; isins: Record<string, { art: string; usTicker?: string }> };
  if (h.gettexTage < 10) return null;
  return new Set(Object.values(h.isins).flatMap((x) => (x.art === 'aktie' && x.usTicker ? [x.usTicker] : [])));
})();
log(gettexUs ? `Handelbarkeit: gettex-Karte mit ${gettexUs.size} US-Aktien.` : 'Handelbarkeit: Näherung über Umsatz (gettex-Karte hat noch keine 10 Tage).');

/** Gilt der Wert am Stichtag als handelbar? */
function handelbar(r: Reihe, m: Merkmale, k: Kerze): boolean {
  if (r.markt === 'aktie') {
    if (gettexUs && !gettexUs.has(r.schluessel.slice(2).replace(/#\d+$/, ''))) return false;
    return m.kurs >= vt.handelbar.aktie.mindestKurs && (k.v ?? 0) * k.c >= vt.handelbar.aktie.mindestUmsatzStichtag;
  }
  return (k.v ?? 0) * k.c >= vt.handelbar.krypto.mindestUmsatzStichtag && (m.schwankung20 === null || m.schwankung20 >= vt.handelbar.krypto.mindestSchwankung20);
}
const turboErlaubt = (r: Reihe, m: Merkmale) => (r.markt === 'krypto' ? vt.handelbar.krypto.turboBasiswerte.includes(r.schluessel.slice(2)) || (r.schluessel === 'K:BTC' && vt.handelbar.krypto.turboBasiswerte.includes('XBT')) : (m.umsatz20 ?? 0) >= vt.handelbar.aktie.turboAbUmsatz20);

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

// ---------- 4b. Signale der Datenkrake (seit 28.10.2026) – was war vor einem Sprung bekannt? ----------
interface Sig {
  datum: string;
  typ: string;
}
const signaleJe = new Map<string, Sig[]>();
{
  const ordner = join(process.env.SIGNALE_DIR ?? process.env.DATEN_DIR ?? '_daten', 'signale', 'tag');
  let zahl = 0;
  if (existsSync(ordner))
    for (const f of readdirSync(ordner).filter((x) => /^\d{4}-\d{2}-\d{2}\.json$/.test(x))) {
      const d = JSON.parse(readFileSync(join(ordner, f), 'utf8')) as { signale?: { s: string; m?: string; typ: string; z?: string }[] };
      for (const x of d.signale ?? []) {
        const sch = schluesselNormal(x.s, x.m);
        (signaleJe.get(sch) ?? signaleJe.set(sch, []).get(sch)!).push({ datum: (x.z ?? f).slice(0, 10), typ: x.typ });
        zahl++;
      }
    }
  log(`Signale der Datenkrake: ${zahl} aus ${ordner} (${signaleJe.size} Werte).`);
}
// Signal-Prüfung: je Signaltyp Fälle (je Wert höchstens einmal in 10 Handelstagen) und Volltreffer ab dem Folgetag
const sigStat = new Map<string, { n: number; treffer: number; markt: Markt }>();
// Grundrate je Markt und Tag (fertige Etiketten)
const tagStat = new Map<string, { n: number; treffer: number }>();
interface BuchEintrag {
  datum: string;
  wert: string;
  markt: Markt;
  spielart: string;
  netto: number;
  tage: number;
  r1: number;
  relVolumen: number | null;
  vorzeichen: { typ: string; datum: string }[];
}
const trefferbuch: BuchEintrag[] = [];
const buchAb = new Date(Date.parse(heute) - 30 * 86400000).toISOString().slice(0, 10);

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
  const fertig: boolean[] = new Array(k.length).fill(false);
  const bester: (Episode | null)[] = new Array(k.length).fill(null);
  // Ehrliche Fallzahl: je Wert und Gruppe höchstens ein Fall in `sperreTage` Handelstagen (wie bei den Hypothesen)
  const gezaehltAm = new Int32Array(gruppen.length).fill(-1e9);
  const sperre = vt.pruefung.sperreTage;
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
    const frei = (g: number) => g >= 0 && i - gezaehltAm[g] > sperre;
    const alleFrei = frei(gAlle);
    const einzelFrei = gEinzel.filter(frei);
    const paareFrei = gPaare.filter(frei);
    let gezaehlt = false;
    const turbo = turboErlaubt(r, x);
    SP.forEach((sp, s) => {
      if (sp.hebel > 1 && !turbo) return;
      const a = ausg(i, sp, x);
      a.forEach((au, f) => {
        if (!au) return;
        if (F[f] === 10 || au.art === 'treffer') fertig[i] = true;
        gezaehlt = true;
        if (alleFrei) zw.add(gAlle, s, f, z, au);
        if (!standard[s]) return;
        for (const g of einzelFrei) zw.add(g, s, f, z, au);
        if (paarF[f]) for (const g of paareFrei) zw.add(g, s, f, z, au);
        // Zensus: echter Sprung – Volltreffer mit Standard-Stop binnen 10 Handelstagen, höchstens Hebel zensusMaxHebel
        if (au.art === 'treffer' && F[f] <= 10 && sp.hebel <= vt.etikett.zensusMaxHebel && (!bester[i] || au.netto > bester[i]!.netto)) {
          treffer[i] = true;
          bester[i] = { datum: k[i].datum, schluessel: r.schluessel.replace(/#\d+$/, ''), markt: r.markt, spielart: spielartText(sp), fenster: F[f], netto: au.netto, tag: au.tag, umsatz20: x.umsatz20, r1: Math.round(x.r1 * 10) / 10, relVolumen: x.relVolumen === null ? null : Math.round(x.relVolumen * 10) / 10 };
        }
      });
    });
    if (gezaehlt) for (const g of [alleFrei ? gAlle : -1, ...einzelFrei, ...paareFrei]) if (g >= 0) gezaehltAm[g] = i;
  }
  for (const i of sprungEpisoden(treffer, vt.etikett.episodeAbstand)) if (bester[i]) episoden.push(bester[i]!);
  // Grundrate je Tag und Markt
  for (let i = 0; i < k.length; i++) {
    if (!fertig[i]) continue;
    const key = `${r.markt}|${k[i].datum}`;
    const t = tagStat.get(key) ?? tagStat.set(key, { n: 0, treffer: 0 }).get(key)!;
    t.n++;
    if (treffer[i]) t.treffer++;
  }
  const schluessel = r.schluessel.replace(/#\d+$/, '');
  const sigs = signaleJe.get(schluessel) ?? [];
  // Signal-Prüfung: Stichtag = erster Handelstag am oder nach dem Signal
  const zuletzt = new Map<string, number>();
  for (const sg of [...sigs].sort((a, b) => a.datum.localeCompare(b.datum))) {
    const i = k.findIndex((x) => x.datum >= sg.datum);
    if (i < 1 || !fertig[i]) continue;
    if (i - (zuletzt.get(sg.typ) ?? -Infinity) <= vt.pruefung.sperreTage) continue;
    zuletzt.set(sg.typ, i);
    const key = `${r.markt}|${sg.typ}`;
    const st = sigStat.get(key) ?? sigStat.set(key, { n: 0, treffer: 0, markt: r.markt }).get(key)!;
    st.n++;
    if (treffer[i]) st.treffer++;
  }
  // Trefferbuch: Volltreffer der letzten 30 Tage mit den Vorzeichen der 14 Tage davor
  for (const i of sprungEpisoden(treffer, vt.etikett.episodeAbstand)) {
    const e = bester[i];
    if (!e || e.datum < buchAb) continue;
    const von = new Date(Date.parse(e.datum) - 14 * 86400000).toISOString().slice(0, 10);
    const vorzeichen = sigs.filter((sg) => sg.datum >= von && sg.datum <= e.datum).map((sg) => ({ typ: sg.typ, datum: sg.datum }));
    trefferbuch.push({ datum: e.datum, wert: schluessel.slice(2), markt: r.markt, spielart: e.spielart, netto: e.netto, tage: e.tag, r1: e.r1, relVolumen: e.relVolumen, vorzeichen: [...new Map(vorzeichen.map((v) => [v.typ + v.datum, v])).values()].slice(0, 8) });
  }
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
const MERKMAL_TEXT: Record<string, string> = { r1: 'Tagesrendite %', r5: '5-Tage-Rendite %', r20: '20-Tage-Rendite %', relVolumen: 'Umsatz (× Ø 20 Tage)', relSpanne: 'Tagesspanne (× Ø 20 Tage)', abstandHoch20: '20-Tage-Hoch', abstandHoch250: 'Abstand zum Jahreshoch %', lageSchluss: 'Schluss in der Tagesspanne (0 = Tief, 1 = Hoch)', luecke: 'Kurslücke %', schwankung20: 'Schwankung je Tag %', umsatz20: 'Ø Tagesumsatz', kurs: 'Kurs', ueberrendite1: 'Tagesrendite über dem Markt %', marktR1: 'Markt am Stichtag %' };
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
      return `${MERKMAL_TEXT[E[a].merkmal] ?? E[a].merkmal}: ${klassenName(E[a], c)}`;
    })
    .join(' und ')}`;
};
const ergebnisse: (Pruefergebnis & { schluessel: string; art: 'alle' | 'einzel' | 'paar' | 'hypothese'; vorteil: boolean; vorteilA: number; vorteilB: number })[] = [];
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
      // Vorteil gegen die Grundrate (dieselbe Spielart, jeden Stichtag): ohne ihn ist ein „Muster“ nur der Markttrend
      const basisA = zw.werte(gA, s, fi, 0);
      const basisB = zw.werte(gA, s, fi, 1);
      const vorteilA = Math.round((p.zeitraeume[0].ev - basisA.ev) * 10) / 10;
      const vorteilB = Math.round((p.zeitraeume[1].ev - basisB.ev) * 10) / 10;
      ergebnisse.push({ ...p, schluessel: name, art, vorteil: art !== 'alle' && vorteilA > 0 && vorteilB > 0, vorteilA, vorteilB });
    });
  });
}
// je Gruppe die beste Spielart/das beste Fenster (nach Wertung)
const besteJeGruppe = new Map<string, (typeof ergebnisse)[number]>();
for (const e of ergebnisse) {
  const b = besteJeGruppe.get(e.schluessel);
  const rang = (x: typeof e) => (x.bestanden ? 2 : x.zeitraeume.every((k) => k.n >= vt.pruefung.mindestFaelle) ? 1 : 0);
  if (!b || rang(e) > rang(b) || (rang(e) === rang(b) && e.wertung > b.wertung)) besteJeGruppe.set(e.schluessel, e);
}
const beste = [...besteJeGruppe.values()];
const sortiert = (l: typeof beste) => [...l].sort((a, b) => Number(b.vorteil) - Number(a.vorteil) || b.wertung - a.wertung);
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
  vorteil: e.vorteil,
  vorteilA: e.vorteilA,
  vorteilB: e.vorteilB,
});
const bestanden = sortiert(beste.filter((e) => e.bestanden && e.art !== 'alle'));
const mitVorteil = bestanden.filter((e) => e.vorteil);
const grundraten = ergebnisse.filter((e) => e.art === 'alle').map(kurz);
const hypothesen = sortiert(beste.filter((e) => e.art === 'hypothese')).map(kurz);
const n = vt.pruefung.rangliste;

const rangliste = {
  stand: jetzt.toISOString(),
  hinweis: 'Rückblick über die Kursgeschichte im privaten Archiv (nur verdichtete Kennzahlen). 1.000-€-Order, Volltreffer = mindestens +400 € netto, Einstieg zur Eröffnung des Folgetags. Bestanden = in beiden Zeiträumen mindestens 100 Fälle und Ø nach Kosten über null; Rang = schwächerer Zeitraum minus ein Standardfehler. „Vorteil“ = in beiden Zeiträumen besser als die Grundrate derselben Spielart (sonst ist es nur der Markttrend); Muster mit Vorteil stehen vorn. Handelbarkeit ist eine Näherung. Je Wert und Gruppe zählt höchstens ein Fall in 10 Handelstagen (ehrliche Fallzahl); bei 21-Tage-Fenstern überlappen Fälle trotzdem teilweise.',
  zeitraum: { von: alleTage[0], bis: alleTage[alleTage.length - 1], grenze },
  umfang: { stichtage, reihen: reihen.length, episoden: episoden.length, aktien: reihen.filter((r) => r.markt === 'aktie').length, coins: reihen.filter((r) => r.markt === 'krypto').length },
  bestandenZahl: bestanden.length,
  mitVorteilZahl: mitVorteil.length,
  bestanden: bestanden.slice(0, n).map(kurz),
  besteOhneBestehen: sortiert(beste.filter((e) => !e.bestanden && e.art !== 'alle')).slice(0, 15).map(kurz),
  hypothesen,
};
schreibeJson('lernen/muster/rangliste.json', rangliste);
{
  // Signal-Prüfung: Quote je Signaltyp gegen die Grundrate derselben Tage
  const sigTage = [...signaleJe.values()].flat().map((x) => x.datum).sort();
  const grund = (markt: Markt) => {
    let n = 0;
    let t = 0;
    for (const [key, v] of tagStat) {
      const [m, d] = key.split('|');
      if (m === markt && d >= (sigTage[0] ?? '9999') && d <= (sigTage[sigTage.length - 1] ?? '0000')) {
        n += v.n;
        t += v.treffer;
      }
    }
    return n ? (t / n) * 100 : 0;
  };
  const grundrate = { aktie: grund('aktie'), krypto: grund('krypto') };
  const typen = [...sigStat].map(([key, v]) => {
    const quote = v.n ? (v.treffer / v.n) * 100 : 0;
    return { typ: key.split('|')[1], markt: v.markt, faelle: v.n, treffer: v.treffer, quote: Math.round(quote * 10) / 10, grundrate: Math.round(grundrate[v.markt] * 10) / 10, lift: grundrate[v.markt] > 0 ? Math.round((quote / grundrate[v.markt]) * 100) / 100 : null };
  });
  schreibeJson('lernen/muster/signale-volltreffer.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Wie oft folgte auf ein Signal der Datenkrake ein Volltreffer (Kauf zur Eröffnung des Folgetags, direkt oder Turbo bis Hebel 3 in beide Richtungen, Stop 150 €, binnen 10 Handelstagen)? Je Wert und Signaltyp höchstens ein Fall in 10 Handelstagen; Grundrate = alle handelbaren Stichtage derselben Tage. Kleine Fallzahlen sind Zufall – erst ab etwa 100 Fällen aussagekräftig.',
    von: sigTage[0] ?? null,
    bis: sigTage[sigTage.length - 1] ?? null,
    grundrate,
    typen: typen.sort((a, b) => b.faelle - a.faelle),
  });
  schreibeJson('lernen/muster/trefferbuch.json', {
    stand: jetzt.toISOString(),
    hinweis: 'Volltreffer der letzten 30 Tage (Beginn eines Sprungs, beste Spielart mit Stop 150 €) und die Signale der Datenkrake zu diesem Wert in den 14 Tagen davor. Rückwärts gelernt: Was war vorher bekannt?',
    eintraege: trefferbuch.sort((a, b) => b.datum.localeCompare(a.datum) || b.netto - a.netto).slice(0, 80),
    zahl: trefferbuch.length,
    mitVorzeichen: trefferbuch.filter((e) => e.vorzeichen.length).length,
  });
  log(`Signal-Prüfung: ${typen.length} Typen, Grundrate Aktien ${grundrate.aktie.toFixed(1)} %, Krypto ${grundrate.krypto.toFixed(1)} %. Trefferbuch: ${trefferbuch.length} Volltreffer in 30 Tagen, ${trefferbuch.filter((e) => e.vorzeichen.length).length} mit Vorzeichen.`);
}
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
log(`Fertig: ${bestanden.length} Gruppen bestanden, davon ${mitVorteil.length} mit Vorteil gegen die Grundrate. Beste: ${bestanden
  .slice(0, 5)
  .map((e) => `${e.gruppe} – ${e.spielart}, ${e.fenster} T: Quote ${e.gesamt.quote} %, Ø ${e.gesamt.ev} € (A ${e.zeitraeume[0].ev}, B ${e.zeitraeume[1].ev})`)
  .join(' | ') || '–'}`);
for (const h of hypothesen) log(`${h.gruppe}: ${h.spielart}, ${h.fenster} T – ${h.faelle} Fälle, Quote ${h.quote} %, Ø A ${h.zeitraumA.ev} € / B ${h.zeitraumB.ev} € → ${h.bestanden ? 'BESTANDEN' : 'nicht bestanden'}`);
