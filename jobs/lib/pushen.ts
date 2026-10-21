// Web-Push aus GitHub Actions. VAPID-Private-Key und Push-Anmeldung kommen nur aus Secrets (Umgebungsvariablen).
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { zustellen, type PushNachricht } from '../../core/push.ts';
import { ladeConfig, leseJson, schreibeJson } from './dateien.ts';
import { logsMaskieren, schwaerzen } from './schwaerzen.ts';

logsMaskieren();

interface PushStatus {
  stand?: string;
  pushAbgelaufen?: boolean;
  letzterPush?: string;
  pushAnmeldungHash?: string;
  [k: string]: unknown;
}

function anmeldung(): webpush.PushSubscription | null {
  const roh = process.env.PUSH_SUBSCRIPTION?.trim();
  if (!roh) return null;
  try {
    return JSON.parse(roh) as webpush.PushSubscription;
  } catch {
    console.error('PUSH_SUBSCRIPTION ist kein gültiges JSON');
    return null;
  }
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
  const sub = anmeldung();
  const system = leseJson<PushStatus>('system.json', {});
  let schlange = leseJson<PushNachricht[]>('push-warteschlange.json', []);

  // Neue/geänderte Anmeldung erkennen → einmalige Bestätigung.
  if (sub) {
    const hash = createHash('sha256').update(sub.endpoint).digest('hex').slice(0, 16);
    if (system.pushAnmeldungHash !== hash) {
      neu = [{ typ: 'warnung', titel: '✅ Push verbunden', text: 'Schattendepot kann dir jetzt Mitteilungen schicken.', ziel: '#/einstellungen', tag: 'push-verbunden', erstellt: jetzt.toISOString() }, ...neu];
      system.pushAnmeldungHash = hash;
      system.pushAbgelaufen = false;
      opt = { ...opt, sofort: true };
    }
  }

  const z = opt.sofort ? { senden: [...schlange, ...neu], warteschlange: [] } : zustellen(neu, schlange, jetzt, einstellungen);
  schlange = z.warteschlange;
  let gesendet = 0;
  if (z.senden.length && !sub) {
    console.log(`Keine Push-Anmeldung (PUSH_SUBSCRIPTION) – ${z.senden.length} Nachricht(en) nur protokolliert.`);
  } else if (sub) {
    for (const n of z.senden) {
      const r = await sendeEine(sub, n);
      if (r === 'ok') gesendet++;
      if (r === 'abgelaufen') {
        system.pushAbgelaufen = true;
        break;
      }
    }
  }
  if (gesendet) system.letzterPush = jetzt.toISOString();

  const protokoll = leseJson<(PushNachricht & { gesendet: boolean })[]>('pushes.json', []);
  protokoll.unshift(...z.senden.map((n) => ({ ...n, gesendet: !!sub && !system.pushAbgelaufen })));
  schreibeJson('pushes.json', protokoll.slice(0, 100));
  schreibeJson('push-warteschlange.json', schlange);
  schreibeJson('system.json', system);
  return gesendet;
}
