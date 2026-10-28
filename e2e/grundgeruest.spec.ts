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

test('Alle Tabs erreichbar, Touch-Ziele groß genug', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const [tab, ueberschrift] of [
    ['Depot', 'Depot'],
    ['Daytrading', 'Daytrading'],
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

test('Lernen zeigt Kalibrierung, Statistik und Gewichte', async ({ page }) => {
  await page.goto('/#/lernen');
  await expect(page.getByText('Kalibrierung – hält die Konfidenz, was sie verspricht?')).toBeVisible();
  // Datenkrake oben: Was klappt (mit Ampel), Hot Stuff, Vorlauf
  await expect(page.getByText('Was klappt – Signale im Schattenbuch')).toBeVisible();
  await expect(page.getByText('🔥 Hot Stuff – hätte man es erkennen können?')).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Insider-Cluster-Kauf' }).first()).toBeVisible();
  await expect(page.getByText('3 → 3,3')).toBeVisible();
  // S2: Autopilot und Ziel/Stop-Vorschläge
  await expect(page.getByText('🤖 Autopilot – bewiesene Signale')).toBeVisible();
  await expect(page.getByTestId('autopilot-tabelle').getByText('✅ kauft')).toBeVisible();
  await expect(page.getByText('Ziel/Stop je Signal – selbst optimiert')).toBeVisible();
});

test('Daytrading: eigener Bereich mit Kennzahlen, Herkunft und Trades', async ({ page }) => {
  await page.goto('/#/daytrading');
  await expect(page.getByTestId('daytrading-kennzahlen')).toBeVisible();
  await expect(page.getByText('Vergleich Trade Republic', { exact: true })).toBeVisible();
  await expect(page.getByText(/Consorsbank/)).toHaveCount(0);
  await expect(page.getByRole('cell', { name: '🧠 Claude' })).toBeVisible();
  await expect(page.getByText('Demo Alpha AG').first()).toBeVisible();
});

test('Einstellungen: Push-Hinweis außerhalb der Home-Bildschirm-App', async ({ page }) => {
  await page.goto('/#/einstellungen');
  await expect(page.getByText('Zum Home-Bildschirm')).toBeVisible();
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
