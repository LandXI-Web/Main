// F2-A · 지어낸 숫자 0 — HUD '의심 필지' = 정본 findings-emd 합(20,852) · 규칙 행 6 = README · 큐 전체 = 20,872 = by_rule 합 · 등급 3 ·
//   F2-S 정본(02. 데이터/survey/findings-emd.json)이 있으면 그 값과도 같다 · 모든 숫자 요소가 봉투(data-basis)를 단다
// 실행: npx playwright test tests/e2e/f2s-no-fabrication --reporter=line
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
    session = await r.json();
  }
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
const COPY = JSON.parse(fs.readFileSync('landxi/xi/survey/data/findings-emd.json', 'utf8'));
const CANON_P = '../02. 데이터/survey/findings-emd.json';
const CANON = fs.existsSync(CANON_P) ? JSON.parse(fs.readFileSync(CANON_P, 'utf8')) : null;
const README = { parcels: 332084, findings: 20872, suspect_parcels: 20852, by_rule: { R1: 4140, R2: 15651, R3: 20, R4: 33, R5: 464, R6: 564 }, by_priority: { A: 1053, B: 7386, C: 12433 } };

test('정본 3중 대조 — README 표 = 사본 = F2-S 정본(있으면)', () => {
  expect(COPY.rows.reduce((a, r) => a + r.suspect_parcels, 0)).toBe(README.suspect_parcels);
  expect(COPY.rows.reduce((a, r) => a + r.findings, 0)).toBe(README.findings);
  if (CANON) {
    const rows = CANON.rows || CANON.items;
    expect(rows.length).toBe(39);
    expect(rows.reduce((a, r) => a + (r.suspect_parcels?.value ?? r.suspect_parcels), 0)).toBe(README.suspect_parcels);
    expect(rows.reduce((a, r) => a + (r.findings ?? r.suspects?.value ?? r.suspects), 0)).toBe(README.findings);
    expect(CANON.totals.by_rule).toEqual(README.by_rule);
    expect(CANON.totals.by_priority).toEqual(README.by_priority);
  }
});

test('화면 — HUD 20,852(봉투 inferred) · 규칙 6행 건수 · 등급 3 · 큐 20,872 · by_rule 합 · 숫자 요소는 모두 봉투', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + '?cam=127.47,35.425,11.4,25,0&mode=survey&queue=1');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 });
  await page.evaluate(() => window.__xi.panel.setOpen(true));
  const r = await page.evaluate(() => {
    const txt = (el) => (el?.textContent || '').replace(/[^\d]/g, '');
    const rules = Object.fromEntries([...document.querySelectorAll('#panel .sv-rules li')].map((li) => [li.dataset.rule, +txt(li.querySelector('.xi-n'))]));
    const prio = Object.fromEntries([...document.querySelectorAll('#panel .sv-prio [data-prio]')].map((b) => [b.dataset.prio, +txt(b.querySelector('.xi-n'))]));
    const nums = [...document.querySelectorAll('#panel .xi-n, #fdrawer .xi-n, #hud .xi-n')];
    return { big: document.getElementById('hud-big').textContent, basis: document.getElementById('hud-big').dataset.basis, prov: document.getElementById('hud-prov').textContent, rules, prio,
      queue: +document.getElementById('fdrawer').dataset.total, byRule: window.__xi.svy.drawer.S.items.length, noBasis: nums.filter((n) => !n.dataset.basis).length, nums: nums.length, via: window.__xi.svy.S.emdVia };
  });
  console.log(JSON.stringify(r));
  expect(r.big).toBe(README.suspect_parcels.toLocaleString('ko-KR'));
  expect(r.basis).toBe('inferred');
  expect(r.prov).toContain('AI 추론 · 결과 확인 전');
  expect(r.rules).toEqual(README.by_rule);
  expect(Object.values(r.rules).reduce((a, b) => a + b, 0)).toBe(README.findings);
  expect(r.prio).toEqual(README.by_priority);
  expect(r.queue).toBe(README.findings);
  expect(r.nums).toBeGreaterThan(20); expect(r.noBasis).toBe(0);
  if (CANON) expect(r.via).toContain('F2-S');
  expect(errs).toEqual([]);
});
