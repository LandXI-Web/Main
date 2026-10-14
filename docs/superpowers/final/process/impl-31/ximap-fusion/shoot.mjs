/* 구현 31 · XI맵 채팅 창 되돌림 · 말로 거르기 · 융합 대시보드 증거 — 바깥 주소에서 지금 새로 찍는다. 로그인 폼(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-31/ximap-fusion/shoot.mjs   (01. 디자인 에서) → shots/*.png · ximap-fusion-20s.mp4 · run.json
   ONLY=shots | video 로 나눠 찍을 수 있다. */
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
const ONLY = process.env.ONLY || '';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [], bad: [], dash: {}, steps: {} };
const shot = async (page, name) => { const f = `${name}-1440-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 600000);
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
  p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
};
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.xb-hud .xb-big') && document.querySelector('.k-chat-root[data-dock]');
const settle = (p) => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 20000 }).catch(() => {});
const say = async (p, q) => {
  const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
  await inp.click(); await inp.fill('');
  await inp.pressSequentially(q, { delay: 35 });
  await inp.press('Enter');
  await p.waitForFunction(() => document.querySelector('.k-chat')?.dataset.state && document.querySelector('.k-chat').dataset.state !== 'busy', null, { timeout: 60000 }).catch(() => {});
};
const askDash = async (p, q, name) => {
  const before = await p.evaluate(() => window.__xc.dashN || 0);
  await p.evaluate(() => { window.__xc.dashN = (window.__xc.dashN || 0) + 1; window.__xc.dash = null; });
  await say(p, q);
  const ok = await p.waitForFunction(() => window.__xc.dash?.title && !document.querySelector('.xd').hidden, null, { timeout: 60000 }).then(() => true, () => false);
  if (!ok) { run.dash[name] = { q, fail: true, answer: await p.evaluate(() => [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText || ''), agent: await p.evaluate(() => (window.__xc.agent || []).slice(-3)) }; return shot(p, name + '-fail'); }
  await settle(p); await p.waitForTimeout(1600);
  const d = await p.evaluate(() => ({ ...window.__xc.dash, kpis: [...document.querySelectorAll('.xd-kpi')].map((k) => k.innerText.replace(/\s+/g, ' ').trim()),
    say: [...document.querySelectorAll('.xd-say p:not(.xd-sayh)')].map((x) => x.innerText), answer: [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText || '' }));
  run.dash[name] = { q, ...d, at: kst() }; void before;
  return shot(p, name);
};

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...(ONLY !== 'shots' ? { recordVideo: { dir: VID, size: { width: 1440, height: 900 } } } : {}) });
const p = await ctx.newPage();
watch(p);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
const rec0 = Date.now();
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
await settle(p); await p.waitForTimeout(1200);

if (ONLY !== 'video') {
  /* ① 첫 화면 — 아래 가운데 XI ChatGEO 채팅 창 · 오른쪽 칸 없음 · 오른쪽 아래 버튼 없음 */
  run.steps.first = await p.evaluate(() => ({ dock: !!document.querySelector('.k-chat-root[data-dock]'), fab_visible: !!document.querySelector('.k-chat-fab')?.offsetParent,
    right_panel: [...document.querySelectorAll('.xb-evo, .evo, .k-chat:not([hidden])')].filter((e) => { const r = e.getBoundingClientRect(); return r.left > innerWidth * 0.6 && r.height > 200; }).length,
    bar: (() => { const r = document.querySelector('.k-chat-root[data-dock] .k-chat-in').getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })(),
    chips: [...document.querySelectorAll('.k-chat-root[data-dock] .k-chat-sugg .k-chat-chip')].map((b) => b.textContent) }));
  await shot(p, 'a1-chat-bottom');
  /* ② 말로 거르기 — 비닐하우스만 → 원래대로(답은 채팅 창 말풍선 그대로) */
  await say(p, '비닐하우스만 보여 줘');
  await p.waitForFunction(() => window.__xc.task === '비닐하우스', null, { timeout: 15000 }).catch(() => {});
  await settle(p); await p.waitForTimeout(1200);
  run.steps.filter = await p.evaluate(() => ({ task: window.__xc.task, hud: document.querySelector('.xb-hud')?.innerText, answer: [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText }));
  await shot(p, 'b1-say-filter');
  await say(p, '원래대로');
  await p.waitForFunction(() => !window.__xc.task, null, { timeout: 15000 }).catch(() => {});
  await settle(p); await p.waitForTimeout(800);
  run.steps.reset = await p.evaluate(() => ({ task: window.__xc.task, hud: document.querySelector('.xb-hud')?.innerText, answer: [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText }));
  await shot(p, 'b2-say-reset');
  /* ③ 대시보드 — 서로 다른 질문 일곱 */
  await askDash(p, '남원시 현황 보여 줘', 'd1-overview-namwon');
  // 막대(순위 줄) 누름 → 지도가 그 읍면동으로
  const row = p.locator('.xd-rank tr[data-k]').nth(1);
  if (await row.count()) { await row.click(); await settle(p); await p.waitForTimeout(900); run.steps.pick = await p.evaluate(() => ({ sel: document.querySelector('.xd-rank tr.on td.n')?.innerText, zoom: +window.__xc.map.getZoom().toFixed(2) })); await shot(p, 'd1b-pick-row'); }
  await askDash(p, '남원시 비닐하우스 어디가 많아?', 'd2-task-greenhouse');
  await askDash(p, '남원시 농지 이용 실태 어때?', 'd3-survey');
  await askDash(p, '전국 분석 얼마나 진행됐어?', 'd4-time');
  await askDash(p, '남원시 함양군 비교해 줘', 'd5-compare');
  await askDash(p, '남원시 지목별 공시지가 통계', 'd6-jimok');
  await askDash(p, '함양군 현황 보여 줘', 'd7-overview-hamyang');
  await p.locator('.xd-back').click(); await p.waitForTimeout(1600); await settle(p);
  run.steps.back = await p.evaluate(() => ({ dash: document.querySelector('[data-dash="1"]') ? 1 : 0, hud: document.querySelector('.xb-hud')?.innerText }));
  await shot(p, 'e1-back-map');
}

if (ONLY !== 'shots') {
  /* 20초 녹화 — 아래 채팅 창 → 말로 거르기 → 원래대로 → 대시보드 → 막대 누름 → 지도로 돌아가기 */
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
  await settle(p); await p.waitForTimeout(600);
  const v0 = Date.now();
  await say(p, '비닐하우스만 보여 줘'); await p.waitForTimeout(1600);
  await say(p, '원래대로'); await p.waitForTimeout(900);
  await say(p, '남원시 비닐하우스 어디가 많아?');
  await p.waitForFunction(() => window.__xc.dash?.title, null, { timeout: 60000 }); await p.waitForTimeout(2600);
  const b = p.locator('.xd-b, .xd-hr').nth(2); if (await b.count()) { await b.click(); await p.waitForTimeout(1800); }
  await p.locator('.xd-back').click(); await p.waitForTimeout(2200);
  run.video_s = Math.round((Date.now() - v0) / 1000);
  run.video_start_s = Math.round((v0 - rec0) / 1000);
}

run.done_at = kst();
const vid = p.video();
await ctx.close(); await browser.close();
if (vid) {
  const src = await vid.path();
  const out = path.join(DIR, 'ximap-fusion-20s.mp4');
  try {
    execFileSync('ffmpeg', ['-y', '-ss', String(Math.max(0, run.video_start_s + 0)), '-i', src, '-t', String(Math.min(24, run.video_s + 1)), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', out], { stdio: 'ignore' });
    run.video = path.basename(out);
  } catch (e) { run.video_err = String(e).slice(0, 200); }
  fs.rmSync(VID, { recursive: true, force: true });
}
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
clearTimeout(guard);
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors.length, bad: run.bad.length, local: run.local.length, video: run.video, video_s: run.video_s }, null, 1));
