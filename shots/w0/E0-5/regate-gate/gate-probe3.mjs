// 원인 확인 — 좌 판 폭 전이(180ms) 뒤 positionOverlays 미호출. resize 이벤트를 한 번 쏘면 겹침이 사라지는지
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
const BASE = 'http://localhost:4173/landxi/proto/'; const OUT = fileURLToPath(new URL('./', import.meta.url));
const FARM = 'namwon-farmland-2025';
const b = await chromium.launch({ channel: 'chrome' }); const log = {};
const ov = (p) => p.evaluate(() => { const a = document.querySelector('#legend').getBoundingClientRect(), s = document.querySelector('#strip').getBoundingClientRect(); return { legendBottom: getComputedStyle(document.querySelector('#legend')).bottom, stripBottom: getComputedStyle(document.querySelector('#strip')).bottom, platesW: document.querySelector('#plates').clientWidth, overlap: Math.round(Math.max(0, Math.min(a.right, s.right) - Math.max(a.left, s.left)) * Math.max(0, Math.min(a.bottom, s.bottom) - Math.max(a.top, s.top))) }; });
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h } }); const p = await ctx.newPage();
  await p.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx-map-props'); });
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
  await p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  await p.locator('#l-open').click();
  await p.waitForTimeout(30); log[`${w} @30ms`] = await ov(p);
  await p.waitForTimeout(700); log[`${w} @730ms`] = await ov(p);
  await p.evaluate(() => dispatchEvent(new Event('resize'))); await p.waitForTimeout(100);
  log[`${w} after resize evt`] = await ov(p);
  await p.screenshot({ path: OUT + `p3-after-resize-${w}.png` });
  // side-x 복귀 경로도 같은 원인?
  await p.goto(BASE + `ximap.html?on=${FARM}&fold=0`); await p.waitForFunction(() => window.__lxMap?.A?.getSource?.('namwon-farmland-2025') != null, null, { timeout: 20000 });
  await p.locator('#tbody tr[data-row]').first().click(); await p.waitForTimeout(600);
  await p.locator('#side-x').click(); await p.waitForTimeout(700); log[`${w} side-x restore @700`] = await ov(p);
  await p.evaluate(() => dispatchEvent(new Event('resize'))); await p.waitForTimeout(100); log[`${w} side-x after resize evt`] = await ov(p);
  await ctx.close();
}
await b.close(); console.log(JSON.stringify(log, null, 1));
