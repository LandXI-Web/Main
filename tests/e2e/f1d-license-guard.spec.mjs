// F1-D · 라이선스 가드 — build=export 에 EOX 2018+ · Maxar 없음 · public 은 자체 영상 0 · 화면 출처 칩 문구
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.LX_API === 'on' ? (process.env.LX_API_BASE || 'http://localhost:8700') : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {   // F1-CONTRACT §12 복사(_roles.mjs import 금지)
  let session = null;
  if (API) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD }) });
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

const load = (b) => `/landxi/global/index.html?tenant=lx&locale=en&build=${b}`;

test.describe('F1-D license guard', () => {
  test.setTimeout(120000);

  test('build=export — 카탈로그에 비상업(NC)·Maxar·EOX 2018+ 없음 · 메이크틸라는 S2 전후로 대체 표기', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, load('export'));
    const ids = await page.evaluate(() => window.__f1d.ctx.cat.items.map((i) => i.id + '|' + i.license + '|' + i.export_policy));
    expect(ids.some((x) => /maxar/.test(x))).toBe(false);
    expect(ids.some((x) => /NC/.test(x.split('|')[1]))).toBe(false);
    expect(ids.some((x) => /^eox-s2cloudless-20(1[89]|2\d)/.test(x))).toBe(false);
    expect(ids.some((x) => /never$/.test(x))).toBe(false);
    await page.evaluate(() => window.__f1d.go('meiktila'));
    await expect(page.locator('.g-ladder__now')).toContainText('PC S2 L2A');
    await page.evaluate(() => window.__f1d.scenes.mk.swipeOn(50));
    await expect(page.locator('.gs-swipe')).toContainText('Maxar unavailable');
    const layers = await page.evaluate(() => window.__f1d.stage.map.getStyle().layers.map((l) => l.id).join(' '));
    expect(layers).not.toMatch(/eox-s2cloudless-2025/);
    expect(errs).toEqual([]);
  });

  test('build=public(게스트) — 자체 영상(xyz/pmtiles/cog) 0 · 외부 위성만', async ({ page }) => {
    const errs = watch(page);
    await page.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.removeItem('lx_logged_in'); localStorage.removeItem('lx_tenant_session'); localStorage.removeItem('lx_api_session'); });
    await page.goto('/landxi/global/index.html?locale=en');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
    const r = await page.evaluate(() => ({ build: window.__f1d.build, tenant: window.__f1d.tenant, own: window.__f1d.ctx.cat.items.filter((i) => i.role === 'imagery' && i.source !== 'external').map((i) => i.id) }));
    expect(r.build).toBe('public'); expect(r.tenant).toBe('guest'); expect(r.own).toEqual([]);
    await expect(page.locator('#tenant-chip')).toContainText('Guest');
    expect(errs).toEqual([]);
  });

  test('build=lx — EOX 2025 칩 CC BY-NC-SA 표기 · 하니스 /catalog/layers build=export 도 같은 규칙(켜져 있으면)', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, load('lx'));
    await page.evaluate(() => window.__f1d.stage.map.jumpTo({ center: [74.6, 42.9], zoom: 6.5 }));
    await expect(page.locator('.g-ladder__now')).toContainText('EOX S2 cloudless 2025');
    await expect(page.locator('.g-ladder__now')).toContainText('CC BY-NC-SA');
    const base = process.env.F1D_HARNESS || 'http://localhost:8711';
    let j = null; try { j = await (await fetch(base + '/api/v1/catalog/layers?stage=global&build=export', { signal: AbortSignal.timeout(1500) })).json(); } catch { j = null; }
    if (j) { const ids = j.items.map((i) => i.id); expect(ids).not.toContain('maxar-mm-meiktila'); expect(ids).not.toContain('eox-s2cloudless-2025'); }
    expect(errs).toEqual([]);
  });
});
