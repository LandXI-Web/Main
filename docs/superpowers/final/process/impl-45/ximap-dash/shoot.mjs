// XI맵 목록(마지막 분석 · 서비스로 보기) · 달력 공휴일 · 오른쪽 아래 출처 뺌 증거 — 바깥 주소 로그인 폼으로만. 비밀번호는 server/.env 에서(출력 없음).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인';
const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(HERE, 'shots');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const out = {};
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
await frontDoor(p, 'https://app.land-xi.dev', 'test@lx.or.kr'); await p.waitForTimeout(4000); console.log('after login', p.url());
const ready = (t = 90000) => p.waitForFunction(() => { return document.querySelector('canvas') && document.querySelector('.xb-hud button'); }, null, { timeout: t });
// 1 XI맵 (전국 · 낮은 줌)
p.on('console', (m) => { if (m.type()==='error') errs.push('C:'+m.text().slice(0,200)); });
await p.goto('https://app.land-xi.dev/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready().catch(async (e) => { console.log(errs, p.url()); await p.screenshot({ path: path.join(SHOTS, 'dbg.png') }); throw e; }); await p.waitForTimeout(3000);
out.credit = await p.evaluate(() => [...document.querySelectorAll('.k-credit')].map((e) => ({ t: e.textContent, hidden: e.hidden })));
await p.screenshot({ path: path.join(SHOTS, 'map-1440.png') });
await p.locator('.xb-hud .xb-k--line, .xb-hud button').first().click({ timeout: 8000 }); await p.waitForTimeout(2000);
out.chips = await p.evaluate(() => [...document.querySelectorAll('.xc-sgc')].slice(0, 12).map((e) => e.innerText.replace(/\n/g, ' | ')));
await p.screenshot({ path: path.join(SHOTS, 'list-region-1440.png') });
await p.locator('.xc-board-flip').click(); await p.waitForTimeout(1200);
await p.locator('.xc-svr').first().click(); await p.waitForTimeout(1200);
out.svc = await p.evaluate(() => ({ n: document.querySelectorAll('.xc-svr').length, rows: [...document.querySelectorAll('.xc-svr')].slice(0, 6).map((e) => e.innerText.replace(/\n/g, ' ')), chips: [...document.querySelectorAll('.xc-sggs--svc .xc-sgc')].slice(0, 6).map((e) => e.innerText.replace(/\n/g, ' | ')) }));
await p.screenshot({ path: path.join(SHOTS, 'list-svc-1440.png') });
await p.waitForTimeout(800);
// 저장 확인: 다시 열면 서비스 먼저
await p.reload({ waitUntil: 'domcontentloaded' }); await ready(); await p.waitForTimeout(2500);
await p.locator('.xb-hud .xb-k--line, .xb-hud button').first().click({ timeout: 8000 }); await p.waitForTimeout(2500);
out.persist = await p.evaluate(() => ({ svcMode: !!document.querySelector('.xc-svrs'), flip: document.querySelector('.xc-board-flip')?.getAttribute('aria-pressed') }));
// 모바일
await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(SHOTS, 'list-svc-390.png') });
await p.locator('.xc-board-flip').click(); await p.waitForTimeout(1200);
await p.screenshot({ path: path.join(SHOTS, 'list-region-390.png') });
// 원래대로(저장값 되돌림)
const fl = p.locator('.xc-board-flip'); if ((await fl.getAttribute('aria-pressed')) === 'true') await fl.click();
await p.waitForTimeout(800);
// 달력
await p.setViewportSize({ width: 1440, height: 900 });
await p.goto('https://app.land-xi.dev/landxi/v3/lx-console/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await p.waitForTimeout(6000);
for (let i = 0; i < 2; i++) { await p.locator('.ld-cal-n').first().click().catch(() => {}); await p.waitForTimeout(1500); }
out.cal = await p.evaluate(() => ({ label: document.querySelector('.ld-cal-l')?.textContent, hols: [...document.querySelectorAll('.is-hol')].map((e) => e.className + '|' + (e.getAttribute('title') || '') + '|' + e.innerText.split(String.fromCharCode(10)).join(' ').trim().slice(0, 30)), cells: document.querySelectorAll('.ld-cal-d').length, mode: document.querySelector('.ld-cal')?.dataset.mode }));
await p.screenshot({ path: path.join(SHOTS, 'cal-1440.png') });
out.errs = errs;
fs.writeFileSync(path.join(HERE, 'result.json'), JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1));
await browser.close();
