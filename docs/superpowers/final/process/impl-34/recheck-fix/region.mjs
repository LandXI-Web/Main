// 분석하기 지역 찾기 — '강원 원주' · '전라북도 남원' · '경남 함양'(시도 + 시군구) · 바깥 주소 로그인 폼(직원) · PC 1440
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/User/AppData/Local/ms-playwright';
if (!process.env.LX_PW) process.env.LX_PW = (fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const B = 'https://app.land-xi.dev';
const b = await chromium.launch(); const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e.message))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await frontDoor(p, B, 'test@lx.or.kr', { password: process.env.LX_PW });
await p.goto(B + '/landxi/v3/lx-analyze/');
await p.locator('.k-sc .k-sc-more').first().click();
const inp = p.locator('.la-side .k-region input'); await inp.waitFor({ timeout: 30000 });
await p.waitForTimeout(2000);
const out = {};
for (const q of ['원주', '강원 원주', '강원도 원주시', '전라북도 남원', '경남 함양', '서울 중구']) {
  await inp.click(); await inp.fill(q); await p.waitForTimeout(400);
  out[q] = await p.locator('.la-side .k-region-l [role=option]').allInnerTexts();
  if (q === '강원 원주') await p.screenshot({ path: path.join(HERE, 'shots', 'region-gangwon-wonju-1440.png') });
}
out.console_errors = errs;
fs.writeFileSync(path.join(HERE, 'region.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
await b.close();
