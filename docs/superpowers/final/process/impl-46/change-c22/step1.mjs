// 국토 변화 탐지 §7 1단계 — 새 프로젝트(구역선 파일 + 버퍼 50m + 영상 2019 · 2024) → 지도 서비스에 두 해 영상 · 대상지
// node docs/superpowers/final/process/impl-46/change-c22/step1.mjs [base] [name] [file]
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:4173';
const NAME = process.argv[3] || '고속국도 담양IC 변화 모니터링';
const FILE = process.argv[4] || 'E:/Land-XI 플랫폼/02. 데이터/change/inputs/담양IC_구역선.geojson';
const YEARS = (process.argv[5] || '2019,2024').split(',').map(Number);
const shot = (p, n) => p.screenshot({ path: path.join(HERE, 'shots', n) });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
await page.goto(BASE + '/landxi/v3/lx-project/?new=1', { waitUntil: 'domcontentloaded' });
await page.locator('.lxp-new input[name=name]').waitFor({ timeout: 30000 });
await page.locator('.lxp-new input[name=name]').fill(NAME);
await page.locator('.lxp-reg-tg').click();
await page.locator('.lxp-rm .lxp-vt[data-k=line]').click();
await page.locator('.lxp-buf').fill('50');
await page.locator('.lxp-rng input[type=file]').first().setInputFiles(FILE);
await page.locator('.lxp-yrs .lxp-chip').first().waitFor({ timeout: 60000 });
for (const b of await page.locator('.lxp-yrs .lxp-chip').all()) {
  const y = parseInt(await b.textContent(), 10);
  const on = (await b.getAttribute('aria-pressed')) === 'true';
  if (on !== YEARS.includes(y)) await b.click();
}
await shot(page, '01-new-project.png');
if (process.env.DRY_PROJECT) {            // 만들지 않고 이미 만든 프로젝트 지도만 다시 찍는다(같은 이름 프로젝트를 또 만들지 않게)
  await page.goto(`${BASE}/landxi/v3/lx-map/?project=${process.env.DRY_PROJECT}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.chg-card').waitFor({ timeout: 60000 });
  await page.waitForTimeout(8000);
  await shot(page, '02-project-map-2019-2024.png');
  console.log(JSON.stringify({ dry: true, swipe: await page.locator('.k-sw-grip').count(), labels: await page.locator('.k-sw-lab').allTextContents(), errs }));
  await browser.close(); process.exit(0);
}
const t0 = Date.now();
await page.locator('.lxp-new .lxp-act .t-btn').first().click();
await page.waitForURL(/lx-map\/\?project=/, { timeout: 60000 });
await page.locator('.chg-card').waitFor({ timeout: 60000 });
await page.locator('.k-sw-grip').waitFor({ timeout: 60000 }).catch(() => null);
await page.waitForTimeout(6000);
console.log(JSON.stringify({ url: page.url(), ms_to_map: Date.now() - t0, swipe: await page.locator('.k-sw-grip').count(), labels: await page.locator('.k-sw-lab').allTextContents(), errs }));
await shot(page, '02-project-map-2019-2024.png');
await browser.close();
