// Leerverkäufer-Sicht, ohne Anmeldung (geprüft am 28.10.2026):
// - FINRA Consolidated Short Interest (offene Query-API, zweimal im Monat; ergänzt die tägliche Reg-SHO-Quote in finra.ts):
//   Squeeze-Kandidaten (viele Tage zum Eindecken) und starke Auf- oder Abbauten von Leerverkaufspositionen.
// - Short-Seller-Berichte per RSS (Grizzly, Fuzzy Panda, The Bear Cave): ein neuer Bericht ist ein starkes Negativsignal.
//   Spruce Point (kein Feed) und Culper (sperrt Abrufe) bleiben außen vor.
import type { Signal } from '../../core/signale.ts';
import { holeText, USER_AGENT } from '../lib/netz.ts';
import { signal } from './hilfen.ts';
import { parseRss } from './parser.ts';
import type { Meldung, Quelle } from './typen.ts';
import { kurz, pz, zustandLesen, zustandSchreiben } from './zustand.ts';

// ---------- FINRA Short Interest ----------
export interface FinraSi {
  symbolCode: string;
  issueName: string;
  marketClassCode?: string;
  currentShortPositionQuantity: number;
  previousShortPositionQuantity: number;
  changePercent: number;
  daysToCoverQuantity: number;
  averageDailyVolumeQuantity: number;
}

const KEINE_AKTIE = /\b(ETF|ETN|FUND|TRUST|PREF|PFD|PREFERRED|NOTES?|UNITS?|WARRANTS?|WTS|RIGHTS?|ACQUISITION|BOND|INCOME|MUNI|PORTFOLIO)\b/i;
// FINRA kürzt Namen auf 30 Zeichen – ETFs zusätzlich am Anbieter erkennen
const FONDSANBIETER = /^(ISHARES|INVESCO|SPDR|VANGUARD|PROSHARES|DIREXION|GLOBAL X|WISDOMTREE|FIRST TRUST|VANECK|SCHWAB|DIMENSIONAL|ARK |GRANITESHARES|DEFIANCE|ROUNDHILL|AMPLIFY|PACER|XTRACKERS|FRANKLIN|FIDELITY|JPMORGAN|AVANTIS|NEOS|YIELDMAX|TIDAL|BLACKROCK|SELECT SECTOR|ALPS|MICROSECTORS|T-REX|TRADR|LEVERAGE SHARES|CALAMOS|INNOVATOR|SPROTT|UNITED STATES)/i;
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Mögliche Stichtage (Monatsmitte und Monatsende, Wochenende → Freitag davor), neueste zuerst, mit 5 Tagen Veröffentlichungsabstand. */
export function stichtagKandidaten(jetzt: Date): string[] {
  const out: Date[] = [];
  for (let m = 0; m >= -2; m--) {
    const j = jetzt.getUTCFullYear();
    const mo = jetzt.getUTCMonth() + m;
    out.push(new Date(Date.UTC(j, mo, 15)), new Date(Date.UTC(j, mo + 1, 0)));
  }
  const werktag = (d: Date) => {
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() - 1);
    return d;
  };
  const grenze = jetzt.getTime() - 5 * 86400000;
  return [...new Set(out.map(werktag).filter((d) => d.getTime() <= grenze).sort((a, b) => b.getTime() - a.getTime()).map(iso))].slice(0, 4);
}

export function shortInterestAuswerten(zeilen: FinraSi[], stichtag: string, jetzt: Date): Signal[] {
  const gesehen = new Set<string>();
  const out: Signal[] = [];
  const zeit = jetzt.toISOString();
  for (const z of zeilen) {
    const name = (z.issueName ?? '').trim();
    if (!z.symbolCode || gesehen.has(z.symbolCode) || KEINE_AKTIE.test(name) || FONDSANBIETER.test(name)) continue;
    gesehen.add(z.symbolCode);
    if (z.previousShortPositionQuantity < 500_000 || z.averageDailyVolumeQuantity < 200_000) continue;
    // ETF-Börsen (NYSE Arca, Cboe BZX) ausschließen
    if (z.marketClassCode && ['ARCA', 'BATS', 'BZX'].includes(z.marketClassCode)) continue;
    // Freiverkehr: 5. Buchstabe = Sonderklasse (F ausländisch, Y ADR, P Vorzug, W Optionsschein …).
    // Bei Auslandswerten sitzen die Leerverkäufer im Heimatmarkt → „Tage zum Eindecken“ bedeutungslos
    if (z.marketClassCode === 'OTC' && z.symbolCode.length >= 5) continue;
    const wp = { name: (z.issueName ?? z.symbolCode).trim(), ticker: z.symbolCode };
    const link = 'https://www.finra.org/finra-data/browse-catalog/equity-short-interest/data';
    const basis = `Short Interest ${kurz(z.currentShortPositionQuantity)} Stück (${pz(z.changePercent)} % zur Vorperiode), ${z.daysToCoverQuantity.toLocaleString('de-DE')} Tage zum Eindecken, Stichtag ${stichtag}`;
    if (z.daysToCoverQuantity >= 8 && z.daysToCoverQuantity < 999 && z.changePercent >= 10) {
      out.push(signal('leerverkauf_quote', wp, Math.min(1, z.daysToCoverQuantity / 20), 0, zeit, 'FINRA Short Interest', `${basis}. Squeeze-Kandidat`, link));
    } else if (z.changePercent >= 50 && z.changePercent <= 2000) {
      out.push(signal('leerverkauf_aenderung', wp, Math.min(1, 0.3 + z.changePercent / 300), -1, zeit, 'FINRA Short Interest', `${basis}. Leerverkäufer bauen auf`, link));
    } else if (z.changePercent <= -40) {
      out.push(signal('leerverkauf_aenderung', wp, Math.min(1, 0.3 + -z.changePercent / 150), 1, zeit, 'FINRA Short Interest', `${basis}. Leerverkäufer decken ein`, link));
    }
  }
  return out.sort((a, b) => b.staerke - a.staerke).slice(0, 25);
}

const FINRA_URL = 'https://api.finra.org/data/group/otcMarket/name/consolidatedShortInterest';
const FELDER = ['symbolCode', 'issueName', 'marketClassCode', 'currentShortPositionQuantity', 'previousShortPositionQuantity', 'changePercent', 'daysToCoverQuantity', 'averageDailyVolumeQuantity'];
const gleich = (feld: string, wert: string) => ({ compareType: 'EQUAL', fieldName: feld, fieldValue: wert });
const groesser = (feld: string, wert: number) => ({ compareType: 'GREATER', fieldName: feld, fieldValue: wert });

async function finraAbfrage(body: unknown): Promise<FinraSi[]> {
  const res = await fetch(FINRA_URL, {
    method: 'POST',
    headers: { 'User-Agent': USER_AGENT, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} bei api.finra.org`);
  const t = await res.text();
  return t.trim() ? (JSON.parse(t) as FinraSi[]) : [];
}

export const finraShortInterest: Quelle = {
  id: 'finrashort',
  name: 'FINRA Short Interest (zweimal im Monat)',
  laeufe: ['haupt'],
  maxProLauf: 7,
  async abrufen(ctx) {
    const z = zustandLesen<{ stichtag?: string }>('finrashort', {});
    let abfragen = 0;
    let stichtag: string | null = null;
    for (const d of stichtagKandidaten(ctx.jetzt)) {
      abfragen++;
      if ((await finraAbfrage({ limit: 1, fields: ['symbolCode'], compareFilters: [gleich('settlementDate', d)] })).length) {
        stichtag = d;
        break;
      }
    }
    if (!stichtag || stichtag === z.stichtag) return { signale: [], abfragen };
    const filter = [gleich('settlementDate', stichtag), groesser('averageDailyVolumeQuantity', 200000), groesser('previousShortPositionQuantity', 500000)];
    const zeilen: FinraSi[] = [];
    for (const [limit, sort] of [[600, '-daysToCoverQuantity'], [300, '-changePercent'], [150, 'changePercent']] as const) {
      zeilen.push(...(await finraAbfrage({ limit, fields: FELDER, compareFilters: filter, sortFields: [sort] })));
      abfragen++;
    }
    const signale = shortInterestAuswerten(zeilen, stichtag, ctx.jetzt);
    zustandSchreiben('finrashort', { stichtag });
    return { signale, makro: [`FINRA Short Interest neu (Stichtag ${stichtag}): ${signale.length} auffällige Werte`], abfragen };
  },
};

// ---------- Short-Seller-Berichte ----------
const SHORT_FEEDS = [
  { name: 'Grizzly Research', url: 'https://grizzlyreports.com/feed/' },
  { name: 'Fuzzy Panda Research', url: 'https://fuzzypandaresearch.com/feed/' },
  { name: 'The Bear Cave', url: 'https://thebearcave.substack.com/feed' },
];

const entities = (s: string) =>
  s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/ /g, ' ');

/** „T1 Energy (TE) – …“ oder „International Games System (TPEx: 3293) — …“ → Name und Kürzel. */
export function shortReportZiel(titel: string): { name: string; ticker: string; boerse?: string } | null {
  const t = entities(titel);
  const m = t.match(/^(.{2,80}?)\s*\((?:([A-Za-z]{2,12})\s*:\s*)?([A-Z0-9][A-Z0-9.-]{0,9})\)/);
  if (!m) return null;
  return { name: m[1].trim(), ticker: m[3], boerse: m[2] };
}

export function shortReportsAuswerten(eintraege: { titel: string; link: string; zeit?: string }[], quelle: string, jetzt: Date) {
  const signale: Signal[] = [];
  const meldungen: Meldung[] = [];
  for (const e of eintraege) {
    const alterStd = e.zeit ? (jetzt.getTime() - Date.parse(e.zeit)) / 3600000 : 0;
    if (alterStd > 7 * 24) continue;
    const ziel = shortReportZiel(e.titel);
    meldungen.push({ titel: entities(e.titel), quelle, link: e.link, zeit: e.zeit, wertpapier: ziel?.name });
    if (ziel && alterStd <= 72) {
      signale.push(signal('shortreport', { name: ziel.name, ticker: ziel.ticker }, 0.8, -1, e.zeit ?? jetzt.toISOString(), quelle, `Neuer Short-Seller-Bericht: ${entities(e.titel)}${ziel.boerse ? ` (${ziel.boerse})` : ''}`, e.link));
    }
  }
  return { signale, meldungen };
}

export const shortSeller: Quelle = {
  id: 'shortseller',
  name: 'Short-Seller-Berichte (Grizzly, Fuzzy Panda, Bear Cave)',
  laeufe: ['haupt', 'stuendlich', 'samstag'],
  maxProLauf: SHORT_FEEDS.length,
  async abrufen(ctx) {
    const signale: Signal[] = [];
    const meldungen: Meldung[] = [];
    let abfragen = 0;
    let fehler = 0;
    for (const f of SHORT_FEEDS) {
      abfragen++;
      try {
        const r = shortReportsAuswerten(parseRss(await holeText(f.url, { header: { Accept: 'application/rss+xml, application/xml, text/xml' } })).slice(0, 15), f.name, ctx.jetzt);
        signale.push(...r.signale);
        meldungen.push(...r.meldungen);
      } catch {
        fehler++;
      }
    }
    if (fehler === SHORT_FEEDS.length) throw new Error('alle Short-Seller-Feeds fehlgeschlagen');
    return { signale, meldungen, abfragen };
  },
};
