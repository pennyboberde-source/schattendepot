// Insider-Käufe (SEC Formular 4, seit 16.11.2026): Kauft ein Vorstand, Direktor oder Großaktionär Aktien der eigenen
// Firma an der Börse (Transaktionscode „P“), ist das ein klassischer Kandidat für Long-Muster. Zwei Quellen:
//   - die vierteljährlichen Datensätze der SEC (Form 3/4/5, Tab-getrennt, Jahre zurück) für den Rückblick,
//   - die einzelnen Formular-4-Meldungen aus dem EDGAR-Tagesverzeichnis für die Tage danach (mit Annahmezeit).
// Gespeichert wird je Kürzel nur [Tag, Uhrzeit US-Ostküste, Kaufwert in $] – privat im Archiv. Reine Funktionen.

export interface InsiderArchiv {
  stand: string;
  /** vollständig erfasst ab/bis (Tage); Merkmale gelten nur in diesem Bereich als bekannt */
  ab: string | null;
  bis: string | null;
  /** schon verarbeitete Quartale (z. B. „2026q3“) und einzeln nachgefasste Tage */
  quartale: string[];
  tage: string[];
  /** Kürzel → Käufe [Tag, Uhrzeit, Wert in $] */
  kaeufe: Record<string, [string, string, number][]>;
}

const MONATE: Record<string, string> = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };

/** Datum aus den SEC-Datensätzen: „31-MAR-2026“ oder „2026-03-31“ → JJJJ-MM-TT (sonst null) */
export function secDatum(x: string | undefined): string | null {
  const t = (x ?? '').trim().toUpperCase();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})-([A-Z]{3})-(\d{4})$/.exec(t);
  if (m && MONATE[m[2]]) return `${m[3]}-${MONATE[m[2]]}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Tab-getrennte Tabelle mit Kopfzeile → Zeilen als Objekte (nur die gewünschten Spalten) */
function tabelle(text: string, spalten: string[]): { zeilen: Record<string, string>[]; fehlt: string[] } {
  const z = text.split(/\r?\n/);
  const kopf = (z[0] ?? '').split('\t').map((x) => x.trim().toUpperCase());
  const pos = spalten.map((s) => kopf.indexOf(s));
  const fehlt = spalten.filter((_, i) => pos[i] < 0);
  if (fehlt.length) return { zeilen: [], fehlt };
  const zeilen: Record<string, string>[] = [];
  for (let i = 1; i < z.length; i++) {
    if (!z[i]) continue;
    const t = z[i].split('\t');
    const o: Record<string, string> = {};
    spalten.forEach((s, k) => (o[s] = t[pos[k]] ?? ''));
    zeilen.push(o);
  }
  return { zeilen, fehlt: [] };
}

/**
 * Ein Quartals-Datensatz (Inhalt von SUBMISSION.tsv und NONDERIV_TRANS.tsv) → Käufe je Kürzel: nur Formular 4,
 * Code „P“ (Kauf an der Börse oder privat), erworben („A“), Wert = Stück × Preis, je Meldung summiert, ab `mindestWert` $.
 * Ohne Annahmezeit im Datensatz gilt „nach Börsenschluss“ (17:00) – vorsichtig, kein Rückschaufehler.
 */
export function kaeufeAusDatensatz(submission: string, transaktionen: string, mindestWert = 10000): { kaeufe: Map<string, [string, string, number][]>; fehlt: string[] } {
  const sub = tabelle(submission, ['ACCESSION_NUMBER', 'FILING_DATE', 'DOCUMENT_TYPE', 'ISSUERTRADINGSYMBOL']);
  const tr = tabelle(transaktionen, ['ACCESSION_NUMBER', 'TRANS_CODE', 'TRANS_SHARES', 'TRANS_PRICEPERSHARE', 'TRANS_ACQUIRED_DISP_CD']);
  const fehlt = [...sub.fehlt.map((s) => `SUBMISSION.${s}`), ...tr.fehlt.map((s) => `NONDERIV_TRANS.${s}`)];
  const kaeufe = new Map<string, [string, string, number][]>();
  if (fehlt.length) return { kaeufe, fehlt };
  const wertJe = new Map<string, number>();
  for (const t of tr.zeilen) {
    if (t.TRANS_CODE.trim() !== 'P' || t.TRANS_ACQUIRED_DISP_CD.trim() !== 'A') continue;
    const w = Number(t.TRANS_SHARES) * Number(t.TRANS_PRICEPERSHARE);
    if (Number.isFinite(w) && w > 0) wertJe.set(t.ACCESSION_NUMBER, (wertJe.get(t.ACCESSION_NUMBER) ?? 0) + w);
  }
  for (const s of sub.zeilen) {
    const w = wertJe.get(s.ACCESSION_NUMBER);
    if (!w || w < mindestWert || s.DOCUMENT_TYPE.trim() !== '4') continue;
    const datum = secDatum(s.FILING_DATE);
    const k = kuerzelNormal(s.ISSUERTRADINGSYMBOL);
    if (!datum || !k) continue;
    (kaeufe.get(k) ?? kaeufe.set(k, []).get(k)!).push([datum, '17:00', Math.round(w)]);
  }
  return { kaeufe, fehlt };
}

/** Kürzel wie bei Massive (BRK.B); mehrere Kürzel („ABC, ABCW“) → das erste; „NONE“/leer → null */
export function kuerzelNormal(x: string | undefined): string | null {
  const t = (x ?? '').trim().toUpperCase().split(/[,;\s]+/)[0]?.replace(/[-/]/g, '.') ?? '';
  return t && t !== 'NONE' && t !== 'N/A' && /^[A-Z][A-Z0-9.]{0,9}$/.test(t) ? t : null;
}

const wert = (xml: string, tag: string) => new RegExp(`<${tag}>\\s*(?:<value>)?\\s*([^<]*?)\\s*(?:</value>)?\\s*</${tag}>`, 'i').exec(xml)?.[1] ?? '';

/**
 * Eine einzelne Formular-4-Meldung (vollständige Einreichung .txt aus EDGAR mit SEC-Kopf und XML) → Kauf oder null.
 * Die Annahmezeit steht im Kopf (ACCEPTANCE-DATETIME, Ortszeit US-Ostküste).
 */
export function kaufAusMeldung(text: string, mindestWert = 10000): { kuerzel: string; datum: string; zeit: string; wert: number } | null {
  const typ = /CONFORMED SUBMISSION TYPE:\s*(\S+)/.exec(text)?.[1];
  if (typ !== '4') return null;
  const ann = /<ACCEPTANCE-DATETIME>(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(text);
  if (!ann) return null;
  const kuerzel = kuerzelNormal(wert(text, 'issuerTradingSymbol'));
  if (!kuerzel) return null;
  let summe = 0;
  for (const block of text.match(/<nonDerivativeTransaction>[\s\S]*?<\/nonDerivativeTransaction>/gi) ?? []) {
    if (wert(block, 'transactionCode').toUpperCase() !== 'P' || wert(block, 'transactionAcquiredDisposedCode').toUpperCase() !== 'A') continue;
    const w = Number(wert(block, 'transactionShares')) * Number(wert(block, 'transactionPricePerShare'));
    if (Number.isFinite(w) && w > 0) summe += w;
  }
  if (summe < mindestWert) return null;
  return { kuerzel, datum: `${ann[1]}-${ann[2]}-${ann[3]}`, zeit: `${ann[4]}:${ann[5]}`, wert: Math.round(summe) };
}

/** EDGAR-Tagesverzeichnis form.idx → Dateipfade der Formular-4-Meldungen (edgar/data/…/….txt), ohne Doppel */
export function formular4Dateien(idx: string): string[] {
  const aus = new Set<string>();
  for (const z of idx.split('\n')) {
    if (z.slice(0, 12).trim() !== '4') continue;
    const m = /\s(edgar\/data\/\S+\.txt)\s*$/.exec(z);
    if (m) aus.add(m[1]);
  }
  return [...aus];
}

/** Käufe zusammenführen (je Kürzel und Tag: größter Wert, früheste Zeit), sortiert */
export function kaeufeVereinen(alt: Record<string, [string, string, number][]>, neu: Map<string, [string, string, number][]> | Record<string, [string, string, number][]>): Record<string, [string, string, number][]> {
  const aus: Record<string, [string, string, number][]> = { ...alt };
  for (const [k, liste] of neu instanceof Map ? neu : Object.entries(neu)) {
    const m = new Map((aus[k] ?? []).map((x) => [x[0], x] as const));
    for (const x of liste) {
      const v = m.get(x[0]);
      // größter Wert statt Summe: so bleibt das Zusammenführen wiederholbar (dieselbe Meldung zweimal zählt nicht doppelt)
      m.set(x[0], v ? [x[0], v[1] < x[1] ? v[1] : x[1], Math.max(v[2], x[2])] : x);
    }
    aus[k] = [...m.values()].sort((a, b) => a[0].localeCompare(b[0]));
  }
  return aus;
}

/** Quartal eines Tages: „2026-11-16“ → „2026q4“; Quartale von bis (einschließlich) */
export const quartalVon = (datum: string) => `${datum.slice(0, 4)}q${Math.floor((Number(datum.slice(5, 7)) - 1) / 3) + 1}`;
export function quartaleZwischen(von: string, bis: string): string[] {
  const aus: string[] = [];
  let j = Number(von.slice(0, 4));
  let q = Number(quartalVon(von).slice(5));
  const zj = Number(bis.slice(0, 4));
  const zq = Number(quartalVon(bis).slice(5));
  while (j < zj || (j === zj && q <= zq)) {
    aus.push(`${j}q${q}`);
    q++;
    if (q > 4) {
      q = 1;
      j++;
    }
  }
  return aus;
}
/** letzter Tag eines Quartals */
export const quartalsEnde = (q: string) => `${q.slice(0, 4)}-${['03-31', '06-30', '09-30', '12-31'][Number(q.slice(5)) - 1]}`;
