import { defineConfig } from '@playwright/test';

const ipad = { deviceScaleFactor: 2, hasTouch: true, locale: 'de-DE', timezoneId: 'Europe/Berlin' };

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 2,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4174',
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'ipad-hoch', use: { browserName: 'chromium', viewport: { width: 1024, height: 1366 }, ...ipad } },
    { name: 'ipad-quer', use: { browserName: 'chromium', viewport: { width: 1366, height: 1024 }, ...ipad } },
    { name: 'ipad-hoch-webkit', use: { browserName: 'webkit', viewport: { width: 1024, height: 1366 }, ...ipad } },
    { name: 'iphone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, ...ipad, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4174',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
