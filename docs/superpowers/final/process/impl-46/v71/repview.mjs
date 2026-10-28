/* ChatGEO 1번 답의 '보고서 보기'(kit/report-view.js) 화면 — 가로 1600 px 로 위에서 아래까지 쪽마다 찍기 */
import { open, APP } from './cap.mjs';
const { browser, page } = await open('kec-land@lx.or.kr', 'ROADLAND_PW', { dpr: 1 });
await page.setViewportSize({ width: 1600, height: 1000 });
await page.goto(APP + '/landxi/v3/lx-map/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000);
await page.evaluate(async () => { const m = await import('/landxi/v3/kit/report-view.js'); await m.openReport({ href: '/api/v1/agent/runs/run_261029082422c1f0a0/files/report.json' }); });
await page.waitForTimeout(6000);
const sc = await page.evaluate(() => { const el = document.querySelector('.rv-in') || document.querySelector('.rv'); return el ? { h: el.scrollHeight, c: el.clientHeight } : null; });
console.log(sc);
let y = 0, i = 1;
while (true) {
  await page.evaluate((y) => { const el = document.querySelector('.rv-in') || document.querySelector('.rv'); (el.scrollHeight > el.clientHeight ? el : document.querySelector('.rv')).scrollTop = y; }, y);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `E:/도로공사/deck_part3b/chatgeo/files/turn1_report_view_p${i}.png` });
  y += 940; i++;
  if (!sc || y >= sc.h || i > 8) break;
}
console.log('pages', i - 1);
await browser.close();
