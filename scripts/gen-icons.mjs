// Erzeugt die PNG-Icons aus public/favicon.svg (einmalig bzw. nach Änderungen am Icon).
// Aufruf: npm run icons   (nutzt Chromium aus Playwright)
import { chromium } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'public/favicon.svg'), 'utf8');
// Ohne abgerundete Ecken: iOS und „maskable“ schneiden selbst zu.
const square = svg.replace('rx="112"', 'rx="0"');
const outDir = join(root, 'public/icons');
await mkdir(outDir, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, src: svg, pad: 0 },
  { file: 'icon-512.png', size: 512, src: svg, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, src: square, pad: 0 },
  { file: 'icon-maskable-512.png', size: 512, src: square, pad: 0 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(t.src).toString('base64')}" width="${t.size}" height="${t.size}" style="display:block"></body></html>`,
  );
  await page.screenshot({ path: join(outDir, t.file), omitBackground: true });
  console.log('✓', t.file);
}
await browser.close();
