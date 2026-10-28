import { open, shot, text, APP } from './cap.mjs';
const { browser, page } = await open();
for (const [n, u] of [['console', '/landxi/v3/lx-console/'], ['project', '/landxi/v3/lx-project/'], ['inbox', '/landxi/v3/lx-inbox/']]) {
  await page.goto(APP + u, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(8000);
  const t = await text(page); const i = t.indexOf('변화 탐지가');
  console.log(n, i >= 0 ? t.slice(Math.max(0, i - 120), i + 120).replace(/\n/g, ' | ') : 'NONE');
  await shot(page, 'M6-' + n);
}
await browser.close();
