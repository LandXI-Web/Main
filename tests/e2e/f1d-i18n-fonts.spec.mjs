// F1-D · 글로벌판 서체 · i18n — lang=en Inter 600/700 표시체 · 단위 ha/km² · 키릴 병기 · 14px 미만 0 · fonts-compare.html · login.html 기관 문
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

const PAGE = '/landxi/global/index.html?tenant=lx&locale=en';
const small = () => [...document.querySelectorAll('body *')].filter((el) => {
  if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return false;
  const r = el.getBoundingClientRect(); if (!r.width || !r.height) return false;
  const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return false;
  return parseFloat(cs.fontSize) < 14;
}).map((el) => el.tagName + '.' + el.className + ':' + getComputedStyle(el).fontSize + ':' + el.textContent.trim().slice(0, 30));

test.describe('F1-D i18n · fonts', () => {
  test.setTimeout(120000);

  test('lang=en — H1 Inter 700 · Inter 600/700 로드 · 키릴 글리프 있음 · 14px 미만 0 (글로브 · 으슥아타 · 소쿨룩)', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    const r = await page.evaluate(async () => {
      await document.fonts.ready;
      const h = getComputedStyle(document.querySelector('#hero h1'));
      return { lang: document.documentElement.lang, ff: h.fontFamily, fw: h.fontWeight, i6: document.fonts.check('600 16px Inter', 'Ысык'), i7: document.fonts.check('700 16px Inter') };
    });
    expect(r.lang).toBe('en'); expect(r.ff).toMatch(/^"?Inter/); expect(r.fw).toBe('700'); expect(r.i6).toBe(true); expect(r.i7).toBe(true);
    expect(await page.evaluate(small)).toEqual([]);
    await page.evaluate(() => window.__f1d.go('ysykata'));
    await page.evaluate(() => { const y = window.__f1d.scenes.ys; y.frame(); return y.quote(); });
    await expect(page.locator('#ys-quote')).toContainText('km²');
    await expect(page.locator('#card')).toContainText(' ha');
    await expect(page.locator('#card .g-cyr')).toHaveText('Ысык-Ата');
    const cyrFont = await page.evaluate(() => getComputedStyle(document.querySelector('#card .g-cyr')).fontFamily);
    expect(cyrFont).toMatch(/^"?Inter/);
    expect(await page.evaluate(small)).toEqual([]);
    await page.evaluate(() => window.__f1d.go('sokuluk'));
    await expect(page.locator('#card')).toContainText('km²');
    expect(await page.evaluate(small)).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('locale=ko — 국문판 표시체 Paperlogy · 지명 키릴 병기 유지 · ru UI 없음', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, '/landxi/global/index.html?tenant=lx&locale=ko');
    const r = await page.evaluate(() => ({ lang: document.documentElement.lang, ff: getComputedStyle(document.querySelector('#hero h1')).fontFamily, h: document.querySelector('#hero h1').innerText }));
    expect(r.lang).toBe('ko'); expect(r.ff).toMatch(/Paperlogy/); expect(r.h).toContain('36');
    const langs = await page.evaluate(() => [...document.querySelectorAll('#lang a')].map((a) => a.dataset.l));
    expect(langs).toEqual(['en', 'ko']);
    expect(errs).toEqual([]);
  });

  test('fonts-compare.html — Paperlogy 라틴 vs Inter 나란히 · 실측 폭 표 · 키릴 판정', async ({ page }) => {
    const errs = watch(page);
    await page.goto('/landxi/global/fonts-compare.html');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 20000 });
    await expect(page.locator('.fc-col')).toHaveCount(2);
    const ff = await page.evaluate(() => [...document.querySelectorAll('.fc-h1')].map((h) => getComputedStyle(h).fontFamily));
    expect(ff[0]).toMatch(/Paperlogy/); expect(ff[1]).toMatch(/Inter/);
    await expect(page.locator('.fc-m')).toContainText('Cyrillic glyphs');
    expect(await page.evaluate(small)).toEqual([]);
    expect(errs).toEqual([]);
  });

  test('login.html — 기관 문(realm tenant) · off 는 lx_tenant_session 흉내 · LX 키 제거 · 기관 화면으로', async ({ page }) => {
    const errs = watch(page);
    await page.addInitScript(() => { if (!sessionStorage.getItem('b')) { sessionStorage.setItem('b', '1'); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); } });
    await page.goto('/landxi/global/login.html');
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready');
    await page.selectOption('#tenant', 'kgz-land');
    await expect(page.locator('#login')).toHaveValue('kgz-land-manager');
    await page.fill('#pw', 'x');
    await page.click('button[type="submit"]');
    await page.waitForURL(/index\.html\?svc=dp-kgz-land-change-26/);
    await page.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
    const r = await page.evaluate(() => ({ t: JSON.parse(localStorage.getItem('lx_tenant_session')).tenant, lx: localStorage.getItem('lx_logged_in'), tenant: window.__f1d.tenant, build: window.__f1d.build }));
    expect(r).toEqual({ t: 'kgz-land', lx: null, tenant: 'kgz-land', build: 'tenant' });
    await expect(page.locator('#tenant-chip')).toContainText('Land Resources');
    expect(errs).toEqual([]);
  });
});
