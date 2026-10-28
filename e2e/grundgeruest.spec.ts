import { expect, test } from '@playwright/test';

const HINWEIS = 'Simulation mit fiktivem Geld – keine Anlageberatung, keine Kauf- oder Verkaufsempfehlung.';

test('Übersicht zeigt Kennzahlen, Positionen und den Pflichthinweis', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Übersicht', exact: true })).toBeVisible();
  await expect(page.getByText('Schattendepot vs. ETF', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Gamma AG')).toBeVisible();
  await expect(page.locator('.hinweis-fuss')).toHaveText(HINWEIS);
  await expect(page.locator('.hinweis-fuss')).toBeInViewport();
});

test('Alle Tabs erreichbar, Touch-Ziele groß genug', async ({ page }) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Hauptnavigation' });
  for (const [tab, ueberschrift] of [
    ['Briefing', 'Briefing'],
    ['Abgeschlossen', 'Abgeschlossen'],
    ['Lernen', 'Lernen'],
    ['Quellen', 'Quellenstatus'],
    ['Einstellungen', 'Einstellungen'],
    ['Übersicht', 'Übersicht'],
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
  await expect(page.getByRole('cell', { name: '9,95 €' }).first()).toBeVisible();
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
});

test('Einstellungen: Push-Hinweis außerhalb der Home-Bildschirm-App', async ({ page }) => {
  await page.goto('/#/einstellungen');
  await expect(page.getByText('Zum Home-Bildschirm')).toBeVisible();
});

test('Keine horizontale Scrollleiste', async ({ page }) => {
  for (const route of ['/', '/#/briefing', '/#/abgeschlossen', '/#/lernen', '/#/einstellungen', '/#/order/2026-10-21-demo-c']) {
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
