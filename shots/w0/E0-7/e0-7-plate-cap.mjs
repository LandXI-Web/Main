import { chromium } from '@playwright/test';

const BASE = 'http://localhost:4173/landxi/';
const OUT = 'E:/Land-XI 플랫폼/01. 디자인/shots/w0/E0-7';

async function bootAs(page, url, role = 'staff') {
  await page.addInitScript((r) => {
    sessionStorage.setItem('lx_e2e_boot', '1');
    localStorage.setItem('lx_logged_in', '1');
    localStorage.setItem('lx_role', r);
    localStorage.removeItem('lx_tenant_session');
  }, role);
  await page.goto(url);
  await page.waitForFunction(() => document.documentElement.dataset.shell === 'ready');
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await bootAs(page, BASE + 'proto/dataset.html?tab=manage', 'staff');
await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready', null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.locator('.th[data-open="d4"]').click();
await page.waitForTimeout(400);
const capText = await page.locator('#plate-cap').textContent();
console.log('plate-cap textContent:', capText);
const box = await page.locator('#plate-cap').boundingBox();
console.log('plate-cap boundingBox:', box);
const wrapBox = await page.locator('#plate-wrap').boundingBox();
console.log('plate-wrap boundingBox:', wrapBox);
// scrollHeight vs clientHeight of the caption element to verify no visual clip beyond the 2 allowed lines
const overflowCheck = await page.locator('#plate-cap').evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight, lineClamp: getComputedStyle(el).webkitLineClamp }));
console.log('overflowCheck:', overflowCheck);
await page.waitForTimeout(600); // let the plate/map settle for the screenshot
await page.locator('#plate-wrap').screenshot({ path: `${OUT}/e0-7-plate-cap-d4-1440.png` });
await page.screenshot({ path: `${OUT}/e0-7-plate-cap-d4-full-1440.png` });
await browser.close();
