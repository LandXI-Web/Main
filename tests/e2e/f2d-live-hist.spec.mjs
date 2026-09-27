// F2-D · 1차 판정 must_fix 2 — 라이브 = 판정 영상. index.month 에 hist/p10/p50/p90 가 있으면 슬롯 분포 막대(kepler 시간 재생 자리),
// 없으면 'distribution pending (gateway)' 결손 → job.done 뒤 GET /results/{set}/index 로 채움 · CSV p10/p50/p90 = 서버 값 ·
// job.progress a/b · 경과 · 견적 eta_s. 실 게이트웨이(on) 검사는 LX_API=on 일 때(≈ 5 분 · CPU 워커 · GPU 0).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
async function boot(page, url, { realm = 'lx', tenant = null, route = null } = {}) {
  let session = null;
  if (API) {
    const pw = process.env.DEV_PASSWORD || fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m)[1].trim();
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: 'lx-staff', password: pw } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: pw }) });
    session = await r.json();
  }
  if (route) await page.route('**/landxi/global/data/replay/gj1-ysykata.ndjson', route);
  await page.addInitScript(([s, api, realm, tenant]) => {
    if (location.port !== '4173' || sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) { localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); } else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s));
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-27T00:00:00+09:00' })); }
  }, [session, API, realm, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}
const slots = (page) => page.evaluate(() => [...document.querySelectorAll('.g-slot')].map((s) => ({ m: s.dataset.m, state: s.dataset.state || '', dist: s.dataset.dist || '', bars: s.querySelectorAll('.g-slot__hist i').length, pq: !!s.querySelector('.g-slot__pq') })));

test.describe('F2-D live histogram', () => {
  test.setTimeout(180000);

  test.skip(!!API, 'off 검사');
  test('off(리플레이) — 8칸 분포 막대 · p10–p90 괄호 · CSV p10/p50/p90 = 기록 값 · 표 열 p10/p50/p90', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run({ speed: 80 }); });
    await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done', null, { timeout: 60000 });
    await page.evaluate(() => window.__f1d.scenes.ys.S.filled);
    const s = await slots(page);
    expect(s.every((x) => x.state === 'done' && x.dist === 'on' && x.bars >= 8 && x.pq)).toBe(true);
    await expect(page.locator('#scrub-idx')).toContainText('NDVI by month · distribution');
    await expect(page.locator('#scrub-idx')).not.toContainText('pending');
    const csv = (await page.evaluate(() => window.__f1d.scenes.ys.toCsv())).replace(/^﻿/, '').split('\n');
    const head = csv[0].split(',');
    const row = (m) => { const c = csv.find((l) => l.startsWith(m)).split(','); return Object.fromEntries(head.map((h, i) => [h, c[i]])); };
    expect(row('2025-03')).toMatchObject({ p10: '0.1072', p50: '0.1504', p90: '0.2674', valid_px: '712925' });
    expect(csv.length).toBe(9);
    await page.click('#ys-next [data-a="open"]');
    await expect(page.locator('#ys-table th')).toContainText(['Month', 'NDVI', 'p10', 'p50', 'p90']);
    expect(errs).toEqual([]);
  });

  test('분포 없는 index.month — 슬롯 제목 결손 "distribution pending (gateway)" · 점선 칸 · CSV p10 빈칸 · 가짜 막대 0', async ({ page }) => {
    const errs = watch(page);
    const orig = fs.readFileSync('landxi/global/data/replay/gj1-ysykata.ndjson', 'utf8');
    const stripped = orig.split('\n').filter(Boolean).map((l) => { const x = JSON.parse(l); if (x.event === 'index.month') { for (const k of ['hist', 'p10', 'p50', 'p90', 'valid_px']) delete x.data[k]; } return JSON.stringify(x); }).join('\n');
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en', { route: (r) => r.fulfill({ status: 200, contentType: 'application/x-ndjson', body: stripped }) });
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run({ speed: 80 }); });
    await page.waitForFunction(() => Object.keys(window.__f1d.scenes.ys.S.arrived).length >= 1, null, { timeout: 60000 });
    await expect(page.locator('#scrub-idx')).toContainText('NDVI by month · distribution pending (gateway)');
    await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done', null, { timeout: 60000 });
    const s = await slots(page);
    expect(s.every((x) => x.dist === 'pending' && x.bars === 0 && !x.pq)).toBe(true);
    const csv = (await page.evaluate(() => window.__f1d.scenes.ys.toCsv())).replace(/^﻿/, '').split('\n');
    expect(csv[1].split(',').slice(2, 5)).toEqual(['', '', '']);   // p10 p50 p90 빈칸(지어내지 않음)
    expect(errs).toEqual([]);
  });

  test('HUD — job.progress a/b · 경과 · 견적 eta_s(추정) 표기', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=lx&locale=en');
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); });
    await expect(page.locator('#ys-eta')).toContainText(/ETA ≈ \d+ s · estimate/);
    await page.evaluate(() => window.__f1d.scenes.ys.run({ speed: 30 }));
    await page.waitForFunction(() => /shard [1-7]\/8 · [\d.]+ s elapsed/.test(document.getElementById('hud-shard')?.innerText || ''), null, { timeout: 30000 });
    await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done', null, { timeout: 60000 });
    await expect(page.locator('#hud-shard')).toContainText(/job\.done · [\d.]+ s · 8\/8 shard/);
    expect(errs).toEqual([]);
  });
});

test.describe('F2-D live histogram · on(실 게이트웨이 kgz-agri)', () => {
  test.skip(!API, 'LX_API=on 에서만(실 게이트웨이 · CPU 워커 ≈ 5 분)');
  test.setTimeout(900000);
  test('8칸 실도착 · 분포(SSE 필드 또는 /results/{set}/index) · CSV = 서버 값 · job.progress', async ({ page }) => {
    const errs = watch(page);
    await boot(page, '/landxi/global/index.html?tenant=kgz-agri&locale=en&svc=dp-kgz-agri-farm-26', { realm: 'tenant', tenant: 'kgz-agri' });
    await page.waitForSelector('#ys-run');
    expect(await page.evaluate(() => window.__f1d.state().mode)).toBe('on');
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); });
    await page.waitForFunction(() => window.__f1d.scenes.ys.S.job === 'done', null, { timeout: 840000, polling: 2000 });
    await page.evaluate(() => window.__f1d.scenes.ys.S.filled);
    const st = await page.evaluate(() => ({ S: window.__f1d.scenes.ys.S, idx: document.getElementById('scrub-idx').innerText }));
    expect(Object.keys(st.S.arrived).length).toBe(8);
    const s = await slots(page);
    expect(s.every((x) => x.dist === 'on' && x.bars >= 8)).toBe(true);
    const job = st.S.result.job_id;
    const pw = process.env.DEV_PASSWORD || fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m)[1].trim();
    const tok = (await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'tenant', tenant_id: 'kgz-agri', login: 'kgz-agri-manager', password: pw }) })).json()).token;
    const srv = await (await fetch(`${API}/api/v1/results/${job}/index?format=json`, { headers: { authorization: 'Bearer ' + tok } })).json();
    const v = (x) => (x && typeof x === 'object' ? x.value : x);
    const csv = (await page.evaluate(() => window.__f1d.scenes.ys.toCsv())).replace(/^﻿/, '').split('\n');
    for (const it of srv.items) { const c = csv.find((l) => l.startsWith(it.month)).split(','); expect([+c[2], +c[3], +c[4]]).toEqual([v(it.p10), v(it.p50), v(it.p90)]); }
    fs.writeFileSync('shots/f2/D/logs/e2e-live-hist-on.json', JSON.stringify({ job, idx: st.idx, progressSeen: st.S.progressSeen || 0, serverIndex: st.S.serverIndex, slots: s }, null, 1));
    expect(errs).toEqual([]);
  });
});
