// 레퍼런스 나란히 — node shots/f1/D/_tools/refs.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
const refs = [
  //
  //
  ['compare-swipe-esri-wayback', 'https://livingatlas.arcgis.com/wayback/#mode=swipe&ext=74.45,42.80,74.62,42.90'],
];
for (const [n, u] of refs) {
  try { await p.goto(u, { timeout: 45000, waitUntil: 'domcontentloaded' }); await p.waitForTimeout(12000); await p.screenshot({ path: `shots/f1/D/ref/${n}.png` }); console.log('ok', n, p.url()); }
  catch (e) { console.log('fail', n, e.message.slice(0, 120)); }
}
await b.close();
