/* XI맵 첫 열기 시간 — 바깥 주소 · 로그인 폼(세션 주입 없음). 로그인 직후 처음 · 다시 열 때(같은 브라우저) 각각.
   잰 값 = 주소를 연 순간 → 로딩 판이 걷힘(window.__xc.boot.shown). 요청 수 · 304 수 · 보관에서 꺼낸 수도 센다. */
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');   // 저장소 뿌리(docs/superpowers/final/process/impl-20/a 에서 여섯 단계 위)
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.LX_PW) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.LX_PW = m[1]; }
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const APP = process.argv[2] || 'https://app.land-xi.dev';
const N = Number(process.argv[3] || 2);
const out = { at: new Date().toISOString(), app: APP, runs: [] };
const browser = await chromium.launch({ channel: 'chrome' });
for (let k = 0; k < N; k++) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  p.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
  await frontDoor(p, APP, 'test@lx.or.kr', 'app');
  await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  await p.waitForTimeout(1500);
  const one = async (label) => {
    const st = { req: 0, r304: 0, cached: 0, landxi: 0 };
    const onRes = (r) => { const u = r.url(); if (!/\/landxi\//.test(u)) return; st.landxi++; if (r.status() === 304) st.r304++; if (r.fromServiceWorker?.()) st.cached++; };
    const onReq = (r) => { if (/\/landxi\//.test(r.url())) st.req++; };
    const onFin = (r) => { r.sizes?.().then(() => {}).catch(() => {}); };
    p.on('response', onRes); p.on('request', onReq); p.on('requestfinished', onFin);
    const t0 = Date.now();
    await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.boot?.shown, null, { timeout: 60000, polling: 50 });
    const ms = Date.now() - t0;
    await p.waitForTimeout(2500);
    const disk = await p.evaluate(() => performance.getEntriesByType('resource').filter((e) => /\/landxi\//.test(e.name)).reduce((a, e) => { a.n++; if (e.transferSize === 0 && e.decodedBodySize > 0) a.mem++; else if (e.transferSize > 0 && e.transferSize < 400) a.small++; return a; }, { n: 0, mem: 0, small: 0 }));
    p.off('response', onRes); p.off('request', onReq); p.off('requestfinished', onFin);
    return { label, ms, boot: await p.evaluate(() => window.__xc.boot), landxi_requests: st.req, r304: st.r304, from_cache: disk.mem, revalidated_small: disk.small };
  };
  const a = await one('로그인 직후 처음');
  await p.goto(APP + '/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  const b = await one('다시 열 때');
  out.runs.push({ k, first: a, again: b, errors: errs });
  await ctx.close();
}
await browser.close();
const f = process.argv[4];
if (f) fs.writeFileSync(f, JSON.stringify(out, null, 1));
console.log(JSON.stringify(out.runs.map((r) => ({ first: [r.first.ms, r.first.landxi_requests, r.first.r304, r.first.from_cache], again: [r.again.ms, r.again.landxi_requests, r.again.r304, r.again.from_cache], errors: r.errors.length }))));
