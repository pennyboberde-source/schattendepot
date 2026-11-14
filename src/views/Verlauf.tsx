import { prozent } from '../../core/geld.ts';
import { verlaufInProzent, type VerlaufAlt, type VerlaufProzent } from '../../core/verlauf.ts';
import { useDaten } from '../lib/daten';
import { datumUhr } from '../lib/zeit';
import { Karte } from '../ui';

/**
 * Verlauf seit Kauf mit Linien für Einstand, Ziel und Stop – in Prozent seit Kauf. Kurse in Euro stehen seit dem
 * 14.11.2026 nicht mehr im öffentlichen Datenzweig; ältere Dateien (Euro) werden hier umgerechnet, bis der
 * Kurswächter sie umgestellt hat.
 */
export function Verlauf({ id, kauf, ziel, stop }: { id: string; kauf?: number; ziel?: number; stop?: number }) {
  const z = useDaten<VerlaufProzent | VerlaufAlt>(`verlauf/${id}.json`);
  if (z.status !== 'ok') return null;
  const punkte = verlaufInProzent(z.daten, kauf ?? 0).punkte;
  if (punkte.length < 2) return null;
  const seitKauf = (kurs: number | undefined) => (typeof kurs === 'number' && kauf ? (kurs / kauf - 1) * 100 : undefined);
  const zielP = seitKauf(ziel);
  const stopP = seitKauf(stop);
  const b = 600;
  const h = 160;
  const werte = [...punkte.map((p) => p[1]), 0, ...[zielP, stopP].filter((x): x is number => typeof x === 'number')];
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
    <Karte titel="Verlauf seit Kauf (in Prozent)">
      <figure class="kurve" data-testid="verlauf-prozent">
        <svg viewBox={`0 0 ${b} ${h}`} preserveAspectRatio="none" role="img" aria-label={`Zuletzt ${prozent(letzter[1])} seit Kauf`}>
          {linie(zielP, 'linie-ziel')}
          {linie(stopP, 'linie-stop')}
          {linie(0, 'kurve-null')}
          <polyline points={punkte.map((p) => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} class="kurve-depot" vector-effect="non-scaling-stroke" />
        </svg>
        <figcaption class="klein">
          <span>
            {datumUhr(punkte[0][0])} – {datumUhr(letzter[0])} · zuletzt {prozent(letzter[1])}
          </span>
          <span class="legende ziel">Ziel</span>
          <span class="legende stop">Stop</span>
        </figcaption>
      </figure>
    </Karte>
  );
}
