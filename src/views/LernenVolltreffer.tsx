// Bereich „Lernen“ – Volltreffer-Rückblick (Plan Volltreffer V3): Was ging in der Kursgeschichte einem Volltreffer
// voraus? Nur verdichtete Kennzahlen aus lernen/muster/rangliste.json; ehrlich auch dann, wenn nichts besteht.
import { euro } from '../../core/geld.ts';
import { useDaten } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Karte } from '../ui';

interface Eintrag {
  gruppe: string;
  spielart: string;
  fenster: number;
  bestanden: boolean;
  wertung: number;
  faelle: number;
  quote: number;
  lift: number | null;
  erfassung: number;
  evGesamt: number;
  zeitraumA: { n: number; quote: number; ev: number; se: number };
  zeitraumB: { n: number; quote: number; ev: number; se: number };
  knockoutQuote: number;
}
export interface Rangliste {
  stand: string;
  zeitraum: { von: string; bis: string; grenze: string };
  umfang: { stichtage: number; reihen: number; episoden: number; aktien: number; coins: number };
  bestandenZahl: number;
  bestanden: Eintrag[];
  besteOhneBestehen: Eintrag[];
  hypothesen: Eintrag[];
}

const zahl = (x: number) => x.toLocaleString('de-DE');
const quote = (x: number) => `${x.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

function Zeile({ e }: { e: Eintrag }) {
  return (
    <li class="muster-zeile">
      <strong>{e.gruppe}</strong>
      <span class="klein">
        {e.spielart}, {e.fenster} {e.fenster === 1 ? 'Tag' : 'Tage'} · {zahl(e.faelle)} Fälle · Volltreffer {quote(e.quote)}
        {e.lift !== null ? ` (${e.lift.toLocaleString('de-DE')}× Grundrate)` : ''}
      </span>
      <span class="klein">
        Ø je Order: <b class={e.zeitraumA.ev >= 0 ? 'plus' : 'minus'}>{euro(e.zeitraumA.ev)}</b> im ersten, <b class={e.zeitraumB.ev >= 0 ? 'plus' : 'minus'}>{euro(e.zeitraumB.ev)}</b> im zweiten Zeitraum
        {e.knockoutQuote ? ` · Knock-out ${quote(e.knockoutQuote)}` : ''}
      </span>
    </li>
  );
}

export function VolltrefferRueckblickKarte() {
  const z = useDaten<Rangliste>('lernen/muster/rangliste.json');
  if (z.status !== 'ok') {
    return (
      <Karte titel="🎯 Volltreffer-Rückblick">
        <p class="leer">Noch kein Rückblick – er rechnet, sobald die Kursgeschichte geladen ist.</p>
      </Karte>
    );
  }
  const r = z.daten;
  return (
    <Karte titel="🎯 Volltreffer-Rückblick">
      <div data-testid="volltreffer-rueckblick">
        <p class="klein">
          Wäre eine 1.000-€-Order ein Volltreffer (mindestens +400 € netto) geworden? Gerechnet über {zahl(r.umfang.stichtage)} handelbare Stichtage von {zahl(r.umfang.aktien)} Aktien und {zahl(r.umfang.coins)} Coins, {datumKurz(r.zeitraum.von)} bis {datumKurz(r.zeitraum.bis)}. {zahl(r.umfang.episoden)} Sprünge gezählt. Ein Muster besteht nur, wenn es in beiden Zeiträumen (vor und ab {datumKurz(r.zeitraum.grenze)}) mindestens 100 Fälle und im Schnitt Gewinn nach Kosten zeigt.
        </p>
        <h3>{r.bestandenZahl ? `Bestanden: ${zahl(r.bestandenZahl)} Muster – die stärksten` : 'Noch kein Muster bestanden'}</h3>
        {r.bestandenZahl ? (
          <ul class="muster-liste">
            {r.bestanden.slice(0, 8).map((e) => (
              <Zeile key={e.gruppe + e.spielart + e.fenster} e={e} />
            ))}
          </ul>
        ) : (
          <p class="klein">Ehrlich: Keine Gruppe war in beiden Zeiträumen im Plus. Die knappsten Kandidaten:</p>
        )}
        {!r.bestandenZahl && (
          <ul class="muster-liste">
            {r.besteOhneBestehen.slice(0, 5).map((e) => (
              <Zeile key={e.gruppe + e.spielart + e.fenster} e={e} />
            ))}
          </ul>
        )}
        <h3>Hypothesen</h3>
        <ul class="muster-liste">
          {r.hypothesen.map((e) => (
            <li key={e.gruppe} class="muster-zeile">
              <strong>
                {e.bestanden ? '✅' : '❌'} {e.gruppe.replace(/^(Aktien|Krypto): /, '$1 · ')}
              </strong>
              <span class="klein">
                beste Spielart {e.spielart}, {e.fenster} T · {zahl(e.faelle)} Fälle · Volltreffer {quote(e.quote)} · Ø {euro(e.zeitraumA.ev)} / {euro(e.zeitraumB.ev)}
              </span>
            </li>
          ))}
        </ul>
        <p class="klein">Stand {datumKurz(r.stand)} · Handelbarkeit ist eine Näherung. Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.</p>
      </div>
    </Karte>
  );
}
