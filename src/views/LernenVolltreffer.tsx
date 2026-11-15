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
  /** in beiden Zeiträumen besser als die Grundrate derselben Spielart */
  vorteil?: boolean;
  vorteilA?: number;
  vorteilB?: number;
}
export interface Rangliste {
  stand: string;
  zeitraum: { von: string; bis: string; grenze: string };
  umfang: { stichtage: number; reihen: number; episoden: number; aktien: number; coins: number };
  bestandenZahl: number;
  mitVorteilZahl?: number;
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
      {e.vorteilA !== undefined && e.vorteilB !== undefined && (
        <span class="klein">
          {e.vorteil ? '✅ echter Vorteil' : '⚠️ kein Vorteil'} gegen die Grundrate derselben Spielart: {euro(e.vorteilA)} / {euro(e.vorteilB)} je Order{e.vorteil ? '' : ' – vor allem Markttrend'}
        </span>
      )}
    </li>
  );
}

interface Trefferbuch {
  stand: string;
  zahl: number;
  mitVorzeichen: number;
  eintraege: { datum: string; wert: string; markt: string; spielart: string; netto: number; tage: number; r1: number; relVolumen: number | null; vorzeichen: { typ: string; datum: string }[] }[];
}
interface SignalPruefung {
  von: string | null;
  bis: string | null;
  grundrate: { aktie: number; krypto: number };
  typen: { typ: string; markt: string; faelle: number; treffer: number; quote: number; grundrate: number; lift: number | null }[];
}

/** Trefferbuch (V2) und Signal-Prüfung: Was war vor den Sprüngen der letzten Wochen bekannt? */
export function TrefferbuchKarte() {
  const b = useDaten<Trefferbuch>('lernen/muster/trefferbuch.json');
  const s = useDaten<SignalPruefung>('lernen/muster/signale-volltreffer.json');
  if (b.status !== 'ok' && s.status !== 'ok') return null;
  return (
    <Karte titel="📖 Trefferbuch – was war vorher bekannt?">
      <div data-testid="trefferbuch">
        {b.status === 'ok' && (
          <>
            <p class="klein">
              {zahl(b.daten.zahl)} Sprünge in den letzten 30 Tagen (Volltreffer direkt oder mit Hebel bis 3, Stop 150 €); bei {zahl(b.daten.mitVorzeichen)} hatte die Datenkrake vorher ein Signal zu dem Wert.
            </p>
            <ul class="muster-liste">
              {b.daten.eintraege.slice(0, 12).map((e) => (
                <li key={e.datum + e.wert} class="muster-zeile">
                  <strong>
                    {datumKurz(e.datum)} · {e.wert} {e.markt === 'krypto' ? '(Coin)' : ''} · {euro(e.netto)} in {e.tage} {e.tage === 1 ? 'Tag' : 'Tagen'}
                  </strong>
                  <span class="klein">
                    {e.spielart} · am Stichtag {e.r1 >= 0 ? '+' : ''}
                    {e.r1.toLocaleString('de-DE')} %{e.relVolumen !== null ? `, Umsatz ${e.relVolumen.toLocaleString('de-DE')}× Ø` : ''}
                  </span>
                  <span class="klein">Vorzeichen: {e.vorzeichen.length ? e.vorzeichen.map((v) => `${v.typ} (${datumKurz(v.datum)})`).join(', ') : 'keins der Datenkrake'}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {s.status === 'ok' && s.daten.typen.length > 0 && (
          <>
            <h3>Welche Signale kündigten Sprünge an?</h3>
            <p class="klein">
              Anteil der Signale, auf die ab dem Folgetag binnen 10 Handelstagen ein Volltreffer folgte – gegen die Grundrate aller handelbaren Werte derselben Tage (Aktien {quote(s.daten.grundrate.aktie)}, Krypto {quote(s.daten.grundrate.krypto)}). Unter etwa 100 Fällen ist das noch Zufall.
            </p>
            <ul class="muster-liste">
              {s.daten.typen.slice(0, 15).map((t) => (
                <li key={t.markt + t.typ} class="muster-zeile">
                  <strong>
                    {t.typ} {t.markt === 'krypto' ? '(Krypto)' : ''} · {quote(t.quote)}
                    {t.lift !== null ? ` (${t.lift.toLocaleString('de-DE')}× Grundrate)` : ''}
                  </strong>
                  <span class="klein">
                    {zahl(t.treffer)} von {zahl(t.faelle)} Fällen{t.faelle < 100 ? ' – noch zu wenige' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </Karte>
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
        <h3>{r.bestandenZahl ? `Bestanden: ${zahl(r.bestandenZahl)} Muster${r.mitVorteilZahl !== undefined ? `, davon ${zahl(r.mitVorteilZahl)} mit echtem Vorteil` : ''} – die stärksten` : 'Noch kein Muster bestanden'}</h3>
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
