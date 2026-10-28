import { open, shot, text, APP } from './cap.mjs';
const JOB = process.argv[2];
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/lx-map/?change=' + JOB, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(15000);
console.log((await text(page)).slice(0, 3500));
console.log(await page.locator('button, a, select, input').evaluateAll((a) => a.filter((x) => x.offsetParent).map((x) => x.tagName + ':' + (x.getAttribute('aria-label') || x.textContent || '').trim().slice(0, 30))).then((r) => r.slice(0, 80)));
await shot(page, 'M3-result');
await browser.close();
