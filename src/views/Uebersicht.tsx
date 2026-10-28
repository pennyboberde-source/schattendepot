import { euro, prozent } from '../../core/geld.ts';
import type { Order } from '../../core/typen.ts';
import { useDaten, type Kennzahlen, type Positionen, type Systemstatus } from '../lib/daten';
import { countdown, datumKurz, relativ } from '../lib/zeit';
import { useEinstellung } from '../lib/lokal';
import { Betrag, Fortschritt, Geladen, Karte, Leer } from '../ui';
import { Kurve } from './Kurve';

export function UebersichtView() {
  const kennzahlen = useDaten<Kennzahlen>('kennzahlen.json');
  const positionen = useDaten<Positionen>('positionen.json');
  const system = useDaten<Systemstatus>('system.json');
  const [nachSteuern] = useEinstellung('nachSteuern', false);

  return (
    <div class="seite">
      <h1>Depot</h1>
      {system.status === 'ok' && system.daten.pushAbgelaufen && (
        <a class="banner warnung" href="#/einstellungen">Push-Anmeldung abgelaufen – bitte „Push neu verbinden“.</a>
      )}
      <Geladen
        z={kennzahlen}
        leer="Noch keine Ergebnisse – die erste Order kommt mit dem ersten Morgenlauf."
        kinder={(k) => (
          <div class="raster-kennzahlen">
            <div class="kennzahl">
              <span class="kennzahl-label">Schattendepot {nachSteuern ? 'nach Steuern' : 'nach Gebühren (Smartbroker+)'}</span>
              <Betrag wert={nachSteuern ? k.nachSteuern : k.netto} />
            </div>
            <div class="kennzahl">
              <span class="kennzahl-label">Gleiche Orders im MSCI World</span>
              <Betrag wert={k.etfNetto} />
            </div>
            <div class="kennzahl">
              <span class="kennzahl-label">Schattendepot vs. ETF</span>
              <Betrag wert={(nachSteuern ? k.nachSteuern : k.netto) - k.etfNetto} />
            </div>
            <div class="kennzahl">
              <span class="kennzahl-label">Offene Positionen (unrealisiert, nach Gebühren)</span>
              <Betrag wert={k.unrealisiert ?? 0} />
            </div>
            <div class="kennzahl">
              <span class="kennzahl-label">Trefferquote</span>
              <strong>{k.trefferquote === null ? '–' : prozent(k.trefferquote, { vorzeichen: false, stellen: 0 })}</strong>
              <span class="klein">{k.anzahlGeschlossen} abgeschlossen · {k.anzahlOffen} offen</span>
            </div>
            {k.kurve.length > 1 && (
              <div class="kennzahl breit">
                <span class="kennzahl-label">Verlauf: Schattendepot vs. ETF</span>
                <Kurve punkte={k.kurve} />
              </div>
            )}
          </div>
        )}
      />

      <Geladen
        z={positionen}
        leer="Noch keine Positionen."
        kinder={(p) => (
          <>
            <Karte titel={`Offene Positionen (${p.offen.length})`}>
              {p.offen.length === 0 ? <Leer>Keine offenen Positionen.</Leer> : <div class="raster-positionen">{p.offen.map((o) => <PositionKarte key={o.id} o={o} />)}</div>}
            </Karte>
            {p.vorgemerkt.length > 0 && (
              <Karte titel="Vorgemerkt – wird beim nächsten Kurscheck ausgeführt">
                <ul class="liste">
                  {p.vorgemerkt.map((o) => (
                    <li key={o.id}>
                      <a href={`#/order/${o.id}`}>
                        <strong>{o.plan.wertpapier.name}</strong> · Chance ~{o.plan.konfidenz} % · Ziel {prozent(o.plan.zielNettoProzent)} netto
                      </a>
                    </li>
                  ))}
                </ul>
              </Karte>
            )}
          </>
        )}
      />
      {system.status === 'ok' && system.daten.letzterWaechterLauf && (
        <p class="klein mittig">Letzter Kurscheck {relativ(system.daten.letzterWaechterLauf)}</p>
      )}
    </div>
  );
}

function PositionKarte({ o }: { o: Order }) {
  const kurs = o.letzterKurs?.wert ?? o.kauf?.kurs ?? 0;
  const ziel = o.zielkurs ?? kurs;
  const stop = o.stopkurs ?? kurs;
  const anteil = ziel > stop ? ((kurs - stop) / (ziel - stop)) * 100 : 50;
  const veraenderung = o.kauf ? (kurs / o.kauf.kurs - 1) * 100 : 0;
  return (
    <a class="position" href={`#/order/${o.id}`}>
      <div class="position-kopf">
        <strong>
          {o.plan.herkunft === 'autopilot' ? '🤖 ' : ''}
          {o.plan.wertpapier.name}
        </strong>
        <span class={veraenderung >= 0 ? 'plus' : 'minus'}>{prozent(veraenderung)}</span>
      </div>
      <div class="klein">
        {o.kauf?.stueck.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Stk. · Kauf {o.kauf ? euro(o.kauf.kurs) : '–'} · Chance ~{o.plan.konfidenz} %{o.plan.pflichtOrder ? ' · Pflicht-Order' : ''}
        {o.teilverkaeufe?.length ? ' · Hälfte verkauft' : ''}
      </div>
      <Fortschritt wert={anteil} label="Position zwischen Stop und Ziel" />
      <div class="position-skala klein">
        <span>Stop {euro(stop)}</span>
        <span>Ziel {euro(ziel)}</span>
      </div>
      <div class="position-fuss klein">
        <span>
          Kurs {euro(kurs)}
          {o.letzterKurs && (
            <>
              {' '}· {relativ(o.letzterKurs.zeit)}
              {o.letzterKurs.verzoegertMin ? ` · verzögert ${o.letzterKurs.verzoegertMin} Min.` : ''}
              {o.letzterKurs.synthetisch ? ' · berechnet' : ''}
            </>
          )}
        </span>
        <span>Verkauf {datumKurz(o.verkaufstermin)} ({countdown(o.verkaufstermin)})</span>
      </div>
    </a>
  );
}
