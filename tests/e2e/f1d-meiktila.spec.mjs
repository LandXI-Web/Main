// F1-D · K-2 메이크틸라(시연 한정) — Maxar 전(03-06)↔후(04-03) 스와이프 · EMS 38(4/23/11) Overture 채색 · 등급 차트 봉투 · CC BY-NC 칩
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
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  return errs;
}

const PAGE = '/landxi/global/index.html?tenant=lx&locale=en';

test.describe('F1-D Meiktila', () => {
  test.setTimeout(120000);

  test('Maxar 전후 스와이프 · 38동 등급 · 차트 · 시연 한정 칩 · 타일 404 0', async ({ page }) => {
    const errs = watch(page); const bad = [];
    page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
    await bootApi(page, PAGE);
    await page.evaluate(() => window.__f1d.go('meiktila'));
    await expect(page.locator('#card')).toContainText('dp-mm-meiktila-25');
    await expect(page.locator('#card .g-stage')).toHaveText(/shadow/i);
    const g = page.locator('.g-grade');
    await expect(g).toHaveCount(3);
    await expect(g.nth(0)).toContainText('Destroyed'); await expect(g.nth(0).locator('em')).toHaveText('4');
    await expect(g.nth(1)).toContainText('Damaged'); await expect(g.nth(1).locator('em')).toHaveText('23');
    await expect(g.nth(2)).toContainText('Possibly'); await expect(g.nth(2).locator('em')).toHaveText('11');
    await expect(page.locator('#mk-lic')).toContainText('CC BY-NC');
    await expect(page.locator('#mk-lic')).toContainText('demo only');
    await expect(page.locator('#mk-lic')).toContainText('Copernicus EMS');
    await expect(page.locator('#card')).toContainText('not LX inference');
    const r = await page.evaluate(async () => {
      const f = window.__f1d, m = f.stage.map;
      await new Promise((res) => { m.once('moveend', res); m.easeTo({ center: [95.8703, 20.881], zoom: 17.05, duration: 1600 }); });
      const sw = f.scenes.mk.swipeOn(40);
      await sw.glide(60, 1000);
      const feats = f.ctx.mk.dmg.features;
      return { n: feats.length, joined: feats.filter((x) => x.properties.joined).length, fill: JSON.stringify(m.getStyle().layers.find((l) => l.id === 'dmg-fill').paint['fill-color']),
               pre: m.getSource('mk-pre').serialize().tiles[0], post: f.stage.mapB.getSource('b-maxar').serialize().tiles[0], chips: document.querySelector('.gs-swipe').innerText, swipe: f.stage.swipeAt,
               ladder: document.querySelector('.g-ladder__now').innerText };
    });
    expect(r.n).toBe(38);
    expect(r.joined).toBe(38);
    expect(r.fill).toContain('#010102'); expect(r.fill).toContain('#006DF7'); expect(r.fill).not.toMatch(/D1352B/i);   // 빨강은 조치 글자만
    expect(r.pre).toContain('maxar_meiktila_pre'); expect(r.post).toContain('maxar_meiktila_post');
    expect(r.chips).toContain('Maxar 2025-03-06'); expect(r.chips).toContain('Maxar 2025-04-03');
    expect(r.swipe).toBeCloseTo(60, 0);
    expect(r.ladder).toContain('CC BY-NC');
    await page.waitForTimeout(1500);
    expect(bad).toEqual([]);
    expect(errs).toEqual([]);
  });
});
