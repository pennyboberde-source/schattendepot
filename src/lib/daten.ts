// Laden der Laufzeitdaten (daten/…), die der Deploy aus dem daten-Branch neben die App legt.
import { useEffect, useState } from 'preact/hooks';
import type { Order } from '../../core/typen.ts';

export interface Positionen {
  stand: string;
  offen: Order[];
  vorgemerkt: Order[];
}

export interface Abgeschlossen {
  stand: string;
  orders: Order[];
}

export interface Kennzahlen {
  stand: string;
  anzahlOffen: number;
  anzahlGeschlossen: number;
  netto: number;
  nachSteuern: number;
  unrealisiert?: number;
  trefferquote: number | null;
  etfNetto: number;
  kurve: { datum: string; depot: number; etf: number }[];
}

export interface Systemstatus {
  stand: string;
  letzterWaechterLauf?: string;
  letzterSammlerLauf?: string;
  letzterClaudeLauf?: { zeit: string; typ: string };
  pushAbgelaufen?: boolean;
  letzterPush?: string;
  hinweise?: string[];
}

const basis = `${import.meta.env.BASE_URL}daten/`;

export async function ladeJson<T>(datei: string): Promise<T> {
  const res = await fetch(basis + datei, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${datei}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function ladeText(datei: string): Promise<string> {
  const res = await fetch(basis + datei, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${datei}: HTTP ${res.status}`);
  return res.text();
}

export type Ladezustand<T> = { status: 'laedt' } | { status: 'fehler'; fehler: string } | { status: 'ok'; daten: T };

/** Lädt eine Datendatei; `null` als Datei = nichts laden. */
export function useDaten<T>(datei: string | null): Ladezustand<T> {
  const [z, setZ] = useState<Ladezustand<T>>({ status: 'laedt' });
  useEffect(() => {
    if (!datei) return;
    let aktiv = true;
    setZ({ status: 'laedt' });
    ladeJson<T>(datei)
      .then((daten) => aktiv && setZ({ status: 'ok', daten }))
      .catch((e: Error) => aktiv && setZ({ status: 'fehler', fehler: e.message }));
    return () => {
      aktiv = false;
    };
  }, [datei]);
  return z;
}

export function kalenderUrl(): string {
  return new URL(`${basis}termine.ics`, location.href).href.replace(/^https?:/, 'webcal:');
}
