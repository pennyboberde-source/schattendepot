// „Was sich verbessert hat“ – verdichtete Sicht auf das Verbesserungs-Protokoll für App, Wochenzeugnis und Kontext.
import type { Kandidat, Leitplanken, Manifest, ProtokollEintrag } from './typen.ts';

export interface VerbesserungUebersicht {
  stand: string;
  aktiv: boolean;
  /** GitHub-Seite des Rückgängig-Workflows (iPad: „Run workflow“ antippen) */
  rueckgaengigLink: string;
  uebernahmen: {
    datum: string;
    zeit: string;
    merge: string;
    zusammenfassung: string;
    status: 'aktiv' | 'zurückgenommen';
    grund?: string;
    aenderungen: { id: string; titel: string; bereich: string; hypothese: string; messkriterium: string; urteil?: string; bewertung?: string }[];
  }[];
  abgelehnt: { zeit: string; branch: string; gruende: string[]; link?: string }[];
  /** offene Bitten an den Nutzer aus den Übernahmen der letzten Wochen (z. B. Gratis-Schlüssel) */
  freigaben: NonNullable<Manifest['freigaben']>;
  kandidaten: Kandidat[];
}

export function uebersichtBauen(protokoll: ProtokollEintrag[], kandidaten: Kandidat[], l: Pick<Leitplanken, 'aktiv'>, jetzt: string, repo: string): VerbesserungUebersicht {
  const zurueck = new Map(protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'zurueckgenommen' }> => p.typ === 'zurueckgenommen').map((p) => [p.merge, p]));
  const bewertet = new Map(protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'bewertet' }> => p.typ === 'bewertet').map((p) => [`${p.merge}|${p.aenderung}`, p]));
  const uebernommen = protokoll.filter((p): p is Extract<ProtokollEintrag, { typ: 'uebernommen' }> => p.typ === 'uebernommen').sort((a, b) => b.zeit.localeCompare(a.zeit));
  const vor6Wochen = new Date(Date.parse(jetzt) - 42 * 86400000).toISOString();
  return {
    stand: jetzt,
    aktiv: l.aktiv,
    rueckgaengigLink: `https://github.com/${repo}/actions/workflows/verbesserung-zurueck.yml`,
    uebernahmen: uebernommen.slice(0, 12).map((u) => {
      const z = zurueck.get(u.merge);
      return {
        datum: u.datum,
        zeit: u.zeit,
        merge: u.merge,
        zusammenfassung: u.zusammenfassung,
        status: z ? ('zurückgenommen' as const) : ('aktiv' as const),
        ...(z ? { grund: z.grund } : {}),
        aenderungen: u.aenderungen.map((a) => {
          const b = bewertet.get(`${u.merge}|${a.id}`);
          return { id: a.id, titel: a.titel, bereich: a.bereich, hypothese: a.hypothese, messkriterium: a.messkriterium.text, ...(b ? { urteil: b.urteil, bewertung: b.text } : {}) };
        }),
      };
    }),
    abgelehnt: protokoll
      .filter((p): p is Extract<ProtokollEintrag, { typ: 'abgelehnt' }> => p.typ === 'abgelehnt')
      .sort((a, b) => b.zeit.localeCompare(a.zeit))
      .slice(0, 5)
      .map((p) => ({ zeit: p.zeit, branch: p.branch, gruende: p.gruende.slice(0, 8), ...(p.link ? { link: p.link } : {}) })),
    freigaben: uebernommen.filter((u) => u.zeit >= vor6Wochen && !zurueck.has(u.merge)).flatMap((u) => u.freigaben ?? []),
    kandidaten: kandidaten.slice(0, 8),
  };
}

/** Kurze Zeilen für Wochenzeugnis und Kontext: was in einem Zeitraum übernommen wurde. */
export function verbesserungenImZeitraum(protokoll: ProtokollEintrag[], von: string, bis: string): string[] {
  const zurueck = new Set(protokoll.filter((p) => p.typ === 'zurueckgenommen').map((p) => p.merge));
  return protokoll
    .filter((p): p is Extract<ProtokollEintrag, { typ: 'uebernommen' }> => p.typ === 'uebernommen' && p.zeit.slice(0, 10) >= von && p.zeit.slice(0, 10) <= bis)
    .flatMap((u) => u.aenderungen.map((a) => `${a.titel}${zurueck.has(u.merge) ? ' (zurückgenommen)' : ''}`));
}
