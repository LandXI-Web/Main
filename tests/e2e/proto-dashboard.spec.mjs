import { test, expect } from '@playwright/test';

// LX 관리자 대시보드 — 발주자 보드 B5-Dashboard-Data(1 판 + 토글 2 · 우 탭 패널 1).
// 조판 마스터   — design-canvas/v2/B5-Dashboard-Data.dc.html (1440×900)
// 기능 대조표   — docs/superpowers/proto/2026-08-26-dashboard-parity.md (A1–A11 / B1–B16)
const URL = 'proto/dashboard.html';

// 오프라인/외부 CDN(EOX 타일·폰트) 실패는 이 프로토의 정상 동작이다. 우리 코드가 던진 것만 실패로 본다.
const NETWORK = /Failed to load resource|net::ERR|ERR_|status of 40|status of 50|AbortError|preloaded using link preload|fonts\.g|jsdelivr|eox|WebGL/i;
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
  await page.locator('#tab-store').click();
  await page.locator('#rail [data-menu="project"]').click();            // 프로젝트 → 탭 1
  await page.waitForTimeout(400);
  await expect(page.locator('#tab-proj')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-proj')).toBeFocused();
  await page.locator('#rail [data-menu="map"]').click();                // 지도 서비스 → 판의 셀
  await page.waitForTimeout(400);
  await expect(page.locator('#cells .cell.is-hot')).toHaveCount(1);
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

test('B1–B15 — 원본 위젯이 전부, 각 한 번, 한 화면에 든다', async ({ page }) => {
  const errs = watch(page);
  await boot(page);
  await expect(page.locator('#b1')).toHaveText('LX 관리자 대시보드');                     // B1
  await expect(page.locator('#b2')).toContainText('기준일');                              // B2
  await expect(page.locator('#b-notice')).toContainText('고위험 탐지 건 긴급 처리 안내'); // B3
  await expect(page.locator('#b-notice')).toContainText('2026.04.15');
  await expect(page.locator('#b-kpi .k')).toHaveCount(5);                                 // B4–B8
  const kpi = await page.locator('#b-kpi').innerText();
  for (const t of ['전체 사용자', '발행 분석 카드', '카드 발행 승인 대기', '가입 승인 대기', '미답변 문의', '정상 19 · 가입 승인 대기 1', '공개 7 · 비공개 1', '검토 필요', '승인 필요', '전체 12 · 답변 필요']) expect(kpi, t).toContain(t);
  await expect(page.locator('#b-bb')).toContainText('XI-VFM v2.1');                       // B9
  await expect(page.locator('#bb-sub')).toContainText('2026.03.12');
  await expect(page.locator('#bb-sub')).toContainText('14개');
  await expect(page.locator('#pane-proj .rk')).toHaveCount(5);                            // B10
  await expect(page.locator('#pane-proj')).toContainText('도로안전 정사영상');
  await expect(page.locator('#pane-visit polyline')).toHaveCount(1);                       // B11
  await expect(page.locator('#pane-visit rect')).toHaveCount(7);
  await expect(page.locator('#pane-store rect')).toHaveCount(7);                          // B12 — 테두리 1 + 6분류
  await expect(page.locator('#ap-rows tr.ap')).toHaveCount(2);                            // B13
  await expect(page.locator('#ad-rows .ad')).toHaveCount(4);                               // B14
  await expect(page.locator('#foot')).toContainText('063-713-1213');                       // B15
  for (const s of ['#b1', '#b-bb', '#ap-table', '#pane-proj', '#pane-visit', '#pane-store', '#b-notice', '#plate']) await expect(page.locator(s)).toHaveCount(1);
  expect(await page.locator('#main [role=tab]').count()).toBe(5);                          // 탭 = 판 토글 2 + 우 패널 3 뿐
  expect(await page.evaluate(async () => /FFB633/i.test(await (await fetch('dashboard.css')).text()))).toBe(false);
  expect(await page.evaluate(() => document.querySelector('#foot').getBoundingClientRect().bottom)).toBeLessThanOrEqual(900);
  expect(errs, errs.join(' | ')).toEqual([]);
});

test('불필요한 글자 없음 — 설명 문장이 없다', async ({ page }) => {
  await boot(page);
  const t = await page.locator('body').innerText();
  for (const s of ['Data source', '출처 표기 —', '검토 대상 · 요청 순', '입력(우)']) expect(t).not.toContain(s);
});

/* ── 판 — 0.25° 그리드 · 실자산 셀 ──────────────────────────────────────── */

test('판 — 셀은 실좌표에서 투영된다: 남원 127.25–127.50 E · 35.25–35.50 N = 결과 2건, 여수 2건, 제주 = 학습데이터만', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#grid line')).not.toHaveCount(0);
  const nw = page.locator('#cells .cell[data-key="127.25,35.25"]');
  await expect(nw).toHaveAttribute('data-g', '2');
  expect(await nw.getAttribute('aria-label')).toContain('남원 127.25–127.50 E · 35.25–35.50 N — AI 분석 결과 2건');
  // 투영 검증 — 셀의 판 위 좌표가 그리드 선 위에 정확히 놓인다(0.25° 선 = 셀 변)
  const ok = await page.evaluate(() => {
    const el = document.querySelector('#cells .cell[data-key="127.25,35.25"]');
    const xs = [...document.querySelectorAll('#grid line')].filter((l) => l.getAttribute('y1') === '0').map((l) => +l.getAttribute('x1'));
    const left = parseFloat(el.style.left), right = left + parseFloat(el.style.width);
    return xs.some((x) => Math.abs(x - left) < 0.6) && xs.some((x) => Math.abs(x - right) < 0.6);
  });
  expect(ok).toBe(true);
  const legend = await page.locator('#legend').innerText();
  expect(legend).toContain('결과 2건'); expect(legend).toContain('학습데이터만');
  // 셀 등급 = 실데이터 집계
  expect(await page.locator('#cells .cell[data-g="2"]').count()).toBe(2);                 // 남원 · 여수
  expect(await page.locator('#cells .cell[data-g="1"]').count()).toBe(1);                 // 남원 변화지수(비지도)
  expect(await page.locator('#cells .cell[data-g="train"]').count()).toBeGreaterThanOrEqual(3);
  const jeju = page.locator('#cells .cell[data-g="train"]', { has: page.locator(':scope') }).first();
  expect(await jeju.getAttribute('aria-label')).toMatch(/학습데이터만/);
});

test('셀 호버 — 콜아웃이 실값을 말하고, 브래킷이 서며, Esc 로 내린다', async ({ page }) => {
  await boot(page);
  const nw = page.locator('#cells .cell[data-key="127.25,35.25"]');
  await nw.hover(); await page.waitForTimeout(300);
  await expect(page.locator('#callout')).toBeVisible();
  const c = await page.locator('#callout').innerText();
  for (const t of ['남원', '127.25–127.50 E', '35.25–35.50 N', 'AI 분석 결과 2건', '농지이용 2,098필지', '비닐하우스 9,664동']) expect(c, t).toContain(t);
  expect(await nw.locator('.bk').evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity))).toEqual(['1', '1', '1', '1']);
  await page.locator('#cells .cell[data-g="1"]').hover(); await page.waitForTimeout(300);
  expect(await page.locator('#callout').innerText()).toContain('변화지수 456폴리곤 · 비지도');
  await page.mouse.move(400, 760); await page.waitForTimeout(300);
  await expect(page.locator('#callout')).toBeHidden();
  await nw.focus(); await page.waitForTimeout(200);
  await expect(page.locator('#callout')).toBeVisible();
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await expect(page.locator('#callout')).toBeHidden();
});

test('판 토글 — 학습데이터 모드는 정사영상 시점 수로 칠하고 콜아웃도 바뀐다', async ({ page }) => {
  await boot(page);
  await page.locator('#seg-train').click(); await page.waitForTimeout(300);
  await expect(page.locator('#plate-wrap')).toHaveAttribute('data-mode', 'train');
  await expect(page.locator('#seg-train')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#cells .cell[data-key="127.25,35.50"]')).toHaveAttribute('data-g', '3');   // 남원 AOI 4시점
  await page.locator('#cells .cell[data-key="127.25,35.50"]').hover(); await page.waitForTimeout(300);
  const c = await page.locator('#callout').innerText();
  expect(c).toContain('학습데이터'); expect(c).toContain('2025-06 · GSD 1.69 cm');
  expect(await page.locator('#legend').innerText()).toContain('시점 4 이상');
  await page.locator('#seg-res').click();
  await expect(page.locator('#cells .cell[data-key="127.25,35.25"]')).toHaveAttribute('data-g', '2');
});

test('셀 클릭 → XI맵(원본 ximap.html 의 자리) 로 셀 좌표를 넘긴다', async ({ page }) => {
  await boot(page);
  const [req] = await Promise.all([
    page.waitForRequest((r) => /ximap\.html\?cell=/.test(r.url())),
    page.locator('#cells .cell[data-key="127.25,35.25"]').click(),
  ]);
  expect(decodeURIComponent(req.url())).toContain('ximap.html?cell=127.25,35.25&mode=res');
});

/* ── 우 탭 패널 (B10 | B11 | B12) ─────────────────────────────────────── */

test('탭 패널 — 탭 3이 B10·B11·B12 를 전환하고, 키보드·localStorage·카운트업이 산다', async ({ page }) => {
  await boot(page);
  await expect(page.locator('#tab-proj')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pane-proj .rk.on .val')).toHaveText('412');
  await expect(page.locator('#pane-proj .rk.on .bar i')).toHaveCSS('background-color', 'rgb(0, 109, 247)');
  await page.locator('#tab-visit').click();
  await expect(page.locator('#pane-visit')).toBeVisible(); await expect(page.locator('#pane-proj')).toBeHidden();
  const early = await page.locator('#v-ax span.pk b').innerText();
  await page.waitForTimeout(1100);
  await expect(page.locator('#v-ax span.pk b')).toHaveText('1,150');
  expect(+early.replace(/,/g, '')).toBeLessThanOrEqual(1150);
  expect(await page.locator('#r-sub').innerText()).toContain('5,575');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#tab-store')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#pane-store')).toBeVisible();
  await page.waitForTimeout(1100);
  await expect(page.locator('#pane-store .pane-big .big')).toHaveText('44.5');
  expect(await page.locator('#pane-store').innerText()).toContain('정사영상');
  expect(await page.evaluate(() => localStorage.getItem('lx_dash_tab'))).toBe('store');
  await page.reload(); await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  await expect(page.locator('#tab-store')).toHaveAttribute('aria-selected', 'true');
  expect(await page.locator('#tabs [role=tab][tabindex="0"]').count()).toBe(1);
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

/* ── 도착 · 반응형 · 모션 ─────────────────────────────────────────────── */

test('도착 — KPI 숫자가 900ms 카운트업으로 도착한다', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(URL);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  const early = await page.locator('#b-kpi .k .big').first().innerText();
  await page.waitForTimeout(1200);
  await expect(page.locator('#b-kpi .k .big').first()).toHaveText('21');
  expect(+early.replace(/,/g, '')).toBeLessThanOrEqual(21);
});

test('반응형 — 1280 에서 가로 넘침이 없고, 1100 미만이면 판과 패널이 세로로 선다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false);
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.waitForTimeout(400);
  const [l, r] = await Promise.all(['#left', '#right'].map((s) => page.locator(s).evaluate((e) => e.getBoundingClientRect().top)));
  expect(r).toBeGreaterThan(l + 200);
  // 판이 줄어도 셀은 그리드 선 위에 남는다
  const ok = await page.evaluate(() => {
    const el = document.querySelector('#cells .cell[data-key="127.25,35.25"]');
    const xs = [...document.querySelectorAll('#grid line')].filter((l) => l.getAttribute('y1') === '0').map((l) => +l.getAttribute('x1'));
    return xs.some((x) => Math.abs(x - parseFloat(el.style.left)) < 0.6);
  });
  expect(ok).toBe(true);
});

test('접근성·모션 — 감소 모션에서 숫자가 바로 도착하고 막대가 서 있다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await boot(page);
  await expect(page.locator('#b-kpi .k .big').first()).toHaveText('21');
  expect(await page.locator('#pane-proj .rk.on .bar i').evaluate((e) => getComputedStyle(e).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
});
