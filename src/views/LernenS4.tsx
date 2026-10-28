// Bereich „Lernen“ – S4: Was klappt in welcher Marktphase, und die monatlichen Tiefenprüfungen von Claude.
import { useState } from 'preact/hooks';
import { prozent } from '../../core/geld.ts';
import { phaseText } from '../../core/marktphase.ts';
import type { Statistik } from '../../core/statistik.ts';
import { ladeText, useDaten } from '../lib/daten';
import { Karte } from '../ui';

const p = (x: number | null | undefined) => (x === null || x === undefined ? '–' : prozent(x));
const name = (k: string) => (k === 'unbekannt' ? 'vor der ersten Messung' : phaseText(k));

export function PhasenKarte({ s }: { s: Statistik }) {
  const sb = Object.entries(s.kandidaten.nachPhase ?? {});
  const or = Object.entries(s.nachPhase ?? {});
  return (
    <Karte titel="Was klappt in welcher Marktphase?">
      {sb.length ? (
        <table class="tabelle" data-testid="phasen-tabelle">
          <thead>
            <tr>
              <th>Phase</th>
              <th>Signale</th>
              <th>1 Tag im Plus</th>
              <th>Ø 1 Woche</th>
            </tr>
          </thead>
          <tbody>
            {sb.map(([k, v]) => (
              <tr key={k}>
                <td>{name(k)}</td>
                <td>{v.anzahl}</td>
                <td>{p(v.quote1T)}</td>
                <td>{p(v.oe1W)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p class="leer">Die Marktphase wird seit S4 täglich gemessen – die Tabelle füllt sich mit den nächsten Tagen.</p>
      )}
      {or.length > 0 && (
        <p class="klein">
          Depot-Orders: {or.map(([k, v]) => `${name(k)} ${v.anzahl} Orders, Quote ${p(v.quote)}, Ø ${p(v.oeNetto)}`).join(' · ')}
        </p>
      )}
    </Karte>
  );
}

export function MonatspruefungKarte() {
  const idx = useDaten<{ monat: string; vorschlaege: number }[]>('lernen/monatspruefung/index.json');
  const [offen, setOffen] = useState<{ monat: string; text: string } | null>(null);
  const zeige = async (monat: string) => setOffen({ monat, text: await ladeText(`lernen/monatspruefung/${monat}.md`).catch(() => 'Nicht gefunden.') });
  return (
    <Karte titel="🔬 Monatsprüfung durch Claude">
      {idx.status === 'ok' && idx.daten.length ? (
        <ul class="liste">
          {idx.daten.map((m) => (
            <li key={m.monat}>
              <button type="button" class="knopf zweitrangig" onClick={() => zeige(m.monat)}>
                {m.monat} · {m.vorschlaege} Vorschläge
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p class="leer">Am ersten Samstag im Monat prüft Claude im Wochenrückblick alle Zahlen gründlich und macht Vorschläge.</p>
      )}
      {offen && <div class="bericht">{offen.text}</div>}
    </Karte>
  );
}
