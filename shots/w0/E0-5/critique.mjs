// 비평자(Fable) 재확인 — 지도 영역. 읽기 전용. node shots/w0/E0-5/critique.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const R = {};
const log = (k, v) => { R[k] = v; console.log('·', k, typeof v === 'string' ? v : JSON.stringify(v).slice(0, 400)); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

async function ctx(role = 'staff', vp = { width: 1440, height: 900 }) {
  const c = await browser.newContext({ viewport: vp });
  await c.addInitScript((r) => { try { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); } catch {} }, role);
  return c;
}
const ready = (p) => p.waitForFunction(() => window.__lxMap?.A?.loaded?.(), null, { timeout: 30000 }).catch(() => false);
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
const share = (p) => p.evaluate(() => {
  const c = document.querySelector('#map-a canvas') || document.querySelector('.maplibregl-canvas');
  const r = c.getBoundingClientRect();
  const w = innerWidth - 72; // 레일 제외
  return { canvasW: Math.round(r.width), canvasH: Math.round(r.height), pctOfContent: Math.round((r.width * r.height) / (w * (innerHeight - 64 - 36)) * 100), pctW: Math.round(r.width / w * 100) };
});

// 1. 지도 몫 — 1440×900 네 상태
{
  const c = await ctx('staff'); const p = await c.newPage();
  await p.goto(BASE + 'ximap.html'); await ready(p); await wait(1500);
  log('share.initial', await share(p));
  const m = await p.evaluate(() => { const A = window.__lxMap.A; return { terrain: !!A.getTerrain(), maxPitch: A.getMaxPitch(), dragRotate: A.dragRotate.isEnabled(), pitch: A.getPitch() }; });
  log('gl.camera', m);
  await p.click('input[data-layer="namwon-farmland-2025"], .mg input[type=checkbox]', { timeout: 5000 }).catch(async () => { await p.locator('.mg input[type=checkbox]').first().click(); });
  await wait(2500);
  log('share.layerOn', await share(p));
  // 결과 폴리곤이 들어오는 순간에 애니메이션이 있는가 — 레이어 paint 전이 값
  const fadeInfo = await p.evaluate(() => { const A = window.__lxMap.A; const keys = [...A.__keys]; const k = keys[0]; const l = k && A.getLayer(k + '-fill'); return { keys, fillOpacityTransition: k ? A.getPaintProperty(k + '-fill', 'fill-opacity-transition') || null : null, styleTransition: A.getStyle().transition || null }; });
  log('gl.resultTransition', fadeInfo);
  // 하단 표 펼치기 → 행 클릭 → 정보 판
  const fold = p.locator('#fold, [data-fold], button:has-text("펼치기")').first();
  if (await fold.count()) { await fold.click().catch(() => {}); await wait(800); }
  const rows = await p.evaluate(() => { const tb = document.querySelector('.mw-b table tbody, #bottom table tbody, table.tbl tbody'); if (!tb) return null; const vis = [...tb.querySelectorAll('tr')].filter((tr) => { const r = tr.getBoundingClientRect(); return r.bottom <= innerHeight - 36 && r.top >= 0 && r.height > 0; }); return { total: tb.querySelectorAll('tr').length, visible: vis.length }; });
  log('table.rowsVisible.1440', rows);
  log('share.tableOpen', await share(p));
  const row = p.locator('table.tbl tbody tr').first();
  if (await row.count()) { await row.click(); await wait(1500); }
  log('share.infoSide', await share(p));
  const overlap = await p.evaluate(() => { const els = [...document.querySelectorAll('.mw-b button, .mw-b .tab, .mw-b [role=tab]')].filter((e) => e.getBoundingClientRect().width > 0); const narrow = els.filter((e) => { const r = e.getBoundingClientRect(); return r.width < 40 && e.textContent.trim().length >= 3; }); return { tabs: els.length, verticalStack: narrow.length, sample: narrow.slice(0, 4).map((e) => e.textContent.trim()) }; });
  log('bottom.tabsCollapsedVertically', overlap);
  await shot(p, 'crit-01-info-side-1440');
  // 시점 클릭 — 전환 장치 확인
  const ep = p.locator('[data-epoch]').nth(2);
  if (await ep.count()) {
    const t0 = Date.now(); await ep.click(); await wait(200);
    const st = await p.evaluate(() => { const A = window.__lxMap.A; return { epoch: A.__epoch, fade: A.getLayer('epoch') ? A.getPaintProperty('epoch', 'raster-fade-duration') : null, hasSlider: !!document.querySelector('input[type=range][data-epoch], .mw-epoch input[type=range], #epoch-range') }; });
    log('epoch.switch', { ...st, ms: Date.now() - t0 });
  }
  // 겹쳐보기 → 지도 몫
  await p.goto(BASE + 'ximap.html?mode=overlay'); await ready(p); await wait(2500);
  log('share.overlay', await share(p));
  const dead = await p.evaluate(() => { const b = [...document.querySelectorAll('#ov-a .mw-tools button, #ov-b .mw-tools button')]; return { count: b.length, withHandler: b.filter((x) => x.dataset.tool).length }; });
  log('overlay.toolButtons', dead);
  const swipeB = await p.evaluate(() => { const b = document.querySelector('#map-b canvas'); const r = b?.getBoundingClientRect(); return r ? { w: Math.round(r.width), h: Math.round(r.height) } : null; });
  log('overlay.canvasB', swipeB);
  await shot(p, 'crit-02-overlay-1440');
  await c.close();
}

// 2. ?on= 딥링크 도착 — 결과가 켜진 채로 도착하는가, 카메라는 결과로 가는가
{
  const c = await ctx('staff'); const p = await c.newPage();
  await p.goto(BASE + 'ximap.html?on=namwon-farmland-2025'); await ready(p); await wait(3000);
  const st = await p.evaluate(() => { const A = window.__lxMap.A; return { on: window.__lxMap.state.on, keys: [...A.__keys], zoom: +A.getZoom().toFixed(1), center: A.getCenter().toArray().map((x) => +x.toFixed(3)), checked: !!document.querySelector('input[data-layer="namwon-farmland-2025"]:checked, .mg input:checked') }; });
  log('deeplink.on', st);
  await shot(p, 'crit-03-deeplink-on');
  await c.close();
}

// 3. 영업용 계정 — 직원 화면과 무엇이 다른가
{
  const c = await ctx('sales'); const p = await c.newPage();
  await p.goto(BASE + 'ximap.html'); await ready(p); await wait(1500);
  const d = await p.evaluate(() => ({ url: location.pathname.split('/').pop() + location.search, on: window.__lxMap.state.on, exportBtn: !!document.querySelector('#export, button:has(> span), [data-act]') , textHasExport: /내보내기/.test(document.body.innerText), textHasAct: /조치 상태/.test(document.body.innerText), railItems: document.querySelectorAll('.rail a, nav a').length, roleShown: /영업|LX 직원|LX 관리자/.test(document.body.innerText) }));
  log('sales.ximap', d);
  // 첫 화면에 결과가 켜져 있나
  await shot(p, 'crit-04-sales-first');
  await c.close();
}

// 4. 표류 예측 — 지도 스타일 출처 · 한국어 라벨 옵션
{
  const c = await ctx('staff'); const p = await c.newPage();
  const reqs = [];
  p.on('request', (r) => { const u = r.url(); if (/openfreemap|positron|tiles\./.test(u)) reqs.push(u.slice(0, 90)); });
  await p.goto(BASE + 'map-drift.html'); await wait(6000);
  log('drift.externalStyle', [...new Set(reqs.map((u) => new URL(u).host))]);
  await c.close();
}

fs.writeFileSync(path.join(OUT, 'critique.json'), JSON.stringify(R, null, 2));
await browser.close();
console.log('done');
