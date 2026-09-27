// F2-A · 공개 가드 — ?public=1(직원 로그인 상태여도) · 게스트: 실태조사 모드 스위치 없음 · survey 층·모듈·데이터·API 요청 0 · 브리지로도 못 연다 · 콘솔 0
// 실행: npx playwright test tests/e2e/f2s-public-guard --reporter=line
import { test, expect } from '@playwright/test';

const API = process.env.LX_API === 'on' ? 'http://localhost:8700' : null;
async function bootApi(page, url, { realm = 'lx', role = 'staff', tenant = null } = {}) {
  let session = null;
  if (API && realm) {
    const r = await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(realm === 'lx' ? { realm, login: `lx-${role}`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' } : { realm, tenant_id: tenant, login: `${tenant}-manager`, password: process.env.DEV_PASSWORD || 'landxi-dev-2026' }) });
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
const SURVEY_RE = /\/xi\/survey\/|parcel-survey|\/survey\/|findings|timeline|\/events\/tenant|\/agent\/panel/;

for (const [name, url, opt] of [
  ['?public=1 (직원 로그인 상태여도)', XI + '?public=1&mode=survey&rule=R1&pnu=5219045021110530012', {}],
  ['게스트(로그인 없음) + ?mode=survey 를 붙여도', XI + '?cam=127.47,35.425,12,0,0&mode=survey&queue=1', { realm: null }],
]) {
  test(`${name} — 모드 스위치 없음 · survey 요청 0 · 브리지 거부 · 콘솔 0`, async ({ page }) => {
    test.setTimeout(150000);
    const errs = watch(page);
    const reqs = [];
    page.on('request', (r) => { if (SURVEY_RE.test(r.url())) reqs.push(r.url()); });
    await bootApi(page, url, opt);
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    const r = await page.evaluate(async () => {
      const out = { sw: !document.getElementById('mode-sw') || document.getElementById('mode-sw').hidden, mode: window.XI.view().mode, layers: window.__xi.A.getStyle().layers.filter((l) => /^sv-/.test(l.id)).length,
        drawer: document.getElementById('fdrawer').hidden, card: document.getElementById('pcard2').hidden, big: document.getElementById('hud-big').textContent, env: document.getElementById('hud-prov').textContent };
      try { await window.XI.setMode('survey'); out.setMode = window.XI.view().mode; } catch (e) { out.setMode = 'throw'; }
      try { await window.XI.openDrawer('findings', {}); out.drawerBridge = 'opened'; } catch (e) { out.drawerBridge = 'throw'; }
      try { await window.XI.parcelCard('5219045021110530012'); out.cardBridge = 'opened'; } catch (e) { out.cardBridge = 'throw'; }
      return out;
    });
    await page.waitForTimeout(800);
    // 3차 판정: 공개·게스트도 HLS 자동 표시는 뷰포트 중심 + 커버리지 ≥ 70 % 일 때만 — 미달이면 HLS 층 visible 0 · 스크러버 '궤도 밖' 결손 + '그래도 보기'
    await page.waitForFunction(() => /^hls/.test(document.getElementById('scrub').dataset.mode || '') || document.getElementById('scrub').querySelector('.xi-scrub-void:not([hidden])'), null, { timeout: 30000 });
    const hls = await page.evaluate(() => {
      const A = window.__xi.A, vis = A.getStyle().layers.filter((l) => /^img-hls-/.test(l.id) && A.getLayoutProperty(l.id, 'visibility') === 'visible' && +(A.getPaintProperty(l.id, 'raster-opacity') ?? 0) > 0).map((l) => l.id);
      return { gate: window.__xi.hlsScrubGate || null, mode: document.getElementById('scrub').dataset.mode, vis, voidTxt: document.querySelector('#scrub .xi-scrub-void')?.textContent || '', force: !!document.querySelector('#scrub .xi-scrub-force') };
    });
    console.log('hls', JSON.stringify(hls));
    if (hls.gate && !hls.gate.ok) {
      expect(hls.vis).toEqual([]);                          // HLS 층 visible = 0 (cov < 70 %)
      expect(hls.mode).toBe('hls-off');
      expect(hls.voidTxt).toContain('궤도 밖');
      expect(hls.force).toBe(true);                         // 사용자가 켤 때만
      await page.click('#scrub .xi-scrub-force');
      await page.waitForFunction(() => document.getElementById('scrub').dataset.mode === 'hls', null, { timeout: 30000 });
      const on = await page.evaluate(() => window.__xi.A.getStyle().layers.filter((l) => /^img-hls-/.test(l.id) && window.__xi.A.getLayoutProperty(l.id, 'visibility') === 'visible').length);
      expect(on).toBeGreaterThan(0);                         // 켜면 보인다(죽은 버튼 0)
    } else if (hls.gate) expect(hls.gate.cov).toBeGreaterThanOrEqual(0.7);
    console.log(JSON.stringify(r), 'survey reqs', reqs.length, reqs.slice(0, 3));
    expect(r.sw).toBe(true);
    expect(r.mode).toBe('read'); expect(r.layers).toBe(0);
    expect(r.drawer).toBe(true); expect(r.card).toBe(true);
    expect(r.setMode === 'read' || r.setMode === 'throw').toBe(true);
    expect(r.drawerBridge).toBe('throw'); expect(r.cardBridge).toBe('throw');
    expect(r.env).toContain('AI 추론 · 검수 전');          // 시민 화면 봉투 통일(v1.1-2)
    expect(reqs).toEqual([]);
    expect(errs).toEqual([]);
  });
}
