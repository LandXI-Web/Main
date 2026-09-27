// F2-C 3차 판정 — 관제 화면 간 이동마다 오른쪽 판이 순수 검정(max RGB < 24) 25프레임 · 73.5 s 빈 골격(결재 — · 배포본 —).
// 고침: 각 화면 HTML 이 첫 페인트에 정적 골격(#ogSkel · 레일 · 마스트 · 판 머리)을 세우고, 직전 방문 스냅샷이 있으면 그 화면으로 덮는다.
// 모듈이 실데이터로 셸을 세우면 boot.js unveil() 이 걷는다('—' 골격 노출 0). 영상 실측은 shots/f2/C/tools/navcheck.mjs(20 fps · max RGB).
import { test, expect } from '@playwright/test';
import { OPS, gwUp, gwAdmin, ready } from '../../shots/f2/C/tools/e2e-util.mjs';
test.setTimeout(90000);
const PAGES = [['index', '운영 현황'], ['infra', '인프라 관제'], ['tenants', '기관·할당'], ['deploys', '배포 제어']];

for (const [pg, title] of PAGES) {
  test(`첫 페인트 골격 — ${pg}: 모듈 전(boot.js 1.5 s 지연)에도 레일 · 마스트 제목 · 판 머리가 보인다 → ready 에 걷힘 · 셸 하나`, async ({ page }) => {
    test.skip(!(await gwUp()), '게이트웨이 없음');
    await page.setViewportSize({ width: 720, height: 900 });
    await gwAdmin(page);
    await page.addInitScript(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('lxops:snap:')) localStorage.removeItem(k); });   // 첫 방문(스냅샷 없음)
    await page.route('**/landxi/ops/js/boot.js', async (r) => { await new Promise((res) => setTimeout(res, 1500)); await r.continue(); });
    await page.goto(`${OPS}/landxi/ops/${pg}.html`, { waitUntil: 'domcontentloaded' });
    const sk = page.locator('#ogSkel');
    await expect(sk).toBeVisible();
    await expect(sk.locator('.og-mast h1')).toHaveText(title);
    await expect(sk.locator('.og-nav a[aria-current="page"]')).toHaveText(title);
    expect(await sk.locator('.sk-panel header h2').count()).toBeGreaterThanOrEqual(3);
    // 판이 순수 검정이 아님: 보이는 글자(흰 · 회색)가 있다 — 레일 글자 색 밝기
    const lum = await page.evaluate(() => { const c = getComputedStyle(document.querySelector('#ogSkel .og-mast h1')).color.match(/\d+/g).map(Number); return Math.max(...c.slice(0, 3)); });
    expect(lum).toBeGreaterThan(200);
    await ready(page);
    await expect(sk).toHaveCount(0);
    await expect(page.locator('.og-shell')).toHaveCount(1);
    expect(await page.evaluate(() => document.body.classList.contains('has-skel'))).toBe(false);
  });
}

test('직전 화면 스냅샷 — 떠날 때(pagehide) 저장 → 다시 오면 첫 페인트가 그 화면 + 꼬리표 · id/data-k 중복 0 · ready 에 걷힘', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  await page.setViewportSize({ width: 720, height: 900 });
  await gwAdmin(page);
  await page.goto(`${OPS}/landxi/ops/infra.html`); await ready(page); await page.waitForTimeout(800);
  await page.goto(`${OPS}/landxi/ops/tenants.html?tenant=lx`); await ready(page);
  const snap = await page.evaluate(() => JSON.parse(localStorage.getItem('lxops:snap:infra') || 'null'));
  expect(snap?.h?.length).toBeGreaterThan(2000);
  expect(snap.h).not.toMatch(/ data-k="/); expect(snap.h).not.toMatch(/<canvas/);
  await page.route('**/landxi/ops/js/boot.js', async (r) => { await new Promise((res) => setTimeout(res, 1200)); await r.continue(); });
  await page.goto(`${OPS}/landxi/ops/infra.html`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#ogSkel[data-snap="1"]')).toBeVisible();
  await expect(page.locator('#ogSkel .og-snap-tag')).toHaveText(/직전 화면 \d\d:\d\d:\d\d · 수신 중/);
  await expect(page.locator('#ogSkel .gpu-row')).toHaveCount(2);
  await ready(page);
  await expect(page.locator('#ogSkel')).toHaveCount(0);
  await expect(page.locator('.gpu-row')).toHaveCount(2);
});

// F2 통합(F2-C must_fix ③): 레일 **클릭** 이동(교차문서 View Transition) 5화면 — pageerror · console error 0
test('레일 클릭 이동 — 운영 현황 → 인프라 → 기관 → 배포 → 운영 현황 · pageerror 0 · console error 0', async ({ page }) => {
  test.skip(!(await gwUp()), '게이트웨이 없음');
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console ' + m.text()); });
  await gwAdmin(page);
  await page.goto(`${OPS}/landxi/ops/index.html`); await ready(page);
  for (const pg of ['infra', 'tenants', 'deploys', 'index']) {
    await page.locator(`.og-nav a[data-page="${pg}"]`).first().click();
    await page.waitForURL(new RegExp(`/landxi/ops/${pg}\.html`), { timeout: 20000 });
    await ready(page);
    await page.waitForTimeout(400);
  }
  expect(errs).toEqual([]);
});
