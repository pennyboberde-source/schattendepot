// Ereignisprotokoll → Orders, Positionen, Abgeschlossen, Kennzahlen.
// Das Protokoll ist die einzige Wahrheit; alles andere wird hieraus neu berechnet (nie von Hand).
import { runde } from './geld.ts';
import { berlin } from './kalender.ts';
import { depotEntgeltOpt, orderentgelt, type GebuehrenConfig } from './gebuehren.ts';
import { etfVergleich } from './etf.ts';
import { ergebnis as ergebnisRechnen, summeSeiten, verkaufen, type Seite } from './rendite.ts';
import { geldBrief, type SpreadConfig } from './spreads.ts';
import { steuernBerechnen, type SteuerConfig } from './steuern.ts';
import type { Anpassung, Ausfuehrung, Ereignis, Hebel, Kurs, Order, OrderPlan, Verkaufsgrund } from './typen.ts';

export interface EreignisDaten {
  vorgemerkt: { plan: OrderPlan; verkaufstermin: string };
  gekauft: { kauf: Ausfuehrung; zielkurs: number; stopkurs: number; etf?: Kurs; hebel?: Hebel };
  angepasst: { anpassung: Anpassung };
  verkauft: { verkauf: Ausfuehrung & { grund: Verkaufsgrund }; ergebnis: { kursProzent: number; netto: number; nettoProzent: number; gebuehren: number } };
  teilverkauft: { verkauf: Ausfuehrung & { grund: Verkaufsgrund } };
  verworfen: { grund: string };
  bericht: { text: string; learnings: string[]; einwandEingetreten?: boolean };
  etfVergleich: { netto: number; nettoProzent: number };
}

/** Noch gehaltene Stücke (Kauf minus Teilverkäufe). Krypto direkt kennt Bruchstücke. */
export function restStueck(o: Order): number {
  if (!o.kauf) return 0;
  const weg = (o.teilverkaeufe ?? []).reduce((a, t) => a + t.stueck, 0);
  return runde(o.kauf.stueck - weg, 8);
}

/**
 * Gebühren aller Orders mit dem aktuellen Gebührenmodell neu rechnen – „als wären alle Käufe und Verkäufe dort gehandelt
 * worden“ (Smartbroker+, für alle Orders). Kurse und Stückzahlen bleiben, wie sie
 * ausgeführt wurden; das Ereignisprotokoll behält die ursprüngliche Buchung (nur anhängen, nie umschreiben).
 */
export function gebuehrenUmrechnen(orders: Order[], g: GebuehrenConfig, etf?: { spreads: SpreadConfig; orderBetrag: number }): Order[] {
  for (const o of orders) {
    if (!o.kauf) continue;
    const opt = depotEntgeltOpt(o.plan);
    const neu = <T extends Ausfuehrung>(a: T, kauf: boolean): T => {
      const entgelt = a.kurswert > 0 ? orderentgelt(a.kurswert, g, opt) : { provision: 0, handelsplatz: 0, gesamt: 0 };
      return { ...a, entgelt, betrag: runde(kauf ? a.kurswert + entgelt.gesamt : a.kurswert - entgelt.gesamt) };
    };
    o.kauf = neu(o.kauf, true);
    if (o.teilverkaeufe) o.teilverkaeufe = o.teilverkaeufe.map((t) => neu(t, false));
    if (o.verkauf && o.ergebnis) {
      o.verkauf = neu(o.verkauf, false);
      const seite = (a: Ausfuehrung): Seite => ({ stueck: a.stueck, kurs: a.kurs, kurswert: a.kurswert, entgelt: a.entgelt, betrag: a.betrag });
      const teile = (o.teilverkaeufe ?? []).map(seite);
      const e = ergebnisRechnen(seite(o.kauf), teile.length ? summeSeiten([...teile, seite(o.verkauf)]) : seite(o.verkauf));
      o.ergebnis = { ...o.ergebnis, ...e, nachSteuern: e.netto };
    }
    // Vergleichs-ETF mit denselben Gebühren (gespeichert sind Kauf- und Verkaufskurs des ETFs)
    const ev = o.etfVergleich as (Order['etfVergleich'] & { etfKauf?: number; etfVerkauf?: number }) | undefined;
    if (etf && ev && ev.etfKauf && ev.etfVerkauf) {
      const v = etfVergleich({ wert: ev.etfKauf, zeit: '', quelle: '' }, { wert: ev.etfVerkauf, zeit: '', quelle: '' }, { gebuehren: g, spreads: etf.spreads }, etf.orderBetrag);
      if (v) o.etfVergleich = { ...ev, ...v };
    }
  }
  return orders;
}

export function ordersAusEreignissen(ereignisse: Ereignis[]): Order[] {
  const orders = new Map<string, Order>();
  const sortiert = [...ereignisse].sort((a, b) => a.zeit.localeCompare(b.zeit) || a.id.localeCompare(b.id));
  for (const e of sortiert) {
    if (!e.orderId) continue;
    const o = orders.get(e.orderId);
    switch (e.typ) {
      case 'vorgemerkt': {
        if (o) throw new Error(`Order ${e.orderId} doppelt vorgemerkt`);
        const d = e.daten as unknown as EreignisDaten['vorgemerkt'];
        orders.set(e.orderId, {
          id: e.orderId,
          status: 'vorgemerkt',
          vorgemerktUm: e.zeit,
          vorgemerktVon: e.quelle,
          plan: d.plan,
          verkaufstermin: d.verkaufstermin,
          anpassungen: [],
        });
        break;
      }
      case 'gekauft': {
        const d = e.daten as unknown as EreignisDaten['gekauft'];
        if (!o || o.status !== 'vorgemerkt') throw new Error(`Kauf ohne Vormerkung: ${e.orderId}`);
        Object.assign(o, { status: 'offen', kauf: d.kauf, zielkurs: d.zielkurs, stopkurs: d.stopkurs, etfKauf: d.etf });
        // Wunsch-Hebel: gekauft wurde ein nachgebildeter Turbo auf den Wert
        if (d.hebel) o.plan = { ...o.plan, hebel: d.hebel, wertpapier: { ...o.plan.wertpapier, anlageklasse: 'hebel', spreadKlasse: 'hebel' } };
        break;
      }
      case 'angepasst': {
        const a = (e.daten as unknown as EreignisDaten['angepasst']).anpassung;
        if (!o || (o.status !== 'offen' && o.status !== 'vorgemerkt')) break; // Anpassung zu spät → ignoriert, bleibt im Protokoll
        o.anpassungen.push(a);
        if (a.feld === 'ziel') o.zielkurs = Number(a.neu);
        if (a.feld === 'stop') o.stopkurs = Number(a.neu);
        if (a.feld === 'verkaufstermin') o.verkaufstermin = String(a.neu);
        break;
      }
      case 'teilverkauft': {
        const d = e.daten as unknown as EreignisDaten['teilverkauft'];
        if (!o || o.status !== 'offen') throw new Error(`Teilverkauf ohne offene Position: ${e.orderId}`);
        o.teilverkaeufe = [...(o.teilverkaeufe ?? []), d.verkauf];
        break;
      }
      case 'verkauft': {
        const d = e.daten as unknown as EreignisDaten['verkauft'];
        if (!o || o.status !== 'offen') throw new Error(`Verkauf ohne offene Position: ${e.orderId}`);
        Object.assign(o, { status: 'geschlossen', verkauf: d.verkauf, ergebnis: { ...d.ergebnis, steuer: 0, nachSteuern: d.ergebnis.netto } });
        break;
      }
      case 'verworfen': {
        if (o && o.status === 'vorgemerkt') Object.assign(o, { status: 'verworfen', verwerfGrund: (e.daten as { grund: string }).grund });
        break;
      }
      case 'bericht': {
        if (o) {
          const d = e.daten as unknown as EreignisDaten['bericht'];
          o.bericht = d.text;
          o.berichtZeit = e.zeit;
          if (typeof d.einwandEingetreten === 'boolean') o.einwandEingetreten = d.einwandEingetreten;
        }
        break;
      }
      case 'etfVergleich': {
        if (o) o.etfVergleich = e.daten as unknown as EreignisDaten['etfVergleich'];
        break;
      }
    }
  }
  return [...orders.values()];
}

export interface Kennzahlen {
  stand: string;
  anzahlOffen: number;
  anzahlGeschlossen: number;
  netto: number;
  nachSteuern: number;
  unrealisiert: number;
  trefferquote: number | null;
  etfNetto: number;
  kurve: { datum: string; depot: number; etf: number }[];
}

export interface Abgeleitet {
  orders: Order[];
  positionen: { stand: string; offen: Order[]; vorgemerkt: Order[] };
  abgeschlossen: { stand: string; orders: Order[] };
  kennzahlen: Kennzahlen;
}

export function ableiten(
  ereignisse: Ereignis[],
  kurse: Record<string, Kurs>,
  cfg: { steuern: SteuerConfig; gebuehren: GebuehrenConfig; spreads: SpreadConfig; einstellungen?: { orderBetrag: number } },
  stand: string,
): Abgeleitet {
  const orders = gebuehrenUmrechnen(ordersAusEreignissen(ereignisse), cfg.gebuehren, { spreads: cfg.spreads, orderBetrag: cfg.einstellungen?.orderBetrag ?? 1000 });
  const geschlossen = orders.filter((o) => o.status === 'geschlossen');
  const steuer = steuernBerechnen(
    geschlossen.map((o) => ({
      id: o.id,
      zeit: o.verkauf!.zeit,
      ergebnis: o.ergebnis!.netto,
      topf: o.plan.wertpapier.steuertopf,
      teilfreistellung: o.plan.wertpapier.teilfreistellung,
    })),
    cfg.steuern,
  );
  for (const o of geschlossen) Object.assign(o.ergebnis!, steuer.proFall[o.id]);

  const offen = orders.filter((o) => o.status === 'offen');
  let unrealisiert = 0;
  for (const o of offen) {
    const k = kurse[o.id];
    if (k) o.letzterKurs = k;
    if (!k || !o.kauf) continue;
    const { geld } = geldBrief(k, o.plan.wertpapier.spreadKlasse, cfg.spreads);
    const teile = (o.teilverkaeufe ?? []).reduce((a, t) => a + t.betrag, 0);
    const rest = restStueck(o);
    unrealisiert += (rest > 0 ? verkaufen(rest, geld, cfg.gebuehren, depotEntgeltOpt(o.plan)).betrag : 0) + teile - o.kauf.betrag;
  }

  const nachDatum = [...geschlossen].sort((a, b) => a.verkauf!.zeit.localeCompare(b.verkauf!.zeit));
  const kurve: Kennzahlen['kurve'] = [];
  let depot = 0;
  let etf = 0;
  for (const o of nachDatum) {
    depot += o.ergebnis!.netto;
    etf += o.etfVergleich?.netto ?? 0;
    const datum = berlin(new Date(o.verkauf!.zeit)).datum;
    const letzter = kurve[kurve.length - 1];
    if (letzter && letzter.datum === datum) Object.assign(letzter, { depot: runde(depot), etf: runde(etf) });
    else kurve.push({ datum, depot: runde(depot), etf: runde(etf) });
  }
  if (kurve.length > 0) kurve.unshift({ datum: berlin(new Date(nachDatum[0].kauf!.zeit)).datum, depot: 0, etf: 0 });

  const gewinner = geschlossen.filter((o) => o.ergebnis!.netto > 0).length;
  return {
    orders,
    positionen: {
      stand,
      offen: offen.sort((a, b) => a.verkaufstermin.localeCompare(b.verkaufstermin)),
      vorgemerkt: orders.filter((o) => o.status === 'vorgemerkt'),
    },
    abgeschlossen: { stand, orders: [...nachDatum].reverse() },
    kennzahlen: {
      stand,
      anzahlOffen: offen.length,
      anzahlGeschlossen: geschlossen.length,
      netto: runde(geschlossen.reduce((s, o) => s + o.ergebnis!.netto, 0)),
      nachSteuern: runde(geschlossen.reduce((s, o) => s + o.ergebnis!.nachSteuern, 0)),
      unrealisiert: runde(unrealisiert),
      trefferquote: geschlossen.length ? runde((gewinner / geschlossen.length) * 100, 1) : null,
      etfNetto: runde(etf),
      kurve,
    },
  };
}
