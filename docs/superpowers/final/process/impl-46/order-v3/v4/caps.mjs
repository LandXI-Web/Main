import { open, shot, text, APP } from './cap.mjs';
const J1 = 'job_01M61671QMEHZZWM8YF6VHA7J0';
const { browser, page } = await open();
// M4
await page.goto(APP + '/landxi/v3/lx-map/?change=' + J1, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(16000);
await shot(page, 'M4');
// H1 · H5 · M5 목록
await page.goto(APP + '/landxi/v3/lx-map/?project=prj_b79e0f389f', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(12000);
const t = await text(page); console.log(t.slice(t.indexOf('지도 서비스\n접기'), t.indexOf('바탕')));
await shot(page, 'H1'); await shot(page, 'H5');
// 보고서
await page.goto(APP + '/landxi/v3/change-report/?job=' + J1, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(14000);
await shot(page, 'H3');
// 분석 서비스 갤러리 전 쪽(이지목 · 점유의심 카드 없음)
await page.goto(APP + '/landxi/v3/lx-analyze/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(7000);
const names = [];
for (let p = 1; p <= 4; p++) {
  const t2 = await text(page);
  names.push(...t2.split('\n').filter((l) => /분석서비스|서비스$/.test(l) && l.length < 40));
  await shot(page, 'U1-gallery-p' + p);
  const nx = page.getByRole('button', { name: '›' }); if (await nx.count()) await nx.first().click().catch(() => {}); await page.waitForTimeout(1500);
}
console.log([...new Set(names)]);
await browser.close();
