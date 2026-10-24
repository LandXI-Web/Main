/* 비교 카드 기능 시험 — 바깥 주소 · 로그인 폼(LX 직원). 같은 날 영상의 생육기 · 생산기 결과로 '견주기'가 끝까지 도는지만 본다(결과 예시로 쓰지 않음). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const C = await import(pathToFileURL(path.resolve(HERE, '../../../../../../tools/check/common.mjs')).href);
const OUT = path.join(HERE, 'shots');
const browser = await C.launch();
const s = await C.login(browser, 'app');
const { page, home } = s;
const r = {};
try {
  await page.goto(home + '/landxi/v3/lx-analyze/?card=card-ba9d6d', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.la-cmp select', { timeout: 60000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, 'compare-b-detail.png'), fullPage: true });
  const sels = page.locator('.la-cmp select');
  r.selects = await sels.count();
  for (let i = 0; i < Math.min(2, r.selects); i++) await sels.nth(i).selectOption({ index: 1 });
  const t0 = Date.now();
  await page.locator('.la-cmp .la-go').click();
  await page.waitForSelector('.la-cmp-r', { timeout: 120000 });
  r.ms = Date.now() - t0;
  await page.waitForTimeout(3000);
  r.status = await page.locator('.la-cmp-st').innerText();
  r.result = (await page.locator('.la-cmp-r').innerText()).slice(0, 400);
  await page.locator('.la-cmp-r').screenshot({ path: path.join(OUT, 'compare-c-result.png') });
} finally {
  fs.writeFileSync(path.join(HERE, 'compare-test.json'), JSON.stringify(r, null, 1));
  console.log(JSON.stringify(r).slice(0, 600));
  await s.ctx.close(); await browser.close();
}
