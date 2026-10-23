/* 고장 찾기용 짧은 탐침 — 로그인 → 한 화면 → 메뉴 하나 누르고 상태 · 콘솔을 찍는다.
   node probe.mjs [메뉴 id …] */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const ids = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const browser = await launch();
const { ctx, page } = await login(browser, 'app', { width: 1440, height: 900 });
page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text().slice(0, 400)));
page.on('pageerror', (e) => console.log('[pageerror]', e.message, e.stack?.split('\n').slice(0, 4).join(' | ')));
await page.waitForTimeout(4000);
const st = () => page.evaluate(() => ({ url: location.pathname + location.search, spa: !!window.__spa, cur: window.__spa?.cur, times: window.__spa?.times, on: window.__lxSPA?.SPA?.on, shell: !!window.__lxSPA?.SPA?.shell, main: document.querySelector('.k-main')?.children.length }));
console.log('start', JSON.stringify(await st()));
for (const id of ids) {
  await page.locator(`.k-rail [data-id="${id}"]`).first().click();
  await page.waitForTimeout(4000);
  console.log('after', id, JSON.stringify(await st()));
}
if (process.argv.includes('--shot')) await page.screenshot({ path: path.join(HERE, 'probe.png') });
await ctx.close(); await browser.close();
