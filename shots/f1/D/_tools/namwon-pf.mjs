// 남원 부트 미리 받기 계측 — 칩 n/m 진행을 250 ms 간격으로 · node shots/f1/D/_tools/namwon-pf.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); });
const p = await ctx.newPage(); const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
let t0; const hosts = {}; p.on('requestfinished', (r) => { const h = new URL(r.url()).host; const x = (hosts[h] ||= { n: 0, last: 0 }); x.n++; x.last = +((Date.now() - t0) / 1000).toFixed(1); });
t0 = Date.now();
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&locale=en&from=namwon');
const log = [];
for (let i = 0; i < 240; i++) { const s = await p.evaluate(() => ({ pf: document.getElementById('pf').hidden ? '' : document.getElementById('pf').textContent, lx: document.documentElement.dataset.lx, w: window.__f1dWarm })); log.push(((Date.now() - t0) / 1000).toFixed(1) + ' ' + s.lx + ' ' + s.pf); if (s.w) { log.push(JSON.stringify(s.w)); break; } await p.waitForTimeout(250); }
console.log(log.filter((_, i) => i % 4 === 0 || i === log.length - 1).join('\n')); console.log(hosts, errs);
await b.close();
