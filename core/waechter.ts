// Entscheidungslogik des Kurswächters (rein funktional, ohne Netz): Vormerkungen ausführen,
// Ziel/Stop/Termin/Knock-out prüfen, Ereignislauf und Ausfallwarnung auslösen.
// Grundsatz: nie zu einem Kurs handeln, der zum Entscheidungszeitpunkt schon bekannt war.
import { benoetigteKursbasis, instrumentKurs, type EurUsd, type InstrumentKurs } from './bewertung.ts';
import { etfVergleich } from './etf.ts';
import { runde } from './geld.ts';
import type { GebuehrenConfig } from './gebuehren.ts';
import { berlin, inHandelszeit, istHandelstag, uhrzeitMinuten } from './kalender.ts';
import { restStueck } from './ableiten.ts';
import { pushAngepasst, pushGekauft, pushTeilverkauf, pushVerkauft, pushWarnung, type PushNachricht } from './push.ts';
import { ergebnis, kaufen, stueckFuerBetrag, summeSeiten, verkaufen, zielkurs, type Seite } from './rendite.ts';
import { geldBrief, type SpreadConfig } from './spreads.ts';
import type { Anpassung, Ausfuehrung, Ereignis, Kurs, Order, Verkaufsgrund } from './typen.ts';

/** Schlaue Verkaufsregeln (config/einstellungen.json → verkaufsregeln). Jede Regel ist einzeln abschaltbar (Feld weglassen). */
export interface Verkaufsregeln {
  /** Stop nachziehen, sobald der Geldkurs aktivAbProzent über dem Kaufkurs liegt; neuer Stop = Geldkurs − abstandProzent (nur nach oben). Hebel: eigene Werte. */
  nachziehenderStop?: { aktivAbProzent: number; abstandProzent: number; aktivAbHebelProzent?: number; abstandHebelProzent?: number };
  /** Teilverkauf, wenn beiZielAnteil des Wegs vom Kauf- zum Zielkurs geschafft ist: anteil der Stücke verkaufen, Stop auf Einstand. */
  teilverkauf?: { beiZielAnteil: number; anteil: number; mindestKurswert: number };
  /** sofort verkaufen bei starkem Gegensignal (Short-Report, Prognosesenkung, Handelsaussetzung H10/T12) */
  gegensignal?: boolean;
  /** verkaufen, wenn sich nach n Tagen kaum etwas bewegt hat (|Kurs| < bandProzent) – Kapital frei für Besseres */
  zeitAusstieg?: { nachTagen: number; spekulativNachTagen: number; bandProzent: number };
}

/** Vom Sammler erkanntes starkes Gegensignal zu einer offenen Position (daten/gegensignale.json). */
export interface Gegensignal {
  typ: string;
  /** Zeitpunkt der Meldung */
  zeit: string;
  /** wann unser Sammler sie erkannt hat – erst Kurse danach dürfen verwendet werden (kein Rückschaufehler) */
  erkannt: string;
  text: string;
}

export const istKrypto = (o: Order) => o.plan.wertpapier.anlageklasse === 'krypto';

export interface WaechterEinstellungen {
  orderBetrag: number;
  hebelMax: number;
  haltedauerMinMinuten: number;
  ereignisSchwelleProzent: number;
  ereignisLaeufeProTag: number;
  ausfallWarnungUhrzeit: string;
  /** erst ab Live-Start (Meilenstein 6) einschalten */
  ausfallWarnungAktiv?: boolean;
  risikoBudget?: { mindestKursEuro: number };
  verkaufsregeln?: Verkaufsregeln;
}

export interface WaechterKontext {
  jetzt: Date;
  orders: Order[];
  /** Kurs der Kursbasis je Order-ID (Währung der Kursbasis). Fehlt = kein Kurs verfügbar. */
  basisKurse: Record<string, Kurs>;
  /** Echter Kurs des gehandelten Instruments in EUR (z. B. gettex nach ISIN) – hat Vorrang vor der Berechnung aus der Kursbasis. */
  direktKurse?: Record<string, Kurs>;
  eurUsd?: EurUsd;
  /** Kurs des Vergleichs-ETFs in Euro (für „Schattendepot vs. ETF“) */
  etfKurs?: Kurs;
  cfg: { gebuehren: GebuehrenConfig; spreads: SpreadConfig; einstellungen: WaechterEinstellungen };
  heute: { ereignisLaeufe: number; ereignislaufOrders: string[]; ausfallWarnung: boolean; vorgemerkt: boolean };
  /** starke Gegensignale je Order-ID (vom Sammler) */
  gegensignale?: Record<string, Gegensignal>;
  /** außerhalb der Börsenzeiten (nachts/Wochenende): nur Krypto direkt handeln */
  nurKrypto?: boolean;
}

export interface WaechterErgebnis {
  ereignisse: Ereignis[];
  /** Instrumentkurs in Euro je offener Order (für kurse.json / Anzeige) */
  kurse: Record<string, Kurs>;
  ereignislauf?: { orderId: string; text: string };
  hinweise: string[];
}

const VERWERFEN_NACH_STUNDEN = 26;
/** EU-Werte haben nur Tagesschlusskurse → bis zum übernächsten Abend warten */
const VERWERFEN_NACH_STUNDEN_TAGESSCHLUSS = 64;

function seiteAus(o: Order): Seite {
  const k = o.kauf!;
  return { stueck: k.stueck, kurs: k.kurs, kurswert: k.kurswert, entgelt: k.entgelt, betrag: k.betrag };
}

function stellen(x: number): number {
  return x < 10 ? 4 : 2;
}

/** Krypto direkt: Bruchstücke (6 Nachkommastellen), sonst ganze Stücke. */
function stueckZahl(o: Order, brief: number, betrag: number): number {
  if (!istKrypto(o)) return stueckFuerBetrag(brief, betrag);
  if (!(brief > 0)) throw new Error(`Briefkurs muss positiv sein (${brief})`);
  return Math.floor((betrag / brief) * 1e6 + 1e-6) / 1e6;
}

function ausfuehrung(zeit: string, s: Seite, ik: InstrumentKurs): Ausfuehrung {
  return {
    zeit,
    stueck: s.stueck,
    kurs: s.kurs,
    kurswert: s.kurswert,
    entgelt: s.entgelt,
    betrag: s.betrag,
    kursquelle: `${ik.kurs.quelle} (${ik.kurs.zeit})`,
    synthetisch: !!ik.kurs.synthetisch || !(ik.kurs.geld && ik.kurs.brief),
  };
}

/** Krypto direkt: Trade Republic hat einen eigenen Spread – die engen Kraken-Geld/Brief-Kurse nicht verwenden. */
function spreadKurs(o: Order, k: Kurs): Kurs {
  return istKrypto(o) ? { ...k, geld: undefined, brief: undefined } : k;
}

/** Gegensignale, die eine Position der jeweiligen Richtung entwerten. */
export const GEGENSIGNALE_LONG = new Set(['shortreport', 'prognose_senkung', 'handelsstopp']);
export const GEGENSIGNALE_SHORT = new Set(['prognose_erhoehung', 'uebernahmeangebot']);

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

  /** Instrumentkurs: echter Direktkurs (falls vorhanden) mit KO-Prüfung am Basiswert, sonst aus der Kursbasis berechnet. */
  const bewerte = (o: Order, basis: Kurs | undefined, direkt: Kurs | undefined, etnSeit: Date): InstrumentKurs => {
    if (!direkt) return instrumentKurs(o.plan, basis!, ctx.eurUsd, jetzt, etnSeit);
    let knockout = direkt.wert <= 0.001;
    let hebel: number | undefined;
    let tagesProzent = direkt.vortag ? runde((direkt.wert / direkt.vortag - 1) * 100, 2) : undefined;
    if (basis) {
      try {
        const ausBasis = instrumentKurs(o.plan, basis, ctx.eurUsd, jetzt, etnSeit);
        knockout ||= ausBasis.knockout;
        tagesProzent ??= ausBasis.tagesProzent;
        if (o.plan.hebel) hebel = runde(((basis.wert / (o.plan.hebel.basiswert.kursbasis.waehrung === 'USD' ? (ctx.eurUsd ?? 1) : 1)) * o.plan.hebel.bezugsverhaeltnis) / direkt.wert, 2);
      } catch {
        /* Basis nicht verwertbar → nur Direktkurs */
      }
    }
    return { kurs: direkt, knockout, hebel, tagesProzent };
  };

  for (const o of ctx.orders) {
    if (ctx.nurKrypto && !istKrypto(o)) continue;
    // Krypto direkt wird rund um die Uhr gehandelt, alles andere nur zur Börsenzeit
    const handelbar = istKrypto(o) || offenZumHandeln;
    const direkt = ctx.direktKurse?.[o.id];
    const basis = ctx.basisKurse[o.id];
    /** maßgeblicher Kurs für Zeitprüfungen (kein Rückschaufehler) */
    const zeitKurs = direkt ?? basis;
    const hp = { handelsplatz: o.plan.wertpapier.handelsplatz };

    if (o.status === 'vorgemerkt') {
      const alterStd = (jetzt.getTime() - new Date(o.vorgemerktUm).getTime()) / 3600000;
      const neuerKurs = zeitKurs && new Date(zeitKurs.zeit) > new Date(o.vorgemerktUm);
      let tagesschluss = false;
      try {
        tagesschluss = benoetigteKursbasis(o.plan).markt === 'eu';
      } catch {
        /* ohne Kursbasis → normale Frist */
      }
      if (!neuerKurs || !handelbar) {
        if (alterStd > (tagesschluss ? VERWERFEN_NACH_STUNDEN_TAGESSCHLUSS : VERWERFEN_NACH_STUNDEN)) {
          ereignisse.push(ev('verworfen', o.id, { grund: zeitKurs ? 'kein neuer Kurs seit der Vormerkung' : 'kein Kurs verfügbar' }));
        }
        continue;
      }
      let ik;
      try {
        ik = bewerte(o, basis, direkt, jetzt);
      } catch (e) {
        hinweise.push(`${o.plan.wertpapier.name}: ${(e as Error).message}`);
        continue;
      }
      if (ik.knockout) {
        ereignisse.push(ev('verworfen', o.id, { grund: 'Knock-out-Schwelle bereits erreicht' }));
        continue;
      }
      const { brief } = geldBrief(spreadKurs(o, ik.kurs), o.plan.wertpapier.spreadKlasse, cfg.spreads);
      const mindestKurs = cfg.einstellungen.risikoBudget?.mindestKursEuro ?? 0;
      if (o.plan.wertpapier.anlageklasse === 'aktie' && brief < mindestKurs) {
        ereignisse.push(ev('verworfen', o.id, { grund: `Kurs ${brief} € unter der Mindestgrenze ${mindestKurs} € (kaum handelbar)` }));
        continue;
      }
      const stueck = stueckZahl(o, brief, cfg.einstellungen.orderBetrag);
      if (stueck === 0 || stueck * brief < 1) {
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
          kauf: ausfuehrung(iso, kauf, ik),
          zielkurs: ziel,
          stopkurs: stop,
          ...(ctx.etfKurs ? { etf: ctx.etfKurs } : {}),
        }),
      );
      continue;
    }

    if (o.status !== 'offen' || !o.kauf) continue;
    if (!zeitKurs) {
      hinweise.push(`${o.plan.wertpapier.name}: kein Kurs`);
      continue;
    }
    let ik;
    try {
      ik = bewerte(o, basis, direkt, new Date(o.kauf.zeit));
    } catch (e) {
      hinweise.push(`${o.plan.wertpapier.name}: ${(e as Error).message}`);
      continue;
    }
    kurse[o.id] = ik.kurs;
    if (new Date(zeitKurs.zeit) <= new Date(o.kauf.zeit) || !handelbar) continue;

    const regeln = cfg.einstellungen.verkaufsregeln ?? {};
    const { geld } = geldBrief(spreadKurs(o, ik.kurs), o.plan.wertpapier.spreadKlasse, cfg.spreads);
    const gehaltenMin = (jetzt.getTime() - new Date(o.kauf.zeit).getTime()) / 60000;
    const mindestErreicht = gehaltenMin >= cfg.einstellungen.haltedauerMinMinuten;
    const kursProzent = (geld / o.kauf.kurs - 1) * 100;
    const nachgezogen = o.anpassungen.some((a) => a.quelle === 'waechter' && a.feld === 'stop');
    const gegen = ctx.gegensignale?.[o.id];
    const gegenRichtung = o.plan.hebel?.richtung === 'short' ? GEGENSIGNALE_SHORT : GEGENSIGNALE_LONG;
    const gegenGilt =
      !!regeln.gegensignal &&
      !!gegen &&
      gegenRichtung.has(gegen.typ) &&
      new Date(gegen.erkannt) > new Date(o.kauf.zeit) &&
      // nur zu einem Kurs, der erst nach dem Erkennen des Signals entstanden ist
      new Date(zeitKurs.zeit) > new Date(gegen.erkannt);
    const za = regeln.zeitAusstieg;
    const zeitTage = za ? (o.plan.risikoklasse === 'spekulativ' ? za.spekulativNachTagen : za.nachTagen) : Infinity;

    let grund: Verkaufsgrund | null = null;
    if (ik.knockout) grund = 'knockout';
    else if (gegenGilt) grund = 'gegensignal';
    else if (mindestErreicht && o.stopkurs !== undefined && geld <= o.stopkurs) grund = nachgezogen ? 'nachziehstop' : 'stop';
    else if (mindestErreicht && o.zielkurs !== undefined && geld >= o.zielkurs) grund = 'ziel';
    else if (mindestErreicht && jetzt >= new Date(o.verkaufstermin)) grund = 'termin';
    else if (za && gehaltenMin >= zeitTage * 1440 && Math.abs(kursProzent) < za.bandProzent) grund = 'zeit';

    if (grund) {
      const vkKurs = grund === 'knockout' ? 0 : geld;
      const vk = verkaufen(restStueck(o), vkKurs, cfg.gebuehren, hp);
      const teile = (o.teilverkaeufe ?? []).map((t): Seite => ({ stueck: t.stueck, kurs: t.kurs, kurswert: t.kurswert, entgelt: t.entgelt, betrag: t.betrag }));
      ereignisse.push(
        ev(
          'verkauft',
          o.id,
          {
            verkauf: { ...ausfuehrung(iso, vk, ik), grund },
            ergebnis: ergebnis(seiteAus(o), teile.length ? summeSeiten([...teile, vk]) : vk),
            ...(grund === 'gegensignal' ? { gegensignal: gegen } : {}),
          },
          grund === 'gegensignal' ? `Gegensignal: ${gegen!.text}`.slice(0, 300) : undefined,
        ),
      );
      if (o.etfKauf && ctx.etfKurs) {
        const v = etfVergleich(o.etfKauf, ctx.etfKurs, cfg, cfg.einstellungen.orderBetrag);
        if (v) ereignisse.push(ev('etfVergleich', o.id, { ...v, etfKauf: o.etfKauf.wert, etfVerkauf: ctx.etfKurs.wert }));
      }
      continue;
    }

    // Kein Verkauf: Teilverkauf am 1. Ziel und Stop nachziehen (nur nach der Mindesthaltedauer)
    let neuerStop = o.stopkurs;
    const begruendung: string[] = [];
    const tv = regeln.teilverkauf;
    if (mindestErreicht && tv && !o.teilverkaeufe?.length && o.zielkurs !== undefined && o.zielkurs > o.kauf.kurs) {
      const erstesZiel = o.kauf.kurs + tv.beiZielAnteil * (o.zielkurs - o.kauf.kurs);
      const rest = restStueck(o);
      const teil = istKrypto(o) ? Math.floor(rest * tv.anteil * 1e6) / 1e6 : Math.floor(rest * tv.anteil);
      if (geld >= erstesZiel && teil > 0 && rest - teil > 0 && teil * geld >= tv.mindestKurswert) {
        const vk = verkaufen(teil, geld, cfg.gebuehren, hp);
        ereignisse.push(ev('teilverkauft', o.id, { verkauf: { ...ausfuehrung(iso, vk, ik), grund: 'teilziel' } }));
        const einstand = runde(o.kauf.kurs, stellen(o.kauf.kurs));
        if (neuerStop === undefined || einstand > neuerStop) {
          neuerStop = einstand;
          begruendung.push(`Teilverkauf ${teil} Stk. am 1. Ziel, Stop auf Einstand`);
        }
      }
    }
    const ns = regeln.nachziehenderStop;
    if (mindestErreicht && ns) {
      const hebel = o.plan.wertpapier.anlageklasse === 'hebel';
      const aktivAb = hebel ? (ns.aktivAbHebelProzent ?? ns.aktivAbProzent) : ns.aktivAbProzent;
      const abstand = hebel ? (ns.abstandHebelProzent ?? ns.abstandProzent) : ns.abstandProzent;
      if (kursProzent >= aktivAb) {
        const kandidat = runde(geld * (1 - abstand / 100), stellen(geld));
        // nur spürbare Schritte (≥ 0,5 %), damit das Protokoll nicht alle 15 Minuten wächst
        if (neuerStop === undefined || kandidat > neuerStop * 1.005) {
          neuerStop = kandidat;
          begruendung.push(`Nachziehender Stop: ${abstand} % unter Geldkurs ${geld} € (+${runde(kursProzent, 1)} %)`);
        }
      }
    }
    if (neuerStop !== o.stopkurs && neuerStop !== undefined && begruendung.length) {
      const anpassung: Anpassung = { zeit: iso, quelle: 'waechter', feld: 'stop', alt: o.stopkurs ?? '', neu: neuerStop, begruendung: begruendung.join('; ') };
      ereignisse.push(ev('angepasst', o.id, { anpassung }, anpassung.begruendung));
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
    !ctx.nurKrypto &&
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
    else if (e.typ === 'teilverkauft' && o) pushes.push(pushTeilverkauf(o, (e.daten as { verkauf: Ausfuehrung }).verkauf));
    // automatisch nachgezogene Stops ohne Push (sonst alle 15 Minuten eine Nachricht); der Verkauf meldet sich
    else if (e.typ === 'angepasst' && o && e.quelle !== 'waechter') pushes.push(pushAngepasst(o, (e.daten as { anpassung: Order['anpassungen'][0] }).anpassung));
    else if (e.typ === 'verworfen' && o) pushes.push(pushWarnung(`${o.plan.wertpapier.name} nicht gekauft: ${(e.daten as { grund: string }).grund}`, e.zeit, `#/order/${o.id}`));
    else if (e.typ === 'warnung') pushes.push(pushWarnung(String((e.daten as { text: string }).text), e.zeit));
  }
  return pushes;
}
