// 데이터 관리 B5 — 단계 4 · 완료 선택(지도 + 기본 정보) · 발행 폼 · 실패 선택 · 아카이브 판 · 타일 S/XL · 1920. 콘솔 오류를 같이 찍는다.
//   node tools/proto/shoot-ds.mjs   (서버 4173 필요)  → shots/proto-ds/b5-*.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = 'http://localhost:4173/landxi/proto/dataset.html';
const out = 'shots/proto-ds';
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
const errs = [];
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|vworld|xdworld|WebGL/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => localStorage.setItem('lx_logged_in', '1'));
  return page;
}
const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
const idle = (page) => page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
const hold = (page) => page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); });
const go = async (page, tab) => { await page.goto(`${base}?tab=${tab}`); await ready(page); await page.waitForTimeout(1500); await hold(page); };
const shot = (page, n) => page.screenshot({ path: `${out}/${n}.png` });

const page = await open({ width: 1440, height: 900 });
// 단계 4 — 선택 없음(빈 상태 판 + 건수). 전 건 표출.
for (const [i, t] of ['upload', 'manage', 'publishing', 'archive'].entries()) { await go(page, t); await shot(page, `b5-0${i + 1}-${t}`); }
// 완료 — 타일 선택 → 우 패널에 지도(V-World + 도엽) + 기본 정보 + `지도 레이어 발행 ›`
await go(page, 'manage');
await page.locator('.th[data-open="d4"]').click(); await idle(page); await page.waitForTimeout(1800);
await shot(page, 'b5-05-manage-selected');
// 발행 폼 — 우 패널 안(5필드 + 공유 권한 표)
await page.locator('#side .act[data-dn="d4"]').click(); await page.waitForTimeout(500);
await shot(page, 'b5-06-pubform');
// 발행중 — 진행 눈금·% 는 그림 위, 실패 선택 = warn 브래킷 + 사유 + `좌표계 지정`
await go(page, 'publishing');
await page.locator('.th[data-open="p2"]').click(); await page.waitForTimeout(900);
await shot(page, 'b5-07-publishing-fail');
// 업로드 — 진행중 선택(리빌 % · 일시정지/취소/세부 정보)
await go(page, 'upload');
await page.locator('.th[data-open="u1"]').click(); await page.waitForTimeout(600);
await shot(page, 'b5-08-upload-selected');
// 아카이브 — 표시 자산 선택 → 판의 레이어 + 5액션
await go(page, 'archive');
await page.locator('.th[data-open="a5"]').click(); await idle(page); await page.waitForTimeout(1800);
await shot(page, 'b5-09-archive-map');
// 타일 크기 S(6열) · XL(2열) — localStorage 에 남는다
await go(page, 'manage');
await page.locator('#size button[data-size="S"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-10-size-S');
await page.locator('#size button[data-size="XL"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-11-size-XL');
await page.locator('#size button[data-size="M"]').click();
// 호버 — 타일 4px 상승
await page.locator('.th[data-open="d2"]').hover(); await page.waitForTimeout(400); await shot(page, 'b5-12-hover');
await page.context().close();
// 1920 — 5열 M 그대로, 판이 넓어진다
const wide = await open({ width: 1920, height: 1080 });
await go(wide, 'manage');
await wide.locator('.th[data-open="d4"]').click(); await idle(wide); await wide.waitForTimeout(1800);
await shot(wide, 'b5-13-1920');
await wide.context().close();
console.log('errors', errs);
await browser.close();
