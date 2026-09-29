// F1-C · R-1 롤백 · P-1 이식 · approval_required · 모듈 잠금 · 모델 교체 지표 나란히 — 매트릭스 9×6
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
let child = null;
async function up() { try { return (await fetch(B + '/health')).ok; } catch { return false; } }
test.beforeAll(async () => { if (!(await up())) { child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); } });
test.beforeEach(async () => { await fetch(B + '/worker/reset', { method: 'POST' }); });
test.afterAll(() => { child?.kill(); });
const login = async () => (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: PW }) })).json();
async function admin(page) {
  const s = await login();
  await page.addInitScript(([s, base]) => { if (sessionStorage.getItem('f1c')) return; sessionStorage.setItem('f1c', '1'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_ops_src', 'bridge'); }, [s, B]);
  return s;
}
async function open(page, d = 'dp-nw-farm-25') { await admin(page); await page.goto(`${OPS}/landxi/ops/deploys.html?d=${d}`); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready'); }

test('매트릭스 9×6 · 공통 모듈 7 잠금 · 모델 교체 지표 나란히(aerial25 = 체크포인트 내장 지표)', async ({ page }) => {
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await open(page);
  await expect(page.locator('.mx-c')).toHaveCount(54);
  await expect(page.locator('.mx-r')).toHaveCount(9);
  await expect(page.locator('.pn-mod[data-core]')).toHaveCount(7);
  await page.locator('.pn-sec select.og-select').first().selectOption('aerial25/best');
  await expect(page.locator('.pn-models')).toContainText('체크포인트 내장 지표');
  await expect(page.locator('.pn-models')).toContainText('mask mAP50 0.951');
  expect(errs).toEqual([]);
});

test('R-1 롤백: dp-nw-farm-25 v2.1 → v2.0 · 지도 점 앰버 380 · 계보 되감김(aerial25) · 스냅샷 2,098 → 76,215', async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-k="snapN"]')).toHaveText('2,098');
  await page.locator('.pn-sec .og-btn.is-caution', { hasText: '롤백' }).click();
  await page.locator('.og-modal input').fill('2025 드론 결과 재검수 — 2023 항공으로 되돌림');
  const lockSeen = page.waitForFunction(() => !!document.querySelector('.dm-pt.is-lock[data-id="dp-nw-farm-25"]'), null, { timeout: 5000 });
  await page.locator('.og-modal .og-btn.is-caution').click();
  await lockSeen;
  const d = await page.locator('.dm-pt[data-id="dp-nw-farm-25"]').evaluate((el) => getComputedStyle(el, '::after').animationDuration);
  expect(d.split(',').map((x) => Math.round(parseFloat(x) * 1000))).toEqual([180, 80, 120]);
  await expect(page.locator('[data-k="snapN"]')).toHaveText('76,215', { timeout: 8000 });
  await expect(page.locator('.mini-cap')).toContainText('2023 25cm');
  await expect(page.locator('.lin')).toContainText('aerial25', { timeout: 8000 });
  await expect(page.locator('.mx-cell[data-id="dp-nw-farm-25"]')).toHaveAttribute('data-stage', 'rolled_back');
  await expect(page.locator('.mx-cell[data-id="dp-nw-farm-25"] .v')).toHaveText('v2.0');
  await expect(page.locator('.dm-pt[data-id="dp-nw-farm-25"]')).toHaveAttribute('data-stage', 'rolled_back');
  await expect(page.locator('.aud')).toContainText('deploy.rollback');
});

test('P-1 이식: card-change × kgz-land → POST /deploys → draft 셀 S1 도착 · 결과 0 · 첫 분석 대기 · 경계 미확보', async ({ page }) => {
  await open(page);
  await page.locator('.mx-c[data-card="card-change"][data-tenant="kgz-land"] .mx-port').click();
  await expect(page.locator('.pn')).toContainText('소쿨룩');
  await expect(page.locator('.pn')).toContainText(/경계 미확보|geoBoundaries/);
  await page.locator('[data-k="port-go"]').click();
  await expect(page.locator('.mx-c[data-card="card-change"][data-tenant="kgz-land"] .mx-arrive .sw')).toBeAttached();
  const cell = page.locator('.mx-cell[data-id="dp-kgz-land-change-26"]');
  await expect(cell).toHaveAttribute('data-stage', 'draft');
  await expect(page.locator('.pn-head h2')).toContainText('소쿨룩', { timeout: 8000 });
  await expect(page.locator('.mini-cap')).toContainText('결과 0 · 첫 분석 대기');
  await expect(page.locator('.pn-head')).toContainText('다른 지역에 적용');
});

test('approval_required: canary → ga 는 승인 1건 뒤에만(409 → 승인 → ga)', async ({ page }) => {
  await open(page, 'dp-nw-road-26');
  const ga = page.locator('.pn-stages button', { hasText: '정식' });
  await expect(ga).toHaveAttribute('data-blocked', '1');
  await ga.click();
  await expect(page.locator('.og-toast').last()).toContainText('approval_required');
  await page.locator('.pn-sec .og-btn', { hasText: '승인' }).click();
  await page.locator('.og-modal input').fill('e2e 승인'); await page.locator('.og-modal .og-btn.is-primary').click();
  await expect(page.locator('.pn-stages button', { hasText: '정식' })).toHaveAttribute('data-blocked', '0');
  await page.locator('.pn-stages button', { hasText: '정식' }).click();
  await expect(page.locator('.mx-cell[data-id="dp-nw-road-26"]')).toHaveAttribute('data-stage', 'ga');
});
