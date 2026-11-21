// Web-Push aus GitHub Actions. VAPID-Private-Key und Push-Anmeldung kommen nur aus Secrets (Umgebungsvariablen).
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { zustellen, type PushNachricht } from '../../core/push.ts';
import { ladeConfig, leseJson, schreibeJson } from './dateien.ts';
import { logsMaskieren, PUSH_NAMEN, schwaerzen } from './schwaerzen.ts';

logsMaskieren();

interface PushStatus {
  stand?: string;
  /** mindestens ein Gerät meldet eine abgelaufene Anmeldung */
  pushAbgelaufen?: boolean;
  letzterPush?: string;
  /** Hash der ersten Anmeldung (alt, bleibt für die Anzeige) */
  pushAnmeldungHash?: string;
  /** je Gerät (Secret-Name → Kurz-Hash, Ablauf, letzter Push); seit 21.11.2026 mehrere Geräte (iPad + iPhone) */
  pushGeraete?: Record<string, { hash: string; abgelaufen?: boolean; letzterPush?: string }>;
  [k: string]: unknown;
}

interface Geraet {
  /** Name des Secrets, z. B. PUSH_SUBSCRIPTION_2 (für Status und Log, nie der Inhalt) */
  name: string;
  sub: webpush.PushSubscription;
  hash: string;
}

/** Alle Push-Anmeldungen aus den Secrets PUSH_SUBSCRIPTION, PUSH_SUBSCRIPTION_2, … (je Gerät eine; ein Secret darf auch eine Liste enthalten). */
function anmeldungen(): Geraet[] {
  const geraete: Geraet[] = [];
  const gesehen = new Set<string>();
  for (const name of PUSH_NAMEN) {
    const roh = process.env[name]?.trim();
    if (!roh) continue;
    let liste: webpush.PushSubscription[];
    try {
      const j = JSON.parse(roh) as webpush.PushSubscription | webpush.PushSubscription[];
      liste = Array.isArray(j) ? j : [j];
    } catch {
      console.error(`${name} ist kein gültiges JSON`);
      continue;
    }
    liste.forEach((sub, i) => {
      if (!sub?.endpoint) return;
      const hash = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 16);
      if (gesehen.has(hash)) return;
      gesehen.add(hash);
      geraete.push({ name: liste.length > 1 ? `${name}#${i + 1}` : name, sub, hash });
    });
  }
  return geraete;
}

async function sendeEine(sub: webpush.PushSubscription, n: PushNachricht): Promise<'ok' | 'abgelaufen' | 'fehler'> {
  const cfg = ladeConfig().push;
  const privat = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!privat) {
    console.error('VAPID_PRIVATE_KEY fehlt');
    return 'fehler';
  }
  try {
    await webpush.sendNotification(sub, JSON.stringify({ titel: n.titel, text: n.text, ziel: n.ziel, tag: n.tag }), {
      vapidDetails: { subject: cfg.vapidSubject, publicKey: cfg.vapidPublicKey, privateKey: privat },
      TTL: 6 * 3600,
      urgency: n.typ === 'warnung' || n.typ === 'stop' || n.typ === 'knockout' ? 'high' : 'normal',
    });
    return 'ok';
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    console.error(schwaerzen(`Push fehlgeschlagen (${status ?? '?'}): ${(e as Error).message}`));
    return status === 404 || status === 410 ? 'abgelaufen' : 'fehler';
  }
}

/**
 * Stellt Nachrichten zu (Ruhezeit/Typ-Filter aus config/einstellungen.json), pflegt die Warteschlange
 * (push-warteschlange.json), das Protokoll (pushes.json) und den Status in system.json.
 * `sofort` umgeht Ruhezeit und Filter (Test-Push).
 */
export async function pushen(neu: PushNachricht[], jetzt: Date, opt: { sofort?: boolean } = {}): Promise<number> {
  const { einstellungen } = ladeConfig();
  const geraete = anmeldungen();
  const system = leseJson<PushStatus>('system.json', {});
  let schlange = leseJson<PushNachricht[]>('push-warteschlange.json', []);
  const status = { ...(system.pushGeraete ?? {}) };
  // Übergang: die bisher einzige Anmeldung ist schon bestätigt
  if (system.pushAnmeldungHash && !Object.keys(status).length) status.PUSH_SUBSCRIPTION = { hash: system.pushAnmeldungHash, abgelaufen: system.pushAbgelaufen };

  // Neue/geänderte Anmeldung je Gerät → einmalige Bestätigung nur an dieses Gerät
  for (const g of geraete) {
    if (status[g.name]?.hash === g.hash) continue;
    status[g.name] = { hash: g.hash };
    const r = await sendeEine(g.sub, { typ: 'warnung', titel: '✅ Push verbunden', text: 'Schattendepot kann diesem Gerät jetzt Mitteilungen schicken.', ziel: '#/einstellungen', tag: 'push-verbunden', erstellt: jetzt.toISOString() });
    if (r === 'abgelaufen') status[g.name].abgelaufen = true;
    if (r === 'ok') status[g.name].letzterPush = jetzt.toISOString();
    console.log(`Push-Anmeldung ${g.name} neu verbunden (${r}).`);
  }
  // Geräte, deren Secret entfernt wurde, vergessen
  for (const n of Object.keys(status)) if (!geraete.some((g) => g.name === n)) delete status[n];

  const z = opt.sofort ? { senden: [...schlange, ...neu], warteschlange: [] } : zustellen(neu, schlange, jetzt, einstellungen);
  schlange = z.warteschlange;
  const aktiv = geraete.filter((g) => !status[g.name]?.abgelaufen);
  let gesendet = 0;
  const zugestellt = new Set<PushNachricht>();
  if (z.senden.length && !geraete.length) {
    console.log(`Keine Push-Anmeldung (${PUSH_NAMEN.join(', ')}) – ${z.senden.length} Nachricht(en) nur protokolliert.`);
  }
  for (const g of aktiv) {
    for (const n of z.senden) {
      const r = await sendeEine(g.sub, n);
      if (r === 'ok') {
        zugestellt.add(n);
        status[g.name].letzterPush = jetzt.toISOString();
      }
      if (r === 'abgelaufen') {
        status[g.name].abgelaufen = true;
        console.error(`Push-Anmeldung ${g.name} ist abgelaufen – in der App neu verbinden.`);
        break;
      }
    }
  }
  gesendet = zugestellt.size;
  if (gesendet) system.letzterPush = jetzt.toISOString();
  system.pushGeraete = status;
  system.pushAbgelaufen = Object.values(status).some((g) => g.abgelaufen);
  if (geraete[0]) system.pushAnmeldungHash = status[geraete[0].name]?.hash ?? system.pushAnmeldungHash;

  const protokoll = leseJson<(PushNachricht & { gesendet: boolean })[]>('pushes.json', []);
  protokoll.unshift(...z.senden.map((n) => ({ ...n, gesendet: zugestellt.has(n) })));
  schreibeJson('pushes.json', protokoll.slice(0, 100));
  schreibeJson('push-warteschlange.json', schlange);
  schreibeJson('system.json', system);
  return gesendet;
}
