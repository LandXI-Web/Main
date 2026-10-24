// 카드 고침(10-24) 화면 확인 — 로그인 폼(test@lx.or.kr · LX 직원)으로 분석 서비스 → 카드 상세. node look.mjs <base> <tag> [card...]
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path'; import fs from 'node:fs'; import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', TAG = 'before', ...CARDS] = process.argv.slice(2);
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const out = { base: BASE, tag: TAG, at: new Date().toISOString(), pages: {}, errs: [] };
const OUT = path.join(HERE, `look-${TAG}.json`); const save = () => fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }); const page = await ctx.newPage();
page.on('pageerror', (e) => out.errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
async function grab(n) { const o = {}; await page.screenshot({ path: path.join(SH, `${TAG}-${n}.png`) }); try { const m = await page.evaluate(MEASURE); o.overlaps = (m.overlaps || []).map((x) => `${x.a} × ${x.b}`); } catch (e) { o.overlaps = ['measure ' + e.message]; } return o; }
// 1) 갤러리
const t0 = Date.now();
await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await page.locator('.k-sc').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(1500);
out.pages.gallery = { ms: Date.now() - t0, cards: await page.evaluate(() => [...document.querySelectorAll('.k-sc')].map((e) => ({ t: e.querySelector('h3,h4')?.textContent, badge: e.querySelector('.k-sc-badge')?.textContent, act: e.querySelector('.k-sc-acts')?.innerText.replace(/\n/g, ' / ') }))), ...(await grab('gallery')) };
save();
for (const cid of (CARDS.length ? CARDS : ['card-farm'])) {
  const t1 = Date.now();
  await page.goto(BASE + `/landxi/v3/lx-analyze/?card=${cid}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.la-side, #analyze').first().waitFor({ timeout: 60000 }); await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const own = document.querySelector('.la-own-b'); const r = own?.getBoundingClientRect();
    const txt = (s) => document.querySelector(s)?.innerText;
    return { own: own ? { text: own.textContent, top: Math.round(r.top + scrollY), visible: !!(r.width && r.height), inFirstView: r.top < innerHeight } : null,
      side: txt('#analyze')?.slice(0, 400), cond: txt('[aria-label="이 카드의 조건"]'), metrics: txt('.la-hero, .la-head')?.slice(0, 500), body: document.body.innerText.slice(0, 3000), h: document.body.scrollHeight };
  });
  out.pages[cid] = { ms: Date.now() - t1, ...info, ...(await grab(cid + '-top')) };
  if (info.own) { await page.locator('.la-own-b').scrollIntoViewIfNeeded(); await page.waitForTimeout(500); out.pages[cid].ownShot = await grab(cid + '-own'); }
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(800); await grab(cid + '-bottom');
  if (await page.locator('.la-own-side a').count()) { await page.evaluate(() => scrollTo(0, 0)); await page.locator('.la-own-side a').click(); await page.waitForTimeout(1200); out.pages[cid].sideLink = { modal: await page.locator('.t-modal, [role=dialog]').first().innerText().catch(() => null), ...(await grab(cid + '-own-modal')) }; await page.keyboard.press('Escape'); }
  save();
}
await b.close(); save(); console.log('ok', OUT);
