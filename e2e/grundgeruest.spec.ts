import { expect, test } from '@playwright/test';

const HINWEIS = 'Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.';

test('Heute: Tagesbilanz, Briefing, Gelernt, Marktphase und Wochenzeugnis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Heute', exact: true })).toBeVisible();
  await expect(page.getByTestId('heute-bilanz')).toBeVisible();
  await expect(page.getByText('Daytrading heute (Smartbroker+)')).toBeVisible();
  await expect(page.getByText('DEMO: Insider-Cluster tragen')).toBeVisible();
  await expect(page.getByText('Aufwärts, ruhig')).toBeVisible();
  await expect(page.getByTestId('zeugnis-note')).toHaveText('2,3 (gut)');
  // Tages-Lagebild (schlanker Kontext): nur grobe Klassen
  await expect(page.getByTestId('lage')).toContainText('Lange US-Anleihen 5 Tage ruhig');
  // Weltlage (Kontext-Geschichte): Themen in Klassen, frühere Wellen
  await expect(page.getByTestId('weltlage')).toContainText('Zölle und Handelsstreit: Welle');
});

test('Depot zeigt Kennzahlen, Positionen und den Pflichthinweis; alte Links funktionieren', async ({ page }) => {
  await page.goto('/#/uebersicht');
  await expect(page.getByRole('heading', { name: 'Depot', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Abgeschlossen' }).click();
  await expect(page.getByRole('heading', { name: 'Abgeschlossen', exact: true })).toBeVisible();
  await page.goto('/#/depot');
  await expect(page.getByText('Schattendepot vs. ETF', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Gamma AG')).toBeVisible();
  await expect(page.locator('.hinweis-fuss')).toHaveText(HINWEIS);
  await expect(page.locator('.hinweis-fuss')).toBeInViewport();
});

test('Position und Verlauf zeigen Prozent seit Kauf statt Kursen (Lösung B)', async ({ page }) => {
  await page.goto('/#/depot');
  await expect(page.getByText(/Seit Kauf \+1,3\s%\s· heute \+0,8\s%/)).toBeVisible();
  await page.goto('/#/order/2026-10-21-demo-c');
  await expect(page.getByText('Verlauf seit Kauf (in Prozent)')).toBeVisible();
  await expect(page.getByTestId('verlauf-prozent')).toContainText(/zuletzt \+1,3\s%/);
});

test('Alle Tabs erreichbar, Touch-Ziele groß genug', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const [tab, ueberschrift] of [
    ['Depot', 'Depot'],
    ['Daytrading', 'Daytrading'],
    ['Volltreffer', 'Volltreffer'],
    ['Lernen', 'Lernen'],
    ['Einstellungen', 'Einstellungen'],
    ['Heute', 'Heute'],
  ]) {
    const link = nav.getByRole('link', { name: tab });
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await link.click();
    await expect(page.getByRole('heading', { name: ueberschrift, exact: true })).toBeVisible();
  }
});

test('Order-Detail mit Gebührenaufstellung und Claude-Knopf', async ({ page }) => {
  await page.goto('/#/abgeschlossen');
  await page.getByText('Demo Alpha AG').click();
  await expect(page.getByRole('heading', { name: 'Demo Alpha AG' })).toBeVisible();
  await expect(page.getByText('Ausführung und Gebühren')).toBeVisible();
  await expect(page.getByRole('cell', { name: '0,00 €' }).first()).toBeVisible();
  await expect(page.getByText(/Consorsbank/)).toHaveCount(0);
  const claude = page.getByRole('link', { name: 'In Claude besprechen' });
  await expect(claude).toHaveAttribute('href', /^https:\/\/claude\.ai\/new\?q=/);
});

test('Bereich Volltreffer: Jagd, Rückblick mit bestandenen Mustern und Hypothesen, Trefferbuch', async ({ page }) => {
  await page.goto('/#/volltreffer');
  const orders = page.getByTestId('volltreffer-orders');
  await expect(orders).toBeVisible();
  await expect(orders.getByText('+12,5 %')).toBeVisible();
  await expect(orders.getByText(/🕰️ DEMOY · 👀 lauert/)).toBeVisible();
  await expect(orders.getByTestId('zeitreise-regel')).toContainText('Zeitreise-Regel an');
  await expect(orders.getByText(/DEMOW · 🎯 Volltreffer/)).toBeVisible();
  await expect(orders.getByText('Bewährte Muster (1)')).toBeVisible();
  const jagd = page.getByTestId('volltreffer-jagd');
  await expect(jagd).toBeVisible();
  await expect(jagd.getByText(/DEMOJ · ⏳ läuft/)).toBeVisible();
  await expect(jagd.getByText('Lauerliste – Einstieg zur nächsten Eröffnung (1)')).toBeVisible();
  await expect(jagd.getByText(/📄 SEC: Kapital-Registrierung/)).toBeVisible();
  await expect(jagd.getByTestId('claude-urteil')).toContainText('„ja“ 1 abgeschlossen');
  await expect(jagd.getByText(/Claude: ja – DEMO: Prognoseanhebung/)).toBeVisible();
  // Zeitreise (19.11.2026): Gesamtsimulation ohne Blick nach vorn
  await expect(page.getByTestId('zeitreise')).toContainText('439 Orders, 116 Volltreffer');
  const karte = page.getByTestId('volltreffer-rueckblick');
  await expect(karte).toBeVisible();
  await expect(karte.getByText(/Bestanden: 1 Muster/)).toBeVisible();
  await expect(karte.getByText(/C9k Rückprall nach Ausverkauf/)).toBeVisible();
  await expect(karte.getByTestId('muster-tage').first()).toContainText('an 84 + 71 verschiedenen Tagen');
  const buch = page.getByTestId('trefferbuch');
  await expect(buch.getByText(/Vorzeichen: insider_cluster_kauf/)).toBeVisible();
  await expect(buch.getByText(/3 von 42 Fällen – noch zu wenige/)).toBeVisible();
  // Gesamtmodell (Quantensprung) und echte Handelbarkeit
  await expect(page.getByTestId('gesamtmodell')).toContainText('Gesamtmodell aus allen Merkmalen');
  await expect(page.getByTestId('gesamtmodell')).toContainText('Wichtigste Merkmale');
  await expect(jagd.getByTestId('handelbarkeit')).toContainText('36 Werte auf Hebelprodukte in Deutschland geprüft');
});

test('Lernen zeigt Kalibrierung, Statistik und Gewichte', async ({ page }) => {
  await page.goto('/#/lernen');
  await expect(page.getByText('Kalibrierung – hält die Konfidenz, was sie verspricht?')).toBeVisible();
  // Datenkrake oben: Was klappt (mit Ampel), Hot Stuff, Vorlauf
  await expect(page.getByText('Was klappt – Signale im Schattenbuch')).toBeVisible();
  // Selbstverbesserung (Plan Volltreffer VS): Übernahme mit Urteil, Rückgängig-Link, Ablehnung
  await expect(page.getByText('🛠️ Was sich verbessert hat')).toBeVisible();
  await expect(page.getByTestId('verbesserung-karte')).toContainText('✅ wirkt');
  await expect(page.getByRole('link', { name: 'Rückgängig machen' })).toHaveAttribute('href', /verbesserung-zurueck\.yml$/);
  await expect(page.getByTestId('verbesserung-karte')).toContainText('Nicht übernommen');
  // ehrliche Fallzahlen: n je Messpunkt und Median
  await expect(page.getByRole('columnheader', { name: 'Median 1 W' }).first()).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Ø 1 Woche (n)' }).first()).toBeVisible();
  await expect(page.getByText('🔥 Hot Stuff – hätte man es erkennen können?')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Insider-Cluster-Kauf' }).first()).toBeVisible();
  await expect(page.getByText('3 → 3,3')).toBeVisible();
  // S2: Autopilot und Ziel/Stop-Vorschläge
  await expect(page.getByText('🤖 Autopilot – bewiesene Signale')).toBeVisible();
  await expect(page.getByTestId('autopilot-tabelle').getByText('✅ kauft')).toBeVisible();
  await expect(page.getByText('Ziel/Stop je Signal – selbst optimiert')).toBeVisible();
  // V1: Schattenbuch auf Sammelkursen mit ehrlicher Abdeckung
  await expect(page.getByTestId('sammel-schattenbuch')).toContainText('12 von 16 Signalen');
});

test('Daytrading: eigener Bereich mit Kennzahlen, Herkunft und Trades', async ({ page }) => {
  await page.goto('/#/daytrading');
  await expect(page.getByTestId('daytrading-kennzahlen')).toBeVisible();
  await expect(page.getByText('Vergleich Trade Republic', { exact: true })).toBeVisible();
  await expect(page.getByText(/Consorsbank/)).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '🧠 Claude' })).toBeVisible();
  await expect(page.getByText('Demo Alpha AG').first()).toBeVisible();
  // Plan Volltreffer V0: Turbo/Short/Krypto laufen nur virtuell mit und stehen getrennt
  await expect(page.getByText('Nur virtuell mitgeführt – zählt nicht mit')).toBeVisible();
  await expect(page.getByTestId('dt-virtuell')).toContainText('nur noch virtuell');
  await expect(page.getByText(/nur virtuell \(zählt nicht mit\)/).first()).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Short (fallende Kurse)' })).toBeVisible();
});

test('Einstellungen: Push-Hinweis außerhalb der Home-Bildschirm-App', async ({ page }) => {
  await page.goto('/#/einstellungen');
  await expect(page.getByText('Zum Home-Bildschirm')).toBeVisible();
  // Neustart der sichtbaren Zähler (19.11.2026): Werte seit Anfang bleiben in den Einstellungen sichtbar
  await expect(page.getByTestId('seit-anfang')).toContainText('Depot: −195,75');
});

test('Keine horizontale Scrollleiste', async ({ page }) => {
  for (const route of ['/', '/#/depot', '/#/briefing', '/#/abgeschlossen', '/#/daytrading', '/#/lernen', '/#/quellen', '/#/einstellungen', '/#/order/2026-10-21-demo-c']) {
    await page.goto(route);
    await page.waitForTimeout(200);
    const breit = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(breit, route).toBe(false);
  }
});

test('Manifest ist installierbar konfiguriert', async ({ request }) => {
  const res = await request.get('/manifest.webmanifest');
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe('standalone');
  expect(m.lang).toBe('de');
  expect(m.icons.some((i: { purpose: string }) => i.purpose === 'maskable')).toBe(true);
  expect((await request.get('/icons/apple-touch-icon.png')).ok()).toBe(true);
});
