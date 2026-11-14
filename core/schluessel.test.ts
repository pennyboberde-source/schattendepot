// Plan Volltreffer V1 (Befund 6): Aktie und Coin mit gleichem Kürzel sind zwei Werte. Alte Schlüssel bleiben lesbar.
import { describe, expect, it } from 'vitest';
import signalCfg from '../config/signale.json';
import { hotStuff, signalSchluessel, verdichten, vorlaufFortschreiben, leereVorlaufStatistik, type KompaktSignal } from './datenkrake.ts';
import { episodenVertreter } from './episoden.ts';
import { idTeil, kandidaten, schluesselNormal, wertpapierSchluessel, zusammenfuehren, type Signal, type SignalConfig } from './signale.ts';

const CFG = signalCfg as unknown as SignalConfig;
const sig = (typ: string, wertpapier: Signal['wertpapier'], richtung: -1 | 0 | 1 = 1, quelle = 'Q'): Signal => ({ id: `${typ}:${idTeil(wertpapier)}:2026-11-16`, wertpapier, typ, staerke: 0.6, richtung, zeit: '2026-11-16T08:00:00Z', quellen: [{ quelle, fakt: 'x' }] });

describe('Wertpapier-Schlüssel mit Markt', () => {
  it('Aktie T:, Coin K:, Rohstoff R: – Aktien-Schlüssel bleiben wie bisher', () => {
    expect(wertpapierSchluessel({ name: 'Zeta Global', ticker: 'ZETA' })).toBe('T:ZETA');
    expect(wertpapierSchluessel({ name: 'ZetaChain', ticker: 'ZETA', markt: 'krypto' })).toBe('K:ZETA');
    expect(wertpapierSchluessel({ name: 'Gold (Rohstoff)', ticker: 'PAXG', markt: 'rohstoff' })).toBe('R:PAXG');
    expect(wertpapierSchluessel({ name: 'SAP SE', ticker: 'sap.de', markt: 'eu' })).toBe('T:SAP');
    // große Coins gelten auch ohne Marktangabe als Coin (wie beim Kursabruf)
    expect(wertpapierSchluessel({ name: 'Bitcoin', ticker: 'BTC' })).toBe('K:BTC');
    expect(wertpapierSchluessel({ name: 'SAP SE', isin: 'DE0007164600' })).toBe('I:DE0007164600');
    expect(idTeil({ name: 'ZetaChain', ticker: 'ZETA', markt: 'krypto' })).toBe('K.ZETA');
    expect(idTeil({ name: 'Zeta Global', ticker: 'ZETA' })).toBe('ZETA');
  });

  it('Verwechslung ZETA: Die Aktie erbt die Upbit-Warnung des Coins nicht mehr', () => {
    const aktie = sig('gewinn_ueberraschung', { name: 'Zeta Global Holdings', ticker: 'ZETA' }, 1, 'Finnhub');
    const coin = sig('upbit_warnung', { name: 'ZetaChain', ticker: 'ZETA', markt: 'krypto' }, -1, 'Upbit');
    const coinRakete = sig('kursrakete', { name: 'ZetaChain', ticker: 'ZETA', markt: 'krypto' }, 1, 'Upbit');
    const aktieRakete = sig('kursrakete', { name: 'Zeta Global Holdings', ticker: 'ZETA' }, 1, 'Alpha Vantage');
    // gleiche Art, gleiches Kürzel, gleicher Tag: zwei verschiedene Signale mit verschiedenen IDs
    expect(coinRakete.id).not.toBe(aktieRakete.id);
    const zusammen = zusammenfuehren([coin, aktie, coinRakete, aktieRakete], CFG);
    expect(zusammen).toHaveLength(4);
    // der Coin steht in der Liste zuerst – früher bestimmte er damit den Markt des gemeinsamen Kandidaten
    const k = kandidaten(zusammen, CFG);
    expect(k.map((c) => c.schluessel).sort()).toEqual(['K:ZETA', 'T:ZETA']);
    const a = k.find((c) => c.schluessel === 'T:ZETA')!;
    expect(a.signale.map((s) => s.typ).sort()).toEqual(['gewinn_ueberraschung', 'kursrakete']);
    expect(a.wertpapier.markt).toBeUndefined();
    expect(a.score).toBeGreaterThan(0);
    const c = k.find((x) => x.schluessel === 'K:ZETA')!;
    expect(c.signale.map((s) => s.typ).sort()).toEqual(['kursrakete', 'upbit_warnung']);
    expect(c.wertpapier.markt).toBe('krypto');
    // in der Tagesdatei bleiben es vier Einträge
    expect(new Set(verdichten(zusammen).map((x) => x.id)).size).toBe(4);
  });

  it('INTC: ein Krypto-Signal mit dem Kürzel einer Aktie macht die Aktie nicht zum Krypto-Wert', () => {
    const k = kandidaten(zusammenfuehren([sig('funding_extrem', { name: 'INTC', ticker: 'INTC', markt: 'krypto' }, -1, 'Kraken Futures'), sig('nachricht', { name: 'Intel', ticker: 'INTC' }, 1, 'CNBC'), sig('insider_kauf', { name: 'Intel', ticker: 'INTC' }, 1, 'OpenInsider')], CFG), CFG);
    const intel = k.find((c) => c.schluessel === 'T:INTC')!;
    expect(intel.wertpapier.markt).toBeUndefined();
    expect(intel.signale.map((s) => s.typ).sort()).toEqual(['insider_kauf', 'nachricht']);
    expect(k.find((c) => c.schluessel === 'K:INTC')?.signale).toHaveLength(1);
  });
});

describe('Alte Schlüssel bleiben über die Abbildung lesbar', () => {
  it('T:<Kürzel> mit markt krypto ist derselbe Wert wie K:<Kürzel>', () => {
    expect(schluesselNormal('T:ELF', 'krypto')).toBe('K:ELF');
    expect(schluesselNormal('T:ELF')).toBe('T:ELF');
    expect(schluesselNormal('T:BTC')).toBe('K:BTC');
    expect(schluesselNormal('T:PAXG', 'rohstoff')).toBe('R:PAXG');
    expect(schluesselNormal('K:ELF', 'krypto')).toBe('K:ELF');
    expect(schluesselNormal('I:DE0007164600', 'eu')).toBe('I:DE0007164600');
    expect(signalSchluessel({ s: 'T:ELF', m: 'krypto' })).toBe('K:ELF');
  });

  it('Episoden: alter und neuer Eintrag desselben Coins zählen als eine Episode, Aktie und Coin getrennt', () => {
    const l = [
      { schluessel: 'T:ELF', datum: '2026-11-12', markt: 'krypto', start: 1 },
      { schluessel: 'K:ELF', datum: '2026-11-16', markt: 'krypto', start: 1 },
      { schluessel: 'T:ZETA', datum: '2026-11-16', start: 1 },
      { schluessel: 'K:ZETA', datum: '2026-11-16', markt: 'krypto', start: 1 },
    ];
    expect(episodenVertreter(l)).toEqual([l[0], l[2], l[3]]);
  });

  it('Hot Stuff und Vorlauf finden Vorzeichen aus alten Tagesdateien', () => {
    const k = (s: string, typ: string, m?: string): KompaktSignal => ({ id: `${typ}:${s}`, s, n: s, t: s.slice(2), ...(m ? { m } : {}), typ, r: 1, st: 0.5, q: ['Upbit'], z: 'x' });
    const alt = { datum: '2026-11-12', signale: [k('T:ELF', 'upbit_warnung', 'krypto'), k('T:ZETA', 'upbit_warnung', 'krypto'), k('T:ZETA', 'insider_kauf')] };
    const r = hotStuff([k('K:ELF', 'kursrakete', 'krypto'), k('T:ZETA', 'kursrakete')], [alt], '2026-11-16');
    expect(r.mover.find((m) => m.s === 'K:ELF')?.vorzeichen).toEqual([{ typ: 'upbit_warnung', tageVorher: 4, q: ['Upbit'] }]);
    // die Aktie ZETA bekommt nur ihr eigenes Vorzeichen, nicht die Warnung des Coins
    expect(r.mover.find((m) => m.s === 'T:ZETA')?.vorzeichen.map((v) => v.typ)).toEqual(['insider_kauf']);
    const v = vorlaufFortschreiben(leereVorlaufStatistik(), alt, new Set(['K:ELF']));
    expect(v.jeTyp.upbit_warnung).toEqual({ signale: 2, vorRakete: 1 });
    expect(v.gesamt).toEqual({ signale: 3, vorRakete: 1 });
  });
});
