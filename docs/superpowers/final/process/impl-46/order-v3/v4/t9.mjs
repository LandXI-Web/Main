import { open, shot, text, APP } from './cap.mjs';
const JOB = process.argv[2];
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/change-field/?job=' + JOB, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(12000);
await page.getByText('구역선 안', { exact: true }).click(); await page.waitForTimeout(2500);
console.log((await text(page, '.cf-list')).slice(0, 1500));
const items = page.locator('.cf-list .cf-it, .cf-list li, .cf-list [data-id]');
console.log('items', await items.count());
await shot(page, 'explore-field3');
if (await items.count()) { await items.first().click(); await page.waitForTimeout(4000); console.log((await text(page, '.cf-detail')).slice(0, 1500)); console.log(await page.locator('.cf-detail button').evaluateAll((a) => a.map((x) => x.textContent.trim()))); await shot(page, 'explore-field4'); }
await browser.close();
