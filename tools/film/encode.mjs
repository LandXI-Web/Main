// tools/film/encode.mjs — build/film/frames/*.png → landxi/assets/proto/film/{hero.mp4,hero.webm,poster.jpg}
//
//   node tools/film/encode.mjs
//   FFMPEG=C:\path\to\ffmpeg.exe node tools/film/encode.mjs
//
// 용량 예산(mp4 6MB / webm 5MB / poster 200KB)을 넘으면 CRF 를 한 단계씩 올려 다시 굽는다.
// 필름 그레인이 10% 얹혀 있어 비트레이트를 많이 먹으므로 자동 재시도가 필요하다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const root = process.cwd();
const FRAMES = path.resolve(root, 'build/film/frames');
const OUT = path.resolve(root, 'landxi/assets/proto/film');
const FPS = 25;
const MB = 1024 * 1024;
const BUDGET = { mp4: 6 * MB, webm: 5 * MB, poster: 200 * 1024 };

fs.mkdirSync(OUT, { recursive: true });
const frames = fs.readdirSync(FRAMES).filter(f => /^f_\d+\.png$/.test(f)).sort();
if (!frames.length) throw new Error('no frames in ' + FRAMES);
console.log(`frames ${frames.length}  (${(frames.length / FPS).toFixed(2)}s @ ${FPS}fps)`);

const run = a => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const size = f => fs.statSync(f).size;
// image2 디먹서의 기본 start_number 는 1 이라 f_0000.png 이 빠진다 — 명시한다.
const IN = ['-y', '-framerate', String(FPS), '-start_number', '0', '-i', path.join(FRAMES, 'f_%04d.png')];

// ── mp4 (H.264) ─────────────────────────────────────────────────────────────
const mp4 = path.join(OUT, 'hero.mp4');
for (const crf of [24, 26, 28, 30, 32]) {
  run([...IN, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'slow',
    '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
  console.log(`  mp4  crf=${crf}  ${(size(mp4) / MB).toFixed(2)} MB`);
  if (size(mp4) <= BUDGET.mp4) break;
}

// ── webm (VP9) ──────────────────────────────────────────────────────────────
const webm = path.join(OUT, 'hero.webm');
for (const crf of [34, 37, 40, 43, 46]) {
  run([...IN, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0',
    '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2',
    '-pix_fmt', 'yuv420p', '-an', webm]);
  console.log(`  webm crf=${crf}  ${(size(webm) / MB).toFixed(2)} MB`);
  if (size(webm) <= BUDGET.webm) break;
}

// ── poster (첫 프레임 = 재생 시작과 이음매가 없다) ──────────────────────────
const poster = path.join(OUT, 'poster.jpg');
for (const q of [4, 5, 6, 7, 8]) {
  run(['-y', '-i', path.join(FRAMES, frames[0]), '-vf', 'scale=1440:810:flags=lanczos',
    '-q:v', String(q), poster]);
  console.log(`  poster q=${q}  ${(size(poster) / 1024).toFixed(0)} KB`);
  if (size(poster) <= BUDGET.poster) break;
}

for (const f of [mp4, webm, poster]) console.log(path.relative(root, f), size(f));
