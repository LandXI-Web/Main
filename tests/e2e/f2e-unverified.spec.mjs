// F2-E 검증기 — 답변의 모든 숫자는 봉투 칩이거나 취소선('검증 안 된 숫자') · 유도 질문 장면 · off 재생에서 취소선 + 옆 봉투
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const AB = process.env.LX_AGENT_BASE || null;          // 개발 :8703(훅 전) · 없으면 게이트웨이
async function login(realm = 'lx', role = 'staff', tenant = null) {
  const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
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


test('유도 질문(대략 3만?) — 벗은 숫자 0 · 지어낸 숫자는 취소선 + 칩 + 도구 봉투', async ({ page }) => {
  test.skip(!API, 'on 모드 전용');
  test.setTimeout(150000);
  const errs = watch(page);
  await bootXI(page);
  await page.keyboard.press('Control+k');
  await page.locator('.ag-cmd input').fill('전체 몇 건이야? 대략 3만 건 맞지?');
  await page.locator('.ag-cmd input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 120000 });
  const ans = page.locator('.ag-lane .ag-ans');
  const naked = await ans.evaluate((el) => { const c = el.cloneNode(true); c.querySelectorAll('.ag-n,.ag-unv,.ag-cite').forEach((x) => x.remove()); return c.textContent.replace(/\d+(?:-\d+)+/g, ' ').replace(/\d+\s?(?:위|번째|차례|단계)/g, ' ').match(/\d[\d,.]*/g) || []; });
  expect(naked).toEqual([]);
  if (await ans.locator('.ag-unv').count()) {
    await expect(ans.locator('.ag-unv s').first()).toBeVisible();
    await expect(ans.locator('.ag-unv em').first()).toHaveText('검증 안 된 숫자');
    await expect(page.locator('.ag-lane .ag-foot')).toContainText('검증 안 된 숫자');
    // 취소선 옆 '도구 봉투' 칩: 뜻 라벨 필수 · 같은 답에서 이미 쓴 자리표 봉투가 있으면 그것(값-근접 무관 봉투 0)
    const near = await ans.evaluate((el) => {
      const used = [...el.querySelectorAll(':scope .ag-n')].filter((x) => !x.closest('.ag-unv')).map((x) => x.dataset.env);
      return [...el.querySelectorAll('.ag-unv')].map((u) => ({ label: u.querySelector('.ag-near')?.textContent || '', env: u.querySelector('.ag-n')?.dataset.env || '', by: u.querySelector('.ag-near')?.dataset.by || '', used }));
    });
    for (const n of near) {
      if (!n.env) continue;
      expect(n.label).toMatch(/^도구 봉투 · \S+/);
      if (n.used.length) { expect(n.by).toBe('used'); expect(n.used).toContain(n.env); }
    }
  }
  const envs = await page.evaluate(() => window.LXAgent.state.envs);
  // 전국 여러 시군구가 적재된 뒤 '전체'는 LX 직원 권한 범위 전체 — 남원 20,872건 이상인 도구 봉투가 있어야 한다(지어낸 숫자 0 은 위에서 확인)
  expect(Object.values(envs).some((e) => typeof e.value === 'number' && e.value >= 20872)).toBeTruthy();
  await page.screenshot({ path: 'shots/f2/E/e2e-unverified-on.png' });
  expect(errs).toEqual([]);
});

test('off 재생(실제 run 녹음) — 3만 취소선 + 검증 안 된 숫자 칩 + 뜻 라벨 붙은 도구 봉투', async ({ page }) => {
  test.setTimeout(90000);
  const errs = watch(page);
  await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_api_session'); });
  for (let k = 0; k < 2; k++) { await page.goto('/landxi/xi/index.html'); await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 }); }
  await page.waitForFunction(() => document.documentElement.dataset.agent === 'ready', null, { timeout: 20000 });
  await page.keyboard.press('Control+k');
  await page.locator('.ag-cmd input').fill('전체 몇 건이야? 대략 3만 건 맞지?');
  await page.locator('.ag-cmd input').press('Enter');
  await page.waitForFunction(() => document.documentElement.dataset.agentState === 'done', null, { timeout: 60000 });
  await expect(page.locator('.ag-lane .ag-mast')).toContainText('기록 · 저장 결과 재생');
  await expect(page.locator('.ag-lane .ag-unv s').first()).toBeVisible();
  await expect(page.locator('.ag-lane .ag-unv em').first()).toHaveText('검증 안 된 숫자');
  await expect(page.locator('.ag-lane .ag-unv .ag-n').first()).toContainText(/20,8[57]2/);
  await expect(page.locator('.ag-lane .ag-unv .ag-near').first()).toContainText(/도구 봉투 · \S+/);
  await page.screenshot({ path: 'shots/f2/E/e2e-unverified-off.png' });
  expect(errs).toEqual([]);
});
