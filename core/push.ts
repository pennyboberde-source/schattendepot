// Kurze Push-Texte mit Typ-Symbol und Ruhezeit-Warteschlange.
import { euro, prozent } from './geld.ts';
import { berlin, inRuhezeit } from './kalender.ts';
import type { Anpassung, Ausfuehrung, Order } from './typen.ts';

export type PushTyp = 'briefing' | 'gekauft' | 'angepasst' | 'verkauft' | 'stop' | 'knockout' | 'bericht' | 'warnung' | 'wochenrueckblick';

export interface PushNachricht {
  typ: PushTyp;
  titel: string;
  text: string;
  /** Hash-Route der App, z. B. "#/order/<id>" */
  ziel: string;
  tag?: string;
  erstellt: string;
}

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** "Mi 29.10." in Berliner Zeit */
export function tagKurz(iso: string): string {
  const b = berlin(new Date(iso));
  const wt = WT[b.wochentag % 7];
  return `${wt} ${String(b.tag).padStart(2, '0')}.${String(b.monat).padStart(2, '0')}.`;
}

/** Optional: kalibrierte Trefferquote ähnlicher Konfidenz („bisher 52 %“), sobald genug Fälle vorliegen. */
export function chanceText(konfidenz: number, kalibriert?: { quote: number; faelle: number }): string {
  const basis = `Chance ~${Math.round(konfidenz)} %`;
  return kalibriert && kalibriert.faelle >= 10 ? `${basis} (bisher ${Math.round(kalibriert.quote)} % Treffer)` : basis;
}

export function pushGekauft(o: Order, jetzt: string, kalibriert?: { quote: number; faelle: number }): PushNachricht {
  const p = o.plan;
  const k = o.kauf!;
  return {
    typ: 'gekauft',
    titel: `${p.herkunft === 'autopilot' ? '🤖 Autopilot kauft' : '🟢 Gekauft'}: ${p.wertpapier.name}`,
    text: [
      `${k.stueck.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Stk. à ${euro(k.kurs)}`,
      `Ziel ${prozent(p.zielNettoProzent)} nach Gebühren bis ${tagKurz(o.verkaufstermin)}`,
      `Stop ${prozent(p.stopProzent)}`,
      chanceText(p.konfidenz, kalibriert),
      p.pflichtOrder ? 'Pflicht-Order' : '',
      p.herkunft === 'autopilot' ? 'bewiesenes Signal, Claude prüft im nächsten Lauf' : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ziel: `#/order/${o.id}`,
    tag: o.id,
    erstellt: jetzt,
  };
}

const FELD_TEXT: Record<Anpassung['feld'], string> = { ziel: 'Ziel', stop: 'Stop', verkaufstermin: 'Verkauf' };

export function pushAngepasst(o: Order, a: Anpassung): PushNachricht {
  const neu = a.feld === 'verkaufstermin' ? `verschoben auf ${tagKurz(String(a.neu))}` : `${FELD_TEXT[a.feld]} jetzt ${euro(Number(a.neu))}`;
  return {
    typ: 'angepasst',
    titel: `🔁 ${o.plan.wertpapier.name}`,
    text: `${a.feld === 'verkaufstermin' ? 'Verkauf ' : ''}${neu} – ${a.begruendung}`,
    ziel: `#/order/${o.id}`,
    tag: o.id,
    erstellt: a.zeit,
  };
}

export function pushVerkauft(o: Order, jetzt: string): PushNachricht {
  const v = o.verkauf!;
  const e = o.ergebnis!;
  const typ: PushTyp = v.grund === 'stop' ? 'stop' : v.grund === 'knockout' ? 'knockout' : 'verkauft';
  const kopf =
    typ === 'stop' ? '🔻 Stop ausgelöst' : typ === 'knockout' ? '⚡ Knock-out' : v.grund === 'nachziehstop' ? '🔒 Gewinn gesichert' : v.grund === 'gegensignal' ? '🚨 Gegensignal – verkauft' : v.grund === 'zeit' ? '⏱ Zeit-Ausstieg' : '✅ Verkauft';
  return {
    typ,
    titel: `${kopf}: ${o.plan.wertpapier.name}`,
    text: [
      `Kurs ${prozent(e.kursProzent)}`,
      `nach Gebühren ${prozent(e.nettoProzent)} (${euro(e.netto, { vorzeichen: true })})`,
      `erhofft waren ${prozent(o.plan.erwarteteRenditeNetto)}`,
      v.grund === 'termin' ? 'Verkaufstermin erreicht' : '',
      v.grund === 'nachziehstop' ? 'nachgezogener Stop' : '',
      v.grund === 'zeit' ? 'kaum Bewegung' : '',
      o.teilverkaeufe?.length ? 'inkl. Teilverkauf' : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ziel: `#/order/${o.id}`,
    tag: o.id,
    erstellt: jetzt,
  };
}

export function pushTeilverkauf(o: Order, v: Ausfuehrung): PushNachricht {
  const pct = o.kauf ? ((v.kurs / o.kauf.kurs - 1) * 100) : 0;
  return {
    typ: 'verkauft',
    titel: `💰 Teilverkauf: ${o.plan.wertpapier.name}`,
    text: [`${v.stueck.toLocaleString('de-DE', { maximumFractionDigits: 6 })} Stk. à ${euro(v.kurs)}`, `Kurs ${prozent(pct)}`, '1. Ziel erreicht, Rest läuft mit Stop auf Einstand'].join(' · '),
    ziel: `#/order/${o.id}`,
    tag: `teil-${o.id}`,
    erstellt: v.zeit,
  };
}

export function pushBericht(o: Order, learnings: number, jetzt: string): PushNachricht {
  return {
    typ: 'bericht',
    titel: `📘 Abschlussbericht ${o.plan.wertpapier.name}`,
    text: `${learnings} ${learnings === 1 ? 'Learning' : 'Learnings'}`,
    ziel: `#/order/${o.id}`,
    tag: `bericht-${o.id}`,
    erstellt: jetzt,
  };
}

export function pushBriefing(punkte: string[], jetzt: string): PushNachricht {
  return {
    typ: 'briefing',
    titel: '☀️ Briefing',
    text: punkte.map((p, i) => `${i + 1}) ${p}`).join(' '),
    ziel: '#/briefing',
    tag: `briefing-${jetzt.slice(0, 10)}`,
    erstellt: jetzt,
  };
}

export function pushWarnung(text: string, jetzt: string, ziel = '#/quellen'): PushNachricht {
  return { typ: 'warnung', titel: '⚠️ Schattendepot', text, ziel, tag: `warnung-${jetzt.slice(0, 13)}`, erstellt: jetzt };
}

export interface Zustellung {
  senden: PushNachricht[];
  warteschlange: PushNachricht[];
}

/**
 * Filtert abgeschaltete Typen und hält Nachrichten während der Ruhezeit zurück.
 * Außerhalb der Ruhezeit wird die Warteschlange mitgesendet – ab 2 Nachrichten als eine Sammelnachricht.
 */
export function zustellen(
  neu: PushNachricht[],
  warteschlange: PushNachricht[],
  jetzt: Date,
  einstellungen: { ruhezeit: { von: string; bis: string }; pushTypen: Record<string, boolean> },
): Zustellung {
  const erlaubt = neu.filter((n) => einstellungen.pushTypen[n.typ] !== false);
  if (inRuhezeit(jetzt, einstellungen.ruhezeit)) return { senden: [], warteschlange: [...warteschlange, ...erlaubt] };
  const alle = [...warteschlange, ...erlaubt];
  // Was in der Ruhezeit anfiel, kommt morgens gebündelt als eine Sammelnachricht (Nutzer 28.10.2026)
  if (alle.length >= 2 && warteschlange.length > 0) {
    const sammel: PushNachricht = {
      typ: 'warnung',
      titel: `📬 ${alle.length} Nachrichten`,
      text: alle.map((n) => n.titel).join(' · '),
      ziel: '#/heute',
      tag: `sammel-${jetzt.toISOString().slice(0, 13)}`,
      erstellt: jetzt.toISOString(),
    };
    return { senden: [sammel], warteschlange: [] };
  }
  return { senden: alle, warteschlange: [] };
}
