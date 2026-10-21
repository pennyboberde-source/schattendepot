// Zuordnung von Schlagzeilen zu Wertpapieren (Universum) und Erkennung von Signal-Typen per Stichworten.

export interface UniversumWert {
  name: string;
  ticker: string;
  aliase: string[];
  krypto?: boolean;
  /** Titel des englischen Wikipedia-Artikels (für Aufmerksamkeits-Signale) */
  wiki?: string;
}

/** Findet erwähnte Werte; längste Aliase zuerst (z. B. „Siemens Energy“ vor „Siemens“), ganze Wörter. */
export function erwaehnteWerte(text: string, universum: UniversumWert[]): UniversumWert[] {
  const t = ` ${text.toLowerCase()} `;
  const alle = universum.flatMap((w) => w.aliase.map((a) => ({ w, a: a.toLowerCase() }))).sort((x, y) => y.a.length - x.a.length);
  const treffer = new Map<string, UniversumWert>();
  let rest = t;
  for (const { w, a } of alle) {
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\p{L}\\p{N}])`, 'u');
    if (re.test(rest)) {
      treffer.set(w.ticker, w);
      rest = rest.replace(re, '$1 ');
    }
  }
  return [...treffer.values()];
}

const MUSTER: [string, RegExp][] = [
  ['prognose_senkung', /(senkt|kappt|reduziert)\s+(die\s+|seine\s+|ihre\s+)?(prognose|jahresziele|ausblick)|gewinnwarnung|profit warning|cuts? (its )?(guidance|forecast|outlook)|lowers? (its )?(guidance|forecast|outlook)/i],
  ['prognose_erhoehung', /(hebt|erhöht|erhoeht)\s+(die\s+|seine\s+|ihre\s+)?(prognose|jahresziele|ausblick)|prognose\s+(angehoben|erhöht)|raises? (its )?(guidance|forecast|outlook)|boosts? (its )?(guidance|forecast|outlook)/i],
  ['uebernahmeangebot', /übernahmeangebot|uebernahmeangebot|übernahme\s+von|kaufangebot|takeover (bid|offer)|to acquire|agrees? to buy|buyout offer/i],
  ['aktienrueckkauf', /aktienrückkauf|aktienrueckkauf|rückkaufprogramm|share buyback|buyback|repurchase program/i],
  ['grossauftrag', /großauftrag|grossauftrag|milliardenauftrag|auftrag (über|im wert)|wins? .{0,30}(contract|order) (worth|valued)/i],
  ['analysten_hochstufung', /stuft\s+.{0,40}(hoch|auf\s+„?kaufen)|hochgestuft|upgrade[sd]?\b|raised to (buy|outperform|overweight)/i],
  ['analysten_abstufung', /stuft\s+.{0,40}(ab|herunter|auf\s+„?verkaufen)|abgestuft|downgrade[sd]?\b|cut to (sell|underperform|underweight)/i],
  ['gewinn_ueberraschung', /übertrifft\s+.{0,30}erwartungen|uebertrifft|beats? (estimates|expectations)|tops? (estimates|expectations)|besser als erwartet/i],
  ['gewinn_enttaeuschung', /verfehlt\s+.{0,30}erwartungen|misses? (estimates|expectations)|schlechter als erwartet|enttäuscht/i],
];

/** Erkennt den stärksten Signal-Typ einer Schlagzeile; sonst "nachricht". */
export function erkenneSignalTyp(text: string): { typ: string; richtung: -1 | 0 | 1 } {
  for (const [typ, re] of MUSTER) {
    if (re.test(text)) {
      const richtung = /senkung|abstufung|enttaeuschung/.test(typ) ? -1 : 1;
      return { typ, richtung };
    }
  }
  return { typ: 'nachricht', richtung: 0 };
}
