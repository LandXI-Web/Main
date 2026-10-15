/* 바퀴 14 재검수 · XI맵(구현 35 shoot.mjs 를 그대로 가져와 걸린 시간 · 말로 거르기 · Esc 닫기 · '보고서로' 를 더함) — 바깥 주소 · 로그인 폼(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-36/recheck/ximap.mjs   (01. 디자인 에서)
   TAG=before|after(파일 이름 앞) · W=1440|1920 · ONLY=first,edit,dash,var(쉼표) · 시험 고치기는 ?test=1 → shots/*.png · run-<TAG>-<W>.json */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const TAG = process.env.TAG || 'recheck';
const W = Number(process.env.W || 1440), H = W >= 1920 ? 1080 : 900;
const ONLY = new Set((process.env.ONLY || 'first,filter,var,edit,dash').split(','));
const NAT = [127.247506, 35.562193];                       // 전국 결과(임실군 농지 전수) 객체가 있는 자리(구현 30과 같은 곳)
const SVC = (process.env.SVC || '127.5345,35.4335').split(',').map(Number);   // 서비스 결과(남원 운봉읍 비닐하우스)
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, tag: TAG, w: W, shots: {}, errors: [], local: [], bad: [], steps: {}, dash: {} };
const save = () => fs.writeFileSync(path.join(DIR, `run-${TAG}-${W}.json`), JSON.stringify(run, null, 2));
const shot = async (p, name) => { const f = `${TAG}-${name}-${W}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 900000);

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, acceptDownloads: true });
// 융합 대시보드(이번 바퀴 화면)를 본다 — 같은 시각 다른 작업이 '통계 지도 위'(원칙 258)를 기본으로 넣는 중이라, 대시보드 쪽을 골라 둔다
await ctx.addInitScript(() => { try { if (!localStorage.getItem('xc_statv')) localStorage.setItem('xc_statv', 'dash'); } catch { /* */ } });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
async function home() {
  const t = Date.now();
  await p.goto(APP + '/landxi/v3/xi-clean/?test=1', { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
  const a = Date.now() - t;
  await settle();
  (run.home ||= []).push({ ready: a, settled: Date.now() - t });
  await p.waitForTimeout(1500);
}
const say = async (q) => {
  const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
  await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 25 });
  const t = Date.now();
  await inp.press('Enter');
  await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 60000 }).catch(() => {});
  return Date.now() - t;
};

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 }).catch(async (e) => { console.log('login stuck:', p.url(), (await p.locator('body').innerText().catch(() => '')).slice(-400)); throw e; });
await home();

/* ① 첫 화면 — 채팅 창(추천 질문 · '이 화면은?') · 왼쪽 위 결과 표시 */
if (ONLY.has('first')) {
  run.steps.first = await p.evaluate(() => ({ sugg: [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip')].filter((b) => b.offsetParent).map((b) => b.textContent),
    what: [...document.querySelectorAll('.k-what')].filter((a) => a.offsetParent).map((a) => a.textContent), hud: document.querySelector('.xb-hud')?.innerText || null }));
  await shot(p, 'a1-first');
  await p.evaluate(() => window.__xc.map.jumpTo({ center: [127.45, 35.42], zoom: 10 }));
  await settle(); await p.waitForTimeout(2500);
  run.steps.region = await p.evaluate(() => document.querySelector('.xb-hud')?.innerText || null);
  await shot(p, 'a2-region');
}

/* ①-2 말로 거르기 · 올리면 말풍선 · 누르면 그 자리 · Esc 닫기 */
if (ONLY.has('filter')) {
  await home();
  const ms1 = await say('비닐하우스만 보여 줘');
  await p.waitForTimeout(800);
  const f1 = await p.evaluate(() => ({ task: window.__xc.task || null, ans: (document.querySelector('.k-chat .k-ck-a, .k-chat .k-chat-a:last-of-type')?.innerText || '').replace(/\s+/g, ' ').slice(0, 120) }));
  await shot(p, 'f1-filter');
  const ms2 = await say('원래대로');
  await p.waitForTimeout(800);
  const f2 = await p.evaluate(() => window.__xc.task || null);
  run.steps.filter = { ms: [ms1, ms2], task: f1.task, after: f2, ans: f1.ans };
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
}

/* ② 결과 표시 시안 — ⓐ 작은 판 · ⓑ 아래 띠(전국 · 시군구 · 업무 하나 누름) */
if (ONLY.has('var') && TAG !== 'before') {
  for (const v of ['a', 'b']) {
    await home();
    const has = await p.locator(`.xv-sw button[data-v="${v}"]`).count();
    if (!has) { run.steps['var_' + v] = 'no switch'; continue; }
    await p.locator(`.xv-sw button[data-v="${v}"]`).click(); await p.waitForTimeout(900);
    run.steps['var_' + v] = await p.evaluate(() => document.querySelector('.xv-a:not([hidden]), .xv-b:not([hidden])')?.innerText || null);
    await shot(p, `v${v}1-national`);
    const dot = p.locator(v === 'a' ? '.xv-a .xv-dot' : '.xv-b .xv-it').first();
    if (await dot.count()) { await dot.evaluate((e) => e.click()); await p.waitForTimeout(1800); await settle(); run.steps["var_" + v + "_task"] = await p.evaluate(() => window.__xc.task || null); await shot(p, `v${v}2-task`); await p.evaluate(() => window.__xc.task && document.querySelector(".xv-a [aria-pressed=true], .xv-b [aria-pressed=true]")?.click()); await p.waitForTimeout(800); }
    await p.evaluate(() => window.__xc.map.jumpTo({ center: [127.45, 35.42], zoom: 10 }));
    await settle(); await p.waitForTimeout(2500);
    run.steps['var_' + v + '_region'] = await p.evaluate(() => document.querySelector('.xv-a:not([hidden]), .xv-b:not([hidden])')?.innerText || null);
    await shot(p, `v${v}3-region`);
  }
  await p.locator('.xv-sw button[data-v="now"]').click().catch(() => {});
}

/* ③ 그 자리 고치기 칸 — 서비스 결과 객체 · 전국 결과 객체(열기 → 삭제(시험) → 되돌리기) */
async function pickAt(center, re) {
  await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 16.2 }), center);
  await settle();
  await p.waitForFunction((src) => window.__xc.map.getStyle().layers.some((l) => new RegExp(src).test(l.id) && l.type === 'fill'), re, { timeout: 30000 }).catch(() => {});
  await settle(); await p.waitForTimeout(2000);
  return p.evaluate((src) => {
    const m = window.__xc.map, ls = m.getStyle().layers.filter((l) => new RegExp(src).test(l.id) && l.type === 'fill').map((l) => l.id);
    const fs = m.queryRenderedFeatures({ layers: ls });
    const c = m.getCanvas(), cx = c.clientWidth / 2, cy = c.clientHeight / 2, r = c.getBoundingClientRect();
    let best = null;
    for (const f of fs) {
      if (!/Polygon/.test(f.geometry.type)) continue;
      const g = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const sx = g.reduce((a, q) => a + q[0], 0) / g.length, sy = g.reduce((a, q) => a + q[1], 0) / g.length;
      const s = m.project([sx, sy]);
      if (!m.queryRenderedFeatures(s, { layers: ls }).length) continue;
      const d = Math.hypot(s.x - cx, s.y - cy);
      if (!best || d < best.d) best = { d, x: s.x + r.x, y: s.y + r.y, layer: f.layer.id, n: fs.length };
    }
    return best;
  }, re);
}
async function card(name, center, re, act) {
  await home();
  const pt = await pickAt(center, re);
  run.steps[name] = { pick: pt };
  if (!pt) return;
  const tc = Date.now();
  await p.mouse.click(pt.x, pt.y);
  const ok = await p.waitForFunction(() => { const c = document.querySelector('.xe-card:not([hidden])'); return c && !/불러오는 중/.test(c.innerText); }, null, { timeout: 30000 }).then(() => true, () => false);
  run.steps[name].openMs = Date.now() - tc;
  if (!ok) { run.steps[name].fail = true; return; }
  run.steps[name].acts = await p.evaluate(() => [...document.querySelectorAll('.xe-card:not([hidden]) .xe-act button')].map((b) => b.textContent.trim()));
  await p.waitForTimeout(1000);
  run.steps[name].card = await p.evaluate(() => document.querySelector('.xe-card:not([hidden])')?.innerText || null);
  await shot(p, name + '-open');
  if (!act) {
    await p.keyboard.press('Escape'); await p.waitForTimeout(600);
    run.steps[name].escClosed = await p.evaluate(() => !document.querySelector('.xe-card:not([hidden])'));
    return;
  }
  const delBtn = p.locator('.xe-card .xe-act button', { hasText: /^(삭제|지우기)$/ }).first();
  await delBtn.click(); await p.waitForTimeout(500);
  await shot(p, name + '-ask');
  await p.locator('.xe-card .xe-ask button', { hasText: /^(삭제|지우기)$/ }).first().click();
  await p.waitForFunction(() => /삭제|지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1400);
  run.steps[name].deleted = await p.evaluate(() => document.querySelector('.xe-card:not([hidden])')?.innerText || null);
  await shot(p, name + '-deleted');
  await p.locator('.xe-card .xe-undo').first().click().catch(() => {});
  await p.waitForFunction(() => !/삭제|지움/.test(document.querySelector('.xe-card:not([hidden]) .xe-st')?.innerText || ''), null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1000);
  run.steps[name].undone = await p.evaluate(() => document.querySelector('.xe-card:not([hidden])')?.innerText || null);
}
if (ONLY.has('edit')) {
  await card('e1-svc', SVC, '^xb-r-', false);
  await card('e2-nat', NAT, '^xn-o-.*-f$', TAG !== 'before');
}

/* ④ 융합 대시보드 — 질문 일곱 */
const QS = [['d1-overview', '남원시 현황 보여 줘'], ['d2-task', '남원시 비닐하우스 어디가 많아?'], ['d3-survey', '남원시 농지 이용 실태 어때?'], ['d4-time', '전국 분석 얼마나 진행됐어?'],
  ['d5-compare', '남원시 함양군 비교해 줘'], ['d6-jimok', '남원시 지목별 공시지가 통계'], ['d7-overview2', '함양군 현황 보여 줘']];
if (ONLY.has('dash')) {
  await home();
  for (const [name, q] of (W >= 1920 ? QS.slice(0, 3) : QS)) {
    await p.evaluate(() => { window.__xc.dash = null; });
    const t = Date.now();
    await say(q);
    const ok = await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 60000 }).then(() => true, () => false);
    const ms = Date.now() - t;
    if (!ok) { run.dash[name] = { q, fail: true }; await shot(p, name + '-fail'); continue; }
    await settle(); await p.waitForTimeout(1800);
    run.dash[name] = { q, ms, ...(await p.evaluate(() => ({ ...window.__xc.dash, kpis: [...document.querySelectorAll('.xd-kpi')].map((k) => k.innerText.replace(/\s+/g, ' ').trim()) }))) };
    await shot(p, name);
    if (name === 'd1-overview') {        // '보고서로' → 한글 문서
      const tr = Date.now();
      const dl = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.locator('.xd-rep').click()]).then(([d]) => d, () => null);
      run.dash[name].report = dl ? { file: dl.suggestedFilename(), ms: Date.now() - tr } : { fail: true };
    }
    if (name === 'd1-overview' && W < 1920) {       // 아래까지
      await p.evaluate(() => { const x = document.querySelector('.xd'); x.scrollTop = x.scrollHeight; }); await p.waitForTimeout(600);
      await shot(p, name + '-bottom');
      await p.evaluate(() => { document.querySelector('.xd').scrollTop = 0; });
    }
  }
  await p.locator('.xd-back').click().catch(() => {}); await p.waitForTimeout(1200);
}

clearTimeout(guard);
run.done = kst();
save();
await browser.close();
console.log(JSON.stringify({ tag: TAG, w: W, errors: run.errors.length, bad: run.bad.length, local: run.local.length, shots: Object.keys(run.shots).length, steps: Object.keys(run.steps) }));
