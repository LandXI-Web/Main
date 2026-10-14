/* 구현 32 · 대시보드 '보고서로' = 한글 문서(.hwpx) 증거 — 바깥 주소 · 로그인 폼(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-32/hwp-report/shoot.mjs   (01. 디자인 에서) → shots/*.png · got/*.hwpx · run.json
   대시보드 질문 2개 → 각각 '보고서로' → 받은 파일 이름 · 크기 · 화면 숫자(큰 숫자 · 해석 줄)를 run.json 에 — 문서 숫자 대조는 check.py. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const GOT = process.env.GOT || path.join(DIR, 'got');
fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(GOT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], bad: [], dash: {} };
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 400000);
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
const settle = (p) => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});
const say = async (p, q) => {
  const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
  await inp.click(); await inp.fill('');
  await inp.pressSequentially(q, { delay: 30 });
  await inp.press('Enter');
  await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 60000 }).catch(() => {});
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
await settle(p); await p.waitForTimeout(1000);

for (const [name, q] of [['r1-overview', '남원시 현황 보여 줘'], ['r2-task', '남원시 비닐하우스 어디가 많아?']]) {
  await p.evaluate(() => { window.__xc.dash = null; });
  await say(p, q);
  await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 60000 });
  await settle(p); await p.waitForTimeout(1400);
  const d = await p.evaluate(() => ({ title: document.querySelector('.xd-h h2')?.innerText, button: document.querySelector('.xd-rep')?.innerText,
    kpis: [...document.querySelectorAll('.xd-kpi')].map((k) => ({ l: k.querySelector('.xd-l')?.innerText, v: k.querySelector('.xd-v b')?.innerText, u: k.querySelector('.xd-v small')?.innerText })),
    say: [...document.querySelectorAll('.xd-say p:not(.xd-sayh)')].map((x) => x.innerText),
    rank: [...document.querySelectorAll('.xd-rank tr')].map((tr) => [tr.querySelector('.n')?.innerText, tr.querySelector('.v')?.innerText]) }));
  await shot(p, name + '-dash');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('.xd-rep').click()]);
  const fn = dl.suggestedFilename();
  const to = path.join(GOT, fn);
  await dl.saveAs(to);
  await p.waitForTimeout(300);
  d.after_click = await p.locator('.xd-rep').innerText();
  await shot(p, name + '-after-click');
  run.dash[name] = { q, ...d, file: fn, bytes: fs.statSync(to).size, at: kst() };
}
run.done_at = kst();
await ctx.close(); await browser.close();
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
clearTimeout(guard);
console.log(JSON.stringify({ shots: Object.keys(run.shots), files: Object.values(run.dash).map((x) => [x.file, x.bytes, x.after_click]), errors: run.errors, bad: run.bad, local: run.local.length }, null, 1));
