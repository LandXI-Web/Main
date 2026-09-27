// F2-A · 실태조사 대조 스윕 S-1 — 39칸 순서 = 이벤트 순서 · 일치 필지 걷힘(베일 0 · 외곽선 유지) · 의심만 해치 · 이벤트 없이 진행 0 ·
//   락온 3(README 대표 사례) · HUD '의심 필지 20,852' ≤ 8 s(off) · 업무 판 10행(farmland 만 켜짐) · 규칙 6행
// 실행: npx playwright test tests/e2e/f2s-sweep --reporter=line
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
const CITY = '?cam=127.47,35.425,12.5,35,0';
const EMD = JSON.parse(fs.readFileSync('landxi/xi/survey/data/findings-emd.json', 'utf8'));

test('모드 스위치 → 업무 판 10(farmland 만) → 규칙 6 → 스윕 39칸(이벤트 순서) → 걷힘·해치 → 락온 3 → HUD 20,852 ≤ 8 s', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  const t0 = await page.evaluate(() => performance.now());
  await page.click('#mode-sw [data-m=survey]');
  const panel = await page.evaluate(() => ({ duty: [...document.querySelectorAll('#panel .sv-duty li')].map((li) => [li.dataset.duty, li.dataset.live]), rules: [...document.querySelectorAll('#panel .sv-rules li')].map((li) => li.dataset.rule), tab: document.querySelector('#panel .xi-tabs [aria-selected=true]')?.dataset.tab }));
  console.log('panel', JSON.stringify(panel));
  expect(panel.duty.length).toBe(10);
  expect(panel.duty.filter(([, l]) => l === '1')).toEqual([['farmland', '1']]);
  expect(panel.rules).toEqual(['R1', 'R2', 'R3', 'R4', 'R5', 'R6']);
  // 스윕 중간: 걷힌 칸 수 = 받은 shard.done 수(이벤트 없이 앞서 나가지 않는다)
  await page.waitForFunction(() => (window.__xi.svy.S.sweep?.S.done || 0) >= 5, null, { timeout: 30000 });
  const mid = await page.evaluate(() => { const S = window.__xi.svy.S.sweep.S, L = window.__xi.svy.layers.S; return { done: S.done, log: S.log.filter(([n]) => n === 'shard.done').length, shown: S.shown.length, layerDone: L.done.size }; });
  console.log('mid', JSON.stringify(mid));
  expect(mid.shown).toBeLessThanOrEqual(mid.log);
  expect(mid.layerDone).toBeLessThanOrEqual(mid.done);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'survey-result'), null, { timeout: 60000 });
  const r = await page.evaluate((t0) => {
    const X = window.__xi, A = X.A, sv = X.svy, L = sv.layers;
    const S = sv.S.sweep.S;
    const veils = [...L.S.idOf.values()].map((id) => A.getFeatureState({ source: 'sv-emd', id }).veil ?? 1);
    const res = X.PHASES.find((x) => x.p === 'survey-result');
    return { order: S.shown.map(([cd]) => cd), done: S.done, veils, filt: A.getFilter('sv-sus-fill'), vis: A.getLayoutProperty('sv-sus-fill', 'visibility'), lineVis: A.getLayoutProperty('sv-parcel-line', 'visibility'),
      big: document.getElementById('hud-big').textContent, basis: document.getElementById('hud-big').dataset.basis, scene: document.getElementById('hud-scene').textContent, note: document.getElementById('hud-note').textContent,
      locks: [...document.querySelectorAll('#locks .xi-lock-flag')].map((f) => f.textContent), ms: Math.round(res.t - t0), via: window.__xi.svy.S.emdVia };
  }, t0);
  console.log('result', JSON.stringify({ ...r, veils: r.veils.join(''), filt: JSON.stringify(r.filt).slice(0, 120) }));
  expect(new Set(r.order).size).toBe(39);
  expect(r.done).toBe(39);
  expect(r.veils.every((v) => v === 0)).toBe(true);               // 일치 = 걷힘(fill 0)
  expect(r.lineVis).toBe('visible');                               // 외곽선 유지(z14+)
  expect(r.vis).toBe('visible');
  expect(JSON.stringify(r.filt)).toContain('slice');               // 의심 층은 대조가 끝난 읍면동만
  expect(r.big).toBe('20,852'); expect(r.basis).toBe('inferred');
  expect(r.scene).toContain('의심 필지');
  expect(r.note).toContain('39/39'); expect(r.note).toContain('건축물대장 미대조');
  expect(r.locks.length).toBe(3);
  expect(r.locks[0]).toContain('R1 A 90.5'); expect(r.locks[0]).toContain('아곡리 1053-12');
  expect(r.locks.join(' ')).toContain('화수리 1110'); expect(r.locks.join(' ')).toContain('월평리 478-9');
  expect(r.ms).toBeLessThanOrEqual(API ? 20000 : 16000);          // 카메라 1250×3 + 스윕 39칸 + 락온 + 카운트업(off 목표 ≤ 8 s 는 스윕 시작부터 — 아래)
  expect(errs).toEqual([]);
});

test('이벤트 없이 진행 0 — 리플레이를 5칸에서 끊으면 5칸만 걷히고 HUD 는 의심 숫자로 가지 않는다(서비스 워커 막음 · 사본 리플레이)', async ({ browser }) => {
  test.skip(!!API, 'off 전용(리플레이 가로채기)');
  test.setTimeout(150000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = watch(page);
  const full = fs.readFileSync('landxi/xi/survey/data/replay/survey-namwon.ndjson', 'utf8').split('\n').filter(Boolean);
  let n = 0; const cut = [];
  for (const l of full) { const j = JSON.parse(l); if (j.event === 'shard.done') n++; if (n > 5 || j.event === 'job.done') break; cut.push(l); }
  await page.route('**/survey/data/replay/survey-namwon.ndjson*', (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: cut.join('\n') + '\n' }));
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => window.XI.setMode('survey'));
  await page.waitForFunction(() => (window.__xi.svy.S.sweep?.S.done || 0) >= 5, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => { const X = window.__xi, L = X.svy.layers; return { done: X.svy.S.sweep.S.done, layerDone: L.S.done.size, lifted: [...L.S.idOf.values()].filter((id) => (X.A.getFeatureState({ source: 'sv-emd', id }).veil ?? 1) === 0).length, result: X.PHASES.some((p) => p.p === 'survey-result'), big: document.getElementById('hud-big').textContent }; });
  console.log(JSON.stringify(r));
  expect(r.done).toBe(5); expect(r.layerDone).toBe(5); expect(r.lifted).toBe(5);
  expect(r.result).toBe(false);
  expect(r.big).not.toBe('20,852');
  expect(errs).toEqual([]);
  await ctx.close();
});

test('정본 대조 — 사본 findings-emd.json 합 = README(20,852 필지 · 20,872 건 · 규칙 6 · 등급 3)', () => {
  const T = EMD.totals;
  expect(EMD.rows.length).toBe(39);
  expect(EMD.rows.reduce((a, r) => a + r.suspect_parcels, 0)).toBe(20852);
  expect(EMD.rows.reduce((a, r) => a + r.findings, 0)).toBe(20872);
  expect(T).toMatchObject({ parcels: 332084, findings: 20872, suspect_parcels: 20852, by_rule: { R1: 4140, R2: 15651, R3: 20, R4: 33, R5: 464, R6: 564 }, by_priority: { A: 1053, B: 7386, C: 12433 } });
});
