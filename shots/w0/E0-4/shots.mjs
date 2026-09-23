// E0-4 스크린샷 — 1440×900 · 1280×720. 실행: node shots/w0/E0-4/shots.mjs (서버 4173 이 떠 있어야 한다)
import { launch, BASE, OUT } from './lib.mjs';
import fs from 'fs';

const b = await launch();
const R = {};
async function page(role, vp) {
  const c = await b.newContext({ viewport: vp, acceptDownloads: true });
  await c.addInitScript((r) => {
    if (sessionStorage.getItem('lx_e2e_boot')) return;
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', r); localStorage.removeItem('lx_tenant_session');
  }, role);
  const p = await c.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
  return { p, c, errs };
}
const ready = (p) => p.waitForFunction(() => document.documentElement.dataset.shell === 'ready');

for (const [w, h] of [[1440, 900], [1280, 720]]) {
  const sfx = `-${w}`;
  // 01 영업 — 분석 실행 비활성 + 이유 한 줄
  { const { p, c, errs } = await page('sales', { width: w, height: h });
    await p.goto(BASE + 'analysis-ai.html?tab=run&card=card-farm'); await ready(p);
    await p.locator('.thumb').first().locator('input').check(); await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + `01-sales-run-disabled${sfx}.png` });
    await p.goto(BASE + 'analysis-ai.html?card=card-farm'); await ready(p); await p.waitForTimeout(900);
    await p.screenshot({ path: OUT + `01b-sales-shelf-disabled${sfx}.png` });
    await p.goto(BASE + 'analysis-ai.html?tab=done&run=namwon-farmland-2025'); await ready(p);
    await p.waitForSelector('#pc-tbl tbody tr'); await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + `01c-sales-done-disabled${sfx}.png` });
    R['sales' + sfx] = { errs, hOverflow: await p.evaluate(() => document.documentElement.scrollWidth - innerWidth) };
    await c.close(); }
  // 02 완료 탭 다운로드 → 토스트
  { const { p, c, errs } = await page('staff', { width: w, height: h });
    await p.goto(BASE + 'analysis-ai.html?tab=done&run=namwon-farmland-2025'); await ready(p);
    await p.waitForSelector('#pc-tbl tbody tr'); await p.waitForTimeout(1200);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#dp-down')]);
    const path = OUT + '_dl.tmp'; await dl.saveAs(path);
    R['download' + sfx] = { name: dl.suggestedFilename(), bytes: fs.statSync(path).size, say: await p.textContent('#say') };
    fs.unlinkSync(path);
    await p.waitForTimeout(200);
    await p.screenshot({ path: OUT + `02-done-download-toast${sfx}.png` });
    R['download' + sfx].errs = errs;
    await c.close(); }
  // 03 새 실행 → 완료 → 분석 결과 보기
  { const { p, c, errs } = await page('staff', { width: w, height: h });
    await p.goto(BASE + 'analysis-ai.html?tab=run&card=card-farm'); await ready(p);
    await p.locator('.thumb').first().locator('input').check();
    await p.click('#go-run'); await p.waitForTimeout(1200);
    await p.screenshot({ path: OUT + `03a-new-run-progress${sfx}.png` });
    await p.waitForFunction(() => /완료/.test(document.querySelector('#p-note')?.textContent || ''), null, { timeout: 15000 });
    await p.screenshot({ path: OUT + `03b-new-run-complete${sfx}.png` });
    await p.locator('.modal .btn').click();
    await p.waitForFunction(() => (window.__an?.featureCount || 0) > 0, null, { timeout: 20000 });
    await p.waitForTimeout(1500);
    await p.screenshot({ path: OUT + `03-new-run-done${sfx}.png` });
    R['newrun' + sfx] = { url: p.url(), features: await p.evaluate(() => window.__an), rows: await p.locator('#pc-tbl tbody tr').count(), src: await p.textContent('.dp-src'), errs };
    await c.close(); }
  // 04 마스트 기준일
  { const { p, c } = await page('staff', { width: w, height: h });
    await p.goto(BASE + 'analysis-ai.html'); await ready(p); await p.waitForTimeout(900);
    R['asof' + sfx] = await p.textContent('#mast-asof');
    await p.screenshot({ path: OUT + `04-mast-asof${sfx}.png` });
    await c.close(); }
}
fs.writeFileSync(OUT + 'shots.json', JSON.stringify(R, null, 1));
console.log(JSON.stringify(R, null, 1));
await b.close();
