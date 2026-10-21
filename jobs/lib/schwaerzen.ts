// Schwärzt Geheimnisse in Texten, bevor sie in Logs oder die (öffentlichen) Daten geschrieben werden.
// Zwei Ebenen: (1) die tatsächlichen Werte aller Secrets aus der Umgebung, (2) typische Parameter in URLs.

export const SECRET_NAMEN = [
  'FINNHUB_API_KEY',
  'TWELVEDATA_API_KEY',
  'FMP_API_KEY',
  'ALPHAVANTAGE_API_KEY',
  'FRED_API_KEY',
  'COINGECKO_API_KEY',
  'OPENFIGI_API_KEY',
  'SEC_KONTAKT',
  'YOUTUBE_API_KEY',
  'VAPID_PRIVATE_KEY',
  'PUSH_SUBSCRIPTION',
  'ROUTINE_FIRE_URL',
  'ROUTINE_FIRE_TOKEN',
  'GH_TOKEN',
  'GITHUB_TOKEN',
];

/** Alle geheimen Werte inkl. abgeleiteter Teile (z. B. Endpoint und Schlüssel aus der Push-Anmeldung). */
export function geheimeWerte(env: Record<string, string | undefined> = process.env): string[] {
  const werte: string[] = [];
  for (const n of SECRET_NAMEN) {
    const w = env[n]?.trim();
    if (w && w.length >= 6) werte.push(w);
  }
  try {
    const sub = JSON.parse(env.PUSH_SUBSCRIPTION ?? '') as { endpoint?: string; keys?: Record<string, string> };
    if (sub.endpoint) werte.push(sub.endpoint, new URL(sub.endpoint).pathname);
    for (const k of Object.values(sub.keys ?? {})) if (k.length >= 6) werte.push(k);
  } catch {
    /* keine/ungültige Anmeldung */
  }
  try {
    if (env.ROUTINE_FIRE_URL) werte.push(new URL(env.ROUTINE_FIRE_URL).pathname);
  } catch {
    /* egal */
  }
  return werte.sort((a, b) => b.length - a.length);
}

/** In GitHub Actions: Werte für alle folgenden Log-Zeilen maskieren (öffentliche Logs bei öffentlichem Repo). */
export function logsMaskieren(env: Record<string, string | undefined> = process.env) {
  if (!env.GITHUB_ACTIONS) return;
  for (const w of geheimeWerte(env)) console.log(`::add-mask::${w}`);
}

export function schwaerzen(text: string, env: Record<string, string | undefined> = process.env): string {
  let t = text;
  for (const w of geheimeWerte(env)) t = t.split(w).join('***');
  return t
    .replace(/((?:api_?key|apikey|token|access_token|key|auth)=)[A-Za-z0-9*._~%+/-]+/gi, '$1***')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/g, '$1***')
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, 'sk-ant-***');
}
