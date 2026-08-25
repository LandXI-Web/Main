import { test, expect } from '@playwright/test';

// landxi/proto/dive.html 스모크 — 콘솔 오류 0, 4개 챕터 프레임, 신뢰도 슬라이더 라이브 필터.
// 스크린샷은 shots/proto/ch1..4.png 로 남는다(리포에는 커밋하지 않는다).

const URL = '/landxi/proto/dive.html';
const CH = [['ch1', 0.05], ['ch2', 0.26], ['ch3', 0.45], ['ch4', 0.66], ['ch5', 0.95]];

test.describe.configure({ timeout: 240000 });

test('dive 프로토타입 — 오류 없이 5개 챕터를 통과하고 실데이터를 필터한다', async ({ page }) => {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await page.waitForTimeout(2500);

  // 지도는 한 번만 만들어지고 파괴되지 않는다
  const mapId = await page.evaluate(() => { window.__mapRef = window.__map; return !!window.__map; });
  expect(mapId).toBe(true);

  for (const [name, p] of CH) {
    await page.evaluate((v) => window.__dive.seek(v), p);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `shots/proto/${name}.png` });
    const cam = await page.evaluate(() => ({
      z: window.__map.getZoom(), same: window.__map === window.__mapRef,
    }));
    expect(cam.same).toBe(true);
    expect(cam.z).toBeGreaterThan(0.5);
  }

  // 카메라가 챕터마다 실제로 다른 곳을 본다
  const zooms = [];
  for (const [, p] of CH) {
    await page.evaluate((v) => window.__dive.seek(v), p);
    await page.waitForTimeout(400);
    zooms.push(await page.evaluate(() => +window.__map.getZoom().toFixed(2)));
  }
  expect(new Set(zooms).size).toBe(CH.length);
  expect(zooms[0]).toBeLessThan(3);
  expect(zooms[zooms.length - 1]).toBeGreaterThan(15);

  // 서비스 클릭 → 같은 지도 위에 실제 AI 분석 결과 + 신뢰도 슬라이더 라이브 필터
  const num = (t) => Number(String(t).replace(/[^\d]/g, ''));
  await page.evaluate(() => window.__dive.open('marine'));
  await page.waitForSelector('#rconf', { timeout: 30000 });
  await page.waitForTimeout(3500);
  expect(await page.textContent('#res-title')).toContain('여수');
  const rBefore = await page.textContent('#rconf-n');
  await page.evaluate(() => {
    const s = document.querySelector('#rconf');
    s.value = String(+s.min + (+s.max - +s.min) * 0.7);
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(700);
  const rAfter = await page.textContent('#rconf-n');
  expect(num(rBefore)).toBeGreaterThan(500);
  expect(num(rAfter)).toBeLessThan(num(rBefore));
  await page.screenshot({ path: 'shots/proto/ch-story-marine.png' });

  // 정밀·입체 — 같은 지도가 기울고 결과가 압출된다
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('#rview-seg button')].find((x) => x.dataset.v === 'close');
    b.click();
  });
  await page.waitForTimeout(3500);
  expect(await page.evaluate(() => window.__map.getPitch())).toBeGreaterThan(40);
  await page.screenshot({ path: 'shots/proto/ch-story-marine-3d.png' });

  // 자체 자산 장면(전남 신안 격자) — 필터는 삭제가 아니라 감쇠
  await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#site-seg button')];
    bs[bs.length - 1].click();
  });
  await page.waitForSelector('#conf', { timeout: 30000 });
  await page.waitForTimeout(3000);
  const before = await page.textContent('#conf-n b');
  await page.evaluate(() => {
    const s = document.querySelector('#conf');
    s.value = '0.78';
    s.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(600);
  const after = await page.textContent('#conf-n b');
  expect(num(before)).toBeGreaterThan(1000);
  expect(num(after)).toBeLessThan(num(before));
  expect(num(after)).toBeGreaterThan(0);
  const dim = await page.evaluate(() => window.__map.getPaintProperty('det-dim', 'fill-extrusion-opacity'));
  expect(dim).toBeGreaterThan(0);

  // 전국으로 복귀해도 지도 인스턴스는 그대로다
  await page.evaluate(() => window.__dive.close());
  await page.waitForTimeout(2500);
  expect(await page.evaluate(() => window.__map === window.__mapRef)).toBe(true);

  expect(errors, '콘솔 오류\n' + errors.join('\n')).toEqual([]);
});

test('타일이 차단돼도 페이지가 살아 있다', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.route('**://*.vworld.kr/**', (r) => r.abort());
  await page.route('**://tiles.maps.eox.at/**', (r) => r.abort());
  await page.route('**://tiles.mapterhorn.com/**', (r) => r.abort());
  await page.route('**://tiles.openfreemap.org/**', (r) => r.abort());

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  await page.evaluate(() => window.__dive.seek(0.8));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'shots/proto/ch-fallback.png' });
  // 우리 정사영상과 UI 는 살아 있어야 한다
  expect(await page.isVisible('#hud')).toBe(true);
  expect(await page.evaluate(() => window.__map.getZoom())).toBeGreaterThan(15);
  expect(errors, errors.join('\n')).toEqual([]);
});
