// 국토 변화 탐지 화면 겹침 검사(원칙 309) — 지도 서비스 변화 층 · 폴리곤 칸 · 분석하기 · 새 프로젝트 창, 1920 · 1440 · 1280 · 390
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [BASE = 'https://app.land-xi.dev', PROJECT, JOB] = process.argv.slice(2);
const out = {};
const browser = await chromium.launch();
for (const [w, hh] of [[1920, 1080], [1440, 900], [1280, 800], [390, 844]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: hh }, isMobile: w < 800, hasTouch: w < 800 })).newPage();
  await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
  const m = async (k) => { const r = await page.evaluate(MEASURE); out[`${w}:${k}`] = (r.overlaps || []).map((o) => `${o.a} × ${o.b} (${o.kind} ${o.w}x${o.h})`); };
  await page.goto(`${BASE}/landxi/v3/lx-map/?project=${PROJECT}&change=${JOB}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.chg-card .chg-big').waitFor({ timeout: 60000 }).catch(() => null);
  await page.waitForTimeout(3000); await m('map');
  await page.screenshot({ path: path.join(HERE, 'shots', `ov-${w}-map.png`) });
  await page.evaluate(() => { const C = window.__lxChange; const f = C.fc.features.find((x) => x.properties.inside_row === '내' && x.properties.type === '신축') || C.fc.features[0]; document.dispatchEvent(new CustomEvent('kit:change-pick', { detail: { id: f.id } })); });
  await page.waitForTimeout(2500); await m('panel');
  const fab = page.locator('.k-chat-fab'); if (await fab.isVisible().catch(() => false)) { await fab.click().catch(() => null); await page.waitForTimeout(800); }
  await m('panel+chat');
  await page.screenshot({ path: path.join(HERE, 'shots', `ov-${w}-panel-chat.png`) });
  await page.close();
}
fs.writeFileSync(path.join(HERE, 'overlap.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out, null, 1));
await browser.close();
