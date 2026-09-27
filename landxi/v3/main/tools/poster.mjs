/* 히어로 첫 그림(순백 지구 스틸) 사전 렌더 — node landxi/v3/main/tools/poster.mjs
   실제 지도 무대(K3)가 한반도 정면 지구를 다 그린 뒤 창 영역만 잘라 data/globe-hero(-m).png 로 남긴다(webp 변환은 PIL). */
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:4173';
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
for (const [name, vp, dpr] of [['globe-hero-m', { width: 390, height: 844 }, 2], ['globe-hero', { width: 1440, height: 900 }, 1]]) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  await page.goto(BASE + '/landxi/v3/main/?dev=1', { waitUntil: 'domcontentloaded' });
  await page.addStyleTag({ content: '.m-ch,.m-mast,#poster{visibility:hidden!important;opacity:0!important}' });
  await page.waitForFunction(() => window.__lxm && window.__lxm.live, null, { timeout: 30000 });
  await page.waitForTimeout(vp.width < 900 ? 2500 : 6000);   // 데스크톱은 자전이 끝나 정면에 선 뒤
  await page.evaluate(() => new Promise((r) => { const m = window.__lxm.map; m.once('idle', r); m.triggerRepaint(); setTimeout(r, 4000); }));
  const w = await page.evaluate(() => window.__lxm.win);
  await page.screenshot({ path: `data/${name}.png`, clip: { x: w.x, y: w.y, width: w.w, height: w.h } });
  console.log(name, JSON.stringify(w));
  await ctx.close();
}
await browser.close();
