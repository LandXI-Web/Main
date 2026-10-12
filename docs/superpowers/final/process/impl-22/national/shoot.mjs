/* 구현 22 · 전국 결과 자산 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인 폼(LX 직원 · LX 관리자 각 한 번 · 세션 주입 0).
   node docs/superpowers/final/process/impl-22/national/shoot.mjs   (01. 디자인 에서) → shots/*.png · national-10s.mp4 · run.json
   ① XI맵 전국(1440) — 빛 0 · 전국 결과 자산 칸 · 빗금 '분석 예정' ② 올리면 요약 ③ 하천 · 계곡으로 바꾸기
   ④ 시험 칸(낮 시험 · 시험 표시 — ?natTest=1 일 때만 보임 · 숫자에 들어가지 않음) 결과 면 → 확대 객체
   ⑤ 10초 녹화(전국 → 올리면 요약 → 누르면 날아감 → 시험 칸 객체) ⑥ LX 관리자 대시보드 진행 한 줄 */
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
const ADMIN = process.env.ADMIN || 'https://admin.land-xi.dev';
const kst = () => new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' });
const hm = () => kst().slice(11, 16).replace(':', '');
const run = { at: kst(), app: APP, shots: {}, errors: [], local: [] };
const shot = async (page, name) => { const f = `${name}-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 360000);
const watch = (p) => {
  p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
  p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
  p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
};
const ready = () => window.__xc?.board?.nat?.layers?.length > 0 && window.__xc.boot?.shown;
const offLandcover = (p) => p.evaluate(() => { for (const b of document.querySelectorAll('.xb-chip')) if (/토지피복/.test(b.textContent) && b.getAttribute('aria-pressed') === 'true') b.click(); });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
const rec0 = Date.now();
watch(p);
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });

/* ① 전국 */
const t0 = Date.now();
await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 40000, polling: 50 });
run.first_view_ms = Date.now() - t0;
await p.waitForTimeout(3500);
run.heatmap_layers = await p.evaluate(() => window.__xc.map.getStyle().layers.filter((l) => l.type === 'heatmap').length);
run.hud = await p.evaluate(() => document.querySelector('.xna-card')?.innerText || null);
await shot(p, 'a1-national-farm-1440');
/* ② 올리면 요약 — 화면에서 칸이 있는 자리를 찾는다(고정 좌표 없이) */
const find = () => p.evaluate(() => { const m = window.__xc.map, r = m.getCanvas().getBoundingClientRect();
  for (let y = r.height * 0.35; y < r.height * 0.85; y += 17) for (let x = r.width * 0.45; x < r.width * 0.75; x += 17) if (m.queryRenderedFeatures([x, y], { layers: ['xn-hit'] }).length) return [x + r.x, y + r.y];
  return null; });
let pt = await find();
if (pt) { await p.mouse.move(pt[0] - 6, pt[1]); await p.mouse.move(pt[0], pt[1]); await p.waitForTimeout(700); }
run.tip = await p.evaluate(() => document.querySelector('.xb-tipcard:not([hidden])')?.innerText || null);
await shot(p, 'a2-hover-summary-1440');
/* ③ 하천 · 계곡 */
await p.mouse.move(5, 450);
await p.locator('.xna-chip', { hasText: '하천' }).click();
await p.waitForTimeout(3000);
run.hud_river = await p.evaluate(() => document.querySelector('.xna-card')?.innerText || null);
await shot(p, 'a3-national-river-1440');
await p.locator('.xna-chip', { hasText: '농지' }).click();

/* ④ ⑤ 시험 칸(낮 시험 · 시험 표시) — 결과 면 → 누르면 날아감 → 객체 · 10초 녹화 */
await p.goto(APP + '/landxi/v3/xi-clean/?natTest=1', { waitUntil: 'commit' });
await p.waitForFunction(ready, null, { timeout: 40000, polling: 50 });
await offLandcover(p);
const TC = [127.3817, 35.4182];                      // 낮 시험 칸의 가운데(서버 장부 · 시험 작업 결과 범위에서 셈 — run.json test_cell)
run.test_cell = { center: TC, note: '남원시 향교동 · 시험 표시 · XI맵 숫자에 들어가지 않음' };
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 9.6 }), TC);
await p.waitForTimeout(4000);
await shot(p, 'b1-test-cell-faces-1440');
const recA = Date.now();
await p.waitForTimeout(1200);
pt = await p.evaluate((c) => { const m = window.__xc.map, q = m.project(c), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, TC);
for (let k = 0; k <= 10; k++) { await p.mouse.move(pt[0] - 120 + k * 12, pt[1] + 60 - k * 6); await p.waitForTimeout(40); }
await p.waitForTimeout(1500);
await p.mouse.click(pt[0], pt[1]);
await p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.getZoom() >= 11.5, null, { timeout: 15000 });
await p.evaluate(() => window.__xc.map.easeTo({ zoom: 13.6, duration: 2200 }));
await p.waitForFunction(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xn-o-.*-f$/.test(l.id)).map((l) => l.id);
  return !m.isMoving() && ls.length && m.queryRenderedFeatures({ layers: ls }).length > 20; }, null, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(1500);
const recB = Date.now();
run.video = { from_s: (recA - rec0) / 1000, to_s: (recB - rec0) / 1000 };
run.objects = await p.evaluate(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xn-o-.*-f$/.test(l.id)).map((l) => l.id); return ls.length ? m.queryRenderedFeatures({ layers: ls }).length : 0; });
await shot(p, 'b2-test-cell-objects-1440');
await p.close();
await ctx.close();

/* ⑥ LX 관리자 대시보드 — 진행 한 줄 */
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

/* 10초 녹화 자르기 */
const vids = fs.readdirSync(VID).filter((f) => f.endsWith('.webm')).map((f) => path.join(VID, f)).sort((x, y) => fs.statSync(x).mtimeMs - fs.statSync(y).mtimeMs);
if (vids.length) {
  const ss = Math.max(0, run.video.to_s - 10);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(ss), '-i', vids[0], '-t', '10', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', path.join(DIR, 'national-10s.mp4')]);
  run.video.file = 'national-10s.mp4';
  run.video.cut_from_s = ss;
}
fs.rmSync(VID, { recursive: true, force: true });
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify({ shots: Object.keys(run.shots), errors: run.errors.length, local: run.local.length, video: run.video, admin: run.admin_line, objects: run.objects }, null, 1));
