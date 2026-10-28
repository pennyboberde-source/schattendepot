// Bereich „Daytrading“ (Plan Datenkrake S3): eigener Bereich, nie mit dem Depot vermischt.
// Smartbroker+ als Hauptmodell, Vergleich Trade Republic, immer auch vor Gebühren.
import { euro, prozent } from '../../core/geld.ts';
import type { SignalBeweis } from '../../core/autopilot.ts';
import { tradeBeschreibung, type DtGruppe, type DtUebersicht, type DtVariante } from '../../core/daytrading/auswertung.ts';
import type { DtTrade } from '../../core/daytrading/kern.ts';
import { useDaten } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Betrag, Geladen, Karte } from '../ui';

type Daten = DtUebersicht & { beobachtet?: Record<string, number>; hinweise?: string[]; varianten?: Record<string, { beste: DtVariante | null; basis: DtVariante | null }> };

const HERKUNFT: Record<string, string> = { code_scan: '🔎 Code-Scan', claude: '🧠 Claude', autopilot: '🤖 Autopilot' };
const MARKT: Record<string, string> = { us: 'USA', eu: 'Europa', krypto: 'Krypto' };
const SETUP: Record<string, string> = { orb_long: 'Spanne ▲', orb_short: 'Spanne ▼', level_long: 'Level ▲', level_short: 'Level ▼', signal_long: 'Signal ▲' };
const GRUND: Record<string, string> = { ziel: 'Ziel', stop: 'Stop', schluss: 'Schluss', knockout: 'Knock-out' };
const INSTR: Record<string, string> = { aktie: 'Aktie', turbo: 'Turbo', krypto: 'Krypto' };
const RISIKO: Record<string, string> = { skill_filter: 'im Skill-Filter', spekulativ: 'spekulativ (Penny/Small Cap)' };

export function DaytradingView() {
  const u = useDaten<Daten>('daytrading/uebersicht.json');
  const ap = useDaten<{ horizont: string; beweise: SignalBeweis[] }>('daytrading/autopilot.json');
  return (
    <div class="seite">
      <h1>Daytrading</h1>
      <p class="untertitel">Innerhalb eines Tages, 1.000 € je Trade · Smartbroker+ (Vergleich Trade Republic) · eigener Bereich</p>
      <Geladen z={u} leer="Noch keine Daytrades – der erste Handelstag füllt diesen Bereich." kinder={(d) => <Inhalt d={d} />} />
      {ap.status === 'ok' && <AutopilotKarte b={ap.daten.beweise} />}
    </div>
  );
}

function Inhalt({ d }: { d: Daten }) {
  const h = d.heute.gruppe;
  const g = d.gesamt;
  const heute = d.trades.filter((t) => t.datum === d.heute.datum);
  return (
    <>
      <div class="raster-kennzahlen" data-testid="daytrading-kennzahlen">
        <div class="kennzahl">
          <span class="kennzahl-label">Heute ({datumKurz(d.heute.datum)}) nach Gebühren</span>
          <Betrag wert={h.netto} />
          <span class="klein">
            {h.anzahl} Trades · {prozent(h.quote, { vorzeichen: false })} Treffer{d.heute.offen ? ` · ${d.heute.offen} offen` : ''}
          </span>
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Gesamt nach Gebühren (Smartbroker+)</span>
          <Betrag wert={g.netto} />
          <span class="klein">
            {g.anzahl} Trades · Ø {g.oeR.toLocaleString('de-DE')} R
          </span>
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Vor Gebühren</span>
          <Betrag wert={g.brutto} />
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Vergleich Trade Republic</span>
          <Betrag wert={g.nettoTR} />
        </div>
      </div>

      {d.kurve.length > 1 && <DtKurve punkte={d.kurve} />}

      {d.offen.length > 0 && (
        <Karte titel={`Offen (${d.offen.length})`}>
          <TradeListe trades={d.offen} />
        </Karte>
      )}
      <Karte titel={`Heute (${heute.filter((t) => t.ausstieg).length} abgeschlossen)`}>
        {heute.length ? <TradeListe trades={heute.filter((t) => t.ausstieg)} /> : <p class="leer">Heute noch kein Trade.</p>}
        {d.beobachtet && (
          <p class="klein">
            Beobachtet: {Object.entries(d.beobachtet).map(([k, v]) => `${HERKUNFT[k] ?? k} ${v}`).join(' · ')}
          </p>
        )}
      </Karte>

      <Karte titel="Was klappt im Daytrading">
        <p class="klein">„R“ = Vielfaches des geplanten Risikos: −1 R heißt Stop erreicht (geplanter Verlust), +2 R heißt Ziel erreicht (doppelter Gewinn). Ø R über 0 = die Regel verdient.</p>
        <GruppenTabelle titel="Herkunft" daten={d.nachHerkunft} name={(k) => HERKUNFT[k] ?? k} />
        <GruppenTabelle titel="Markt" daten={d.nachMarkt} name={(k) => MARKT[k] ?? k} />
        <GruppenTabelle titel="Setup" daten={d.nachSetup} name={(k) => SETUP[k] ?? k} />
        <GruppenTabelle titel="Instrument" daten={d.nachInstrument} name={(k) => INSTR[k] ?? k} />
        <GruppenTabelle titel="Risiko" daten={d.nachRisiko} name={(k) => RISIKO[k] ?? k} />
        <GruppenTabelle titel="Ausstieg" daten={d.nachAusstieg} name={(k) => GRUND[k] ?? k} />
        <p class="klein" data-testid="dt-spielart">
          Spielart je Setup (ab 30 Trades, vorsichtig bewertet):{' '}
          {Object.entries(d.varianten ?? {}).filter(([, v]) => v.beste).length
            ? Object.entries(d.varianten ?? {})
                .filter(([, v]) => v.beste)
                .map(([k, v]) => `${k}: ${v.beste!.richtung === 'mit' ? 'mit' : 'gegen'} dem Auslöser, ${v.beste!.hebel === 1 ? 'ohne Hebel' : `Turbo Hebel ${v.beste!.hebel}`} (Ø ${v.beste!.oeNetto.toLocaleString('de-DE')} %, n=${v.beste!.faelle})`)
                .join(' · ')
            : 'noch keine – bis dahin gilt die Grundregel (long Aktie, short Turbo Hebel 5).'}
        </p>
      </Karte>

      <Karte titel="Time Machine – hätte der Filter geholfen?">
        {d.zeitmaschine.length ? (
          <table class="tabelle">
            <thead>
              <tr>
                <th>Simulierte Chance „Ziel zuerst“</th>
                <th>Trades</th>
                <th>Treffer</th>
                <th>Ø R</th>
              </tr>
            </thead>
            <tbody>
              {d.zeitmaschine.map((z) => (
                <tr key={z.stufe}>
                  <td>{z.stufe}</td>
                  <td>{z.anzahl}</td>
                  <td>{prozent(z.quote, { vorzeichen: false })}</td>
                  <td>{z.oeR.toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p class="leer">Jeder US-Trade bekommt eine Time-Machine-Chance (60 Tage, 10.000 Wiederholungen). Die Auswertung erscheint mit den ersten Trades.</p>
        )}
      </Karte>

      {(d.trades.length > heute.length + d.offen.length) && (
        <Karte titel="Frühere Trades">
          <TradeListe trades={d.trades.filter((t) => t.datum !== d.heute.datum && t.ausstieg).slice(0, 40)} />
        </Karte>
      )}
    </>
  );
}

function TradeListe({ trades }: { trades: DtTrade[] }) {
  return (
    <ul class="liste" data-testid="daytrade-liste">
      {trades.map((t) => (
        <li key={t.id}>
          <div class="position-kopf">
            <strong>
              {t.richtung === 'short' ? '▼' : '▲'} {t.name}
            </strong>
            {t.ergebnis ? <span class={t.ergebnis.netto >= 0 ? 'plus' : 'minus'}>{euro(t.ergebnis.netto, { vorzeichen: true })}</span> : <span class="klein">offen</span>}
          </div>
          {(() => {
            const b = tradeBeschreibung(t);
            return (
              <>
                <div class="klein">
                  <strong>{b.was}</strong>
                </div>
                <div class="klein">
                  {HERKUNFT[t.herkunft]} · {MARKT[t.markt]} · {SETUP[`${t.setup}_${t.ausloeser.richtung ?? t.richtung}`] ?? t.setup}
                  {t.spekulativ ? ' · spekulativ' : ''}
                </div>
                <div class="klein">{b.einstieg}</div>
                <div class="klein">{b.plan}</div>
                {b.ausstieg && <div class="klein">{b.ausstieg}</div>}
                {t.timeMachine && (
                  <div class="klein">
                    Time Machine: in {prozent(t.timeMachine.zielZuerst, { vorzeichen: false })} der nachgespielten Tage wäre zuerst das Ziel erreicht worden ({t.timeMachine.urteil})
                  </div>
                )}
              </>
            );
          })()}
        </li>
      ))}
    </ul>
  );
}

function GruppenTabelle({ titel, daten, name }: { titel: string; daten: Record<string, DtGruppe>; name: (k: string) => string }) {
  const zeilen = Object.entries(daten);
  if (!zeilen.length) return null;
  return (
    <table class="tabelle">
      <thead>
        <tr>
          <th>{titel}</th>
          <th>Trades · Treffer</th>
          <th>Netto</th>
          <th>Ø R</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([k, v]) => (
          <tr key={k}>
            <td>{name(k)}</td>
            <td>
              {v.anzahl} · {prozent(v.quote, { vorzeichen: false, stellen: 0 })}
            </td>
            <td class={v.netto >= 0 ? 'plus' : 'minus'}>{euro(v.netto, { vorzeichen: true })}</td>
            <td>{v.oeR.toLocaleString('de-DE')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function DtKurve({ punkte }: { punkte: DtUebersicht['kurve'] }) {
  const b = 600;
  const hoehe = 160;
  const r = 8;
  const werte = punkte.flatMap((p) => [p.netto, p.brutto, 0]);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const x = (i: number) => r + (i / (punkte.length - 1)) * (b - 2 * r);
  const y = (v: number) => r + (1 - (v - min) / (max - min || 1)) * (hoehe - 2 * r);
  const linie = (f: (p: (typeof punkte)[0]) => number) => punkte.map((p, i) => `${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(' ');
  const l = punkte[punkte.length - 1];
  return (
    <figure class="kurve">
      <svg viewBox={`0 0 ${b} ${hoehe}`} preserveAspectRatio="none" role="img" aria-label={`Daytrading ${euro(l.netto)}`}>
        <line x1={r} x2={b - r} y1={y(0)} y2={y(0)} class="kurve-null" vector-effect="non-scaling-stroke" />
        <polyline points={linie((p) => p.brutto)} class="kurve-etf" vector-effect="non-scaling-stroke" />
        <polyline points={linie((p) => p.netto)} class="kurve-depot" vector-effect="non-scaling-stroke" />
      </svg>
      <figcaption class="klein">
        <span class="legende depot">Smartbroker+ {euro(l.netto, { vorzeichen: true })}</span>
        <span class="legende etf">vor Gebühren {euro(l.brutto, { vorzeichen: true })}</span>
        <span>Trade Republic {euro(l.nettoTR, { vorzeichen: true })}</span>
      </figcaption>
    </figure>
  );
}

function AutopilotKarte({ b }: { b: SignalBeweis[] }) {
  return (
    <Karte titel="🤖 Autopilot im Daytrading – nach 1 Stunde bewiesen?">
      {b.length ? (
        <p class="klein">
          {b.slice(0, 8).map((x) => `${x.typ}: ${x.faelle} Fälle, ${prozent(x.chance, { vorzeichen: false })} im Plus, Ø ${prozent(x.oeNetto)}${x.bewiesen ? ' ✅' : ''}`).join(' · ')}
        </p>
      ) : (
        <p class="leer">Noch keine schnellen Signale mit 1-Stunden-Messung im Schattenbuch.</p>
      )}
    </Karte>
  );
}
