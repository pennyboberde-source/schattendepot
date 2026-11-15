// Bereich „Volltreffer“ (Plan Volltreffer V4): rein virtuell. Lauerliste, laufende Jagden, Vorwärtstest der Muster,
// dazu der Rückblick (welche Muster tragen) und das Trefferbuch (was war vor den Sprüngen bekannt).
import { euro } from '../../core/geld.ts';
import type { JagdFall, JagdKennzahlen } from '../../core/volltreffer/jagd.ts';
import { useDaten } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Karte } from '../ui';
import { TrefferbuchKarte, VolltrefferRueckblickKarte } from './LernenVolltreffer';

interface Uebersicht {
  stand: string;
  regeln: { maxOffen: number; tagesVerlustGrenze: number; stufe2Faelle: number };
  kennzahlen: JagdKennzahlen;
  urteil?: { ja: JagdKennzahlen; nein: JagdKennzahlen; urteile: number };
  offen: JagdFall[];
  abgeschlossen: JagdFall[];
  lauerliste: JagdFall[];
  lauerlisteZahl: number;
  uebersprungen: number;
  muster: { gruppe: string; spielart: string; fenster: number; seit: string; faelle: number; treffer: number; ev: number; offen: number; rueckblick: { quote: number; ev: number; se: number; faelle: number }; stufe2: boolean }[];
}

const zahl = (x: number) => x.toLocaleString('de-DE');
const ART: Record<string, string> = { treffer: '🎯 Volltreffer', niete: '❌ Stop', zeit: '⏱️ Zeit abgelaufen', offen: '⏳ läuft', lauert: '👀 lauert' };

function JagdZeile({ j }: { j: JagdFall }) {
  return (
    <li class="muster-zeile">
      <strong>
        {`${j.wert}${j.markt === 'krypto' ? ' (Coin)' : ''} · ${ART[j.art] ?? j.art}`}
        {j.netto !== null ? ` · ${euro(j.netto, { vorzeichen: true })}` : ''}
      </strong>
      <span class="klein">
        {j.spielart}, bis {j.fenster} Tage{j.tag ? ` · Tag ${j.tag}` : ''} · Stichtag {datumKurz(j.stichtag)}
        {j.einstieg ? `, Einstieg ${datumKurz(j.einstieg)}` : ', Einstieg zur nächsten Eröffnung'}
      </span>
      <span class="klein">Muster: {j.muster}</span>
      {j.urteil && (
        <span class="klein">
          {j.urteil === 'ja' ? '✅ Claude: ja' : '❌ Claude: nein'} – {j.grund}
        </span>
      )}
    </li>
  );
}

export function JagdKarte() {
  const z = useDaten<Uebersicht>('volltreffer/uebersicht.json');
  if (z.status !== 'ok') {
    return (
      <Karte titel="🏹 Virtuelle Jagd">
        <p class="leer">Noch keine Jagd – sie beginnt, sobald ein Muster im Rückblick mit echtem Vorteil besteht.</p>
      </Karte>
    );
  }
  const u = z.daten;
  const k = u.kennzahlen;
  return (
    <Karte titel="🏹 Virtuelle Jagd">
      <div data-testid="volltreffer-jagd">
        <p class="klein">
          Muster, die im Rückblick bestanden haben, jagen hier virtuell weiter – nur mit Daten, die es beim Bestehen noch nicht gab. Je Jagd 1.000 €, höchstens {u.regeln.maxOffen} gleichzeitig. Ein Muster wird erst nach {u.regeln.stufe2Faelle} Fällen im Band des Rückblicks und deinem Ja sichtbar gehandelt.
        </p>
        <div class="raster-kennzahlen">
          <div class="kennzahl">
            <span class="kennzahl-label">Volltreffer-Quote</span>
            <strong>{k.anzahl ? `${k.quote.toLocaleString('de-DE')} %` : '–'}</strong>
            <span class="klein">
              {zahl(k.volltreffer)} von {zahl(k.anzahl)} Jagden
            </span>
          </div>
          <div class="kennzahl">
            <span class="kennzahl-label">Ø je Jagd (nach Kosten)</span>
            <strong class={k.ev >= 0 ? 'plus' : 'minus'}>{k.anzahl ? euro(k.ev, { vorzeichen: true }) : '–'}</strong>
            <span class="klein">Summe {euro(k.summe, { vorzeichen: true })}</span>
          </div>
          <div class="kennzahl">
            <span class="kennzahl-label">Ø Verlust der Nieten</span>
            <strong>{k.oeNiete ? euro(k.oeNiete) : '–'}</strong>
            <span class="klein">{zahl(k.offen)} laufen gerade</span>
          </div>
        </div>
        {u.urteil && u.urteil.urteile > 0 && (
          <p class="klein" data-testid="claude-urteil">
            Claudes Urteil im Morgenlauf: „ja“ {zahl(u.urteil.ja.anzahl)} abgeschlossen, Volltreffer {u.urteil.ja.anzahl ? `${u.urteil.ja.quote.toLocaleString('de-DE')} %` : '–'}, Ø {u.urteil.ja.anzahl ? euro(u.urteil.ja.ev, { vorzeichen: true }) : '–'} · „nein“ {zahl(u.urteil.nein.anzahl)}, Volltreffer {u.urteil.nein.anzahl ? `${u.urteil.nein.quote.toLocaleString('de-DE')} %` : '–'}, Ø {u.urteil.nein.anzahl ? euro(u.urteil.nein.ev, { vorzeichen: true }) : '–'}
          </p>
        )}
        <h3>Laufende Jagden</h3>
        {u.offen.length ? (
          <ul class="muster-liste">
            {u.offen.map((j) => (
              <JagdZeile key={j.wert + j.stichtag} j={j} />
            ))}
          </ul>
        ) : (
          <p class="leer">Gerade keine.</p>
        )}
        <h3>Lauerliste – Einstieg zur nächsten Eröffnung ({zahl(u.lauerlisteZahl)})</h3>
        {u.lauerliste.length ? (
          <ul class="muster-liste">
            {u.lauerliste.slice(0, 10).map((j) => (
              <JagdZeile key={j.wert + j.muster} j={j} />
            ))}
          </ul>
        ) : (
          <p class="leer">Heute erfüllt kein Wert ein Muster im Vorwärtstest.</p>
        )}
        {u.abgeschlossen.length > 0 && (
          <>
            <h3>Zuletzt abgeschlossen</h3>
            <ul class="muster-liste">
              {u.abgeschlossen.slice(0, 10).map((j) => (
                <JagdZeile key={j.wert + j.stichtag} j={j} />
              ))}
            </ul>
          </>
        )}
        <h3>Muster im Vorwärtstest ({zahl(u.muster.length)})</h3>
        <ul class="muster-liste">
          {u.muster.slice(0, 12).map((m) => (
            <li key={m.gruppe + m.spielart + m.fenster} class="muster-zeile">
              <strong>
                {m.stufe2 ? '🥈 Stufe 2 · ' : ''}
                {m.gruppe}
              </strong>
              <span class="klein">
                {m.spielart}, {m.fenster} T · seit {datumKurz(m.seit)} · vorwärts {zahl(m.faelle)} Fälle, {zahl(m.treffer)} Volltreffer, Ø {euro(m.ev, { vorzeichen: true })} (Rückblick Ø {euro(m.rueckblick.ev, { vorzeichen: true })} ± {euro(m.rueckblick.se)})
              </span>
            </li>
          ))}
        </ul>
        <p class="klein">Stand {datumKurz(u.stand)} · rein virtuell, keine Mitteilungen.</p>
      </div>
    </Karte>
  );
}

export function VolltrefferView() {
  return (
    <div class="seite">
      <h1>Volltreffer</h1>
      <p class="klein">Ziel: Signale finden, die einem großen, handelbaren Kurssprung vorausgehen – mindestens +400 € netto aus einer 1.000-€-Order. Alles hier ist virtuell.</p>
      <JagdKarte />
      <VolltrefferRueckblickKarte />
      <TrefferbuchKarte />
    </div>
  );
}
