// Ablauf eines Daytrading-Laufs (rein funktional): neue geschlossene Kerzen je Basiswert der Reihe nach verarbeiten –
// zuerst offene Trades (Stop/Ziel/Schluss), dann die Setups (Auslöser → Einstieg zur nächsten Kerze).
import { runde } from '../geld.ts';
import {
  ausstiegAusfuehren,
  ausstiegsPlan,
  einstiegAusfuehren,
  ergebnisRechnen,
  setupSchritt,
  tradeSchritt,
  turboAnlegen,
  type DtEreignis,
  type DtGebuehren,
  type DtHerkunft,
  type DtInstrument,
  type DtMarkt,
  type DtRichtung,
  type DtSetup,
  type DtTrade,
  type Kerze,
  type SetupRegeln,
  type SetupZustand,
  type Sitzung,
} from './kern.ts';

/** Ein beobachteter Basiswert mit Setup und Herkunft (Code-Scan, Claude-Watchlist, Autopilot). */
export interface DtBeobachtung {
  /** Schlüssel des Basiswerts: ISIN (gettex) oder Krypto-Kürzel */
  basis: string;
  herkunft: DtHerkunft;
  markt: DtMarkt;
  name: string;
  isin?: string;
  symbol?: string;
  /** Instrument für Long-Einstiege; Short geht immer über einen Turbo (Krypto: nur Long) */
  instrumentLong: DtInstrument;
  hebel: number;
  spekulativ: boolean;
  chance?: number;
  these?: string;
  zustand: SetupZustand;
}

export interface DtLaufCfg {
  datum: string;
  sitzungen: Partial<Record<DtMarkt, Sitzung>>;
  regeln: SetupRegeln;
  plan: { zielR: number; stopProzentLevel: number; minRisikoProzent: number };
  spreads: { aktie: number; spekulativ: number; krypto: number; turbo: number };
  orderBetrag: number;
  maxTradesJeTag: number;
  maxOffen: number;
  emittent: string;
  gebuehren: DtGebuehren;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);
}

export function spreadFuer(t: Pick<DtTrade, 'instrument' | 'spekulativ'>, s: DtLaufCfg['spreads']): number {
  return t.instrument === 'turbo' ? s.turbo : t.instrument === 'krypto' ? s.krypto : t.spekulativ ? s.spekulativ : s.aktie;
}

export const basisVon = (t: Pick<DtTrade, 'isin' | 'symbol'>) => t.isin ?? t.symbol ?? '';

export interface DtLaufErgebnis {
  ereignisse: DtEreignis[];
  hinweise: string[];
  /** neu eröffnete Trades (für Time Machine und Pushes) */
  neu: DtTrade[];
}

/**
 * Verarbeitet neue Kerzen je Basiswert. `offen` und `beobachtungen` werden fortgeschrieben (Zustand für den nächsten Lauf).
 * `vergeben` = bereits benutzte Trade-IDs, `heuteEroeffnet` = Zahl der heutigen Einstiege (Tagesgrenze).
 */
export function kerzenVerarbeiten(
  kerzen: Map<string, Kerze[]>,
  beobachtungen: DtBeobachtung[],
  offen: DtTrade[],
  cfg: DtLaufCfg,
  zaehler: { heuteEroeffnet: number; vergeben: Set<string> },
): DtLaufErgebnis {
  const ereignisse: DtEreignis[] = [];
  const hinweise: string[] = [];
  const neu: DtTrade[] = [];
  const schliessen = (tr: DtTrade, s: ReturnType<typeof tradeSchritt>) => {
    if (!s) return false;
    const ausstieg = ausstiegAusfuehren(tr, s, spreadFuer(tr, cfg.spreads));
    const ergebnis = ergebnisRechnen(tr, ausstieg, cfg.gebuehren);
    Object.assign(tr, { ausstieg, ergebnis });
    ereignisse.push({ id: `${ausstieg.zeit}-ausstieg-${tr.id}`, typ: 'ausstieg', zeit: ausstieg.zeit, tradeId: tr.id, ausstieg, ergebnis });
    offen.splice(offen.indexOf(tr), 1);
    return true;
  };

  for (const [basis, liste] of kerzen) {
    const beob = beobachtungen.filter((b) => b.basis === basis);
    for (const k of [...liste].sort((a, b) => a.t.localeCompare(b.t))) {
      for (const tr of offen.filter((t) => basisVon(t) === basis)) schliessen(tr, tradeSchritt(tr, k));
      for (const b of beob) {
        const s = cfg.sitzungen[b.markt];
        if (!s) continue;
        const a = setupSchritt(b.zustand, k, s, cfg.regeln);
        if (!a || a.typ !== 'einstieg') continue;
        if (zaehler.heuteEroeffnet >= cfg.maxTradesJeTag || offen.length >= cfg.maxOffen) {
          hinweise.push(`${b.name}: Auslöser ohne Einstieg (Tages- oder Positionsgrenze erreicht)`);
          continue;
        }
        const tr = tradeAnlegen(b, a.richtung, k, s, cfg, zaehler.vergeben);
        if (!tr) {
          hinweise.push(`${b.name}: Auslöser verworfen (Risiko zu klein oder kein Stück bezahlbar)`);
          continue;
        }
        zaehler.heuteEroeffnet++;
        offen.push(tr);
        neu.push(tr);
        ereignisse.push({ id: `${tr.einstieg.zeit}-einstieg-${tr.id}`, typ: 'einstieg', zeit: tr.einstieg.zeit, trade: tr });
        // Einstieg zur Eröffnung dieser Kerze → Rest der Kerze zählt schon für Stop/Ziel
        schliessen(tr, tradeSchritt(tr, k));
      }
    }
  }
  return { ereignisse, hinweise, neu };
}

function tradeAnlegen(b: DtBeobachtung, richtung: DtRichtung, k: Kerze, s: Sitzung, cfg: DtLaufCfg, vergeben: Set<string>): DtTrade | null {
  if (richtung === 'short' && b.markt === 'krypto') return null;
  const instrument: DtInstrument = richtung === 'short' ? 'turbo' : b.instrumentLong;
  const plan = ausstiegsPlan(k.o, richtung, b.zustand.setup === 'orb' ? b.zustand : {}, cfg.plan);
  if (!plan) return null;
  let id = `${cfg.datum}-${b.herkunft === 'code_scan' ? 'scan' : b.herkunft}-${slug(b.name)}`;
  for (let n = 2; vergeben.has(id); n++) id = `${cfg.datum}-${b.herkunft === 'code_scan' ? 'scan' : b.herkunft}-${slug(b.name)}-${n}`;
  const ohneEinstieg: Omit<DtTrade, 'einstieg'> = {
    id,
    datum: cfg.datum,
    herkunft: b.herkunft,
    markt: b.markt,
    setup: b.zustand.setup as DtSetup,
    richtung,
    instrument,
    name: b.name,
    ...(b.isin ? { isin: b.isin } : {}),
    ...(b.symbol ? { symbol: b.symbol } : {}),
    ...(instrument === 'turbo' ? { turbo: turboAnlegen(k.o, richtung, b.hebel, cfg.emittent) } : {}),
    spekulativ: b.spekulativ,
    ausloeser: {
      zeit: b.zustand.ausloeser?.zeit ?? k.t,
      kurs: b.zustand.ausloeser?.kurs ?? k.o,
      level: runde(b.zustand.ausloeser?.level ?? k.o, 4),
      ...(b.zustand.spanne ? { spanne: { hoch: b.zustand.spanne.hoch, tief: b.zustand.spanne.tief } } : {}),
    },
    stop: plan.stop,
    ziel: plan.ziel,
    zielR: cfg.plan.zielR,
    flatBis: s.flatBis.toISOString(),
    ...(b.chance !== undefined ? { chance: b.chance } : {}),
    ...(b.these ? { these: b.these } : {}),
  };
  const einstieg = einstiegAusfuehren(ohneEinstieg, k, spreadFuer(ohneEinstieg, cfg.spreads), cfg.orderBetrag);
  if (!einstieg) return null;
  vergeben.add(id);
  return { ...ohneEinstieg, einstieg };
}

/** Neue Beobachtung mit frischem Setup-Zustand. */
export function beobachtung(
  b: Omit<DtBeobachtung, 'zustand'>,
  setup: DtSetup,
  richtungen: DtRichtung[],
  extra: Partial<SetupZustand> = {},
): DtBeobachtung {
  return { ...b, zustand: { setup, richtungen, status: setup === 'orb' ? 'spanne' : 'wartet', ...extra } };
}
