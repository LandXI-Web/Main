/* 구현 37 · XI맵 통계 '지도 위' 표출(원칙 258) 증거 — 바깥 주소 · 로그인 폼(LX 직원 · 세션 주입 0).
   node docs/superpowers/final/process/impl-37/ximap-onmap/shoot.mjs   (01. 디자인 에서)
   W=1440|1920 · ONLY=d1,d2,…,d7,video(쉼표) → shots/*.png · run-<W>.json · ximap-onmap-20s.mp4
   질문마다: 지도가 차오르고 꼬리표가 뜬 순간(…-fill) · 1위로 날아간 순간(d1 …-tour) · 판 막대에 올려 지도가 따라오는 순간(d1 …-hover) · fps(차오름 · 날아가기 동안 rAF 계수). */
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
const QS = [['d1', '남원시 현황 보여 줘'], ['d2', '남원시 비닐하우스 어디가 많아?'], ['d3', '남원시 농지 이용 실태 어때?'], ['d4', '전국 분석 얼마나 진행됐어?'],
  ['d5', '남원시 함양군 비교해 줘'], ['d6', '남원시 지목별 공시지가 통계'], ['d7', '함양군 현황 보여 줘']];
const ONLY = new Set((process.env.ONLY || (W >= 1920 ? 'd1,d2,d3' : 'd1,d2,d3,d4,d5,d6,d7,video')).split(','));
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, w: W, shots: {}, errors: [], local: [], bad: [], dash: {}, fps: {} };
const save = () => fs.writeFileSync(path.join(DIR, `run-${W}${ONLY.has('video') && ONLY.size === 1 ? '-video' : ''}.json`), JSON.stringify(run, null, 2));
const shot = async (p, name) => { const f = `${name}-${W}-${hm()}.png`; await p.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
const guard = setTimeout(() => { run.timeout = true; save(); process.exit(2); }, 1200000);

const video = ONLY.has('video');
const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, ...(video ? { recordVideo: { dir: VID, size: { width: W, height: H } } } : {}) });
const p = await ctx.newPage();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
p.on('response', (r) => { if (r.status() >= 400) run.bad.push(`${kst().slice(11)} ${r.status()} ${r.url().replace(/[?#].*$/, '').slice(0, 160)}`); });
const settle = () => p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.areTilesLoaded(), null, { timeout: 25000 }).catch(() => {});
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown && document.querySelector('.k-chat-root[data-dock]');
async function home() {
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 60000, polling: 100 });
  await settle(); await p.waitForTimeout(1200);
  await p.locator('.xo-sw button[data-v="map"]').click().catch(() => {});       // 기본 '지도 위'(이 브라우저 기억이 '대시보드'여도 되돌림)
}
const say = async (q) => {
  const inp = p.locator('.k-chat-root[data-dock] .k-ck-i');
  await inp.click(); await inp.fill(''); await inp.pressSequentially(q, { delay: 20 }); await inp.press('Enter');
};
/** rAF 계수 — ms 동안 프레임 수 → fps(탭이 보일 때만 돈다) */
const fps = (ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); (function f() { n++; if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(Math.round((n * 1000) / (performance.now() - t0))); })(); }), ms);
const state = () => p.evaluate(() => ({ ...window.__xc.dash, panel: [...document.querySelectorAll('.xo-ph span')].map((x) => x.textContent), open: [...document.querySelectorAll('.xo-p.open .xo-ph span')].map((x) => x.textContent),
  head: document.querySelector('.xo-head')?.innerText.replace(/\s+/g, ' ').trim(), tagsOnMap: document.querySelectorAll('.xo-tag').length, answer: [...document.querySelectorAll('.k-chat-msg.ai .k-chat-bub')].pop()?.innerText || '',
  dashHidden: document.querySelector('.xd')?.hidden ?? true, zoom: +window.__xc.map.getZoom().toFixed(2) }));

await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });
await home();

for (const [id, q] of QS) {
  if (!ONLY.has(id)) continue;
  await p.evaluate(() => { window.__xc.dash = null; });
  await say(q);
  const ok = await p.waitForFunction(() => window.__xc.dash?.mode === 'map' && window.__xc.dash.fill === 'running', null, { timeout: 60000 }).then(() => true, () => false);
  if (!ok) { run.dash[id] = { q, fail: true, ...(await state().catch(() => ({}))) }; await shot(p, id + '-fail'); continue; }
  const fillFps = fps(1400);
  await p.waitForFunction(() => window.__xc.dash?.fill === 'done', null, { timeout: 20000 }).catch(() => {});
  run.fps[id + '-fill'] = await fillFps;
  await settle(); await p.waitForTimeout(900);                               // 꼬리표가 떠오르고 대화 칸이 접힌 뒤 · 날아가기 전
  run.dash[id] = { q, at: kst(), ...(await state()) };
  await shot(p, id + '-fill');
  if (id === 'd1' || id === 'd4') {
    await p.waitForTimeout(1900);                                             // 1위에 닿은 순간
    run.fps[id + '-tour'] = await fps(2000);
    await shot(p, id + '-tour');
  }
  await p.waitForFunction(() => window.__xc.dash?.tour && window.__xc.dash.tour !== null, null, { timeout: 30000 }).catch(() => {});
  await settle(); await p.waitForTimeout(600);
  run.dash[id].tour = await p.evaluate(() => window.__xc.dash?.tour);
  if (id === 'd1') {                                                          // 판 막대에 올리면 지도 그 곳이 떠오름 · 누르면 날아감
    const idx = await p.evaluate(() => { const ks = new Set((window.__xc.map.getSource('xo-f')?._data?.features || []).map((f) => f.properties.k)); return [...document.querySelectorAll('.xo-p.open [data-k]')].findIndex((r, i) => i > 0 && ks.has(r.dataset.k)); });
    const row = p.locator('.xo-p.open [data-k]').nth(Math.max(1, idx));
    if (await row.count()) {
      await row.hover(); await p.waitForTimeout(700);
      run.dash[id].hover = await p.evaluate(() => ({ tag: [...document.querySelectorAll('.xo-tag.is-hover, .xo-tag.is-hv')].map((t) => t.innerText.replace(/\s+/g, ' ')), row: document.querySelector('.xo-p.open [data-k].hv')?.textContent }));
      await shot(p, id + '-hover');
      await row.click(); await settle(); await p.waitForTimeout(900);
      run.dash[id].pick = await p.evaluate(() => ({ sel: document.querySelector('.xo-p.open [data-k].on')?.textContent, zoom: +window.__xc.map.getZoom().toFixed(2) }));
      await shot(p, id + '-pick');
    }
  }
  if (id === 'd6') {                                                          // 표 카드 펼쳐 보기
    const ph = p.locator('.xo-p--table .xo-ph'); if (await ph.count()) { await ph.click(); await p.waitForTimeout(500); await shot(p, id + '-table'); }
  }
  await p.locator('.xo-x').click().catch(() => {}); await p.waitForTimeout(1500); await settle();
}

if (video) {
  /* 20초 녹화 — 질문 → 지도가 차오름 → 꼬리표 → 1~3위로 날아감 → 판 막대에 올림 → 누름 → 닫기 */
  await home();
  const v0 = Date.now();
  await say('남원시 비닐하우스 어디가 많아?');
  await p.waitForFunction(() => window.__xc.dash?.fill === 'done', null, { timeout: 60000 });
  await p.waitForFunction(() => window.__xc.dash?.tour === 'done', null, { timeout: 30000 }).catch(() => {});
  await settle();
  const idx = await p.evaluate(() => { const ks = new Set((window.__xc.map.getSource('xo-f')?._data?.features || []).map((f) => f.properties.k)); return [...document.querySelectorAll('.xo-p.open [data-k]')].findIndex((r, i) => i > 0 && ks.has(r.dataset.k)); });
  const row = p.locator('.xo-p.open [data-k]').nth(Math.max(1, idx));
  if (await row.count()) { await row.hover(); await p.waitForTimeout(1200); await row.click(); await p.waitForTimeout(2200); }
  await p.locator('.xo-x').click(); await p.waitForTimeout(1600);
  run.video_s = Math.round((Date.now() - v0) / 1000);
}

clearTimeout(guard);
run.done = kst();
save();
const vid = p.video();
await ctx.close(); await browser.close();
if (vid) {
  const src = await vid.path(), out = path.join(DIR, 'ximap-onmap-20s.mp4');
  try {
    const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', src]).toString().trim();
    const ss = Math.max(0, Number(probe) - run.video_s - 0.5);
    execFileSync('ffmpeg', ['-y', '-ss', String(ss.toFixed(1)), '-i', src, '-t', String(Math.min(26, run.video_s + 1)), '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-an', out], { stdio: 'ignore' });
    run.video = path.basename(out); save();
  } catch (e) { run.video_err = String(e).slice(0, 200); save(); }
  fs.rmSync(VID, { recursive: true, force: true });
}
console.log(JSON.stringify({ w: W, errors: run.errors, bad: run.bad.length, local: run.local.length, shots: Object.keys(run.shots).length, fps: run.fps, dash: Object.fromEntries(Object.entries(run.dash).map(([k, v]) => [k, { fail: v.fail, fill: v.fill, tags: v.tagsOnMap, tour: v.tour, n: v.map?.n, hover: v.hover, pick: v.pick }])) }));
