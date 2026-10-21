// Kleine, wiederverwendbare Bausteine der Oberfläche.
import type { ComponentChildren } from 'preact';
import { euro, prozent } from '../core/geld.ts';
import type { Ladezustand } from './lib/daten';

const PFADE: Record<string, string> = {
  uebersicht: 'M4 19V9M10 19V5M16 19v-7M22 19H2',
  briefing: 'M12 3v2M5.6 5.6l1.4 1.4M3 12h2M19 12h2M17 7l1.4-1.4M8 16a4 4 0 1 1 8 0M3 20h18',
  abgeschlossen: 'M20 6 9 17l-5-5',
  lernen: 'M2 8l10-5 10 5-10 5zM6 10v5c3 2 9 2 12 0v-5',
  quellen: 'M4 6h16M4 12h16M4 18h10',
  einstellungen: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 1.2 14H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 2.6V2.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.5z',
  zurueck: 'M15 18l-6-6 6-6',
};

export function Icon({ name, size = 24 }: { name: keyof typeof PFADE | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={PFADE[name] ?? ''} />
    </svg>
  );
}

/** Betrag mit Farbe nach Vorzeichen. */
export function Betrag({ wert, prozentWert }: { wert: number; prozentWert?: number }) {
  const klasse = wert > 0 ? 'plus' : wert < 0 ? 'minus' : '';
  return (
    <span class={`betrag ${klasse}`}>
      {euro(wert, { vorzeichen: true })}
      {prozentWert !== undefined && <span class="betrag-prozent"> ({prozent(prozentWert)})</span>}
    </span>
  );
}

export function Karte({ titel, children, aktion }: { titel?: string; children: ComponentChildren; aktion?: ComponentChildren }) {
  return (
    <section class="karte">
      {(titel || aktion) && (
        <header class="karte-kopf">
          {titel && <h2>{titel}</h2>}
          {aktion}
        </header>
      )}
      {children}
    </section>
  );
}

export function Leer({ children }: { children: ComponentChildren }) {
  return <p class="leer">{children}</p>;
}

/** Einheitliche Darstellung von Laden/Fehler; rendert `kinder` mit den Daten. */
export function Geladen<T>({ z, kinder, leer }: { z: Ladezustand<T>; kinder: (d: T) => ComponentChildren; leer?: string }) {
  if (z.status === 'laedt') return <p class="leer">Lädt …</p>;
  if (z.status === 'fehler') return <p class="leer">{leer ?? 'Noch keine Daten.'} <span class="klein">({z.fehler})</span></p>;
  return <>{kinder(z.daten)}</>;
}

export function Fortschritt({ wert, label }: { wert: number; label: string }) {
  const p = Math.max(0, Math.min(100, wert));
  return (
    <div class="fortschritt" role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div class="fortschritt-balken" style={{ width: `${p}%` }} />
    </div>
  );
}
