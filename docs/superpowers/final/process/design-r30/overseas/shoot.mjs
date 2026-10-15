/* 설계 30차 · 해외 — (1) 지금 해외 화면: 바깥 주소 로그인 폼(LX 직원 · 해외 기관, 세션 주입 0) (2) 시안: 로컬 정적 주소(MOCK).
   node docs/superpowers/final/process/design-r30/overseas/shoot.mjs   (01. 디자인 에서) → shots/*.png · run.json · PC 1440 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots'); fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const MOCK = process.env.MOCK || 'http://127.0.0.1:4391/';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [] };
const save = () => fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 600000).unref();
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = () => browser.newContext({ viewport: { width: 1440, height: 900 } });
const watch = (p, tag) => { p.on('pageerror', (e) => run.errors.push(`${tag} ${String(e).slice(0, 200)}`)); p.on('console', (m) => { if (m.type() === 'error') run.errors.push(`${tag} ${m.text().slice(0, 160)}`); }); };
const shot = async (p, name) => { const f = `${name}-1440-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); };
const only = process.argv[2];

try {
  if (!only || only === 'now') {
    /* 지금 — LX 직원 XI맵 키르기스스탄(나라 · 소쿨룩 구획) */
    const c = await ctx(); const p = await c.newPage(); watch(p, 'xi');
    await frontDoor(p, APP, 'test@lx.or.kr', 'app');
    await p.waitForURL((u) => !/\/login\/?(\?|$)/.test(u.pathname), { timeout: 30000 });
    await p.goto(APP + '/landxi/v3/xi-clean/?nation=kg', { waitUntil: 'commit' });
    await p.waitForFunction(() => window.__xc?.map && window.__xc.boot?.shown, null, { timeout: 60000, polling: 100 });
    await p.waitForTimeout(6000); await shot(p, 'now-ximap-kg');
    await p.evaluate(() => window.__xc.map.jumpTo({ center: [74.3, 42.85], zoom: 11.2 }));
    await p.waitForTimeout(6000); await shot(p, 'now-ximap-sokuluk');
    await c.close();
    /* 지금 — 해외 기관 첫 화면 */
    const c2 = await ctx(); const p2 = await c2.newPage(); watch(p2, 'org');
    await frontDoor(p2, APP, 'lxadmin@lx.or.kr#kgz-agri');
    await p2.waitForTimeout(9000); run.org_landing = new URL(p2.url()).pathname; await shot(p2, 'now-org-kgz');
    await c2.close();
  }
  if (!only || only === 'mock') {
    const c = await ctx(); const p = await c.newPage(); watch(p, 'mock');
    const go = async (qs, name, wait = 1500) => { await p.goto(MOCK + 'index.html' + qs, { waitUntil: 'networkidle' }); await p.waitForTimeout(wait); await shot(p, name); };
    await go('', 'mock-a-fill', 2600);            // 차오르는 중
    await go('', 'mock-a-full', 8500);            // 41곳 끝
    await go('?t=chg&still=1', 'mock-a-change');
    await go('?ask=1&fal=1&still=1', 'mock-a-ask');
    await p.mouse.click(1440 - 24 - 560 + 300, 64 + 24 + 60 + 220); await p.waitForTimeout(500);
    await p.locator('.fix [data-c]').click(); await p.waitForTimeout(300); await shot(p, 'mock-a-fix');
    await go('?dash=1&still=1', 'mock-a-dash', 1200);
    await go('?v=b&still=1', 'mock-b-board', 1500);
    run.overflow = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    run.min_font = await p.evaluate(() => { let m = 99; for (const v of ['A', 'B']) document.getElementById(v).hidden = false; document.querySelectorAll('body *').forEach((e) => { if (e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) { const s = parseFloat(getComputedStyle(e).fontSize); if (s < m) m = s; } }); return m; });
    await c.close();
  }
} catch (e) { run.fatal = String(e?.stack || e).slice(0, 600); console.error(e); }
finally { save(); await browser.close(); }
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors.length, fatal: run.fatal, overflow: run.overflow, min_font: run.min_font, org: run.org_landing }));
