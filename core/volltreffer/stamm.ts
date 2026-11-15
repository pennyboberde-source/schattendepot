// Stammdaten und Handelbarkeits-Karte (Plan Volltreffer V1): je ISIN Name, US-Kürzel und Art (über OpenFIGI), und
// welche Werte an gettex wirklich gehandelt werden (an mindestens 10 der letzten 20 Handelstage Umsatz).
// Reine Funktionen; die Abfrage und das Speichern macht jobs/archiv.ts (Teil „stamm“).

export type WertArt = 'aktie' | 'etf' | 'hebel' | 'anleihe' | 'fonds' | 'sonstiges' | 'unbekannt';

export interface Wertpapier {
  name: string;
  /** Kürzel an einer US-Börse (für die Verbindung zu den US-Tageskerzen), falls vorhanden */
  usTicker?: string;
  /** Kürzel an einer deutschen Börse, falls kein US-Kürzel */
  ticker?: string;
  art: WertArt;
  /** OpenFIGI securityType2 bzw. securityType */
  figi?: string;
  /** Tag der Abfrage */
  geholt: string;
}

export interface FigiTreffer {
  name?: string;
  ticker?: string;
  exchCode?: string;
  marketSector?: string;
  securityType?: string;
  securityType2?: string;
}

const AKTIE = new Set(['Common Stock', 'Depositary Receipt', 'REIT', 'Preference', 'ADR', 'GDR', 'Ltd Part', 'MLP', 'Dutch Cert', 'Savings Share', 'Tracking Stk', 'Stapled Security']);
const HEBEL = /Warrant|WRT|Knock|Turbo|Mini|Certificate|Structured|Index WT|Bonus|Discount|Reverse Conv/i;
const ETF = /ETP|ETF|Exchange Traded/i;

/** Art aus einem OpenFIGI-Treffer. */
export function figiArt(t: FigiTreffer | undefined): WertArt {
  if (!t) return 'unbekannt';
  const s2 = t.securityType2 ?? '';
  const s = t.securityType ?? '';
  if (ETF.test(s) || ETF.test(s2) || /\bETF\b/.test(t.name ?? '')) return 'etf';
  if (HEBEL.test(s) || HEBEL.test(s2)) return 'hebel';
  if (AKTIE.has(s2) || AKTIE.has(s)) return 'aktie';
  if (t.marketSector === 'Corp' || t.marketSector === 'Govt' || /Bond|Note|Corp|Govt/i.test(s2)) return 'anleihe';
  if (/Mutual Fund|Fund|Open-End/i.test(s2) || /Fund/i.test(s)) return 'fonds';
  return 'sonstiges';
}

/** Eine OpenFIGI-Antwort (Reihenfolge wie die Anfrage) → Stammdaten je ISIN. */
export function figiEinordnen(isins: string[], antwort: { data?: FigiTreffer[]; error?: string; warning?: string }[], geholt: string): Record<string, Wertpapier> {
  const aus: Record<string, Wertpapier> = {};
  isins.forEach((isin, i) => {
    const daten = antwort[i]?.data ?? [];
    const us = daten.find((d) => d.exchCode === 'US');
    const de = daten.find((d) => ['GR', 'GY', 'GF', 'GM', 'GD', 'GS'].includes(d.exchCode ?? ''));
    const t = us ?? de ?? daten[0];
    if (!t) {
      aus[isin] = { name: '', art: 'unbekannt', geholt };
      return;
    }
    aus[isin] = {
      name: t.name ?? '',
      ...(us?.ticker ? { usTicker: us.ticker } : t.ticker ? { ticker: t.ticker } : {}),
      art: figiArt(t),
      ...(t.securityType2 || t.securityType ? { figi: t.securityType2 || t.securityType } : {}),
      geholt,
    };
  });
  return aus;
}

/**
 * Handelbarkeits-Karte: ISINs mit Umsatz an mindestens `mindestTage` der letzten `fenster` gettex-Tage.
 * `tage`: je Handelstag der Umsatz (€) je ISIN, aufsteigend nach Datum.
 */
export function handelbarkeitsKarte(tage: { datum: string; umsatz: Map<string, number> }[], fenster = 20, mindestTage = 10): Map<string, { tage: number; umsatzMedian: number }> {
  const letzte = tage.slice(-fenster);
  const je = new Map<string, number[]>();
  for (const t of letzte) for (const [isin, u] of t.umsatz) if (u > 0) (je.get(isin) ?? je.set(isin, []).get(isin)!).push(u);
  // Solange es weniger Tage gibt, gilt der Anteil (mindestTage/fenster) der vorhandenen Tage
  const noetig = Math.max(1, Math.ceil((mindestTage / fenster) * letzte.length));
  const karte = new Map<string, { tage: number; umsatzMedian: number }>();
  for (const [isin, us] of je) {
    if (us.length < noetig) continue;
    const s = [...us].sort((a, b) => a - b);
    karte.set(isin, { tage: us.length, umsatzMedian: Math.round(s[s.length >> 1]) });
  }
  return karte;
}
