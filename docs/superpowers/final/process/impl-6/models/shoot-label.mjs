/* 모델-표기 ⓐ 화면 증거 — 로그인 폼 입력(세션 주입 없음) · 1440 × 900.
   사용: node docs/superpowers/final/process/impl-6/models/shoot-label.mjs [--base http://localhost:4173]
   ① LX 직원 · 서비스 적용(비닐하우스 카드) — '분석에 쓴 모델' 줄이 찾는 분류(비닐하우스)만
   ② LX 직원 · 분석하기 → 비닐하우스 카드 — 결과 예시의 지역별 현장 확인 필요가 이 카드의 필지 대조만(남원 2필지 · 카드마다 따로) · 찾는 것 '비닐하우스' */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HW = process.env.LX_HW_BROWSERS || 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:4173');
const IMG = path.join(HERE, 'img'); fs.mkdirSync(IMG, { recursive: true });

const b = await chromium.launch({ channel: 'chrome' });
const out = {};
async function shot(who, url, file, after) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await frontDoor(page, BASE, who.login, who.tenant ? { tenant: who.tenant } : who.site);
  await page.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => null);
  await page.waitForTimeout(2500);
  if (after) await after(page);
  await page.screenshot({ path: path.join(IMG, file), fullPage: false });
  out[file] = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  await ctx.close();
}
await shot({ login: 'test@lx.or.kr', site: 'app' }, '/landxi/v3/lx-deploy/?card=card-5e85a9', 'label-deploy-1440.png', async (page) => {
  const row = page.getByText('남원', { exact: false }).first();
  if (await row.count()) { await row.click().catch(() => null); await page.waitForTimeout(1500); }
});
await shot({ login: 'test@lx.or.kr', site: 'app' }, '/landxi/v3/lx-analyze/?card=card-5e85a9', 'label-analyze-1440.png', async (page) => {
  await page.locator('.la-dt-body').first().scrollIntoViewIfNeeded().catch(() => null);
  await page.evaluate(() => { const el = document.querySelector('.la-dt-body'); if (el) window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 80); });
  await page.waitForTimeout(800);
});
fs.writeFileSync(path.join(HERE, 'shoot-label-text.json'), JSON.stringify(out, null, 1));
await b.close();
console.log('ok', Object.keys(out));
