// 레퍼런스 재캡처(1차 판정: Esri Wayback 크래시 화면 제출 → 실제 비교 뷰로 교체) — node shots/f1/D/_tools/refs2.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', headless: false, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist', '--window-position=-2400,0'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
const p = await ctx.newPage();
const refs = [
  ['compare-swipe-worldview', 'https://worldview.earthdata.nasa.gov/?v=72.4,41.6,77.4,44.2&l=VIIRS_NOAA20_CorrectedReflectance_TrueColor,Coastlines_15m&l1=MODIS_Terra_CorrectedReflectance_TrueColor,Coastlines_15m&ca=true&cm=swipe&cv=50&t=2025-07-15-T06%3A00%3A00Z&t1=2017-07-15-T06%3A00%3A00Z', 20000],
  ['compare-swipe-esri-wayback', 'https://livingatlas.arcgis.com/wayback/#mapCenter=74.53375%2C42.87381%2C14&mode=swipe', 25000],
];
for (const [n, u, w] of refs) {
  try {
    await p.goto(u, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(4000);
    for (const sel of ['button:has-text("Accept")', 'button:has-text("Accept all")', 'button:has-text("I agree")', 'button:has-text("Got it")', '#onetrust-accept-btn-handler', '.tour-skip, button:has-text("Skip")', 'button[aria-label="Close"]', 'button:has-text("Close")']) {
      const l = p.locator(sel).first(); if (await l.isVisible().catch(() => false)) { await l.click().catch(() => {}); await p.waitForTimeout(600); }
    }
    await p.keyboard.press('Escape').catch(() => {});
    await p.waitForTimeout(w);
    const txt = (await p.locator('body').innerText().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    await p.screenshot({ path: `shots/f1/D/ref/${n}.png` }); console.log('ok', n, p.url().slice(0, 120), '|', txt);
  } catch (e) { console.log('fail', n, e.message.slice(0, 160)); }
}
await b.close();
