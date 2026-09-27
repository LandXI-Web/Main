// F1-D · K-1 으슥아타 · G-J1 — 락온 · WorldCover 비율(비율만 유효) · 월별 스크럽 · 8칸 순서 도착(리플레이 off / 하니스 on) · HUD · 결손 칩
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {   // F1-CONTRACT §12 복사(_roles.mjs import 금지)
  let session = null;
  if (API) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
    session = await r.json();
  }
  await page.addInitScript(([s, api, realm, role, tenant]) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return; sessionStorage.setItem('lx_e2e_boot', '1');
    if (api) localStorage.setItem('lx_api_base', api); else localStorage.setItem('lx_api_mode', 'off');
    if (s) localStorage.setItem('lx_api_session', JSON.stringify(s));
    if (realm === 'lx') { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', role); localStorage.removeItem('lx_tenant_session'); }
    else { localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_role'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant, at: '2026-09-24T09:00:00+09:00' })); }
  }, [session, API, realm, role, tenant]);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
}
function watch(page) {
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/CORS policy|net::ERR_FAILED|ERR_CONNECTION_RESET|ERR_HTTP2_SERVER_REFUSED_STREAM|ERR_NO_BUFFER_SPACE/.test(m.text())) errs.push(m.text()); });   // F2-D: 외부 타일 원천(EOX · PC · GIBS) CORS 간헐 거절은 별도 분류(F1-D 요청 4)
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}

const PAGE = '/landxi/global/index.html?tenant=lx&locale=en';

test.describe('F1-D Ysyk-Ata · G-J1', () => {
  test.setTimeout(120000);

  test('경계 락온 · Ысык-Ата · WorldCover 농경지 33.0 % · 비율만 유효 · 10 m ha', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await expect(page.locator('.xi-lock-flag')).toContainText('Ysyk-Ata');   // F2-D: fx/arrive.lock 깃발
    await expect(page.locator('.xi-lock-flag')).toContainText('Ысык-Ата');
    await expect(page.locator('#card .g-stage')).toHaveText(/canary/i);
    await expect(page.locator('#card')).toContainText('dp-kgz-agri-farm-26');
    await expect(page.locator('.g-bar[data-hl]')).toContainText('33.0%');
    await expect(page.locator('#card')).toContainText('ratio only valid');
    await expect(page.locator('#card')).toContainText(/Cropland 63,3\d\d ha/);
    await expect(page.locator('.g-ladder__now')).toContainText('PC S2 mosaic 2025-06');
    expect(errs).toEqual([]);
  });

  // F2-D: 월 스크러버 = F1-A fx/timescrub(정수 시점 750 정지 · 이동 1000 · 8 시점 = 8 × 750 + 7 × 1000 · 크로스페이드는 소수 시점 불투명도)
  test('월별 스크럽 3→10 · fx timescrub · 정수 750 정지 · 이동 1000', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.waitForSelector('#scrub .xi-ticks li');
    const r = await page.evaluate(async () => {
      const f = window.__f1d, m = f.stage.map;
      const t0 = performance.now();
      await f.scenes.ys.play();
      const ts = f.scenes.ys.S.ts.S;
      const tr = m.getStyle().layers.find((l) => l.id === 'pc-2025-07').paint['raster-opacity-transition'].duration;
      return { stops: ts.stops.slice(-8), total: Math.round(performance.now() - t0), tr, op: m.getPaintProperty('pc-2025-10', 'raster-opacity'), ticks: [...document.querySelectorAll('#scrub .xi-ticks li')].map((l) => l.textContent), on: document.querySelector('#scrub .xi-ticks li[data-on="1"]')?.textContent };
    });
    expect(r.stops.map((x) => x.k)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    for (const s of r.stops) expect(Math.abs(s.ms - 750)).toBeLessThanOrEqual(60);
    expect(r.ticks.map((x) => x.replace(/10 m$/, ''))).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']);
    expect(r.on).toContain('Oct');
    expect(r.tr).toBe(500);
    expect(r.op).toBe(1);
    expect(r.total).toBeGreaterThanOrEqual(12600);
    expect(r.total).toBeLessThanOrEqual(13900);
    expect(errs).toEqual([]);
  });

  test('G-J1 off — 프레임 → 견적 → 실행 · 리플레이 8칸 순서 도착 · HUD 지수 계산 문구 · job.done 곡선 · 작물 분류 결손', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('ysykata'));
    const r = await page.evaluate(async () => {
      const f = window.__f1d, y = f.scenes.ys, order = [];
      const obs = new MutationObserver((ms) => ms.forEach((x) => { if (x.attributeName === 'data-state' && x.target.dataset.state === 'done') order.push(x.target.dataset.m); }));
      obs.observe(document.getElementById('scrub'), { attributes: true, subtree: true, attributeFilter: ['data-state'] });
      y.frame(); const q = await y.quote();
      const done = new Promise((res) => f.stage.root.addEventListener('f1d:gj1-done', res, { once: true }));
      await y.run({ speed: 400 });
      await done; obs.takeRecords().forEach((x) => { if (x.target.dataset.state === 'done') order.push(x.target.dataset.m); }); obs.disconnect();
      return { order, q: { area: q.area_km2, shards: q.shards, pool: q.pool }, hud: document.getElementById('hud').innerText, curve: document.querySelector('.g-curve').getAttribute('d'),
               pts: document.querySelectorAll('.g-curve__pt').length, mode: document.getElementById('mode-chip').innerText, arrived: Object.keys(y.S.arrived).length };
    });
    expect(r.order).toEqual(['2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']);
    expect(r.q.shards).toBe(8);
    expect(r.q.pool).toBe('cpu');
    expect(r.q.area.basis).toBe('measured');
    expect(r.hud).toContain('Index calc · not model inference');
    expect(r.hud).toMatch(/T43TEH \d+ scenes · cpu-0/);
    expect(r.hud).toContain('job.done');
    expect(r.hud).toMatch(/replay ×\d+/);
    expect(r.curve.split('L').length).toBe(8);
    expect(r.pts).toBe(8);
    expect(r.mode).toContain('Demo · replaying stored results');
    await expect(page.locator('#ys-gap .gs-void')).toContainText('Crop type classification');
    await expect(page.locator('#ys-gap .gs-void')).toContainText('training data required');
    await expect(page.locator('.g-slot[data-m="2025-06"] .g-slot__v')).toHaveText('0.44');
    // 1차 판정(완성형 · 다음 행동 0): 결과 열기 · CSV · GeoJSON · 보고서 첨부 · job 계보(관제 딥링크)
    await expect(page.locator('#ys-next')).toContainText('Open results');
    await expect(page.locator('#ys-next [data-a="csv"]')).toBeVisible();
    await expect(page.locator('#ys-next [data-a="geojson"]')).toBeVisible();
    await expect(page.locator('#ys-next [data-a="report"]')).toBeVisible();
    // F2-D: 관제 실링크는 라이브 작업만(게이트웨이 jobs 에 있는 id) — 리플레이의 기록 job 은 정직한 결손 칩 · 계보는 fx/lineage 3마디
    await expect(page.locator('#ys-next .g-lineage a')).toHaveCount(0);
    await expect(page.locator('#ys-next .g-lineage__wait')).toHaveAttribute('data-job', /^job_/);
    await expect(page.locator('#ys-next .g-lineage__wait')).toContainText('live runs only');
    await expect(page.locator('#ys-next .xi-ln')).toHaveCount(3);
    await page.click('#ys-next [data-a="open"]');
    await expect(page.locator('#ys-table tr')).toHaveCount(9);
    const dl = page.waitForEvent('download'); await page.click('#ys-next [data-a="csv"]');
    const csv = fs.readFileSync(await (await dl).path(), 'utf8');
    expect(csv.split('\n').length).toBe(9); expect(csv).toContain('2025-06,0.438');
    expect(errs).toEqual([]);
  });

  test('G-J1 HUD 진행 카운터 — 실 게이트웨이처럼 job.progress 없이 shard.done 만으로 a/b · 경과 s · 다음 칸 ≈ 직전 달 실측', async ({ page }) => {
    const errs = watch(page);
    await page.route('**/landxi/global/data/replay/gj1-ysykata.ndjson', async (route) => {
      const res = await route.fetch(); const txt = await res.text();
      await route.fulfill({ response: res, body: txt.split('\n').filter((l) => l && !l.includes('"job.progress"')).join('\n') + '\n' });
    });
    await bootApi(page, PAGE);
    const snaps = await page.evaluate(async () => {
      const f = window.__f1d; await f.go('ysykata'); const y = f.scenes.ys; y.frame(); await y.quote();
      const out = []; const obs = new MutationObserver(() => out.push(document.getElementById('hud-shard')?.innerText + ' | ' + (document.getElementById('hud-eta')?.innerText || '')));
      const done = new Promise((res) => f.stage.root.addEventListener('f1d:gj1-done', res, { once: true }));
      await y.run({ speed: 400 }); obs.observe(document.getElementById('hud'), { subtree: true, childList: true, characterData: true });
      await done; obs.disconnect(); return out;
    });
    expect(snaps.some((x) => /shard 3\/8 · [\d.]+ s elapsed/.test(x))).toBe(true);
    expect(snaps.some((x) => /last month [\d.]+ s · next slot ≈ [\d.]+ s/.test(x))).toBe(true);
    expect(snaps.at(-1)).toMatch(/job\.done · [\d.]+ s · 8\/8 shard/);
    expect(errs).toEqual([]);
  });

  test('G-J1 on — F1-D 하니스 큐(POST /jobs kind index) → SSE shard=월 · index.month measured(실제 PC B04/B08)', async () => {
    test.setTimeout(360000);
    const base = process.env.F1D_HARNESS || 'http://localhost:8711';
    let ok = false; try { ok = (await (await fetch(base + '/api/v1/health', { signal: AbortSignal.timeout(1500) })).json()).ok; } catch { ok = false; }
    test.skip(!ok, 'F1-D 하니스(:8711) 꺼짐 — python -m server.adapters.global.adapter_ndvi_pc --serve 8711');
    const body = { kind: 'index', model_id: 'index/ndvi_pc', aoi: { type: 'Polygon', coordinates: [[[74.7, 42.75], [75.2, 42.75], [75.2, 43.0], [74.7, 43.0], [74.7, 42.75]]] },
                   options: { months: ['2025-06'], cloud_max: 15, mask: 'worldcover-40' }, priority: 0, demo: false };
    const j = await (await fetch(base + '/api/v1/jobs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
    expect(j.job.kind).toBe('index');
    const res = await fetch(base + j.events_url);
    const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; const ev = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 330000) {   // PC 응답 속도 의존(2026-09-26 실측 1개월 150 s)
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value);
      for (const blk of buf.split('\n\n').slice(0, -1)) { const n = /event: (.+)/.exec(blk), d = /data: (.+)/.exec(blk); if (n && d) ev.push([n[1], JSON.parse(d[1])]); }
      buf = buf.split('\n\n').pop();
      if (ev.some((e) => e[0] === 'job.done')) break;
    }
    const names = ev.map((e) => e[0]);
    expect(names.slice(0, 3)).toEqual(['job.queued', 'job.started', 'shard.started']);
    const im = ev.find((e) => e[0] === 'index.month')[1];
    expect(im.shard_id).toBe('m2025-06');
    expect(['measured', 'recorded']).toContain(im.ndvi_mean.basis);
    expect(im.n_scenes).toBeGreaterThan(0);
    expect(names).toContain('job.done');
  });
  test('G-J1 on — 실 F1-B 게이트웨이(Redis 큐 · CPU 워커) · 화면에서 프레임→견적→실행 · 8칸 measured · 콘솔 오류 0', async ({ page }) => {
    test.skip(!API || !process.env.DEV_PASSWORD, 'LX_API=on · DEV_PASSWORD 필요(실측 1회 ≈ 285 s)');
    test.setTimeout(600000);
    const errs = watch(page);
    await bootApi(page, '/landxi/global/index.html?tenant=kgz-agri&locale=en&svc=dp-kgz-agri-farm-26', { realm: 'tenant', tenant: 'kgz-agri' });
    await page.waitForTimeout(7000);
    expect(await page.evaluate(() => window.__f1d.state().mode)).toBe('on');
    await page.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); });
    await page.waitForFunction(() => window.__f1d.state().ys?.job === 'done', null, { timeout: 560000, polling: 2000 });
    const arrived = await page.evaluate(() => window.__f1d.state().ys.arrived);
    expect(Object.keys(arrived)).toEqual(['2025-03', '2025-04', '2025-05', '2025-06', '2025-07', '2025-08', '2025-09', '2025-10']);
    for (const m of Object.values(arrived)) { expect(m.env.basis).toBe('measured'); expect(m.n).toBeGreaterThan(0); }
    expect(errs).toEqual([]);
  });
});
