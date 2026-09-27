import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// F2-R 생산 딥링크(계약 v1.1-29) — ai-card.html?card=&version= · produce.html?deploy=
//   카드 열림 + 버전 행 강조 + 배포 계보 칩(관제 ?deploy= · XI맵 ?svc= · 생산 ?deploy=) 왕복.
//   관리자 = 전부 · 직원(project) = ?card 로만 열람(발행 · 편집 단추 0) · 영업 = 들어가지 못한다.
const SHOTS = 'shots/f2/R';
fs.mkdirSync(SHOTS, { recursive: true });
const OPS = 'http://localhost:8702/landxi/ops/login.html?next=';
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function as(page, role) {
  await page.addInitScript((r) => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session'); }, role);
}
const DEEP = 'proto/ai-card.html?card=card-farm&version=v2.1';
const ready = (page) => page.waitForSelector('#cd-deep[data-state="ready"]', { timeout: 15000 });

test('관리자 — ai-card?card=card-farm&version=v2.1 → 카드 열림 · v2.1 행 강조 · 계보 7마디 · 왕복 칩 3 · 구성 모델 카드 강조', async ({ page }) => {
  const errs = watch(page);
  await as(page, 'admin');
  await page.goto(DEEP);
  await ready(page);
  await expect(page.locator('#cd-deep-name')).toHaveText('영농관리 행정서비스');
  await expect(page.locator('#cd-ver tr[aria-current="true"]')).toHaveAttribute('data-ver', 'v2.1');
  await expect(page.locator('#cd-ver tr[aria-current="true"] td').nth(1)).toHaveText('dp-nw-farm-25');
  await expect(page.locator('#cd-ver tbody tr')).toHaveCount(2);                        // 기록된 버전만(v2.1 지금 · v2.0 직전)
  await expect(page.locator('#cd-chain .cd-ln')).toHaveCount(7);
  await expect(page.locator('#cd-chain .cd-ln').first()).toContainText('데이터셋');
  await expect(page.locator('#cd-dp-chip')).toContainText('dp-nw-farm-25 · v2.1');
  await expect(page.locator('#cd-go-ops')).toHaveAttribute('href', OPS + 'deploys.html%3Fdeploy%3Ddp-nw-farm-25');
  await expect(page.locator('#cd-go-xi')).toHaveAttribute('href', '../xi/index.html?svc=dp-nw-farm-25');
  await expect(page.locator('#cd-go-produce')).toHaveAttribute('href', 'produce.html?deploy=dp-nw-farm-25');
  expect(await page.$$eval('.cd[data-lineage="1"]', (a) => a.map((e) => +e.dataset.cid).sort((x, y) => x - y))).toEqual([3, 4, 5, 6, 7]);
  await expect(page.locator('a.btn[href="ai-card-edit.html"]')).toHaveCount(1);         // 관리자는 발행 단추 그대로
  const small = await page.evaluate(() => [...document.querySelectorAll('#cd-deep *')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 14).length);
  expect(small).toBe(0);
  await page.screenshot({ path: `${SHOTS}/deeplink-card-admin.png` });
  expect(errs).toEqual([]);
});

test('왕복 — 카드 → 생산 공정 ↗(produce?deploy= 행 강조) → 카드 ↗ → XI맵에서 보기 ↗(?svc= · data-lx=ready)', async ({ page }) => {
  test.setTimeout(90000);
  await as(page, 'admin');
  await page.goto(DEEP);
  await ready(page);
  await page.locator('#cd-go-produce').click();
  await page.waitForURL(/produce\.html\?deploy=dp-nw-farm-25$/);
  await page.waitForSelector('#pd-deploy');
  await expect(page.locator('#pd-deploy')).toHaveAttribute('data-deploy', 'dp-nw-farm-25');
  await expect(page.locator('tr[data-deploy="dp-nw-farm-25"][aria-current="true"]')).toHaveCount(1);
  await expect(page.locator('#page-head .ptabs a[aria-current="page"]')).toHaveText(/능동 운영/);
  await page.screenshot({ path: `${SHOTS}/deeplink-produce.png` });
  // 인프라 탭으로 가도 ?deploy 가 따라가고 그 행이 선다
  await page.locator('#page-head .ptabs a', { hasText: '인프라' }).click();
  await page.waitForURL(/tab=infra&deploy=dp-nw-farm-25/);
  await expect(page.locator('tr[data-deploy="dp-nw-farm-25"][aria-current="true"]')).toHaveCount(1);
  await page.locator('#pd-go-card').click();
  await page.waitForURL(/ai-card\.html\?card=card-farm&version=v2\.1$/);
  await ready(page);
  await page.locator('#cd-go-xi').click();
  await page.waitForURL(/\/landxi\/xi\/index\.html\?.*svc=dp-nw-farm-25/);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
  expect(await page.evaluate(() => window.__xi.state.svc)).toBe('dp-nw-farm-25');
});

test('관제 배포 제어 ↗ — :8702 관제 로그인 문 ?next=deploys.html?deploy=dp-nw-farm-25 (관제 꺼져 있으면 route 로 확인)', async ({ page }) => {
  await as(page, 'admin');
  await page.goto(DEEP);
  await ready(page);
  const up = await page.request.get('http://localhost:8702/landxi/ops/login.html', { timeout: 5000 }).then((r) => r.ok()).catch(() => false);
  if (!up) await page.route('http://localhost:8702/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>stub</title>' }));
  await page.locator('#cd-go-ops').click();
  await page.waitForURL((u) => u.port === '8702', { timeout: 20000 });
  expect(page.url()).toMatch(/\/landxi\/ops\//);
});

test('직원 — ?card 딥링크는 열람 전용으로 열린다(발행 · 편집 · 생산 칩 0) · ?card 없이는 여전히 관리자 화면', async ({ page }) => {
  const errs = watch(page);
  await as(page, 'staff');
  await page.goto(DEEP);
  await ready(page);
  expect(new URL(page.url()).searchParams.get('denied')).toBeNull();
  await expect(page.locator('#cd-ver tr[aria-current="true"]')).toHaveAttribute('data-ver', 'v2.1');
  await expect(page.locator('a[href^="ai-card-edit.html"]')).toHaveCount(0);
  await expect(page.locator('#cd-go-produce')).toHaveCount(0);
  await expect(page.locator('#cd-go-ops')).toHaveCount(1);
  await expect(page.locator('#mast .crumbs a[href="admin-publish.html"]')).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/deeplink-card-staff.png` });
  // 검색해도 딥링크는 주소에 남는다
  await page.locator('#cd-q').fill('농지');
  await page.locator('#cd-tool button[type="submit"]').click();
  await expect.poll(() => new URL(page.url()).searchParams.get('card')).toBe('card-farm');
  await page.goto('proto/ai-card.html');
  await page.waitForURL(/ai-project\.html/);
  expect(errs).toEqual([]);
});

test('영업 — ?card 딥링크도 들어가지 못한다(새 XI맵으로 · denied)', async ({ page }) => {
  await as(page, 'sales');
  await page.goto(DEEP);
  await page.waitForURL(/\/landxi\/xi\/index\.html/);
});

test('없는 버전 · 없는 카드 · 없는 배포본 — 지어내지 않고 말한다', async ({ page }) => {
  await as(page, 'admin');
  await page.goto('proto/ai-card.html?card=card-farm&version=v9.9');
  await ready(page);
  await expect(page.locator('#cd-ver-miss')).toContainText('v9.9');
  await expect(page.locator('#cd-ver tr[aria-current="true"]')).toHaveCount(0);
  await page.goto('proto/ai-card.html?card=card-nope');
  await page.waitForSelector('#cd-deep[data-state="missing"]');
  await page.goto('proto/produce.html?deploy=dp-nope');
  await expect(page.locator('#pd-deploy')).toContainText('등록된 배포본이 아닙니다');
  await expect(page.locator('tr[aria-current="true"]')).toHaveCount(0);
});
