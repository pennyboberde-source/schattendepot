// Web-Push-Anmeldung im Browser. Ohne Server: Die App zeigt den „Push-Code“ (Subscription-JSON),
// Der Nutzer hinterlegt ihn als GitHub-Secret: iPad PUSH_SUBSCRIPTION, iPhone PUSH_SUBSCRIPTION_2 (weiteres Gerät _3).
import pushCfg from '../../config/push.json';

export function pushMoeglich(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** Auf iPad/iPhone gibt es Web Push nur für Apps auf dem Home-Bildschirm. */
export function istStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

function schluesselBytes(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const roh = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
}

export async function aktuelleAnmeldung(): Promise<PushSubscription | null> {
  if (!pushMoeglich()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Fragt die Erlaubnis ab (nur nach Tipp!) und meldet an. `neu` erzwingt eine frische Anmeldung. */
export async function pushAnmelden(neu = false): Promise<string> {
  if (!pushMoeglich()) throw new Error('Dieses Gerät/dieser Browser unterstützt keine Web-Push-Mitteilungen.');
  const erlaubnis = await Notification.requestPermission();
  if (erlaubnis !== 'granted') throw new Error('Mitteilungen wurden nicht erlaubt. Ändern kannst du das unter Einstellungen → Mitteilungen → Schattendepot.');
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && neu) {
    await sub.unsubscribe();
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: schluesselBytes(pushCfg.vapidPublicKey) as BufferSource });
  return JSON.stringify(sub.toJSON());
}

/** Push-Secrets je Gerät (die Jobs lesen alle drei). */
export const PUSH_GERAETE = [
  { secret: 'PUSH_SUBSCRIPTION', name: 'iPad' },
  { secret: 'PUSH_SUBSCRIPTION_2', name: 'iPhone' },
  { secret: 'PUSH_SUBSCRIPTION_3', name: 'weiteres Gerät' },
] as const;

/** Vorschlag, welches Secret zu diesem Gerät gehört: iPhone → PUSH_SUBSCRIPTION_2, sonst (iPad) PUSH_SUBSCRIPTION. */
export function secretFuerDiesesGeraet(): (typeof PUSH_GERAETE)[number]['secret'] {
  return /iPhone|iPod|Android.*Mobile/.test(navigator.userAgent) ? 'PUSH_SUBSCRIPTION_2' : 'PUSH_SUBSCRIPTION';
}
