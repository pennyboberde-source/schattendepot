// Bereich „Heute“ (Plan Datenkrake S4): alles Wichtige des Tages auf einen Blick – Briefing, Tagesbilanz von Depot
// und Daytrading (getrennt), Käufe/Verkäufe inkl. Autopilot, „Heute gelernt“, Marktphase und Wochenzeugnis.
import { euro } from '../../core/geld.ts';
import { phaseText, type Marktphase } from '../../core/marktphase.ts';
import type { DtUebersicht } from '../../core/daytrading/auswertung.ts';
import type { Order } from '../../core/typen.ts';
import type { Wochenzeugnis } from '../../core/wochenzeugnis.ts';
import { useDaten, type Abgeschlossen, type Kennzahlen, type Positionen } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Betrag, Karte } from '../ui';
import type { Lagebild } from './Briefing';

const berlinDatum = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
const uhr = (iso: string) => new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

export function HeuteView() {
  const heute = berlinDatum(new Date());
  const lb = useDaten<Lagebild>('lagebild/heute.json');
  const k = useDaten<Kennzahlen>('kennzahlen.json');
  const pos = useDaten<Positionen>('positionen.json');
  const abg = useDaten<Abgeschlossen>('abgeschlossen.json');
  const dt = useDaten<DtUebersicht>('daytrading/uebersicht.json');
  const gelernt = useDaten<{ datum: string; punkte: string[] }[]>('lernen/heute-gelernt.json');
  const phase = useDaten<{ aktien?: Marktphase; krypto?: Marktphase }>('lernen/marktphase.json');
  const zeugnis = useDaten<Wochenzeugnis>('wochen/zeugnis-letztes.json');

  const gekauft: Order[] = pos.status === 'ok' ? pos.daten.offen.filter((o) => o.kauf && berlinDatum(new Date(o.kauf.zeit)) === heute) : [];
  const vorgemerkt: Order[] = pos.status === 'ok' ? pos.daten.vorgemerkt : [];
  const verkauft: Order[] = abg.status === 'ok' ? abg.daten.orders.filter((o) => o.verkauf && berlinDatum(new Date(o.verkauf.zeit)) === heute) : [];
  const depotHeute = verkauft.reduce((a, o) => a + (o.ergebnis?.netto ?? 0), 0);
  const dtHeute = dt.status === 'ok' && dt.daten.heute.datum === heute ? dt.daten.heute : null;

  return (
    <div class="seite">
      <h1>Heute</h1>
      <p class="untertitel">{new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })}</p>

      <div class="raster-kennzahlen" data-testid="heute-bilanz">
        <div class="kennzahl">
          <span class="kennzahl-label">Depot heute verkauft (nach Gebühren)</span>
          <Betrag wert={depotHeute} />
          <span class="klein">
            {verkauft.length} verkauft · {gekauft.length} gekauft{k.status === 'ok' && k.daten.unrealisiert !== undefined ? ` · offen ${euro(k.daten.unrealisiert, { vorzeichen: true })}` : ''}
          </span>
        </div>
        <div class="kennzahl">
          <span class="kennzahl-label">Daytrading heute (Smartbroker+)</span>
          <Betrag wert={dtHeute?.gruppe.netto ?? 0} />
          <span class="klein">
            {dtHeute ? `${dtHeute.gruppe.anzahl} Trades${dtHeute.offen ? ` · ${dtHeute.offen} offen` : ''} · vor Gebühren ${euro(dtHeute.gruppe.brutto, { vorzeichen: true })}` : 'noch keine Trades'}
          </span>
        </div>
      </div>

      {lb.status === 'ok' && lb.daten.briefing?.length ? (
        <Karte titel={`☀️ Briefing ${datumKurz(lb.daten.datum)}`} aktion={<a href="#/briefing">Ganzes Lagebild</a>}>
          <ol class="liste">
            {lb.daten.briefing.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ol>
        </Karte>
      ) : null}

      {(gekauft.length > 0 || verkauft.length > 0 || vorgemerkt.length > 0) && (
        <Karte titel="Depot heute">
          <ul class="liste" data-testid="heute-depot">
            {vorgemerkt.map((o) => (
              <li key={o.id}>
                <a href={`#/order/${o.id}`}>
                  ⏳ {o.plan.herkunft === 'autopilot' ? '🤖 ' : ''}
                  {o.plan.wertpapier.name}
                </a>{' '}
                <span class="klein">vorgemerkt</span>
              </li>
            ))}
            {gekauft.map((o) => (
              <li key={o.id}>
                <a href={`#/order/${o.id}`}>
                  🟢 {o.plan.herkunft === 'autopilot' ? '🤖 ' : ''}
                  {o.plan.wertpapier.name}
                </a>{' '}
                <span class="klein">gekauft {uhr(o.kauf!.zeit)}</span>
              </li>
            ))}
            {verkauft.map((o) => (
              <li key={o.id}>
                <a href={`#/order/${o.id}`}>✅ {o.plan.wertpapier.name}</a> <span class={o.ergebnis!.netto >= 0 ? 'plus' : 'minus'}>{euro(o.ergebnis!.netto, { vorzeichen: true })}</span>
              </li>
            ))}
          </ul>
        </Karte>
      )}

      {gelernt.status === 'ok' && gelernt.daten[0] && (
        <Karte titel={`🎓 Gelernt am ${datumKurz(gelernt.daten[0].datum)}`}>
          <ol class="liste">
            {gelernt.daten[0].punkte.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </Karte>
      )}

      <div class="zwei-spalten">
        <Karte titel="Marktphase">
          {phase.status === 'ok' && (phase.daten.aktien || phase.daten.krypto) ? (
            <dl class="werte">
              {phase.daten.aktien && (
                <>
                  <dt>Aktien (S&amp;P 500)</dt>
                  <dd>{phaseText(phase.daten.aktien.phase)}</dd>
                </>
              )}
              {phase.daten.krypto && (
                <>
                  <dt>Krypto (Bitcoin)</dt>
                  <dd>{phaseText(phase.daten.krypto.phase)}</dd>
                </>
              )}
            </dl>
          ) : (
            <p class="leer">Wird morgens im Hauptlauf gemessen.</p>
          )}
        </Karte>
        <Karte titel="📝 Wochenzeugnis">
          {zeugnis.status === 'ok' ? (
            <>
              <p>
                KW {zeugnis.daten.kw}: <strong data-testid="zeugnis-note">{zeugnis.daten.notenText}</strong>
              </p>
              <ul class="liste klein">
                {zeugnis.daten.faecher.map((f) => (
                  <li key={f.fach}>
                    {f.fach}: <strong>{f.note}</strong> <span class="klein">({f.wert})</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p class="leer">Kommt samstags – der Code vergibt eine Note für die Woche.</p>
          )}
        </Karte>
      </div>
      <p class="klein">
        <a href="#/quellen">Quellenstatus</a>
      </p>
    </div>
  );
}

/** Umschalter im Bereich Depot: Positionen | Abgeschlossen */
export function DepotNav({ aktiv }: { aktiv: 'positionen' | 'abgeschlossen' }) {
  return (
    <nav class="unternav" aria-label="Depot">
      <a href="#/depot" class={aktiv === 'positionen' ? 'aktiv' : ''} aria-current={aktiv === 'positionen' ? 'page' : undefined}>
        Positionen
      </a>
      <a href="#/abgeschlossen" class={aktiv === 'abgeschlossen' ? 'aktiv' : ''} aria-current={aktiv === 'abgeschlossen' ? 'page' : undefined}>
        Abgeschlossen
      </a>
    </nav>
  );
}
