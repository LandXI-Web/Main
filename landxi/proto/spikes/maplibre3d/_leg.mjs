// 레그 렌더러 — spike 의 결정론 카메라(window.__leg)를 프레임 PNG 로 굽고 mp4 로 묶는다.
// tools/film/frames.mjs + tools/film/encode.mjs 패턴을 그대로 따른다.
//
//   node tools/serve.mjs &
//   node landxi/proto/spikes/maplibre3d/_leg.mjs             # 프레임 + 인코딩
//   node landxi/proto/spikes/maplibre3d/_leg.mjs --keys      # 첫/끝 프레임만
//   FFMPEG=... node ... _leg.mjs --skip-frames               # 인코딩만
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes('--' + n);
const val = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const PORT = process.env.PORT || 4173;
const URL = `http://localhost:${PORT}/landxi/proto/spikes/maplibre3d/?film=1`;
const W = 1280, H = 720;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const root = process.cwd();
const FRAMES = path.resolve(root, 'build/film/legs/namwon-3d');
const OUT = path.resolve(root, 'landxi/assets/proto/film/legs/src');
const SETTLE_MS = Number(val('settle', 90));

if (!flag('skip-frames')) {
  fs.rmSync(FRAMES, { recursive: true, force: true });
  fs.mkdirSync(FRAMES, { recursive: true });

  const browser = await chromium.launch({ channel: 'chrome', args: [
    '--force-color-profile=srgb', '--disable-lcd-text', '--hide-scrollbars',
    '--use-angle=default', '--enable-gpu-rasterization',
  ] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE', m.text().slice(0, 200)); });

  console.log('open', URL);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction('window.__filmReady === true', null, { timeout: 120000 });
  const meta = await page.evaluate(() => ({ ...window.__leg.meta,
    fps: window.__leg.fps, dur: window.__leg.duration, frames: window.__leg.frames }));
  console.log('leg', JSON.stringify(meta));

  // 첫 프레임은 타일이 전혀 없으므로 넉넉히 예열한다
  await page.evaluate(() => window.__leg.seek(0));
  await page.waitForFunction('window.__leg.settled()', null, { timeout: 90000, polling: 60 }).catch(() => {});
  await page.waitForTimeout(1500);

  // ── 앵커 스틸 3장 (1920×1080, UI 없음) ────────────────────────────
  // image-to-video(kling) 의 참조 프레임. 시작 / 중간(주택+온실이 정사영상 위에 선 순간) / 끝.
  if (!flag('no-anchors')) {
    const AN = path.resolve(root, 'landxi/assets/proto/film/legs/src/anchors');
    fs.mkdirSync(AN, { recursive: true });
    await page.setViewportSize({ width: 1920, height: 1080 });
    const T = [0, meta.dur * 0.5, meta.dur];
    for (let k = 0; k < T.length; k++) {
      await page.evaluate((tt) => window.__leg.seek(tt), T[k]);
      await page.waitForFunction('window.__leg.settled()', null, { timeout: 45000, polling: 40 }).catch(() => {});
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(AN, `namwon-3d-${k}.png`),
        clip: { x: 0, y: 0, width: 1920, height: 1080 }, animations: 'disabled' });
      console.log('anchor', k, 't=' + T[k].toFixed(2));
    }
    await page.setViewportSize({ width: W, height: H });
    if (flag('anchors-only')) { await browser.close(); process.exit(0); }
  }

  const list = flag('keys')
    ? [{ i: 0, t: 0 }, { i: meta.frames - 1, t: meta.dur }]
    : Array.from({ length: meta.frames }, (_, i) => ({ i, t: i / meta.fps }));

  const t0 = Date.now(); let slow = 0;
  for (let n = 0; n < list.length; n++) {
    const { i, t } = list[n];
    await page.evaluate((tt) => window.__leg.seek(tt), t);
    try {
      await page.waitForFunction('window.__leg.settled()', null, { timeout: 30000, polling: 40 });
    } catch { slow++; console.warn('  ! settle timeout @', t.toFixed(2)); }
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: path.join(FRAMES, 'f_' + String(i).padStart(4, '0') + '.png'),
      clip: { x: 0, y: 0, width: W, height: H }, animations: 'disabled' });
    if (n % 20 === 0 || n === list.length - 1) {
      const el = (Date.now() - t0) / 1000;
      console.log(`  ${n + 1}/${list.length} t=${t.toFixed(2)}s ${el.toFixed(0)}s eta ${(el / (n + 1) * (list.length - n - 1)).toFixed(0)}s`);
    }
  }
  await browser.close();
  console.log('frames ->', FRAMES, 'slow=', slow);
  if (flag('keys')) process.exit(0);
}

// ── 인코딩 ────────────────────────────────────────────────────────────
fs.mkdirSync(OUT, { recursive: true });
const frames = fs.readdirSync(FRAMES).filter((f) => /^f_\d+\.png$/.test(f)).sort();
if (!frames.length) throw new Error('프레임 없음: ' + FRAMES);
const FPS = 25;
console.log(`frames ${frames.length} (${(frames.length / FPS).toFixed(2)}s @ ${FPS}fps)`);
const run = (a) => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const IN = ['-y', '-framerate', String(FPS), '-start_number', '0', '-i', path.join(FRAMES, 'f_%04d.png')];

// 스크럽 재생용 인코딩: 키프레임 간격을 8 로 촘촘히 둬야 임의 지점 탐색이 즉각 반응한다.
const mp4 = path.join(OUT, 'namwon-3d.mp4');
run([...IN, '-c:v', 'libx264', '-crf', '20', '-preset', 'slow', '-g', '8', '-keyint_min', '8',
     '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
console.log(`  mp4  ${(fs.statSync(mp4).size / 1048576).toFixed(2)} MB`);

// 첫/끝 프레임 webp — 포스터 및 앞뒤 레그 이음매 확인용
for (const [tag, f] of [['first', frames[0]], ['last', frames[frames.length - 1]]]) {
  const o = path.join(OUT, `namwon-3d.${tag}.webp`);
  run(['-y', '-i', path.join(FRAMES, f), '-c:v', 'libwebp', '-quality', '86', '-an', o]);
  console.log(`  ${tag} ${(fs.statSync(o).size / 1024).toFixed(0)} KB`);
}
