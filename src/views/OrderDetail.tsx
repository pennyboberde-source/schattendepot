import { euro, prozent } from '../../core/geld.ts';
import { PFLICHTHINWEIS, type Ausfuehrung, type Order } from '../../core/typen.ts';
import { useDaten, type Abgeschlossen, type Positionen } from '../lib/daten';
import { fehlerMeldenUrl, inClaudeBesprechenUrl } from '../lib/links';
import { datumUhr } from '../lib/zeit';
import { STRATEGIE_TEXT, VERKAUFSGRUND_TEXT } from '../lib/texte';
import { Betrag, Icon, Karte, Leer } from '../ui';
import { Verlauf } from './Verlauf';

export function OrderDetailView({ id }: { id: string }) {
  const pos = useDaten<Positionen>('positionen.json');
  const abg = useDaten<Abgeschlossen>('abgeschlossen.json');
  if (pos.status === 'laedt' || abg.status === 'laedt') return <p class="leer">Lädt …</p>;
  const alle = [
    ...(pos.status === 'ok' ? [...pos.daten.offen, ...pos.daten.vorgemerkt] : []),
    ...(abg.status === 'ok' ? abg.daten.orders : []),
  ];
  const o = alle.find((x) => x.id === id);
  if (!o) return <Leer>Order {id} nicht gefunden.</Leer>;
  return <Detail o={o} />;
}

function Detail({ o }: { o: Order }) {
  const p = o.plan;
  const fehlerUrl = fehlerMeldenUrl(`Order ${o.id}`);
  return (
    <div class="seite">
      <a class="zurueck" href="javascript:history.back()">
        <Icon name="zurueck" size={20} /> Zurück
      </a>
      <h1>{p.wertpapier.name}</h1>
      <p class="untertitel">
        {p.wertpapier.isin}
        {p.wertpapier.wkn ? ` · WKN ${p.wertpapier.wkn}` : ''} · {STRATEGIE_TEXT[p.strategie]} · Erfolgschance ~{p.konfidenz} %
        {p.pflichtOrder ? ' · Pflicht-Order' : ''}
      </p>

      {o.ergebnis && (
        <div class="raster-kennzahlen">
          <div class="kennzahl">
            <span class="kennzahl-label">Ergebnis nach Gebühren</span>
            <Betrag wert={o.ergebnis.netto} prozentWert={o.ergebnis.nettoProzent} />
          </div>
          <div class="kennzahl">
            <span class="kennzahl-label">Nach Steuern</span>
            <Betrag wert={o.ergebnis.nachSteuern} />
          </div>
          <div class="kennzahl">
            <span class="kennzahl-label">Erhofft war</span>
            <strong>{prozent(p.erwarteteRenditeNetto)} netto</strong>
          </div>
          {o.etfVergleich && (
            <div class="kennzahl">
              <span class="kennzahl-label">Gleicher Zeitraum im MSCI World</span>
              <Betrag wert={o.etfVergleich.netto} prozentWert={o.etfVergleich.nettoProzent} />
            </div>
          )}
        </div>
      )}

      <Karte titel="These">
        <p>{p.these}</p>
        <p class="klein">Auslöser: {p.ausloeser}</p>
        {p.einflussLektionen && <p class="klein">Einfluss der Lektionen: {p.einflussLektionen}</p>}
        {p.risiken.length > 0 && (
          <>
            <h3>Risiken</h3>
            <ul>{p.risiken.map((r) => <li key={r}>{r}</li>)}</ul>
          </>
        )}
      </Karte>

      <Karte titel="Plan">
        <dl class="werte">
          <dt>Ziel</dt>
          <dd>{o.zielkurs ? euro(o.zielkurs) : `${prozent(p.zielNettoProzent)} netto`}</dd>
          <dt>Stop-Loss</dt>
          <dd>{o.stopkurs ? euro(o.stopkurs) : prozent(p.stopProzent)}</dd>
          <dt>Verkaufstermin</dt>
          <dd>{datumUhr(o.verkaufstermin)}</dd>
          {o.plan.wertpapier.anlageklasse === 'hebel' && o.plan.hebel && (
            <>
              <dt>Hebelprodukt</dt>
              <dd>
                {o.plan.hebel.typ} {o.plan.hebel.richtung} auf {o.plan.hebel.basiswert.name} · {o.plan.hebel.emittent} · KO {euro(o.plan.hebel.koSchwelle)} · BV{' '}
                {o.plan.hebel.bezugsverhaeltnis}
              </dd>
            </>
          )}
        </dl>
      </Karte>

      {(o.kauf || o.verkauf) && (
        <Karte titel="Ausführung und Gebühren">
          <table class="tabelle">
            <thead>
              <tr>
                <th></th>
                <th>Zeit</th>
                <th>Stück</th>
                <th>Kurs</th>
                <th>Kurswert</th>
                <th>Provision</th>
                <th>Handelsplatz</th>
                <th>Betrag</th>
              </tr>
            </thead>
            <tbody>
              {o.kauf && <Zeile name="Kauf (Brief)" a={o.kauf} />}
              {o.verkauf && <Zeile name={`Verkauf (Geld) – ${VERKAUFSGRUND_TEXT[o.verkauf.grund]}`} a={o.verkauf} />}
            </tbody>
          </table>
          {(o.kauf?.synthetisch || o.verkauf?.synthetisch) && <p class="klein">Geld-/Briefkurs berechnet aus letztem Kurs und Spread der Anlageklasse.</p>}
        </Karte>
      )}

      <Verlauf id={o.id} kauf={o.kauf?.kurs} ziel={o.zielkurs} stop={o.stopkurs} />

      <Karte titel="Zeitleiste">
        <ol class="zeitleiste">
          <li>
            <span class="klein">{datumUhr(o.vorgemerktUm)}</span> Vorgemerkt ({o.vorgemerktVon})
          </li>
          {o.kauf && (
            <li>
              <span class="klein">{datumUhr(o.kauf.zeit)}</span> Gekauft zu {euro(o.kauf.kurs)}
            </li>
          )}
          {o.anpassungen.map((a) => (
            <li key={a.zeit + a.feld}>
              <span class="klein">{datumUhr(a.zeit)}</span> {a.feld}: {String(a.alt)} → {String(a.neu)} – {a.begruendung}
            </li>
          ))}
          {o.verkauf && (
            <li>
              <span class="klein">{datumUhr(o.verkauf.zeit)}</span> Verkauft zu {euro(o.verkauf.kurs)} ({VERKAUFSGRUND_TEXT[o.verkauf.grund]})
            </li>
          )}
        </ol>
      </Karte>

      {p.quellen.length > 0 && (
        <Karte titel="Signale und Quellen">
          <ul class="liste">
            {p.quellen.map((q) => (
              <li key={q.link}>
                <a href={q.link} target="_blank" rel="noopener noreferrer">
                  {q.name}
                </a>
              </li>
            ))}
          </ul>
        </Karte>
      )}

      {o.bericht && (
        <Karte titel="Abschlussbericht">
          <div class="bericht">{o.bericht}</div>
          <p class="klein">{PFLICHTHINWEIS}</p>
        </Karte>
      )}

      <div class="knopfreihe">
        <a class="knopf" href={inClaudeBesprechenUrl(o)} target="_blank" rel="noopener noreferrer">
          In Claude besprechen
        </a>
        {fehlerUrl && (
          <a class="knopf zweitrangig" href={fehlerUrl} target="_blank" rel="noopener noreferrer">
            Fehler melden
          </a>
        )}
      </div>
    </div>
  );
}

function Zeile({ name, a }: { name: string; a: Ausfuehrung }) {
  return (
    <tr>
      <th scope="row">{name}</th>
      <td>{datumUhr(a.zeit)}</td>
      <td>{a.stueck}</td>
      <td>{euro(a.kurs)}</td>
      <td>{euro(a.kurswert)}</td>
      <td>{euro(a.entgelt.provision)}</td>
      <td>{euro(a.entgelt.handelsplatz)}</td>
      <td>{euro(a.betrag)}</td>
    </tr>
  );
}
