// 첫 화면 시작 시간 — 바깥 주소 로그인 폼(직원 · 관리자 · 남원 기관) → 첫 화면을 3번 다시 열어 '주소 → 다 그려짐'과 시작 요청 순서(/me · openapi · /auth/tenants · /brand)를 잰다.
//   node start.mjs <phase>   → start-<phase>.json
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.env.PLAYWRIGHT_BROWSERS_PATH = 'C:/Users/User/AppData/Local/ms-playwright';
if (!process.env.LX_PW) process.env.LX_PW = (fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PHASE = process.argv[2] || 'before';
const CASES = [
  { who: 'LX 직원', base: 'https://app.land-xi.dev', login: 'test@lx.or.kr', page: '/landxi/v3/lx-console/' },
  { who: 'LX 관리자', base: 'https://admin.land-xi.dev', login: 'lxadmin@lx.or.kr', page: '/landxi/v3/ops-core/' },
  { who: '기관(남원)', base: 'https://namwon.land-xi.dev', login: 'lxadmin@lx.or.kr', tenant: 'namwon', page: '/landxi/v3/gov-select/?list=1' },
];
const START = /\/api\/v1\/(me|openapi\.json|auth\/tenants|brand\/|auth\/session)/;
const browser = await chromium.launch();
const out = { phase: PHASE, at: new Date().toISOString(), cases: [] };
for (const c of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  await frontDoor(p, c.base, c.login, { password: process.env.LX_PW, tenant: c.tenant });
  await p.waitForTimeout(2500);
  const runs = [];
  for (let i = 0; i < 4; i++) {
    const live = new Map(); const seq = []; let t0 = 0;
    const isApi = (u) => u.includes('/api/v1/') && !/stream|events|sse/.test(u);
    const onReq = (r) => { if (isApi(r.url())) live.set(r, Date.now()); };
    const onEnd = (r) => { if (!live.has(r)) return; const s = live.get(r); live.delete(r); if (START.test(r.url())) seq.push({ u: r.url().replace(/^.*\/api\/v1/, '').slice(0, 60), from: s - t0, ms: Date.now() - s }); };
    p.on('request', onReq); p.on('requestfinished', onEnd); p.on('requestfailed', onEnd);
    t0 = Date.now();
    await p.goto(c.base + c.page, { waitUntil: 'domcontentloaded', timeout: 45000 });
    let stable = null, done = null;
    while (Date.now() - t0 < 30000) {
      const busy = await p.evaluate(() => { const ld = document.querySelector('.k-ld'); return !!(ld && !ld.hidden && ld.getClientRects().length) || [...document.querySelectorAll('body *')].some((e) => e.childElementCount === 0 && /불러오는 중/.test(e.textContent || '') && e.getClientRects().length && !e.closest('.k-ld')); }).catch(() => true);
      const now = Date.now();
      if (!busy && live.size === 0) { stable ??= now; if (now - stable >= 600) { done = stable - t0; break; } } else stable = null;
      await p.waitForTimeout(100);
    }
    p.off('request', onReq); p.off('requestfinished', onEnd); p.off('requestfailed', onEnd);
    seq.sort((a, b) => a.from - b.from);
    const gateEnd = Math.max(0, ...seq.filter((x) => !/auth\/session/.test(x.u)).map((x) => x.from + x.ms));
    runs.push({ done, gateEnd, seq, at: p.url().replace(c.base, '') });
    console.log(c.who, i, 'done', done, 'startEnd', gateEnd, seq.map((x) => `${x.u}@${x.from}+${x.ms}`).join(' | '));
  }
  const ok = runs.slice(1);
  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  out.cases.push({ who: c.who, page: c.page, done_median: med(ok.map((r) => r.done ?? 30000)), start_median: med(ok.map((r) => r.gateEnd)), runs, console_errors: errs });
  await ctx.close();
}
fs.writeFileSync(path.join(HERE, `start-${PHASE}.json`), JSON.stringify(out, null, 1));
for (const c of out.cases) console.log('==', c.who, 'done(중앙값)', c.done_median, '시작 요청 끝(중앙값)', c.start_median, 'errors', c.console_errors.length);
await browser.close();
