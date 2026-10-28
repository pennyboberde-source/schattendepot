// Bereich „Lernen“ – S4: Was klappt in welcher Marktphase, und die monatlichen Tiefenprüfungen von Claude.
import { useState } from 'preact/hooks';
import { prozent } from '../../core/geld.ts';
import { phaseText } from '../../core/marktphase.ts';
import type { Statistik } from '../../core/statistik.ts';
import { varianteText } from '../../core/varianten.ts';
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

/** Varianten-Schattenbuch: welche Spielart (Richtung, Hebel, Haltedauer) je Signal am besten gewesen wäre. */
export function SpielartKarte({ s }: { s: Statistik }) {
  const v = (s.varianten ?? []).filter((x) => x.beste).slice(0, 12);
  const vt = (s.varianten ?? []).filter((x) => x.volltreffer && x.volltreffer.faelle >= 10).sort((a, b) => b.volltreffer!.anteil - a.volltreffer!.anteil).slice(0, 6);
  return (
    <Karte titel="Beste Spielart je Signal – Hebel, Richtung, Haltedauer">
      <p class="klein">Für jedes Signal rechnet die Datenkrake nach, was mit oder gegen das Signal, ohne Hebel oder als Turbo (Hebel 2–20) und bei 1, 3, 5 oder 10 Handelstagen Haltedauer herausgekommen wäre – vorsichtig bewertet, damit kein Zufallstreffer gewinnt. Der Autopilot handelt die beste Spielart.</p>
      {v.length ? (
        <ul class="liste" data-testid="spielart-liste">
          {v.map((x) => (
            <li key={`${x.typ}-${x.gruppe}`}>
              <strong>{x.typ}</strong> <span class="klein">({x.gruppe === 'krypto' ? 'Krypto' : 'Aktien'})</span>: {varianteText(x.beste!)}
              {x.basis ? <span class="klein"> · einfach kaufen: Ø {prozent(x.basis.oeNetto)}</span> : null}
              {x.volltreffer ? <span class="klein"> · Volltreffer (≥ {x.volltreffer.schwelle} % in 2 Wochen): {prozent(x.volltreffer.anteil, { vorzeichen: false })}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p class="leer">Noch kein Signal mit genug Fällen (ab 25) und klarem Vorteil – füllt sich in den nächsten Wochen.</p>
      )}
      {vt.length > 0 && (
        <p class="klein" data-testid="volltreffer">
          Volltreffer-Quote (Wert lief binnen 2 Wochen ≥ 15 % in Signalrichtung – Kandidaten für Hebel): {vt.map((x) => `${x.typ} ${prozent(x.volltreffer!.anteil, { vorzeichen: false })} (n=${x.volltreffer!.faelle})`).join(' · ')}
        </p>
      )}
    </Karte>
  );
}
