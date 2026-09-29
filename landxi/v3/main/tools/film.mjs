/* 게스트 메인 동작 영상(≤ 20s · 1440×900) — node landxi/v3/main/tools/film.mjs [outDir]
   1회차(녹화 없음)로 타일을 데우고, 2회차를 녹화한다: 메인 7장 스크롤 → 마감 '로그인' → 정문 폼 입력(lx-staff) → 착지. */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const out = process.argv[2] || 'shots/final/main';
fs.mkdirSync(out, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:4173';
const vp = { width: 1440, height: 900 };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lxmain-'));
const vdir = path.join(dir, 'v');
const args = ['--enable-gpu', '--ignore-gpu-blocklist'];

// 스크롤 경로: [목표(화면 단위 · 트랙) , 이동 ms, 머묾 ms]
// 2차 판정: 앞 구간을 줄여(스크롤 ≈13s) 정문 폼 입력 → 콘솔 착지까지 20초 안에 담는다. 마감은 창이 다 줄 때까지(글 등장) 머문다.
const PATH = [['A', 0.2, 0, 300], ['A', 2.5 + 4 * 0.66, 1500, 400], ['A', 6.5 + 4 * 0.62, 1300, 400], ['A', 6.5 + 4 * 0.86, 500, 150], ['A', 10.5 + 4.5 * 0.88, 1300, 300],
  ['S', 0, 700, 300], ['B', 1.5, 700, 300], ['B', 3 + 3.5 * 0.72, 1000, 300], ['B', 6.5 + 2.5 * 0.85, 800, 900]];

async function run(record) {
  const ctx = await chromium.launchPersistentContext(dir, { channel: 'chrome', args, viewport: vp, ...(record ? { recordVideo: { dir: vdir, size: vp } } : {}) });
  const page = ctx.pages()[0] || await ctx.newPage();
  const errors = [], marks = {};
  const mark = (k) => { marks[k] = Date.now() - t0; };
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(BASE + '/landxi/v3/main/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(record ? 1400 : 4000);
  const tStart = Date.now() - t0;
  for (const [tr, x, ms, hold] of PATH) {
    const y = await page.evaluate(([tr, x]) => {
      if (tr === 'S') return document.querySelector('#ch4').getBoundingClientRect().top + scrollY + 40;
      const el = document.querySelector(tr === 'A' ? '#trackA' : '#trackB');
      return el.getBoundingClientRect().top + scrollY + x * innerHeight;
    }, [tr, x]);
    await page.evaluate(([y, ms]) => new Promise((res) => {
      const y0 = scrollY, t0 = performance.now();
      const e = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      const step = (now) => { const p = ms ? Math.min(1, (now - t0) / ms) : 1; scrollTo(0, y0 + (y - y0) * e(p)); if (p < 1) requestAnimationFrame(step); else res(); };
      requestAnimationFrame(step);
    }), [y, ms]);
    await page.waitForTimeout(record ? hold : 2500);
  }
  mark('scrolled');
  // 마감 '로그인' → 정문 폼 입력
  await page.locator('#fin a.t-btn').click();
  await page.waitForURL(/\/landxi\/v3\/login\//);
  mark('login_page');
  await page.waitForTimeout(record ? 500 : 1500);
  await page.locator('input[name=login], input[autocomplete=username], input[type=text]').first().pressSequentially('lx-staff', { delay: record ? 25 : 0 });
  await page.locator('input[type=password]').first().fill(process.env.LX_PW || 'landxi-dev-2026');
  mark('typed');
  await Promise.all([page.waitForURL((u) => !/\/login\/?$/.test(u.pathname), { timeout: 15000 }), page.locator('input[type=password]').first().press('Enter')]);
  const tLand = Date.now() - t0;
  await page.waitForTimeout(record ? 3500 : 500);
  const landed = page.url();
  const landedShot = record ? await page.screenshot({ path: path.join(out, 'main-1440-film-landed.png') }).then(() => true) : false;
  if (!record) { await page.evaluate(() => { try { localStorage.removeItem('lx_api_session'); } catch {} }); }
  const video = record ? page.video() : null;
  await ctx.close();
  return { marks, tStart, tLand, landedShot, errors, landed, video: video ? await video.path() : null, total: Date.now() - t0 };
}

await run(false);
const r = await run(true);
const mp4 = path.join(out, 'main-1440.mp4');
const { execFileSync } = await import('node:child_process');
const ss = Math.max(0, r.tStart / 1000 - 0.3).toFixed(2);
execFileSync('ffmpeg', ['-y', '-ss', ss, '-i', r.video, '-t', '20', '-c:v', 'libx264', '-preset', 'slow', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4], { stdio: 'ignore' });
console.log(JSON.stringify({ mp4, landed: r.landed, land_at_s: +(r.tLand / 1000 - ss).toFixed(2), end_at_s: +(r.total / 1000 - ss).toFixed(2), errors: r.errors, marks: r.marks, start_s: ss, total_ms: r.total }));
