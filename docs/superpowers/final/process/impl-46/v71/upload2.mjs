/* v7.1 §0 업로드 진행률 장면 — 첫 시도(upload.mjs)는 13초 만에 끝나 진행률 장면을 못 잡음 → 같은 길로 한 번 더, 0.3초마다 찍기 */
import { open, shot, text, APP } from './cap.mjs';
const FILE = 'E:/도로공사/deck_capability/input/안성창_2025_항공_국토지리정보원.tif';
const out = { step: [] }; const S = (x) => out.step.push(x);
const { browser, ctx, page, errs } = await open('lx.demo@lx.or.kr', 'LXDEMO_PW', { init: () => {
  try { delete window.showOpenFilePicker; window.showOpenFilePicker = undefined; } catch {}
  addEventListener('lx:upload-done', (e) => { window.__up = e.detail; });
} });
try {
  await page.goto(APP + '/landxi/v3/lx-analyze/?card=card-ijimok#analyze', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000); S('detail');
  await page.locator('#analyze .la-chg-tabs button[data-k=own]').last().click();
  await page.locator('#analyze button', { hasText: '내 영상 업로드' }).last().click();
  await page.waitForTimeout(2000); S('modal');
  await page.locator('.la-own-m input[type=file]').first().setInputFiles(FILE);
  await page.waitForTimeout(2000);
  const popP = ctx.waitForEvent('page', { timeout: 30000 });
  const t0 = Date.now();
  await page.locator('.la-own-m button', { hasText: '업로드 시작' }).click();
  await popP.catch(() => null); S('popup');
  const seen = [];
  for (let i = 0; i < 200; i++) {
    const st = await text(page, '.k-up');
    const n = seen.length;
    if (n < 12 && st) { await page.screenshot({ path: `E:/도로공사/deck_part3b/upload/p2-${String(n).padStart(2, '0')}.png`, timeout: 15000 }).catch((e) => S('shot ' + String(e).slice(0, 80))); seen.push({ s: ((Date.now() - t0) / 1000).toFixed(1), st: st.replace(/\n+/g, ' | ').slice(0, 160) }); }
    if (await page.evaluate(() => window.__up || null)) { out.done = await page.evaluate(() => window.__up); out.sec = ((Date.now() - t0) / 1000).toFixed(1); break; }
    await page.waitForTimeout(900);
  }
  out.seen = seen;
} catch (e) { out.error = String(e).slice(0, 500); }
out.errs = errs;
console.log(JSON.stringify(out, null, 1));
await browser.close();
