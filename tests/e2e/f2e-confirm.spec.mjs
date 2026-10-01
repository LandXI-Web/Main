// F2-E 확인 카드 — '이 프레임 비닐하우스 분석해줘' → 견적 카드 · 승인 전 POST /jobs 0(서버 jobs 목록 불변) · 거부 = 실행 0 · 승인 = job 1 → 극장
// GPU 전력 규칙: 승인 장면은 아주 작은 프레임(수 shard · GPU0) — vLLM 녹화와 동시에 돌리지 않는다(--workers=1).
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const AB = process.env.LX_AGENT_BASE || null;          // 개발 :8703(훅 전) · 없으면 게이트웨이
async function login(realm = 'lx', role = 'staff', tenant = null) {
  const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
  return r.json();
}
/* 시험 표시(개선 고리와의 약속) — 이 스펙이 묻는 질문은 context.test 를 달아 시험용 답 번호(run_test…)로 돌게 한다(개선 고리가 모으지 않음 · 화면 · 서버 동작은 그대로). */
async function markTest(page) {
  await page.route(/\/api\/v1\/agent\/runs$/, async (route) => {
    const req = route.request();
    if (req.method() !== 'POST') return route.continue();
    try { const b = JSON.parse(req.postData() || '{}'); b.context = { ...(b.context || {}), test: true }; return route.continue({ postData: JSON.stringify(b) }); } catch { return route.continue(); }
  });
}
async function bootXI(page, { realm = 'lx', role = 'staff', tenant = null, q = '' } = {}) {
  const s = API ? await login(realm, role, tenant) : null;
  await markTest(page);
  await page.addInitScript(([s, api, ab, realm, role, tenant]) => {
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (ab) localStorage.setItem('lx_agent_base', ab); else localStorage.removeItem('lx_agent_base');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-27T09:00:00+09:00' })); }
  }, [s, API, AB, realm, role, tenant]);
  const url = '/landxi/xi/index.html' + q;
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  // 서비스 워커가 제어한 두 번째 로드부터 XI 가 에이전트를 마운트한다(F2-A 규칙)
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 20000 });
  return s;
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const CONTRACT = new Set(['catalog_layers', 'results_stats', 'results_features', 'parcel_at', 'results_parcels_join', 'survey_findings', 'survey_stats', 'survey_parcel',
  'jobs_quote', 'jobs_submit', 'survey_state', 'map_on', 'map_arrive', 'map_flyto', 'map_frame', 'drawer_open', 'parcel_card', 'llm_write', 'survey_reports_draft']);


test.skip(!API, 'on 모드 전용');
const TINY = { type: 'Polygon', coordinates: [[[127.3530, 35.5275], [127.3536, 35.5275], [127.3536, 35.5280], [127.3530, 35.5280], [127.3530, 35.5275]]] };
async function jobIds(token) { const j = await (await fetch(API + '/api/v1/jobs?limit=20', { headers: { authorization: 'Bearer ' + token } })).json(); return (j.items || []).map((x) => x.id); }

for (const decision of ['reject', 'approve']) {
  test('확인 카드 · ' + decision, async ({ page }) => {
    test.setTimeout(240000);
    const errs = watch(page);
    let jobPosts = 0;
    page.on('request', (r) => { if (r.method() === 'POST' && /\/api\/v1\/jobs(\?|$)/.test(r.url())) jobPosts++; });
    const s = await bootXI(page);
    await page.evaluate((f) => window.XI.frame(f), TINY);
    await page.waitForTimeout(800);
    const before = await jobIds(s.token);
    await page.keyboard.press('Control+k');
    await page.locator('.ag-cmd input').fill('이 프레임 비닐하우스 분석해줘');
    await page.locator('.ag-cmd input').press('Enter');
    const card = page.locator('.ag-lane .ag-confirm[data-confirm]');
    await expect(card).toBeVisible({ timeout: 90000 });
    await expect(card).toContainText('이 작업은 기관 쿼터 gpu_s_month에 계량됩니다');
    await expect(card.locator('.ag-n').first()).toBeVisible();
    await page.waitForTimeout(600);
    // 3차 판정: 1440×900 에서 확인 카드 전체(승인 · 거부 버튼 포함)가 뷰포트 안 — 손으로 레인을 스크롤하지 않아도
    const vis = await page.evaluate(() => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { t: b.top, b: b.bottom, l: b.left, r: b.right }; };
      const c = document.querySelector('.ag-lane .ag-confirm[data-confirm]'), lane = document.querySelector('.ag-lane');
      return { vw: innerWidth, vh: innerHeight, card: r(c), lane: r(lane), btns: [...c.querySelectorAll('.ag-btn')].map(r), focus: document.activeElement?.dataset?.d || null };
    });
    for (const b of [vis.card, ...vis.btns]) {
      expect(b.t).toBeGreaterThanOrEqual(0); expect(b.l).toBeGreaterThanOrEqual(0);
      expect(b.b).toBeLessThanOrEqual(vis.vh); expect(b.r).toBeLessThanOrEqual(vis.vw);
      expect(b.t).toBeGreaterThanOrEqual(vis.lane.t - 1); expect(b.b).toBeLessThanOrEqual(vis.lane.b + 1);     // 레인 스크롤 영역 안(잘리지 않음)
    }
    expect(vis.focus).toBe('approve');
    // 3차 판정: 실측 봉투 값이 표시 자릿수에서 0 으로 사라지지 않는다(면적 0.003 km² → '0.00' 금지)
    const nums = await card.locator('.ag-n').evaluateAll((els) => els.map((e) => ({ v: Number(e.dataset.v), t: e.firstChild?.textContent?.trim() || '', id: e.dataset.env })));
    console.log('[confirm chips]', JSON.stringify(nums));
    for (const x of nums) if (x.v !== 0) expect(x.t, `${x.id} = ${x.v}`).not.toMatch(/^-?0(?:\.0+)?$/);
    const area = nums.find((x) => x.id === 'q_area');
    if (area && area.v > 0 && area.v < 0.01) expect(area.t).toMatch(/^0\.00\d/);          // 0.003 km² → '0.003'
    await page.waitForTimeout(1900);
    expect(await jobIds(s.token)).toEqual(before);                    // 승인 전 제출 0
    await card.locator(`[data-d="${decision}"]`).click();
    await page.waitForFunction(() => ['done', 'failed'].includes(document.documentElement.dataset.agentState), null, { timeout: 90000 });
    const after = await jobIds(s.token);
    if (decision === 'reject') { expect(after).toEqual(before); await expect(card).toContainText('거부됨'); }
    else {
      const fresh = after.filter((x) => !before.includes(x));
      // 같은 lx 계정으로 다른 에픽이 동시에 제출할 수 있어 '새 job 중 에이전트 job 정확히 1개(이 run 의 것)'로 본다
      const ag = await page.evaluate(() => document.documentElement.dataset.agentJob);
      expect(fresh).toContain(ag);
      const run = await page.evaluate(() => document.documentElement.dataset.agentRun);
      const rj = await (await fetch(`${API}/api/v1/agent/runs/${run}`, { headers: { authorization: 'Bearer ' + s.token } })).json();
      expect(rj.steps.filter((x) => x.tool === 'jobs_submit' && x.ok).length).toBe(1);   // 이 run 의 제출 = 승인 1회분
      expect(jobPosts).toBe(0);                                         // 브라우저가 직접 POST /jobs 0(제출은 확인 뒤 서버 도구만)
      await page.waitForFunction(() => !!document.documentElement.dataset.agentJobDone, null, { timeout: 120000 });
      // 3차 판정: job.done 뒤 XI.arrive 완료 → HUD '도착 · N' (스캔 중으로 남지 않음)
      await page.waitForFunction(() => ['arrive', 'hud'].includes(document.documentElement.dataset.agentJobArrive), null, { timeout: 30000 });
      const n = Number(await page.evaluate(() => document.documentElement.dataset.agentJobArrived));
      expect(Number.isFinite(n)).toBe(true);
      await expect(page.locator('#hud-status')).not.toContainText('스캔 중', { timeout: 8000 });
      await expect(page.locator('#hud-scene')).toContainText('에이전트 · 실추론 도착');
      await expect(page.locator('#hud')).toContainText(n.toLocaleString('ko-KR'));
      await page.screenshot({ path: 'shots/f2/E/e2e-confirm-theater.png' });
    }
    expect(errs).toEqual([]);
  });
}
