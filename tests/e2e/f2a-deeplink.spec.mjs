// F2-A · 딥링크(v1.1-29) — ?mode=survey&rule=&priority=&queue=1&pnu= · ?finding= · ?deploy= · ?job=(on) 새로고침 복원 · 앱이 다시 쓴 URL 도 같은 상태
// 실행: npx playwright test tests/e2e/f2a-deeplink --reporter=line   (?job= 은 LX_API=on 에서만)
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
async function login(realm, role, tenant) { const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: PW } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: PW }) }); return r.json(); }
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  const session = API && realm ? await login(realm, role, tenant) : null;
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s)); else localStorage.removeItem('lx_api_session');
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else if (realm === 'tenant') { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.removeItem('lx_tenant_session'); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 45000 });
}
function watch(page) {
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  return errs;
}
const XI = '/landxi/xi/index.html';

test('?mode=survey&rule=R1&priority=A&queue=1&pnu= → 서랍(759) · 카드 · 새로고침 같음 · ?deploy= 계보 칩', async ({ page }) => {
  test.setTimeout(200000);
  const errs = watch(page);
  const url = XI + '?cam=127.58262,35.47569,17.2,35,0&mode=survey&rule=R1&priority=A&queue=1&pnu=5219045021110530012&deploy=dp-nw-farm-25';
  await bootApi(page, url);
  const read = async () => {
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1' && document.getElementById('fdrawer').dataset.total != null, null, { timeout: 40000 });
    return page.evaluate(() => ({ mode: window.XI.view().mode, q: JSON.parse(document.documentElement.dataset.fq || '{}'), pnu: document.getElementById('pcard2').dataset.pnu, lin: document.getElementById('hud-lin').dataset.version, linVia: document.getElementById('hud-lin').dataset.via, big: document.getElementById('hud-big').textContent }));
  };
  const a = await read();
  console.log('a', JSON.stringify(a));
  expect(a.mode).toBe('survey');
  expect(a.q).toMatchObject({ rule: ['R1'], priority: ['A'], n: 759 });
  expect(a.pnu).toBe('5219045021110530012');
  expect(a.lin).toMatch(/^v\d/);
  expect(a.big).toBe('20,852');
  await page.waitForTimeout(500);
  const written = await page.evaluate(() => location.search);
  console.log('written', written);
  for (const k of ['mode=survey', 'rule=R1', 'priority=A', 'queue=1', 'pnu=5219045021110530012', 'deploy=dp-nw-farm-25', 'survey=farmland']) expect(written).toContain(k);
  await page.reload();
  const b = await read();
  expect(b).toEqual(a);
  expect(errs).toEqual([]);
});

test('?finding=f_R4_… → 그 필지로 카메라 + 카드(R4) · 서랍 없이도', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + '?mode=survey&finding=f_R4_5219025037111100000');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 120000 });
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
  const r = await page.evaluate(() => ({ pnu: document.getElementById('pcard2').dataset.pnu, why: [...document.querySelectorAll('#pcard2 .sv-why li[data-rule]')].map((l) => l.dataset.rule), z: window.__xi.A.getZoom() }));
  console.log(JSON.stringify(r));
  expect(r.pnu).toBe('5219025037111100000'); expect(r.why).toContain('R4'); expect(r.z).toBeGreaterThan(16.5);
  expect(errs).toEqual([]);
});

test('?job=<실작업> → GET /jobs 로 HUD 두 줄 · 관제 링크 · SSE 재생으로 같은 장면(on 전용)', async ({ page }) => {
  test.skip(!API, 'on 전용 — 게이트웨이 작업 기록이 필요');
  test.setTimeout(200000);
  const errs = watch(page);
  const s = await login('lx', 'staff');
  const jobs = await (await fetch(API + '/api/v1/jobs?limit=40', { headers: { authorization: 'Bearer ' + s.token } })).json();
  const j = jobs.items.find((x) => x.kind === 'infer' && x.state === 'done' && x.aoi && x.shards_total <= 16);
  test.skip(!j, '끝난 작은 infer 작업 없음');
  await bootApi(page, XI + `?cam=127.47,35.425,12.5,35,0&job=${j.id}`);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'job-done'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ api: window.__xi.jobApi, own1: document.querySelector('#hud-job .xi-own1')?.textContent, own2: document.querySelector('#hud-job .xi-own2')?.textContent, ops: document.getElementById('mast-ops').href, url: location.search }));
  console.log(JSON.stringify(r));
  expect(r.api.id).toBe(j.id);
  expect(r.own2).toContain('GPU·s');
  expect(r.ops).toContain('job=' + j.id);
  expect(r.url).toContain('job=' + j.id);
  expect(errs).toEqual([]);
});
