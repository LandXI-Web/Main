/* 구현 29 · XI맵 3차 구조 · 말로 거르기 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인 폼(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-29/ximap-live/shoot.mjs   (01. 디자인 에서) → shots/*.png · ximap-15s.mp4 · run.json
   ① 전국(모든 결과 함께 · 업무 이름 없음) ② 시도 줌 — 시군구 올림(여러 업무 숫자) ③ 시군구 누름 → 내려가 객체 · 말풍선
   ④ 말풍선 업무 줄 → 그 업무만 · 원래대로 ⑤ 읍면동 줌 올림 ⑥ XI ChatGEO '비닐하우스만 보여 줘' ⑦ 15초 녹화 ⑧ 프레임 · CPU 대략 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots');
const VID = path.join(DIR, '.vid');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], steps: {}, bad: [] };
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 420000);
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  p.on('response', (r) => { if (r.status() >= 400) (run.bad ||= []).push(`${kst().slice(11)} ${r.status()} ${r.request().headers().authorization ? 'auth' : 'noauth'} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
};
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-big');
const settle = (p) => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});
const hudText = (p) => p.evaluate(() => document.querySelector('.xb-hud')?.innerText || null);
const glide = async (p, from, to, n = 12) => { for (let k = 0; k <= n; k++) { await p.mouse.move(from[0] + ((to[0] - from[0]) * k) / n, from[1] + ((to[1] - from[1]) * k) / n); await p.waitForTimeout(35); } };

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
const rec0 = Date.now();
watch(p);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });

if (process.env.STEPS) console.error('step ①', kst());
/* ① 전국 */
const t0 = Date.now();
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 45000, polling: 50 });
run.first_view_ms = Date.now() - t0;
await settle(p); await p.waitForTimeout(1500);
run.steps.national = { hud: await hudText(p), legend: await p.locator('.xb-leg, .xna-card').count(), task: await p.evaluate(() => window.__xc.hud?.task ?? null),
  layers: await p.evaluate(() => window.__xc.map.getStyle().layers.filter((l) => /^(xn-|xb-grid)/.test(l.id)).map((l) => l.id)) };
await shot(p, 'a1-national');

if (process.env.STEPS) console.error('step ⑧', kst());
/* ⑧ 프레임 · CPU 대략 — 전국 화면에서 가만히 5초 · 마우스를 움직이며(올림) 5초 */
const cdp = await ctx.newCDPSession(p);
await cdp.send('Performance.enable');
const perf = async (label, act) => {
  const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  const fr = p.evaluate(() => new Promise((res) => { let n = 0; const t = performance.now(); const f = () => { n++; if (performance.now() - t < 5000) requestAnimationFrame(f); else res(n / ((performance.now() - t) / 1000)); }; requestAnimationFrame(f); }));
  await act();
  const fps = await fr;
  const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  run.perf ||= {};
  run.perf[label] = { fps: Math.round(fps), cpu_main_pct: Math.round((100 * (m1.TaskDuration - m0.TaskDuration)) / (m1.Timestamp - m0.Timestamp)), js_heap_mb: Math.round(m1.JSHeapUsedSize / 1048576) };
};
await perf('national_idle', () => p.waitForTimeout(5000));

if (process.env.STEPS) console.error('step ②', kst());
/* ② 시도 줌 — 결과가 가장 많은 시군구 근처(서버 결과 장부에서 고른다 · 자리 고정값 없음) · 시군구 올림 */
const hot = await p.evaluate(() => window.__xc.board.hot);
await p.evaluate((c) => { window.__xc.map.easeTo({ center: c, zoom: 7.8, duration: 1600 }); }, hot);
await settle(p); await p.waitForTimeout(800);
const hotPt = await p.evaluate((c) => { const m = window.__xc.map, q = m.project(c), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, hot);
await perf('sido_hover', async () => { await glide(p, [hotPt[0] - 260, hotPt[1] + 140], hotPt, 40); await p.waitForTimeout(2600); });
await cdp.detach().catch(() => {});
await p.waitForFunction(() => { const t = document.querySelector('.xb-tipcard:not([hidden])'); return t && !/불러오는 중/.test(t.innerText); }, null, { timeout: 8000 }).catch(() => {});
run.steps.sido_hover = { tip: await p.evaluate(() => document.querySelector('.xb-tipcard:not([hidden])')?.innerText || null) };
await shot(p, 'b1-sido-hover');

if (process.env.STEPS) console.error('step ③', kst());
/* ③ 시군구 누름 → 내려가 객체 · 말풍선 */
await p.mouse.click(hotPt[0], hotPt[1]);
await p.waitForFunction(() => document.querySelector('.xb-pin.in'), null, { timeout: 20000 }).catch(() => {});
await settle(p); await p.waitForTimeout(2500);
run.steps.press = { pin: await p.evaluate(() => document.querySelector('.xb-pin')?.innerText || null), hud: await hudText(p), zoom: await p.evaluate(() => +window.__xc.map.getZoom().toFixed(2)) };
await shot(p, 'c1-sigungu-press');

if (process.env.STEPS) console.error('step ④', kst());
/* ④ 말풍선 업무 줄 → 그 업무만 · 원래대로 */
const rowBtn = p.locator('.xb-pin-rows button').nth(1);
if (await rowBtn.count()) {
  await rowBtn.click();
  await p.waitForTimeout(1500);
  run.steps.task_row = { task: await p.evaluate(() => window.__xc.task), hud: await hudText(p) };
  await shot(p, 'c2-task-row');
  await p.locator('.xb-reset').click();
  await p.waitForTimeout(800);
  run.steps.task_reset = { task: await p.evaluate(() => window.__xc.task) };
}

if (process.env.STEPS) console.error('step ⑤', kst());
/* ⑤ 읍면동 줌 — 전국 분석 칸 올림(끝난 칸이 있는 곳 · 화면에서 찾는다) */
await p.mouse.move(720, 480);
for (let k = 0; k < 3; k++) { await p.mouse.wheel(0, 160); await p.waitForTimeout(150); }   // 손으로 멀어지기(휠) — 누른 자리 말풍선이 닫힌다
await settle(p); await p.waitForTimeout(1200);
const find = () => p.evaluate(() => { const m = window.__xc.map, r = m.getCanvas().getBoundingClientRect();
  const ls = m.getStyle().layers.filter((l) => /^xn-.*-hit$/.test(l.id)).map((l) => l.id);
  for (let y = r.height * 0.3; y < r.height * 0.85; y += 17) for (let x = r.width * 0.35; x < r.width * 0.75; x += 17) { const f = m.queryRenderedFeatures([x, y], { layers: ls }).find((q) => q.properties.done); if (f) return [x + r.x, y + r.y]; }
  return null; });
let cpt = await find();
if (!cpt) { await p.evaluate(() => { window.__xc.map.jumpTo({ center: [127.15, 35.82], zoom: 9.2 }); }); await settle(p); await p.waitForTimeout(1500); cpt = await find(); }
if (cpt) { await glide(p, [cpt[0] - 120, cpt[1] + 40], cpt, 10); await p.waitForTimeout(900); }
run.steps.emd_hover = { tip: await p.evaluate(() => document.querySelector('.xb-tipcard:not([hidden])')?.innerText || null) };
await shot(p, 'd1-emd-hover');

if (process.env.STEPS) console.error('step ⑥', kst());
/* ⑥ XI ChatGEO — '비닐하우스만 보여 줘'(서버 업무 거르기 도구) · 전국 화면에서 */
await p.mouse.move(700, 880);
await p.evaluate(() => { window.__xc.map.jumpTo({ center: [127.6, 36.0], zoom: 6.4 }); });
await settle(p); await p.waitForTimeout(800);
await p.locator('.k-chat-fab').click();
await p.locator('.k-ck-i').fill('비닐하우스만 보여 줘');
await p.locator('.k-ck-i').press('Enter');
await p.waitForFunction(() => window.__xc.task === '비닐하우스', null, { timeout: 30000 }).catch(() => {});
await p.waitForTimeout(2500);
run.steps.chat_filter = { task: await p.evaluate(() => window.__xc.task), hud: await hudText(p), agent: await p.evaluate(() => (window.__xc.agent || []).slice(-1)[0] || null),
  answer: await p.evaluate(() => [...document.querySelectorAll('.k-chat-root [class*="msg"], .k-chat-root [class*="ans"]')].map((e) => e.innerText).filter(Boolean).slice(-1)[0] || null) };
await shot(p, 'e1-chat-filter');
await p.locator('.k-ck-i').fill('원래대로');
await p.locator('.k-ck-i').press('Enter');
await p.waitForFunction(() => window.__xc.task === null, null, { timeout: 30000 }).catch(() => {});
run.steps.chat_reset = { task: await p.evaluate(() => window.__xc.task ?? null) };
await p.locator('.k-chat-fab').click().catch(() => {});

if (process.env.STEPS) console.error('step ⑦', kst());
/* ⑦ 15초 녹화 — 전국 → 시군구 올림 → 누름(내려가 객체 · 말풍선) → 업무 줄 → 원래대로 */
await p.evaluate(() => { window.__xc.map.jumpTo({ center: [127.6, 36.0], zoom: 6.4 }); });
await settle(p); await p.waitForTimeout(600);
const recA = Date.now();
await p.waitForTimeout(1500);
await p.evaluate((c) => { window.__xc.map.easeTo({ center: c, zoom: 7.8, duration: 1800 }); }, hot);
await settle(p);
const hp = await p.evaluate((c) => { const m = window.__xc.map, q = m.project(c), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, hot);
await glide(p, [hp[0] - 300, hp[1] + 160], hp, 30);
await p.waitForTimeout(1500);
await p.mouse.click(hp[0], hp[1]);
await p.waitForFunction(() => document.querySelector('.xb-pin.in'), null, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(2200);
const rb = p.locator('.xb-pin-rows button').nth(1);
if (await rb.count()) { const bb = await rb.boundingBox(); await glide(p, [bb.x - 80, bb.y + 60], [bb.x + 30, bb.y + bb.height / 2], 12); await rb.click(); await p.waitForTimeout(2000); await p.locator('.xb-reset').click().catch(() => {}); }
await p.waitForTimeout(1500);
const recB = Date.now();
run.video = { from_s: (recA - rec0) / 1000, to_s: (recB - rec0) / 1000 };
await p.close();
await ctx.close();
await browser.close();

const vids = fs.readdirSync(VID).filter((f) => f.endsWith('.webm')).map((f) => path.join(VID, f)).sort((x, y) => fs.statSync(x).mtimeMs - fs.statSync(y).mtimeMs);
if (vids.length) {
  const len = Math.min(18, run.video.to_s - run.video.from_s);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(run.video.from_s), '-i', vids[0], '-t', String(len), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(DIR, 'ximap-15s.mp4')]);
  run.video.file = 'ximap-15s.mp4'; run.video.len_s = len;
}
fs.rmSync(VID, { recursive: true, force: true });
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
clearTimeout(guard);
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors, local: run.local.length, perf: run.perf, steps: run.steps, video: run.video }, null, 1));
