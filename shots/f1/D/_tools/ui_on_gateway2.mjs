// UI on 모드 v2 — 실 F1-B 게이트웨이(8700) · kgz-agri-manager · G-J1 8칸 + HUD 진행 카운터(shard.done 기반) 스냅샷 · 다음 행동 · 콘솔 오류
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const API = 'http://localhost:8700';
const pw = fs.readFileSync('server/.env', 'utf8').match(/^DEV_PASSWORD=(.*)$/m)[1].trim();
const s = await (await fetch(API + '/api/v1/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ realm: 'tenant', tenant_id: 'kgz-agri', login: 'kgz-agri-manager', password: pw }) })).json();
const b = await chromium.launch({ channel: 'chrome', args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(([s, api]) => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', 1); localStorage.setItem('lx_api_base', api); localStorage.removeItem('lx_api_mode'); localStorage.setItem('lx_api_session', JSON.stringify(s)); localStorage.removeItem('lx_logged_in'); localStorage.setItem('lx_tenant_session', JSON.stringify({ tenant: 'kgz-agri', at: '2026-09-26T21:00:00+09:00' })); }, [s, API]);
const p = await ctx.newPage(); const errs = [], http = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 220)); });
p.on('pageerror', (e) => errs.push('pageerror ' + e.message));
p.on('response', (r) => { if (r.url().includes(':8700') && !r.url().includes('/events/')) http.push(r.status() + ' ' + r.request().method() + ' ' + r.url().replace(API, '').split('?')[0]); });
await p.goto('http://localhost:4173/landxi/global/index.html?tenant=kgz-agri&locale=en&svc=dp-kgz-agri-farm-26');
await p.waitForFunction(() => document.documentElement.dataset.lx === 'ready', null, { timeout: 30000 });
await p.waitForSelector('#ys-run', { timeout: 60000 });
await p.waitForTimeout(2500);
const st0 = await p.evaluate(() => window.__f1d.state());
await p.evaluate(async () => { const y = window.__f1d.scenes.ys; y.frame(); await y.quote(); y.run(); });
const t0 = Date.now(); const snaps = []; let shot2 = false;
while (Date.now() - t0 < 480000) {
  const h = await p.evaluate(() => ({ shard: document.querySelector('#hud-shard')?.innerText, eta: document.querySelector('#hud-eta')?.innerText, running: document.querySelector('.g-slot[data-state="running"] .g-slot__n')?.innerText, job: window.__f1d.scenes.ys.S.job }));
  snaps.push({ s: +((Date.now() - t0) / 1000).toFixed(1), ...h });
  if (!shot2 && /shard [2-9]\/8/.test(h.shard || '')) { shot2 = true; await p.screenshot({ path: 'shots/f1/D/still/ysykata-gj1-ON-progress-1440.png' }); }
  if (h.job === 'done') break;
  await p.waitForTimeout(5000);
}
await p.waitForTimeout(3000);
await p.screenshot({ path: 'shots/f1/D/still/ysykata-gj1-ON-gateway-1440.png' });
const next = await p.evaluate(() => document.querySelector('#ys-next')?.innerText);
const out = { mode: st0.mode, elapsed_s: (Date.now() - t0) / 1000, snaps, next, http, errors: errs, perf: await p.evaluate(() => window.__f1d.perf()) };
fs.writeFileSync('shots/f1/D/logs/ui-on-gateway2-8700.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, snaps: out.snaps.length }, null, 1));
await b.close();
