// Turbo-Prüfung über OpenFIGI (ohne Schlüssel): Firmenname je US-Kürzel (Zuordnung, 10 je Anfrage, 25 Anfragen/Min.)
// und Suche nach Hebelprodukten an der Börse München/gettex (5 Suchen/Min.). Ergebnis als Cache je Kürzel
// (privat im Archiv: stamm/turbos.json). Rechnet nichts selbst – die Auswertung steht in core/volltreffer/turbos.ts.
import { pruefenFaellig, suchname, turboStand, type TurboStand } from '../../core/volltreffer/turbos.ts';

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface TurboEinstellungen {
  gueltigTage: number;
  /** höchstens so viele Suchen je Lauf (5 je Minute) */
  maxSuchen: number;
  /** höchstens so viele Ergebnisseiten (je 100 Produkte) je Firma */
  maxSeiten: number;
  boerse: string;
}

async function openfigi(pfad: 'mapping' | 'search', body: unknown, versuche = 3): Promise<unknown> {
  for (let v = 0; v < versuche; v++) {
    const r = await fetch(`https://api.openfigi.com/v3/${pfad}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (r.status === 429) {
      // Grenze erreicht: bis zum angegebenen Neustart warten (Sekunden), mindestens 15 s
      const s = Number(r.headers.get('ratelimit-reset')) || 60;
      await pause(Math.max(15, s) * 1000 + 500);
      continue;
    }
    if (!r.ok) throw new Error(`OpenFIGI ${pfad}: HTTP ${r.status}`);
    return r.json();
  }
  throw new Error(`OpenFIGI ${pfad}: Grenze nicht frei geworden`);
}

/**
 * Prüft die Kürzel (Reihenfolge = Vorrang), deren Stand fehlt oder veraltet ist, und trägt sie in den Cache ein.
 * Bricht bei Zeitende oder nach maxSuchen ab; Fehler einzelner Firmen werden gezählt, nicht geworfen.
 */
export async function turbosPruefen(kuerzel: string[], cache: Record<string, TurboStand>, heute: string, e: TurboEinstellungen, frist = Date.now() + 15 * 60000): Promise<{ geprueft: number; ohneName: number; fehler: number }> {
  const offen = [...new Set(kuerzel)].filter((k) => pruefenFaellig(cache[k], heute, e.gueltigTage));
  let geprueft = 0;
  let ohneName = 0;
  let fehler = 0;
  let suchen = 0;
  // 1. Firmennamen (10 Kürzel je Anfrage; 2,6 s Abstand hält 25 je Minute ein)
  const namen = new Map<string, string>();
  const bedarf = offen.slice(0, e.maxSuchen);
  for (let i = 0; i < bedarf.length && Date.now() < frist; i += 10) {
    const teil = bedarf.slice(i, i + 10);
    try {
      const a = (await openfigi(
        'mapping',
        teil.map((k) => ({ idType: 'TICKER', idValue: k.replace('.', '/'), exchCode: 'US', marketSecDes: 'Equity' })),
      )) as { data?: { name?: string; securityType2?: string }[] }[];
      a.forEach((x, j) => {
        const d = (x.data ?? []).find((y) => y.securityType2 === 'Common Stock' || y.securityType2 === 'Depositary Receipt') ?? x.data?.[0];
        if (d?.name) namen.set(teil[j], d.name);
      });
    } catch {
      fehler++;
    }
    await pause(2600);
  }
  // 2. Hebelprodukte je Firma (12,5 s Abstand hält 5 Suchen je Minute ein)
  for (const k of bedarf) {
    if (Date.now() > frist || suchen >= e.maxSuchen) break;
    const name = namen.get(k);
    if (!name) {
      ohneName++;
      continue;
    }
    const begriff = suchname(name);
    if (begriff.length < 3) {
      ohneName++;
      continue;
    }
    try {
      const produkte: string[] = [];
      let start: string | undefined;
      for (let s = 0; s < e.maxSeiten; s++) {
        suchen++;
        const t0 = Date.now();
        const j = (await openfigi('search', { query: begriff, securityType2: 'Warrant', exchCode: e.boerse, ...(start ? { start } : {}) })) as { data?: { name?: string }[]; next?: string };
        for (const d of j.data ?? []) if (d.name) produkte.push(d.name);
        await pause(Math.max(0, 12500 - (Date.now() - t0)));
        const zwischen = turboStand(produkte, name, heute);
        // genug gesehen: beide Richtungen da, oder keine weitere Seite
        if (!j.next || (zwischen.long > 0 && zwischen.short > 0) || suchen >= e.maxSuchen) break;
        start = j.next;
      }
      cache[k] = turboStand(produkte, name, heute);
      geprueft++;
    } catch {
      fehler++;
    }
  }
  return { geprueft, ohneName, fehler };
}
