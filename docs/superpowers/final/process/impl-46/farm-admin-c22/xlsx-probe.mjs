/* '엑셀 다시' 진단 — 기관 세션(로그인 폼)으로 통계 · 이력 엑셀을 받아 ./dl 에 둔다(읽기만 · 개인정보 없는 파일만 — 대장이 든 파일은 받지 않음) */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DL = path.join(HERE, 'dl'); fs.mkdirSync(DL, { recursive: true });
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const ORG = 'https://namwon.land-xi.dev', CARD = 'card-farm';
const b = await chromium.launch({ channel: 'chrome', headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ko-KR', acceptDownloads: true });
const p = await ctx.newPage();
await frontDoor(p, ORG, 'lxadmin@lx.or.kr#namwon', 'gov');
await p.waitForURL((u) => !/gov-home/.test(u.pathname), { timeout: 60000 }).catch(() => {});
const out = [];
async function grab(label, nav, clickSel) {
  try {
    await nav();
    const btn = p.locator(clickSel).first();
    await btn.waitFor({ timeout: 20000 });
    const [d] = await Promise.all([p.waitForEvent('download', { timeout: 30000 }), btn.click()]);
    const f = path.join(DL, d.suggestedFilename()); await d.saveAs(f);
    out.push({ label, file: d.suggestedFilename(), bytes: fs.statSync(f).size });
  } catch (e) { out.push({ label, err: String(e.message || e).slice(0, 160) }); }
}
await grab('통계 · 종류별 읍면동별', async () => { await p.goto(`${ORG}/landxi/v3/gov-select/?service=${CARD}&tab=stats`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(4000); }, '.gs-cls button:has-text("엑셀")');
await grab('이력', async () => { await p.goto(`${ORG}/landxi/v3/gov-select/?service=${CARD}&tab=history`, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(3000); }, '.gy-hist button:has-text("엑셀")');
await grab('필지 목록 · 고른 필지', async () => {
  await p.goto(`${ORG}/landxi/v3/gov-report/?service=${CARD}&tab=sus`, { waitUntil: 'domcontentloaded' });
  await p.locator('#sus-table:not(.is-busy) tbody tr').first().waitFor({ timeout: 30000 });
  const cks = p.locator('#sus-table tbody .sp-ck'); const n = Math.min(5, await cks.count()); for (let i = 0; i < n; i++) await cks.nth(i).check();
  await p.locator('.sp-band:not([hidden])').waitFor({ timeout: 5000 });
}, '.sp-band button:has-text("엑셀")');
fs.writeFileSync(path.join(HERE, 'xlsx-probe.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await b.close();
