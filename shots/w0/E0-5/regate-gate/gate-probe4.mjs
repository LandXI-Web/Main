// 재판정 게이트 4 — E0-5 재수정 독립 검증. 좌 판 폭 전이 뒤 범례 × 시점 스트립 · 범례 × 상단 70px(내보내기) 교차,
// 표시 상태(display), 주소 left, 캔버스 비율. 경로: a) 정보 판 열린 채 #l-open  b) #side-x 복귀  c) 표 접기
// d) 겹쳐보기 좌 판 펴진 채 `변화 결과 보기 ›`  e) 그 상태에서 #l-open  f) 기본 모드 서랍(통계) 열린 채 #l-open
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const BASE = 'http://localhost:4173/landxi/proto/'; const OUT = fileURLToPath(new URL('./', import.meta.url));
const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome' }); const log = {};
const X = (a, c) => Math.max(0, Math.min(a.right, c.right) - Math.max(a.left, c.left)) * Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
const ov = (p) => p.evaluate((Xs) => {
  const X = new Function('a', 'c', 'return ' + Xs);
  const q = (s) => document.querySelector(s);
  const legend = q('#legend'), strip = q('#strip'), scale = q('#scale'), plates = q('#plates'), exp = q('#export'), mwl = q('#mw-l'), mw = q('#mw');
  const pr = plates.getBoundingClientRect();
  const vis = (e) => !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0;
  const top70 = { left: pr.left, right: pr.right, top: pr.top, bottom: pr.top + 70 };
  const L = legend?.getBoundingClientRect(), S = strip?.getBoundingClientRect(), C = scale?.getBoundingClientRect();
  return {
    left: mw.dataset.left, side: mw.dataset.side || '', urlLeft: new URL(location.href).searchParams.get('left'), fold: new URL(location.href).searchParams.get('fold'),
    mwlW: Math.round(mwl.getBoundingClientRect().width), plates: `${plates.clientWidth}x${plates.clientHeight}`, narrow: mw.hasAttribute('data-narrow'),
    legendVis: vis(legend), stripVis: vis(strip), scaleVis: vis(scale),
    legendBottom: legend && getComputedStyle(legend).bottom, stripBottom: strip && getComputedStyle(strip).bottom,
    xLS: vis(legend) && vis(strip) ? Math.round(X(L, S)) : 0, xLTop70: vis(legend) ? Math.round(X(L, top70)) : 0,
    xLExport: vis(legend) && exp ? Math.round(X(L, exp.getBoundingClientRect())) : 0, xSC: vis(strip) && vis(scale) ? Math.round(X(S, C)) : 0,
    xLC: vis(legend) && vis(scale) ? Math.round(X(L, C)) : 0,
    canvasRatio: +(q('#map-a').getBoundingClientRect().width / (mw.getBoundingClientRect().width)).toFixed(3),
  };
}, X.toString().replace(/^\(a, c\) => /, ''));
const first = (p) => p.locator('#tbody tr[data-row]').first().click();
const ready = (p) => p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error' && !/Failed to load|net::|status of 4|WebGL/i.test(m.text())) errs.push(m.text()); });
  await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  // a) 정보 판 열린 채 #l-open — 전이 도중(30 · 120ms) 과 뒤(700ms)
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await p.waitForFunction(() => document.documentElement.dataset.shell === 'ready'); await ready(p);
  await first(p); await p.waitForTimeout(600); log[`${w} a0 info-open`] = await ov(p);
  await p.locator('#l-open').click();
  await p.waitForTimeout(30); log[`${w} a @30`] = await ov(p);
  await p.waitForTimeout(90); log[`${w} a @120`] = await ov(p);
  await p.waitForTimeout(600); log[`${w} a @720`] = await ov(p);
  await p.screenshot({ path: OUT + `p4-a-lopen-${w}.png` });
  // b) 정보 판 → #side-x 복귀(표 펼침)
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await ready(p);
  await first(p); await p.waitForTimeout(600);
  await p.locator('#side-x').click(); await p.waitForTimeout(700); log[`${w} b side-x @700`] = await ov(p);
  await p.screenshot({ path: OUT + `p4-b-sidex-${w}.png` });
  // b2) 새로 고침 — 주소가 좌 판 상태를 그대로 싣는가
  await p.reload(); await ready(p); await p.waitForTimeout(500); log[`${w} b2 reload`] = await ov(p);
  // c) 표 접기
  await p.locator('#mb-fold').click(); await p.waitForTimeout(500); log[`${w} c fold`] = await ov(p);
  await p.screenshot({ path: OUT + `p4-c-fold-${w}.png` });
  // c2) 다시 펼치기 — 표 판 높이 뒤 배치(renderAll 끝 positionOverlays)
  await p.locator('#mb-open').click(); await p.waitForTimeout(500); log[`${w} c2 unfold`] = await ov(p);
  // f) 기본 모드 통계 서랍 열린 채 #l-open
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=1&side=stats`); await ready(p); await p.waitForTimeout(500); log[`${w} f0 stats-drawer`] = await ov(p);
  await p.locator('#l-open').click(); await p.waitForTimeout(700); log[`${w} f l-open`] = await ov(p);
  await p.screenshot({ path: OUT + `p4-f-stats-lopen-${w}.png` });
  // d) 겹쳐보기 — 좌 판 펴진 채 `변화 결과 보기 ›` → e) #l-open
  await p.goto(BASE + `ximap.html?on=${FARM}&mode=overlay`); await p.waitForFunction(() => window.__lxMap?.B?.getStyle() != null, null, { timeout: 20000 }); await p.waitForTimeout(500);
  const cmp = (p) => p.evaluate(() => { const mw = document.querySelector('#mw'), a = document.querySelector('#map-a'); return { left: mw.dataset.left, side: mw.dataset.side || '', mwlW: Math.round(document.querySelector('#mw-l').getBoundingClientRect().width), aRatio: +(a.getBoundingClientRect().width / mw.getBoundingClientRect().width).toFixed(3), legendCount: document.querySelectorAll('#ov-a .mw-legend, #ov-b .mw-legend').length, urlLeft: new URL(location.href).searchParams.get('left') }; });
  log[`${w} d0 overlay`] = await cmp(p);
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(700); log[`${w} d cmp-open`] = await cmp(p);
  await p.screenshot({ path: OUT + `p4-d-cmp-open-${w}.png` });
  await p.locator('#l-open').click(); await p.waitForTimeout(700); log[`${w} e l-open`] = await cmp(p);
  await p.screenshot({ path: OUT + `p4-e-cmp-lopen-${w}.png` });
  // e2) 비교 판을 다시 열고 `닫기` → 좌 판은 접힌 채(보고서 §1 문구 확인)
  await p.locator('[data-cmp-open]').click(); await p.waitForTimeout(500);
  await p.locator('#side-x').click(); await p.waitForTimeout(700); log[`${w} e2 cmp side-x`] = await cmp(p);
  log[`${w} errs`] = errs;
  await ctx.close();
}
await b.close(); console.log(JSON.stringify(log, null, 1));
