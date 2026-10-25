// 카드 그림(10-25 원칙 338) — 바깥 주소 · 로그인 폼(LX 직원)으로 분석 서비스 갤러리를 찍고 카드마다 그림이 실제로 떴는지 잰다. node look.mjs [base]
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev'] = process.argv.slice(2);
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const out = { base: BASE, at: new Date().toISOString(), cards: [], errs: [] };
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
const t0 = Date.now();
await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await page.locator('.k-sc').first().waitFor({ timeout: 60000 });
for (let i = 0; i < 40; i++) { const h = await page.evaluate(() => document.body.scrollHeight); await page.evaluate((y) => scrollTo(0, y), (i + 1) * 700); await page.waitForTimeout(250); if ((i + 1) * 700 > h) break; }
await page.waitForTimeout(2500); await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(500);
out.ms = Date.now() - t0;
const grabCards = () => page.evaluate(() => [...document.querySelectorAll('.k-sc')].map((e) => { const im = e.querySelector('.k-sc-crop img'); return {
  name: e.querySelector('h3,h4')?.textContent?.trim(), src: im ? im.getAttribute('src').replace(/^.*\/cards\/files\//, '') : null, loaded: !!(im && im.complete && im.naturalWidth > 0),
  w: im?.naturalWidth || 0, h: im?.naturalHeight || 0, blank: e.querySelector('.k-sc-blank')?.textContent || null, ex: e.querySelector('.k-sc-ex')?.textContent || null }; }));
const eight = page.locator('button[aria-label="한 페이지 8장"]');
if (await eight.count()) { await eight.click(); await page.waitForTimeout(2500); }
for (let pg = 1; pg <= 3; pg++) {
  await page.waitForTimeout(2000);
  out.cards.push(...(await grabCards()));
  await page.screenshot({ path: path.join(SH, `gallery-p${pg}.png`) });
  const nx = page.locator('.la-pager button.ar').last();
  if (!(await nx.count()) || (await nx.isDisabled())) break;
  await nx.click();
}
fs.writeFileSync(path.join(HERE, 'look.json'), JSON.stringify(out, null, 1));
await b.close(); console.log(JSON.stringify(out.cards.map((c) => [c.name, c.loaded, c.w + 'x' + c.h, c.blank, c.ex])), out.errs.length, out.ms);
