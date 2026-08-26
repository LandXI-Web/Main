// 데이터 관리 B5 — 6장. 각 탭 · 드로어 · 판 위 레이어. 콘솔 오류를 같이 찍는다.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = 'http://localhost:4173/landxi/proto/dataset.html';
const out = 'shots/proto-ds';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|vworld|xdworld/i.test(m.text())) errs.push('console: ' + m.text()); });
await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
const ready = () => page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
const idle = () => page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
const shot = (n) => page.screenshot({ path: `${out}/${n}.png` });
for (const [i, t] of ['upload', 'manage', 'publishing', 'archive'].entries()) {
  await page.goto(`${base}?tab=${t}`); await ready(); await page.waitForTimeout(1600);
  await shot(`b5-0${i + 1}-${t}`);
}
await page.goto(`${base}?tab=manage`); await ready(); await page.waitForTimeout(600);
await page.locator('.tile[data-id="d2"] .th').click(); await page.waitForTimeout(300);
await page.locator('.act[data-dn="d2"]').click(); await page.waitForTimeout(1200);
await shot('b5-05-drawer');
await page.goto(`${base}?tab=archive`); await ready(); await page.waitForTimeout(600);
await page.locator('.act[data-ar="a5"][data-act="vis"]').click(); await page.waitForTimeout(300);
await page.locator('.act[data-ar="a5"][data-act="vis"]').click();
await idle(); await page.waitForTimeout(1800);
await shot('b5-06-map');
await page.locator('.act[data-ar="a1"][data-act="vis"]').click().catch(() => {});
await page.locator('.act[data-ar="a1"][data-act="vis"]').click().catch(() => {});
await idle(); await page.waitForTimeout(1800);
await shot('b5-07-map-layers');
console.log('errors', errs);
await browser.close();
