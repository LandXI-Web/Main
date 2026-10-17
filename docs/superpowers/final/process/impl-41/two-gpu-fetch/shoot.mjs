/* 구현 41 · 학습 장비 줄 — 바깥 주소 · 로그인 폼(세션 주입 0) · LX 관리자 대시보드 할 일 칸(PC 1440 · 모바일 390).
   node docs/superpowers/final/process/impl-41/two-gpu-fetch/shoot.mjs   (01. 디자인 에서) */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const ADMIN = process.env.ADMIN || 'https://admin.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), shots: {}, rows: {}, errors: [], local: [] };
const timer = setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 240000);
const browser = await chromium.launch({ channel: 'chrome' });
for (const [w, h, tag] of [[1440, 900, 'pc'], [390, 844, 'm']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const a = await ctx.newPage();
  a.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  a.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  a.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  await frontDoor(a, ADMIN, 'lxadmin@lx.or.kr', 'admin');
  await a.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
  await a.goto(ADMIN + '/landxi/v3/ops-core/');
  await a.waitForFunction(() => /학습 장비/.test(document.querySelector('.oc-todo')?.textContent || ''), null, { timeout: 40000 }).catch(() => {});
  await a.waitForTimeout(1500);
  run.rows[tag] = await a.evaluate(() => [...document.querySelectorAll('.oc-todo li')].map((x) => x.innerText.trim()));
  const card = await a.$('.oc-card');
  const f = `equip-${tag}-${w}-${hm()}.png`;
  if (card) { await card.scrollIntoViewIfNeeded(); await card.screenshot({ path: path.join(OUT, f) }); } else await a.screenshot({ path: path.join(OUT, f) });
  run.shots[f] = kst();
  await ctx.close();
}
await browser.close();
run.gpu_word = Object.values(run.rows).flat().filter((t) => /GPU/.test(t));
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify(run, null, 1));
clearTimeout(timer);
