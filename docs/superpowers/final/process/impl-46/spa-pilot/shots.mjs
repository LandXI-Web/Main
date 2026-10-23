/* 같은 모양인가 · 겹침 0 인가 — 네 화면을 ① 메뉴로 바꿔 연 것(한 페이지) ② 주소로 새로 연 것을 PC 1440 · 휴대폰 390 으로 찍고,
   겹침 검사기(kit/lint/overlap.mjs)와 같은 재는 식으로 겹침을 잰다. 그림은 shots/(공개 저장소에 올리지 않음) · 기록 shots.json
   node shots.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { launch, login } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const SH = path.join(HERE, 'shots'); fs.mkdirSync(SH, { recursive: true });
const IDS = ['home', 'projects', 'analyze', 'mapsvc'];
const URLS = { home: '/landxi/v3/lx-console/', projects: '/landxi/v3/lx-project/', analyze: '/landxi/v3/lx-analyze/', mapsvc: '/landxi/v3/lx-map/' };
const out = { at: new Date().toISOString(), rows: [], errors: [] };
const measure = (page) => page.evaluate(async () => { const m = await import('/landxi/v3/kit/lint/overlap.mjs'); const r = new Function('return ' + m.MEASURE)(); return { n: (r?.overlaps || []).length, list: (r?.overlaps || []).slice(0, 6) }; });
const settle = (page, id) => page.waitForTimeout(id === 'mapsvc' ? 5000 : 3000);
const browser = await launch();
for (const [w, hgt, tag] of [[1440, 900, 'pc'], [390, 844, 'mo']]) {
  const { ctx, page } = await login(browser, 'app', { width: w, height: hgt });
  page.on('pageerror', (e) => out.errors.push({ tag, at: page.url(), text: e.message }));
  page.on('console', (m) => { if (m.type() === 'error') out.errors.push({ tag, at: page.url(), text: m.text().slice(0, 300) }); });
  await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  /* ① 메뉴로(한 페이지) — 지도 서비스부터 돌아 대시보드로 */
  for (const id of ['projects', 'analyze', 'mapsvc', 'home']) {
    const href = URLS[id];
    if (tag === 'pc') await page.locator(`.k-rail [data-id="${id}"]`).first().click();
    else await page.evaluate((u) => window.__spa.go(u), href);              // 휴대폰 — 아래 메뉴 줄에 없는 칸(지도 서비스)도 같은 길로
    await page.waitForFunction((x) => window.__spa?.cur === x, id, { timeout: 30000 });
    await settle(page, id);
    const f = `spa-${tag}-${id}.png`; await page.screenshot({ path: path.join(SH, f) });
    out.rows.push({ tag, how: 'menu', id, shot: f, overlap: await measure(page) });
  }
  /* ② 주소로 새로 열기 */
  for (const id of IDS) {
    await page.goto(new URL(URLS[id], page.url()).href);
    await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 });
    await settle(page, id);
    const f = `full-${tag}-${id}.png`; await page.screenshot({ path: path.join(SH, f) });
    out.rows.push({ tag, how: 'load', id, shot: f, overlap: await measure(page) });
  }
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(HERE, 'shots.json'), JSON.stringify(out, null, 1));
for (const r of out.rows) console.log(r.tag, r.how, r.id, 'overlap', r.overlap?.n);
console.log('errors', out.errors.length, JSON.stringify(out.errors.slice(0, 8)));
