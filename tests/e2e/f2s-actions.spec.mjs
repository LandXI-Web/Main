// F2-A · 조치 표시 — 현장조사 배정/오탐 → 상태 칩 · 타임라인 ■ · 다른 탭 반영 · off '시연 · 저장 안 됨' · on POST /survey/findings/{id}/state + tenant 스트림 ≤ 1 s
// 실행: npx playwright test tests/e2e/f2s-actions --reporter=line   (LX_API=on: 서버에 실제로 쓴다 — 기관 계정 · 열린 의심 1건)
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
const PW = process.env.DEV_PASSWORD || 'landxi-dev-2026';
async function login(realm, role, tenant) {
  const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: PW } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: PW }) });
  return r.json();
}
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

test('배정 → 칩 · ■ 마커 · 큐 행 · 다른 탭 1 s 안 · 역방향 금지 · 오탐 사유 필수', async ({ browser }) => {
  test.setTimeout(200000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctx.newPage(), b = await ctx.newPage();
  const ea = watch(a), eb = watch(b);
  // 대상: on 이면 서버에서 아직 open 인 R1 C 1건(기관 계정 · 실제 저장) · off 면 R1 A 2위
  let fid = 'f_R1_5219025032112290003', pnu = '5219025032112290003';
  if (API) {
    const s = await login('tenant', null, 'namwon');
    const j = await (await fetch(API + '/api/v1/survey/findings?rule=R1&priority=C&state=open&sort=score&limit=1&offset=' + (Math.floor(Math.random() * 400)), { headers: { authorization: 'Bearer ' + s.token } })).json();
    fid = j.items[0].id; pnu = j.items[0].pnu;
  }
  const url = XI + `?cam=127.47,35.425,11.4,25,0&mode=survey&queue=1&finding=${fid}`;
  const opt = API ? { realm: 'tenant', tenant: 'namwon' } : {};
  await bootApi(a, url, opt); await bootApi(b, XI + '?cam=127.47,35.425,11.4,25,0&mode=survey&queue=1', opt);
  for (const p of [a, b]) await p.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await a.waitForFunction((p) => document.getElementById('pcard2').dataset.pnu === p && document.getElementById('pcard2').dataset.ready === '1', pnu, { timeout: 40000 });
  await b.evaluate((p) => window.__xi.svy.drawer.open({ q: p, rule: [], priority: [] }), pnu);
  expect(await b.evaluate(() => document.querySelector('#fdrawer .sv-item .sv-st')?.dataset.st)).toBe('open');
  // 배정
  await a.click('#pcard2 .sv-as');
  const sheet = await a.evaluate(() => ({ assignee: document.querySelector('#pcard2 .sv-card-sheet [name=assignee]')?.value, date: document.querySelector('#pcard2 .sv-card-sheet [name=planned_for]')?.value, note: document.querySelector('#pcard2 .sv-card-sheet small').textContent }));
  console.log('sheet', JSON.stringify(sheet));
  expect(sheet.assignee.length).toBeGreaterThan(0); expect(sheet.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  if (!API) expect(sheet.note).toContain('예시 · 저장 안 됨');
  await b.evaluate(() => { const el = document.getElementById('fdrawer'); new MutationObserver(() => { if (!window.__flip && el.querySelector('.sv-item .sv-st')?.dataset.st === 'assigned') window.__flip = performance.timeOrigin + performance.now(); }).observe(el, { subtree: true, childList: true, attributes: true }); });
  const tb0 = await b.evaluate(() => performance.timeOrigin + performance.now());
  await a.evaluate(() => document.querySelector('#pcard2 .sv-card-sheet .sv-go').addEventListener('click', () => { window.__go = performance.timeOrigin + performance.now(); }, { capture: true, once: true }));
  await a.click('#pcard2 .sv-card-sheet .sv-go');
  await a.waitForFunction(() => document.getElementById('pcard2').dataset.state === 'assigned', null, { timeout: 15000 });
  await a.waitForFunction(() => [...document.querySelectorAll('#pcard2 .sv-mk')].some((m) => m.textContent === '■'), null, { timeout: 20000 });
  const ta = await a.evaluate(() => ({ chip: document.querySelector('#pcard2 .sv-acts .sv-st').textContent, basis: document.querySelector('#pcard2 .sv-acts .sv-st').dataset.basis || '', field: [...document.querySelectorAll('#pcard2 .sv-mk')].some((m) => m.textContent === '■'), toast: document.getElementById('xi-toasts')?.textContent || '', btn: document.querySelector('#pcard2 .sv-as').disabled }));
  console.log('A', JSON.stringify(ta));
  expect(ta.chip).toContain('현장조사 배정'); expect(ta.field).toBe(true); expect(ta.btn).toBe(true);
  expect(ta.toast).toContain(API ? '저장됨' : '저장 안 됨');
  // 다른 탭(같은 브라우저 · off = BroadcastChannel 시연 / on = tenant 스트림 finding.state) — 1 s 안
  await b.waitForFunction(() => document.querySelector('#fdrawer .sv-item .sv-st')?.dataset.st === 'assigned', null, { timeout: 3000 });
  const tb1 = await b.evaluate(() => window.__flip), tGo = await a.evaluate(() => window.__go);
  console.log('B 반영 ms(배정 클릭 → 다른 탭 칩)', Math.round(tb1 - tGo), '· 대기 포함', Math.round(tb1 - tb0));
  expect(tb1 - tGo).toBeLessThan(1000);     // 클릭(저장 · 서버 왕복 포함) → 다른 탭 칩 1 s 안
  // 오탐: 배정 뒤에는 dismiss 가능(assigned → dismissed) · 사유 select 필수
  await a.click('#pcard2 .sv-ds');
  expect(await a.evaluate(() => document.querySelectorAll('#pcard2 .sv-card-sheet select option').length)).toBeGreaterThanOrEqual(5);
  await a.click('#pcard2 .sv-card-sheet .sv-cancel');
  expect(ea).toEqual([]); expect(eb).toEqual([]);
  await ctx.close();
});
