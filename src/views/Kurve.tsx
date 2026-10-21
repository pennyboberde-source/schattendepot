import { euro } from '../../core/geld.ts';
import { datumKurz } from '../lib/zeit';

/** Kumuliertes Ergebnis Schattendepot vs. ETF als schlichtes Liniendiagramm. */
export function Kurve({ punkte }: { punkte: { datum: string; depot: number; etf: number }[] }) {
  const b = 600;
  const h = 180;
  const rand = 8;
  const werte = punkte.flatMap((p) => [p.depot, p.etf, 0]);
  const min = Math.min(...werte);
  const max = Math.max(...werte);
  const spanne = max - min || 1;
  const x = (i: number) => rand + (i / (punkte.length - 1)) * (b - 2 * rand);
  const y = (v: number) => rand + (1 - (v - min) / spanne) * (h - 2 * rand);
  const linie = (f: (p: (typeof punkte)[0]) => number) => punkte.map((p, i) => `${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(' ');
  const letzter = punkte[punkte.length - 1];
  return (
    <figure class="kurve">
      <svg viewBox={`0 0 ${b} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Schattendepot ${euro(letzter.depot)}, ETF ${euro(letzter.etf)}`}>
        <line x1={rand} x2={b - rand} y1={y(0)} y2={y(0)} class="kurve-null" vector-effect="non-scaling-stroke" />
        <polyline points={linie((p) => p.etf)} class="kurve-etf" vector-effect="non-scaling-stroke" />
        <polyline points={linie((p) => p.depot)} class="kurve-depot" vector-effect="non-scaling-stroke" />
      </svg>
      <figcaption class="klein">
        <span class="legende depot">Schattendepot {euro(letzter.depot, { vorzeichen: true })}</span>
        <span class="legende etf">MSCI World {euro(letzter.etf, { vorzeichen: true })}</span>
        <span>
          {datumKurz(punkte[0].datum)} – {datumKurz(letzter.datum)}
        </span>
      </figcaption>
    </figure>
  );
}
