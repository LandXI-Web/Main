import { open, shot, text, APP } from './cap.mjs';
const CREATE = process.argv[2] === 'create';
const { browser, page } = await open();
await page.goto(APP + '/landxi/v3/lx-project/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /새 프로젝트/ }).first().click();
await page.waitForTimeout(800);
await page.locator('.lxp-new input').first().fill('안성 서울세종선 토지 모니터링');
await page.locator('.lxp-reg-tg').click();
await page.locator('.lxp-vt[data-k=line]').click();
await page.locator('input.lxp-file[aria-label="구역선 파일"]').setInputFiles('E:/도로공사/deck_capability/input/안성_서울세종선_토지마스터48.gpkg');
await page.locator('.lxp-rng-s').waitFor({ state: 'visible', timeout: 60000 });
await page.waitForFunction(() => !/만드는 중/.test(document.querySelector('.lxp-rng-s')?.textContent || ''), null, { timeout: 90000 });
await page.waitForTimeout(1500);
console.log('range:', await page.locator('.lxp-rng-s').innerText());
console.log('years:', await page.locator('.lxp-yrs').innerText());
console.log('go disabled:', await page.locator('.lxp-act .t-btn').first().isDisabled());
await shot(page, CREATE ? 'M1-register' : 'explore-m1');
if (CREATE) {
  await page.locator('.lxp-act .t-btn').first().click();
  await page.waitForURL(/lx-map/, { timeout: 60000 });
  await page.waitForTimeout(12000);
  console.log('url', page.url());
  await shot(page, 'M1-map');
}
await browser.close();
