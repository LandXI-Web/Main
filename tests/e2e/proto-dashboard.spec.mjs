import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const URL = 'proto/dashboard.html';
const SHOTS = 'shots/proto-dash';
fs.mkdirSync(SHOTS, { recursive: true });

// 오프라인에서 웹폰트 CDN 이 404 나는 것은 이 프로토의 정상 동작이다.
// 네트워크 실패는 무시하고, 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload/i;

function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (!NETWORK.test(t)) errs.push('console: ' + t);
  });
  return errs;
}

/** 로그인 플래그를 심고 리포트를 연다. 자[ruler]는 끝(오늘)에 세워 화면을 고정한다. */
async function boot(page, q = '', { freeze = true } = {}) {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL + q);
  await page.waitForFunction(() => window.__db && window.__db.ready, null, { timeout: 20000 });
  await page.waitForFunction(() => document.documentElement.dataset.atlas === 'ready', null, { timeout: 20000 });
  if (freeze) await page.evaluate(() => window.__db.ruler.seek(1));
  await page.waitForTimeout(400);
}

test('로그인 관문 — 플래그가 없으면 리포트가 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(page.url()).toMatch(/login\.html\?next=/);
  expect(decodeURIComponent(page.url())).toContain('proto/dashboard.html');
});

test('로드 — 콘솔 오류 0, 실경계 249개, 매트릭스 98칸', async ({ page }) => {
  const errs = watch(page);
  await boot(page);

  expect(await page.evaluate(() => window.__db.sigungu())).toBe(249);      // sigungu.geojson 실경계
  expect(await page.evaluate(() => window.__db.cells())).toBe(98);         // 14 시군 × 7 실태조사
  expect(await page.evaluate(() => window.__db.litCodes().length)).toBe(14);
  expect(await page.evaluate(() => window.__db.queue())).toBe(7);
  // 표지 도판 — 리포 안의 실제 정사영상 타일 4시점 × 4장이 실제로 그려져야 한다
  await expect(page.locator('#cover-strip .ep')).toHaveCount(4);
  expect(await page.evaluate(() => [...document.querySelectorAll('#cover-strip img')]
    .filter((i) => i.complete && i.naturalWidth > 0).length)).toBe(16);
  await expect(page.locator('#matrix tbody tr')).toHaveCount(14);
  await expect(page.locator('#matrix thead th')).toHaveCount(9);           // 코너 + 7 + 계

  // 관리 SaaS 크롬이 아니다 — 카드·그림자·라운드가 한 개도 없어야 한다.
  const chrome = await page.evaluate(() => {
    let radius = 0, shadow = 0;
    for (const el of document.querySelectorAll('#page *')) {
      const s = getComputedStyle(el);
      if (s.borderRadius !== '0px' && s.borderRadius !== '') radius++;
      if (s.boxShadow !== 'none' && !/inset/.test(s.boxShadow)) shadow++;
    }
    return { radius, shadow };
  });
  expect(chrome.radius).toBe(0);
  expect(chrome.shadow).toBe(0);

  expect(errs).toEqual([]);
});

test('KPI — 카운트업이 목표값에 도달한다', async ({ page }) => {
  await boot(page);
  await page.locator('#kpis').scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () => JSON.stringify(window.__db.kpi()) === JSON.stringify(window.__db.kpiTargets()),
    null, { timeout: 10000 });
  const [v, targets] = await page.evaluate(() => [window.__db.kpi(), window.__db.kpiTargets()]);
  expect(v).toEqual(targets);
  expect(v).toEqual([21, 8, 2, 6]);                                        // dashboard.js 실값
  await expect(page.locator('#kpis .k')).toHaveCount(4);
  // 124px 두 개 + 52px 두 개 — 굵기가 아니라 크기로 위계를 만든다.
  const sizes = await page.$$eval('#kpis .k__v', (els) => els.map((e) => getComputedStyle(e).fontSize));
  expect(sizes).toEqual(['124px', '124px', '52px', '52px']);
});

test('커버리지 — 매트릭스 행과 실경계 폴리곤이 양방향으로 붙는다', async ({ page }) => {
  await boot(page);
  await page.locator('#sec-cov').scrollIntoViewIfNeeded();

  // 매트릭스 → 판
  await page.locator('#matrix tbody tr[data-code="52190"] th').hover();
  await expect(page.locator('#atlas path.a-lit[data-code="52190"]')).toHaveClass(/is-hot/);
  expect(await page.evaluate(() => window.__db.hot())).toBe('52190');
  await expect(page.locator('#cov-tip')).toBeVisible();
  await expect(page.locator('#cov-tip')).toContainText('남원시');
  // 비매칭은 삭제가 아니라 감쇠다 — 사라지지는 않는다
  await expect.poll(async () => Number(
    await page.$eval('#matrix tbody tr[data-code="52110"]', (el) => getComputedStyle(el).opacity),
  ), { timeout: 3000 }).toBeLessThan(0.5);
  await expect(page.locator('#matrix tbody tr[data-code="52110"]')).toBeVisible();

  // 판 → 매트릭스
  await page.locator('#matrix').hover({ position: { x: 2, y: 2 } });
  await page.evaluate(() => {
    const p = document.querySelector('#atlas path.a-lit[data-code="52800"]');
    const b = p.getBoundingClientRect();
    p.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
    }));
  });
  await expect(page.locator('#matrix tbody tr[data-code="52800"]')).toHaveClass(/is-hot/);
  await expect(page.locator('#cov-tip')).toContainText('부안군');
});

test('딥링크 ?tab= — 차트 탭이 URL 로 열린다', async ({ page }) => {
  await boot(page, '?tab=storage');
  expect(await page.evaluate(() => window.__db.tab())).toBe('storage');
  await expect(page.locator('#chart-tabs button[data-tab="storage"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#chart .c-stack')).toBeVisible();

  await page.locator('#chart-tabs button[data-tab="visits"]').click();
  await expect(page.locator('#chart .c-line')).toBeVisible();
  await expect(page).toHaveURL(/tab=visits/);

  // ?sec= 로 장을 열고, ?q= 로 큐 한 줄을 그 자리에서 펼친다
  await boot(page, '?sec=log');
  expect(await page.evaluate(() => window.__db.chapter())).toBe('log');
  await boot(page, '?q=1');
  await expect(page.locator('#queue .q[data-i="1"] .q__d')).toBeVisible();
});

test('처리 대기 큐 — 인라인 상세, 모달 없음. 60일 초과는 액센트 헤어라인', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#queue .q')).toHaveCount(7);
  await expect(page.locator('#queue .q.is-hot')).toHaveCount(2);           // age 102 · 76
  await expect(page.locator('#queue .q.is-breath')).toHaveCount(1);        // 앰비언트는 하나뿐

  const first = page.locator('#queue .q').first();
  await expect(first.locator('.q__age')).toContainText('102');
  await first.locator('.q__row').click();
  await expect(first.locator('.q__d')).toBeVisible();
  await expect(first.locator('.q__linked')).toContainText('연결된 객체');
  expect(await page.locator('dialog, .modal, [role="dialog"]').count()).toBe(0);

  // 두 번째를 열면 첫 번째는 닫힌다 — 상세는 쌓이지 않는다
  await page.locator('#queue .q').nth(1).locator('.q__row').click();
  await expect(first.locator('.q__d')).toBeHidden();
});

test('시간 자 — 스스로 재생되고 사건에서 멈추며, 시점 밖은 감쇠한다', async ({ page }) => {
  await boot(page, '', { freeze: false });
  expect(await page.evaluate(() => window.__db.ruler.playing)).toBe(true);
  await expect(page.locator('#ruler .rul-e')).toHaveCount(6);              // 실데이터 사건 6건

  await page.evaluate(() => window.__db.ruler.seek(0));
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__db.dimmed())).toBeGreaterThan(10);
  await page.evaluate(() => window.__db.ruler.seek(1));
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => window.__db.dimmed())).toBe(0);
});

test('스크린샷 1440 — 장별', async ({ page }) => {
  await boot(page);
  await page.screenshot({ path: `${SHOTS}/00-cover.png` });
  await page.locator('#sec-queue').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOTS}/01-queue.png` });

  await page.evaluate(() => document.querySelector('#queue .q').querySelector('.q__row').click());
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/01-queue-open.png` });

  await page.locator('#sec-kpi').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/02-kpi.png` });

  await page.locator('#charts').scrollIntoViewIfNeeded();
  await page.evaluate(() => window.__db.setTab('storage'));
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${SHOTS}/02-chart-storage.png` });

  await page.locator('#cov-plate').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/03-coverage.png` });

  // 판 위 호버 — 툴팁 + 나머지 감쇠(스크롤을 옮기지 않기 위해 합성 포인터로 건드린다)
  await page.evaluate(() => {
    const p = document.querySelector('#atlas path.a-lit[data-code="52190"]');
    const b = p.getBoundingClientRect();
    p.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, clientX: b.x + b.width / 2, clientY: b.y + b.height / 2,
    }));
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/03-coverage-hover.png` });

  await page.locator('#matrix tbody tr[data-code="52190"] th').hover();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/03-matrix-hover.png` });

  await page.locator('#mat-plate').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/03-matrix.png` });

  await page.locator('#sec-log').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/04-log.png` });

  await page.screenshot({ path: `${SHOTS}/full.png`, fullPage: true });
});
