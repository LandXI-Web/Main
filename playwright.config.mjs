import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  use: { channel: 'chrome', headless: true, baseURL: 'http://localhost:4173/landxi/', viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node tools/serve.mjs', url: 'http://localhost:4173/landxi/home.html', reuseExistingServer: true },
});
