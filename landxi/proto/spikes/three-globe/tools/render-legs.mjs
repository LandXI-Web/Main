// SPIKE 레그 렌더러 — three.js 글로브를 스크럽용 mp4 두 편으로 굽는다.
//   node tools/serve.mjs &
//   node landxi/proto/spikes/three-globe/tools/render-legs.mjs [legName ...]
//
// window.__spike.setLeg(name) → render(p) 로 프레임을 못박고 25fps 1280×720 PNG 로 찍는다.
// 씸 규칙: orbit-korea 의 마지막 프레임 = cloud-break 의 첫 프레임(가상 시각을 이어 붙인다).
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PORT = process.env.PORT || 4173;
const W = 1280, H = 720, FPS = 25;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const OUT = path.resolve(ROOT, 'landxi/assets/proto/film/legs/src');
const TMP = path.resolve(ROOT, 'build/film/legs');
fs.mkdirSync(OUT, { recursive: true });

const only = process.argv.slice(2);

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--force-color-profile=srgb', '--hide-scrollbars', '--use-angle=d3d11',
         '--ignore-gpu-blocklist', '--enable-gpu-rasterization'],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text().slice(0, 160)); });
await page.goto(`http://localhost:${PORT}/landxi/proto/spikes/three-globe/?film=1`, { waitUntil: 'load' });
await page.waitForFunction('window.__spike && window.__spike.loaded()', null, { timeout: 180000 });
await page.waitForTimeout(1500);

const legs = await page.evaluate('__spike.legs()');
const names = only.length ? only : Object.keys(legs);
const report = [];

for (const name of names) {
  const meta = await page.evaluate((n) => window.__spike.setLeg(n), name);
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const N = meta.frames;
  console.log(`\n${name}: ${meta.seconds}s · ${N} frames`);
  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    await page.evaluate((p) => window.__spike.render(p), i / (N - 1));
    await page.screenshot({
      path: path.join(dir, 'f_' + String(i).padStart(4, '0') + '.png'),
      clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled',
    });
    if (i % 25 === 0) process.stdout.write(`  ${i}/${N}\r`);
  }
  console.log(`  frames done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);

  // 스크럽용 인코딩 — GOP 8, CRF 20. 랜덤 시크가 잦으므로 키프레임 간격을 짧게 둔다.
  const mp4 = path.join(OUT, name + '.mp4');
  execFileSync(FFMPEG, ['-y', '-framerate', String(FPS), '-start_number', '0',
    '-i', path.join(dir, 'f_%04d.png'),
    '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-g', '8', '-keyint_min', '8',
    '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4],
    { stdio: ['ignore', 'ignore', 'pipe'] });

  // 씸 검증용 첫/끝 프레임 webp
  for (const [i, tag] of [[0, 'first'], [N - 1, 'last']]) {
    execFileSync(FFMPEG, ['-y', '-i', path.join(dir, 'f_' + String(i).padStart(4, '0') + '.png'),
      '-c:v', 'libwebp', '-quality', '88', path.join(OUT, `${name}.${tag}.webp`)],
      { stdio: ['ignore', 'ignore', 'pipe'] });
  }
  const mb = fs.statSync(mp4).size / 1048576;
  console.log(`  → ${path.relative(ROOT, mp4)}  ${mb.toFixed(2)} MB  (${(mb * 8 / meta.seconds).toFixed(1)} Mbps)`);
  report.push({ name, seconds: meta.seconds, frames: N, mb: +mb.toFixed(2) });
}

// ── 앵커 스틸 — 1920×1080, UI 없음. 이미지→비디오 시딩(diorama 레그)용 ──────
const ANCH = path.join(OUT, 'anchors');
fs.mkdirSync(ANCH, { recursive: true });
const big = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await big.goto(`http://localhost:${PORT}/landxi/proto/spikes/three-globe/?film=1`, { waitUntil: 'load' });
await big.waitForFunction('window.__spike && window.__spike.loaded()', null, { timeout: 180000 });
await big.waitForTimeout(1500);
for (const [name, tag] of [['orbit-korea', 'orbit'], ['cloud-break', 'cloud']]) {
  await big.evaluate((n) => window.__spike.setLeg(n), name);
  for (const [i, pp] of [[0, 0], [1, 0.5], [2, 1]]) {
    await big.evaluate((v) => window.__spike.render(v), pp);
    await big.screenshot({ path: path.join(ANCH, `${tag}-${i}.png`),
      clip: { x: 0, y: 0, width: 1920, height: 1080 }, animations: 'disabled' });
  }
  console.log('anchors', tag, '0/1/2 @1920x1080');
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'legs.json'), JSON.stringify({ fps: FPS, w: W, h: H, legs: report }, null, 1));
if (errs.length) console.log('\n--- errors ---\n' + [...new Set(errs)].slice(0, 10).join('\n'));
else console.log('\nno console/page errors');
