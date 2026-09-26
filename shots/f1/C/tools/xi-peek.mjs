// XI(F1-A) J1 화면이 반화면 폭(556)에서 도는지 확인 — off 모드 저장 리플레이(시연 표기)
import { chromium } from 'playwright';
const b = await chromium.launch({ channel: 'chrome' });
const ctx = await b.newContext({ viewport: { width: 556, height: 900 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await ctx.addInitScript(() => { if (sessionStorage.getItem('b')) return; sessionStorage.setItem('b', '1'); localStorage.setItem('lx_api_mode', 'off'); localStorage.setItem('lx_logged_in', '1'); localStorage.setItem('lx_role', 'staff'); });
const t0 = Date.now();
await p.goto('http://localhost:4173/landxi/xi/index.html?cam=127.5325,35.434,14.2,35,0&job=j1-hwangdeung&model=namwon/cultivate_uncultivate/train');
await p.waitForFunction(() => document.documentElement.dataset.restored === '1', null, { timeout: 60000 });
console.log('restored', Date.now() - t0);
await p.waitForSelector('#quote-card .xi-run', { timeout: 15000 }); console.log('quote', Date.now() - t0);
await p.screenshot({ path: process.argv[2] + '/xi-quote.png' });
await p.click('#quote-card .xi-run'); const t1 = Date.now();
await p.waitForTimeout(6000); await p.screenshot({ path: process.argv[2] + '/xi-run.png' });
await p.waitForFunction(() => window.__xi.PHASES.some((x) => x.p === 'job-done'), null, { timeout: 60000 }); console.log('done after', Date.now() - t1);
await p.screenshot({ path: process.argv[2] + '/xi-done.png' });
console.log('errs', errs); await b.close();
