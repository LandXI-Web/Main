import { defineConfig } from '@playwright/test';
import fs from 'node:fs';
// 개발 계정 비밀번호는 server/.env(저장소에 올리지 않음)에서 — 스펙은 process.env.DEV_PASSWORD 를 쓴다
if (!process.env.DEV_PASSWORD) { try { const m = fs.readFileSync(new URL('./server/.env', import.meta.url), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; } catch { /* 없음 */ } }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const PORT = Number(process.env.PORT) || 4173;
export default defineConfig({
  testDir: 'tests/e2e',
  testIgnore: ['**/_legacy/**'],   // 은퇴한 페이지(구 home/login/dashboard)의 스펙 — tests/e2e/README.md 참고
  timeout: 30000,
  use: { channel: 'chrome', headless: true, baseURL: `http://localhost:${PORT}/landxi/`, viewport: { width: 1440, height: 900 } },
  webServer: { command: 'node tools/serve.mjs', url: `http://localhost:${PORT}/landxi/home.html`, reuseExistingServer: true },
});
