// F1-C · origin 관문 — :8702 에서만 관제가 열리고, admin 세션만 통과하며, 4173 세션과 분리된다. /events/ops Origin 검사.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
let child = null;
async function up() { try { const r = await fetch(B + '/health'); return r.ok; } catch { return false; } }
test.beforeAll(async () => {
  if (await up()) return;
  child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore', detached: false });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250));
});
test.afterAll(() => { child?.kill(); });
const login = async (login) => (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login, password: PW }) })).json();

test('4173 에서 관제 index 를 열면 boot.js 가 안내 화면으로 바꾼다(서버는 200 이어도)', async ({ page }) => {
  await page.goto('http://localhost:4173/landxi/ops/index.html');
  await page.waitForFunction(() => document.documentElement.dataset.gate === 'port');
  await expect(page.locator('h1')).toHaveText('LX 관리자 대시보드는 관리자 주소에서 열립니다');
  expect(await page.evaluate(() => document.querySelector('.og-shell'))).toBeNull();
});

test('serve-ops 허용 접두 밖은 404 · 안은 200 · Range 206', async () => {
  for (const p of ['/landxi/proto/map.js', '/tools/serve.mjs', '/server/.env', '/landxi/index.html', '/docs/superpowers/blueprint/F1-CONTRACT.md']) expect((await fetch(OPS + p)).status, p).toBe(404);
  for (const p of ['/landxi/ops/login.html', '/landxi/shared/api-v1.js', '/landxi/assets/css/v2/tokens-v2.css', '/landxi/proto/fonts-system.css']) expect((await fetch(OPS + p)).status, p).toBe(200);
  const r = await fetch(OPS + '/landxi/data/vector/pmtiles/sido.pmtiles', { headers: { range: 'bytes=0-126' } });
  expect(r.status).toBe(206); expect(r.headers.get('content-type')).toBe('application/octet-stream');
  expect((await fetch(OPS + '/landxi/ops/', { redirect: 'manual' })).status).toBe(200);
});

test('/events/ops — 8702 Origin + admin 만(4173 Origin · staff · 토큰 없음 = 403)', async () => {
  const admin = await login('lxadmin@lx.or.kr'); const staff = await login('test@lx.or.kr');
  const sse = (tok, origin) => fetch(`${B}/api/v1/events/ops?access_token=${tok || ''}`, { headers: origin ? { origin } : {} });
  expect((await sse(admin.token, 'http://localhost:4173')).status).toBe(403);
  expect((await sse(staff.token, OPS)).status).toBe(403);
  expect((await sse('', OPS)).status).toBe(403);
  const ok = await sse(admin.token, OPS); expect(ok.status).toBe(200); expect(ok.headers.get('content-type')).toContain('text/event-stream'); await ok.body.cancel();
  const noOrigin = await sse(admin.token, null); expect(noOrigin.status).toBe(200); await noOrigin.body.cancel();
});

test('staff 로그인은 관제 진입 불가 — 문구 한 줄 · 세션 저장 안 함', async ({ page }) => {
  await page.goto(OPS + '/landxi/ops/login.html');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await page.fill('#id', 'test@lx.or.kr'); await page.fill('#pw', PW); await page.click('#go');
  await expect(page.locator('#msg')).toHaveText('LX 관리자 전용입니다');
  expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();
  await page.goto(OPS + '/landxi/ops/infra.html');
  await page.waitForURL(/login\.html/);
});

test('4173 origin 의 세션은 8702 에 보이지 않는다(localStorage 분리)', async ({ page }) => {
  await page.goto('http://localhost:4173/landxi/ops/login.html');
  await page.evaluate(() => { localStorage.setItem('lx_api_session', JSON.stringify({ token: 'x', realm: 'lx', role: 'admin', expires_at: '2099-01-01' })); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'admin'); });
  await page.goto(OPS + '/landxi/ops/index.html');
  await page.waitForURL(/login\.html/);
  expect(await page.evaluate(() => localStorage.getItem('lx_api_session'))).toBeNull();
});
