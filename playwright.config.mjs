import { defineConfig } from '@playwright/test';
const PORT = Number(process.env.PORT) || 4173;
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/_legacy/**'],   // 은퇴한 페이지(구 home/login/dashboard)의 스펙 — tests/e2e/README.md 참고
  timeout: 30000,
  use: { channel: 'chrome', headless: true, baseURL: `http://localhost:${PORT}/landxi/`, viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node tools/serve.mjs', url: `http://localhost:${PORT}/landxi/home.html`, reuseExistingServer: true },
});
