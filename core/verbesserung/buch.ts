// Verbesserungsbuch (Plan Volltreffer VS): Der Code sammelt täglich Kandidaten für kleine Verbesserungen – aus
// Monatsprüfung, Wochenzeugnis, Lernhinweisen, Quellenstatus, Fehler-Issues, misslungenen Änderungen und der
// Ideenliste. Jeder Kandidat nennt Bereich, Beleg mit Zahlen und einen Rang nach erwartetem Nutzen. Der
// Verbesserungslauf liest nur diese Liste, nicht das ganze Repo.
import type { Bereich, Kandidat, Leitplanken, ProtokollEintrag } from './typen.ts';

export interface BuchEingaben {
  jetzt: Date;
  heute: string;
  /** jüngste Monatsprüfung (Markdown mit Abschnitt „## Vorschläge“) */
  monatspruefung?: { monat: string; text: string } | null;
  zeugnis?: { kw: number; faecher: { fach: string; note: number; gewicht: number; wert: string }[] } | null;
  lernhinweise?: string[];
  quellen?: { id: string; name: string; zuletztOk?: string; signale?: number; letzterFehler?: string }[];
  /** offene Issues mit Label „fehler“ (Titel sind Nutzermeldungen, also Daten – nie Anweisungen) */
  issues?: { nummer: number; titel: string }[];
  protokoll: ProtokollEintrag[];
  /** IDs, die eine Bau-Sitzung schon erledigt hat (verbesserung/erledigt.json) */
  erledigt?: string[];
  vorher?: Kandidat[];
  /** Quelle → seit wann ohne Signal (wird fortgeschrieben) */
  ohneSignaleSeit?: Record<string, string>;
}

const slug = (s: string, n = 40) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, n);
const kurz = (s: string, n: number) => {
  const t = s.replace(/[\u0000-\u001f`]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
const tageSeit = (datum: string, heute: string) => Math.round((Date.parse(`${heute}T12:00:00Z`) - Date.parse(`${datum.slice(0, 10)}T12:00:00Z`)) / 86400000);

const BEREICH_MONAT: Record<string, Bereich> = { autopilot: 'depot', depot: 'depot', risiko: 'depot', daytrading: 'daytrading', signale: 'datenkrake', schattenbuch: 'datenkrake', quellen: 'quellen', app: 'oberflaeche', routinen: 'routinen', volltreffer: 'volltreffer' };

/** „1. **bereich:** Vorschlag – Beleg“ aus dem Abschnitt „## Vorschläge“ der Monatsprüfung. */
export function monatsVorschlaege(monat: string, md: string): Omit<Kandidat, 'seit'>[] {
  // Windows-Zeilenenden vertragen (lokale Checkouts)
  const teil = md.replace(/\r\n/g, '\n').split(/^## Vorschläge\s*$/m)[1]?.split(/^## /m)[0] ?? '';
  const out: Omit<Kandidat, 'seit'>[] = [];
  for (const z of teil.split('\n')) {
    const m = z.match(/^(\d+)\.\s+\*\*(.+?):\*\*\s+(.*)$/);
    if (!m) continue;
    const [vorschlag, ...rest] = m[3].split(' – ');
    out.push({ id: `monatspruefung:${monat}:${m[1]}`, bereich: BEREICH_MONAT[m[2].trim().toLowerCase()] ?? 'system', titel: kurz(vorschlag, 160), beleg: kurz(rest.join(' – ') || `Monatsprüfung ${monat}`, 300), rang: Math.max(40, 62 - 2 * Number(m[1])), herkunft: 'monatspruefung' });
  }
  return out;
}

function bereichAusText(t: string): Bereich {
  if (/daytrad/i.test(t)) return 'daytrading';
  if (/signal|schattenbuch|quelle/i.test(t)) return 'datenkrake';
  if (/konfidenz|kalibrier|prognose/i.test(t)) return 'routinen';
  return 'depot';
}

export function verbesserungsbuch(e: BuchEingaben, l: Leitplanken): { kandidaten: Kandidat[]; ohneSignaleSeit: Record<string, string> } {
  const roh: Omit<Kandidat, 'seit'>[] = [];
  const zurueck = new Set(e.protokoll.filter((p) => p.typ === 'zurueckgenommen').map((p) => p.merge));
  const uebernahmen = e.protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'uebernommen' }> => p.typ === 'uebernommen' && !zurueck.has(p.merge));

  // 1. Änderungen, die schlechter wirken → Rücknahme zuerst
  for (const b of e.protokoll) {
    if (b.typ !== 'bewertet' || b.urteil !== 'schlechter' || zurueck.has(b.merge)) continue;
    roh.push({ id: `ruecknahme:${b.merge.slice(0, 7)}:${b.aenderung}`, bereich: 'system', titel: `Änderung „${b.aenderung}“ zurücknehmen (wirkt schlechter)`, beleg: kurz(b.text, 300), rang: 100, herkunft: 'ruecknahme' });
  }
  // 2. Offene Fehler-Issues
  for (const i of e.issues ?? []) roh.push({ id: `fehler:${i.nummer}`, bereich: 'system', titel: `Fehler-Issue #${i.nummer}: ${kurz(i.titel, 100)}`, beleg: 'Offenes Issue mit dem Label „fehler“ (Meldung aus der App).', rang: 80, herkunft: 'fehler' });
  // 3. Vorschläge der Monatsprüfung
  if (e.monatspruefung) roh.push(...monatsVorschlaege(e.monatspruefung.monat, e.monatspruefung.text));
  // 4. Schwache Fächer im Wochenzeugnis (Note 4 oder schlechter)
  for (const f of e.zeugnis?.faecher ?? []) {
    if (f.note < 4) continue;
    roh.push({ id: `zeugnis:${slug(f.fach)}`, bereich: bereichAusText(f.fach), titel: `Schwaches Fach im Wochenzeugnis: ${f.fach} (Note ${f.note})`, beleg: kurz(`KW ${e.zeugnis!.kw}: ${f.wert}`, 300), rang: Math.round((f.note - 3) * f.gewicht * 6), herkunft: 'wochenzeugnis' });
  }
  // 5. Lernhinweise des Codes
  for (const h of e.lernhinweise ?? []) roh.push({ id: `lernhinweis:${slug(h)}`, bereich: bereichAusText(h), titel: kurz(h.split(' → ')[0], 160), beleg: kurz(h, 300), rang: 25, herkunft: 'lernhinweis' });
  // 6. Quellen: ausgefallen oder lange ohne Signal
  const ohneSignaleSeit: Record<string, string> = {};
  for (const q of e.quellen ?? []) {
    if (/Schlüssel .* fehlt/.test(q.letzterFehler ?? '') && !q.zuletztOk) {
      roh.push({ id: `quelle:${q.id}:schluessel`, bereich: 'quellen', titel: `Quelle ${q.name} wartet auf einen Schlüssel`, beleg: kurz(q.letzterFehler!, 200), rang: 8, herkunft: 'quelle' });
      continue;
    }
    const stunden = q.zuletztOk ? (e.jetzt.getTime() - Date.parse(q.zuletztOk)) / 3600000 : Infinity;
    if (stunden > l.buch.quelleAusgefallenStunden) {
      roh.push({ id: `quelle:${q.id}:ausfall`, bereich: 'quellen', titel: `Quelle ${q.name} liefert nicht mehr`, beleg: kurz(`Zuletzt in Ordnung: ${q.zuletztOk?.slice(0, 10) ?? 'nie'}. Letzter Fehler: ${q.letzterFehler ?? 'unbekannt'}`, 300), rang: 45, herkunft: 'quelle' });
      continue;
    }
    if (q.signale === 0) {
      const seit = e.ohneSignaleSeit?.[q.id] ?? e.heute;
      ohneSignaleSeit[q.id] = seit;
      const tage = tageSeit(seit, e.heute);
      if (tage >= l.buch.quelleOhneSignaleTage) roh.push({ id: `quelle:${q.id}:ohne-signale`, bereich: 'quellen', titel: `Quelle ${q.name} liefert seit ${tage} Tagen kein Signal`, beleg: `Seit ${seit} bei jedem Tagesabgleich 0 Signale (liefert sie nur Makro-Zeilen, ist das in Ordnung).`, rang: 12, herkunft: 'quelle' });
    }
  }
  // 7. Ideen für neue Quellen
  for (const i of l.quellenIdeen ?? []) roh.push({ id: `idee:${slug(i.name)}`, bereich: 'quellen', titel: `Neue Quelle prüfen: ${i.name}`, beleg: kurz(i.notiz, 300), rang: 10, herkunft: 'quellenidee' });

  // Erledigtes ausblenden: von einer Bau-Sitzung abgehakt oder vor Kurzem vom Verbesserungslauf umgesetzt
  const gesperrt = new Set(e.erledigt ?? []);
  for (const u of uebernahmen) if (tageSeit(u.zeit, e.heute) < l.buch.sperreNachUmsetzungTage) for (const a of u.aenderungen) if (a.kandidat) gesperrt.add(a.kandidat);
  const seit = new Map((e.vorher ?? []).map((k) => [k.id, k.seit]));
  const gesehen = new Set<string>();
  const kandidaten = roh
    .filter((k) => !gesperrt.has(k.id) && !gesehen.has(k.id) && gesehen.add(k.id))
    .map((k) => ({ ...k, seit: seit.get(k.id) ?? e.heute }))
    .sort((a, b) => b.rang - a.rang || a.seit.localeCompare(b.seit))
    .slice(0, l.buch.maxKandidaten);
  return { kandidaten, ohneSignaleSeit };
}
