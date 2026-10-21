import { useEffect, useState } from 'preact/hooks';
import signalCfg from '../../config/signale.json';
import { prozent } from '../../core/geld.ts';
import type { Gruppe, Statistik, TrackingGruppe } from '../../core/statistik.ts';
import { ladeText, useDaten } from '../lib/daten';
import { STRATEGIE_TEXT } from '../lib/texte';
import { datumKurz } from '../lib/zeit';
import { Geladen, Karte, Leer } from '../ui';

const TYP_NAME = Object.fromEntries(Object.entries(signalCfg.typen).map(([k, v]) => [k, v.name])) as Record<string, string>;
const p = (x: number | null) => (x === null ? '–' : prozent(x));

interface Gewichte {
  signale?: Record<string, number>;
  quellen?: Record<string, number>;
}
interface Aenderung {
  datum: string;
  art: string;
  name: string;
  alt: number;
  neu: number;
  grund: string;
}

export function LernenView() {
  const statistik = useDaten<Statistik>('statistik.json');
  const gewichte = useDaten<Gewichte>('gewichte.json');
  const aenderungen = useDaten<Aenderung[]>('lernen/gewichtsaenderungen.json');
  const [lektionen, setLektionen] = useState<string | null>(null);
  useEffect(() => {
    ladeText('lernen/lektionen.md')
      .then(setLektionen)
      .catch(() => setLektionen(''));
  }, []);
  const gw = gewichte.status === 'ok' ? gewichte.daten : {};

  return (
    <div class="seite">
      <h1>Lernen</h1>
      <Geladen
        z={statistik}
        leer="Noch keine Statistik – sie entsteht mit den ersten abgeschlossenen Orders."
        kinder={(s) => (
          <>
            <div class="raster-kennzahlen">
              <div class="kennzahl">
                <span class="kennzahl-label">Trefferquote (nach Gebühren)</span>
                <strong>{s.gesamt.anzahl ? prozent(s.gesamt.quote, { vorzeichen: false }) : '–'}</strong>
                <span class="klein">{s.gesamt.anzahl} abgeschlossene Orders</span>
              </div>
              <div class="kennzahl">
                <span class="kennzahl-label">Ø Rendite nach Gebühren</span>
                <strong class={s.gesamt.oeNetto >= 0 ? 'plus' : 'minus'}>{s.gesamt.anzahl ? prozent(s.gesamt.oeNetto) : '–'}</strong>
                <span class="klein">erwartet: Ø {prozent(s.erwartetVsTatsaechlich.erwartet)}</span>
              </div>
              <div class="kennzahl">
                <span class="kennzahl-label">Pflicht- vs. Überzeugungs-Orders</span>
                <strong>
                  {s.pflicht.anzahl ? prozent(s.pflicht.quote, { vorzeichen: false, stellen: 0 }) : '–'} / {s.ueberzeugung.anzahl ? prozent(s.ueberzeugung.quote, { vorzeichen: false, stellen: 0 }) : '–'}
                </strong>
                <span class="klein">
                  Trefferquote ({s.pflicht.anzahl} / {s.ueberzeugung.anzahl} Orders)
                </span>
              </div>
            </div>

            <Karte titel="Kalibrierung – hält die Konfidenz, was sie verspricht?">
              {s.kalibrierung.length === 0 ? (
                <Leer>Noch keine Daten.</Leer>
              ) : (
                <div class="kalibrierung">
                  {s.kalibrierung.map((k) => (
                    <div key={k.stufe} class="kal-zeile">
                      <span class="kal-label">
                        {k.stufe} <span class="klein">(n={k.anzahl})</span>
                      </span>
                      <div class="kal-balken" aria-label={`erwartet ${k.erwartet} %, tatsächlich ${k.tatsaechlich} %`}>
                        <div class="kal-ist" style={{ width: `${k.tatsaechlich}%` }} />
                        <div class="kal-soll" style={{ left: `${k.erwartet}%` }} />
                      </div>
                      <span class="klein">
                        {Math.round(k.tatsaechlich)} % statt {Math.round(k.erwartet)} %
                      </span>
                    </div>
                  ))}
                  <p class="klein">Balken = tatsächliche Trefferquote, Strich = versprochene Konfidenz.</p>
                </div>
              )}
            </Karte>

            <div class="zwei-spalten">
              <GruppenTabelle titel="Nach Strategie" daten={s.nachStrategie} name={(k) => STRATEGIE_TEXT[k as keyof typeof STRATEGIE_TEXT] ?? k} />
              <GruppenTabelle titel="Nach Signal-Typ (gekaufte Orders)" daten={s.nachSignalTyp} name={(k) => TYP_NAME[k] ?? k} />
              <GruppenTabelle titel="Nach Quelle" daten={s.nachQuelle} />
              <GruppenTabelle titel="Nach Anlageklasse" daten={s.nachAnlageklasse} />
              <GruppenTabelle titel="Nach Haltedauer" daten={s.nachHaltedauer} />
              <GruppenTabelle titel="Nach Konfidenz" daten={s.nachKonfidenz} />
            </div>

            <Karte titel="Signale und Quellen – auch ohne Kauf mitverfolgt">
              <p class="klein">Gerichtete Rendite der Lagebild-Kandidaten (Long: Kursanstieg, Short: Kursrückgang) – mit aktuellem Gewicht.</p>
              <TrackingTabelle daten={s.kandidaten.nachSignalTyp} gewichte={gw.signale ?? {}} grund={(k) => signalCfg.typen[k as keyof typeof signalCfg.typen]?.gewicht} name={(k) => TYP_NAME[k] ?? k} />
              <h3>Quellen</h3>
              <TrackingTabelle daten={s.kandidaten.nachQuelle} gewichte={gw.quellen ?? {}} grund={() => 1} />
            </Karte>
          </>
        )}
      />

      <Karte titel="Letzte Gewichtsänderungen">
        <Geladen
          z={aenderungen}
          leer="Noch keine – Gewichte werden samstags angepasst, sobald genug Fälle vorliegen."
          kinder={(l) =>
            l.length === 0 ? (
              <Leer>Noch keine Änderungen.</Leer>
            ) : (
              <ul class="liste">
                {l.slice(0, 12).map((a) => (
                  <li key={a.datum + a.name}>
                    <strong>{a.art === 'signal' ? (TYP_NAME[a.name] ?? a.name) : a.name}</strong>: {a.alt.toLocaleString('de-DE')} → {a.neu.toLocaleString('de-DE')}{' '}
                    <span class="klein">
                      ({datumKurz(a.datum)}, {a.grund})
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        />
      </Karte>

      <Karte titel="Lektionen">
        {lektionen ? <pre class="bericht">{lektionen}</pre> : <Leer>Noch keine Lektionen – sie entstehen aus abgeschlossenen Orders.</Leer>}
      </Karte>
    </div>
  );
}

function GruppenTabelle({ titel, daten, name = (k) => k }: { titel: string; daten: Record<string, Gruppe>; name?: (k: string) => string }) {
  const zeilen = Object.entries(daten);
  return (
    <Karte titel={titel}>
      {zeilen.length === 0 ? (
        <Leer>Noch keine Daten.</Leer>
      ) : (
        <table class="tabelle">
          <thead>
            <tr>
              <th></th>
              <th>n</th>
              <th>Treffer</th>
              <th>Ø netto</th>
              <th>Summe</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map(([k, g]) => (
              <tr key={k}>
                <td>{name(k)}</td>
                <td>{g.anzahl}</td>
                <td>{prozent(g.quote, { vorzeichen: false, stellen: 0 })}</td>
                <td class={g.oeNetto >= 0 ? 'plus' : 'minus'}>{prozent(g.oeNetto)}</td>
                <td class={g.summeNetto >= 0 ? 'plus' : 'minus'}>{g.summeNetto.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Karte>
  );
}

function TrackingTabelle({ daten, gewichte, grund, name = (k) => k }: { daten: Record<string, TrackingGruppe>; gewichte: Record<string, number>; grund: (k: string) => number | undefined; name?: (k: string) => string }) {
  const zeilen = Object.entries(daten).sort((a, b) => (b[1].oe1W ?? -99) - (a[1].oe1W ?? -99));
  if (zeilen.length === 0) return <Leer>Noch keine mitverfolgten Kandidaten.</Leer>;
  return (
    <table class="tabelle">
      <thead>
        <tr>
          <th></th>
          <th>n</th>
          <th>1 Tag</th>
          <th>1 Woche</th>
          <th>1 Monat</th>
          <th>Gewicht</th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(([k, t]) => (
          <tr key={k}>
            <td>{name(k)}</td>
            <td>{t.anzahl}</td>
            <td>{p(t.oe1T)}</td>
            <td class={(t.oe1W ?? 0) >= 0 ? 'plus' : 'minus'}>{p(t.oe1W)}</td>
            <td>{p(t.oe1M)}</td>
            <td>{(gewichte[k] ?? grund(k) ?? 1).toLocaleString('de-DE')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
