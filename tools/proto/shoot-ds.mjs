// 데이터 관리 B5 — 업로드 진행 현황판(선택 없음) · 업로드 선택 · 쪽당 8/16 + 페이저 · 완료 위치+성과 / 데이터 테이블 · 발행 실패 · 아카이브(사용 현황·발행 이력·메모) · 1920.
// 콘솔 오류를 같이 찍는다.
//   node tools/proto/shoot-ds.mjs   (서버 4173 필요)  → shots/proto-ds/b5-*.png
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = 'http://localhost:4173/landxi/proto/dataset.html';
const out = 'shots/proto-ds';
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^b5-/.test(f)) fs.unlinkSync(`${out}/${f}`);
const browser = await chromium.launch({ channel: 'chrome' });
const errs = [];
async function open(viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR|vworld|xdworld|WebGL/i.test(m.text())) errs.push('console: ' + m.text()); });
  await page.addInitScript(() => { localStorage.setItem('lx_logged_in', '1'); localStorage.removeItem('lx_ds_pp'); });
  return page;
}
const ready = (page) => page.waitForFunction(() => document.documentElement.dataset.ds === 'ready');
const idle = (page) => page.waitForFunction(() => ['idle', 'off'].includes(document.documentElement.dataset.plate || ''), null, { timeout: 25000 }).catch(() => {});
const hold = (page) => page.evaluate(() => { for (let i = 1; i < 9999; i++) clearInterval(i); });
const go = async (page, tab) => { await page.goto(`${base}?tab=${tab}`); await ready(page); await page.waitForTimeout(1500); await hold(page); };
const shot = (page, n) => page.screenshot({ path: `${out}/${n}.png` });

const page = await open({ width: 1440, height: 900 });
// 01 업로드 — 선택 없음 = 우 패널이 카드별 진행 현황판(이름 · 상태 · 막대 % · 크기 · 잔여)
await go(page, 'upload'); await shot(page, 'b5-01-upload-board');
// 02 업로드 — 진행중 선택 → 그 건의 상세 + 액션(일시정지 · 취소 · 세부 정보)
await page.locator('.th[data-open="u1"]').click(); await page.waitForTimeout(600); await shot(page, 'b5-02-upload-selected');
// 03 완료 — 선택 없음 · 쪽당 8(4열 × 2) · 페이저 `1 / 1`
await go(page, 'manage'); await shot(page, 'b5-03-manage-pp8');
// 04 쪽당 16 (4 × 4) — 타일 높이가 그리드에 맞춰 준다
await page.locator('#pp button[data-pp="16"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-04-pp16');
// 05 쪽당 4 (2 × 2) — 페이저 `1 / 2` → 다음 쪽
await page.locator('#pp button[data-pp="4"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-05-pp4-page1');
await page.locator('#pg-next').click(); await page.waitForTimeout(900); await shot(page, 'b5-06-pp4-page2');
await page.locator('#pp button[data-pp="8"]').click(); await page.waitForTimeout(400);
// 07 완료 — 도엽 선택 → 실제 위치(V-World + 도엽 + 브래킷) + 성과(청록 결과 폴리곤 + 건수)
await page.locator('.th[data-open="d4"]').click(); await idle(page); await page.waitForTimeout(2400); await shot(page, 'b5-07-manage-spatial');
// 08 완료 — 위치 없는 XLSX → 데이터 테이블 속성(속성명 / 유형 / 예시) + 첫 행 미리보기
await page.locator('.th[data-open="d3"]').click(); await page.waitForTimeout(700); await shot(page, 'b5-08-manage-table-xlsx');
// 09 완료 — SHP(결과 GeoJSON) → 실루엣 + 실값 예시
await page.locator('.th[data-open="d7"]').click(); await page.waitForTimeout(1200); await shot(page, 'b5-09-manage-table-shp');
// 10 발행 폼 — 우 패널 안
await page.locator('.th[data-open="d4"]').click(); await page.waitForTimeout(600);
await page.locator('#side .act[data-dn="d4"]').click(); await page.waitForTimeout(500); await shot(page, 'b5-10-pubform');
// 11 발행중 — 실패 선택
await go(page, 'publishing');
await page.locator('.th[data-open="p2"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-11-publishing-fail');
// 12 아카이브 — 정사영상 선택 → 판 레이어 + 사용 현황 · 성과 · 발행 이력 · 메모
await go(page, 'archive');
await page.locator('.th[data-open="a1"]').click(); await idle(page); await page.waitForTimeout(2400); await shot(page, 'b5-12-archive-a1');
await page.locator('#memo').fill('4월 A구역 — 6월 재발행 전 검수'); await page.waitForTimeout(600);
await page.locator('#side-body').evaluate((e) => { e.scrollTop = e.scrollHeight; }); await page.waitForTimeout(300); await shot(page, 'b5-13-archive-memo');
// 14 아카이브 — 여수 벡터 선택
await page.locator('.th[data-open="a5"]').click(); await idle(page); await page.waitForTimeout(2000); await shot(page, 'b5-14-archive-a5');
await page.context().close();
// 15 1920 — 완료 도엽 선택
const wide = await open({ width: 1920, height: 1080 });
await go(wide, 'manage');
await wide.locator('.th[data-open="d4"]').click(); await idle(wide); await wide.waitForTimeout(2400);
await shot(wide, 'b5-15-1920');
await wide.context().close();
console.log('errors', errs);
await browser.close();
