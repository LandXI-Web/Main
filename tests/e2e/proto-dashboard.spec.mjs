import { test, expect } from '@playwright/test';

// LX 관리자 대시보드 — SPLIT-5050 판 스택(지도 위젯 없음).
// 조판 마스터   — design-canvas/v2/B5-Dashboard.dc.html rev2 (NOTES.md §12.5, 1440×900)
// 기능 대조표   — docs/superpowers/proto/2026-08-26-dashboard-parity.md (A1–A11 / B1–B16)
const URL = 'proto/dashboard.html';

// 오프라인/외부 CDN 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|fonts\.g|jsdelivr/i;
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !NETWORK.test(m.text())) errs.push('console: ' + m.text()); });
  return errs;
}
async function boot(page, q = '') {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL + q);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready', null, { timeout: 30000 });
  await page.waitForTimeout(1000);
}
const geoReady = (page) => page.waitForFunction(() => /ready|partial/.test(document.documentElement.dataset.geo || ''), null, { timeout: 30000 });

test('로그인 관문 — 플래그가 없으면 관리자 화면이 한 프레임도 새지 않는다', async ({ page }) => {
  await page.goto(URL);
  await page.waitForURL(/login\.html/, { timeout: 10000 });
  expect(decodeURIComponent(page.url())).toContain('next=dashboard.html');
});

/* ── A. 좌측 레일 ─────────────────────────────────────────────────────── */

test('A1–A11 레일 — 원본 include/header.html 의 메뉴가 순서까지 그대로다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  const names = await page.locator('#rail .rail-i .rl').allInnerTexts();
  expect(names).toEqual(['대시보드', '데이터 관리', '프로젝트', '분석 서비스', '지도 서비스', '서비스 지원', '카드 발행 관리', '서비스 관리', 'MY', '로그아웃']);
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('title', '원본 dataset.html');
  await expect(page.locator('#rail [data-menu="media"]')).toHaveAttribute('data-go', 'dataset.html');
  await expect(page.locator('#rail [data-menu="dashboard"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('#rail-mark')).toHaveAttribute('href', 'scrub/index.html');
  // A10 MY 플라이아웃 — 마이 페이지 · 로그아웃
  await page.locator('#rail [data-menu="my"]').click();
  await expect(page.locator('#rail-my')).toBeVisible();
  expect(await page.locator('#rail-my').innerText()).toContain('마이 페이지');
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('A4–A9 레일 — 원본 페이지 대신 같은 데이터가 있는 자리로 데려간다', async ({ page }) => {
  await boot(page);
  await page.locator('#rail [data-menu="publish-admin"]').click();
  await page.waitForTimeout(700);
  await expect(page.locator('#b-approve')).toBeInViewport();
  await page.locator('#rail [data-menu="project"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator('#plates-r .pl.is-front')).toBeFocused();
  await expect(page.locator('#plates-r .pl.is-front')).toHaveClass(/is-hot/);   // 포커스 = 호버와 같은 장치
});

test('A11 로그아웃 — 로그인 플래그를 지우고 메인(scrub)으로 간다', async ({ page }) => {
  await boot(page);
  const cleared = page.evaluate(() => new Promise((res) => {
    const rm = localStorage.removeItem.bind(localStorage);
    localStorage.removeItem = (k) => { rm(k); if (k === 'lx_logged_in') res(true); };
  }));
  await page.locator('#rail-foot [data-action="logout"]').click();
  expect(await cleared).toBe(true);
  await page.waitForURL(/scrub\/index\.html/, { timeout: 10000 });
});

/* ── B. 위젯 — 각 1회 ─────────────────────────────────────────────────── */

test('B1–B15 — 원본 위젯이 전부, 각 한 번, 지도 없이 한 화면에 든다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page.locator('#b1')).toHaveText('LX 관리자 대시보드');                     // B1
  await expect(page.locator('#b2')).toContainText('기준일');                              // B2
  await expect(page.locator('#b-notice')).toContainText('고위험 탐지 건 긴급 처리 안내'); // B3
  await expect(page.locator('#b-notice')).toContainText('2026.04.15');
  await expect(page.locator('#b-kpi .k')).toHaveCount(4);                                 // B4 B6 B7 B8
  const kpi = await page.locator('#b-kpi').innerText();
  for (const t of ['전체 사용자', '카드 발행 승인 대기', '가입 승인 대기', '미답변 문의', '정상 19', '검토 필요', '승인 필요', '전체 12']) expect(kpi, t).toContain(t);
  await expect(page.locator('#b5')).toContainText('발행 분석 카드');                       // B5 — 좌 스택 헤더 1회
  await expect(page.locator('#b5')).toContainText('공개 7 · 비공개 1');
  await expect(page.locator('#b-bb')).toContainText('XI-VFM v2.1');                       // B9
  await expect(page.locator('#b-bb')).toContainText('2026.03.12');
  await expect(page.locator('#b10')).toContainText('1,326');                              // B10 — 우 스택 헤더 1회
  await expect(page.locator('#sr-sub')).toContainText('도로안전 정사영상 412');
  await expect(page.locator('#t-visit polyline')).toHaveCount(1);                          // B11
  await expect(page.locator('#t-visit rect')).toHaveCount(7);
  await expect(page.locator('#t-visit')).toContainText('1,150');
  await expect(page.locator('#t-store rect')).toHaveCount(7);                             // B12 — 테두리 1 + 6분류
  await expect(page.locator('#b-store')).toContainText('/ 184 TB');
  await expect(page.locator('#ap-rows tr.ap')).toHaveCount(2);                            // B13
  await expect(page.locator('#ad-rows .ad')).toHaveCount(4);                               // B14
  await expect(page.locator('#foot')).toContainText('063-713-1213');                       // B15
  // 각 1회 — 제목·백본·표는 문서에 하나뿐
  for (const s of ['#b1', '#b-bb', '#ap-table', '#t-visit', '#t-store', '#b-notice']) await expect(page.locator(s)).toHaveCount(1);
  // 지도 위젯 0 · 탭 0 · 앰버 0
  expect(await page.locator('.maplibregl-map, canvas, [role=tab]').count()).toBe(0);
  expect(await page.evaluate(async () => /FFB633/i.test(await (await fetch('dashboard.css')).text()))).toBe(false);
  // 한 화면 — 1440×900 에서 본문이 세로 스크롤 없이 든다
  expect(await page.evaluate(() => document.querySelector('#foot').getBoundingClientRect().bottom)).toBeLessThanOrEqual(900);
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('불필요한 글자 없음 — 설명 문장·콜로폰이 없다', async ({ page }) => {
  await boot(page);
  const t = await page.locator('body').innerText();
  for (const s of ['한눈에', '입력(우)', '출처 표기 —', '검토 대상 · 요청 순']) expect(t).not.toContain(s);
});

/* ── 판 스택 ─────────────────────────────────────────────────────────── */

test('판 스택 — 좌 6장(실측 4 · 비지도 고스트 1 · 준비 중 1) · 우 7장(정사영상 6 · 미등록 고스트 1), 앞 판은 01', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#plates-l .pl')).toHaveCount(6);
  await expect(page.locator('#plates-r .pl')).toHaveCount(7);
  await expect(page.locator('#plates-l .pl.is-ghost')).toHaveCount(2);
  await expect(page.locator('#plates-r .pl.is-ghost')).toHaveCount(1);
  await expect(page.locator('#plates-l .pl.is-front')).toHaveAttribute('data-no', '01');
  await expect(page.locator('#plates-l .pl.is-front')).toHaveAttribute('data-id', 'namwon-farmland-2025');
  const zs = await page.locator('#plates-l .pl').evaluateAll((els) => els.map((e) => +e.style.zIndex));
  expect(zs).toEqual([1, 2, 3, 4, 5, 6]);
  // 실크롭이 걸려 있다(크롭 카탈로그 경로)
  const imgs = await page.locator('#plates-l .pl img').evaluateAll((els) => els.map((e) => e.getAttribute('src')));
  expect(imgs.length).toBe(5);
  for (const s of imgs) expect(s).toMatch(/^\.\.\/assets\/proto\/crops\//);
  // 우 스택 라벨 = imagery.js 그대로
  const labs = await page.locator('#plates-r .pl .lab').allInnerTexts();
  expect(labs.join('\n')).toContain('GSD 1.69 cm');
  expect(labs.join('\n')).toContain('GSD 1.08 cm');
  expect(labs.join('\n')).toContain('국산리 드론 A68 · A71');
});

test('결과 지오메트리 — GeoJSON 이 크롭 창으로 투영되어 청록으로 선다(실측 4 + 변화지수 고스트)', async ({ page }) => {
  await boot(page);
  await geoReady(page);
  const geo = await page.locator('#plates-l .pl').evaluateAll((els) => els.map((e) => [e.dataset.no, e.dataset.geo, e.dataset.win, e.querySelectorAll('.geo path, .geo rect').length]));
  const byNo = Object.fromEntries(geo.map(([no, n, win, k]) => [no, { n: +n, win: +win, k }]));
  for (const no of ['01', '02', '03', '04', '05']) { expect(byNo[no].n, no).toBeGreaterThan(0); expect(byNo[no].k, no).toBe(byNo[no].n); }
  expect(byNo['01'].win).toBeGreaterThanOrEqual(70); expect(byNo['01'].win).toBeLessThanOrEqual(120);   // make_crops 규칙
  expect(byNo['05'].win).toBe(90);
  // 우 스택은 청록 0
  expect(await page.locator('#plates-r .geo path, #plates-r .geo rect').count()).toBe(0);
  // 청록만 — 판 위 지오메트리 색
  const stroke = await page.locator('#plates-l .pl.is-front .geo path').first().evaluate((e) => getComputedStyle(e).stroke);
  expect(stroke.replace(/\s/g, '')).toBe('rgb(15,169,160)');
});

test('호버 — 판이 8px 뜨고 브래킷·리더선·콜아웃이 서며 나머지는 .54 로 감쇠한다(삭제 아님)', async ({ page }) => {
  await boot(page);
  await geoReady(page);
  const front = page.locator('#plates-l .pl.is-front');
  await front.hover();
  await page.waitForTimeout(400);
  await expect(front).toHaveClass(/is-hot/);
  expect(await front.evaluate((e) => getComputedStyle(e).transform)).toMatch(/matrix\(1, 0, 0, 1, 0, -8\)/);
  expect(await page.locator('#plates-l .pl[data-no="02"]').evaluate((e) => +getComputedStyle(e).opacity)).toBeCloseTo(0.54, 2);
  expect(await page.locator('#plates-l .pl[data-no="02"]').isVisible()).toBe(true);
  await expect(front.locator('.callout')).toBeVisible();
  expect(await front.locator('.bk').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1', '1', '1']);
  // 콜아웃 내용 = 실값
  const c = await front.locator('.callout').innerText();
  for (const t of ['남원 농지이용', '2,098', '경작지 1,291', '비경작지 807', 'XI-VFM v2.1', '0.45', '판 위', '측정', '2026.06.08']) expect(c, t).toContain(t);
  expect(await front.locator('.callout').evaluate((e) => getComputedStyle(e).borderTopColor)).toBe('rgb(0, 109, 247)');
  // 우 스택 앞 판
  const r = page.locator('#plates-r .pl.is-front');
  await r.hover(); await page.waitForTimeout(400);
  await expect(front).not.toHaveClass(/is-hot/);
  const rc = await r.locator('.callout').innerText();
  for (const t of ['남원 농경지 2025-06', 'GSD 1.69', 'E 127.348', 'N 35.528', '줌 12–19', '2,098 + 1,674', '318 GB', '촬영 2025-06']) expect(rc, t).toContain(t);
  // 고스트 콜아웃 — 준비 중은 이유를 말한다
  await page.locator('#plates-l .pl[data-no="06"] .lab').hover(); await page.waitForTimeout(300);
  expect(await page.locator('#plates-l .pl[data-no="06"] .callout').innerText()).toContain('결과 파일 없음');
  await page.mouse.move(700, 850); await page.waitForTimeout(300);
  expect(await page.locator('.pl.is-hot').count()).toBe(0);
});

test('키보드 — Tab 으로 판에 들어가면 호버와 같은 장치가 서고 Esc 로 내린다', async ({ page }) => {
  await boot(page);
  await page.locator('#plates-l .pl[data-no="02"]').focus();
  await page.waitForTimeout(300);
  await expect(page.locator('#plates-l .pl[data-no="02"]')).toHaveClass(/is-hot/);
  await expect(page.locator('#plates-l .pl[data-no="02"] .callout')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  expect(await page.locator('.pl.is-hot').count()).toBe(0);
});

/* ── B16 딥링크 ─────────────────────────────────────────────────────── */

test('B16 ?status=대기 — KPI ③ 가 승인 대기 블록으로 데려간다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#b-kpi a.k')).toHaveAttribute('href', 'dashboard.html?status=대기');
  await page.locator('#b-kpi a.k').click();
  await page.waitForURL(/status=/);
  await page.waitForFunction(() => document.documentElement.dataset.deep === 'status');
  await expect(page.locator('#b-approve')).toHaveAttribute('aria-current', 'true');
  await expect(page.locator('#b-approve')).toBeInViewport();
});

test('B16 ?open=<id> — 승인 행이 그 카드로 열린다', async ({ page }) => {
  await boot(page);
  const hrefs = await page.locator('#ap-rows tr.ap .go').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
  expect(hrefs).toEqual(['dashboard.html?open=pa-1', 'dashboard.html?open=pa-6']);
  await page.locator('#ap-rows tr.ap').nth(1).locator('td').nth(1).click();
  await page.waitForURL(/open=pa-6/);
  await page.waitForFunction(() => document.documentElement.dataset.deep === 'open:pa-6');
  await expect(page.locator('#ap-rows tr.ap[data-id="pa-6"]')).toHaveAttribute('aria-current', 'true');
  expect(await page.locator('#ap-rows tr.ap[data-id="pa-6"]').innerText()).toContain('농지 활용 분석');
  await expect(page.locator('#ap-rows tr.ap[data-id="pa-6"]')).toHaveCSS('background-color', 'rgb(214, 230, 255)');
});

/* ── 도착 · 유휴 · 반응형 ─────────────────────────────────────────────── */

test('도착 — 숫자가 900ms 카운트업으로 도착하고, 유휴 움직임은 앞 판 스윕 하나뿐(≥6 s)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  const early = await page.locator('#b-kpi .k .big').first().innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator('#b-kpi .k .big').first()).toHaveText('21');
  expect(+early.replace(/,/g, '')).toBeLessThanOrEqual(21);
  await geoReady(page);
  const sweeps = await page.evaluate(() => new Promise((res) => {
    const seen = []; const t0 = performance.now();
    const ob = new MutationObserver(() => { const f = document.querySelector('.pl.is-sweep'); if (f && !seen.length) seen.push(performance.now() - t0); });
    ob.observe(document.querySelector('#plates-l'), { attributes: true, subtree: true, attributeFilter: ['class'] });
    setTimeout(() => { ob.disconnect(); res(seen); }, 7500);
  }));
  expect(sweeps.length).toBe(1);
  expect(await page.locator('.pl.is-sweep, .is-sweep').count()).toBeLessThanOrEqual(1);
});

test('반응형 — 1280 에서 마진 안에 들고, 1100 미만이면 스택이 세로로 선다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  const over = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(over).toBe(false);
  const ps = await page.locator('#plates-l').evaluate((e) => +getComputedStyle(e).getPropertyValue('--ps'));
  expect(ps).toBeLessThan(1);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(400);
  const [l, r] = await Promise.all(['#stack-l', '#stack-r'].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
  expect(r).toBeGreaterThan(l + 300);
});

test('접근성·모션 — 감소 모션에서 화면이 스스로 움직이지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await expect(page.locator('#b-kpi .k .big').first()).toHaveText('21');
  await geoReady(page);
  await page.waitForTimeout(6500);
  expect(await page.locator('.is-sweep').count()).toBe(0);
});
