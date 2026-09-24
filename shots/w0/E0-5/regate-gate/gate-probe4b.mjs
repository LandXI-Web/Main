// 보충 — 겹쳐보기에서 좌 판을 펴 둔(#ch-base) 뒤 `변화 결과 보기 ›` · 다시 #l-open · 전이 도중 연타(전이 취소) 뒤 배치
import { chromium } from 'playwright';
const BASE = 'http://localhost:4173/landxi/proto/'; const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome' }); const log = {};
const st = (p) => p.evaluate(() => { const q = (s) => document.querySelector(s); const mw = q('#mw'), a = q('#map-a'), l = q('#legend'), s = q('#strip');
  const X = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
  const vis = (e) => !!e && getComputedStyle(e).display !== 'none';
  return { left: mw.dataset.left, side: mw.dataset.side || '', mwlW: Math.round(q('#mw-l').getBoundingClientRect().width), aRatio: +(a.getBoundingClientRect().width / mw.getBoundingClientRect().width).toFixed(3),
    xLS: l && s && vis(l) && vis(s) ? Math.round(X(l.getBoundingClientRect(), s.getBoundingClientRect())) : null, legendVis: vis(l), stripVis: vis(s), canvasW: a.querySelector('canvas')?.width }; });
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await p.goto(BASE + `ximap.html?on=${FARM}&mode=overlay`); await p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 }); await p.waitForTimeout(500);
  await p.locator('#ch-base').click(); await p.waitForTimeout(600); log[`${w} ch-base`] = await st(p);
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(600); log[`${w} cmp-open(left was on)`] = await st(p);
  await p.locator('#l-open').click(); await p.waitForTimeout(600); log[`${w} l-open`] = await st(p);
  // 기본 모드 — 전이 도중 연타: 정보 판 → #l-open → 60ms 뒤 행 클릭(정보 판 다시) → 최종 배치
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  await p.locator('#l-open').click(); await p.waitForTimeout(60);
  await p.locator('#mb-open').click(); await p.waitForTimeout(60); await p.locator('#tbody tr[data-row]').nth(1).click(); await p.waitForTimeout(800);
  log[`${w} interrupt→info`] = await st(p);
  // 캔버스 크기가 판 크기와 맞는가(A.resize 가 전이 뒤에 불렸는가)
  log[`${w} canvas vs plate`] = await p.evaluate(() => { const a = document.querySelector('#map-a'); const c = a.querySelector('canvas'); return { plateW: Math.round(a.getBoundingClientRect().width), canvasCssW: Math.round(c.getBoundingClientRect().width) }; });
  await p.locator('#side-x').click(); await p.waitForTimeout(800); log[`${w} side-x after interrupt`] = await st(p);
  log[`${w} canvas vs plate 2`] = await p.evaluate(() => { const a = document.querySelector('#map-a'); const c = a.querySelector('canvas'); return { plateW: Math.round(a.getBoundingClientRect().width), canvasCssW: Math.round(c.getBoundingClientRect().width) }; });
  log[`${w} errs`] = errs; await ctx.close();
}
await b.close(); for (const k of Object.keys(log)) console.log(k.padEnd(30), JSON.stringify(log[k]));
