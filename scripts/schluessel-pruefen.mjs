// Prüft, ob optionale API-Schlüssel gesetzt sind und angenommen werden – ohne Schlüssel oder Kurse ins Log zu schreiben.
// Aufruf (in Actions): node scripts/schluessel-pruefen.mjs
const ergebnis = [];

async function coingecko() {
  const key = process.env.COINGECKO_API_KEY?.trim();
  if (!key) return 'COINGECKO_API_KEY: nicht gesetzt';
  // eigene Adresse je Abfrage: Ein Zwischenspeicher könnte sonst die Antwort der ersten Abfrage für die zweite liefern
  const url = (n) => `https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=eur&probe=${Date.now()}-${n}`;
  const mit = await fetch(url(1), { headers: { 'x-cg-demo-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const daten = await mit.json().catch(() => null);
  const kurs = typeof daten?.bitcoin?.eur === 'number';
  // Gegenprobe: ein falscher Schlüssel muss abgelehnt werden – sonst prüft der Test nichts
  const falsch = await fetch(url(2), { headers: { 'x-cg-demo-api-key': 'CG-falsch-0000', accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const ok = mit.status === 200 && kurs && falsch.status !== 200;
  return `COINGECKO_API_KEY: ${ok ? 'OK' : 'FEHLER'} (mit Schlüssel HTTP ${mit.status}, Kurs erhalten: ${kurs ? 'ja' : 'nein'}; Gegenprobe mit falschem Schlüssel HTTP ${falsch.status})`;
}

for (const pruefung of [coingecko]) {
  try {
    ergebnis.push(await pruefung());
  } catch (e) {
    ergebnis.push(`${pruefung.name}: Abruf gescheitert (${e.message.slice(0, 80)})`);
  }
}
console.log(ergebnis.join('\n'));
if (ergebnis.some((z) => z.includes('FEHLER'))) process.exitCode = 1;
