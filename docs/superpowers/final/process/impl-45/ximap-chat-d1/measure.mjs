// XI ChatGEO 1안 기본 반영 후 실측 — 바깥 주소 · 로그인 폼 · 질문 2개 · 창 3종 · 지도 덮는 비율 · 콘솔 오류 · 대기 시간. 비밀번호는 server/.env 에서만.
import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module'; import { pathToFileURL, fileURLToPath } from 'node:url';
const ROOT = 'E:/Land-XI 플랫폼/01. 디자인'; const HW = 'C:/Users/User/AppData/Local/ms-playwright';
if (fs.existsSync(path.join(HW, 'chromium-1234'))) process.env.PLAYWRIGHT_BROWSERS_PATH = HW;
if (!process.env.DEV_PASSWORD) { const m = fs.readFileSync(path.join(ROOT, 'server/.env'), 'utf8').match(/^DEV_PASSWORD=(.*?)\s*$/m); if (m) process.env.DEV_PASSWORD = m[1]; }
process.env.LX_PW ||= process.env.DEV_PASSWORD;
const { chromium } = createRequire(path.join(ROOT, 'package.json'))('playwright');
const { frontDoor } = await import(pathToFileURL(path.join(ROOT, 'landxi/v3/kit/lint/forbidden.mjs')).href);
const HERE = path.dirname(fileURLToPath(import.meta.url)); const SHOTS = path.join(HERE, 'shots');
const WHO = process.argv[2] || 'staff'; const OUT = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ready = (p) => p.waitForFunction(() => { return document.querySelector('canvas') && document.querySelector('.k-ck-i'); }, null, { timeout: 90000, polling: 200 });
const SIZES = [[1440, 900, 'w1440'], [1920, 1080, 'w1920'], [390, 844, 'm390']];
const QS = ['남원시 경작지 현황 보여 줘', '임실군 경작지 현황 보여 줘'];
const base = WHO === 'inst' ? 'https://namwon.land-xi.dev' : 'https://app.land-xi.dev';
const who = WHO === 'inst' ? 'lxadmin@lx.or.kr#namwon' : 'test@lx.or.kr';
for (const [w, hh, tag] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: hh }, deviceScaleFactor: 1, ...(w < 500 ? { isMobile: true, hasTouch: true } : {}) });
  const p = await ctx.newPage(); const errs = []; p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); }); p.on('pageerror', (e) => errs.push('PAGE ' + String(e).slice(0, 200)));
  await frontDoor(p, base, who); await p.waitForTimeout(1500);
  const t0 = Date.now(); await p.goto(base + '/landxi/v3/xi-clean/', { waitUntil: 'domcontentloaded', timeout: 60000 }); await ready(p); const tReady = Date.now() - t0; await p.waitForTimeout(2500);
  for (const [i, q] of QS.entries()) {
    const inp = p.locator('input[placeholder*="시군구 · 지번"], .k-ck-i').first(); await inp.click({ timeout: 8000 }); await inp.fill(q); const ts = Date.now(); await inp.press('Enter');
    let busyMs = 0; const bt = Date.now();
    await p.waitForFunction(() => document.querySelector('.xk-ans:not([hidden])'), null, { timeout: 60000 }).catch(() => {});
    await p.waitForFunction(() => !document.querySelector('.xk-ans.is-busy') && document.querySelector('.xk-ans:not([hidden]) .xk-ans-a button'), null, { timeout: 90000, polling: 100 }).catch(() => {});
    busyMs = Date.now() - ts; await p.waitForTimeout(2500);
    const m = await p.evaluate(() => { const mapEl = document.querySelector('.k-main'); const mr = mapEl.getBoundingClientRect(); const a = document.querySelector('.xk-ans:not([hidden])'), inn = document.querySelector('.k-chat-in'); const rs = [a, inn].filter(Boolean).map((e) => e.getBoundingClientRect());
      const box = rs.length ? { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) } : null;
      return { map: [Math.round(mr.width), Math.round(mr.height)], box: box && [Math.round(box.r - box.l), Math.round(box.b - box.t)], pct: box && +(((box.r - box.l) * (box.b - box.t)) / (mr.width * mr.height) * 100).toFixed(1), band: a ? a.innerText.slice(0, 80) : null, dlogVisible: !!([...document.querySelectorAll('.k-chat-dlog')].find((e) => e.offsetHeight > 0)), dots: [...document.querySelectorAll('[class*=loading],[class*=load-]')].filter((e) => e.offsetHeight).length }; });
    await p.screenshot({ path: path.join(SHOTS, `${WHO}-${tag}-q${i + 1}.png`) });
    OUT.push({ who: WHO, size: tag, q, answerMs: busyMs, readyMs: tReady, ...m, errs: errs.slice() }); console.log(JSON.stringify(OUT.at(-1)));
  }
  // 대화 서랍
  const more = p.locator('.xk-more'); if (await more.count()) { await more.click(); await p.waitForTimeout(900); const dr = await p.evaluate(() => ({ drawer: !!document.querySelector('.k-drawer.is-open, .k-drawer'), msgs: document.querySelectorAll('.k-drawer .k-chat-msg').length })); await p.screenshot({ path: path.join(SHOTS, `${WHO}-${tag}-drawer.png`) }); OUT.push({ who: WHO, size: tag, drawer: dr }); console.log(JSON.stringify(OUT.at(-1))); await p.keyboard.press('Escape'); }
  await ctx.close();
}
fs.writeFileSync(path.join(HERE, `measure-${WHO}.json`), JSON.stringify(OUT, null, 1)); await browser.close();
