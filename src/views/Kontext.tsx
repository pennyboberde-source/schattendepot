// Karten zu Kontext, Gesamtmodell und Schattenbuch auf Sammelkursen (seit 16.11.2026). Jede Karte bleibt unsichtbar,
// solange ihre Datei noch nicht im Datenzweig liegt – so stört sie weder alte Stände noch die Demo-Daten.
import { Fragment } from 'preact';
import { useDaten } from '../lib/daten';
import { datumKurz } from '../lib/zeit';
import { Karte } from '../ui';

const zahl = (x: number) => x.toLocaleString('de-DE');
const pz = (x: number | null | undefined, vorzeichen = true) => (x === null || x === undefined ? '–' : `${vorzeichen && x > 0 ? '+' : ''}${x.toLocaleString('de-DE')} %`);
const eu = (x: number) => `${x > 0 ? '+' : ''}${Math.round(x).toLocaleString('de-DE')} €`;

// ---------- Tages-Lagebild (lernen/lage.json) ----------
interface LageTag {
  datum: string;
  aktien: Record<string, string | null>;
  krypto: Record<string, string | null>;
}
const LAGE_TEXT: Record<string, string> = { vix: 'Angstbarometer', vix5: 'Angst 5 Tage', breite: 'Marktbreite', markt5: 'Markt 5 Tage', anleihen: 'Zinsen (lange Anleihen)', dollar: 'Dollar', kredit: 'Kreditmarkt', oel: 'Öl', angst: 'Fear & Greed', stablecoins: 'Stablecoins' };

export function LageKarte() {
  const z = useDaten<{ stand: string; heute: LageTag | null }>('lernen/lage.json');
  if (z.status !== 'ok' || !z.daten.heute) return null;
  const h = z.daten.heute;
  const zeilen = (o: Record<string, string | null>) => Object.entries(o).filter(([, v]) => v);
  return (
    <Karte titel={`🧭 Lage ${datumKurz(h.datum)}`}>
      <div data-testid="lage">
        <dl class="werte">
          {zeilen(h.aktien).map(([k, v]) => (
            <Fragment key={'a' + k}>
              <dt>{LAGE_TEXT[k] ?? k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
          {zeilen(h.krypto).map(([k, v]) => (
            <Fragment key={'k' + k}>
              <dt>Krypto: {LAGE_TEXT[k] ?? k}</dt>
              <dd>{v}</dd>
            </Fragment>
          ))}
        </dl>
        <p class="klein">Grobe Klassen aus ETF-Kursen, VIX, Fear &amp; Greed und Stablecoin-Menge – Kontext für alle Bereiche.</p>
      </div>
    </Karte>
  );
}

// ---------- Gesamtmodell (lernen/muster/modell.json) ----------
interface ModellZeitraum {
  n: number;
  quote: number;
  ev: number;
  se: number;
  tage: number;
  grundEv: number;
}
interface ModellErgebnis {
  gruppe: string;
  spielart: string;
  fenster: number;
  q: number;
  bestanden: boolean;
  grund: string;
  zeitraeume: ModellZeitraum[];
  quartale: [number, number];
  wertung: number;
  wichtig: string[];
  faelleHeute: number;
}

export function GesamtmodellKarte() {
  const z = useDaten<{ stand: string; modelle: ModellErgebnis[] }>('lernen/muster/modell.json');
  if (z.status !== 'ok' || !z.daten.modelle?.length) return null;
  const zr = (x: ModellZeitraum) => `${zahl(x.n)} Fälle an ${zahl(x.tage)} Tagen, Volltreffer ${pz(x.quote, false)}, Ø ${eu(x.ev)} ± ${Math.round(x.se)} € (alle: ${eu(x.grundEv)})`;
  return (
    <Karte titel="🧠 Gesamtmodell">
      <div data-testid="gesamtmodell">
        <p class="klein">Bewertet jeden Fall aus allen Merkmalen zugleich (Gradient Boosting). Gemessen nur an Fällen, die das Modell nie gesehen hat: das Modell aus dem ersten Jahr bewertet das zweite und umgekehrt.</p>
        <ul class="muster-liste">
          {z.daten.modelle.map((m) => (
            <li key={m.gruppe + m.spielart} class="muster-zeile">
              <strong>
                {m.bestanden ? '✅ ' : '❌ '}
                {m.gruppe}
              </strong>
              <span class="klein">
                {m.spielart}, {m.fenster} T · Wertung {m.wertung.toLocaleString('de-DE')} · Quartale im Plus {m.quartale[0]} von {m.quartale[1]}
              </span>
              <span class="klein">1. Jahr: {zr(m.zeitraeume[0])}</span>
              <span class="klein">2. Jahr: {zr(m.zeitraeume[1])}</span>
              <span class="klein">{m.grund}</span>
              {m.wichtig.length > 0 && <span class="klein">Wichtigste Merkmale: {m.wichtig.slice(0, 5).join(', ')}</span>}
            </li>
          ))}
        </ul>
        <p class="klein">Stand {datumKurz(z.daten.stand)} · simuliert.</p>
      </div>
    </Karte>
  );
}

// ---------- Schattenbuch auf Sammelkursen (lernen/schattenbuch/sammelkurse.json) ----------
interface SammelPunkt {
  n: number;
  mittel: number | null;
  median: number | null;
  imPlus: number | null;
  ueberMarkt: number | null;
  ueberKlasse: number | null;
}
interface SammelTyp {
  markt: string;
  typ: string;
  faelle: number;
  punkte: Record<'r1T' | 'r3T' | 'r1W' | 'r10T' | 'r1M', SammelPunkt>;
  hoch: number | null;
  tief: number | null;
}

export function SammelSchattenbuchKarte() {
  const z = useDaten<{ stand: string; abdeckung: { signale: number; gemessen: number; anteil: number }; typen: SammelTyp[] }>('lernen/schattenbuch/sammelkurse.json');
  if (z.status !== 'ok' || !z.daten.typen?.length) return null;
  const d = z.daten;
  // nach der Überrendite gegen die Größenklasse nach 1 Woche, nur Typen mit mindestens 10 Messungen
  const typen = d.typen.filter((t) => t.punkte.r1W.n >= 10).sort((a, b) => (b.punkte.r1W.ueberKlasse ?? -99) - (a.punkte.r1W.ueberKlasse ?? -99));
  return (
    <Karte titel="📒 Schattenbuch auf Sammelkursen">
      <div data-testid="sammel-schattenbuch">
        <p class="klein">
          Jedes Signal der Datenkrake aus den Tageskursen gemessen ({zahl(d.abdeckung.gemessen)} von {zahl(d.abdeckung.signale)} Signalen, {pz(d.abdeckung.anteil, false)}), Start zur nächsten Eröffnung. Überrendite gegen Werte gleicher Größe.
        </p>
        {typen.length ? (
          <ul class="muster-liste">
            {typen.slice(0, 10).map((t) => (
              <li key={t.markt + t.typ} class="muster-zeile">
                <strong>
                  {t.typ}
                  {t.markt === 'krypto' ? ' (Krypto)' : ''} · 1 Woche {pz(t.punkte.r1W.median)} (gegen gleich Große {pz(t.punkte.r1W.ueberKlasse)})
                </strong>
                <span class="klein">
                  {zahl(t.faelle)} Fälle · 1 Tag {pz(t.punkte.r1T.median)} · 10 Tage {pz(t.punkte.r10T.median)} ({zahl(t.punkte.r10T.n)}) · im Plus nach 1 Woche {pz(t.punkte.r1W.imPlus, false)} · Hoch {pz(t.hoch)} / Tief {pz(t.tief)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="leer">Noch kein Signaltyp mit 10 Messungen nach einer Woche.</p>
        )}
        <p class="klein">Stand {datumKurz(d.stand)} · Median je Typ.</p>
      </div>
    </Karte>
  );
}
