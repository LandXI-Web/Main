/* 마감 글 겹침 검사 — node landxi/v3/main/tools/fin-probe.mjs [outDir] [--mobile]
   ch6 → 마감을 사람 속도로 스크롤하며 매 프레임 창 아래 끝과 마감 글(모토·문장·버튼)의 보이는 위치를 기록한다.
   겹침 = 글 불투명도 > 0.02 인데 창 아래 끝 > 글 윗선. 같은 구간을 영상으로도 남기고 프레임을 뽑는다. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const mobile = args.includes('--mobile');
const out = args.find((a) => !a.startsWith('--')) || 'shots/final/main';
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const vp = mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const tag = mobile ? '390' : '1440';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxfin-'));

const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile, recordVideo: { dir, size: vp } });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
const t0 = Date.now();
await page.goto(BASE + '/landxi/v3/main/?dev=1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3500);
const yOf = (x) => page.evaluate((x) => document.querySelector('#trackB').getBoundingClientRect().top + scrollY + x * innerHeight, x);
// ch6 중간에서 멈춰 타일을 데운 뒤, 마감까지 사람 속도로
await page.evaluate((y) => scrollTo(0, y), await yOf(3 + 3.5 * 0.7));
await page.waitForTimeout(3000);
const tRec = (Date.now() - t0) / 1000;
await page.evaluate(() => { window.__fin = []; const f = () => {
  const S = window.__lxm, w = S && S.win, fin = document.querySelector('#fin');
  const parts = [...fin.querySelectorAll('.m-h span, .m-p, .m-cta')];
  const vis = parts.map((e) => ({ o: +getComputedStyle(e).opacity, top: e.getBoundingClientRect().top }));
  const o = Math.max(...vis.map((v) => v.o)), top = Math.min(...vis.map((v) => v.top));
  window.__fin.push({ t: performance.now(), t7: S ? +(S.t7 || 0).toFixed(3) : null, winBottom: w ? Math.round(w.y + w.h) : null, st: fin.dataset.st || '', o: +o.toFixed(3), textTop: Math.round(top) });
  if (window.__fin.length < 5000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
const from = await yOf(3 + 3.5 * 0.7), to = await yOf(6.5 + 2.5 * 0.95);
// 휠 사람 속도(120px 틱, 60ms 간격)
const steps = Math.ceil((to - from) / 120);
for (let i = 0; i < steps; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(60); }
await page.waitForTimeout(2500);
// 되감기(위로) — 다시 커지는 동안에도 겹침 0 인지
for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
await page.waitForTimeout(1500);
const rows = await page.evaluate(() => window.__fin);
const over = rows.filter((r) => r.o > 0.02 && r.winBottom != null && r.winBottom > r.textTop);
const firstIn = rows.find((r) => r.st === 'in');
const video = page.video();
await ctx.close(); await browser.close();
const vpath = await video.path();
const mp4 = path.join(out, `main-${tag}-fin-probe.mp4`);
execFileSync('ffmpeg', ['-y', '-ss', Math.max(0, tRec - 0.3).toFixed(2), '-i', vpath, '-c:v', 'libx264', '-crf', '26', '-pix_fmt', 'yuv420p', '-an', mp4], { stdio: 'ignore' });
// 프레임 6장(4fps 중 균등) → 한 장 몽타주
const png = path.join(out, `main-${tag}-fin-frames.png`);
execFileSync('ffmpeg', ['-y', '-i', mp4, '-vf', `fps=3,scale=${mobile ? 260 : 480}:-1,tile=6x2:padding=6:color=white`, '-frames:v', '1', png], { stdio: 'ignore' });
const res = { viewport: vp, frames: rows.length, overlap_frames: over.length, first_in: firstIn || null, max_winBottom_when_visible: Math.max(0, ...rows.filter((r) => r.o > 0.02).map((r) => r.winBottom)), text_top: firstIn ? firstIn.textTop : null, errors, mp4, png };
fs.writeFileSync(path.join(out, `fin-probe-${tag}.json`), JSON.stringify({ ...res, sample: rows.filter((_, i) => i % 6 === 0) }, null, 1));
console.log(JSON.stringify(res));
