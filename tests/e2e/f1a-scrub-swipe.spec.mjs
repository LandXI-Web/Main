// F1-A · 시계열 스크럽(재생 6s · 정수 정지 750 · 변화 히스토그램) · 스와이프(±4 % · 양쪽 출처 칩 · ?swipe=) · 압출(기본 OFF · pitch ≤ 60)
// 실행: npx playwright test tests/e2e/f1a-scrub-swipe --reporter=line
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD }) });
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
const AOI = '?cam=127.3524,35.5308,16.6,35,0&on=namwon-farmland-2025,namwon-change';

test('스크럽 — 재생 6s · 정수 정지 750±40 · 히스토그램 3막대(봉투) · 출처 칩이 시점을 따른다 · ?epoch 복원', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + AOI);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1' && window.__xi.scrub.S.enabled, null, { timeout: 60000 });
  const h = await page.evaluate(() => [...document.querySelectorAll('#scrub .xi-hist .xi-bar')].map((b) => ({ basis: b.querySelector('[data-basis]')?.dataset.basis, h: parseFloat(b.style.height), t: b.textContent })));
  console.log('hist', JSON.stringify(h));
  expect(h.length).toBe(3);
  for (const b of h) { expect(b.basis).toBe('measured'); expect(b.h).toBeLessThanOrEqual(24); }
  // 재생
  await page.evaluate(() => { window.__chipsE = []; const el = document.getElementById('hud-chip'); new MutationObserver(() => { const s = el.dataset.src; if (s && window.__chipsE[window.__chipsE.length - 1] !== s) window.__chipsE.push(s); }).observe(el, { attributes: true, childList: true, subtree: true }); window.__xi.scrub.S.stops.length = 0; });
  const t0 = await page.evaluate(() => performance.now());
  await page.click('#scrub .xi-play');
  await page.waitForFunction(() => document.getElementById('scrub').dataset.playing === '1', null, { timeout: 5000 });
  await page.waitForFunction(() => !document.getElementById('scrub').dataset.playing, null, { timeout: 15000 });
  const r = await page.evaluate((t0) => ({ ms: performance.now() - t0, stops: window.__xi.scrub.S.stops, e: window.__xi.scrub.S.e, chips: window.__chipsE, url: location.search }), t0);
  console.log('play', Math.round(r.ms), JSON.stringify(r.stops), JSON.stringify(r.chips));
  expect(r.stops.map((s) => s.k)).toEqual([0, 1, 2, 3]);
  for (const s of r.stops) expect(Math.abs(s.ms - 750)).toBeLessThanOrEqual(40);
  expect(r.ms).toBeGreaterThan(5800); expect(r.ms).toBeLessThan(6800);
  expect(r.e).toBe(3);
  expect(r.chips).toEqual(expect.arrayContaining(['namwon-aoi-2506', 'namwon-aoi-2508', 'namwon-aoi-2510']));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => location.search)).toContain('epoch=3');
  // 키보드 ±0.25
  await page.focus('#scrub input[type=range]');
  await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.__xi.scrub.S.e)).toBe(2.75);
  // ?epoch 복원
  await page.goto(XI + AOI + '&epoch=1.5');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  expect(await page.evaluate(() => window.__xi.scrub.S.e)).toBe(1.5);
  expect(errs).toEqual([]);
});

test('스와이프 — 열기 · ←/→ ±4 % · 6–94 % · 양쪽 출처 칩 · 끌기 20→80 · ?swipe 복원', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI + AOI);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.click('#tool-swipe');
  await page.waitForFunction(() => window.__xi.swipe.S.on, null, { timeout: 10000 });
  const c = await page.evaluate(() => ({ l: document.getElementById('sw-l').textContent, r: document.getElementById('sw-r').textContent, lv: !document.getElementById('sw-l').hidden, rv: !document.getElementById('sw-r').hidden, canv: document.querySelectorAll('canvas.maplibregl-canvas').length }));
  console.log(JSON.stringify(c));
  expect(c.lv && c.rv).toBeTruthy();
  expect(c.l).toContain('원본'); expect(c.r).toContain('AI 결과');
  expect(c.canv).toBeLessThanOrEqual(2);
  await page.focus('#grip');
  await page.keyboard.press('ArrowRight');
  expect(await page.evaluate(() => window.__xi.swipe.S.v)).toBe(54);
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  expect(await page.evaluate(() => window.__xi.swipe.S.v)).toBe(46);
  // 끌기 20 → 80
  const g = await page.locator('#grip').boundingBox();
  await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2); await page.mouse.down();
  await page.mouse.move(1440 * 0.2, g.y + g.height / 2, { steps: 8 });
  const v20 = await page.evaluate(() => window.__xi.swipe.S.v);
  await page.mouse.move(1440 * 0.8, g.y + g.height / 2, { steps: 16 }); await page.mouse.up();
  const v80 = await page.evaluate(() => window.__xi.swipe.S.v);
  console.log('drag', v20, v80);
  expect(Math.abs(v20 - 20)).toBeLessThan(2); expect(Math.abs(v80 - 80)).toBeLessThan(2);
  // 경계 6–94
  await page.evaluate(() => window.__xi.swipe.set(2)); expect(await page.evaluate(() => window.__xi.swipe.S.v)).toBe(6);
  await page.evaluate(() => window.__xi.swipe.set(99)); expect(await page.evaluate(() => window.__xi.swipe.S.v)).toBe(94);
  // 복원
  await page.goto(XI + AOI + '&swipe=30');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  expect(await page.evaluate(() => [window.__xi.swipe.S.on, window.__xi.swipe.S.v])).toEqual([true, 30]);
  expect(errs).toEqual([]);
});

test('압출 — 기본 OFF · 켜면 fill-extrusion + pitch ≤ 60 · 끄면 원래대로', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI + '?cam=127.52,35.43,14.5,35,0&on=namwon-farmland-2025');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  const off = await page.evaluate(() => ({ pressed: document.getElementById('tool-3d').getAttribute('aria-pressed'), vis: window.__xi.A.getLayer('ex-3d') ? window.__xi.A.getLayoutProperty('ex-3d', 'visibility') : 'absent', ex: window.__xi.state.extrude }));
  expect(off.pressed).toBe('false'); expect(off.ex).toBe(false); expect(['absent', 'none']).toContain(off.vis);
  await page.click('#tool-3d');
  await page.waitForFunction(() => window.__xi.state.extrude && location.search.includes('3d=1'), null, { timeout: 15000 });
  const on = await page.evaluate(() => ({ vis: window.__xi.A.getLayoutProperty('ex-3d', 'visibility'), pitch: window.__xi.A.getPitch(), maxPitch: window.__xi.A.getMaxPitch(), url: location.search, tier: window.__xi.tier?.tier || null, tierLog: window.__xi.tierLog }));
  console.log(JSON.stringify(on));
  expect(on.vis).toBe('visible');
  // 티어(정상 창 판정): T1 → 기울기 45 초과 · 60 이하 / T2 → 45 이하(헤드리스 병렬 실행에서는 T2 가 정직한 판정일 수 있다)
  if (on.tier === 'T2') expect(on.pitch).toBeLessThanOrEqual(45); else expect(on.pitch).toBeGreaterThan(45);
  expect(on.pitch).toBeLessThanOrEqual(60); expect(on.maxPitch).toBeLessThanOrEqual(60);
  // 사용자가 끝까지 기울여도 60 을 넘지 않는다
  await page.evaluate(() => window.__xi.A.jumpTo({ pitch: 85 }));
  expect(await page.evaluate(() => window.__xi.A.getPitch())).toBeLessThanOrEqual(60);
  await page.click('#tool-3d');
  await page.waitForFunction(() => !window.__xi.state.extrude && !location.search.includes('3d=1'), null, { timeout: 15000 });
  expect(await page.evaluate(() => window.__xi.A.getLayoutProperty('ex-3d', 'visibility'))).toBe('none');
  expect(errs).toEqual([]);
});
