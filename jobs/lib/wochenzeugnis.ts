// Wochenzeugnis im Samstagslauf des Sammlers: Daten der Woche (Mo–Fr) sammeln, Note vergeben, speichern, Push.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ordersAusEreignissen } from '../../core/ableiten.ts';
import { tradesAusEreignissen, type DtEreignis } from '../../core/daytrading/kern.ts';
import { berlin } from '../../core/kalender.ts';
import type { PushNachricht } from '../../core/push.ts';
import type { TrackingEintrag } from '../../core/statistik.ts';
import { wochenzeugnis, type Wochenzeugnis } from '../../core/wochenzeugnis.ts';
import { DATEN_DIR, ladeConfig, leseEreignisse, leseJson, schreibeJson } from './dateien.ts';

const tag = (d: string, plus: number) => new Date(Date.parse(`${d}T12:00:00Z`) + plus * 86400000).toISOString().slice(0, 10);

/** Montag–Freitag der Woche, zu der `datum` gehört (Samstag → die gerade beendete Woche). */
export function arbeitswoche(datum: string): { von: string; bis: string } {
  const wt = (new Date(`${datum}T12:00:00Z`).getUTCDay() + 6) % 7; // 0 = Montag
  const von = tag(datum, -wt);
  return { von, bis: tag(von, 4) };
}

export function wochenzeugnisErstellen(jetzt: Date): { zeugnis: Wochenzeugnis; push: PushNachricht } | null {
  const { von, bis } = arbeitswoche(berlin(jetzt).datum);
  if (existsSync(join(DATEN_DIR, `wochen/zeugnis-${bis}.json`))) return null;
  const inWoche = (d: string) => d >= von && d <= bis;
  const zu = ordersAusEreignissen(leseEreignisse()).filter((o) => o.status === 'geschlossen' && o.verkauf && inWoche(berlin(new Date(o.verkauf.zeit)).datum));
  const pfad = join(DATEN_DIR, 'daytrading/ereignisse.jsonl');
  const dtEv = existsSync(pfad) ? readFileSync(pfad, 'utf8').split('\n').filter((z) => z.trim()).map((z) => JSON.parse(z) as DtEreignis) : [];
  const dt = tradesAusEreignissen(dtEv).filter((t) => t.ergebnis && inWoche(t.datum));
  const tracking = leseJson<TrackingEintrag[]>('kandidaten-tracking.json', []).filter((t) => inWoche(t.datum) && typeof t.r1T === 'number');
  const quote = (l: TrackingEintrag[]) => (l.length ? Math.round((l.filter((t) => t.r1T! > 0).length / l.length) * 1000) / 10 : 0);
  const prog = tracking.filter((t) => t.art === 'prognose');
  const sb = tracking.filter((t) => t.art !== 'prognose');
  const zeugnis = wochenzeugnis(
    {
      depot: {
        anzahl: zu.length,
        netto: zu.reduce((a, o) => a + o.ergebnis!.netto, 0),
        etfNetto: zu.reduce((a, o) => a + (o.etfVergleich?.netto ?? 0), 0),
        treffer: zu.filter((o) => o.ergebnis!.netto > 0).length,
        konfidenzSchnitt: zu.length ? zu.reduce((a, o) => a + o.plan.konfidenz, 0) / zu.length : 0,
      },
      daytrading: { anzahl: dt.length, netto: dt.reduce((a, t) => a + t.ergebnis!.netto, 0), treffer: dt.filter((t) => t.ergebnis!.netto > 0).length },
      prognose: { n: prog.length, quote: quote(prog) },
      schattenbuch: { n: sb.length, quote: quote(sb) },
    },
    von,
    bis,
    ladeConfig().einstellungen.orderBetrag,
  );
  schreibeJson(`wochen/zeugnis-${bis}.json`, zeugnis);
  schreibeJson('wochen/zeugnis-letztes.json', zeugnis);
  return {
    zeugnis,
    push: {
      typ: 'wochenrueckblick',
      titel: `📝 Wochenzeugnis KW ${zeugnis.kw}: ${zeugnis.notenText}`,
      text: zeugnis.faecher.length ? zeugnis.faecher.map((f) => `${f.fach} ${f.note}`).join(' · ') : 'Diese Woche gab es zu wenig Abschlüsse für eine Note.',
      ziel: '#/heute',
      tag: `zeugnis-${bis}`,
      erstellt: jetzt.toISOString(),
    },
  };
}
