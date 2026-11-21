/**
 * Der jüngste abgeschlossene US-Handelstag, den der Rückblick zu einem Zeitpunkt erwarten darf (21.11.2026):
 * der letzte Werktag vor dem heutigen UTC-Tag, der kein NYSE-Feiertag ist. (Massive stellt Tag X am Morgen von X+1 bereit.)
 */
export function erwarteterUsTag(jetzt: Date, feiertage: Set<string>): string {
  const t = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate()));
  for (let i = 0; i < 10; i++) {
    t.setUTCDate(t.getUTCDate() - 1);
    const wt = t.getUTCDay();
    const d = t.toISOString().slice(0, 10);
    if (wt !== 0 && wt !== 6 && !feiertage.has(d)) return d;
  }
  return t.toISOString().slice(0, 10);
}
