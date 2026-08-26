// 데이터 관리 B5 — 9장. 각 탭 · 드로어 · 판 위 레이어 · 발행 실패(앰버) · 호버. 콘솔 오류를 같이 찍는다.
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
// 발행 실패 — 앰버 브래킷 + 실좌표 SHP 실루엣 + 사유 원문. 타일만 크게, 그리고 호버.
await page.goto(`${base}?tab=publishing`); await ready(); await page.waitForTimeout(1400);
await page.locator('.tile[data-id="p2"]').screenshot({ path: `${out}/b5-08-fail.png` });
await page.locator('.tile[data-id="p2"] .th').hover(); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/b5-08-fail-hover.png`, clip: { x: 128, y: 124, width: 1256, height: 240 } });
// 호버 — 타일 4px 상승 + 선반 액션 · 탭 칩 상승. 업로드 탭.
await page.goto(`${base}?tab=upload`); await ready(); await page.waitForTimeout(1400);
await page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); });
await page.locator('.tile[data-id="u2"] .th').hover(); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/b5-09-hover.png` });
await page.locator('#tab-archive').hover(); await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/b5-09-hover-tab.png`, clip: { x: 72, y: 64, width: 1368, height: 80 } });
console.log('errors', errs);
await browser.close();
