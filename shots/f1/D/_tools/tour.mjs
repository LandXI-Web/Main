import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => { if (m.type() !== 'warning') logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)); });
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
p.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url().slice(0, 160)); });
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=lx&from=namwon&tour=1' + (process.argv[2] || ''));
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
const t0 = Date.now(); let i = 0;
while (Date.now() - t0 < 80000) {
  const st = await p.evaluate(() => window.__f1dTour);
  await p.screenshot({ path: `shots/f1/D/_tools/t-${String(i++).padStart(2, '0')}.png` });
  if (st === 'done') break;
  await p.waitForTimeout(1500);
}
logs.push(JSON.stringify(await p.evaluate(() => window.__f1dMarks)));
logs.push(JSON.stringify(await p.evaluate(() => window.__f1d.perf())));
logs.push(JSON.stringify(await p.evaluate(() => window.__f1d.state())).slice(0, 400));
console.log(logs.join('\n'));
await b.close();
