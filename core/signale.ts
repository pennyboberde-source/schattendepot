// Einheitliche Signale: Zusammenführen doppelter Meldungen und Bewertung nach festen, konfigurierbaren Gewichten.
import { runde } from './geld.ts';

export interface SignalQuelle {
  quelle: string;
  link?: string;
  fakt: string;
}

export interface Signal {
  /** stabil: <typ>:<schlüssel>:<datum> */
  id: string;
  /** markt (optional): woher Kurse fürs Mitverfolgen kommen – verhindert Verwechslung Coin/Aktie mit gleichem Kürzel */
  wertpapier: { name: string; ticker?: string; isin?: string; markt?: 'krypto' | 'us' | 'eu' | 'rohstoff' };
  typ: string;
  /** 0..1 */
  staerke: number;
  /** +1 long / −1 short / 0 neutral */
  richtung: -1 | 0 | 1;
  zeit: string;
  quellen: SignalQuelle[];
}

export interface SignalConfig {
  typen: Record<string, { name: string; gewicht: number; richtung: number }>;
  quellen: { standardGewicht: number };
  mehrfachBonus: number;
  zusammenfuehrenStunden: number;
  topKandidaten: number;
}

export interface Gewichte {
  signale?: Record<string, number>;
  quellen?: Record<string, number>;
}

/** Kürzel, die ohne Marktangabe als Coin gelten (wie beim Kursabruf in core/autopilot.ts). */
export const KRYPTO_OHNE_MARKT = ['BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOT'];

/**
 * Schlüssel eines Wertpapiers: Ticker bevorzugt, sonst ISIN, sonst normalisierter Name.
 * Seit V1 (14.11.2026) trägt der Schlüssel den Markt: `T:` Aktie/ETF, `K:` Coin, `R:` Rohstoff. Vorher hießen alle
 * `T:<Kürzel>` – die Aktie ZETA erbte so die Upbit-Warnungen des Coins ZETA, und INTC lief als Krypto-Wert.
 */
export function wertpapierSchluessel(w: Signal['wertpapier']): string {
  if (w.ticker) {
    const t = w.ticker.toUpperCase().replace(/\.(DE|US)$/, '');
    const art = w.markt === 'krypto' || (!w.markt && KRYPTO_OHNE_MARKT.includes(t)) ? 'K' : w.markt === 'rohstoff' ? 'R' : 'T';
    return `${art}:${t}`;
  }
  if (w.isin) return `I:${w.isin.toUpperCase()}`;
  return `N:${w.name.toLowerCase().replace(/\b(ag|se|inc|corp|co|ltd|plc|nv|sa|kgaa|group|holding)\b/g, '').replace(/[^a-z0-9]/g, '')}`;
}

/**
 * Alte Schlüssel lesbar halten: Einträge von vor dem 14.11.2026 tragen `T:<Kürzel>` auch für Coins und Rohstoffe,
 * aber mit Marktangabe daneben. Überall, wo Schlüssel aus alten und neuen Daten verglichen werden (Episoden,
 * Hot Stuff, Vorlauf), wird über diese Abbildung verglichen – die gespeicherten Daten bleiben unverändert.
 */
export function schluesselNormal(schluessel: string, markt?: string): string {
  if (!schluessel.startsWith('T:')) return schluessel;
  const t = schluessel.slice(2);
  if (markt === 'krypto' || (!markt && KRYPTO_OHNE_MARKT.includes(t))) return `K:${t}`;
  return markt === 'rohstoff' ? `R:${t}` : schluessel;
}

/** Mittelteil einer Signal-ID: Coins und Rohstoffe tragen ihre Art mit (`K.ZETA`), damit sie nie mit der Aktie gleichen Kürzels zusammenfallen. */
export function idTeil(w: Signal['wertpapier']): string {
  const k = wertpapierSchluessel(w);
  return k.startsWith('K:') || k.startsWith('R:') ? k.replace(':', '.') : k.slice(2);
}

/**
 * Führt Signale gleichen Typs zum selben Wertpapier innerhalb des Zeitfensters zusammen.
 * Mehrere unabhängige Quellen = stärkeres Signal (Stärke = max + Bonus je weiterer Quelle).
 */
export function zusammenfuehren(signale: Signal[], cfg: Pick<SignalConfig, 'mehrfachBonus' | 'zusammenfuehrenStunden'>): Signal[] {
  const fenster = cfg.zusammenfuehrenStunden * 3600000;
  const gruppen = new Map<string, Signal[]>();
  for (const s of [...signale].sort((a, b) => a.zeit.localeCompare(b.zeit))) {
    const k = `${s.typ}|${wertpapierSchluessel(s.wertpapier)}`;
    const liste = gruppen.get(k) ?? [];
    liste.push(s);
    gruppen.set(k, liste);
  }
  const ergebnis: Signal[] = [];
  for (const liste of gruppen.values()) {
    let aktuell: Signal | null = null;
    for (const s of liste) {
      if (aktuell && new Date(s.zeit).getTime() - new Date(aktuell.zeit).getTime() <= fenster) {
        const basis: Signal = aktuell;
        const neueQuellen = s.quellen.filter((q) => !basis.quellen.some((a) => a.quelle === q.quelle));
        const wp: Signal['wertpapier'] = { ...basis.wertpapier };
        wp.isin ??= s.wertpapier.isin;
        wp.ticker ??= s.wertpapier.ticker;
        aktuell = {
          ...basis,
          wertpapier: wp,
          quellen: [...basis.quellen, ...neueQuellen],
          staerke: Math.max(basis.staerke, s.staerke),
          richtung: basis.richtung || s.richtung,
        };
      } else {
        if (aktuell) ergebnis.push(aktuell);
        aktuell = { ...s, quellen: [...s.quellen] };
      }
    }
    if (aktuell) ergebnis.push(aktuell);
  }
  return ergebnis.map((s) => {
    const unabhaengig = new Set(s.quellen.map((q) => q.quelle)).size;
    return { ...s, staerke: runde(Math.min(1, s.staerke * (1 + cfg.mehrfachBonus * (unabhaengig - 1))), 3) };
  });
}

/** Punktzahl eines Signals: Typ-Gewicht × Stärke × Ø Quellen-Gewicht (Gewichte aus der Lernschleife überschreiben die Grundwerte). */
export function signalPunkte(s: Signal, cfg: SignalConfig, gew: Gewichte = {}): number {
  const typ = cfg.typen[s.typ];
  const typGewicht = gew.signale?.[s.typ] ?? typ?.gewicht ?? 0.5;
  const qg = s.quellen.map((q) => gew.quellen?.[q.quelle] ?? cfg.quellen.standardGewicht);
  const quellenGewicht = qg.length ? qg.reduce((a, b) => a + b, 0) / qg.length : cfg.quellen.standardGewicht;
  return typGewicht * s.staerke * quellenGewicht;
}

export interface Kandidat {
  schluessel: string;
  wertpapier: Signal['wertpapier'];
  /** gerichtete Punktzahl: positiv = Long-Idee, negativ = Short-Idee */
  score: number;
  signale: Signal[];
}

/** Kandidaten nach Betrag der gerichteten Punktzahl (neutrale Signale verstärken die vorherrschende Richtung). */
export function kandidaten(signale: Signal[], cfg: SignalConfig, gew: Gewichte = {}): Kandidat[] {
  const nachWp = new Map<string, Kandidat>();
  for (const s of signale) {
    const k = wertpapierSchluessel(s.wertpapier);
    const c = nachWp.get(k) ?? { schluessel: k, wertpapier: { ...s.wertpapier }, score: 0, signale: [] };
    c.wertpapier.isin ??= s.wertpapier.isin;
    c.wertpapier.ticker ??= s.wertpapier.ticker;
    c.signale.push(s);
    nachWp.set(k, c);
  }
  for (const c of nachWp.values()) {
    const gerichtet = c.signale.filter((s) => s.richtung !== 0).reduce((a, s) => a + s.richtung * signalPunkte(s, cfg, gew), 0);
    const neutral = c.signale.filter((s) => s.richtung === 0).reduce((a, s) => a + signalPunkte(s, cfg, gew), 0);
    c.score = runde(gerichtet + Math.sign(gerichtet || 1) * neutral * 0.5, 2);
  }
  return [...nachWp.values()].sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, cfg.topKandidaten);
}
