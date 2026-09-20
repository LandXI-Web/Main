// 데이터 관리 B5 — 단계 현황판(선택 없음) × 4 · 선택 상세 × 4(‹ 현황) · 쪽당 8/16 + 페이저 · 완료 위치+성과 / 데이터 테이블 · 발행 실패 · 아카이브(사용 현황·발행 이력·메모) · 1920.
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
// 01 업로드 — 선택 없음 = 진행 현황판(이름 · 상태 · 막대 % · 크기 · 잔여) + 디스크 kv
await go(page, 'upload'); await shot(page, 'b5-01-upload-board');
// 02 업로드 — 진행중 선택 → 상세(‹ 현황 · 그림 리빌 · dl · 액션)
await page.locator('.th[data-open="u1"]').click(); await page.waitForTimeout(600); await shot(page, 'b5-02-upload-selected');
// 03 완료 — 선택 없음 = 완료 현황판(이름 · 형식 · 크기 · 업로드 · 아카이빙 · 위치) + 총 용량 · 형식별 · 쪽당 8 · `1 / 1`
await go(page, 'manage'); await shot(page, 'b5-03-manage-board');
// 04 쪽당 16 (4 × 4) — 타일이 그리드 ÷ 4 로 준다(건수 8 이어도)
await page.locator('#pp button[data-pp="16"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-04-pp16');
// 05 쪽당 4 (2 × 2) — 페이저 `1 / 2` → 다음 쪽
await page.locator('#pp button[data-pp="4"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-05-pp4-page1');
await page.locator('#pg-next').click(); await page.waitForTimeout(900); await shot(page, 'b5-06-pp4-page2');
await page.locator('#pp button[data-pp="8"]').click(); await page.waitForTimeout(400);
// 07 완료 — 현황판 줄(d4) 클릭 → 실제 위치(V-World + 도엽 + 브래킷) + 성과(청록 결과 폴리곤 + 건수) · ‹ 현황
await page.locator('#side .pb[data-id="d4"]').click(); await idle(page); await page.waitForTimeout(2400); await shot(page, 'b5-07-manage-spatial');
// 08 완료 — 위치 없는 XLSX → 데이터 테이블 속성(속성명 / 유형 / 예시) + 첫 행 미리보기
await page.locator('.th[data-open="d3"]').click(); await page.waitForTimeout(700); await shot(page, 'b5-08-manage-table-xlsx');
// 09 완료 — SHP(결과 GeoJSON) → 실루엣 + 실값 예시
await page.locator('.th[data-open="d7"]').click(); await page.waitForTimeout(1200); await shot(page, 'b5-09-manage-table-shp');
// 10 발행 폼 — 우 패널 안
await page.locator('.th[data-open="d4"]').click(); await page.waitForTimeout(600);
await page.locator('#side .act[data-dn="d4"]').click(); await page.waitForTimeout(500); await shot(page, 'b5-10-pubform');
// 11 발행중 — 선택 없음 = 발행 현황판(이름 · 4눈금 · 상태 · 진행률 · 크기, 실패 warn) + 진행/실패 kv
await go(page, 'publishing'); await shot(page, 'b5-11-publishing-board');
// 12 발행중 — 실패 선택(‹ 현황 · 사유 원문 · 좌표계 지정)
await page.locator('#side .pb[data-id="p2"]').click(); await page.waitForTimeout(900); await shot(page, 'b5-12-publishing-fail');
// 13 아카이브 — 선택 없음 = 보관 현황판(이름 · 유형 · 표시 · 발행 v · 크기) + 표시/숨김 · 총 용량 · 유형별
await go(page, 'archive'); await shot(page, 'b5-13-archive-board');
// 14 아카이브 — 정사영상 선택 → 판 레이어 + 사용 현황 · 성과 · 발행 이력 · 메모
await page.locator('.th[data-open="a1"]').click(); await idle(page); await page.waitForTimeout(2400); await shot(page, 'b5-14-archive-a1');
await page.locator('#memo').fill('4월 A구역 — 6월 재발행 전 검수'); await page.waitForTimeout(600);
await page.locator('#side-body').evaluate((e) => { e.scrollTop = e.scrollHeight; }); await page.waitForTimeout(300); await shot(page, 'b5-15-archive-memo');
// 16 아카이브 — ‹ 현황 으로 돌아온 현황판(메모 뒤)
await page.locator('#side-back').click(); await page.waitForTimeout(500); await shot(page, 'b5-16-archive-back');
await page.context().close();
// 17 1920 — 완료 현황판 · 18 1920 — 완료 도엽 선택
const wide = await open({ width: 1920, height: 1080 });
await go(wide, 'manage'); await shot(wide, 'b5-17-1920-board');
await wide.locator('.th[data-open="d4"]').click(); await idle(wide); await wide.waitForTimeout(2400);
await shot(wide, 'b5-18-1920');
await wide.context().close();
console.log('errors', errs);
await browser.close();
