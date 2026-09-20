import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => { await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1')); });

test('coverage matrix 14x7 and hover links to map', async ({ page }) => {
  await page.goto('dashboard.html');
  await expect(page.locator('.coverage__matrix .cell')).toHaveCount(98);
  await page.locator('.coverage__matrix .row').first().hover();
  const code = await page.locator('.coverage__matrix .row').first().getAttribute('data-code');
  await expect(page.locator(`.coverage__map [data-code="${code}"]`)).toHaveClass(/is-hover/);
  await expect(page.locator('.coverage__tip')).toContainText('조사 AI 대체');
});

test('choropleth has 14 polygons whose fill-opacity is done/7', async ({ page }) => {
  await page.goto('dashboard.html');
  await expect(page.locator('.coverage__map [data-code]')).toHaveCount(14);
  const rows = await page.locator('.coverage__map [data-code]').evaluateAll(els => els.map(el => ({
    code: el.dataset.code,
    done: Number(el.dataset.done),
    op: Number(el.querySelector('path').getAttribute('fill-opacity')),
  })));
  expect(rows).toHaveLength(14);
  for (const r of rows) expect(r.op).toBeCloseTo(r.done / 7, 3);
});

test('hovering a polygon lights the matching matrix row and highlights the map layer', async ({ page }) => {
  await page.goto('dashboard.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  await expect.poll(() => page.evaluate(() => window.LX.map.getLayer('coverage')?.count || 0)).toBe(14);
  await page.evaluate(() => { window.__cov = []; const m = window.LX.map, f = m.setHighlight.bind(m); m.setHighlight = (id, fn) => { window.__cov.push([id, typeof fn]); return f(id, fn); }; });
  const poly = page.locator('.coverage__map [data-code]').nth(4);
  const code = await poly.getAttribute('data-code');
  await poly.hover();
  await expect(page.locator(`.coverage__matrix .row[data-code="${code}"]`)).toHaveClass(/is-hover/);
  expect(await page.evaluate(() => window.__cov.filter(h => h[0] === 'coverage' && h[1] === 'function').length)).toBeGreaterThan(0);
  // 카드 밖으로 나가면 강조가 남지 않는다
  await page.locator('.dash__head').hover();
  await expect(page.locator('.coverage__matrix .row.is-hover')).toHaveCount(0);
  await expect(page.locator('.coverage__map .is-hover')).toHaveCount(0);
});

test('rows and polygons link to ximap by region code, matrix carries the 7 surveys', async ({ page }) => {
  await page.goto('dashboard.html');
  const row = page.locator('.coverage__matrix .row').first();
  const code = await row.getAttribute('data-code');
  await expect(row).toHaveAttribute('href', `ximap.html?region=${code}`);
  await expect(page.locator(`.coverage__map [data-code="${code}"]`)).toHaveAttribute('href', `ximap.html?region=${code}`);
  await expect(page.locator('.coverage__matrix .head .head__label')).toHaveCount(7);
  // 완료 셀은 해당 조사 색을 쓴다 — 전주시 pothole 은 완료, farmland 는 미완료
  await expect(page.locator('.cell[data-code="52110"][data-survey=pothole]')).toHaveClass(/is-done/);
  await expect(page.locator('.cell[data-code="52110"][data-survey=farmland]')).not.toHaveClass(/is-done/);
});

test('ambient pulse is a single most-recent marker and no page errors', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto('dashboard.html');
  await expect(page.locator('.coverage__map .is-recent')).toHaveCount(1);
  await expect(page.locator('.coverage__map .coverage__ping')).toHaveCount(1);
  expect(errs).toEqual([]);
});

test('CDN 이 막힌 오프라인에서도 커버리지 카드가 그려진다', async ({ page }) => {
  await page.route('**/unpkg.com/**', r => r.abort());
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
  await page.goto('dashboard.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  await expect(page.locator('.coverage__matrix .cell')).toHaveCount(98);
  await expect(page.locator('.coverage__map [data-code]')).toHaveCount(14);
});
