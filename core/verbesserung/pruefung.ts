// Statische Prüfung eines Branches claude/verbesserung-* gegen die Leitplanken (config/verbesserung.json).
// Reine Funktionen ohne Datei- und Netzzugriff. Dieser Code läuft in der Action IMMER aus dem Stand von main –
// ein Verbesserungs-Branch kann seine eigene Prüfung nicht verändern (core/verbesserung/** ist gesperrt).
import { BEREICHE, type Aenderung, type DateiAenderung, type Leitplanken, type Manifest, type Regel } from './typen.ts';

/** Einfaches Pfadmuster: ** = beliebig tief, * = innerhalb eines Ordners. */
export function globPasst(muster: string, pfad: string): boolean {
  const re = muster
    .split('**/')
    .map((teil) =>
      teil
        .split('**')
        .map((t) => t.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*'))
        .join('.*'),
    )
    .join('(?:.*/)?');
  return new RegExp(`^${re}$`).test(pfad);
}
const passtEins = (liste: string[], pfad: string) => liste.some((m) => globPasst(m, pfad));

/** Erlaubtliste, Sperrliste (geht vor) und Löschverbot. */
export function pfadePruefen(dateien: DateiAenderung[], l: Leitplanken): string[] {
  const v: string[] = [];
  for (const d of dateien) {
    for (const pfad of d.alt ? [d.pfad, d.alt] : [d.pfad]) {
      if (/(^|\/)\.\.(\/|$)/.test(pfad) || pfad.startsWith('/')) v.push(`${pfad}: ungültiger Pfad`);
      else if (passtEins(l.verbotenePfade, pfad)) v.push(`${pfad}: gesperrt (Leitplanken › verbotenePfade)`);
      else if (!passtEins(l.erlaubtePfade, pfad)) v.push(`${pfad}: steht nicht auf der Erlaubtliste`);
    }
    const geloescht = d.status === 'D' ? d.pfad : d.status === 'R' ? d.alt : undefined;
    if (geloescht && passtEins(l.nieLoeschen, geloescht)) v.push(`${geloescht}: darf nicht gelöscht oder umbenannt werden (Quellen und Tests bleiben)`);
  }
  return v;
}

/** Geänderte Zeilen gegen das Wochenbudget (Manifest und Demo-Daten zählen nicht). */
export function umfangPruefen(dateien: DateiAenderung[], l: Leitplanken): { zeilen: number; verstoesse: string[] } {
  const ohne = l.wochenbudget.zeilenOhne ?? [];
  const zeilen = dateien.filter((d) => !passtEins(ohne, d.pfad)).reduce((a, d) => a + d.plus + d.minus, 0);
  return { zeilen, verstoesse: zeilen > l.wochenbudget.maxZeilen ? [`Umfang: ${zeilen} geänderte Zeilen, erlaubt sind ${l.wochenbudget.maxZeilen} je Woche`] : [] };
}

/** JSON flach machen: "autopilot.mindestFaelle" → Wert. Listen gelten als ein Wert. */
function flach(x: unknown, vor = '', out = new Map<string, string>()): Map<string, string> {
  if (x && typeof x === 'object' && !Array.isArray(x)) {
    for (const [k, w] of Object.entries(x as Record<string, unknown>)) flach(w, vor ? `${vor}.${k}` : k, out);
    if (!Object.keys(x as object).length && vor) out.set(vor, '{}');
  } else out.set(vor, JSON.stringify(x));
  return out;
}

function regelFuer(pfad: string, regeln: Record<string, Regel>): Regel | undefined {
  if (/hinweis$/i.test(pfad.split('.').pop() ?? '')) return 'frei';
  const teile = pfad.split('.');
  for (const [muster, regel] of Object.entries(regeln)) {
    const m = muster.split('.');
    const passt = (i: number, j: number): boolean => {
      if (i === m.length) return j === teile.length;
      if (m[i] === '**') return true;
      if (j === teile.length) return false;
      return (m[i] === '*' || m[i] === teile[j]) && passt(i + 1, j + 1);
    };
    // eine Regel für eine Liste oder einen ganzen Ast gilt auch für alles darunter, wenn sie "frei" ist
    if (passt(0, 0) || (regel === 'frei' && pfad.startsWith(`${muster}.`))) return regel;
  }
  return undefined;
}

/** Config-Datei: nur freigegebene Stellschrauben, nur innerhalb der Spanne, nichts entfernen. */
export function configPruefen(datei: string, altText: string | null, neuText: string | null, l: Leitplanken): string[] {
  const roh = l.stellschrauben[datei];
  if (neuText === null) return [`${datei}: Config-Dateien dürfen nicht gelöscht werden`];
  if (altText === null) return [`${datei}: neue Config-Dateien legt nur eine Bau-Sitzung an`];
  if (!roh || typeof roh === 'string') return [`${datei}: für diese Datei sind keine Stellschrauben freigegeben`];
  let alt: unknown;
  let neu: unknown;
  try {
    alt = JSON.parse(altText);
    neu = JSON.parse(neuText);
  } catch (e) {
    return [`${datei}: kein gültiges JSON (${(e as Error).message})`];
  }
  const a = flach(alt);
  const n = flach(neu);
  const v: string[] = [];
  for (const pfad of new Set([...a.keys(), ...n.keys()])) {
    if (a.get(pfad) === n.get(pfad)) continue;
    const regel = regelFuer(pfad, roh);
    if (!regel) {
      v.push(`${datei} › ${pfad}: keine freigegebene Stellschraube`);
      continue;
    }
    if (regel === 'frei') continue;
    if (!n.has(pfad)) {
      v.push(`${datei} › ${pfad}: darf nicht entfernt werden`);
      continue;
    }
    const wert = JSON.parse(n.get(pfad)!) as unknown;
    if (typeof wert !== 'number' || !Number.isFinite(wert) || wert < regel.min || wert > regel.max) v.push(`${datei} › ${pfad}: ${n.get(pfad)} liegt außerhalb der Spanne ${regel.min} bis ${regel.max}`);
  }
  return v;
}

/** Quellen-Register (jobs/quellen/zusatz.ts): Jeder bisher angemeldete Bezeichner muss noch dastehen. */
export function registerPruefen(altText: string | null, neuText: string | null): string[] {
  if (altText === null) return [];
  if (neuText === null) return ['Quellen-Register darf nicht gelöscht werden'];
  const eintraege = (t: string) => {
    const m = t.match(/ZUSATZ_QUELLEN[^=]*=\s*\[([\s\S]*?)\]/);
    return new Set((m?.[1] ?? '').split(',').map((s) => s.replace(/\/\/.*$/gm, '').trim()).filter(Boolean));
  };
  const neu = eintraege(neuText);
  return [...eintraege(altText)].filter((e) => !neu.has(e)).map((e) => `Quelle ${e} wurde aus dem Register entfernt – Quellen werden nie entfernt`);
}

/** Neue Code-Zeilen dürfen keine zusätzlichen Mitteilungen erzeugen. */
export function mitteilungenPruefen(neueZeilen: { pfad: string; zeile: string }[], l: Leitplanken): string[] {
  const v: string[] = [];
  for (const { pfad, zeile } of neueZeilen) {
    if (!/\.(ts|tsx|mjs|js)$/.test(pfad) || /\.test\.ts$/.test(pfad) || pfad.startsWith('e2e/')) continue;
    const baustein = l.keineNeuenMitteilungen.find((b) => zeile.includes(b));
    if (baustein) v.push(`${pfad}: neue Zeile mit „${baustein}“ – der Verbesserungslauf darf nicht mehr Mitteilungen erzeugen`);
  }
  return [...new Set(v)];
}

const text = (x: unknown, max: number) => typeof x === 'string' && x.trim().length > 0 && x.length <= max;

/** Manifest verbesserung/aenderungen/<datum>.json: Form, Umfang, Messkriterium, Zuordnung der Dateien. */
export function manifestPruefen(roh: unknown, opt: { kennzahlen: string[]; maxAenderungen: number; geaenderteDateien: string[]; ohneZuordnung?: string[] }): { manifest?: Manifest; verstoesse: string[] } {
  const v: string[] = [];
  const m = roh as Partial<Manifest> | null;
  if (!m || typeof m !== 'object' || Array.isArray(m)) return { verstoesse: ['Manifest: kein JSON-Objekt'] };
  if (typeof m.datum !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(m.datum)) v.push('Manifest: datum fehlt (JJJJ-MM-TT)');
  if (!text(m.zusammenfassung, 300)) v.push('Manifest: zusammenfassung fehlt (höchstens 300 Zeichen)');
  const liste = Array.isArray(m.aenderungen) ? m.aenderungen : [];
  if (!liste.length) v.push('Manifest: keine Änderung genannt');
  if (liste.length > opt.maxAenderungen) v.push(`Manifest: ${liste.length} Änderungen, erlaubt sind ${opt.maxAenderungen} je Woche`);
  const ids = new Set<string>();
  const zugeordnet = new Set<string>();
  liste.forEach((a: Partial<Aenderung>, i) => {
    const wo = `Änderung ${i + 1}`;
    if (typeof a?.id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,50}$/.test(a.id)) v.push(`${wo}: id fehlt (Kleinbuchstaben, Ziffern, Bindestrich)`);
    else if (ids.has(a.id)) v.push(`${wo}: id ${a.id} doppelt`);
    else ids.add(a.id);
    if (!text(a?.titel, 120)) v.push(`${wo}: titel fehlt (höchstens 120 Zeichen)`);
    if (!BEREICHE.includes(a?.bereich as never)) v.push(`${wo}: bereich muss einer von ${BEREICHE.join(', ')} sein`);
    if (!text(a?.hypothese, 400)) v.push(`${wo}: hypothese fehlt (höchstens 400 Zeichen)`);
    const k = a?.messkriterium;
    if (!k || typeof k !== 'object') v.push(`${wo}: messkriterium fehlt`);
    else {
      if (!opt.kennzahlen.includes(k.kennzahl)) v.push(`${wo}: messkriterium.kennzahl „${String(k.kennzahl)}“ ist keine bekannte Kennzahl`);
      if (k.richtung !== 'steigt' && k.richtung !== 'faellt') v.push(`${wo}: messkriterium.richtung muss steigt oder faellt sein`);
      if (!text(k.text, 300)) v.push(`${wo}: messkriterium.text fehlt (höchstens 300 Zeichen)`);
    }
    const dateien = Array.isArray(a?.dateien) ? a.dateien : [];
    if (!dateien.length) v.push(`${wo}: dateien fehlen`);
    for (const d of dateien) {
      if (!opt.geaenderteDateien.includes(d)) v.push(`${wo}: ${String(d)} wurde auf dem Branch gar nicht geändert`);
      zugeordnet.add(d);
    }
  });
  for (const d of opt.geaenderteDateien) if (!zugeordnet.has(d) && !(opt.ohneZuordnung ?? []).some((mu) => globPasst(mu, d))) v.push(`${d}: geändert, aber keiner Änderung im Manifest zugeordnet`);
  for (const f of m.freigaben ?? []) if (!text(f?.titel, 120) || !text(f?.anleitung, 1200)) v.push('Manifest: freigaben brauchen titel und anleitung');
  return v.length ? { verstoesse: v } : { manifest: m as Manifest, verstoesse: [] };
}

export interface PruefEingabe {
  dateien: DateiAenderung[];
  /** Inhalt einer Datei auf main bzw. auf dem Branch (null = gibt es dort nicht) */
  alt: (pfad: string) => string | null;
  neu: (pfad: string) => string | null;
  neueZeilen: { pfad: string; zeile: string }[];
  kennzahlen: string[];
}

export interface PruefErgebnis {
  ok: boolean;
  gruende: string[];
  zeilen: number;
  manifest?: Manifest;
}

/** Alle statischen Prüfungen zusammen. */
export function branchPruefen(e: PruefEingabe, l: Leitplanken): PruefErgebnis {
  const gruende: string[] = [];
  if (!l.aktiv) gruende.push('Selbstverbesserung ist ausgeschaltet (config/verbesserung.json › aktiv)');
  if (!e.dateien.length) gruende.push('Der Branch enthält keine Änderung gegenüber main');
  gruende.push(...pfadePruefen(e.dateien, l));
  const umfang = umfangPruefen(e.dateien, l);
  gruende.push(...umfang.verstoesse);
  for (const d of e.dateien.filter((x) => /^config\/.*\.json$/.test(x.pfad))) gruende.push(...configPruefen(d.pfad, e.alt(d.pfad), d.status === 'D' ? null : e.neu(d.pfad), l));
  if (e.dateien.some((d) => d.pfad === l.quellenRegister || d.alt === l.quellenRegister)) gruende.push(...registerPruefen(e.alt(l.quellenRegister), e.neu(l.quellenRegister)));
  gruende.push(...mitteilungenPruefen(e.neueZeilen, l));
  const manifeste = e.dateien.filter((d) => globPasst('verbesserung/aenderungen/*.json', d.pfad));
  let manifest: Manifest | undefined;
  if (manifeste.length !== 1 || manifeste[0].status !== 'A') gruende.push('Es muss genau ein neues Manifest verbesserung/aenderungen/<datum>.json geben');
  else {
    let roh: unknown = null;
    try {
      roh = JSON.parse(e.neu(manifeste[0].pfad) ?? 'null');
    } catch {
      gruende.push('Manifest: kein gültiges JSON');
    }
    const ohneZuordnung = ['verbesserung/aenderungen/*.json', ...(l.wochenbudget.zeilenOhne ?? [])];
    const r = manifestPruefen(roh, { kennzahlen: e.kennzahlen, maxAenderungen: l.wochenbudget.maxAenderungen, geaenderteDateien: e.dateien.map((d) => d.pfad), ohneZuordnung });
    gruende.push(...r.verstoesse);
    manifest = r.manifest;
    if (manifest && manifeste[0].pfad !== `verbesserung/aenderungen/${manifest.datum}.json`) gruende.push('Manifest: Dateiname und datum passen nicht zusammen');
  }
  return { ok: gruende.length === 0, gruende: [...new Set(gruende)], zeilen: umfang.zeilen, ...(manifest ? { manifest } : {}) };
}
