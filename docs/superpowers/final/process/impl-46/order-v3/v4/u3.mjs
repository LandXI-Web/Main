import { open, shot, text, APP } from './cap.mjs';
const JOB = process.argv[2]; const FID = process.argv[3] || 'c0002';
const { browser, page } = await open();
const go = async () => { await page.goto(APP + `/landxi/v3/change-field/?job=${JOB}`, { waitUntil: 'domcontentloaded' }); await page.getByText('구역선 안', { exact: true }).waitFor({ timeout: 60000 }); await page.getByText('구역선 안', { exact: true }).click(); await page.waitForTimeout(2000); await page.locator('.cf-list li', { hasText: FID }).first().click(); await page.locator('.cf-detail button', { hasText: '판정 저장' }).waitFor({ timeout: 30000 }); await page.waitForTimeout(2500); };
await go();
console.log('시작 상태', (await text(page, '.cf-detail')).split(String.fromCharCode(10)).slice(-12).join(' | '));
const pick = async (name) => { await page.locator('.cf-detail button', { hasText: new RegExp('^' + name + '$') }).click(); await page.waitForTimeout(500); await page.locator('.cf-detail button', { hasText: '판정 저장' }).click(); await page.waitForTimeout(3500); };
await pick('현장확인');
await page.locator('.cf-detail').evaluate((e) => e.scrollTo?.(0, 0));
await shot(page, 'U3-before');           // 변경 전(현장확인 상태)
console.log('after 현장확인:', (await text(page, '.cf-detail')).split(String.fromCharCode(10)).slice(-10).join(' | '));
await pick('불법');
await shot(page, 'U3-after');
console.log('after 불법:', (await text(page, '.cf-detail')).split(String.fromCharCode(10)).slice(-14).join(' | '));
await page.locator('.cf-detail').getByText('판정 이력').scrollIntoViewIfNeeded().catch(() => {});
await shot(page, 'H2-history');
console.log('stats', (await text(page, '.cf-list')).split(String.fromCharCode(10)).slice(0, 14).join(' | '));
await browser.close();
