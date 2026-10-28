// Bereich „Lernen“ – Jederzeit handeln (S2): Autopilot (bewiesene Signale), Claude vs. Autopilot,
// Claudes Tagesprognose, Gegenprüfung und Ziel/Stop-Vorschläge aus dem Schattenbuch.
import signalCfg from '../../config/signale.json';
import { prozent } from '../../core/geld.ts';
import type { Statistik } from '../../core/statistik.ts';
import { Karte } from '../ui';

const TYP_NAME = Object.fromEntries(Object.entries(signalCfg.typen).map(([k, v]) => [k, v.name])) as Record<string, string>;
const p = (x: number | null | undefined) => (x === null || x === undefined ? '–' : prozent(x));

export function JederzeitKarten({ s }: { s: Statistik }) {
  const ap = s.autopilot ?? [];
  const zs = s.zielStop ?? [];
  const h = s.nachHerkunft ?? {};
  const gp = s.gegenpruefung;
  const pr = s.prognose;
  return (
    <>
      <Karte titel="🤖 Autopilot – bewiesene Signale">
        <p class="klein">
          Der Code kauft zwischen Claudes Läufen selbst, aber nur Signaltypen, die sich im Schattenbuch bewiesen haben: genug Fälle, Chance nach Gebühren ≥ 40 % und im Schnitt Gewinn nach Gebühren.
        </p>
        {ap.length ? (
          <table class="tabelle" data-testid="autopilot-tabelle">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Markt</th>
                <th>Fälle</th>
                <th>Chance</th>
                <th>Ø nach Gebühren</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {ap.slice(0, 12).map((b) => (
                <tr key={`${b.typ}-${b.gruppe}`}>
                  <td>{TYP_NAME[b.typ] ?? b.typ}</td>
                  <td>{b.gruppe === 'krypto' ? 'Krypto' : 'Aktie'}</td>
                  <td>{b.faelle}</td>
                  <td>{p(b.chance)}</td>
                  <td class={b.oeNetto >= 0 ? 'plus' : 'minus'}>{p(b.oeNetto)}</td>
                  <td>{b.bewiesen ? '✅ kauft' : '⏳ noch nicht'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="leer">Noch keine gemessenen Fälle – das Schattenbuch füllt sich mit jedem Handelstag.</p>
        )}
        {(h.autopilot || h.claude) && (
          <p class="klein">
            Abgeschlossen: Claude {h.claude?.anzahl ?? 0} Orders (Quote {p(h.claude?.quote)}, Ø {p(h.claude?.oeNetto)}) · Autopilot {h.autopilot?.anzahl ?? 0} Orders (Quote {p(h.autopilot?.quote)}, Ø{' '}
            {p(h.autopilot?.oeNetto)})
          </p>
        )}
      </Karte>
      <div class="zwei-spalten">
        <Karte titel="Claudes Tagesprognose">
          {pr && (pr.n1T ?? 0) > 0 ? (
            <p>
              <strong>{p(pr.quote1T)}</strong> der Richtungen richtig nach 1 Tag ({pr.n1T} gemessen, Ø {p(pr.oe1T)} gerichtet)
            </p>
          ) : (
            <p class="leer">Morgens 10 Werte mit Richtung, ohne Geld – erste Messung am Tag danach.</p>
          )}
        </Karte>
        <Karte titel="Gegenprüfung">
          {gp ? (
            <p class="klein">
              Starker Einwand (≥ 40 %): {gp.stark.anzahl} Orders, Quote {p(gp.stark.quote)} · schwacher Einwand: {gp.schwach.anzahl} Orders, Quote {p(gp.schwach.quote)}. Einwand eingetreten bei {gp.einwandEingetreten} von{' '}
              {gp.verlusteMitUrteil} Verlusten.
            </p>
          ) : (
            <p class="leer">Claude nennt vor jedem Kauf, woran es scheitern könnte – gemessen, sobald Orders abgeschlossen sind.</p>
          )}
        </Karte>
      </div>
      <Karte titel="Ziel/Stop je Signal – selbst optimiert">
        {zs.length ? (
          <table class="tabelle">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Ziel netto</th>
                <th>Stop</th>
                <th>Ø mit Regel</th>
                <th>Ø ohne</th>
                <th>Fälle</th>
              </tr>
            </thead>
            <tbody>
              {zs.slice(0, 10).map((z) => (
                <tr key={z.typ}>
                  <td>{TYP_NAME[z.typ] ?? z.typ}</td>
                  <td>{p(z.zielNettoProzent)}</td>
                  <td>{p(z.stopProzent)}</td>
                  <td class={z.oeNetto >= 0 ? 'plus' : 'minus'}>{p(z.oeNetto)}</td>
                  <td>{p(z.ohneRegelOeNetto)}</td>
                  <td>{z.faelle}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="leer">Braucht je Signal mindestens 10 Fälle mit 5-Tage-Messung.</p>
        )}
      </Karte>
    </>
  );
}
