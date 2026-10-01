// F2-A · 브리지 window.XI 전수 — 함수·이벤트 표(결과 문서 §0) · 봉투 없는 숫자 throw · 마운트 지점 · 에이전트 import 콘솔 0 · ⌘K
// 실행: npx playwright test tests/e2e/f2a-bridge --reporter=line   (LX_API=on 이면 게이트웨이 :8700)
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
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

test('window.XI — 함수 전수 · 이벤트 · 봉투 throw · 마운트 지점 · 에이전트 import 콘솔 0', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const X = window.XI; await X.ready;
    const fns = ['session', 'view', 'layerOn', 'layerOff', 'arrive', 'flyTo', 'frame', 'parcelCard', 'openDrawer', 'closeDrawer', 'setMode', 'toast', 'slot', 'provide', 'provider', 'on', 'listeners'];
    const missing = fns.filter((f) => typeof X[f] !== 'function');
    const hud = typeof X.hud?.set === 'function' && typeof X.hud?.status === 'function';
    const ev = []; const off = X.on('view', (d) => ev.push(d));
    let throwArrive = null, throwHud = null;
    try { await X.arrive({ count: 12, bbox: [127.4, 35.4, 127.5, 35.5] }); } catch (e) { throwArrive = e.name + ': ' + e.message.slice(0, 40); }
    try { X.hud.set(20852, { title: 'x' }); } catch (e) { throwHud = e.constructor.name + ':' + e.message.slice(0, 12); }
    let badEvt = null; try { X.on('nope', () => {}); } catch (e) { badEvt = 'throw'; }
    const s = X.session(), v = X.view();
    await X.flyTo({ center: [127.45, 35.43], zoom: 12.7 }, 1000);
    await new Promise((res) => setTimeout(res, 400));
    off();
    X.hud.set({ value: 7, unit: 'count', basis: 'demo', as_of: '2026-09-27', source: 'e2e' }, { title: '브리지 hud.set', unit: '건' });
    const big = document.getElementById('hud-big').textContent;
    const slots = { agent: !!X.slot('agent'), cmdk: !!X.slot('cmdk'), draft: !!X.slot('report-draft') };
    const slotRect = { agent: document.getElementById('agent-slot').getBoundingClientRect().toJSON(), cmdk: document.getElementById('cmdk-slot').getBoundingClientRect().toJSON() };
    return { missing, hud, throwArrive, throwHud, badEvt, s, vKeys: Object.keys(v), views: ev.length, big, slots, slotRect, agent: window.__xi.agent, version: X.version };
  });
  console.log(JSON.stringify(r));
  expect(r.missing).toEqual([]);
  expect(r.hud).toBe(true);
  expect(r.throwArrive).toMatch(/EnvelopeError|봉투/);
  expect(r.throwHud).toMatch(/^EnvelopeError:봉투 없는 숫자/);
  expect(r.badEvt).toBe('throw');
  expect(r.s.role).toBe('staff');
  expect(r.vKeys).toEqual(expect.arrayContaining(['center', 'zoom', 'bbox', 'on', 'frame', 'svc', 'mode', 'epoch']));
  expect(r.views).toBeGreaterThan(0);
  expect(r.big).toBe('7');
  expect(r.slots).toEqual({ agent: true, cmdk: true, draft: true });
  expect(r.slotRect.cmdk.width).toBe(480);
  expect(['mounted', 'missing', 'absent']).toContain(r.agent);   // 직원 세션 — 'skipped' 는 게스트·공개만
  expect(errs).toEqual([]);
});

test('XI.arrive(features) → 도착 · 임시 층 레이어 패널 · layerOff · XI.setMode survey → mode 이벤트 · openDrawer findings', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const X = window.XI; await X.ready;
    const ev = { mode: [], drawer: [], finding: [] };
    X.on('mode', (d) => ev.mode.push(d.mode)); X.on('drawer', (d) => ev.drawer.push(d.kind)); X.on('finding', (d) => ev.finding.push(d.id));
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { id: 'a1', cls: '경작지' }, geometry: { type: 'Polygon', coordinates: [[[127.44, 35.42], [127.45, 35.42], [127.45, 35.43], [127.44, 35.43], [127.44, 35.42]]] } }] };
    await X.arrive({ features: fc, count: { value: 1, unit: 'count', basis: 'inferred', as_of: '2026-09-27', source: 'e2e 질의' }, label: '에이전트 질의 e2e', head: { title: '질의 도착' } });
    const big = document.getElementById('hud-big').textContent;
    window.__xi.panel.setOpen(true); window.__xi.panel.S.tab = 'layers'; window.__xi.panel.render();
    const tempRow = !!document.querySelector('#panel [data-temp]');
    const id = document.querySelector('#panel [data-temp]')?.dataset.temp;
    await X.layerOff(id);
    const tempGone = !document.querySelector('#panel [data-temp]') && !window.__xi.A.getLayer(id + '-fill');
    await X.setMode('survey', { animate: false });
    await X.openDrawer('findings', { rule: 'R1', priority: 'A' });
    await new Promise((r) => setTimeout(r, 300));
    const total = document.getElementById('fdrawer').dataset.total;
    return { big, tempRow, tempGone, ev, total, mode: X.view().mode };
  });
  console.log(JSON.stringify(r));
  expect(r.big).toBe('1');
  expect(r.tempRow).toBe(true); expect(r.tempGone).toBe(true);
  expect(r.ev.mode).toContain('survey');
  expect(r.ev.drawer).toContain('findings');
  expect(r.mode).toBe('survey');
  expect(+r.total).toBe(759);                          // README R1 A = 759(정본)
  expect(errs).toEqual([]);
});

test('⌘K — 구독자 없으면 검색 포커스 · 구독하면 cmdk 이벤트', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  const hasAgent = await page.evaluate(() => window.XI.listeners('cmdk') > 0);
  if (!hasAgent) {
    await page.keyboard.press('Control+k');
    expect(await page.evaluate(() => document.activeElement?.closest('#search') != null)).toBe(true);
  }
  await page.evaluate(() => { window.__cmdk = 0; window.XI.on('cmdk', () => window.__cmdk++); });
  await page.mouse.click(700, 500);
  await page.keyboard.press('Control+k');
  expect(await page.evaluate(() => window.__cmdk)).toBe(1);
  expect(errs).toEqual([]);
});

test('서비스 워커 막음(첫 방문·시크릿·SW 차단) — 에이전트 마운트 = 모듈 존재 표 · 외부 타일 Worker 방패(실패 = 투명 · 결손 수) · 콘솔 0', async ({ browser }) => {
  test.setTimeout(150000);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errs = watch(page);
  await bootApi(page, XI + CITY);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  const r = await page.evaluate(async () => {
    const X = window.__xi; await X.agentP;
    const src = await import('/landxi/xi/engine/sources.js');
    // 없는 외부 타일 두 개(404) — Worker 가 받아 결손으로 센다(페이지 콘솔 0)
    const a = await src.extFetch('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/NOPE_LAYER/default/2026-09-01/GoogleMapsCompatible_Level9/7/49/109.png');
    const b = await src.extFetch('https://xdworld.vworld.kr/2d/Satellite/service/0/0/0.jpeg_nope');
    return { agent: X.agent, modules: X.modules, sw: !!navigator.serviceWorker?.controller, ext: X.extMode, a: [a.ok, a.status], b: [b.ok, b.status], miss: src.EXT_MISS.n, gauge: document.getElementById('gauge-miss').hidden ? '' : document.getElementById('gauge-miss').textContent, slot: !!document.querySelector('#agent-slot > *') };
  });
  console.log(JSON.stringify(r));
  const present = fs.existsSync('landxi/agent/panel.js');
  expect(r.sw).toBe(false);
  expect(r.ext).toBe('worker');
  expect(r.agent).toBe(present ? 'mounted' : 'absent');             // SW 없이도 파일이 있으면 마운트(1차: 'skipped')
  if (present) expect(r.modules.agent.present).toBe(true);
  expect(r.a[0]).toBe(false); expect(r.b[0]).toBe(false);
  expect(r.miss).toBeGreaterThanOrEqual(2);
  expect(r.gauge).toMatch(/외부 타일 누락 \d+ · 투명 대체/);
  expect(errs).toEqual([]);                                          // 404 · 5xx 가 콘솔로 새지 않는다
  await ctx.close();
});
