// 빠른 확인: off 부팅 → 하강 중 250ms 간격 스크린샷 · EXT_LOG · VIIRS 받침 해제 시각 · 콘솔 오류
import { chromium } from 'playwright';
const OUT = process.argv[2] || 'shots/f1/A/raw/probe';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.removeItem('lx_api_session'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && !/READ-usage/.test(m.text()))) errs.push(m.type() + ' ' + m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('pe ' + e.message));
await p.goto('http://localhost:4173/landxi/xi/index.html');
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 60000 });
await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'korea'), null, { timeout: 60000 });
let i = 0; const t0 = Date.now();
while (Date.now() - t0 < 2600) { await p.screenshot({ path: `${OUT}/k${String(i++).padStart(2, '0')}.jpg`, quality: 60 }); }
await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'arrived'), null, { timeout: 60000 });
console.log(JSON.stringify(await p.evaluate(() => ({ pw: window.__xi.PREWARM_LOG, wait: window.__xi.prewarmWait, sw: window.__xi.shield, ext: window.__xi.EXT_LOG, hold: window.__xi.A.__holdLog, chips: window.__xi.hud.chips.map((c) => c.text), canvas: document.documentElement.dataset.canvas }))));
console.log('shots', i, 'errs', errs);
await b.close();
