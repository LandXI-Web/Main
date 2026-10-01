// F2-A · 성능·법전 — 실태조사 스윕 + 의심 큐 서랍 + 필지 카드 v2 동시: p95 ≤ 20 ms · 캔버스 ≥ 90 % · 유리(backdrop-filter) ≤ 15 % · 14px 미만 0 · 콘솔 0
//   종이 시트(서랍 · 카드 · 불투명 · 흐림 없음)는 유리가 아니다 — 면적은 따로 기록(결과 문서 §성능)
// 실행: npx playwright test tests/e2e/f2a-layout --reporter=line
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

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
/** 화면 면적(8px 칸 합집합) — sel(el) 이 참인 보이는 요소 */
const areaOf = (page, kind) => page.evaluate((kind) => {
  const W = innerWidth, H = innerHeight, c = 8, cols = Math.ceil(W / c), rows = Math.ceil(H / c), g = new Uint8Array(cols * rows);
  const els = [...document.querySelectorAll('body *')].filter((e) => {
    if (e.closest('[hidden]') || e.offsetParent === null && getComputedStyle(e).position !== 'fixed') return false;
    const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    const glass = (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none');
    const sheet = e.classList.contains('sv-sheet') || (e.id === 'drawer');
    if (kind === 'glass') return glass;
    if (kind === 'all') return glass || sheet;
    return sheet;
  });
  for (const e of els) { const r = e.getBoundingClientRect(); for (let y = Math.max(0, Math.floor(r.top / c)); y < Math.min(rows, Math.ceil(r.bottom / c)); y++) for (let x = Math.max(0, Math.floor(r.left / c)); x < Math.min(cols, Math.ceil(r.right / c)); x++) g[y * cols + x] = 1; }
  let n = 0; for (const v of g) n += v; return { share: +(n / g.length).toFixed(4), els: els.map((e) => e.id || e.className.split(' ')[0]).slice(0, 20) };
}, kind);

/** 카드(#pcard2) 안 모든 글자 — 스크롤 맨 위에서 · 숨김 아닌 것 · 14px 미만 목록 + 보이는 EVIDENCE-PAIR 칸 수 */
const cardSmall = () => {
  const c = document.getElementById('pcard2'); c.scrollTop = 0;
  const cr = c.getBoundingClientRect(), small = []; let pair = 0;
  const w = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; if (el.closest('[hidden]')) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.fontSize) < 14) small.push(el.tagName + ' ' + cs.fontSize + ' ' + n.textContent.trim().slice(0, 16)); }
  for (const cell of c.querySelectorAll('.sv-pair .sv-cell')) { const r = cell.getBoundingClientRect(); if (r.top >= cr.top && r.bottom <= cr.bottom) pair++; }
  return { small, pair };
};

test('스윕 + 서랍 + 카드 동시 — p95 · 캔버스 · 유리 · 종이 · 14px · 콘솔', async ({ page }) => {
  test.setTimeout(200000);
  const errs = watch(page);
  await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023');
  await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
  await page.evaluate(() => window.__xi.perf.reset());
  await page.click('#mode-sw [data-m=survey]');
  await page.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'survey-result'), null, { timeout: 60000 });
  const perfSweep = await page.evaluate(() => window.__xi.perfStats());
  await page.evaluate(() => window.__xi.perf.reset());
  await page.evaluate(() => window.XI.openDrawer('findings', { rule: 'R1', priority: 'A' }));
  await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 });
  await page.click('#fdrawer .sv-item >> nth=0');
  await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
  const card0 = await page.evaluate(cardSmall);                 // 3차 판정: 스크롤 전(대장/현황 행이 보이는 상태) 카드 안 14px 미만 0
  expect(card0.pair).toBeGreaterThan(0);
  expect(card0.small).toEqual([]);
  await page.click('#pcard2 .sv-ep input[value="2025"]');
  expect((await page.evaluate(cardSmall)).small).toEqual([]);   // 2025 현황 행(막대 · % · 동)
  await page.click('#pcard2 .sv-tlb');
  await page.waitForTimeout(2500);
  const perfCard = await page.evaluate(() => window.__xi.perfStats());
  const glass = await areaOf(page, 'glass'), sheet = await areaOf(page, 'sheet'), all = await areaOf(page, 'all');
  const rail = await page.evaluate(() => document.getElementById('fdrawer').dataset.rail);
  const law = await page.evaluate(() => {
    const small = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { const n = w.currentNode; if (!n.textContent.trim()) continue; const el = n.parentElement; if (!el || el.closest('[hidden]')) continue; const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue; const r = el.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) continue; if (parseFloat(cs.fontSize) < 14) small.push(el.tagName + '.' + el.className + ' ' + cs.fontSize + ' ' + n.textContent.trim().slice(0, 16)); }
    return { small, share: window.__xi.canvasShare(), canv: document.querySelectorAll('canvas.maplibregl-canvas').length };
  });
  const rec = { at: new Date().toISOString(), mode: API ? 'on' : 'off', perf: { sweep: perfSweep, drawer_card_timeline: perfCard }, glass, sheet, map_visible: +(1 - all.share).toFixed(4), rail, canvas: law.share, canvases: law.canv, small: law.small };
  console.log(JSON.stringify(rec));
  fs.mkdirSync('shots/f2/A/logs', { recursive: true });
  fs.writeFileSync(`shots/f2/A/logs/layout-${API ? 'on' : 'off'}.json`, JSON.stringify(rec, null, 1));
  expect(perfSweep.p95).toBeLessThanOrEqual(20);
  expect(perfCard.p95).toBeLessThanOrEqual(20);
  expect(law.share).toBeGreaterThanOrEqual(0.9);
  expect(glass.share).toBeLessThanOrEqual(0.15);
  expect(rail).toBe('1');                                  // 카드가 열리면 서랍은 레일(120)로 접힌다
  expect(sheet.share).toBeLessThanOrEqual(0.35);           // 종이 시트(서랍/레일 + 카드) 합집합 상한(2차 판정)
  expect(1 - all.share).toBeGreaterThanOrEqual(0.5);       // 지도 가시 면적 ≥ 50 %(유리 ∪ 종이 밖)
  expect(law.small).toEqual([]);
  expect(errs).toEqual([]);
});

for (const [W, H] of [[1280, 800], [1440, 900]]) {
  test(`${W}×${H} — 의심 큐 행 ≥ 6줄(필터 접기 · HUD 집중 64) · 카드 열면 레일 · 종이 ≤ 35 %`, async ({ browser }) => {
    test.setTimeout(150000);
    const ctx = await browser.newContext({ viewport: { width: W, height: H } });
    const page = await ctx.newPage();
    const errs = watch(page);
    await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023');
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    await page.evaluate(() => window.XI.setMode('survey', { animate: false }));
    await page.evaluate(() => window.XI.openDrawer('findings', { rule: 'R1', priority: 'A' }));
    await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 });
    await page.waitForTimeout(700);
    const q = await page.evaluate(() => {
      const d = document.getElementById('fdrawer'), l = d.querySelector('.sv-list').getBoundingClientRect();
      const full = [...d.querySelectorAll('.sv-item')].filter((li) => { const r = li.getBoundingClientRect(); return r.top >= l.top - 1 && r.bottom <= l.bottom + 1; }).length;
      return { full, fold: d.dataset.fold, top: Math.round(d.getBoundingClientRect().top), big: parseFloat(getComputedStyle(document.getElementById('hud-big')).fontSize) };
    });
    const sheetQ = await areaOf(page, 'sheet');
    await page.click('#fdrawer .sv-item >> nth=0');
    await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
    await page.waitForTimeout(700);
    const sheetC = await areaOf(page, 'sheet'), allC = await areaOf(page, 'all');
    const rail = await page.evaluate(() => ({ rail: document.getElementById('fdrawer').dataset.rail, w: Math.round(document.getElementById('fdrawer').getBoundingClientRect().width), rows: document.querySelectorAll('#fdrawer .sv-item').length }));
    // 레일의 ‹ 큐 → 카드 닫힘 · 서랍 복귀
    await page.click('#fdrawer .sv-unrail');
    await page.waitForTimeout(700);
    const back = await page.evaluate(() => ({ rail: document.getElementById('fdrawer').dataset.rail, card: document.getElementById('pcard2').hidden }));
    console.log(W, JSON.stringify({ q, sheetQ: sheetQ.share, sheetC: sheetC.share, map: +(1 - allC.share).toFixed(3), rail, back }));
    expect(q.full).toBeGreaterThanOrEqual(6);
    expect(q.big).toBe(64);
    expect(sheetC.share).toBeLessThanOrEqual(0.35);
    expect(rail.rail).toBe('1'); expect(rail.w).toBe(120);
    expect(back.rail).toBe('0'); expect(back.card).toBe(true);
    expect(errs).toEqual([]);
    await ctx.close();
  });
}

/* 3차 판정 ②: 필지 카드 v2 → '보고서 초안 ›' — 서랍(#drawer)은 HUD 아래 · 폭 ≤ 600 · 카드는 요약으로 서랍 왼쪽 · 카드 ∩ 서랍 = 카드 ∩ HUD = 서랍 ∩ HUD = 0 · 유리 ≤ 15 % · 지도 가시 ≥ 50 % */
for (const [W, H] of [[1280, 800], [1440, 900], [1920, 1080]]) {
  test(`${W}×${H} — 보고서 초안 서랍 + 필지 카드 v2 · 교차 0 · 유리 ≤ 15 % · 지도 가시 ≥ 50 %`, async ({ browser }) => {
    test.setTimeout(150000);
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
    const page = await ctx.newPage();
    const errs = watch(page);
    await bootApi(page, XI + '?cam=127.47,35.425,12.5,35,0&on=namwon-landcover-2023', API ? { realm: 'tenant', tenant: 'namwon' } : {});
    await page.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 90000 });
    await page.evaluate(() => window.XI.setMode('survey', { animate: false }));
    await page.evaluate(() => window.XI.openDrawer('findings', { rule: 'R1', priority: 'A' }));
    await page.waitForFunction(() => document.getElementById('fdrawer').dataset.total != null, null, { timeout: 30000 });
    await page.click('#fdrawer .sv-item >> nth=0');
    await page.waitForFunction(() => document.getElementById('pcard2').dataset.ready === '1', null, { timeout: 40000 });
    await page.waitForTimeout(500);
    expect((await page.evaluate(cardSmall)).small).toEqual([]);
    await page.click('#pcard2 .sv-rp');
    await page.waitForFunction(() => document.getElementById('drawer').dataset.kind === 'report' && !document.getElementById('drawer').hidden, null, { timeout: 15000 });
    const samples = [];
    for (let i = 0; i < 8; i++) {           // 서랍 진입(패널 인) 동안 매 150 ms — 첫 프레임부터 교차 0
      await page.waitForTimeout(150);
      samples.push(await page.evaluate(() => {
        const R = (e) => { if (!e || e.hidden) return null; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return null; const r = e.getBoundingClientRect(); return r.width ? r : null; };
        const X = (a, b) => (a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0);
        const card = R(document.getElementById('pcard2')), dr = R(document.getElementById('drawer')), hud = R(document.getElementById('hud')), big = R(document.getElementById('hud-big'));
        return { cd: X(card, dr), ch: X(card, hud), dh: X(dr, hud), cb: X(card, big), w: dr ? Math.round(dr.width) : 0, compact: document.getElementById('pcard2').dataset.compact || '' };
      }));
    }
    await page.waitForTimeout(1200);
    const glass = await areaOf(page, 'glass'), all = await areaOf(page, 'all');
    const fin = samples[samples.length - 1];
    console.log(W, JSON.stringify({ fin, glass: glass.share, map: +(1 - all.share).toFixed(3), max: samples.reduce((m, s) => Math.max(m, s.cd, s.ch, s.dh, s.cb), 0) }));
    for (const s of samples) { expect(s.cd).toBe(0); expect(s.ch).toBe(0); expect(s.dh).toBe(0); expect(s.cb).toBe(0); }
    expect(fin.w).toBeLessThanOrEqual(600);
    expect(fin.compact).toBe('1');
    expect(glass.share).toBeLessThanOrEqual(0.15);
    expect(1 - all.share).toBeGreaterThanOrEqual(0.5);
    // 서랍을 닫으면 카드 원복(요약 해제) · 의심 큐 레일 복귀
    await page.click('#drawer .xi-x');
    await page.waitForFunction(() => document.getElementById('drawer').hidden, null, { timeout: 5000 });
    await page.waitForTimeout(300);
    const back = await page.evaluate(() => ({ compact: document.getElementById('pcard2').dataset.compact || '', rail: getComputedStyle(document.getElementById('fdrawer')).display }));
    expect(back.compact).toBe(''); expect(back.rail).not.toBe('none');
    expect(errs).toEqual([]);
    await ctx.close();
  });
}
