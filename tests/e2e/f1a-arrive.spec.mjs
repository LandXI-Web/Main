// F1-A 도착 spec — 남원 전역: P3 25cm 위 P4 129,420 이 스윕 뒤에만 현상 · 락온 3곳 380 · 124px 숫자 40ms/글자 · off 4.5s / on 6s 안 arrived · 봉투 'AI 추론 · 검수 전'
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

/** 두 스크린샷(B 켬/끔)의 차이 화소 수 — B(결과 전용 캔버스)가 실제로 그린 자리만 달라진다 */
async function diffCount(page, a, b, rects) {
  return page.evaluate(async ([a64, b64, rects]) => {
    const load = async (s) => { const bm = await createImageBitmap(await (await fetch('data:image/png;base64,' + s)).blob()); const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0); return g; };
    const A = await load(a64), B = await load(b64);
    return rects.map(([x0, y0, x1, y1]) => {
      const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0), d1 = A.getImageData(x0, y0, w, h).data, d2 = B.getImageData(x0, y0, w, h).data; let n = 0;
      for (let i = 0; i < d1.length; i += 4) if (Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]) > 24) n++;
      return n;
    });
  }, [a.toString('base64'), b.toString('base64'), rects]);
}

test('남원 전역 도착 — 스윕 뒤에만 현상 · 락온 380 · 124px 40ms · 시간 · 봉투', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await page.addInitScript(() => { window.__xiSweepHold = 0.5; });
  await bootApi(page, XI);
  await page.waitForFunction(() => document.documentElement.dataset.sweepHeld === '1', null, { timeout: 60000 });
  await page.waitForTimeout(250);
  const on = await page.screenshot();
  await page.evaluate(() => { document.getElementById('map-b').style.visibility = 'hidden'; });
  await page.waitForTimeout(120);
  const off = await page.screenshot();
  await page.evaluate(() => { document.getElementById('map-b').style.visibility = ''; });
  const line = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('map-b')).getPropertyValue('--sx')));
  // 지도 한가운데 띠(패널·HUD·스크러버를 피한) — 선 왼쪽 전부 · 오른쪽 전부(선과 꼬리 ±40px 제외)
  const y0 = 440, y1 = 780, L = [90, y0, Math.round(line - 40), y1], R = [Math.round(line + 40), y0, 1420, y1];
  const [nl, nr] = await diffCount(page, on, off, [L, R]);
  console.log(`스윕 정지 x=${line.toFixed(0)} · B 가 그린 화소 왼쪽 ${nl} · 오른쪽 ${nr}`);
  expect(nl).toBeGreaterThan(2000);
  expect(nr).toBe(0);
  await page.evaluate(() => { window.__xiSweepHold = null; });
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 30000 });
  const r = await page.evaluate(() => {
    const P = window.__xi.PHASES, t = (p) => P.find((x) => x.p === p)?.t;
    const big = document.getElementById('hud-big'), ds = [...big.querySelectorAll('.cw-digit')];
    const locks = [...document.querySelectorAll('#locks .cw-lock')];
    return {
      order: P.map((x) => x.p).filter((p) => ['frame', 'sweep', 'lock', 'count', 'arrived'].includes(p)),
      frameToArrived: t('arrived') - t('frame'), text: big.textContent, fs: getComputedStyle(big).fontSize,
      delays: ds.map((s) => s.style.animationDelay), digitDur: ds.map((s) => getComputedStyle(s).animationDuration)[0],
      locks: locks.map((l) => ({ dt: +l.dataset.lockEnd - +l.dataset.lockAt, at: +l.dataset.lockAt })),
      lockAnim: getComputedStyle(locks[0]).animationDuration + ' | ' + getComputedStyle(locks[0]).animationDelay,
      prov: document.getElementById('hud-prov').textContent, note: document.getElementById('hud-note').textContent, unit: document.getElementById('hud-unit').textContent,
      chip: document.getElementById('hud-chip').dataset.src,
    };
  });
  console.log(JSON.stringify(r));
  expect(r.order).toEqual(['frame', 'sweep', 'lock', 'count', 'arrived']);
  // 시간은 아래 '도착 시간' 테스트(정지점 없이)가 잰다
  expect(r.text).toBe('129,420');
  expect(r.fs).toBe('124px');
  expect(r.delays).toEqual(['0ms', '40ms', '80ms', '120ms', '160ms', '200ms', '240ms']);
  expect(r.digitDur).toBe('0.04s');
  expect(r.locks.length).toBe(3);
  for (const l of r.locks) expect(Math.abs(l.dt - 380)).toBeLessThanOrEqual(40);
  expect(r.lockAnim).toContain('0.18s, 0.08s, 0.12s');
  expect(r.locks[1].at - r.locks[0].at).toBeGreaterThanOrEqual(100);
  expect(r.prov).toContain('AI 추론 · 검수 전');
  expect(r.note).toContain('건물 49,800');
  expect(r.note).toContain('비닐하우스 728');
  expect(r.chip).toBe('ap25-namwon-2023');
  expect(errs).toEqual([]);
});

test('도착 시간(정지점 없이) — off 4.5s / on 6s', async ({ page }) => {
  test.setTimeout(120000);
  const errs = watch(page);
  await bootApi(page, XI);
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 60000 });
  const ms = await page.evaluate(() => { const P = window.__xi.PHASES, t = (p) => P.find((x) => x.p === p)?.t; return { all: t('arrived') - t('frame'), sweepToArrived: t('arrived') - t('sweep') }; });
  console.log('frame→arrived', ms.all, 'ms · sweep→arrived', ms.sweepToArrived, 'ms');
  expect(ms.all).toBeLessThan(API ? 6000 : 4500);
  expect(errs).toEqual([]);
});
