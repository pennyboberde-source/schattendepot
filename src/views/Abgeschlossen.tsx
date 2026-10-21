import { useState } from 'preact/hooks';
import { prozent } from '../../core/geld.ts';
import type { Order, Strategie } from '../../core/typen.ts';
import { useDaten, type Abgeschlossen } from '../lib/daten';
import { STRATEGIE_TEXT, VERKAUFSGRUND_TEXT } from '../lib/texte';
import { datumKurz } from '../lib/zeit';
import { Betrag, Geladen, Leer } from '../ui';

type Ergebnisfilter = 'alle' | 'gewinn' | 'verlust';
type Zeitraum = 'alle' | '7' | '30' | '90';

export function AbgeschlossenView() {
  const z = useDaten<Abgeschlossen>('abgeschlossen.json');
  const [strategie, setStrategie] = useState<Strategie | 'alle'>('alle');
  const [ergebnis, setErgebnis] = useState<Ergebnisfilter>('alle');
  const [zeitraum, setZeitraum] = useState<Zeitraum>('alle');

  const filtern = (orders: Order[]) => {
    const grenze = zeitraum === 'alle' ? 0 : Date.now() - Number(zeitraum) * 86400000;
    return orders
      .filter((o) => strategie === 'alle' || o.plan.strategie === strategie)
      .filter((o) => ergebnis === 'alle' || (ergebnis === 'gewinn' ? (o.ergebnis?.netto ?? 0) > 0 : (o.ergebnis?.netto ?? 0) <= 0))
      .filter((o) => !o.verkauf || new Date(o.verkauf.zeit).getTime() >= grenze)
      .sort((a, b) => (b.verkauf?.zeit ?? '').localeCompare(a.verkauf?.zeit ?? ''));
  };

  return (
    <div class="seite">
      <h1>Abgeschlossen</h1>
      <div class="filter">
        <label>
          Strategie
          <select value={strategie} onChange={(e) => setStrategie((e.target as HTMLSelectElement).value as Strategie | 'alle')}>
            <option value="alle">Alle</option>
            {Object.entries(STRATEGIE_TEXT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ergebnis
          <select value={ergebnis} onChange={(e) => setErgebnis((e.target as HTMLSelectElement).value as Ergebnisfilter)}>
            <option value="alle">Alle</option>
            <option value="gewinn">Gewinn</option>
            <option value="verlust">Verlust</option>
          </select>
        </label>
        <label>
          Zeitraum
          <select value={zeitraum} onChange={(e) => setZeitraum((e.target as HTMLSelectElement).value as Zeitraum)}>
            <option value="alle">Alles</option>
            <option value="7">7 Tage</option>
            <option value="30">30 Tage</option>
            <option value="90">90 Tage</option>
          </select>
        </label>
      </div>
      <Geladen
        z={z}
        leer="Noch keine abgeschlossenen Orders."
        kinder={(d) => {
          const liste = filtern(d.orders);
          if (liste.length === 0) return <Leer>Keine Orders für diesen Filter.</Leer>;
          return (
            <ul class="karten-liste">
              {liste.map((o) => (
                <li key={o.id}>
                  <a class="zeile-karte" href={`#/order/${o.id}`}>
                    <div>
                      <strong>{o.plan.wertpapier.name}</strong>
                      <div class="klein">
                        {STRATEGIE_TEXT[o.plan.strategie]} · {o.verkauf ? `${datumKurz(o.verkauf.zeit)} · ${VERKAUFSGRUND_TEXT[o.verkauf.grund]}` : ''} · Chance war ~{o.plan.konfidenz} %
                      </div>
                    </div>
                    <div class="rechts">
                      {o.ergebnis && <Betrag wert={o.ergebnis.netto} />}
                      {o.ergebnis && <div class="klein">{prozent(o.ergebnis.nettoProzent)} netto</div>}
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          );
        }}
      />
    </div>
  );
}
