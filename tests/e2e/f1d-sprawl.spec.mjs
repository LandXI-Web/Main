// F1-D · K-3 소쿨룩·비슈케크 — dp-kgz-land-change-26 유무 분기 · Δ 격자 · 필라멘트 z9–11 · Overture 압출(pitch 45) · 스와이프 2017↔2025 · 시범지 3 · 키릴
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

test.describe('F1-D Sokuluk · Bishkek', () => {
  test.setTimeout(120000);

  test('배포본 있음(off 픽스처) → 초안 카드 · Δ 격자 · 필라멘트 · 시범지 3 · Сокулук Бишкек', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    await expect(page.locator('#card')).toContainText('dp-kgz-land-change-26');
    await expect(page.locator('#card .g-stage')).toHaveText(/draft/i);
    // 1차 판정: 'DRAFT · results 0' 머리 + 외부 통계 → '분석 안 함' 으로 읽힘 → LX 분석 절 먼저 · 외부 통계 칩
    await expect(page.locator('#sk-lx')).toContainText('LX change detection');
    await expect(page.locator('#sk-lx')).toContainText('0 LX results yet');
    await expect(page.locator('#sk-run')).toHaveText('Run change detection');
    await expect(page.locator('#card .g-xchip')).toHaveText('Esri/IO LULC external statistics · not LX analysis');
    const order = await page.evaluate(() => [...document.querySelectorAll('#card .g-sec')].map((x) => x.id || x.querySelector('.g-sec__t span')?.textContent));
    expect(order[0]).toBe('sk-lx');
    await page.click('#sk-run');   // off: 게이트웨이 없음 → 제출 안 함(결손 칩 · 가짜 작업 0)
    await expect(page.locator('#sk-gap .gs-void')).toContainText('Not queued');
    await expect(page.locator('#sk-pre')).toContainText('Gateway');
    await expect(page.locator('#card')).toContainText('Сокулук · Бишкек');
    await expect(page.locator('.g-pin')).toHaveCount(3);
    await expect(page.locator('.g-pin').first()).toContainText('boundary not acquired');
    const r = await page.evaluate(async () => {
      const f = window.__f1d, m = f.stage.map, k = f.scenes.sk;
      await k.grid(true); await k.filament(true);
      const L = (id) => m.getStyle().layers.find((l) => l.id === id);
      return { grid: m.getPaintProperty('sprawl-grid', 'fill-opacity'), ramp: JSON.stringify(L('sprawl-grid').paint['fill-color']), fil: [L('filament').minzoom, L('filament').maxzoom],
               cells: m.getSource('sprawl')._data?.features?.length ?? f.ctx.sprawl.grid.features.length, delta: f.ctx.sprawl.summary.delta_km2 };
    });
    expect(r.grid).toBeGreaterThan(0.5);
    expect(r.ramp).not.toMatch(/FFB633/i);                     // 앰버 금지 — 액센트 램프
    expect(r.ramp).toContain('#003B85');
    expect(r.fil[0]).toBeLessThanOrEqual(9); expect(r.fil[1]).toBeGreaterThanOrEqual(11);
    expect(r.cells).toBeGreaterThan(1000);
    expect(r.delta.basis).toBe('measured');
    expect(r.delta.value).toBeGreaterThan(0);
    expect(errs).toEqual([]);
  });

  test('배포본 없음 → 이식 전 결손 칩(정직)', async ({ page }) => {
    const errs = watch(page);
    await page.route('**/landxi/global/data/deploys-fixture.json', async (route) => {
      const res = await route.fetch(); const j = await res.json();
      j.items = j.items.filter((d) => d.id !== 'dp-kgz-land-change-26');
      await route.fulfill({ response: res, json: j });
    });
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    await expect(page.locator('#card .gs-void').first()).toContainText('Not yet ported');
    await expect(page.locator('#card .gs-void').first()).toContainText('LX/OPS');
    expect(errs).toEqual([]);
  });

  test('Overture 압출 토글(기본 OFF → ON · pitch 45) · 스와이프 2017 ↔ 2025(두 지도 · clip-path)', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    const before = await page.evaluate(() => window.__f1d.stage.map.getLayoutProperty('ovt-3d', 'visibility'));
    expect(before).toBe('none');
    const r = await page.evaluate(async () => {
      const f = window.__f1d, m = f.stage.map, k = f.scenes.sk;
      await new Promise((res) => { m.once('moveend', res); m.easeTo({ center: [74.512, 42.868], zoom: 14.6, pitch: 45, bearing: -18, duration: 1600 }); });
      await k.buildings(true); await k.swipeOn(true);
      const b = f.stage.mapB;
      return { vis: m.getLayoutProperty('ovt-3d', 'visibility'), pitch: m.getPitch(), swipe: document.getElementById('root').dataset.swipe, clip: getComputedStyle(document.getElementById('map-b')).clipPath,
               b2025: b.getSource('b-sw').serialize().tiles[0], a2017: m.getSource('sw-2017').serialize().tiles[0], chips: document.querySelector('.gs-swipe').innerText, canv: document.querySelectorAll('canvas').length };
    });
    expect(r.vis).toBe('visible');
    expect(r.pitch).toBe(45);
    expect(r.swipe).toBe('1');
    expect(r.clip).toContain('inset');
    expect(r.a2017).not.toBe(r.b2025);
    expect(r.chips).toContain('2017'); expect(r.chips).toContain('2025');
    expect(r.canv).toBe(2);
    expect(errs).toEqual([]);
  });
});
