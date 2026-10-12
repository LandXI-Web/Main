/* impl-20 XI맵 빛나는 밀도 → 실제 객체 증거 — 바깥 주소에서 지금 새로 찍는다(원칙 162). 로그인은 LX 직원 로그인 폼 한 번(세션 주입 0).
   node docs/superpowers/final/process/impl-20/ximap-glow/shoot.mjs   (01. 디자인 에서) → shots/*.png · glow-10s.mp4 · run.json
   ① 첫 화면 시간 3회(주소를 연 순간 → 빛이 지도에 그려지고 로딩 판이 걷힐 때까지) ② 전국 · 중간 · 확대 세 장면 + 올리면 요약
   ③ 10초 녹화(전국 → 올리면 요약 → 누르면 날아감 → 객체로 바뀜). 자리는 화면이 고른 '객체가 가장 많이 모인 칸'(고정값 없음). */
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
const run = { at: kst(), app: APP, shots: {}, first_view: [], errors: [], local: [] };
const shot = async (page, name) => { const f = `${name}-${hm()}.png`; await page.screenshot({ path: path.join(OUT, f) }); run.shots[f] = kst(); return f; };
setTimeout(() => { fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify({ ...run, timeout: true }, null, 2)); process.exit(2); }, 300000);

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir: VID, size: { width: 1440, height: 900 } } });
const p = await ctx.newPage();
const rec0 = Date.now();
p.on('console', (m) => { if (m.type() === 'error') run.errors.push(m.text().slice(0, 300)); });
p.on('pageerror', (e) => run.errors.push(String(e).slice(0, 300)));
p.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (!/ERR_ABORTED/.test(f)) (run.failed ||= []).push(`${f} ${r.url().replace(/[?#].*$/, '').slice(0, 120)}`); });
p.on('request', (r) => { if (/\/\/(127\.0\.0\.1|localhost|\[::1\])|:8700|:4173/.test(r.url())) run.local.push(r.url()); });
await frontDoor(p, APP, 'test@lx.or.kr', 'app');
await p.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 30000 });

/* ① 첫 화면 — 처음 · 다시 · 다시 */
const ready = () => { const x = window.__xc; const m = x?.map; return x?.boot?.shown && x.board?.glow > 0 && m && m.getStyle().layers.some((l) => l.type === 'heatmap' && /^xb-glow0/.test(l.id)); };   // 빛 층이 지도에 올라가고 로딩 판이 걷힘(바퀴 5 재기와 같은 기준 — 바탕 영상 타일은 기다리지 않음)
for (let i = 0; i < 3; i++) {
  const t0 = Date.now();
  await p.goto(APP + '/landxi/v3/xi-clean/', { waitUntil: 'commit' });
  await p.waitForFunction(ready, null, { timeout: 30000, polling: 50 });
  run.first_view.push({ wall_ms: Date.now() - t0, ...(await p.evaluate(() => ({ in_page_shown_ms: window.__xc.boot.shown, board_ms: window.__xc.board.at, nav_to_module_ms: Math.round(window.__xc.t0) }))) });
  if (i < 2) await p.waitForTimeout(1200);
}
const hot = await p.evaluate(() => window.__xc.board.hot);
run.hot = hot ? 'board.hot(가장 많이 모인 칸)' : null;
const px = (c) => p.evaluate((cc) => { const m = window.__xc.map, q = m.project(cc), r = m.getCanvas().getBoundingClientRect(); return [q.x + r.x, q.y + r.y]; }, c);

/* ③ 10초 녹화 — 전국 빛(2초) → 올리면 요약(2초) → 누르면 날아감 + 객체로 바뀜(6초) */
await p.waitForTimeout(2200);                                         // 빛이 서서히 켜짐(1.1초) 뒤
const recA = Date.now();
await p.waitForTimeout(1500);
let pt = await px(hot);
for (let k = 0; k <= 10; k++) { await p.mouse.move(pt[0] - 120 + k * 12, pt[1] + 60 - k * 6); await p.waitForTimeout(40); }
await p.waitForTimeout(1600);
await p.mouse.click(pt[0], pt[1]);
await p.waitForFunction(() => !window.__xc.map.isMoving() && window.__xc.map.getZoom() >= 11.5, null, { timeout: 15000 });
await p.evaluate(() => window.__xc.map.easeTo({ zoom: 12.4, duration: 1800 }));
// 객체가 그려질 때까지(바깥 터널로 조각을 받는 시간) 기다린 뒤 1.5초 더 — 녹화는 그 끝에서 10초
await p.waitForFunction(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id); return !m.isMoving() && ls.length && m.queryRenderedFeatures({ layers: ls }).length > 50; }, null, { timeout: 20000 }).catch(() => {});
await p.waitForTimeout(1500);
const recB = Date.now();
run.video = { from_s: (recA - rec0) / 1000, to_s: (recB - rec0) / 1000, objects_wait_s: (recB - recA) / 1000 };
run.after_click_zoom = await p.evaluate(() => Math.round(window.__xc.map.getZoom() * 10) / 10);

/* ② 세 장면 + 올리면 요약 */
await p.mouse.move(5, 450);
await p.evaluate(() => window.__xc.map.jumpTo({ center: [127.8, 36.1], zoom: 6.6 }));
await p.waitForTimeout(2500);
await shot(p, 'a1-national-glow-1440');
pt = await px(hot);
await p.mouse.move(pt[0] - 6, pt[1]); await p.mouse.move(pt[0], pt[1]);
await p.waitForTimeout(700);
run.tip = await p.evaluate(() => document.querySelector('.xb-tipcard:not([hidden])')?.innerText || null);
await shot(p, 'a2-hover-summary-1440');
await p.mouse.move(5, 450);
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 9.2 }), hot);
await p.waitForTimeout(3500);
await shot(p, 'b1-mid-glow-1440');
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 10.8 }), hot);
await p.waitForTimeout(4000);
await shot(p, 'b2-crossfade-1440');
await p.evaluate((c) => window.__xc.map.jumpTo({ center: c, zoom: 12.6 }), hot);
await p.waitForTimeout(4500);
await shot(p, 'c1-objects-1440');
run.objects = await p.evaluate(() => { const m = window.__xc.map; const ls = m.getStyle().layers.filter((l) => /^xb-r-.*-fill$/.test(l.id) && m.getLayoutProperty(l.id, 'visibility') !== 'none').map((l) => l.id); return ls.length ? m.queryRenderedFeatures({ layers: ls }).length : 0; });
run.layout = await p.evaluate(() => ({ pills: document.querySelectorAll('.xb-pill').length, sgg_fill: !!window.__xc.map.getLayer('xb-sgg-f'), heat: window.__xc.map.getStyle().layers.filter((l) => l.type === 'heatmap').length, over: document.documentElement.scrollWidth - innerWidth }));
/* 휴대폰 폭 한 장(줄바꿈 확인) */
await p.setViewportSize({ width: 390, height: 844 });
await p.evaluate(() => window.__xc.map.jumpTo({ center: [127.8, 36.0], zoom: 5.6 }));
await p.waitForTimeout(2500);
await shot(p, 'a3-national-390');

const v = p.video();
await ctx.close();
const raw = await v.path();
const mp4 = path.join(DIR, 'glow-10s.mp4');
// 10초 = 앞 4.5초(전국 빛 → 올리면 요약 → 누름 · 날아감) + 뒤 5.5초(객체가 그려진 뒤) — 먼 연결에서 조각을 기다린 가운데는 뺀다
const { from_s: A, to_s: Z } = run.video, cut = Z - A > 10.5;
const vf = cut ? `[0:v]trim=${A}:${A + 4.5},setpts=PTS-STARTPTS[a];[0:v]trim=${Z - 5.5}:${Z},setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[v]` : `[0:v]trim=${A}:${Z},setpts=PTS-STARTPTS[v]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-filter_complex', vf, '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-an', mp4]);
run.video.cut = cut ? `앞 4.5초 + 뒤 5.5초(가운데 ${Math.round((Z - A - 10) * 10) / 10}초 = 바깥 연결로 객체 조각을 받는 시간 · 뺌)` : null;
fs.rmSync(VID, { recursive: true, force: true });
run.video.file = 'glow-10s.mp4';
run.video.at = kst();
fs.writeFileSync(path.join(DIR, 'run.json'), JSON.stringify(run, null, 2));
console.log(JSON.stringify(run, null, 1));
await browser.close(); process.exit(0);
