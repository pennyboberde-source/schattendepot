// Entscheidungslogik des Kurswächters (rein funktional, ohne Netz): Vormerkungen ausführen,
// Ziel/Stop/Termin/Knock-out prüfen, Ereignislauf und Ausfallwarnung auslösen.
// Grundsatz: nie zu einem Kurs handeln, der zum Entscheidungszeitpunkt schon bekannt war.
import { instrumentKurs, type EurUsd } from './bewertung.ts';
import { etfVergleich } from './etf.ts';
import { runde } from './geld.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import { berlin, inHandelszeit, istHandelstag, uhrzeitMinuten } from './kalender.ts';
import { pushAngepasst, pushGekauft, pushVerkauft, pushWarnung, type PushNachricht } from './push.ts';
import { ergebnis, kaufen, stueckFuerBetrag, verkaufen, zielkurs, type Seite } from './rendite.ts';
import { geldBrief, type SpreadConfig } from './spreads.ts';
import type { Ereignis, Kurs, Order, Verkaufsgrund } from './typen.ts';

export interface WaechterEinstellungen {
  orderBetrag: number;
  hebelMax: number;
  haltedauerMinMinuten: number;
  ereignisSchwelleProzent: number;
  ereignisLaeufeProTag: number;
  ausfallWarnungUhrzeit: string;
  /** erst ab Live-Start (Meilenstein 6) einschalten */
  ausfallWarnungAktiv?: boolean;
}

export interface WaechterKontext {
  jetzt: Date;
  orders: Order[];
  /** Kurs der Kursbasis je Order-ID (Währung der Kursbasis). Fehlt = kein Kurs verfügbar. */
  basisKurse: Record<string, Kurs>;
  eurUsd?: EurUsd;
  /** Kurs des Vergleichs-ETFs in Euro (für „Schattendepot vs. ETF“) */
  etfKurs?: Kurs;
  cfg: { gebuehren: GebuehrenConfig; spreads: SpreadConfig; einstellungen: WaechterEinstellungen };
  heute: { ereignisLaeufe: number; ereignislaufOrders: string[]; ausfallWarnung: boolean; vorgemerkt: boolean };
}

export interface WaechterErgebnis {
  ereignisse: Ereignis[];
  /** Instrumentkurs in Euro je offener Order (für kurse.json / Anzeige) */
  kurse: Record<string, Kurs>;
  ereignislauf?: { orderId: string; text: string };
  hinweise: string[];
}

const VERWERFEN_NACH_STUNDEN = 26;

function seiteAus(o: Order): Seite {
  const k = o.kauf!;
  return { stueck: k.stueck, kurs: k.kurs, kurswert: k.kurswert, entgelt: k.entgelt, betrag: k.betrag };
}

function stellen(x: number): number {
  return x < 10 ? 4 : 2;
}

export function waechterLauf(ctx: WaechterKontext): WaechterErgebnis {
  const { jetzt, cfg } = ctx;
  const iso = jetzt.toISOString();
  const ereignisse: Ereignis[] = [];
  const kurse: Record<string, Kurs> = {};
  const hinweise: string[] = [];
  let ereignislauf: WaechterErgebnis['ereignislauf'];
  const offenZumHandeln = inHandelszeit(jetzt);
  const ev = (typ: Ereignis['typ'], orderId: string | undefined, daten: Record<string, unknown>, begruendung?: string): Ereignis => ({
    id: `${iso}-${typ}${orderId ? `-${orderId}` : ''}`,
    zeit: iso,
    typ,
    quelle: 'waechter',
    orderId,
    daten,
    begruendung,
  });

  for (const o of ctx.orders) {
    const basis = ctx.basisKurse[o.id];
    const hp = { handelsplatz: o.plan.wertpapier.handelsplatz };

    if (o.status === 'vorgemerkt') {
      const alterStd = (jetzt.getTime() - new Date(o.vorgemerktUm).getTime()) / 3600000;
      const neuerKurs = basis && new Date(basis.zeit) > new Date(o.vorgemerktUm);
      if (!neuerKurs || !offenZumHandeln) {
        if (alterStd > VERWERFEN_NACH_STUNDEN) {
          ereignisse.push(ev('verworfen', o.id, { grund: basis ? 'kein neuer Kurs seit der Vormerkung' : 'kein Kurs verfügbar' }));
        }
        continue;
      }
      let ik;
      try {
        ik = instrumentKurs(o.plan, basis, ctx.eurUsd, jetzt, jetzt);
      } catch (e) {
        hinweise.push(`${o.plan.wertpapier.name}: ${(e as Error).message}`);
        continue;
      }
      if (ik.knockout) {
        ereignisse.push(ev('verworfen', o.id, { grund: 'Knock-out-Schwelle bereits erreicht' }));
        continue;
      }
      const { brief } = geldBrief(ik.kurs, o.plan.wertpapier.spreadKlasse, cfg.spreads);
      const stueck = stueckFuerBetrag(brief, cfg.einstellungen.orderBetrag);
      if (stueck === 0) {
        ereignisse.push(ev('verworfen', o.id, { grund: `Ein Stück kostet ${brief} € und damit mehr als ${cfg.einstellungen.orderBetrag} €` }));
        continue;
      }
      if (ik.hebel !== undefined && ik.hebel > cfg.einstellungen.hebelMax) {
        ereignisse.push(ev('verworfen', o.id, { grund: `Hebel ${ik.hebel} über dem Limit ${cfg.einstellungen.hebelMax}` }));
        continue;
      }
      const kauf = kaufen(stueck, brief, cfg.gebuehren, hp);
      const ziel = zielkurs(kauf, o.plan.zielNettoProzent, cfg.gebuehren, hp);
      const stop = runde(brief * (1 + o.plan.stopProzent / 100), stellen(brief));
      ereignisse.push(
        ev('gekauft', o.id, {
          kauf: {
            zeit: iso,
            stueck,
            kurs: brief,
            kurswert: kauf.kurswert,
            entgelt: kauf.entgelt,
            betrag: kauf.betrag,
            kursquelle: `${ik.kurs.quelle} (${ik.kurs.zeit})`,
            synthetisch: !!ik.kurs.synthetisch || !(ik.kurs.geld && ik.kurs.brief),
          },
          zielkurs: ziel,
          stopkurs: stop,
          ...(ctx.etfKurs ? { etf: ctx.etfKurs } : {}),
        }),
      );
      continue;
    }

    if (o.status !== 'offen' || !o.kauf) continue;
    if (!basis) {
      hinweise.push(`${o.plan.wertpapier.name}: kein Kurs`);
      continue;
    }
    let ik;
    try {
      ik = instrumentKurs(o.plan, basis, ctx.eurUsd, jetzt, new Date(o.kauf.zeit));
    } catch (e) {
      hinweise.push(`${o.plan.wertpapier.name}: ${(e as Error).message}`);
      continue;
    }
    kurse[o.id] = ik.kurs;
    if (new Date(basis.zeit) <= new Date(o.kauf.zeit) || !offenZumHandeln) continue;

    const { geld } = geldBrief(ik.kurs, o.plan.wertpapier.spreadKlasse, cfg.spreads);
    const gehaltenMin = (jetzt.getTime() - new Date(o.kauf.zeit).getTime()) / 60000;
    const mindestErreicht = gehaltenMin >= cfg.einstellungen.haltedauerMinMinuten;
    let grund: Verkaufsgrund | null = null;
    if (ik.knockout) grund = 'knockout';
    else if (mindestErreicht && o.stopkurs !== undefined && geld <= o.stopkurs) grund = 'stop';
    else if (mindestErreicht && o.zielkurs !== undefined && geld >= o.zielkurs) grund = 'ziel';
    else if (mindestErreicht && jetzt >= new Date(o.verkaufstermin)) grund = 'termin';

    if (grund) {
      const vkKurs = grund === 'knockout' ? 0 : geld;
      const vk = verkaufen(o.kauf.stueck, vkKurs, cfg.gebuehren, hp);
      ereignisse.push(
        ev('verkauft', o.id, {
          verkauf: {
            zeit: iso,
            stueck: vk.stueck,
            kurs: vkKurs,
            kurswert: vk.kurswert,
            entgelt: vk.entgelt,
            betrag: vk.betrag,
            kursquelle: `${ik.kurs.quelle} (${ik.kurs.zeit})`,
            synthetisch: !!ik.kurs.synthetisch || !(ik.kurs.geld && ik.kurs.brief),
            grund,
          },
          ergebnis: ergebnis(seiteAus(o), vk),
        }),
      );
      if (o.etfKauf && ctx.etfKurs) {
        const v = etfVergleich(o.etfKauf, ctx.etfKurs, cfg, cfg.einstellungen.orderBetrag);
        if (v) ereignisse.push(ev('etfVergleich', o.id, { ...v, etfKauf: o.etfKauf.wert, etfVerkauf: ctx.etfKurs.wert }));
      }
      continue;
    }

    const schwelle = cfg.einstellungen.ereignisSchwelleProzent;
    if (
      !ereignislauf &&
      ik.tagesProzent !== undefined &&
      Math.abs(ik.tagesProzent) >= schwelle &&
      ctx.heute.ereignisLaeufe < cfg.einstellungen.ereignisLaeufeProTag &&
      !ctx.heute.ereignislaufOrders.includes(o.id)
    ) {
      ereignislauf = {
        orderId: o.id,
        text: `Kursausschlag ${ik.tagesProzent > 0 ? '+' : ''}${ik.tagesProzent} % heute bei offener Position ${o.plan.wertpapier.name} (Order ${o.id}). Aktueller Kurs ${ik.kurs.wert} € (${ik.kurs.quelle}, ${ik.kurs.zeit}); Ziel ${o.zielkurs} €, Stop ${o.stopkurs} €, Verkaufstermin ${o.verkaufstermin}.`,
      };
      ereignisse.push(ev('ereignislauf', o.id, { anlass: 'kursausschlag', tagesProzent: ik.tagesProzent }));
    }
  }

  const b = berlin(jetzt);
  if (
    cfg.einstellungen.ausfallWarnungAktiv !== false &&
    istHandelstag(b.datum) &&
    b.minuten >= uhrzeitMinuten(cfg.einstellungen.ausfallWarnungUhrzeit) &&
    !ctx.heute.vorgemerkt &&
    !ctx.heute.ausfallWarnung
  ) {
    ereignisse.push(ev('warnung', undefined, { art: 'ausfall', text: 'Morgenlauf ausgefallen – heute noch keine Order' }));
  }

  return { ereignisse, kurse, ereignislauf, hinweise };
}

/** Push-Nachrichten zu neuen Ereignissen; `orders` = Zustand nach Anwendung der Ereignisse. */
export function pushesFuerEreignisse(neu: Ereignis[], orders: Order[], kalibriert?: (konfidenz: number) => { quote: number; faelle: number } | undefined): PushNachricht[] {
  const nachId = new Map(orders.map((o) => [o.id, o]));
  const pushes: PushNachricht[] = [];
  for (const e of neu) {
    const o = e.orderId ? nachId.get(e.orderId) : undefined;
    if (e.typ === 'gekauft' && o) pushes.push(pushGekauft(o, e.zeit, kalibriert?.(o.plan.konfidenz)));
    else if (e.typ === 'verkauft' && o) pushes.push(pushVerkauft(o, e.zeit));
    else if (e.typ === 'angepasst' && o) pushes.push(pushAngepasst(o, (e.daten as { anpassung: Order['anpassungen'][0] }).anpassung));
    else if (e.typ === 'verworfen' && o) pushes.push(pushWarnung(`${o.plan.wertpapier.name} nicht gekauft: ${(e.daten as { grund: string }).grund}`, e.zeit, `#/order/${o.id}`));
    else if (e.typ === 'warnung') pushes.push(pushWarnung(String((e.daten as { text: string }).text), e.zeit));
  }
  return pushes;
}
