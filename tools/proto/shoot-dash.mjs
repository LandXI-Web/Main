// 대시보드 B5 — 4장(기본 · 좌 호버 · 우 호버 · 1280) + 딥링크 2장. 콘솔 오류를 같이 찍는다.
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
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|vworld|xdworld/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  await page.goto(base + q);
  await page.waitForFunction(() => document.documentElement.dataset.dash === 'ready');
  await page.waitForFunction(() => /ready|partial/.test(document.documentElement.dataset.geo || ''), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1400);
  return page;
}
let p = await open(1440, 900);
await p.screenshot({ path: `${out}/b5-01-default.png` });
await p.locator('#plates-l .pl.is-front').hover(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/b5-02-hover-left.png` });
await p.locator('#plates-r .pl.is-front').hover(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/b5-03-hover-right.png` });
await p.locator('#plates-l .pl[data-no="05"] .lab').hover(); await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/b5-03b-hover-ghost.png` });
await p.context().close();
p = await open(1280, 800);
await p.screenshot({ path: `${out}/b5-04-1280.png`, fullPage: true });
await p.context().close();
p = await open(1440, 900, '?status=대기');
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/b5-05-status.png` });
await p.context().close();
p = await open(1440, 900, '?open=pa-1');
await p.waitForTimeout(600);
await p.screenshot({ path: `${out}/b5-06-open.png` });
await p.context().close();
console.log('errors', errs);
await browser.close();
