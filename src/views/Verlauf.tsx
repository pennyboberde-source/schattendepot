import { euro } from '../../core/geld.ts';
import { useDaten } from '../lib/daten';
import { datumUhr } from '../lib/zeit';
import { Karte } from '../ui';

/** Kursverlauf seit Kauf mit Linien für Kaufkurs, Ziel und Stop. */
export function Verlauf({ id, kauf, ziel, stop }: { id: string; kauf?: number; ziel?: number; stop?: number }) {
  const z = useDaten<[string, number][]>(`verlauf/${id}.json`);
  if (z.status !== 'ok' || z.daten.length < 2) return null;
  const punkte = z.daten;
  const b = 600;
  const h = 160;
  const werte = [...punkte.map((p) => p[1]), ...[kauf, ziel, stop].filter((x): x is number => typeof x === 'number')];
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min || 1;
  const t0 = new Date(punkte[0][0]).getTime();
  const t1 = new Date(punkte[punkte.length - 1][0]).getTime();
  const x = (t: string) => ((new Date(t).getTime() - t0) / (t1 - t0 || 1)) * b;
  const y = (v: number) => 6 + (1 - (v - min) / spanne) * (h - 12);
  const linie = (v: number | undefined, klasse: string) => (v === undefined ? null : <line x1={0} x2={b} y1={y(v)} y2={y(v)} class={klasse} vector-effect="non-scaling-stroke" />);
  const letzter = punkte[punkte.length - 1];
  return (
    <Karte titel="Kursverlauf seit Kauf">
      <figure class="kurve">
        <svg viewBox={`0 0 ${b} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Kurs zuletzt ${euro(letzter[1])}`}>
          {linie(ziel, 'linie-ziel')}
          {linie(stop, 'linie-stop')}
          {linie(kauf, 'kurve-null')}
          <polyline points={punkte.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} class="kurve-depot" vector-effect="non-scaling-stroke" />
        </svg>
        <figcaption class="klein">
          <span>
            {datumUhr(punkte[0][0])} – {datumUhr(letzter[0])}
          </span>
          <span class="legende ziel">Ziel</span>
          <span class="legende stop">Stop</span>
        </figcaption>
      </figure>
    </Karte>
  );
}
