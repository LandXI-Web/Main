// UI on 모드 — 실 F1-B 게이트웨이(8700)로 G-J1 8칸 · 콘솔 오류 · 스크린샷. DEV_PASSWORD 필요.
import { chromium } from '@playwright/test';
const API = 'http://localhost:8700';
const s = await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'tenant', tenant_id: 'kgz-agri', login: 'kgz-agri-manager', password: process.env.DEV_PASSWORD }) })).json();
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([s, api]) => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.removeItem('lx_logged_in'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: 'kgz-agri', at: '2026-09-26T21:00:00+09:00' })); }, [s, API]);
const p = await ctx.newPage(); const errs = [], http = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 220)); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('response', (r) => { if (r.url().includes(':8700')) http.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace(API, '').split('?')[0]); });
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=kgz-agri&locale=en&svc=dp-kgz-agri-farm-26');
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
await p.waitForTimeout(7000);
const st0 = await p.evaluate(() => window.__f1d.state());
console.log('mode', st0.mode, st0.reason, 'mast', await p.locator('#mode span, .gs-mode span').first().textContent().catch(() => '?'));
await p.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); });
const t0 = Date.now(); let n = 0;
while (Date.now() - t0 < 420000) { n = await p.locator('.g-slot.is-in, .g-slot[data-state="in"]').count(); const done = await p.evaluate(() => window.__f1d.state().ys?.done || window.__f1d.state().ys?.phase === 'done'); if (done) break; await p.waitForTimeout(5000); }
await p.waitForTimeout(2500);
await p.screenshot({ path: 'shots/f1/D/still/ysykata-gj1-ON-gateway-1440.png' });
console.log('elapsed', ((Date.now() - t0) / 1000).toFixed(1), 's · slots', n);
console.log('ys', JSON.stringify(await p.evaluate(() => window.__f1d.state().ys)).slice(0, 700));
console.log('http', JSON.stringify(http));
console.log('errors', JSON.stringify(errs));
console.log('perf', JSON.stringify(await p.evaluate(() => window.__f1d.perf())));
await b.close();
