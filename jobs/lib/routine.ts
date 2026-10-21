// Löst den Ereignislauf der Claude-Routine über ihren API-Trigger aus (/fire). Kein Anthropic-API-Schlüssel:
// URL und per-Routine-Token kommen aus den Secrets ROUTINE_FIRE_URL / ROUTINE_FIRE_TOKEN.
import { pushWarnung, type PushNachricht } from '../../core/push.ts';
import { leseJson, schreibeJson } from './dateien.ts';
import { schwaerzen } from './schwaerzen.ts';

export interface OffenesEreignis {
  zeit: string;
  orderId: string;
  text: string;
}

/**
 * Ereignis behandeln: Ereignislauf per /fire starten (falls Token hinterlegt), sonst für den nächsten
 * Morgen-/Abendlauf vormerken (offene-ereignisse.json). In beiden Fällen sofort ein Push an Peer.
 */
export async function ereignisBehandeln(orderId: string, name: string, kurz: string, text: string, jetzt: Date): Promise<PushNachricht> {
  const f = await feuereEreignislauf(text);
  console.log(`Ereignislauf ${name}: ${f.ok ? 'gestartet' : `vorgemerkt (${f.info})`}`);
  if (!f.ok) {
    const offen = leseJson<OffenesEreignis[]>('offene-ereignisse.json', []);
    schreibeJson('offene-ereignisse.json', [...offen, { zeit: jetzt.toISOString(), orderId, text }].slice(-20));
  }
  return pushWarnung(`${name}: ${kurz} – ${f.ok ? 'Claude prüft die Position jetzt' : 'wird im nächsten Claude-Lauf geprüft'}`, jetzt.toISOString(), `#/order/${orderId}`);
}

export async function feuereEreignislauf(text: string): Promise<{ ok: boolean; info: string }> {
  const url = process.env.ROUTINE_FIRE_URL?.trim();
  const token = process.env.ROUTINE_FIRE_TOKEN?.trim();
  if (!url || !token) return { ok: false, info: 'ROUTINE_FIRE_URL/ROUTINE_FIRE_TOKEN fehlen – Ereignislauf übersprungen' };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.slice(0, 60000) }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.text();
    if (!res.ok) return { ok: false, info: schwaerzen(`HTTP ${res.status}: ${body.slice(0, 200)}`) };
    JSON.parse(body);
    return { ok: true, info: 'gestartet' };
  } catch (e) {
    return { ok: false, info: schwaerzen((e as Error).message) };
  }
}
