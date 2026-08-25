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

test('blocked vworld ortho endpoint disables the slider and drops the layer', async ({ page }) => {
  await page.route('**xdworld.vworld.kr/**', r => r.abort());
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  test.skip(await page.evaluate(() => window.LX.map.engine) !== 'maplibre', '정사영상 레이어는 MapLibre 경로에만 있다');
  // 타일이 죽으면 vworld-sat 소스가 error 를 내고 lx:ortho-unavailable 로 UI 가 잠긴다.
  await expect(page.locator('.lxmap__tool[data-tool=layers]')).toBeDisabled();
  await expect(page.locator('.lxmap__ortho input')).toBeDisabled();
  await expect.poll(() => page.evaluate(() => !!window.LX.map.raw.getLayer('ortho'))).toBe(false);
  await page.evaluate(() => window.LX.map.setOrthoOpacity(0.8));           // 레이어가 없으니 무시돼야 한다
  expect(await page.evaluate(() => !!window.LX.map.raw.getSource('vworld-sat'))).toBe(false);
});

test('addGeoJSON with a duplicate id replaces instead of throwing', async ({ page }) => {
  for (const q of ['', '?engine=fallback']) {
    await page.goto('dev/map.html' + q);
    await page.waitForFunction(() => window.LX?.map?.ready);
    const out = await page.evaluate(poly => {
      const m = window.LX.map;
      const two = { type: 'FeatureCollection', features: [poly.features[0], { type: 'Feature', properties: { id: 'b', s: 'done' }, geometry: { type: 'Polygon', coordinates: [[[127.30, 35.30], [127.32, 35.30], [127.32, 35.32], [127.30, 35.30]]] } }] };
      m.addGeoJSON('t', poly, { kind: 'detection' });
      const first = m.getLayer('t').count;
      m.addGeoJSON('t', two, { kind: 'detection' });          // 같은 id 재등록 — throw 하면 안 된다
      const second = m.getLayer('t').count;
      m.setHighlight('t', p => p.s === 'done'); m.setHighlight('t', null);
      return { engine: m.engine, first, second, kind: m.getLayer('t').kind };
    }, POLY);
    expect(out.first, out.engine).toBe(1);
    expect(out.second, out.engine).toBe(2);
    expect(out.kind, out.engine).toBe('detection');
  }
});

test("on('move') replaces the previous listener instead of stacking", async ({ page }) => {
  for (const q of ['', '?engine=fallback']) {
    await page.goto('dev/map.html' + q);
    await page.waitForFunction(() => window.LX?.map?.ready);
    const out = await page.evaluate(async () => {
      const m = window.LX.map;
      const hits = { a: 0, b: 0 };
      m.on('move', () => hits.a++);                            // 등록 즉시 1회 동기 발화
      const atRegister = hits.a;
      m.on('move', () => hits.b++);                            // 앞의 리스너는 떨어져야 한다
      hits.a = 0; hits.b = 0;
      for (let i = 0; i < 4; i++) m.jumpTo([127.4 + i * 0.02, 35.5], 12);
      await new Promise(r => setTimeout(r, 400));
      return { engine: m.engine, atRegister, ...hits };
    });
    expect(out.atRegister, out.engine).toBe(1);                // 두 엔진 모두 등록 시 1회 발화
    expect(out.a, out.engine).toBe(0);                         // 교체됐으므로 더는 불리지 않는다
    expect(out.b, out.engine).toBeGreaterThan(0);
  }
});

test('destroy() removes tools, rulebar and the global reference', async ({ page }) => {
  for (const q of ['', '?engine=fallback']) {
    await page.goto('dev/map.html' + q);
    await page.waitForFunction(() => window.LX?.map?.ready);
    await expect(page.locator('.lxmap__tools')).toHaveCount(1);
    const err = await page.evaluate(() => { try { window.LX.map.destroy(); return null; } catch (e) { return e.message; } });
    expect(err).toBe(null);
    await expect(page.locator('.lxmap__tools')).toHaveCount(0);
    await expect(page.locator('.rulebar')).toHaveCount(0);
    await expect(page.locator('.lxmap__canvas')).toHaveCount(0);
    expect(await page.evaluate(() => 'map' in (window.LX || {}))).toBe(false);
    expect(await page.evaluate(() => !!window.LX)).toBe(true);   // LX 자체는 남아 있어야 한다
  }
});

test('addRaster: 남원 2508 실촬영 정사영상이 실제 타일 요청으로 올라간다', async ({ page }) => {
  // 두 엔진 모두 같은 URL(assets/tiles/namwon_2508/{z}/{x}/{y}.webp)에서 타일을 받는다.
  const tile = page.waitForResponse(r => /tiles\/namwon_2508\/.*\.webp/.test(r.url()) && r.status() === 200);
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  const engine = await page.evaluate(() => window.LX.map.engine);
  if (engine === 'maplibre') {
    expect(await page.evaluate(() => !!window.LX.map.raw.getLayer('r-namwon'))).toBe(true);
    expect(await page.evaluate(() => !!window.LX.map.raw.getSource('r-namwon'))).toBe(true);
  } else {
    await expect(page.locator('.lxmap__canvas canvas')).toHaveCount(1);
  }
  await tile;
  expect(await page.evaluate(() => window.LX.map.getLayer('namwon').kind)).toBe('raster');
  expect(await page.evaluate(() => window.LX.map.getLayer('namwon').imagery.id)).toBe('namwon_2508');
  if (engine === 'maplibre') {
    await page.evaluate(() => window.LX.map.setRasterOpacity('namwon', 0.4));
    expect(await page.evaluate(() => window.LX.map.raw.getPaintProperty('r-namwon', 'raster-opacity'))).toBeCloseTo(0.4);
    // NaN 이 들어와도 투명도가 NaN 이 되지 않는다.
    await page.evaluate(() => window.LX.map.setRasterOpacity('namwon', 'nope'));
    expect(await page.evaluate(() => window.LX.map.raw.getPaintProperty('r-namwon', 'raster-opacity'))).toBe(0);
  }
  // 없는 id 로 불러도 던지지 않는다.
  expect(await page.evaluate(() => { window.LX.map.setRasterOpacity('nope', 0.5); return window.LX.map.getLayer('nope'); })).toBe(null);
});

test('addRaster: 폴백 캔버스도 같은 타일을 카메라 변환으로 그린다', async ({ page }) => {
  const tile = page.waitForResponse(r => /tiles\/namwon_2508\/.*\.webp/.test(r.url()) && r.status() === 200);
  await page.goto('dev/map.html?engine=fallback');
  await page.waitForFunction(() => window.LX?.map?.ready);
  expect(await page.evaluate(() => window.LX.map.engine)).toBe('fallback');
  const res = await tile;
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('image/webp');
});

test('지도 org 레이어 색이 tokens.css 의 --lx 를 따라간다', async ({ page }) => {
  await page.goto('dev/map.html');
  await page.waitForFunction(() => window.LX?.map?.ready);
  const lx = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--lx').trim());
  expect(lx).toBe('#006DF7');
  await page.evaluate(() => window.LX.map.addGeoJSON('t-org', {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { id: 'a' }, geometry: { type: 'Point', coordinates: [127.3524, 35.5311] } }],
  }, { kind: 'org' }));
  if (await page.evaluate(() => window.LX.map.engine === 'maplibre')) {
    // 옛 파랑(#2457D6)이 하드코딩돼 있으면 여기서 걸린다.
    expect(await page.evaluate(() => window.LX.map.raw.getPaintProperty('t-org-pt', 'circle-color'))).toBe(lx);
  }
  expect(await page.evaluate(() => window.LX.map.getLayer('t-org').kind)).toBe('org');
});

test('rulebar keeps focus on ⓘ and its scale bar node while the camera moves', async ({ page }) => {
  await page.goto('dev/map.html?engine=fallback');
  await page.waitForFunction(() => window.LX?.map?.ready);
  await page.focus('.rulebar__info');
  await page.evaluate(async () => {
    window.__sameNode = document.querySelector('.rulebar__scale i');
    for (let i = 0; i < 5; i++) { window.LX.map.jumpTo([127.3 + i * 0.05, 35.3 + i * 0.05], 11 + i * 0.4); await new Promise(r => requestAnimationFrame(r)); }
  });
  await expect(page.locator('.rulebar')).toContainText('축척');
  // innerHTML 을 다시 짓지 않으므로 포커스도 노드 동일성도 유지된다.
  expect(await page.evaluate(() => document.activeElement?.classList.contains('rulebar__info'))).toBe(true);
  expect(await page.evaluate(() => window.__sameNode === document.querySelector('.rulebar__scale i'))).toBe(true);
});
