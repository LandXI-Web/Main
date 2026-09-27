// F1-A 사다리 spec — 글로브 → 한국 2400 → 남원 1600: 출처 칩 ≥ 3회 전환(VIIRS/HLS → V-World → 2023 25cm) · 카메라 점프 0 · pitch 0→35 · 국가 hit-test 국내 무대
import { test, expect } from '@playwright/test';

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
function watch(page) { const errs = []; page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); }); return errs; }
const XI = '/landxi/xi/index.html';

test('글로브 → 남원 하강: 출처 칩 전환 · 점프 0 · pitch 0→35 · 국내 무대', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'sweep'), null, { timeout: 60000 });
  const r = await page.evaluate(() => {
    const X = window.__xi, chips = X.hud.chips.map((c) => c.id || c.text);
    const seq = chips.filter((c, i) => c !== chips[i - 1]);
    const fl = X.CAMLOG.frames, pitches = fl.map((f) => f[4]);
    return { seq, jumps: X.jumps(), p0: pitches[0], pMax: Math.max(...pitches), last: fl[fl.length - 1], flights: X.CAMLOG.flights.map((f) => f.duration), stage: document.documentElement.dataset.stage, zoom: X.A.getZoom(),
      gate: X.hlsGate, hlsVis: X.A.getLayer('img-gibs-hls-s30') ? X.A.getLayoutProperty('img-gibs-hls-s30', 'visibility') : 'absent', misses: X.missLog || [] };
  });
  console.log('칩 순서', r.seq.join(' → '), '· 비행', r.flights.join('/'), '· 점프', r.jumps, '· pitch', r.p0, '→', r.pMax, '· 무대', r.stage);
  const want = ['gibs-viirs-truecolor', 'xdworld-satellite', 'ap25-namwon-2023'];
  let k = 0; for (const c of r.seq) if (c === want[k]) k++;
  expect(k, '칩이 VIIRS → V-World → 25cm 순서로 지나간다').toBe(3);
  // F2-A must_fix 4: HLS 는 하강 경로 화면 커버리지 ≥ 70 % · 중심 유효일 때만 켠다 — 아니면 층을 끄고 'HLS 30m · 궤도 밖' 결손 칩
  console.log('HLS 판정', JSON.stringify(r.gate), 'vis', r.hlsVis, 'miss', JSON.stringify(r.misses.slice(0, 4)));
  if (r.gate?.ok) { expect(r.seq).toContain('gibs-hls-s30'); expect(r.seq.length - 1).toBeGreaterThanOrEqual(3); }
  else { expect(r.seq).not.toContain('gibs-hls-s30'); expect(['none', 'absent']).toContain(r.hlsVis); expect(r.seq.length - 1).toBeGreaterThanOrEqual(2); expect(r.misses.some((m) => m.startsWith('HLS 30m · 궤도 밖'))).toBe(true); }
  expect(r.misses.some((m) => /^어제 · 구름 \d+%$/.test(m))).toBe(true);
  expect(r.flights).toEqual(expect.arrayContaining([2400, 1600]));
  expect(r.jumps).toBe(0);
  expect(r.p0).toBe(0);
  expect(r.pMax).toBeGreaterThanOrEqual(34.9);
  expect(r.stage).toBe('domestic');
  expect(r.zoom).toBeCloseTo(12.5, 1);
  // 1cm 까지: 드론 AOI 하강에서 25cm → 2m → 1.08cm
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 30000 });
  const n0 = await page.evaluate(() => window.__xi.hud.chips.length);
  await page.evaluate(() => window.__xi.toAoi());
  await page.waitForFunction(() => window.__xi.PHASES.filter((x) => x.p === 'arrived').length >= 2, null, { timeout: 40000 });
  const aoi = await page.evaluate((n0) => window.__xi.hud.chips.slice(n0).map((c) => c.id), n0);
  console.log('AOI 하강 칩', aoi.join(' → '));
  expect(aoi).toEqual(expect.arrayContaining(['namwon-city-2504', 'namwon-aoi-2504']));
  expect(await page.evaluate(() => window.__xi.jumps())).toBe(0);
  expect(errs).toEqual([]);
});
