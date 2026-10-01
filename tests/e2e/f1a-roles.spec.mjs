// F1-A · 역할 4종 관문(게스트 · 직원 · 영업 demo 강제 · 기관) + URL 상태 전부 복원(설계서 §3.1)
// 실행: npx playwright test tests/e2e/f1a-roles --reporter=line
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
const AOI = '?cam=127.3524,35.5308,16.6,35,0&on=namwon-farmland-2025,namwon-change';
const TOOLS = ['tool-rect', 'tool-poly', 'tool-emd', 'tool-swipe', 'tool-3d', 'tool-stats', 'tool-report'];
const gate = (page) => page.evaluate((T) => ({ role: document.documentElement.dataset.role, build: document.documentElement.dataset.build, verbs: document.documentElement.dataset.verbs,
  shown: T.filter((id) => !document.getElementById(id).hidden), mastRole: document.getElementById('mast-role').textContent }), TOOLS);

async function drawFrame(page) {
  await page.click('#tool-rect');
  const fr = [520, 320, 880, 620];   // 화면 한가운데(A01 촬영 범위 안)
  await page.mouse.move(fr[0], fr[1]); await page.mouse.down(); await page.mouse.move(fr[2], fr[3], { steps: 10 }); await page.mouse.up();
  await page.waitForSelector('#quote-card .xi-run', { timeout: 15000 });
}
async function openAoiParcel(page) {
  await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); X.openParcel(fa.features.find((x) => x.properties.id === X.state.aoiParcels[0])); });
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 30000 });
}

test.describe('역할 관문', () => {
  test.setTimeout(150000);
  test('게스트 — V1 V5 V6 V8 · 공개 빌드 · 프레임/입체/서랍 없음', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0', { realm: null });
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
    const g = await gate(page); console.log(JSON.stringify(g));
    expect(g.role).toBe('guest'); expect(g.build).toBe('public'); expect(g.verbs).toBe('V1 V5 V6 V8');
    expect(g.shown).toEqual(['tool-swipe']);
    expect(errs).toEqual([]);
  });
  test('직원 — 전 동사 · lx 빌드 · 프레임 → 견적(실행 가능)', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, XI + AOI);
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
    const g = await gate(page); console.log(JSON.stringify(g));
    expect(g.role).toBe('staff'); expect(g.build).toBe('lx'); expect(g.verbs).toBe('V1 V2 V3 V4 V5 V6 V7 V8');
    expect(g.shown).toEqual(TOOLS);
    await drawFrame(page);
    const q = await page.evaluate(() => ({ demo: !!document.querySelector('#quote-card .xi-demo-note'), run: !document.querySelector('#quote-card .xi-run').disabled }));
    expect(q.demo).toBe(false); expect(q.run).toBe(true);
    expect(errs).toEqual([]);
  });
  test('영업 — 프레임·실행 있음 · demo:true 강제 표기 · 내보내기 없음', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, XI + AOI, { role: 'sales' });
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
    const g = await gate(page); console.log(JSON.stringify(g));
    expect(g.role).toBe('sales'); expect(g.verbs).toBe('V1 V2 V3 V4 V5 V6 V7 V8');   // 전 동사 · 단 V3 은 demo:true 강제
    expect(g.shown).toEqual(expect.arrayContaining(['tool-rect', 'tool-swipe']));
    await drawFrame(page);
    const q = await page.evaluate(() => document.querySelector('#quote-card .xi-demo-note')?.textContent || '');
    console.log('sales quote', q);
    expect(q).toContain('demo:true 강제');
    await page.click('#panel .xi-panel-toggle'); await page.click('#panel [data-tab=table]');
    await page.waitForSelector('#panel .xi-export button', { timeout: 10000 });
    expect(await page.evaluate(() => [...document.querySelectorAll('#panel .xi-export button')].every((b) => b.disabled))).toBe(true);
    expect(errs).toEqual([]);
  });
  test('기관(남원시) — 프레임·실행 없음 · tenant 빌드 · 기본 실태조사 모드 · 필지 카드 v2 + 오탐 신고 시트', async ({ page }) => {
    const errs = watch(page);
    await bootApi(page, XI + AOI, { realm: 'tenant', tenant: 'namwon' });
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
    const g = await gate(page); console.log(JSON.stringify(g));
    expect(g.role).toBe('agency'); expect(g.build).toBe('tenant:namwon'); expect(g.verbs).toBe('V1 V4 V5 V6 V8');
    expect(g.shown).not.toContain('tool-rect'); expect(g.shown).not.toContain('tool-poly');
    expect(await page.evaluate(() => window.__xi.data.cat.items.filter((i) => i.role === 'result').every((i) => /namwon/.test(i.id)))).toBe(true);
    expect(await page.evaluate(() => window.XI.view().mode)).toBe('survey');   // 기관 세션 기본 = 실태조사(SURVEY-SPEC §4.1)
    // 의심 필지(덕과면 AOI 밖이어도 된다) — 카드 v2 · 오탐 신고 시트(사유 필수)
    await page.evaluate(() => window.XI.parcelCard('5219045021110530012'));
    await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
    await page.click('#pcard2 .sv-ds');
    const sh = await page.evaluate(() => ({ open: !document.querySelector('#pcard2 .sv-card-sheet').hidden, reasons: document.querySelectorAll('#pcard2 .sv-card-sheet select option').length, go: document.querySelector('#pcard2 .sv-card-sheet .sv-go')?.textContent, note: document.querySelector('#pcard2 .sv-card-sheet small')?.textContent }));
    console.log('dismiss sheet', JSON.stringify(sh));
    expect(sh.open).toBe(true); expect(sh.reasons).toBeGreaterThanOrEqual(5); expect(sh.go).toContain('오탐 처리');
    if (!API) expect(sh.note).toContain('예시 · 저장 안 됨');
    await page.click('#pcard2 .sv-card-sheet .sv-cancel');
    expect(errs).toEqual([]);
  });
});

test('URL 상태 전부 복원 — cam · on · epoch · swipe · card · panel · 3d · model · 새로고침 뒤 같음', async ({ page }) => {
  test.setTimeout(180000);
  const errs = watch(page);
  await bootApi(page, XI + AOI);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  const pnu = await page.evaluate(async () => { const X = window.__xi; const fa = await X.loadA02(); return fa.features.find((x) => x.properties.id === X.state.aoiParcels[0]).properties.pnu; });
  const url = XI + `?cam=127.35240,35.53075,16.40,40,-12&on=namwon-farmland-2025,namwon-change&epoch=2&swipe=30&card=${pnu}&panel=layers&model=aerial25/best`;
  const read = () => page.evaluate(() => { const X = window.__xi, A = X.A; return {
    cam: [+A.getCenter().lng.toFixed(4), +A.getCenter().lat.toFixed(4), +A.getZoom().toFixed(2), Math.round(A.getPitch()), Math.round(A.getBearing())],
    on: [...X.state.results].sort(), epoch: X.scrub.S.e, swipe: X.swipe.S.on ? X.swipe.S.v : null, card: document.getElementById('pcard2').hidden ? null : document.getElementById('pcard2').dataset.pnu,
    panel: X.panel.S.open ? X.panel.S.tab : null, model: X.state.model }; });
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
  const a = await read();
  console.log('restore', JSON.stringify(a));
  expect(Math.abs(a.cam[0] - 127.3524)).toBeLessThan(2e-4); expect(Math.abs(a.cam[1] - 35.53075)).toBeLessThan(2e-4); expect(a.cam.slice(2)).toEqual([16.4, 40, -12]);
  expect(a.on).toEqual(expect.arrayContaining(['namwon-change', 'namwon-farmland-2025']));
  expect(a.epoch).toBe(2); expect(a.swipe).toBe(30); expect(a.card).toBe(pnu); expect(a.panel).toBe('layers'); expect(a.model).toBe('aerial25/best');
  // 앱이 다시 쓴 URL 로 새로고침해도 같은 상태
  await page.waitForTimeout(600);
  const written = await page.evaluate(() => location.search);
  console.log('written', written);
  for (const k of ['cam=', 'on=', 'epoch=2', 'swipe=30', 'pnu=', 'panel=layers', 'model=']) expect(written).toContain(k);   // F2-A: 카드 v2 는 ?pnu= (옛 ?card= 도 읽는다)
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
  const b = await read();
  expect(b).toEqual(a);
  // 3d 복원
  await page.goto(XI + AOI + '&3d=1');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
  expect(await page.evaluate(() => window.__xi.state.extrude)).toBe(true);
  expect(errs).toEqual([]);
});
