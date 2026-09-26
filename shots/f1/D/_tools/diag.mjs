// F1-D 진단 — node shots/f1/D/_tools/diag.mjs "<query>" [waitMs] [outPng]
import { chromium } from '@playwright/test';
const [,, query = '?tenant=lx', waitMs = '4000', out = 'shots/f1/D/_tools/diag.png', mode = 'off'] = process.argv;
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([mode]) => {
  if (mode === 'off') localStorage.setItem('lx_api_mode', 'off'); else { localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_base', 'http://localhost:8711'); }
  localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); localStorage.removeItem('lx_tenant_session');
}, [mode]);
const p = await ctx.newPage();
const logs = [];
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`.slice(0, 300)));
p.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
p.on('requestfailed', (r) => logs.push('[reqfail] ' + r.url().slice(0, 160) + ' ' + r.failure()?.errorText));
p.on('response', (r) => { if (r.status() >= 400) logs.push('[http ' + r.status() + '] ' + r.url().slice(0, 160)); });
const t0 = Date.now();
await p.goto('http://localhost:4173/landxi/global/index.html' + query);
await p.waitForFunction(() => ['ready', 'failed'].includes(document.documentElement.dataset.lx), null, { timeout: 30000 }).catch(() => logs.push('ready timeout'));
logs.push('ready after ' + (Date.now() - t0) + 'ms · ' + await p.evaluate(() => document.documentElement.dataset.lx));
await p.waitForTimeout(+waitMs);
await p.screenshot({ path: out });
logs.push(JSON.stringify(await p.evaluate(() => window.__f1d?.state?.() || null)));
console.log(logs.join('\n'));
await b.close();
