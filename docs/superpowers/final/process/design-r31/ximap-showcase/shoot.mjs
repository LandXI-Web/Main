/* 설계 31 · XI맵 결과 표시 콘셉트 셋(원칙 259) 증거 — 바깥 주소 · 로그인 폼 한 번(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/design-r31/ximap-showcase/shoot.mjs   (01. 디자인 에서)
   W=1440(기본) · ONLY=now,A,B,C(쉼표) → shots/*.png · run-<W>.json · 녹화 셋 ximap-A-15s.mp4 · ximap-B-15s.mp4 · ximap-C-15s.mp4(한 녹화를 15초씩 자름)
   콘셉트마다: 지금 모양(now) · A 막대 + 빛 줄기 · A 막대에 올림(그 업무만) · B 무대에 쌓임 · C 말풍선 · C 누른 뒤 지도 위 통계 답 · fps(rAF 계수). */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { frontDoor } from '../../../../../../landxi/v3/kit/lint/forbidden.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'shots'), VID = path.join(DIR, 'video-raw');
fs.mkdirSync(OUT, { recursive: true });
const APP = process.env.APP || 'https://app.land-xi.dev';
const W = Number(process.env.W || 1440), H = W >= 1920 ? 1080 : 900;
const ONLY = new Set((process.env.ONLY || 'now,A,B,C').split(','));
const VIDEO = process.env.VIDEO !== '0';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, w: W, shots: {}, errors: [], local: [], bad: [], state: {}, fps: {}, clips: {} };
const save = () => fs.writeFileSync(path.join(DIR, `run-${W}.json`), JSON.stringify(run, null, 2));
const shot = async (p, name) => { const f = `${name}-${W}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 900000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(VIDEO ? { recordVideo: { dir: VID, size: { width: W, height: H } } } : {}) });
const p = await ctx.newPage();
const T0 = Date.now();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]') && document.querySelector('.xv-sw');
const fps = (ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); })(); }), ms);
const sc = () => p.evaluate(() => ({ ...(window.__xc.showcase || {}), hud: document.querySelector('.xb-hud')?.hidden, zoom: +window.__xc.map.getZoom().toFixed(2),
  small: [...document.querySelectorAll('.xs *')].filter((e) => e.children.length === 0 && e.textContent.trim() && parseFloat(getComputedStyle(e).fontSize) < 14).map((e) => e.textContent.trim().slice(0, 30)) }));
const pick = async (v) => { await p.locator(`.xv-sw button[data-v="${v}"]`).click(); await p.waitForTimeout(400); };
const mark = (k) => { run.clips[k] = { from: Math.round((Date.now() - T0) / 1000) }; };
/** 그 콘셉트 녹화가 15.5초를 채우도록 기다린 뒤 끝 시각을 적는다 */
const until15 = async (k) => { const el = (Date.now() - T0) / 1000 - run.clips[k].from; if (el < 15.5) await p.waitForTimeout((15.5 - el) * 1000); run.clips[k].to = Math.round((Date.now() - T0) / 1000); };

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
await settle(); await p.waitForTimeout(1200);
await p.locator('.xo-sw button[data-v="map"]').click().catch(() => {});
await pick('now');
if (ONLY.has('now')) { run.state.now = await p.evaluate(() => ({ hud: window.__xc.hud, hidden: document.querySelector('.xb-hud')?.hidden })); await shot(p, 'now-national'); }

/* A — 지도가 곧 계기판 */
if (ONLY.has('A')) {
  mark('A');
  await pick('A');
  await p.waitForFunction(() => window.__xc.showcase?.mode === 'A' && window.__xc.showcase.streaks > 0, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1500);
  run.fps.A = await fps(2000);
  run.state.A = await sc();
  await shot(p, 'A-gauge');
  const row = p.locator('.xs-a-row').nth(1);
  if (await row.count()) { await row.hover(); await p.waitForTimeout(1200); run.state.A_hover = await sc(); await shot(p, 'A-hover-task'); await p.mouse.move(W / 2, H / 2); await p.waitForTimeout(600); }
  await until15('A');
}
/* B — 방금 찾은 것 흐름 */
if (ONLY.has('B')) {
  mark('B');
  await pick('B');
  await p.waitForFunction(() => window.__xc.showcase?.mode === 'B' && window.__xc.showcase.shown >= 2, null, { timeout: 40000 }).catch(() => {});
  run.fps.B = await fps(2000);
  await p.waitForFunction(() => window.__xc.showcase?.shown >= 4, null, { timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(800);
  run.state.B = await sc();
  run.state.B_cards = await p.evaluate(() => [...document.querySelectorAll('.xs-b-it')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()).concat([document.querySelector('.xs-b-h')?.innerText.replace(/\s+/g, ' ').trim()]));
  await shot(p, 'B-fresh');
  await until15('B');
  // 카드를 누르면 그 자리로
  const card = p.locator('.xs-b-it button').first();
  if (await card.count()) { await card.click(); await p.waitForTimeout(3500); await settle(); run.state.B_fly = await sc(); await shot(p, 'B-fly-to'); }
  await p.evaluate(() => window.__xc.stage.home({ ms: 0 })); await settle(); await p.waitForTimeout(800);
}
/* C — 말을 거는 지도 */
if (ONLY.has('C')) {
  mark('C');
  await pick('C');
  await p.waitForFunction(() => window.__xc.showcase?.mode === 'C' && window.__xc.showcase.bubbles?.length >= 2, null, { timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(1600);
  run.fps.C = await fps(2000);
  run.state.C = await sc();
  await shot(p, 'C-bubbles');
  const bub = p.locator('.xs-c-bub').first();
  if (await bub.count()) {
    run.state.C_q = await bub.innerText();
    await bub.hover({ force: true }); await p.waitForTimeout(500);
    await bub.click({ force: true });
    const ok = await p.waitForFunction(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'done', null, { timeout: 60000 }).then(() => true, () => false);
    await settle(); await p.waitForTimeout(1200);
    run.state.C_answer = { ok, ...(await p.evaluate(() => ({ head: document.querySelector('.xo-head')?.innerText.replace(/\s+/g, ' ').trim(), tags: document.querySelectorAll('.xo-tag').length, bubblesHidden: getComputedStyle(document.querySelector('.xs')).display === 'none' }))) };
    await shot(p, 'C-answer-onmap');
    await until15('C');
    await p.locator('.xo-x').click().catch(() => {}); await p.waitForTimeout(1500); await settle();
    run.state.C_back = await sc();
    await shot(p, 'C-back');
  }
}
await pick('now');
run.state.end = await p.evaluate(() => ({ hudHidden: document.querySelector('.xb-hud')?.hidden, showcase: window.__xc.showcase }));

clearTimeout(guard);
run.done = kst();
save();
const vid = p.video();
await ctx.close(); await browser.close();
if (vid) {
  const src = await vid.path();
  for (const [k, c] of Object.entries(run.clips)) {
    if (c.to == null) continue;
    const out = path.join(DIR, `ximap-${k}-15s.mp4`);
    try { execFileSync('ffmpeg', ['-y', '-ss', String(c.from), '-i', src, '-t', '15', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', out], { stdio: 'ignore' }); c.file = path.basename(out); }
    catch (e) { c.err = String(e).slice(0, 200); }
  }
  save();
}
console.log(JSON.stringify({ errors: run.errors.length, bad: run.bad.length, local: run.local.length, fps: run.fps, shots: Object.keys(run.shots), clips: run.clips }, null, 1));
