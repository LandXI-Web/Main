import { open, shot, text, APP } from './cap.mjs';
const Q = process.argv[2]; const TAG = process.argv[3] || 'chat'; const WAIT = +(process.argv[4] || 200);
const PROJ = process.argv[5] || 'prj_b79e0f389f'; const CLICK = process.argv[6] || '';
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/lx-map/?project=' + PROJ, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(9000);
await page.mouse.click(1895, 1027); await page.waitForTimeout(2000);
const inp = page.locator('#k-chat input.k-ck-i'); await inp.fill(Q); await inp.press('Enter');
if (CLICK) { await page.waitForTimeout(6000); await shot(page, TAG + '-ask'); await page.locator('#k-chat button', { hasText: CLICK }).first().click(); }
const t0 = Date.now(); let last = ''; let shotted = false;
while (Date.now() - t0 < WAIT * 1000) {
  await page.waitForTimeout(5000);
  const t = (await text(page, '#k-chat')).split(String.fromCharCode(10)).slice(-14).join(' / ');
  if (t !== last) { console.log(Math.round((Date.now() - t0) / 1000) + 's', t.slice(0, 700)); last = t; if (!shotted && Date.now() - t0 > 20000) { await shot(page, TAG + '-mid'); shotted = true; } }
  if (Date.now() - t0 > 25000 && !/분석 중|대기 중/.test(t)) break;
}
await shot(page, TAG + '-end');
console.log('url', page.url());
await browser.close();
