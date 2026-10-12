/* 구현 22 · 전국 유휴 즉시 · GPU 부하 상한 증거 — 바깥 주소 · 로그인 폼(세션 주입 0) · 두 장면만.
   node docs/superpowers/final/process/impl-22/national-idle/shoot.mjs   (01. 디자인 에서)
   ① XI맵 전국 결과 자산 칸(1440) — '지금 분석 중' 또는 '학습 장비가 놀 때 차례로' ② LX 관리자 대시보드 진행 한 줄 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const ADMIN = process.env.ADMIN || 'https://admin.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), shots: {}, errors: [], local: [] };
const shot = async (page, name) => { const f = `${name}-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const timer = setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 240000);
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
watch(p);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(() => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown, null, { timeout: 40000, polling: 50 });
await p.waitForTimeout(3500);
run.hud = await p.evaluate(() => document.querySelector('.xna-card')?.innerText || null);
await shot(p, 'a1-xi-national-card-1440');
await ctx.close();
const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const a = await ctx2.newPage();
watch(a);
await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
await a.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await a.goto(ADMIN + '/landxi/v3/ops-core/');
await a.waitForFunction(() => /전국 농지/.test(document.querySelector('.oc-todo')?.textContent || ''), null, { timeout: 30000 }).catch(() => {});
await a.waitForTimeout(1500);
run.admin_line = await a.evaluate(() => [...document.querySelectorAll('.oc-todo li')].map((x) => x.innerText.trim()).find((t) => /전국 농지/.test(t)) || null);
await shot(a, 'c1-admin-line-1440');
await ctx2.close();
await browser.close();
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify(run, null, 1));
clearTimeout(timer);
