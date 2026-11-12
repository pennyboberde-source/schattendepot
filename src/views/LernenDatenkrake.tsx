// Bereich „Lernen“ – Datenkrake: Was klappt (Ampel), Hot Stuff, Vorlauf, Reaktionszeit, Pump-Verdacht, Märkte.
import signalCfg from '../../config/signale.json';
import type { HotStuffEintrag, VorlaufStatistik } from '../../core/datenkrake.ts';
import { prozent } from '../../core/geld.ts';
import type { Statistik, TrackingGruppe } from '../../core/statistik.ts';
import type { Ladezustand } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Geladen, Karte, Leer } from '../ui';
import { JederzeitKarten } from './LernenS2';
import { MonatspruefungKarte, PhasenKarte, SpielartKarte } from './LernenS4';

const TYP_NAME = Object.fromEntries(Object.entries(signalCfg.typen).map(([k, v]) => [k, v.name])) as Record<string, string>;
const p = (x: number | null | undefined) => (x === null || x === undefined ? '–' : prozent(x));

/**
 * Kennzahl mit ihrer echten Fallzahl: „+1,2 % (12)“. n ist die Zahl der Messungen dieses Messpunkts; derselbe Wert
 * zählt binnen 10 Handelstagen nur einmal (Plan Volltreffer V0, ehrliche Fallzahlen).
 */
export function MitN({ wert, n }: { wert: number | null | undefined; n?: number }) {
  // unter 5 Messungen ist die Zahl keine Aussage → klein und ohne Farbe
  if ((n ?? 0) < 5)
    return (
      <span class="klein">
        {p(wert)} ({n ?? 0})
      </span>
    );
  return (
    <>
      {p(wert)} <span class="klein">({n})</span>
    </>
  );
}

/** Die Zahl, nach der ein Signal beurteilt wird: 1 Woche ab 5 Messungen, sonst 1 Tag ab 5 Messungen, sonst nichts. */
export function urteilsWert(t: TrackingGruppe): number | null {
  if ((t.n1W ?? 0) >= 5 && t.oe1W != null) return t.oe1W;
  if ((t.n1T ?? 0) >= 5 && t.oe1T != null) return t.oe1T;
  return null;
}
const MARKT: Record<string, string> = {
  us: 'USA',
  eu: 'Europa',
  krypto: 'Krypto',
  rohstoff: 'Rohstoffe',
};

export interface HotStuffBericht {
  datum: string;
  anzahl: number;
  abdeckung: number | null;
  mover: HotStuffEintrag[];
}

/** Ampel: grün = klappt, rot = verliert, gelb = unklar, grau = zu wenig Messungen (unter 5 am Messpunkt). */
export function ampel(t: TrackingGruppe): { klasse: string; text: string } {
  const r = urteilsWert(t);
  if (r === null) return { klasse: 'grau', text: 'zu wenig Fälle' };
  if (r > 0.5 && (t.quote1T ?? 50) >= 50) return { klasse: 'gruen', text: 'klappt' };
  if (r < -0.5) return { klasse: 'rot', text: 'verliert' };
  return { klasse: 'gelb', text: 'unklar' };
}

export function DatenkrakeKarten({ s, gewichte, hotstuff, vorlauf }: { s: Statistik; gewichte: Record<string, number>; hotstuff: Ladezustand<HotStuffBericht>; vorlauf: VorlaufStatistik | null }) {
  return (
    <>
      <WasKlappt s={s} gewichte={gewichte} />
      <JederzeitKarten s={s} />
      <SpielartKarte s={s} />
      <PhasenKarte s={s} />
      <MonatspruefungKarte />
      <HotStuffKarte z={hotstuff} vorlauf={vorlauf} />
      <VorlaufKarte s={s} />
      <div class="zwei-spalten">
        <ReaktionKarte s={s} />
        <Karte titel="Pump-Verdacht vs. normal">
          <KleineTabelle daten={s.kandidaten.nachRisiko ?? {}} name={(k) => (k === 'pump_verdacht' ? '⚠ Pump-Verdacht' : 'normal')} />
        </Karte>
        <Karte titel="Nach Markt">
          <KleineTabelle daten={s.kandidaten.nachMarkt ?? {}} name={(k) => MARKT[k] ?? k} />
        </Karte>
      </div>
    </>
  );
}

function WasKlappt({ s, gewichte }: { s: Statistik; gewichte: Record<string, number> }) {
  const g = s.kandidaten.gesamt;
  // Signale ohne genug Messungen stehen unten – ein Ø aus 4 Fällen führt die Liste nicht mehr an
  const zeilen = Object.entries(s.kandidaten.nachSignalTyp).sort((a, b) => (urteilsWert(b[1]) ?? -99) - (urteilsWert(a[1]) ?? -99));
  return (
    <Karte titel="Was klappt – Signale im Schattenbuch">
      <div class="raster-kennzahlen">
        <div class="kennzahl">
          <span class="kennzahl-label">Mitverfolgt</span>
          <strong>{g.anzahl}</strong>
          <span class="klein">Werte (binnen 10 Handelstagen einmal gezählt){g.eintraege ? ` · ${g.eintraege} Einträge` : ''}</span>
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Im Plus nach 1 Tag</span>
          <strong>{g.quote1T == null ? '–' : prozent(g.quote1T, { vorzeichen: false, stellen: 0 })}</strong>
          <span class="klein">
            Ø {p(g.oe1T)} ({g.n1T ?? 0} Messungen) · nach 1 Woche Ø {p(g.oe1W)}, Median {p(g.med1W)} ({g.n1W ?? 0})
          </span>
        </div>
      </div>
      {zeilen.length === 0 ? (
        <Leer>Noch keine mitverfolgten Signale.</Leer>
      ) : (
        <table class="tabelle">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Ampel</th>
              <th>im Plus 1 T</th>
              <th>Ø 1 Tag (n)</th>
              <th>Ø 1 Woche (n)</th>
              <th>Median 1 W</th>
              <th>Gewicht</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(([k, t]) => {
              const a = ampel(t);
              return (
                <tr key={k}>
                  <td>{TYP_NAME[k] ?? k}</td>
                  <td>
                    <span class={`ampel ${a.klasse}`} aria-hidden="true" />
                    <span class="klein">{a.text}</span>
                  </td>
                  <td>{t.quote1T == null ? '–' : prozent(t.quote1T, { vorzeichen: false, stellen: 0 })}</td>
                  <td class={(t.oe1T ?? 0) >= 0 ? 'plus' : 'minus'}>
                    <MitN wert={t.oe1T} n={t.n1T} />
                  </td>
                  <td class={(t.oe1W ?? 0) >= 0 ? 'plus' : 'minus'}>
                    <MitN wert={t.oe1W} n={t.n1W} />
                  </td>
                  <td>{p(t.med1W)}</td>
                  <td>{(gewichte[k] ?? signalCfg.typen[k as keyof typeof signalCfg.typen]?.gewicht ?? 1).toLocaleString('de-DE')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="klein">
        Gerichtete Rendite (Long: Anstieg, Short: Rückgang), vor Gebühren. Die Zahl in Klammern ist n, die Zahl der Messungen an diesem Messpunkt; derselbe Wert zählt binnen 10 Handelstagen nur einmal. Weichen Ø und Median stark ab, trägt ein
        Ausreißer den Durchschnitt. Ampel erst ab 5 Messungen – kleine Zahlen sind Zufall.
      </p>
    </Karte>
  );
}

function HotStuffKarte({ z, vorlauf }: { z: Ladezustand<HotStuffBericht>; vorlauf: VorlaufStatistik | null }) {
  const verlauf = (vorlauf?.verlauf ?? []).filter((v) => v.abdeckung !== null);
  const mittel = (l: typeof verlauf) => (l.length ? Math.round(l.reduce((a, v) => a + (v.abdeckung ?? 0), 0) / l.length) : null);
  const neu = mittel(verlauf.slice(-7));
  const alt = mittel(verlauf.slice(0, -7));
  return (
    <Karte titel="🔥 Hot Stuff – hätte man es erkennen können?">
      {z.status === 'fehler' ? (
        <Leer>Noch kein Rückblick – er entsteht jeden Morgen aus den Kursraketen der Märkte.</Leer>
      ) : (
        <Geladen
          z={z}
          leer="Noch kein Rückblick – er entsteht jeden Morgen aus den Kursraketen der Märkte."
          kinder={(h) => (
            <>
              <p>
                <strong>{h.anzahl}</strong> Kursraketen am {datumKurz(h.datum)} · <strong>{h.abdeckung ?? '–'} %</strong> hatten vorher Signale in unseren Daten.
                {neu !== null && (
                  <span class="klein">
                    {' '}
                    Lernkurve: letzte 7 Tage Ø {neu} %{alt !== null ? ` (davor Ø ${alt} %)` : ''}.
                  </span>
                )}
              </p>
              <ul class="liste">
                {h.mover.slice(0, 12).map((m) => (
                  <li key={m.s}>
                    <strong>{m.n}</strong>
                    {m.t ? ` (${m.t})` : ''} {m.r < 0 ? '↓' : '↑'}{' '}
                    <span class="klein">
                      {m.vorzeichen.length
                        ? `Vorzeichen: ${m.vorzeichen
                            .slice(0, 4)
                            .map((v) => `${TYP_NAME[v.typ] ?? v.typ} (${v.tageVorher} T vorher)`)
                            .join(', ')}`
                        : 'keine Vorzeichen'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        />
      )}
    </Karte>
  );
}

function VorlaufKarte({ s }: { s: Statistik }) {
  const l = s.vorlauf ?? [];
  return (
    <Karte titel="Vorlauf – welche Signale kündigen Kursraketen an?">
      {l.length === 0 ? (
        <Leer>Noch zu wenig Daten – jeder Signal-Tag wird nach 7 Tagen einmal ausgewertet.</Leer>
      ) : (
        <table class="tabelle">
          <thead>
            <tr>
              <th>Signal</th>
              <th>n</th>
              <th>danach Rakete</th>
              <th>Lift</th>
            </tr>
          </thead>
          <tbody>
            {l.slice(0, 15).map((v) => (
              <tr key={v.typ}>
                <td>{TYP_NAME[v.typ] ?? v.typ}</td>
                <td>{v.signale}</td>
                <td>{prozent(v.quote, { vorzeichen: false })}</td>
                <td class={(v.lift ?? 0) >= 1 ? 'plus' : 'minus'}>{v.lift === null ? '–' : `${v.lift.toLocaleString('de-DE')}×`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="klein">Lift über 1 = das Signal kündigt Raketen öfter an als der Zufall.</p>
    </Karte>
  );
}

function ReaktionKarte({ s }: { s: Statistik }) {
  const l = Object.entries(s.kandidaten.nachSignalTyp).filter(([, t]) => t.oe1h != null);
  return (
    <Karte titel="Reaktionszeit – wie schnell bewegt sich der Kurs?">
      {l.length === 0 ? (
        <Leer>Noch keine Messungen – schnelle Signale werden tagsüber nach ~1 Stunde gemessen.</Leer>
      ) : (
        <table class="tabelle">
          <thead>
            <tr>
              <th>Signal</th>
              <th>Ø 1 Std. (n)</th>
              <th>Ø 1 Tag (n)</th>
            </tr>
          </thead>
          <tbody>
            {l.map(([k, t]) => (
              <tr key={k}>
                <td>{TYP_NAME[k] ?? k}</td>
                <td>
                  <MitN wert={t.oe1h} n={t.n1h} />
                </td>
                <td>
                  <MitN wert={t.oe1T} n={t.n1T} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="klein">
        Ist die Bewegung nach 1 Stunde schon fast vorbei, ist das Signal mit 15 Minuten Verzögerung kaum handelbar. Seit 12.11.2026 zählt die 1-Stunden-Messung nur, wenn der Markt des Werts bei Start und Messung offen war – ältere Messungen
        außerhalb der Handelszeit (meist genau 0 %) sind herausgenommen.
      </p>
    </Karte>
  );
}

function KleineTabelle({ daten, name }: { daten: Record<string, TrackingGruppe>; name: (k: string) => string }) {
  const zeilen = Object.entries(daten);
  if (!zeilen.length) return <Leer>Noch keine Daten.</Leer>;
  return (
    <table class="tabelle">
      <thead>
        <tr>
          <th></th>
          <th>Ø 1 Tag (n)</th>
          <th>Ø 1 Woche (n)</th>
          <th>Median 1 W</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([k, t]) => (
          <tr key={k}>
            <td>{name(k)}</td>
            <td class={(t.oe1T ?? 0) >= 0 ? 'plus' : 'minus'}>
              <MitN wert={t.oe1T} n={t.n1T} />
            </td>
            <td class={(t.oe1W ?? 0) >= 0 ? 'plus' : 'minus'}>
              <MitN wert={t.oe1W} n={t.n1W} />
            </td>
            <td>{p(t.med1W)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
