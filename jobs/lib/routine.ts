// Löst den Ereignislauf der Claude-Routine über ihren API-Trigger aus (/fire). Kein Anthropic-API-Schlüssel:
// URL und per-Routine-Token kommen aus den Secrets ROUTINE_FIRE_URL / ROUTINE_FIRE_TOKEN.

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
    if (!res.ok) return { ok: false, info: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    const j = JSON.parse(body) as { claude_code_session_url?: string };
    return { ok: true, info: j.claude_code_session_url ?? 'gestartet' };
  } catch (e) {
    return { ok: false, info: (e as Error).message };
  }
}
