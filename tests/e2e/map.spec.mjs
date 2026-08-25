import { test, expect } from '@playwright/test';

const POLY = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: { id: 'a', s: 'found' }, geometry: { type: 'Polygon', coordinates: [[[127.38, 35.40], [127.40, 35.40], [127.40, 35.42], [127.38, 35.40]]] } }],
};

test('map mounts (maplibre or fallback), rulebar updates on flyTo', async ({ page }) => {
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  const engine = await page.evaluate(() => window.LX.map.engine);
  expect(['maplibre', 'fallback']).toContain(engine);
  await expect(page.locator('.rulebar')).toContainText('축척');
  await page.evaluate(() => window.LX.map.jumpTo([127.39, 35.41], 14));
  await expect(page.locator('.rulebar')).toContainText('35.4100');
  await expect(page.locator('.lxmap__tool')).toHaveCount(6);
});

test('addGeoJSON + setHighlight do not throw', async ({ page }) => {
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  const ok = await page.evaluate(poly => {
    const m = window.LX.map;
    m.addGeoJSON('t', poly, { kind: 'detection' });
    m.setHighlight('t', p => p.s === 'found');
    m.setHighlight('t', null);
    return true;
  }, POLY);
  expect(ok).toBe(true);
});

test('fallback engine renders, projects and reports the same API', async ({ page }) => {
  await page.goto('dev/map.html?engine=fallback');
  await page.waitForFunction(() => window.LX?.map?.ready);
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  await expect(page.locator('canvas.lxmap__fallback')).toHaveCount(1);
  await page.evaluate(() => window.LX.map.jumpTo([127.39, 35.41], 14));
  await expect(page.locator('.rulebar')).toContainText('35.4100');
  const out = await page.evaluate(poly => {
    const m = window.LX.map;
    m.addGeoJSON('d', poly, { kind: 'detection' });
    m.addGeoJSON('o', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'lx' }, geometry: { type: 'Point', coordinates: [127.39, 35.41] } }] }, { kind: 'org' });
    m.setHighlight('d', p => p.s === 'found');
    m.setHighlight('d', null);
    m.setOrthoOpacity(0.6);
    return { zoom: Math.round(m.getZoom()), center: m.getCenter().map(v => +v.toFixed(4)), pt: m.project([127.39, 35.41]).map(Math.round) };
  }, POLY);
  expect(out.zoom).toBe(14);
  expect(out.center).toEqual([127.39, 35.41]);
  // 화면 중심에 놓인 좌표는 뷰포트 중앙으로 투영된다.
  expect(out.pt[0]).toBeGreaterThan(600);
  expect(out.pt[0]).toBeLessThan(840);
});

test('tool strip: 배경지도 toggles the ortho slider, ⓘ opens site info', async ({ page }) => {
  await page.goto('dev/map.html?engine=fallback');
  await page.waitForFunction(() => window.LX?.map?.ready);
  await expect(page.locator('.lxmap__ortho')).toBeHidden();
  await page.click('.lxmap__tool[data-tool=layers]');
  await expect(page.locator('.lxmap__ortho')).toBeVisible();
  await expect(page.locator('.lxmap__zoom button')).toHaveCount(2);

  await page.click('.rulebar__info');
  const dlg = page.locator('dialog.dialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText('개인정보처리방침');
  await expect(dlg).toContainText('063-713-1213');
  await expect(dlg).toContainText('전주시 덕진구 기지로 120');
});

test('zoom buttons change the reported zoom', async ({ page }) => {
  await page.goto('dev/map.html?engine=fallback');
  await page.waitForFunction(() => window.LX?.map?.ready);
  await page.evaluate(() => window.LX.map.jumpTo([127.8, 36.2], 10));
  await page.click('.lxmap__zoom button:first-child');
  await expect.poll(() => page.evaluate(() => Math.round(window.LX.map.getZoom()))).toBe(11);
});

test('dead tile server falls back to the canvas engine', async ({ page }) => {
  await page.route('**://tiles.openfreemap.org/**', r => r.abort());
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  await expect(page.locator('canvas.lxmap__fallback')).toHaveCount(1);
  await expect(page.locator('.rulebar')).toContainText('축척');
});

test('missing maplibre library falls back without console errors', async ({ page }) => {
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**://unpkg.com/**', r => r.abort());
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready, null, { timeout: 15000 });
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  expect(errs.filter(m => !/unpkg|ERR_FAILED|net::/.test(m))).toEqual([]);
});
