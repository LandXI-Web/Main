/* 메뉴 바꿈 시간 — 같은 네 화면을 ① 한 페이지(메뉴 누름) ② 페이지를 새로 여는 길(주소로 이동 — 예전 방식과 같은 길)로 열어
   누른 때부터 (가) 새 화면 첫 그림 (나) 그 화면 자료까지 그려짐(화면이 스스로 다는 표시)을 잰다. 바깥 주소 · 로그인 폼 test@.
   node timing.mjs [--n 5] */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../../..');
const { launch, login, arg } = await import(pathToFileURL(path.join(ROOT, 'tools/check/common.mjs')).href);
const N = +arg('--n', 5);
const URLS = { home: '/landxi/v3/lx-console/', projects: '/landxi/v3/lx-project/', analyze: '/landxi/v3/lx-analyze/', mapsvc: '/landxi/v3/lx-map/' };
/* 그 화면이 다 그려졌다는 표시(화면 코드가 원래 다는 것) */
const READY = {
  home: () => document.documentElement.dataset.consoleReady === '1',
  projects: () => document.documentElement.dataset.projects === '1',
  analyze: () => document.body.dataset.ready === '1' && !!document.querySelector('.la-ac'),
  mapsvc: () => document.body.dataset.ready === '1' && document.documentElement.dataset.mapReady === '1',
};
const FIRST = { home: '.ld-grid', projects: '.lxp-page', analyze: '.la-page', mapsvc: '.lm-page' };
const out = { at: new Date().toISOString(), n: N, spa: [], full: [] };
const browser = await launch();
const { ctx, page } = await login(browser, 'app', { width: 1440, height: 900 });
await page.waitForFunction(() => window.__spa?.cur, null, { timeout: 30000 });
await page.waitForTimeout(4000);                          // 첫 화면 · 미리 받기
const ids = ['projects', 'analyze', 'mapsvc', 'home'];
for (let k = 0; k < N; k++) {
  for (const id of ids) {
    const t0 = Date.now();
    await page.locator(`.k-rail [data-id="${id}"]`).first().click();
    await page.waitForFunction((s) => !!document.querySelector(s), FIRST[id], { timeout: 30000, polling: 'raf' });
    const t1 = Date.now();
    await page.waitForFunction(`(${READY[id]})()`, null, { timeout: 60000, polling: 50 });
    out.spa.push({ id, first: t1 - t0, ready: Date.now() - t0 });
    await page.waitForTimeout(800);
  }
}
for (let k = 0; k < N; k++) {
  for (const id of ids) {
    const t0 = Date.now();
    await page.goto(new URL(URLS[id], page.url()).href, { waitUntil: 'commit' });
    await page.waitForFunction((s) => !!document.querySelector(s), FIRST[id], { timeout: 30000, polling: 'raf' });
    const t1 = Date.now();
    await page.waitForFunction(`(${READY[id]})()`, null, { timeout: 60000, polling: 50 });
    out.full.push({ id, first: t1 - t0, ready: Date.now() - t0 });
    await page.waitForTimeout(800);
  }
}
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
out.summary = {};
for (const how of ['spa', 'full']) for (const id of ids) {
  const r = out[how].filter((x) => x.id === id);
  out.summary[`${how}.${id}`] = { first: med(r.map((x) => x.first)), firstMax: Math.max(...r.map((x) => x.first)), ready: med(r.map((x) => x.ready)), readyMax: Math.max(...r.map((x) => x.ready)) };
}
for (const how of ['spa', 'full']) out.summary[how] = { first: med(out[how].map((x) => x.first)), ready: med(out[how].map((x) => x.ready)), readyMax: Math.max(...out[how].map((x) => x.ready)) };
fs.writeFileSync(path.join(HERE, 'timing.json'), JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.summary, null, 1));
await ctx.close(); await browser.close();
