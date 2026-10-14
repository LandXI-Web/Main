// XI맵 콘솔 오류 수집 — 바깥 주소 로그인 폼 → xi-clean → 여러 곳 날아가기 · 확대
import path from 'node:path'; import fs from 'node:fs'; import { createRequire } from 'node:module'; import { pathToFileURL } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
process.env.PLAYWRIGHT_BROWSERS_PATH ||= 'C:/Users/User/AppData/Local/ms-playwright';
if (!process.env.LX_PW) process.env.LX_PW = (fs.readFileSync(ROOT + '/server/.env', 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m) || [])[1];
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const B = process.argv[2] || 'https://app.land-xi.dev';
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist'] });
const OUTF = process.argv[3] || 'xipt-out.json'; const dump = () => fs.writeFileSync(OUTF, JSON.stringify({ counts, errs }, null, 1)); const step = (s) => console.error(new Date().toISOString().slice(11,19), s);
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { const o = console.error.bind(console); window.__errs = []; console.error = (...a) => { try { window.__errs.length < 30 && window.__errs.push(a.map((x) => x && typeof x === 'object' ? { cls: x.constructor?.name, msg: x.message, name: x.name, status: x.status, url: x.url, stack: String(x.stack || '').slice(0, 600), keys: Object.keys(x).slice(0, 10) } : String(x))); } catch {} o(...a); }; });
const page = await ctx.newPage(); page.setDefaultTimeout(30000);
const errs = []; const counts = {};
page.on('console', (m) => { if (m.type() === 'error') console.error('  ERR', m.text().slice(0,200)); if (m.type() === 'error' || m.type() === 'warning') { const t = m.text().slice(0, 300); const k = m.type() + ':' + t.slice(0, 80); counts[k] = (counts[k] || 0) + 1; if (counts[k] <= 2) errs.push({ type: m.type(), t, loc: m.location() }); } });
page.on('pageerror', (e) => { const k = 'pageerror:' + String(e.message).slice(0, 80); counts[k] = (counts[k] || 0) + 1; if (counts[k] <= 2) errs.push({ type: 'pageerror', t: String(e.stack || e).slice(0, 1500) }); });
const FAKE = process.argv.includes('--fake'); const seen = new Set(); let nf = 0, nretry = 0;
if (FAKE) await page.route('**/tiles/mvt/**', (r) => { const k = r.request().url().split('?')[0]; if (!seen.has(k)) { seen.add(k); nf++; return r.fulfill({ status: 502, body: '' }); } nretry++; return r.continue(); });
step('login'); await frontDoor(page, B, 'test@lx.or.kr', { password: process.env.LX_PW });
await page.goto(B + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.xb-hud', { timeout: 60000 }).catch(() => null);
await page.waitForTimeout(6000);
const spots = [[127.39, 35.42, 11], [127.13, 35.82, 11], [126.97, 37.57, 11], [127.39, 35.42, 14], [127.38, 35.41, 16], [128.6, 35.87, 12], [127.0, 36.5, 7], [126.5, 33.4, 10]];
for (const [x, y, z] of spots) {
  step('fly'); await page.evaluate(([a, b, c]) => { window.__xc?.map?.flyTo({ center: [a, b], zoom: c, duration: 1500 }); }, [x, y, z]).catch(() => null);
  step('spot '+x+','+y+','+z); dump(); await page.waitForTimeout(4500); step('waited');
  step('mouse'); await page.mouse.move(720, 450); step('wheel'); await page.mouse.wheel(0, -300); await page.waitForTimeout(800); await page.mouse.move(760, 470); await page.waitForTimeout(800); step('eval'); step(JSON.stringify(await Promise.race([page.evaluate(() => ({ z: window.__xc?.map?.getZoom(), xc: document.documentElement.dataset.xc })), new Promise((r) => setTimeout(() => r('EVAL-TIMEOUT'), 10000))])));
}
console.log(JSON.stringify(await page.evaluate(() => window.__errs.slice(0, 6)), null, 1)); dump(); step('done fake502=' + nf + ' retried=' + nretry);
await browser.close();
