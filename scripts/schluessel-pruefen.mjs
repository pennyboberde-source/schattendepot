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
  // Verlauf des Börsenwerts (für den Rückblick): nur die Zahl der Tage ins Log
  const verlauf = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=365&interval=daily', { headers: { 'x-cg-demo-api-key': key, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
  const tage = ((await verlauf.json().catch(() => null))?.market_caps ?? []).length;
  const ok = mit.status === 200 && kurs && falsch.status !== 200 && verlauf.status === 200 && tage >= 300;
  return `COINGECKO_API_KEY: ${ok ? 'OK' : 'FEHLER'} (mit Schlüssel HTTP ${mit.status}, Kurs erhalten: ${kurs ? 'ja' : 'nein'}; Gegenprobe mit falschem Schlüssel HTTP ${falsch.status}; Verlauf Börsenwert HTTP ${verlauf.status}, ${tage} Tage)`;
}

// Zahlen-Termine der Vergangenheit (Merkmal „Zahlen“ im Rückblick): Wie weit zurück liefern Finnhub und FMP den
// Kalender? Ins Log nur Zahl der Einträge, Spanne der Daten und ob die Tageszeit (vor/nach Börse) dabei ist.
const tagVor = (monate, plus = 0) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - monate);
  d.setUTCDate(d.getUTCDate() + plus);
  return d.toISOString().slice(0, 10);
};
const kurzListe = (l, feldDatum) => {
  const d = l.map((x) => x[feldDatum]).filter(Boolean).sort();
  return `${l.length} Einträge${d.length ? `, ${d[0]} bis ${d[d.length - 1]}` : ''}`;
};
async function zahlenFinnhub() {
  const key = process.env.FINNHUB_API_KEY?.trim();
  if (!key) return 'Zahlen Finnhub: FINNHUB_API_KEY nicht gesetzt';
  const teile = [];
  for (const m of [1, 6, 12, 23]) {
    const r = await fetch(`https://finnhub.io/api/v1/calendar/earnings?from=${tagVor(m)}&to=${tagVor(m, 6)}&token=${key}`, { signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => null);
    const l = j?.earningsCalendar ?? [];
    teile.push(`vor ${m} Mon.: HTTP ${r.status}, ${kurzListe(l, 'date')}, Tageszeit bei ${l.filter((x) => x.hour).length}`);
  }
  return `Zahlen Finnhub (je 7 Tage): ${teile.join(' | ')}`;
}
async function zahlenFmp() {
  const key = process.env.FMP_API_KEY?.trim();
  if (!key) return 'Zahlen FMP: FMP_API_KEY nicht gesetzt';
  const teile = [];
  for (const m of [1, 6, 12, 23]) {
    const r = await fetch(`https://financialmodelingprep.com/stable/earnings-calendar?from=${tagVor(m)}&to=${tagVor(m, 6)}&apikey=${key}`, { signal: AbortSignal.timeout(30000) });
    const j = await r.json().catch(() => null);
    const l = Array.isArray(j) ? j : [];
    teile.push(`vor ${m} Mon.: HTTP ${r.status}, ${kurzListe(l, 'date')}${l.length ? '' : ` (${String(j?.['Error Message'] ?? j?.message ?? '').slice(0, 60)})`}`);
  }
  // längere Spanne in einem Abruf (90 Tage)?
  const r = await fetch(`https://financialmodelingprep.com/stable/earnings-calendar?from=${tagVor(23)}&to=${tagVor(20)}&apikey=${key}`, { signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  teile.push(`90 Tage auf einmal: HTTP ${r.status}, ${kurzListe(Array.isArray(j) ? j : [], 'date')}`);
  return `Zahlen FMP (je 7 Tage): ${teile.join(' | ')}`;
}

async function zahlenSec() {
  const kontakt = process.env.SEC_KONTAKT?.trim();
  if (!kontakt) return 'Zahlen SEC: SEC_KONTAKT nicht gesetzt';
  const r = await fetch('https://data.sec.gov/submissions/CIK0000320193.json', { headers: { 'User-Agent': `Schattendepot-Forschung ${kontakt}` }, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => null);
  const s = j?.filings?.recent ?? {};
  const zeiten = [];
  for (let i = 0; i < (s.form?.length ?? 0) && zeiten.length < 4; i++) if (s.form[i] === '8-K' && String(s.items?.[i] ?? '').split(',').includes('2.02')) zeiten.push(`${s.filingDate[i]} angenommen ${s.acceptanceDateTime[i]}`);
  const ok = r.status === 200 && zeiten.length > 0;
  return `Zahlen SEC: ${ok ? 'OK' : 'FEHLER'} (HTTP ${r.status}, Branche ${j?.sic ?? '–'}, ältere Seiten ${j?.filings?.files?.length ?? 0}; letzte Zahlen-8-K der Beispielfirma (meldet 16:30 Ostküstenzeit): ${zeiten.join(' | ') || '–'})`;
}

for (const pruefung of [coingecko, zahlenFinnhub, zahlenFmp, zahlenSec]) {
  try {
    ergebnis.push(await pruefung());
  } catch (e) {
    ergebnis.push(`${pruefung.name}: Abruf gescheitert (${e.message.slice(0, 80)})`);
  }
}
console.log(ergebnis.join('\n'));
if (ergebnis.some((z) => z.includes('FEHLER'))) process.exitCode = 1;
