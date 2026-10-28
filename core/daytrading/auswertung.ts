// Auswertung des Daytrading-Bereichs (nie mit dem Depot vermischt): Kennzahlen heute/gesamt, Kurve je Tag,
// Gruppen nach Herkunft, Markt, Setup, Instrument und Risiko, Time-Machine-Kalibrierung, Abendbilanz-Text.
import { euro, prozent, runde } from '../geld.ts';
import type { DtTrade } from './kern.ts';

export interface DtGruppe {
  anzahl: number;
  treffer: number;
  quote: number;
  netto: number;
  brutto: number;
  nettoConsors: number;
  nettoTR: number;
  oeNettoProzent: number;
  oeR: number;
}

export interface DtUebersicht {
  stand: string;
  heute: { datum: string; gruppe: DtGruppe; offen: number };
  gesamt: DtGruppe;
  kurve: { datum: string; netto: number; brutto: number; nettoConsors: number; nettoTR: number }[];
  nachHerkunft: Record<string, DtGruppe>;
  nachMarkt: Record<string, DtGruppe>;
  nachSetup: Record<string, DtGruppe>;
  nachInstrument: Record<string, DtGruppe>;
  nachRisiko: Record<string, DtGruppe>;
  nachAusstieg: Record<string, DtGruppe>;
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
    nettoConsors: s((t) => t.ergebnis!.nettoConsors),
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

const STUFEN: [string, number, number][] = [
  ['0–29 %', 0, 29.99],
  ['30–44 %', 30, 44.99],
  ['45–59 %', 45, 59.99],
  ['60–100 %', 60, 100],
];

export function uebersichtBerechnen(alle: DtTrade[], heute: string, stand: string): DtUebersicht {
  const zu = alle.filter((t) => t.ergebnis).sort((a, b) => b.ausstieg!.zeit.localeCompare(a.ausstieg!.zeit));
  const tage = new Map<string, DtTrade[]>();
  for (const t of [...zu].reverse()) tage.set(t.datum, [...(tage.get(t.datum) ?? []), t]);
  let summe = { netto: 0, brutto: 0, nettoConsors: 0, nettoTR: 0 };
  const kurve = [...tage.entries()].map(([datum, l]) => {
    const g = dtGruppe(l);
    summe = { netto: summe.netto + g.netto, brutto: summe.brutto + g.brutto, nettoConsors: summe.nettoConsors + g.nettoConsors, nettoTR: summe.nettoTR + g.nettoTR };
    return { datum, netto: runde(summe.netto), brutto: runde(summe.brutto), nettoConsors: runde(summe.nettoConsors), nettoTR: runde(summe.nettoTR) };
  });
  const mitZm = zu.filter((t) => t.timeMachine);
  return {
    stand,
    heute: { datum: heute, gruppe: dtGruppe(zu.filter((t) => t.datum === heute)), offen: alle.filter((t) => !t.ausstieg).length },
    gesamt: dtGruppe(zu),
    kurve,
    nachHerkunft: gruppiert(zu, (t) => t.herkunft),
    nachMarkt: gruppiert(zu, (t) => t.markt),
    nachSetup: gruppiert(zu, (t) => `${t.setup}_${t.richtung}`),
    nachInstrument: gruppiert(zu, (t) => t.instrument),
    nachRisiko: gruppiert(zu, (t) => (t.spekulativ ? 'spekulativ' : 'skill_filter')),
    nachAusstieg: gruppiert(zu, (t) => t.ausstieg!.grund),
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
    text: [`${g.anzahl} Trades, ${prozent(g.quote, { vorzeichen: false })} Treffer`, `vor Gebühren ${euro(g.brutto, { vorzeichen: true })}`, `Consorsbank wäre ${euro(g.nettoConsors, { vorzeichen: true })}`, ...je, u.heute.offen ? `${u.heute.offen} noch offen` : '']
      .filter(Boolean)
      .join(' · '),
  };
}
