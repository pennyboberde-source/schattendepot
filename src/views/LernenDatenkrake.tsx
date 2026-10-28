// Bereich „Lernen“ – Datenkrake: Was klappt (Ampel), Hot Stuff, Vorlauf, Reaktionszeit, Pump-Verdacht, Märkte.
import signalCfg from '../../config/signale.json';
import type { HotStuffEintrag, VorlaufStatistik } from '../../core/datenkrake.ts';
import { prozent } from '../../core/geld.ts';
import type { Statistik, TrackingGruppe } from '../../core/statistik.ts';
import type { Ladezustand } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Geladen, Karte, Leer } from '../ui';

const TYP_NAME = Object.fromEntries(Object.entries(signalCfg.typen).map(([k, v]) => [k, v.name])) as Record<string, string>;
const p = (x: number | null | undefined) => (x === null || x === undefined ? '–' : prozent(x));
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

/** Ampel: grün = klappt, rot = verliert, gelb = unklar, grau = zu wenig Fälle (unter 5). */
export function ampel(t: TrackingGruppe): { klasse: string; text: string } {
  const r = t.oe1W ?? t.oe1T;
  if (t.anzahl < 5 || r === null || r === undefined) return { klasse: 'grau', text: 'zu wenig Fälle' };
  if (r > 0.5 && (t.quote1T ?? 50) >= 50) return { klasse: 'gruen', text: 'klappt' };
  if (r < -0.5) return { klasse: 'rot', text: 'verliert' };
  return { klasse: 'gelb', text: 'unklar' };
}

export function DatenkrakeKarten({ s, gewichte, hotstuff, vorlauf }: { s: Statistik; gewichte: Record<string, number>; hotstuff: Ladezustand<HotStuffBericht>; vorlauf: VorlaufStatistik | null }) {
  return (
    <>
      <WasKlappt s={s} gewichte={gewichte} />
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
  const zeilen = Object.entries(s.kandidaten.nachSignalTyp).sort((a, b) => (b[1].oe1W ?? b[1].oe1T ?? -99) - (a[1].oe1W ?? a[1].oe1T ?? -99));
  return (
    <Karte titel="Was klappt – Signale im Schattenbuch">
      <div class="raster-kennzahlen">
        <div class="kennzahl">
          <span class="kennzahl-label">Mitverfolgt</span>
          <strong>{g.anzahl}</strong>
          <span class="klein">Kandidaten und schnelle Signale</span>
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Im Plus nach 1 Tag</span>
          <strong>{g.quote1T == null ? '–' : prozent(g.quote1T, { vorzeichen: false, stellen: 0 })}</strong>
          <span class="klein">
            Ø {p(g.oe1T)} · nach 1 Woche Ø {p(g.oe1W)}
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
              <th>n</th>
              <th>im Plus 1 T</th>
              <th>Ø 1 Tag</th>
              <th>Ø 1 Woche</th>
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
                  <td>{t.anzahl}</td>
                  <td>{t.quote1T == null ? '–' : prozent(t.quote1T, { vorzeichen: false, stellen: 0 })}</td>
                  <td class={(t.oe1T ?? 0) >= 0 ? 'plus' : 'minus'}>{p(t.oe1T)}</td>
                  <td class={(t.oe1W ?? 0) >= 0 ? 'plus' : 'minus'}>{p(t.oe1W)}</td>
                  <td>{(gewichte[k] ?? signalCfg.typen[k as keyof typeof signalCfg.typen]?.gewicht ?? 1).toLocaleString('de-DE')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p class="klein">Gerichtete Rendite (Long: Anstieg, Short: Rückgang), vor Gebühren. Ampel erst ab 5 Fällen – kleine Zahlen sind Zufall.</p>
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
              <th>n</th>
              <th>Ø 1 Std.</th>
              <th>Ø 1 Tag</th>
            </tr>
          </thead>
          <tbody>
            {l.map(([k, t]) => (
              <tr key={k}>
                <td>{TYP_NAME[k] ?? k}</td>
                <td>{t.anzahl}</td>
                <td>{p(t.oe1h)}</td>
                <td>{p(t.oe1T)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p class="klein">Ist die Bewegung nach 1 Stunde schon fast vorbei, ist das Signal mit 15 Minuten Verzögerung kaum handelbar.</p>
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
          <th>n</th>
          <th>Ø 1 Tag</th>
          <th>Ø 1 Woche</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([k, t]) => (
          <tr key={k}>
            <td>{name(k)}</td>
            <td>{t.anzahl}</td>
            <td class={(t.oe1T ?? 0) >= 0 ? 'plus' : 'minus'}>{p(t.oe1T)}</td>
            <td class={(t.oe1W ?? 0) >= 0 ? 'plus' : 'minus'}>{p(t.oe1W)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
