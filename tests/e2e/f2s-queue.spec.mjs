// F2-A · 의심 큐 서랍 Q-1 — 상태 칩 5 · 규칙 6 · 등급 3 · 읍면동 39 · 정렬 3 · 검색 · 삼각 호버(행↔도형↔막대) · 서버 페이저 · CSV(BOM · 성명 열 0) · 빈 상태 정직
// 실행: npx playwright test tests/e2e/f2s-queue --reporter=line
import { test, expect } from '@playwright/test';

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
const Q = '?cam=127.47,35.425,11.4,25,0&mode=survey&queue=1';
const total = (page) => page.evaluate(() => +document.getElementById('fdrawer').dataset.total);
const settle = (page) => page.waitForFunction(() => !document.getElementById('fdrawer').hidden && document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 }).then(() => page.waitForTimeout(250));

test('필터 · 정렬 · 검색 · 페이저 · 빈 상태 — 숫자는 README 표 그대로', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + Q);
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await settle(page);
  expect(await total(page)).toBe(20872);
  const chips = await page.evaluate(() => [...document.querySelectorAll('#fdrawer .sv-states [data-st]')].map((b) => b.dataset.st));
  expect(chips).toEqual(['open', 'assigned', 'inspected', 'closed', 'dismissed']);
  const byRule = { R1: 4140, R2: 15651, R3: 20, R4: 33, R5: 464, R6: 564 };
  for (const [r, n] of Object.entries(byRule)) { await page.click(`#fdrawer [data-rule=${r}]`); await settle(page); expect(await total(page), r).toBe(n); await page.click(`#fdrawer [data-rule=${r}]`); }
  await settle(page);
  for (const [p, n] of Object.entries({ A: 1053, B: 7386, C: 12433 })) { await page.click(`#fdrawer [data-prio=${p}]`); await settle(page); expect(await total(page), p).toBe(n); await page.click(`#fdrawer [data-prio=${p}]`); }
  await page.click('#fdrawer [data-rule=R1]'); await page.click('#fdrawer [data-prio=A]'); await settle(page);
  expect(await total(page)).toBe(759);
  // 읍면동 39(아영면) — 막대 39개 · 선택
  expect(await page.evaluate(() => document.querySelectorAll('#fdrawer .sv-hist i').length)).toBe(39);
  expect(await page.evaluate(() => document.querySelectorAll('#fdrawer .sv-emd option').length)).toBe(40);
  await page.selectOption('#fdrawer .sv-emd', '52190450'); await settle(page);
  const ay = await total(page);
  const rows = await page.evaluate(() => [...document.querySelectorAll('#fdrawer .sv-item')].map((li) => ({ cd: li.dataset.cd, txt: li.querySelector('.sv-a').textContent })));
  expect(ay).toBeGreaterThan(0); expect(rows.every((r) => r.cd === '52190450')).toBe(true); expect(rows[0].txt).toContain('아곡리 1053-12');
  // 정렬: 근거면적 내림차순
  await page.selectOption('#fdrawer .sv-emd', ''); await page.selectOption('#fdrawer .sv-sort', 'evid_m2'); await settle(page);
  const ev = await page.evaluate(() => window.__xi.svy.drawer.S.items.map((f) => f.evid_m2));
  expect(ev.every((v, i) => i === 0 || ev[i - 1] >= v)).toBe(true);
  // 검색(지번)
  await page.fill('#fdrawer .sv-q', '아곡리 1053-12'); await page.waitForTimeout(500); await settle(page);
  expect(await total(page)).toBe(1);
  await page.fill('#fdrawer .sv-q', 'zzzz 없음'); await page.waitForTimeout(500); await settle(page);
  expect(await total(page)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('#fdrawer .sv-empty')?.textContent || '')).toMatch(/의심 0 · 대조 완료/);
  await page.fill('#fdrawer .sv-q', ''); await page.waitForTimeout(500); await settle(page);
  // 페이저(offset 50)
  await page.click('#fdrawer .sv-pager [data-p="1"]'); await settle(page);
  expect(await page.evaluate(() => document.querySelector('#fdrawer .sv-pg').textContent)).toMatch(/^51–100 \//);
  expect(await page.evaluate(() => window.__xi.svy.drawer.S.q.offset)).toBe(50);
  expect(errs).toEqual([]);
});

test('삼각 호버 — 행 → 지도 필지 강조 + 막대 · 막대 → 읍면동 외곽선 + 행 · 지도 의심 필지 → 행', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + Q + '&rule=R1&priority=A');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await settle(page);
  await page.hover('#fdrawer .sv-item >> nth=0');
  const a = await page.evaluate(() => { const li = document.querySelector('#fdrawer .sv-item'); return { pnu: li.dataset.pnu, rowHover: li.classList.contains('is-hover'), bar: document.querySelector(`#fdrawer .sv-hist i[data-cd="${li.dataset.cd}"]`).classList.contains('is-hover'), filt: JSON.stringify(window.__xi.A.getFilter('sv-hl-line')) }; });
  console.log('row', JSON.stringify(a));
  expect(a.rowHover).toBe(true); expect(a.bar).toBe(true); expect(a.filt).toContain(a.pnu);
  const cd = await page.evaluate(() => document.querySelector('#fdrawer .sv-item').dataset.cd);
  await page.hover(`#fdrawer .sv-hist i[data-cd="${cd}"]`);
  const b = await page.evaluate((cd) => { const X = window.__xi, id = X.svy.layers.S.idOf.get(cd); return { hl: X.A.getFeatureState({ source: 'sv-emd', id }).hl, rows: [...document.querySelectorAll('#fdrawer .sv-item.is-hover')].every((li) => li.dataset.cd === cd), n: document.querySelectorAll('#fdrawer .sv-item.is-hover').length }; }, cd);
  expect(b.hl).toBe(true); expect(b.rows).toBe(true); expect(b.n).toBeGreaterThan(0);
  // 지도 → 행: 의심 필지 호버를 흉내(층 이벤트 경로와 같은 함수)
  await page.evaluate((p) => window.__xi.svy.drawer.markPnu(p), a.pnu);
  expect(await page.evaluate((p) => document.querySelector(`#fdrawer .sv-item[data-pnu="${p}"]`).classList.contains('is-hover'), a.pnu)).toBe(true);
  expect(errs).toEqual([]);
});

test('CSV — UTF-8 BOM · 고정 문구 · 성명·소유자 열 없음 · 행 수 = 필터 건수', async ({ page }) => {
  test.setTimeout(150000);
  const errs = watch(page);
  await bootApi(page, XI + Q + '&rule=R4');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await settle(page);
  expect(await total(page)).toBe(33);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#fdrawer .sv-csv')]);
  const buf = await (await dl.createReadStream()).toArray().then((c) => Buffer.concat(c));
  const text = buf.toString('utf8');
  const lines = text.replace(/^﻿/, '').split(/\r\n/);
  console.log(dl.suggestedFilename(), buf.slice(0, 3), lines[1]);
  expect([...buf.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(lines[0]).toContain('AI 추론 · 결과 확인 전'); expect(lines[0]).toContain('위법 판정 아님');
  expect(lines[1]).toContain('PNU'); expect(lines[1]).not.toMatch(/성명|소유자|OWNER/);
  expect(lines.length - 2).toBe(33);
  expect(errs).toEqual([]);
});
