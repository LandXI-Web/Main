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
await bootAs(page, BASE + 'proto/dataset.html?tab=archive', 'staff');
await page.waitForFunction(() => document.documentElement.dataset.ds === 'ready', null, { timeout: 20000 });
await page.waitForTimeout(700);
await page.locator('.th[data-open="a1"]').click();
await page.waitForTimeout(500);
console.log('a1 plate-cap:', await page.locator('#plate-cap').textContent());
const info = await page.locator('#plate-cap').evaluate((el) => ({ scrollHeight: el.scrollHeight, clientHeight: el.clientHeight }));
console.log('a1 overflow:', info);
await page.locator('#plate-wrap').screenshot({ path: `${OUT}/e0-7-plate-cap-a1-1440.png` });
await browser.close();
