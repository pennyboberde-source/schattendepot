// Auswertung des Daytrading-Bereichs (nie mit dem Depot vermischt): Kennzahlen heute/gesamt, Kurve je Tag,
// Gruppen nach Herkunft, Markt, Setup, Instrument und Risiko, Time-Machine-Kalibrierung, Abendbilanz-Text.
import { euro, prozent, runde } from '../geld.ts';
import type { DtTrade } from './kern.ts';
import { phaseAm, type PhasenVerlauf } from '../marktphase.ts';

export interface DtGruppe {
  anzahl: number;
  treffer: number;
  quote: number;
  netto: number;
  brutto: number;
  nettoTR: number;
  oeNettoProzent: number;
  oeR: number;
}

export interface DtUebersicht {
  stand: string;
  heute: { datum: string; gruppe: DtGruppe; offen: number };
  gesamt: DtGruppe;
  kurve: { datum: string; netto: number; brutto: number; nettoTR: number }[];
  nachHerkunft: Record<string, DtGruppe>;
  nachMarkt: Record<string, DtGruppe>;
  nachSetup: Record<string, DtGruppe>;
  nachInstrument: Record<string, DtGruppe>;
  nachRisiko: Record<string, DtGruppe>;
  nachAusstieg: Record<string, DtGruppe>;
  /** je Marktphase (Aktien- bzw. Krypto-Phase des Tages) */
  nachPhase?: Record<string, DtGruppe>;
  /** Hätte ein Time-Machine-Filter geholfen? Trades nach simulierter Ziel-zuerst-Chance */
  zeitmaschine: { stufe: string; anzahl: number; quote: number; oeR: number }[];
  offen: DtTrade[];
  /** heutige und die letzten abgeschlossenen Trades (neueste zuerst) */
  trades: DtTrade[];
}

export function dtGruppe(l: DtTrade[]): DtGruppe {
  const g = l.filter((t) => t.ergebnis);
  const n = g.length;
  const s = (f: (t: DtTrade) => number) => runde(g.reduce((a, t) => a + f(t), 0));
  const treffer = g.filter((t) => t.ergebnis!.netto > 0).length;
  return {
    anzahl: n,
    treffer,
    quote: n ? runde((treffer / n) * 100, 1) : 0,
    netto: s((t) => t.ergebnis!.netto),
    brutto: s((t) => t.ergebnis!.brutto),
    nettoTR: s((t) => t.ergebnis!.nettoTR),
    oeNettoProzent: n ? runde(g.reduce((a, t) => a + t.ergebnis!.nettoProzent, 0) / n, 2) : 0,
    oeR: n ? runde(g.reduce((a, t) => a + t.ergebnis!.r, 0) / n, 2) : 0,
  };
}

function gruppiert(l: DtTrade[], f: (t: DtTrade) => string): Record<string, DtGruppe> {
  const m = new Map<string, DtTrade[]>();
  for (const t of l) m.set(f(t), [...(m.get(f(t)) ?? []), t]);
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, v]) => [k, dtGruppe(v)]));
}

export interface DtVariante {
  richtung: 'mit' | 'gegen';
  hebel: number;
  faelle: number;
  chance: number;
  /** Ø Ergebnis in % des Einsatzes nach Spread */
  oeNetto: number;
  wertung: number;
}

/**
 * Varianten je Setup (Markt:Setup_Auslöserrichtung) des Code-Scans: Was hätte jeder Trade gebracht – mit/gegen den
 * Auslöser, als Aktie oder Turbo Hebel 3–50 (höchstens bis zur halben Kelly-Grenze)? Grundlage ist die tatsächliche Bewegung des Basiswerts vom Einstieg bis
 * zum Ausstieg. Beste Variante = Ø minus ein Standardfehler > 0 (vorsichtig), ab mindestTrades.
 */
export function setupVarianten(trades: DtTrade[], kosten: { aktie: number; turbo: number }, e: { mindestTrades: number; mindestChance: number }): Record<string, { beste: DtVariante | null; basis: DtVariante | null }> {
  const je = new Map<string, DtTrade[]>();
  for (const t of trades) {
    if (!t.ergebnis || !t.ausstieg || t.herkunft !== 'code_scan') continue;
    const k = `${t.markt}:${t.setup}_${t.ausloeser.richtung ?? t.richtung}`;
    je.set(k, [...(je.get(k) ?? []), t]);
  }
  const out: Record<string, { beste: DtVariante | null; basis: DtVariante | null }> = {};
  for (const [k, l] of je) {
    const krypto = k.startsWith('krypto:');
    const ausloeserLong = k.endsWith('_long');
    // Bewegung des Basiswerts in Auslöser-Richtung, in %
    const bew = l.map((t) => (t.ausstieg!.basisKurs / t.einstieg.basisKurs - 1) * 100 * (ausloeserLong ? 1 : -1));
    const alle: DtVariante[] = [];
    for (const richtung of ['mit', 'gegen'] as const) {
      const long = ausloeserLong === (richtung === 'mit');
      for (const hebel of krypto ? [1] : [1, 3, 5, 10, 20, 50]) {
        if (hebel === 1 && !long) continue; // ohne Hebel kein Leerverkauf
        if (krypto && richtung === 'gegen') continue;
        const r = bew.map((m) => Math.max(-100, hebel * (richtung === 'mit' ? m : -m)) - (hebel === 1 ? kosten.aktie : kosten.turbo));
        const n = r.length;
        const m = r.reduce((a, x) => a + x, 0) / n;
        const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, n - 1));
        alle.push({ richtung, hebel, faelle: n, chance: runde((r.filter((x) => x > 0).length / n) * 100, 1), oeNetto: runde(m, 2), wertung: runde(m - sd / Math.sqrt(n), 2) });
      }
    }
    // Hebel höchstens bis zur halben Kelly-Grenze der Basiswert-Bewegung (nicht automatisch den größten Hebel)
    const grenze = (richtung: 'mit' | 'gegen') => {
      const r = bew.map((m) => (richtung === 'mit' ? m : -m) - kosten.aktie);
      const m = r.reduce((x, y) => x + y, 0) / r.length;
      const sd = Math.max(0.1, Math.sqrt(r.reduce((x, y) => x + (y - m) ** 2, 0) / Math.max(1, r.length - 1)));
      return m <= 0 ? 1 : Math.min(50, 0.5 * ((100 * m) / sd ** 2));
    };
    const beste = alle.filter((v) => v.faelle >= e.mindestTrades && v.chance >= e.mindestChance && v.wertung > 0 && (v.hebel === 1 || v.hebel <= grenze(v.richtung))).sort((a, b) => b.wertung - a.wertung)[0] ?? null;
    out[k] = { beste, basis: alle.find((v) => v.richtung === 'mit' && (v.hebel === 1 || !ausloeserLong)) ?? null };
  }
  return out;
}

const STUFEN: [string, number, number][] = [
  ['0–29 %', 0, 29.99],
  ['30–44 %', 30, 44.99],
  ['45–59 %', 45, 59.99],
  ['60–100 %', 60, 100],
];

export function uebersichtBerechnen(alle: DtTrade[], heute: string, stand: string, phasen: PhasenVerlauf = {}): DtUebersicht {
  const zu = alle.filter((t) => t.ergebnis).sort((a, b) => b.ausstieg!.zeit.localeCompare(a.ausstieg!.zeit));
  const tage = new Map<string, DtTrade[]>();
  for (const t of [...zu].reverse()) tage.set(t.datum, [...(tage.get(t.datum) ?? []), t]);
  let summe = { netto: 0, brutto: 0, nettoTR: 0 };
  const kurve = [...tage.entries()].map(([datum, l]) => {
    const g = dtGruppe(l);
    summe = { netto: summe.netto + g.netto, brutto: summe.brutto + g.brutto, nettoTR: summe.nettoTR + g.nettoTR };
    return { datum, netto: runde(summe.netto), brutto: runde(summe.brutto), nettoTR: runde(summe.nettoTR) };
  });
  const mitZm = zu.filter((t) => t.timeMachine);
  return {
    stand,
    heute: { datum: heute, gruppe: dtGruppe(zu.filter((t) => t.datum === heute)), offen: alle.filter((t) => !t.ausstieg).length },
    gesamt: dtGruppe(zu),
    kurve,
    nachHerkunft: gruppiert(zu, (t) => t.herkunft),
    nachMarkt: gruppiert(zu, (t) => t.markt),
    nachSetup: gruppiert(zu, (t) => `${t.setup}_${t.ausloeser.richtung ?? t.richtung}`),
    nachInstrument: gruppiert(zu, (t) => t.instrument),
    nachRisiko: gruppiert(zu, (t) => (t.spekulativ ? 'spekulativ' : 'skill_filter')),
    nachAusstieg: gruppiert(zu, (t) => t.ausstieg!.grund),
    ...(Object.keys(phasen).length ? { nachPhase: gruppiert(zu, (t) => phaseAm(phasen, t.datum, t.markt === 'krypto' ? 'krypto' : 'aktien') ?? 'unbekannt') } : {}),
    zeitmaschine: STUFEN.map(([stufe, von, bis]) => {
      const l = mitZm.filter((t) => t.timeMachine!.zielZuerst >= von && t.timeMachine!.zielZuerst <= bis);
      const g = dtGruppe(l);
      return { stufe, anzahl: g.anzahl, quote: g.quote, oeR: g.oeR };
    }).filter((x) => x.anzahl > 0),
    offen: alle.filter((t) => !t.ausstieg),
    trades: [...alle.filter((t) => !t.ausstieg), ...zu.filter((t) => t.datum === heute), ...zu.filter((t) => t.datum !== heute).slice(0, 150)],
  };
}

const HERKUNFT_TEXT: Record<string, string> = { code_scan: 'Code-Scan', claude: 'Claude', autopilot: 'Autopilot' };

/** Abendbilanz-Push (~22:15): Ergebnis des Tages nach Gebühren, vor Gebühren und je Herkunft. */
export function abendbilanzText(u: DtUebersicht, heuteTrades: DtTrade[]): { titel: string; text: string } {
  const g = u.heute.gruppe;
  if (!g.anzahl) return { titel: '📊 Daytrading heute', text: `Keine abgeschlossenen Trades${u.heute.offen ? ` (${u.heute.offen} noch offen)` : ''}.` };
  const je = Object.entries(
    heuteTrades.filter((t) => t.ergebnis).reduce<Record<string, number>>((m, t) => ({ ...m, [t.herkunft]: (m[t.herkunft] ?? 0) + t.ergebnis!.netto }), {}),
  ).map(([k, v]) => `${HERKUNFT_TEXT[k] ?? k} ${euro(v, { vorzeichen: true })}`);
  return {
    titel: `📊 Daytrading heute: ${euro(g.netto, { vorzeichen: true })}`,
    text: [`${g.anzahl} Trades, ${prozent(g.quote, { vorzeichen: false })} Treffer`, `vor Gebühren ${euro(g.brutto, { vorzeichen: true })}`, `Trade Republic wäre ${euro(g.nettoTR, { vorzeichen: true })}`, ...je, u.heute.offen ? `${u.heute.offen} noch offen` : '']
      .filter(Boolean)
      .join(' · '),
  };
}

const berlinUhr = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
const stk = (x: number) => x.toLocaleString('de-DE', { maximumFractionDigits: 6 });

/**
 * Verständliche Beschreibung eines Trades: Was wurde gekauft (Aktie, Krypto oder Turbo auf den Wert), zu welchem
 * Preis, und wann greifen Stop und Ziel (immer am Kurs des Werts selbst). Ohne Fachkürzel.
 */
export function tradeBeschreibung(t: DtTrade): { was: string; einstieg: string; plan: string; ausstieg?: string } {
  const wert = t.name;
  const turbo = t.instrument === 'turbo';
  const was = turbo ? `Turbo ${t.richtung === 'short' ? 'short (Wette auf fallende Kurse)' : 'long (Wette auf steigende Kurse)'}, Hebel ${t.turbo?.hebel} auf ${wert}` : t.instrument === 'krypto' ? `${wert} direkt gekauft` : `Aktie ${wert} gekauft`;
  const einstieg = turbo
    ? `Einstieg ${berlinUhr(t.einstieg.zeit)}: ${wert} stand bei ${euro(t.einstieg.basisKurs)} → ${stk(t.einstieg.stueck)} Turbos zu je ${euro(t.einstieg.kurs)} (zusammen ${euro(t.einstieg.kurswert)})`
    : `Einstieg ${berlinUhr(t.einstieg.zeit)}: ${stk(t.einstieg.stueck)} Stück zu je ${euro(t.einstieg.kurs)} (zusammen ${euro(t.einstieg.kurswert)})`;
  const runter = (x: number) => `${wert} unter ${euro(x)} fällt`;
  const rauf = (x: number) => `${wert} über ${euro(x)} steigt`;
  const plan = t.richtung === 'long' ? `Stop, wenn ${runter(t.stop)} · Ziel, wenn ${rauf(t.ziel)} · spätestens ${berlinUhr(t.flatBis)} verkaufen` : `Stop, wenn ${rauf(t.stop)} · Ziel, wenn ${runter(t.ziel)} · spätestens ${berlinUhr(t.flatBis)} verkaufen`;
  const GRUND: Record<string, string> = { ziel: 'Ziel erreicht', stop: 'Stop', schluss: 'Tagesschluss', knockout: 'Knock-out' };
  const a = t.ausstieg;
  const ausstieg = a
    ? `Ausstieg ${berlinUhr(a.zeit)} (${GRUND[a.grund] ?? a.grund}): ${turbo ? `${wert} bei ${euro(a.basisKurs)} → Turbo zu je ${euro(a.kurs)}` : `zu je ${euro(a.kurs)}`} · Ergebnis ${euro(t.ergebnis!.netto, { vorzeichen: true })}${t.ergebnis!.brutto !== t.ergebnis!.netto ? ` (vor Gebühren ${euro(t.ergebnis!.brutto, { vorzeichen: true })})` : ''}`
    : undefined;
  return { was, einstieg, plan, ...(ausstieg ? { ausstieg } : {}) };
}
