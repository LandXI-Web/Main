import { test, expect } from '@playwright/test';

const URL = 'proto/system.html';

// 이 시트는 로컬 자산만 쓴다. 네트워크 실패는 폰트 CDN 정도이고,
// 우리 코드가 던진 오류만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push('console: ' + t);
  });
  return errs;
}

async function boot(page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.lxReady === '1', null, { timeout: 20000 });
  await page.waitForFunction(() => !!window.LXSys, null, { timeout: 20000 });
}

test('시트가 뜬다 — 콘솔 오류 0, 컴포넌트가 전부 조립된다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  await expect(page.locator('header.lx-masthead .lx-masthead__mark')).toHaveText('LAND-XI');
  await expect(page.locator('header.lx-masthead .lx-live')).toContainText('LIVE');
  await expect(page.locator('h1.lx-h1')).toContainText('표기법은 하나다');

  // 13개 섹션 + 각 컴포넌트 실체
  await expect(page.locator('.lx-index__row')).toHaveCount(15);      // services.js 15종
  await expect(page.locator('.lx-class__row')).toHaveCount(8);       // 여수 드론 8클래스
  await expect(page.locator('.lx-strip__i')).toHaveCount(4);         // 남원 4시점
  await expect(page.locator('.lx-stat')).toHaveCount(3);
  await expect(page.locator('.lx-hist .b')).toHaveCount(10);         // confHist 10 bin
  await expect(page.locator('.lx-cta')).not.toHaveCount(0);
  await expect(page.locator('.lx-split__menu li')).toHaveCount(4);

  // 실자산 타일이 실제로 그려졌는가(빈 액자 금지)
  const broken = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.lx-mosaic img')).filter(i => i.complete && i.naturalWidth === 0).length);
  expect(broken).toBe(0);
  const tiles = await page.locator('.lx-mosaic img').count();
  expect(tiles).toBeGreaterThan(40);

  expect(errs, errs.join('\n')).toEqual([]);
});

test('측정값 — 그리드 1컬럼 87.33px, 타이포 스케일이 실측값 그대로다', async ({ page }) => {
  await boot(page);
  const m = await page.evaluate(() => {
    const px = (el, p) => parseFloat(getComputedStyle(el)[p]);
    const h1 = document.querySelector('h1.lx-h1');
    const h2 = document.querySelector('#s02 .lx-h2');
    const body = document.querySelector('#s02 .lx-sec__aside .lx-body');
    const label = document.querySelector('#s02 .lx-label');
    const stat = document.querySelector('.lx-stat__n');
    const grid = document.querySelector('#lx-grid-demo i');
    const bar = document.querySelector('header.lx-masthead');
    return {
      col: grid.getBoundingClientRect().width,
      h1: [px(h1, 'fontSize'), px(h1, 'lineHeight')],
      h2: [px(h2, 'fontSize'), px(h2, 'lineHeight')],
      body: [px(body, 'fontSize'), px(body, 'lineHeight')],
      label: px(label, 'fontSize'),
      stat: [px(stat, 'fontSize'), px(stat, 'lineHeight')],
      barH: bar.getBoundingClientRect().height,
      radius: getComputedStyle(document.querySelector('.lx-fig')).borderTopLeftRadius,
      shadow: getComputedStyle(document.querySelector('.lx-fig')).boxShadow,
    };
  });
  expect(m.col).toBeCloseTo(87.33, 1);          // 12컬럼 · 여백 64 · 거터 24 @1440
  expect(m.h1).toEqual([66, 82]);
  expect(m.h2).toEqual([54, 59.4]);
  expect(m.body).toEqual([18, 26]);
  expect(m.label).toBe(14);
  expect(m.stat).toEqual([126, 145]);
  expect(m.barH).toBeCloseTo(79, 0);
  expect(m.radius).toBe('0px');                  // 라운드 0
  expect(m.shadow).toBe('none');                 // 그림자 0
});

test('카운트업 — 실제 산출물 값에 정확히 도달한다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const targets = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.lx-stat__n')).map(n => Number(n.dataset.to)));
  expect(targets).toEqual([38057, 9664, 2098]);  // services.js / results.js 실측

  await page.evaluate(() =>
    Promise.all(Array.from(document.querySelectorAll('.lx-stat__n')).map(n => window.LXSys.countUp(n))));
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.lx-stat__n')).every(n => n.dataset.done === '1'));

  await expect(page.locator('.lx-stat__n').nth(0)).toHaveText('38,057');
  await expect(page.locator('.lx-stat__n').nth(1)).toHaveText('9,664');
  await expect(page.locator('.lx-stat__n').nth(2)).toHaveText('2,098');

  // 글자별 현상이 끝났으면 모든 글자가 잉크색으로 앉아 있다
  const notIn = await page.evaluate(() =>
    document.querySelectorAll('.lx-stat__ch:not(.is-in)').length);
  expect(notIn).toBe(0);
  expect(errs, errs.join('\n')).toEqual([]);
});

test('슬라이더가 히스토그램 임계선을 움직인다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  const read = () => page.evaluate(() => ({
    x: Number(document.querySelector('#lx-thr-line').getAttribute('x1')),
    t: document.querySelector('#lx-threshold').dataset.t,
    shown: Number(document.querySelector('#lx-threshold').dataset.shown),
    on: document.querySelectorAll('.lx-hist .b.on').length,
    val: document.querySelector('#lx-thr-val').textContent,
  }));

  const a = await read();
  expect(a.t).toBe('0.72');
  expect(a.x).toBeCloseTo(720, 0);               // 0.72 → viewBox 1000 기준 x=720

  await page.locator('#lx-thr-input').fill('30');
  const b = await read();
  expect(b.x).toBeCloseTo(300, 0);
  expect(b.x).toBeLessThan(a.x);
  expect(b.val).toBe('0.30');
  expect(b.shown).toBeGreaterThan(a.shown);      // 임계를 내리면 표시가 늘어난다
  expect(b.on).toBeGreaterThan(a.on);            // 통과 구간(액센트)도 늘어난다

  await page.locator('#lx-thr-input').fill('88');
  const c = await read();
  expect(c.x).toBeCloseTo(880, 0);
  expect(c.shown).toBeLessThan(b.shown);
  await expect(page.locator('#lx-thr-read')).toContainText('/ 2,078건');
  await expect(page.locator('#lx-thr-read')).toContainText('감쇠');

  expect(errs, errs.join('\n')).toEqual([]);
});

test('타임라인·필름스트립이 같은 축을 공유한다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('.lx-strip__i.is-sel')).toHaveCount(1);
  await expect(page.locator('.lx-strip__i.is-sel')).toContainText('2025-08');
  await expect(page.locator('.lx-ruler__lab.on')).toContainText('2025-08');

  await page.locator('.lx-strip__i').nth(0).click();
  await expect(page.locator('.lx-strip__i.is-sel')).toContainText('2025-04');
  await expect(page.locator('.lx-ruler__lab.on')).toContainText('2025-04');
  await expect(page.locator('#lx-time-read')).toContainText('1.08');   // imagery.js GSD 0.0108
});

test('커서 십자선은 플레이트 위에서만 켜진다', async ({ page }) => {
  await boot(page);
  const plate = page.locator('#s05 .lx-fig__slot');
  await expect(plate).toHaveClass(/has-cross/);
  await expect(plate.locator('.lx-cross')).toHaveCount(1);
  await expect(plate.locator('.lx-cross')).not.toHaveClass(/on/);

  await plate.hover({ position: { x: 300, y: 140 } });
  await expect(plate.locator('.lx-cross')).toHaveClass(/on/);
  await expect(plate.locator('.lx-cross__r')).toContainText(/12[0-9]\.\d{4}, 3[0-9]\.\d{4}\s+EPSG:4326/);

  // 시트 어디에도 전역 커스텀 커서는 없다
  const bodyCursor = await page.evaluate(() => getComputedStyle(document.body).cursor);
  expect(bodyCursor).toBe('auto');
});

test('1024 — 타입 스케일은 그대로, 여백만 32px 로 줄어든다', async ({ page }) => {
  const errs = watch(page);
  await page.setViewportSize({ width: 1024, height: 900 });
  await boot(page);
  const m = await page.evaluate(() => {
    const px = (s, p) => parseFloat(getComputedStyle(document.querySelector(s))[p]);
    const g = document.querySelector('.lx-grid').getBoundingClientRect();
    const pad = getComputedStyle(document.querySelector('.lx-grid')).paddingLeft;
    return { h1: px('h1.lx-h1', 'fontSize'), h2: px('#s02 .lx-h2', 'fontSize'),
             body: px('#s02 .lx-sec__aside .lx-body', 'fontSize'), pad, w: g.width };
  });
  expect(m.h1).toBe(66);      // fluid type 금지 — 1024에서도 같다
  expect(m.h2).toBe(54);
  expect(m.body).toBe(18);
  expect(m.pad).toBe('32px');
  expect(errs, errs.join('\n')).toEqual([]);
});

test('모션 축소 — 리빌이 즉시 최종 상태다', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errs = watch(page);
  await boot(page);
  const hidden = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-reveal]'))
      .filter(n => getComputedStyle(n).opacity !== '1').length);
  expect(hidden).toBe(0);
  await page.evaluate(() => window.LXSys.countUp(document.querySelector('.lx-stat__n')));
  await expect(page.locator('.lx-stat__n').first()).toHaveText('38,057');
  expect(errs, errs.join('\n')).toEqual([]);
  await ctx.close();
});
