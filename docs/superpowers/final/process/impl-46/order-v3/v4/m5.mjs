import { open, shot, text, APP } from './cap.mjs';
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/lx-map/?project=prj_b79e0f389f', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(12000);
const t = await text(page); console.log(t.slice(t.indexOf('지도 서비스\n접기'), t.indexOf('바탕')).slice(0, 1500));
await shot(page, 'M5-list');
await browser.close();
