// F2-E ⌘K 장면 1 — ⌘K → 라우터 map → 계획(도구 이름 = 계약 API · ms = 서버 agent_tool_calls.ms) → 지도 도착 → 답변 숫자 = 도구 봉투 칩 · 모델 칩 = 실제 백엔드
// on 전용(vLLM :8000 살아 있음). 실행: LX_API=on DEV_PASSWORD=… npx playwright test tests/e2e/f2e-cmdk.spec.mjs --workers=1
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const AB = process.env.LX_AGENT_BASE || null;          // 개발 :8703(훅 전) · 없으면 게이트웨이
async function login(realm = 'lx', role = 'staff', tenant = null) {
  const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
  return r.json();
}
async function bootXI(page, { realm = 'lx', role = 'staff', tenant = null, q = '' } = {}) {
  const s = API ? await login(realm, role, tenant) : null;
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

test('⌘K → 계획 3행(계약 이름 · 서버 ms) → 도착 → 숫자 = 봉투 칩 · 모델 칩 = 실제 백엔드', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  const s = await bootXI(page);
  // 부팅 도착(글로브 → 한국 → 남원)이 끝난 뒤에 묻는다 — 부팅 도착이 에이전트 도착을 취소하지 않게(사람도 화면이 선 뒤 묻는다)
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1' && document.documentElement.dataset.phase === 'arrived', null, { timeout: 60000 });
  await page.keyboard.press('Control+k');
  const bar = page.locator('.ag-cmd');
  await expect(bar).toBeVisible();
  await expect(bar.locator('input')).toHaveAttribute('placeholder', /의심|필지|프레임/);
  await expect(bar.locator('.ag-model')).toContainText(/gemma-4-12b-it|qwen3/);
  await bar.locator('input').fill('아영면 답 위에 건물이 있는 의심 필지 상위 5개 보여줘');
  await bar.locator('input').press('Enter');
  // 제출 성공 = 바가 닫힌다(plan 이 없는 경로에서도 지도·카드 위에 남지 않게) · 빔은 레인 쪽 계획 행으로
  await expect(bar).toBeHidden({ timeout: 8000 });
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 120000 });
  const lane = page.locator('.ag-lane');
  await expect(lane.locator('.ag-route')).toContainText('map');
  const rows = lane.locator('.ag-step');
  expect(await rows.count()).toBeGreaterThanOrEqual(2);
  const tools = await rows.evaluateAll((els) => els.map((e) => e.dataset.tool));
  for (const t of tools) expect(CONTRACT.has(t), t).toBeTruthy();
  expect(tools).toContain('survey_findings');
  expect(tools).toContain('map_arrive');
  // 도착(브라우저 ms) — 지도 HUD 가 에이전트 봉투로 바뀐다
  await page.waitForFunction(() => +document.documentElement.dataset.agentArrived > 0, null, { timeout: 30000 });
  // 지도 위 락온 마커: 필지 인용 수만큼 [n] 브래킷이 화면 안에 보이고(줌 무관 ≥ 40px), 스윕 → 락온 → 숫자 순서
  const mk = await page.evaluate(() => {
    const cits = (window.LXAgent.state.citations || []).filter((c) => c.kind === 'parcel');
    const els = [...document.querySelectorAll('.ag-mk:not([hidden])')];
    const W = innerWidth, H = innerHeight;
    const vis = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width >= 40 && r.right > 0 && r.left < W && r.bottom > 0 && r.top < H; });
    const ph = (window.__xi?.PHASES || []).filter((p) => p.scene === 'bridge');
    const sweep = ph.filter((p) => p.p === 'sweep').at(-1)?.t, count = ph.filter((p) => p.p === 'count').at(-1)?.t;
    return { n: cits.length, shown: els.length, vis: vis.length, nums: els.map((e) => +e.dataset.n), locks: els.map((e) => +e.dataset.lockAt), sweep, count,
      hl: !!window.__xi?.A?.getLayer('ag-hl-line') };
  });
  expect(mk.n).toBeGreaterThanOrEqual(3);
  expect(mk.shown, JSON.stringify(mk)).toBe(mk.n);
  expect(mk.vis, JSON.stringify(mk)).toBe(mk.n);
  expect(mk.hl).toBeTruthy();
  expect(Math.min(...mk.locks)).toBeGreaterThanOrEqual(mk.sweep - 1);
  expect(Math.max(...mk.locks), JSON.stringify(mk)).toBeLessThanOrEqual(mk.count + 20);
  // 화면 ms = 서버 agent_tool_calls.ms
  const runId = await page.evaluate(() => document.documentElement.dataset.agentRun);
  const base = AB || API;
  const run = await (await fetch(`${base}/api/v1/agent/runs/${runId}`, { headers: { authorization: 'Bearer ' + s.token } })).json();
  for (const st of run.steps.filter((x) => x.ms_source === 'server')) {
    const shown = await lane.locator(`.ag-step[data-tool="${st.tool}"] .ms`).first().innerText();
    const v = Number(shown.replace(/[^\d.]/g, ''));
    expect(Math.abs(v - st.ms), `${st.tool} 화면 ${shown} vs 서버 ${st.ms}`).toBeLessThanOrEqual(0.51);
  }
  // 답변: 모든 숫자는 봉투 칩(또는 취소선 칩) · 칩 값 = 도구 봉투
  const naked = await lane.locator('.ag-ans').evaluate((el) => {
    const c = el.cloneNode(true); c.querySelectorAll('.ag-n,.ag-unv,.ag-cite').forEach((x) => x.remove());
    return (c.textContent.replace(/\d+(?:-\d+)+/g, ' ').replace(/\d+\s?(?:위|번째|차례|단계)/g, ' ').match(/\d[\d,.]*/g) || []).filter((n) => !/^\d+-\d+$/.test(n) && !/^(19|20)\d\d$/.test(n) && n.length < 19);
  });
  const addrNums = await page.evaluate(() => (window.LXAgent.state.citations || []).flatMap((c) => (c.addr || '').match(/\d+(-\d+)?/g) || []));
  expect(naked.filter((n) => !addrNums.includes(n))).toEqual([]);
  const chipEnvs = await lane.locator('.ag-ans .ag-n').evaluateAll((els) => els.map((e) => e.dataset.env));
  expect(chipEnvs.length).toBeGreaterThan(0);
  const envs = await page.evaluate(() => window.LXAgent.state.envs);
  for (const id of chipEnvs) expect(envs[id], id).toBeTruthy();
  // 발문: 모델 칩 = 실제 백엔드(서버 run.model) · 토큰 봉투 measured
  expect(run.model.backend).toMatch(/vllm|ollama/);
  await expect(lane.locator('.ag-foot .ag-model')).toContainText(run.model.id);
  await expect(lane.locator('.ag-foot .ag-n[data-env="tokens"]')).toHaveAttribute('data-basis', 'measured');
  // 인용 [n] → flyTo + 필지 카드
  await lane.locator('.ag-cites li').first().click();
  await page.waitForFunction(() => !!document.documentElement.dataset.agentCite, null, { timeout: 8000 });
  await page.screenshot({ path: 'shots/f2/E/e2e-cmdk.png' });
  expect(errs).toEqual([]);
});

test('ops 질문 → 런타임 안내(LLM 호출 0) · 검증 안 된 숫자 0 · 바 닫힘 · 이전 필지 카드 닫힘', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootXI(page, { q: '?mode=survey' });
  // 앞 질문의 필지 카드가 열려 있는 상태
  await page.evaluate(() => window.XI.parcelCard('5219045021110530012').catch(() => null));
  await page.waitForTimeout(1500);
  const cardBefore = await page.evaluate(() => document.documentElement.dataset.pcard || '');
  await page.keyboard.press('Control+k');
  const bar = page.locator('.ag-cmd');
  await bar.locator('input').fill('GPU1 왜 느려?');
  await bar.locator('input').press('Enter');
  await expect(bar).toBeHidden({ timeout: 8000 });
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
  const lane = page.locator('.ag-lane');
  await expect(lane.locator('.ag-route')).toContainText('ops');
  expect(await lane.locator('.ag-ans .ag-unv').count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.dataset.agentUnverified)).toBe('0');
  await expect(lane.locator('.ag-foot .ag-model')).toContainText('런타임 안내');
  await expect(lane.locator('.ag-foot .ag-model')).toContainText('LLM 호출 0');
  expect(await lane.locator('.ag-foot .ag-n[data-env="tokens"]').count()).toBe(0);
  if (cardBefore) expect(await page.evaluate(() => document.documentElement.dataset.pcard || '')).toBe('');
  // 다음 ⌘K 는 '열기'(닫기로 먹지 않음)
  await page.keyboard.press('Control+k');
  await expect(bar).toBeVisible();
  expect(errs).toEqual([]);
});

test('게스트(public=1)에는 명령 바가 없다 · 요청 0', async ({ page }) => {
  const errs = watch(page);
  const reqs = [];
  page.on('request', (r) => { if (/\/agent\//.test(r.url())) reqs.push(r.url()); });
  await page.addInitScript(() => { localStorage.removeItem('lx_api_session'); localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_tenant_session'); });
  await page.goto('/landxi/xi/index.html?public=1');
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  await expect(page.locator('.ag-cmd')).toHaveCount(0);
  expect(reqs).toEqual([]);
  expect(errs).toEqual([]);
});
