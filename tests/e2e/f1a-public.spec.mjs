// F1-A · 공개 모드(?public=1 · 게스트) — 자체 영상 타일 요청 0(네트워크 단언 · 서비스워커 포함) · xdworld + 공개 결과만 · 내보내기 비활성 · 마스트 '공개 · 위성 + AI 결과'
// 실행: npx playwright test tests/e2e/f1a-public --reporter=line
import { test, expect } from '@playwright/test';

/* ── F1-CONTRACT §12 픽스처(각 spec 안에 복사 · _roles.mjs import 금지) ── */
const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: ({ staff: 'test@lx.or.kr', admin: 'lxadmin@lx.or.kr', sales: 'sales@lx.or.kr' })[role], password: process.env.DEV_PASSWORD } : { realm, tenant_id: tenant, login: 'lxadmin@lx.or.kr', site: 'gov', password: process.env.DEV_PASSWORD }) });
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
/** 자체 영상·비공개 참조 — 공개 모드에서 한 건도 나가면 안 된다 */
const OWN = /\/landxi\/data\/(tiles|cog|parcels|cache)\/|namwon_ap25|namwon_25(04|06|08|10)|namwon_city|\/assets\/tiles\/|\/tiles\/pmtiles\/imagery\/|parcels-namwon|\/cog\//;

async function publicRun(page, url, opts) {
  const all = [];
  page.context().on('request', (r) => all.push(r.url()));      // 서비스워커가 대신 보내는 요청까지
  page.on('request', (r) => all.push(r.url()));
  await bootApi(page, url, opts);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  return all;
}

test('?public=1 (직원 로그인 상태여도) — 자체 영상 요청 0 · xdworld 있음 · 결과 벡터 도착 · 마스트 · 내보내기 비활성 · 동사 V1 V5 V6 V8', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  const reqs = await publicRun(page, XI + '?public=1');
  const own = reqs.filter((u) => OWN.test(u));
  const xd = reqs.filter((u) => /xdworld\.vworld\.kr/.test(u));
  const s = await page.evaluate(() => ({ build: document.documentElement.dataset.build, verbs: document.documentElement.dataset.verbs, mast: document.getElementById('mast-mode').textContent,
    big: document.getElementById('hud-big').textContent, bigBasis: document.getElementById('hud-big').dataset.basis, prov: document.getElementById('hud-prov').textContent, chip: document.getElementById('hud-chip').dataset.src, results: [...window.__xi.state.results],
    items: window.__xi.data.cat.items.map((i) => i.id + ':' + i.role + ':' + i.source + ':' + i.export_policy),
    hidden: ['tool-rect', 'tool-poly', 'tool-emd', 'tool-3d', 'tool-stats', 'tool-report'].filter((id) => document.getElementById(id).hidden), tileLog: window.__xi.TILE_LOG.length }));
  console.log('public', JSON.stringify({ own: own.length, xd: xd.length, ...s, items: s.items.length }));
  expect(own).toEqual([]);
  expect(xd.length).toBeGreaterThan(0);
  expect(s.build).toBe('public');
  expect(s.verbs).toBe('V1 V5 V6 V8');
  expect(s.mast).toContain('공개 · 위성 + AI 결과');
  expect(s.chip).toBe('xdworld-satellite');
  expect(s.results).toEqual(['namwon-farmland-2025']);
  expect(Number(s.big.replace(/,/g, ''))).toBeGreaterThan(0);
  expect(s.bigBasis).toBe('inferred'); expect(s.prov).toContain('AI 추론 · 결과 확인 전');   // 시민 화면도 AI 판독 결과를 '실측'이라 하지 않는다(on/off 같은 배지)
  for (const it of s.items) { const [, role, src, pol] = it.split(':'); if (role === 'imagery') expect(src, it).toBe('external'); if (role === 'result') expect(pol, it).toBe('public'); }
  expect(s.hidden.length).toBe(6);
  // 내보내기 비활성(표 탭)
  await page.click('#panel .xi-panel-toggle');
  await page.click('#panel [data-tab=table]');
  await page.waitForSelector('#panel .xi-export button', { timeout: 10000 });
  const ex = await page.evaluate(() => ({ dis: [...document.querySelectorAll('#panel .xi-export button')].map((b) => b.disabled), why: document.querySelector('#panel .xi-export small').textContent }));
  console.log('export', JSON.stringify(ex));
  expect(ex.dis.every(Boolean)).toBeTruthy();
  expect(ex.why).toContain('공개');
  // 읍면동 클릭 → 집계는 로그인 후(토스트) · AOI 하강 없음
  const pt = await page.evaluate(() => window.__xi.emdPoint('운봉읍', [300, 300, 1000, 760]));
  if (pt) { await page.mouse.click(pt[0], pt[1]); await page.waitForTimeout(500); expect(await page.evaluate(() => document.getElementById('emd-card').hidden)).toBe(true); }
  expect(reqs.filter((u) => OWN.test(u))).toEqual([]);
  expect(errs).toEqual([]);
});

test('게스트(로그인 없음) = 공개 빌드 · 같은 단언 · 같은 카메라 복원(?public=1&cam=)', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  const reqs = await publicRun(page, XI + '?public=1&cam=127.47,35.425,12.5,35,0', { realm: null });
  const s = await page.evaluate(() => ({ role: document.documentElement.dataset.role, build: document.documentElement.dataset.build, c: window.__xi.A.getCenter().toArray(), z: window.__xi.A.getZoom(), p: window.__xi.A.getPitch() }));
  console.log(JSON.stringify(s));
  expect(s.role).toBe('guest'); expect(s.build).toBe('public');
  expect(Math.abs(s.c[0] - 127.47)).toBeLessThan(0.01); expect(Math.abs(s.z - 12.5)).toBeLessThan(0.05); expect(Math.round(s.p)).toBe(35);
  expect(reqs.filter((u) => OWN.test(u))).toEqual([]);
  // 드론 AOI 로 가려 해도 원본은 로그인 후
  await page.evaluate(() => window.__xi.toAoi());
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.getElementById('xi-toasts')?.textContent || '')).toContain('로그인 후');
  expect(reqs.filter((u) => OWN.test(u))).toEqual([]);
  expect(errs).toEqual([]);
});
