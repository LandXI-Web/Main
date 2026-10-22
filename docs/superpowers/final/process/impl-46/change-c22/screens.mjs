// 국토 변화 탐지 — 분석하기 카드 · 변화 분석 입력 칸 · 데이터 올리기 '벡터 등록' 그림(로그인 폼)
// node docs/superpowers/final/process/impl-46/change-c22/screens.mjs [base] [project]
import { chromium } from 'playwright';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';
import { MEASURE } from '../../../../../../landxi/v3/kit/lint/overlap.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://localhost:4173';
const PROJECT = process.argv[3];
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
const out = {};
const shot = async (n) => { await page.screenshot({ path: path.join(HERE, 'shots', n) }); const m = await page.evaluate(MEASURE); out[n] = (m.overlaps || []).length; };
await frontDoor(page, BASE, 'test@lx.or.kr', 'app');
await page.goto(BASE + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
out.cards = await page.evaluate(() => [...document.querySelectorAll('h3, .ac-t, b')].map((x) => x.innerText).filter((t) => /분석서비스/.test(t)).slice(0, 12));
await shot('10-analyze-cards.png');
await page.goto(BASE + '/landxi/v3/lx-analyze/?card=card-change', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);
await shot('11-analyze-change.png');
if (PROJECT) {
  await page.goto(BASE + '/landxi/v3/lx-ingest/?project=' + PROJECT, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  await shot('12-ingest.png');
}
console.log(JSON.stringify(out));
await browser.close();
