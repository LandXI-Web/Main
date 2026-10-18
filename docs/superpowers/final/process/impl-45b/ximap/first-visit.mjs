// 첫 방문 시간(바깥 주소 · 로그인 폼) — 결과는 stdout JSON. 비밀번호는 server/.env 에서만.
// 사용: node first-visit.mjs staff|inst <횟수> [cold|flow]
//   cold = 로그인만 한 창의 세션을 빈 보관함 새 창에 넘겨 XI맵을 바로 연다(가장 나쁜 경우)
//   flow = 처음 쓰는 브라우저로 로그인 → 첫 화면(3초) → XI맵(실제 사람이 오는 길)
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const WHO = process.argv[2] || 'inst'; const RUNS = +(process.argv[3] || 2); const MODE = process.argv[4] || 'cold';
const base = WHO === 'inst' ? 'https://namwon.land-xi.dev' : 'https://app.land-xi.dev';
const who = WHO === 'inst' ? 'lxadmin@lx.or.kr#namwon' : 'test@lx.or.kr';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = [];
for (let i = 0; i < RUNS; i++) {
  // 1) 로그인만 하는 창 → 세션(localStorage)만 넘겨 받은 새 창 = 빈 캐시 첫 방문
  const c1 = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p1 = await c1.newPage();
  const tl0 = Date.now(); await frontDoor(p1, base, who); const loginMs = Date.now() - tl0; const landed = p1.url();
  let c2, p;
  if (MODE === 'flow') { await p1.waitForTimeout(3000); c2 = c1; p = p1; }
  else { const st = await c1.storageState(); await c1.close(); c2 = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState: st }); p = await c2.newPage(); }
  const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  await p.evaluate(() => performance.clearResourceTimings()).catch(() => {});
  const t0 = Date.now(); await p.goto(base + '/landxi/v3/xi-clean/', { waitUntil: 'commit', timeout: 60000 });
  await p.waitForFunction(() => document.querySelector('canvas') && document.querySelector('.k-ck-i') && !document.querySelector('.xc-load:not(.is-out)'), null, { timeout: 90000, polling: 100 }).catch(() => {});
  const ready = Date.now() - t0;
  await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const es = performance.getEntriesByType('resource'); const nav = performance.getEntriesByType('navigation')[0];
    const code = es.filter((e) => /\/landxi\/.*\.(m?js|css|json)(\?|$)/.test(e.name));
    const all = es.map((e) => ({ u: e.name.replace(/^https?:\/\/[^/]+/, "").slice(0, 90), s: Math.round(e.startTime), d: Math.round(e.duration) }));
    return { all, boot: window.__xc?.boot || null, shownMs: window.__xc?.boot?.shown, n: es.length, ncode: code.length, proto: [...new Set(es.map((e) => e.nextHopProtocol))],
      codeEnd: Math.round(Math.max(0, ...code.map((e) => e.responseEnd))), html: nav && Math.round(nav.responseEnd),
      slow: code.map((e) => ({ u: e.name.replace(/^https?:\/\/[^/]+/, '').replace(/\?v=\w+/, ''), s: Math.round(e.startTime), d: Math.round(e.duration), kb: Math.round(e.transferSize / 1024) })).sort((a, b) => a.s - b.s) }; });
  out.push({ run: i, mode: MODE, loginMs, landed, readyMs: ready, ...r, errs });
  await c2.close();
}
console.log(JSON.stringify(out, null, 1));
await browser.close();
