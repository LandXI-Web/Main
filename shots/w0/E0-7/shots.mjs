// E0-7 데이터 관리 — 셸 이관 · 파괴 동작 확인/되돌리기 · 공유 잠금 촬영. 읽기 전용(화면을 바꾸지 않는다).
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:4173/landxi/proto/';
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function open(role, vp, q) {
  const ctx = await b.newContext({ viewport: vp });
  await ctx.addInitScript((r) => { localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session'); }, role);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(BASE + 'dataset.html' + q, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
  await wait(1200);
  return { ctx, page, errs };
}
const shot = (page, n) => page.screenshot({ path: path.join(OUT, n + '.png') });
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const vp = { width: w, height: h };
  { const { ctx, page } = await open('staff', vp, '?tab=manage'); await page.click('.th[data-open="d4"]'); await wait(3000); await shot(page, `01-ds-staff-${w}`); await ctx.close(); }
  { const { ctx, page } = await open('admin', vp, '?tab=archive'); await page.click('.th[data-open="a1"]'); await wait(3000); await shot(page, `02-ds-admin-${w}`); await ctx.close(); }
  { const { ctx, page } = await open('staff', vp, '?tab=archive');
    await page.click('.th[data-open="a3"]'); await wait(400);
    await page.click('#side-acts .act[data-act="del"]'); await wait(700); await shot(page, `03-confirm-delete-${w}`);
    await page.click('.modal .btn--danger');
    if (w === 1440) { for (let i = 0; i < 10; i++) { await page.screenshot({ path: path.join(OUT, `04-undo-frame-${String(i).padStart(2, '0')}.png`), clip: { x: 72, y: 700, width: 900, height: 200 } }); await wait(60); } }
    await wait(700); await shot(page, `04-undo-toast-${w}`);
    await page.click('#ds-undo'); await wait(600); await shot(page, `05-undo-restored-${w}`);
    await page.click('.th[data-open="a1"]'); await wait(1500);
    await page.click('#side-acts .act[data-act="share"]'); await wait(700); await shot(page, `26-share-modal-${w}`);
    await page.keyboard.press('Escape');
    await ctx.close(); }
  { const { ctx, page } = await open('staff', vp, '?tab=manage'); await page.click('.th[data-open="d3"]'); await wait(500);
    await page.click('#side-acts .act[data-act="join"]'); await wait(1200); await shot(page, `06-join-table-${w}`); await ctx.close(); }
  { const { ctx, page } = await open('staff', vp, '?tab=publishing'); await page.click('.th[data-open="p5"]'); await wait(500);
    await page.click('#side-acts .act[data-act="join"]'); await wait(700); await shot(page, `07-join-guide-${w}`); await ctx.close(); }
}
await b.close();
console.log('done');
