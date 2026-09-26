// F1-C · T-1 기관·할당 — 6기관 · 쿼터 링 6차원 · 격리 표시 · 슬라이더 → 링 500 · [추정] 고스트 · PUT(사유) · approvals 행 · usage.delta 막대
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';

const OPS = 'http://localhost:8702';
const B = OPS + '/landxi/ops/bridge';
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
let child = null;
async function up() { try { return (await fetch(B + '/health')).ok; } catch { return false; } }
test.beforeAll(async () => { if (!(await up())) { child = spawn(process.execPath, ['landxi/ops/serve-ops.mjs'], { stdio: 'ignore' }); for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 250)); } await fetch(B + '/worker/reset', { method: 'POST' }); });
test.afterAll(() => { child?.kill(); });
const login = async () => (await fetch(B + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'lx', login: 'lx-admin', password: PW }) })).json();
async function admin(page) {
  const s = await login();
  await page.addInitScript(([s, base]) => { if (sessionStorage.getItem('f1c')) return; sessionStorage.setItem('f1c', '1'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.setItem('lx_ops_base', base); localStorage.setItem('lx_api_base', base); localStorage.removeItem('lx_api_mode'); }, [s, B]);
  return s;
}
const wk = (event, data) => fetch(B + '/worker/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event, data }) });

test('6기관 · 링 6 · 격리 4 · 한도 [추정 기반 초기값] · 사용 봉투', async ({ page }) => {
  const errs = []; page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  await admin(page); await page.goto(OPS + '/landxi/ops/tenants.html?t=namwon');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  await expect(page.locator('.tn-item')).toHaveCount(6);
  for (const id of ['lx', 'namwon', 'gwangju-jeonnam', 'kgz-agri', 'kgz-land', 'lx-demo']) await expect(page.locator(`.tn-item[data-t="${id}"]`)).toHaveCount(1);
  await expect(page.locator('.tn-ring')).toHaveCount(6);
  await expect(page.locator('.tn-iso .og-tag')).toHaveCount(4);
  await expect(page.locator('.tn-iso')).toContainText('원본 라우트0');
  await expect(page.locator('.tn-iso')).toContainText('tenants/namwon/');
  await expect(page.locator('.tn-ring[data-dim="gpu_s_month"] .tn-pol')).toContainText('[추정 기반 초기값]');
  await expect(page.locator('.tn-edit')).toContainText('[추정 기반 초기값]');
  expect(errs).toEqual([]);
});

test('슬라이더 → 링 여유 구간 500 · hard 를 월말 예측 아래로 → 초과 예상 [추정] 고스트 → 사유 없이 저장 거부 → 사유와 저장 → approvals 행', async ({ page }) => {
  await admin(page); await page.goto(OPS + '/landxi/ops/tenants.html?t=lx');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  const ring = page.locator('.tn-ring[data-dim="gpu_s_month"]');
  const setRange = (i, v) => page.locator('.tn-edit input[type=range]').nth(i).evaluate((el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
  await setRange(1, '1000'); await setRange(0, '800');
  const durs = await ring.locator('circle.rg-seg').evaluateAll((cs) => cs.flatMap((c) => c.getAnimations().map((a) => a.effect.getTiming().duration)));
  expect(durs.length).toBeGreaterThan(0); for (const d of durs) expect([500, 120]).toContain(d);
  await expect(ring.locator('.tn-ghost')).toContainText(/초과 예상 \d{4}-\d\d \[추정\]/);
  await expect(ring.locator('.tn-ghost')).toHaveAttribute('data-caution', '1');
  await page.locator('.tn-save .og-btn').click();
  await expect(page.locator('.tn-save .og-why')).toHaveText('사유가 필요하다');
  await page.locator('.tn-save input').fill('e2e 한도 시험');
  await page.locator('.tn-save .og-btn').click();
  await expect(page.locator('.og-table tbody tr').first()).toContainText('e2e 한도 시험');
  await expect(ring.locator('.rg-center > span')).toHaveText('/ 1,000');
});

test('usage.delta → lx gpu_s 막대·숫자가 따라온다', async ({ page }) => {
  const s = await admin(page); await page.goto(OPS + '/landxi/ops/tenants.html?t=lx');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
  const num = page.locator('.tn-item[data-t="lx"] [data-k="gpu"]');
  const before = await num.textContent();
  const { job } = await (await fetch(B + '/api/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + s.token }, body: JSON.stringify({ kind: 'infer', model_id: 'car_v2_obb', aoi: { type: 'Polygon', coordinates: [[[126.944, 35.995], [126.949, 35.995], [126.949, 35.999], [126.944, 35.995]]] } }) })).json();
  await fetch(B + '/worker/claim', { method: 'POST', body: '{"pool":"a6000"}', headers: { 'content-type': 'application/json' } });
  await wk('job.started', { job_id: job.id, workers: ['a6000-0'], shards_total: 2 });
  await wk('shard.done', { job_id: job.id, worker: 'a6000-0', ms: 12000, n: 1 });
  await expect(num).not.toHaveText(before, { timeout: 6000 });
  await wk('job.done', { job_id: job.id });
});
