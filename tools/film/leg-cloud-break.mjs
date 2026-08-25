// tools/film/leg-cloud-break.mjs
// 구름 스파이크의 "성층운 돌파" 레그를 결정론적으로 굽는다.
//
//   node tools/spike/serve.mjs &                     # 4181 포트
//   node tools/film/leg-cloud-break.mjs              # 125 프레임 → mp4 + webp + 앵커 PNG
//   node tools/film/leg-cloud-break.mjs --frames-only
//
// 프레임마다 window.__spike.film(t) 로 상태를 못 박고, MapLibre 가 idle +
// areTilesLoaded() 될 때까지 기다린 뒤 캡처한다. dt 를 쓰지 않으므로 재현된다.
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const PORT = process.env.PORT || 4181;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const W = 1280, H = 720, FPS = 25, SEC = 5;
const N = FPS * SEC;                                  // 125 프레임
const root = process.cwd();
const FRAMES = path.resolve(root, 'build/film/legs/cloud-break-v2');
const OUT = path.resolve(root, 'landxi/assets/proto/film/legs/src');
const ANCH = path.join(OUT, 'anchors');
for (const d of [FRAMES, OUT, ANCH]) fs.mkdirSync(d, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--force-device-scale-factor=1'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message.slice(0, 200)));
await page.goto(`http://localhost:${PORT}/landxi/proto/spikes/clouds/`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('body[data-ready="1"]', { timeout: 180000 });
// 승자 기법 = ② 빌보드 데크. 저고도 볼륨은 스파이크 리포트 참고.
await page.evaluate(() => { window.__spike.setTech(2); window.__spike.clean(true); });
await page.waitForTimeout(1200);

async function settle(timeout = 25000) {
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => {
      const m = window.__map;
      return !m || (m.loaded() && m.areTilesLoaded());
    });
    if (ok || Date.now() - t0 > timeout) break;
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(70);        // 컴포지트 안정
}

async function shoot(t, file) {
  await page.evaluate((v) => window.__spike.film(v), t);
  await settle();
  await page.evaluate((v) => window.__spike.film(v), t);   // 타일 도착 후 한 번 더 못 박는다
  await page.screenshot({ path: file });
}

console.log(`레그 굽는 중 — ${N} 프레임 ${W}x${H} @${FPS}fps`);
for (let i = 0; i < N; i++) {
  await shoot(i / (N - 1), path.join(FRAMES, `f_${String(i).padStart(4, '0')}.png`));
  if (i % 10 === 0) process.stdout.write(`  ${i}/${N}\n`);
}

// 1920×1080 앵커 스틸 — 시작/중간/끝
await page.setViewportSize({ width: 1920, height: 1080 });
await page.waitForTimeout(400);
const ANCHORS = [[0, 'cloudv2-0.png'], [0.62, 'cloudv2-1.png'], [1, 'cloudv2-2.png']];
for (const [t, name] of ANCHORS) {
  await shoot(t, path.join(ANCH, name));
  console.log('앵커', name, 't=' + t);
}
console.log('pageerror:', [...new Set(errs)].slice(0, 5).join(' | ') || '(none)');
await browser.close();

if (flag('frames-only')) process.exit(0);

// ── 인코딩 ────────────────────────────────────────────────────────────────
// 스크럽 재생용: -g 8 로 키프레임을 촘촘히 박아 임의 시각 시크가 즉시 그려지게 한다.
const run = (a) => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const IN = ['-y', '-framerate', String(FPS), '-start_number', '0', '-i', path.join(FRAMES, 'f_%04d.png')];
const mp4 = path.join(OUT, 'cloud-break-v2.mp4');
run([...IN, '-c:v', 'libx264', '-crf', '20', '-g', '8', '-keyint_min', '8', '-sc_threshold', '0',
  '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
for (const [src, name] of [[`f_0000.png`, 'cloud-break-v2-first.webp'], [`f_${String(N - 1).padStart(4, '0')}.png`, 'cloud-break-v2-last.webp']])
  run(['-y', '-i', path.join(FRAMES, src), '-c:v', 'libwebp', '-quality', '86', path.join(OUT, name)]);

for (const f of fs.readdirSync(OUT)) {
  const p = path.join(OUT, f);
  if (fs.statSync(p).isFile()) console.log(' ', f, (fs.statSync(p).size / 1024).toFixed(0) + ' KB');
}
for (const f of fs.readdirSync(ANCH)) console.log('  anchors/' + f, (fs.statSync(path.join(ANCH, f)).size / 1024).toFixed(0) + ' KB');
