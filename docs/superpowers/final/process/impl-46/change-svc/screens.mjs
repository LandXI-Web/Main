// 국토 변화 카드 오른쪽 칸 — 1920 · 1440 · 1280 · 390 겹침 · 금지어 · 그림(바깥 주소 · 로그인 폼 · LX 직원)
// node docs/superpowers/final/process/impl-46/change-svc/screens.mjs [base]
import { chromium } from 'playwright';
import { frontDoor, scan, RULES } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const BASE = process.argv[2] || 'https://app.land-xi.dev';
const PW = process.env.LX_PW || (fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const out = { at: new Date().toISOString(), rows: [] };
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app', { password: PW });
for (const [w, hgt] of [[1920, 1080], [1440, 900], [1280, 800], [390, 844]]) {
  await page.setViewportSize({ width: w, height: hgt });
  await page.goto(BASE + '/landxi/v3/lx-analyze/?card=card-change#analyze', { waitUntil: 'domcontentloaded' });
  await page.locator('.la-chg-slot').nth(1).waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  if (await page.locator('.la-chg-form').isHidden()) await page.locator('.la-chg-new').click();
  await page.locator('.la-chg').scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  const n = `s-card-${w}.png`;
  await page.locator('.la-chg').screenshot({ path: path.join(HERE, 'shots', n) });
  const m = await page.evaluate(MEASURE);
  const words = (await page.evaluate(([rules, src]) => {
    const R = rules.map(([k, so, f]) => [k, new RegExp(so, f)]);
    const check = (t) => R.filter(([, re]) => re.test(t)).map(([k]) => k);   // eslint-disable-line no-unused-vars
    return eval('(' + src + ')')(document);                                   // eslint-disable-line no-eval
  }, [RULES.map(([k, re]) => [k, re.source, re.flags]), scan.toString()])).hits;
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  out.rows.push({ w, overlaps: (m.overlaps || []).map((o) => `${o.a} × ${o.b}`), words: words.map((x) => `${x.rule}: ${x.text}`), hscroll });
  console.log(w, JSON.stringify(out.rows.at(-1)));
}
out.errs = errs;
fs.writeFileSync(path.join(HERE, 'screens.json'), JSON.stringify(out, null, 1));
await browser.close();
