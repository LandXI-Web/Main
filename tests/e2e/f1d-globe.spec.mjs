// F1-D · GLOBE-STAGE — 순백 · GIBS 어제 · LX 사업국 36 채색(사할린 점) · 우 목록 · 날짜 스크러버(페이드 500) · 남원→글로브→비슈케크(페이지 이동 0) · p95 · 캔버스 ≥ 90 %
import { test, expect } from '@playwright/test';

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

test.describe('F1-D globe stage', () => {
  test.setTimeout(90000);

  test('순백 배경 · GIBS 어제 · LX 사업국 36 + 사할린 점 · 우 목록 37행', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    const r = await page.evaluate(() => {
      const f = window.__f1d, m = f.stage.map, st = m.getStyle();
      const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const rendered = new Set(m.queryRenderedFeatures({ layers: ['lx-fill'] }).map((x) => x.properties.iso3));
      return {
        bgCss: getComputedStyle(document.querySelector('.gs-map')).backgroundColor,
        bgLayer: st.layers[0].paint['background-color'],
        gibs: m.getSource('gibs-a').tiles[0], y,
        lx: f.ctx.lx.countries.length, lxWorld: f.ctx.lx.world.features.filter((x) => x.properties.lx === 1).length,
        pts: f.ctx.lx.points.map((p) => p.id), rendered: rendered.size,
        rows: document.querySelectorAll('.gs-row').length, point: document.querySelectorAll('.gs-row[data-status="point"]').length,
        active: f.ctx.lx.countries.filter((c) => c.status === 'active').length,
        fillColor: JSON.stringify(st.layers.find((l) => l.id === 'lx-fill').paint['fill-color']),
      };
    });
    expect(r.bgCss).toBe('rgb(255, 255, 255)');
    // 배경: 글로브 줌(≤ 4.5)에서 순백 · 영상 무대(≥ 5.5)는 흙빛 무채(급한 줌아웃 흰 구멍 방지 · 1차 판정 후속)
    expect(JSON.stringify(r.bgLayer).toUpperCase()).toContain('4.5,"#FFFFFF"');
    expect(r.gibs).toContain('VIIRS_NOAA20_CorrectedReflectance_TrueColor');
    expect(r.gibs).toContain(r.y);
    expect(r.lx).toBe(36);
    expect(r.lxWorld).toBe(36);
    expect(r.pts).toEqual(['SAKHALIN']);
    expect(r.rendered).toBeGreaterThanOrEqual(12);            // 한 반구에 보이는 사업국
    expect(r.rows).toBe(37);
    expect(r.point).toBe(1);
    expect(r.active).toBeGreaterThan(0);
    expect(r.fillColor).toContain('#006DF7');
    await expect(page.locator('#hero h1')).toContainText('36');
    expect(errs).toEqual([]);
  });

  test('날짜 스크러버 31칸 · 한 칸 이동 = 두 GIBS 층 크로스페이드 500 · 타일 페이드 500', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    await expect(page.locator('.gs-date__tick')).toHaveCount(31);
    const ticks = page.locator('.gs-date__tick');
    await ticks.nth(29).click();
    await page.waitForFunction(() => window.__f1d.stage.gibs.front === 'b', null, { timeout: 8000 });
    const r = await page.evaluate(() => {
      const m = window.__f1d.stage.map, L = (id) => m.getStyle().layers.find((l) => l.id === id).paint;
      return { a: L('gibs-a'), b: L('gibs-b'), date: window.__f1d.stage.gibs.date, tile: m.getSource('gibs-b').tiles[0] };
    });
    expect(r.a['raster-opacity-transition'].duration).toBe(500);
    expect(r.a['raster-fade-duration']).toBe(500);
    expect(r.b['raster-opacity']).toBe(1);
    expect(r.a['raster-opacity']).toBe(0);
    expect(r.tile).toContain(r.date);
    await expect(page.locator('#gs-date-v')).toHaveText(r.date);
    expect(errs).toEqual([]);
  });

  test('남원 → 글로브 → 비슈케크 카메라 연속 · 페이지 이동 0 · 3200(Δz ≥ 10) + 2400', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, '/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
    const durs = await page.evaluate(async () => {
      const f = window.__f1d, m = f.stage.map, seen = [];
      const fly = m.flyTo.bind(m); m.flyTo = (o, e) => { seen.push(o.duration); return fly(o, e); };
      const z0 = m.getZoom();
      await f.go('globe', { force: true });
      const z1 = m.getZoom();
      await f.go('ysykata');
      return { seen, z0: window.__f2dFlights[0].z0, z1, z2: m.getZoom(), c: m.getCenter(), nav: performance.getEntriesByType('navigation').length, href: location.href };
    });
    expect(durs.seen).toEqual([3200, 2400]);   // 남원(z 12.3) → 글로브(z 1.8) Δz 10.5 = --e-fly 초장거리 3200(판정 3차) · 글로브 → 으슥아타 2400
    expect(durs.z0).toBeGreaterThan(11);
    expect(durs.z1).toBeLessThan(2);
    expect(durs.z2).toBeGreaterThan(9);
    expect(durs.c.lng).toBeGreaterThan(74.5);
    expect(durs.nav).toBe(1);
    expect(durs.href).toContain('from=namwon');
    await expect(page.locator('.xi-lock-flag')).toContainText('Ысык-Ата');   // F2-D: 락온 = F1-A fx/arrive.lock(깃발 .xi-lock-flag)
    expect(errs).toEqual([]);
  });

  for (const [w, h] of [[1280, 800], [1440, 900], [1920, 1080]]) {
    test(`캔버스 ≥ 90 % · 가로 스크롤 0 · 폭 ${w}`, async ({ page }) => {
      const errs = watch(page);
      await page.setViewportSize({ width: w, height: h });
      await bootApi(page, PAGE);
      const r = await page.evaluate(() => { const c = document.querySelector('#map canvas').getBoundingClientRect(); return { ratio: (c.width * c.height) / (innerWidth * innerHeight), sw: document.documentElement.scrollWidth <= innerWidth }; });
      expect(r.ratio).toBeGreaterThanOrEqual(0.9);
      expect(r.sw).toBe(true);
      expect(errs).toEqual([]);
    });
  }

  test('rAF p95 ≤ 20 ms · 캔버스 ≤ 2 (글로브 → 으슥아타 하강 동안)', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, PAGE);
    const from = await page.evaluate(() => window.__f1d.mark());
    await page.evaluate(() => window.__f1d.go('ysykata'));
    const p = await page.evaluate((f) => window.__f1d.perf(f), from);
    console.log('perf', JSON.stringify(p));
    expect(p.n).toBeGreaterThan(60);
    expect(p.p95).toBeLessThanOrEqual(20);
    expect(p.canvases).toBeLessThanOrEqual(2);
    expect(errs).toEqual([]);
  });
});
