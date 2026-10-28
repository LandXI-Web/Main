/* v7.1 §0 영상 업로드 — lx.demo · 바깥 주소 · 이지목 현황 카드 '내 영상' → 진행률 · 등록 · 지도 3장 */
import { open, shot, text, APP } from './cap.mjs';
const FILE = 'E:/도로공사/deck_capability/input/안성창_2025_항공_국토지리정보원.tif';
const out = { t0: new Date().toISOString() };
const { browser, ctx, page, errs } = await open('lx.demo@lx.or.kr', 'LXDEMO_PW', { init: () => {
  try { delete window.showOpenFilePicker; window.showOpenFilePicker = undefined; } catch {}
  addEventListener('lx:upload-done', (e) => { window.__up = e.detail; });
} });
try {
  await page.goto(APP + '/landxi/v3/lx-analyze/?card=card-ijimok#analyze', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await page.locator('#analyze .la-chg-tabs button[data-k=own]').last().click();
  await page.locator('#analyze button', { hasText: '내 영상 업로드' }).last().click();
  await page.waitForTimeout(2500);
  await page.locator('.la-own-m input[type=file]').first().setInputFiles(FILE);
  await page.waitForTimeout(2500);
  const popP = ctx.waitForEvent('page', { timeout: 30000 });
  const tStart = Date.now();
  await page.locator('.la-own-m button', { hasText: '업로드 시작' }).click();
  const pop = await popP.catch(() => null);
  out.popup = !!pop;
  const prog = [];
  for (let i = 0; i < 240; i++) {
    await page.waitForTimeout(500);
    const st = await text(page, '.k-up');
    const ps = pop ? await text(pop, 'body') : '';
    if (/%/.test(st + ps) && prog.length < 6) { const f = await shot(page, `upload/progress-${prog.length}.png`); prog.push({ s: ((Date.now() - tStart) / 1000).toFixed(1), st: st.slice(0, 200), f }); if (pop) await pop.screenshot({ path: `E:/도로공사/deck_part3b/upload/progress-pop-${prog.length - 1}.png` }); }
    const up = await page.evaluate(() => window.__up || null);
    if (up) { out.done = up; out.doneSec = ((Date.now() - tStart) / 1000).toFixed(1); break; }
    if (/등록하지 못했습니다|못했습니다|오류/.test(st + ps)) { out.fail = (st + '\n' + ps).slice(0, 800); }
  }
  out.prog = prog;
  out.statusText = (await text(page, '.k-up')).slice(0, 600);
  if (pop) { out.popText = (await text(pop, 'body')).slice(0, 800); await pop.screenshot({ path: 'E:/도로공사/deck_part3b/upload/registered-pop.png' }).catch(() => {}); }
  await page.waitForTimeout(1500);
  out.reg = await shot(page, 'upload/registered.png');
  out.panelText = (await text(page, '#analyze')).slice(0, 900);
  const r = out.done?.result;
  if (r?.id) {
    const q = new URLSearchParams({ own: r.id, ...(r.bounds ? { bb: r.bounds.join(',') } : {}) });
    await page.goto(APP + '/landxi/v3/lx-map/?' + q, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12000);
    out.map = await shot(page, 'upload/map.png');
    out.mapText = (await text(page, 'main')).slice(0, 600);
  }
} catch (e) { out.error = String(e).slice(0, 500); await shot(page, 'upload/error.png').catch(() => {}); }
out.errs = errs; out.t1 = new Date().toISOString();
console.log(JSON.stringify(out, null, 1));
await browser.close();
