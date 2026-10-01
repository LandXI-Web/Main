// F2-E off 모드 — 네트워크 0 · 실제 run 녹음 재생(장면 1 · 보고서) · 마스트 '기록 · 저장 결과 재생' · 콘솔 0
import { test, expect } from '@playwright/test';

/* 시험 표시(개선 고리와의 약속) — 이 스펙이 묻는 질문은 context.test 를 달아 시험용 답 번호(run_test…)로 돌게 한다(개선 고리가 모으지 않음 · 화면 · 서버 동작은 그대로). */
async function markTest(page) {
  await page.route(/\/api\/v1\/agent\/runs$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    try { const b = JSON.parse(req.postData() || '{}'); b.context = { ...(b.context || {}), test: true }; return route.continue({ postData: JSON.stringify(b) }); } catch { return route.continue(); }
  });
}

async function bootOff(page) {
  await markTest(page);
  await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_api_session'); localStorage.removeItem('lx_agent_base'); });
  for (let k = 0; k < 2; k++) { await page.goto('/landxi/xi/index.html'); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 }); }
  await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 20000 });
}
function watch(page) {
  const errs = []; const net = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('request', (r) => { if (/\/api\/v1\/(agent|events\/agent)/.test(r.url())) net.push(r.url()); });
  return { errs, net };
}

test('off · 장면 1 재생 — 계획 · 봉투 칩 · 녹음 표기 · 요청 0', async ({ page }) => {
  test.setTimeout(90000);
  const w = watch(page);
  await bootOff(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.ag-cmd .ag-model')).toContainText('에이전트 연결 없음');
  await page.locator('.ag-cmd input').fill('아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘');
  await page.locator('.ag-cmd input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
  await expect(page.locator('.ag-lane .ag-mast')).toContainText('기록 · 저장 결과 재생');
  expect(await page.locator('.ag-lane .ag-step').count()).toBeGreaterThanOrEqual(2);
  expect(await page.locator('.ag-lane .ag-ans .ag-n').count()).toBeGreaterThan(0);
  await expect(page.locator('.ag-lane .ag-foot')).toContainText('기록 · 저장 결과 재생');
  // 3차 판정: 녹음 재생의 ms 꼬리표 = '기록(녹음 시각)' · '실측'은 이 세션에서 잰 값(브라우저 map_arrive)에만
  await expect(page.locator('.ag-lane .ag-route .ag-tag')).toContainText(/기록 · \d\d-\d\d \d\d:\d\d 녹음/);
  await expect(page.locator('.ag-lane .ag-route')).not.toContainText('실측');
  const tags = await page.locator('.ag-lane .ag-step .ms').allInnerTexts();
  expect(tags.some((t) => /기록 \d\d:\d\d/.test(t))).toBe(true);
  for (const t of tags) expect(t).not.toContain('실측');
  await expect(page.locator('.ag-lane .ag-foot')).not.toContainText('실측');
  await page.screenshot({ path: 'shots/f2/E/e2e-off-scene1.png' });
  expect(w.net).toEqual([]);
  expect(w.errs).toEqual([]);
});

test('off · 보고서 초안 재생 — 타이핑 · 인용 · docx 비활성(시연) · CSV', async ({ page }) => {
  test.setTimeout(90000);
  const w = watch(page);
  await bootOff(page);
  await page.evaluate(() => window.XI.openDrawer('report', { tab: 'draft', emd_cd: '52190450', rule: 'R1' }));
  await page.waitForFunction(() => document.documentElement.dataset.agentDraftDone === '1', null, { timeout: 60000 });
  await expect(page.locator('.ag-paper .ag-pmast')).toContainText('기록 · 저장 결과 재생');
  expect(await page.locator('.ag-paper .ag-body .ag-cite').count()).toBeGreaterThan(2);
  await expect(page.locator('.ag-paper .ag-docx')).toBeDisabled();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('.ag-paper .ag-csv').click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);
  expect(w.net).toEqual([]);
  expect(w.errs).toEqual([]);
});

test('off · 인용 카드가 열리는 중에 새 질문 → 이전 필지 카드 0', async ({ page }) => {
  test.setTimeout(120000);
  const w = watch(page);
  await bootOff(page);
  await page.keyboard.press('Control+k');
  await page.locator('.ag-cmd input').fill('아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘');
  await page.locator('.ag-cmd input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
  await page.locator('.ag-lane .ag-cites li').first().click();                     // flyTo 1.6 s → 필지 카드(2–4 s 뒤 열림)
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => document.documentElement.dataset.agentCiteOpen)).toBe('1');   // 아직 여는 중
  await page.keyboard.press('Control+k');
  await page.locator('.ag-cmd input').fill('전체 몇 건이야? 대략 3만 건 맞지?');
  await page.locator('.ag-cmd input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.agentCiteStale, null, { timeout: 15000 });
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  const open = await page.evaluate(() => ['#pcard2', '#parcel-card'].map((s) => document.querySelector(s)).filter((el) => el && !el.hidden && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden').length);
  expect(open).toBe(0);
  await page.screenshot({ path: 'shots/f2/E/e2e-off-cite-race.png' });
  expect(w.net).toEqual([]);
  expect(w.errs).toEqual([]);
});
