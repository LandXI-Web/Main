// 장면별 스틸 — node shots/f1/D/_tools/scenes.mjs
import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => { if (m.type() !== 'warning') logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
p.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url().slice(0, 160)); });
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx' + (process.argv[2] || ''));
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
const O = 'shots/f1/D/_tools/';
const steps = (process.argv[3] || 'ys').split(',');
for (const s of steps) {
  if (s === 'ys') { await p.evaluate(() => window.__f1d.go('ysykata')); await p.waitForTimeout(6000); await p.screenshot({ path: O + 's-ys.png' }); }
  if (s === 'play') { await p.evaluate(() => window.__f1d.scenes.ys.play()); await p.waitForTimeout(6500); await p.screenshot({ path: O + 's-ys-play.png' }); }
  if (s === 'run') { await p.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); }); await p.waitForTimeout(12000); await p.screenshot({ path: O + 's-ys-run.png' }); }
  if (s === 'sk') { await p.evaluate(() => window.__f1d.go('sokuluk')); await p.waitForTimeout(4000); await p.evaluate(async () => { const k = window.__f1d.scenes.sk; k.grid(true); await k.filament(true); }); await p.waitForTimeout(2500); await p.screenshot({ path: O + 's-sk.png' }); }
  if (s === 'skb') { await p.evaluate(async () => { const f = window.__f1d; const k = f.scenes.sk; k.grid(false); await f.stage.map.easeTo({ center: [74.505, 42.872], zoom: 13.7, pitch: 45, bearing: -18, duration: 1600 }); await new Promise(r => setTimeout(r, 1700)); await k.buildings(true); await k.swipeOn(true); }); await p.waitForTimeout(5000); await p.screenshot({ path: O + 's-sk-bld.png' }); }
  if (s === 'mk') { await p.evaluate(() => window.__f1d.go('meiktila')); await p.waitForTimeout(9000); await p.screenshot({ path: O + 's-mk.png' }); }
  if (s === 'mkd') { await p.evaluate(async () => { const f = window.__f1d; f.stage.map.easeTo({ center: [95.8702, 20.8818], zoom: 16.35, duration: 1600, padding: { top: 64, right: 0, bottom: 0, left: 380 } }); await new Promise(r => setTimeout(r, 1700)); f.scenes.mk.swipeOn(55); }); await p.waitForTimeout(5000); await p.screenshot({ path: O + 's-mk-detail.png' }); }
}
logs.push(JSON.stringify(await p.evaluate(() => window.__f1d.state())).slice(0, 600));
logs.push(JSON.stringify(await p.evaluate(() => window.__f1d.perf())));
console.log(logs.join('\n'));
await b.close();
