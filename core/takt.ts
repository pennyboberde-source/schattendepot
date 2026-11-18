// Taktgeber (18.11.2026): GitHub lässt Zeitpläne oft stark verzögert oder ganz aus (17./18.11.: Rückblick 05:40 UTC,
// Sammler, Wächter und Takt-Zündung fielen aus). Der Taktgeber kennt die Zeitpläne aller Workflows und stößt einen
// Workflow an, wenn sein letzter fälliger Zeitpunkt länger als die Kulanz zurückliegt und seitdem kein Lauf begonnen hat.
// Reine Funktionen: Cron-Ausdrücke (5 Felder, UTC) mit *, Listen, Bereichen und Schritten.

function feld(ausdruck: string, min: number, max: number): Set<number> {
  const aus = new Set<number>();
  for (const teil of ausdruck.split(',')) {
    const [bereich, schrittText] = teil.split('/');
    const schritt = schrittText ? Number(schrittText) : 1;
    let von = min;
    let bis = max;
    if (bereich !== '*') {
      const [a, b] = bereich.split('-').map(Number);
      von = a;
      bis = b ?? (schrittText ? max : a);
    }
    for (let v = von; v <= bis; v += schritt) aus.add(v === 7 && max === 6 ? 0 : v);
  }
  return aus;
}

export interface Cron {
  minute: Set<number>;
  stunde: Set<number>;
  tag: Set<number>;
  monat: Set<number>;
  wochentag: Set<number>;
  tagFrei: boolean;
  wochentagFrei: boolean;
}

export function cronLesen(text: string): Cron {
  const t = text.trim().split(/\s+/);
  if (t.length !== 5) throw new Error(`Cron mit 5 Feldern erwartet: ${text}`);
  return {
    minute: feld(t[0], 0, 59),
    stunde: feld(t[1], 0, 23),
    tag: feld(t[2], 1, 31),
    monat: feld(t[3], 1, 12),
    wochentag: feld(t[4], 0, 6),
    tagFrei: t[2] === '*',
    wochentagFrei: t[4] === '*',
  };
}

function passt(c: Cron, d: Date): boolean {
  if (!c.minute.has(d.getUTCMinutes()) || !c.stunde.has(d.getUTCHours()) || !c.monat.has(d.getUTCMonth() + 1)) return false;
  const tagOk = c.tag.has(d.getUTCDate());
  const wtOk = c.wochentag.has(d.getUTCDay());
  // wie bei cron: sind beide eingeschränkt, genügt eines
  if (!c.tagFrei && !c.wochentagFrei) return tagOk || wtOk;
  return tagOk && wtOk;
}

/** Letzter fälliger Zeitpunkt ≤ jetzt (auf die Minute), höchstens `maxTage` zurück; null = keiner. */
export function letzterSlot(crons: string[], jetzt: Date, maxTage = 8): Date | null {
  const cs = crons.map(cronLesen);
  const t = new Date(Math.floor(jetzt.getTime() / 60000) * 60000);
  for (let i = 0; i <= maxTage * 1440; i++) {
    const d = new Date(t.getTime() - i * 60000);
    if (cs.some((c) => passt(c, d))) return d;
  }
  return null;
}

export interface TaktWorkflow {
  datei: string;
  crons: string[];
  /** Minuten Kulanz nach dem fälligen Zeitpunkt (GitHub verzögert oft) */
  kulanz: number;
}

/**
 * Anstoßen? Ja, wenn der letzte fällige Zeitpunkt mindestens `kulanz` Minuten her ist und seitdem kein Lauf
 * (gleich welcher Auslöser oder Zustand) begonnen hat. `letzterLauf` = Startzeit des jüngsten Laufs.
 */
export function faellig(w: TaktWorkflow, jetzt: Date, letzterLauf: Date | null): { anstossen: boolean; slot: Date | null } {
  const slot = letzterSlot(w.crons, jetzt);
  if (!slot) return { anstossen: false, slot };
  const alterMin = (jetzt.getTime() - slot.getTime()) / 60000;
  if (alterMin < w.kulanz) return { anstossen: false, slot };
  return { anstossen: !letzterLauf || letzterLauf.getTime() < slot.getTime(), slot };
}
