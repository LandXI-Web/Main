// 대시보드(B5-Dashboard-Data) — 기본 · 셀 호버 · 학습데이터 토글 · 탭 2·3 · 1280 · 딥링크. 콘솔 오류를 같이 찍는다.
// 실행: node tools/serve.mjs & node tools/proto/shoot-dash.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = 'http://localhost:4173/landxi/proto/dashboard.html';
const out = 'shots/proto-dash';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const errs = [];
async function open(w, h, q = '') {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|vworld|xdworld|eox/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(base + q);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  await page.waitForFunction(() => /ready|off|error/.test(document.documentElement.dataset.plate || ''), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2200);
  return page;
}
let p = await open(1440, 900);
await p.screenshot({ path: `${out}/b5-01-default.png` });
await p.locator('#cells .cell[data-g="2"]').first().hover(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/b5-02-hover-cell.png` });
await p.locator('#seg-train').click(); await p.waitForTimeout(400);
await p.locator('#cells .cell[data-g="2"]').first().hover(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/b5-03-train.png` });
await p.locator('#tab-visit').click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/b5-04-tab-visit.png` });
await p.locator('#tab-store').click(); await p.waitForTimeout(1200);
await p.screenshot({ path: `${out}/b5-05-tab-store.png` });
await p.context().close();
p = await open(1280, 800, '?tab=proj');
await p.screenshot({ path: `${out}/b5-06-1280.png`, fullPage: true });
await p.context().close();
p = await open(1440, 900, '?open=pa-1');
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/b5-07-open.png` });
await p.context().close();
console.log('errors', errs);
await browser.close();
