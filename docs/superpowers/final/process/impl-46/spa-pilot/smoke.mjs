/* 한 페이지 방식 첫 확인 — 바깥 주소 · 로그인 폼(test@) · 네 화면 메뉴 바꾸기 · 콘솔 오류 · 뒤로 · 앞으로 · 새로 고침 · 바로가기 주소.
   node docs/superpowers/final/process/impl-46/spa-pilot/smoke.mjs [--n 50] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { launch, login, arg } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);

const N = +arg('--n', 8);
const out = { at: new Date().toISOString(), errors: [], steps: [], times: [], leak: [] };
const browser = await launch();
const { ctx, page } = await login(browser, 'app', { width: 1440, height: 900 });
page.on('console', (m) => { if (m.type() === 'error') out.errors.push({ at: page.url(), text: m.text().slice(0, 300) }); });
page.on('pageerror', (e) => out.errors.push({ at: page.url(), text: 'pageerror ' + String(e.message).slice(0, 300) }));
const say = (s) => { console.log(s); out.steps.push(s); };
const nav0 = await page.evaluate(() => performance.getEntriesByType('navigation').length);
const spa = () => page.evaluate(() => ({ cur: window.__spa?.cur, n: window.__spa?.times?.length, last: window.__spa?.times?.at(-1), url: location.pathname + location.search, docs: performance.timeOrigin }));
await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 });
say('첫 화면 ' + JSON.stringify(await spa()));
const origin0 = (await spa()).docs;
const pick = async (id) => {
  const t0 = Date.now();
  await page.locator(`.k-rail [data-id="${id}"]`).first().click();
  await page.waitForFunction((x) => window.__spa?.cur === x && window.__spa.times.at(-1)?.to === x && window.__spa.times.at(-1)?.paint != null, id, { timeout: 30000 });
  const r = await spa();
  return { id, wall: Date.now() - t0, paint: r.last.paint, done: r.last.done, url: r.url };
};
const order = ['projects', 'analyze', 'mapsvc', 'home'];
for (let k = 0; k < N; k++) {
  for (const id of order) {
    const t = await pick(id);
    await page.waitForTimeout(id === 'mapsvc' ? 1500 : 600);
    const d = await page.evaluate(() => window.__spa.times.at(-1).done);
    out.times.push({ ...t, done: d });
  }
  out.leak.push(await page.evaluate(() => window.__spa.leak()));
  say(`바퀴 ${k + 1} ` + JSON.stringify(out.leak.at(-1)));
}
say('같은 문서(새로 열림 없음): ' + ((await spa()).docs === origin0));
/* 뒤로 · 앞으로 */
await page.goBack(); await page.waitForTimeout(800); say('뒤로 → ' + JSON.stringify(await spa()));
await page.goBack(); await page.waitForTimeout(800); say('뒤로 → ' + JSON.stringify(await spa()));
await page.goForward(); await page.waitForTimeout(800); say('앞으로 → ' + JSON.stringify(await spa()));
/* 새로 고침 */
await page.reload(); await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 }); say('새로 고침 → ' + JSON.stringify(await spa()));
/* 바로가기 주소 */
for (const u of ['/landxi/v3/lx-analyze/?card=card-farm', '/landxi/v3/lx-project/?scope=all', '/landxi/v3/lx-map/']) {
  await page.goto(new URL(u, page.url()).href); await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 }).catch(() => null);
  say('바로가기 ' + u + ' → ' + JSON.stringify(await spa()));
}
fs.writeFileSync(path.join(HERE, 'smoke.json'), JSON.stringify(out, null, 1));
console.log('errors', out.errors.length, out.errors.slice(0, 10));
await ctx.close(); await browser.close();
