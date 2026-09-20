import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });

test('dashboard renders queue sorted by age, 4 kpis, side column', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const ages = await page.locator('.q .q__age').allInnerTexts(); const nums = ages.map(a => parseInt(a) || 0); expect([...nums].sort((a, b) => b - a)).toEqual(nums);
  await expect(page.locator('.kpis .kpi')).toHaveCount(4);
  await expect(page.locator('.side .backbone')).toContainText('XI-VFM');
  await expect(page.locator('.side .tile')).toHaveCount(4);
  await expect(page.locator('.rail__item[aria-current=page]')).toHaveAttribute('data-menu', 'dashboard');
});

test('queue click flies camera and opens drawer', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  const z0 = await page.evaluate(() => window.LX.map.getZoom());
  await page.locator('.q').first().click(); await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.LX.map.getZoom())).toBeGreaterThan(z0);
  await expect(page.locator('.drawer[data-open=true]')).toBeVisible();
  await expect(page.locator('.drawer .dw__title')).toHaveText('농지 활용 분석 v2.0');
  await expect(page.locator('.drawer .dw__meta .pill')).toHaveText('대기');   // 키 기본 라벨('발견')이 아니라 도메인 라벨
  await expect(page.locator('.drawer .dw a.btn')).toHaveAttribute('href', 'admin-publish.html?status=대기');
});

test('charts tab switches', async ({ page }) => {
  await page.goto('dashboard.html'); await page.locator('.charts [role=tab]').nth(2).click();
  await expect(page.locator('#chartStorage')).toBeVisible();
});

test('header carries title, notice strip and mono date', async ({ page }) => {
  await page.goto('dashboard.html');
  await expect(page.locator('.dash__head h2')).toHaveText('LX 관리자 대시보드');
  await expect(page.locator('.dash__notice')).toHaveAttribute('href', 'notice.html');
  await expect(page.locator('.dash__date')).toContainText('2026');
});

test('kpi hover highlights extents by status and 5th kpi survives as sub text', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  await expect(page.locator('.kpis .kpi').nth(0).locator('.kpi__sub')).toContainText('승인 대기');
  await expect(page.locator('.kpis .kpi[data-status=found]')).toHaveClass(/kpi--hot/);   // 위치가 아니라 status=found 로 hot 타일을 찾는다
  await expect.poll(() => page.evaluate(() => !!window.LX.map.getLayer('extents'))).toBe(true);
  await page.evaluate(() => { window.__hi = []; const m = window.LX.map, f = m.setHighlight.bind(m); m.setHighlight = (id, fn) => { window.__hi.push([id, typeof fn]); return f(id, fn); }; });
  await page.locator('.kpis .kpi').nth(1).hover();
  await page.locator('.dash__head').hover();
  expect(await page.evaluate(() => window.__hi.map(h => h[0]))).toContain('extents');
  expect(await page.evaluate(() => window.__hi.some(h => h[1] === 'object'))).toBe(true);
});

test('side project rows expose pid and map layers are loaded', async ({ page }) => {
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  await expect(page.locator('.side .p[data-pid=P-001]')).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.LX.map.getLayer('extents')?.count || 0)).toBe(8);
  await expect.poll(() => page.evaluate(() => window.LX.map.getLayer('orgs')?.count || 0)).toBeGreaterThan(0);
});

test('queue action buttons link to the matching admin page', async ({ page }) => {
  await page.goto('dashboard.html');
  await expect(page.locator('.q[data-type=card]').first().locator('.q__act')).toHaveAttribute('href', 'admin-publish.html?status=대기');
  await expect(page.locator('.q[data-type=user]').first().locator('.q__act')).toHaveAttribute('href', 'admin-users.html');
  await expect(page.locator('.q[data-type=inquiry]').first().locator('.q__act')).toHaveAttribute('href', 'admin-inquiry.html');
});

test('no page errors on load', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text() + ' @ ' + (m.location()?.url || '')); });
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  await page.waitForTimeout(600);
  // 지도 타일·CDN(unpkg/jsdelivr/openfreemap) 실패는 폴백이 받는다. 그 밖의 오류는 없어야 한다.
  expect(errs.filter(m => !/net::|ERR_FAILED|favicon|unpkg|jsdelivr|openfreemap|vworld/.test(m))).toEqual([]);
});

test('CDN 이 막혀도 폴백 지도로 뜨고 차트 칸은 안내를 남긴다', async ({ page }) => {
  await page.route('**/unpkg.com/**', r => r.abort());
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
  await page.goto('dashboard.html'); await page.waitForFunction(() => window.LX?.map?.ready);
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  await expect(page.locator('.q')).toHaveCount(7);
  await expect(page.locator('#chartProjects .chart__off')).toBeVisible();
});
