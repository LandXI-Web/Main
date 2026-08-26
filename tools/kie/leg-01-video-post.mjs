#!/usr/bin/env node
/**
 * Leg 1 영상 후처리 — 스크럽 인코딩 2종 + 마지막 프레임(Leg 2 시드) + 검수 프레임/시트.
 *
 *   node tools/kie/leg-01-video-post.mjs
 *
 * 스크럽 인코딩은 scrollcam 이 currentTime 으로 임의 지점을 튀어다닐 수 있게
 * GOP 를 8프레임으로 자른 판이다(-g 8 -keyint_min 8 -sc_threshold 0).
 *  - .scrub.mp4     : 원본 해상도 유지 (마스터 스크럽본)
 *  - .scrub.720.mp4 : 가로 1280 웹 배포본 (세로는 종횡비 유지 -> -2)
 *
 * 마지막 프레임은 -sseof -0.15 로 뽑는다. 이 png 가 Leg 2 의 시작 프레임이다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const p = (...a) => path.join(ROOT, ...a);
const rel = (a) => path.relative(ROOT, a).split(path.sep).join('/');

const GEN = p('landxi/assets/proto/film/legs/gen');
const SHOTS = p('shots/kie');
const IN = path.join(GEN, 'ch1-leg-01-globe.mp4');

function bin(name) {
  const base = path.join(process.env.USERPROFILE || process.env.HOME,
    'AppData/Local/Microsoft/WinGet/Packages');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    for (const b of fs.readdirSync(path.join(base, d))) {
      const c = path.join(base, d, b, 'bin', name + '.exe');
      if (fs.existsSync(c)) return c;
    }
  }
  return name;
}
const FF = bin('ffmpeg');
const FP = bin('ffprobe');
const run = (b, a) => execFileSync(b, a, { encoding: 'utf8' });
const Q = ['-hide_banner', '-loglevel', 'error', '-y'];

if (!fs.existsSync(IN)) throw new Error('원본 mp4 없음: ' + IN);
fs.mkdirSync(SHOTS, { recursive: true });

const probe = JSON.parse(run(FP, ['-v', 'error', '-print_format', 'json',
  '-show_streams', '-show_format', IN]));
const v = probe.streams.find((s) => s.codec_type === 'video');
const [fn, fd] = String(v.r_frame_rate).split('/').map(Number);
const fps = fd ? fn / fd : fn;
const dur = Number(probe.format.duration);
const meta = {
  source: { file: path.basename(IN), bytes: fs.statSync(IN).size, width: v.width,
    height: v.height, fps, frames: v.nb_frames ? Number(v.nb_frames) : null,
    durationSec: dur, codec: v.codec_name },
};

const SCRUB = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-g', '8', '-keyint_min', '8', '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

// 1) 원본 해상도 스크럽본
const scrub = path.join(GEN, 'ch1-leg-01-globe.scrub.mp4');
run(FF, [...Q, '-i', IN, ...SCRUB, scrub]);
meta.scrub = { file: rel(scrub), bytes: fs.statSync(scrub).size, width: v.width, height: v.height };

// 2) 1280 폭 스크럽본
const scrub720 = path.join(GEN, 'ch1-leg-01-globe.scrub.720.mp4');
run(FF, [...Q, '-i', IN, '-vf', 'scale=1280:-2:flags=lanczos', ...SCRUB, scrub720]);
const p720 = JSON.parse(run(FP, ['-v', 'error', '-print_format', 'json', '-show_streams', scrub720]));
const v720 = p720.streams.find((s) => s.codec_type === 'video');
meta.scrub720 = { file: rel(scrub720), bytes: fs.statSync(scrub720).size, width: v720.width, height: v720.height };

// 3) 마지막 프레임 = Leg 2 시드
const last = path.join(GEN, 'ch1-leg-01-globe.last.png');
run(FF, [...Q, '-sseof', '-0.15', '-i', IN, '-frames:v', '1', '-update', '1', last]);
meta.last = { file: rel(last), bytes: fs.statSync(last).size };

// 4) 검수 프레임 6장 (첫/끝 정확히 물고 균등 분할)
const N = 6;
const endT = Math.max(0, dur - 1 / fps);
meta.shots = [];
const jpgs = [];
for (let i = 0; i < N; i++) {
  const t = (endT * i) / (N - 1);
  const out = path.join(SHOTS, 'leg01-' + String(i).padStart(2, '0') + '.jpg');
  run(FF, [...Q, '-ss', t.toFixed(3), '-i', IN, '-frames:v', '1', '-q:v', '3',
    '-vf', 'scale=1280:-2', out]);
  jpgs.push(out);
  meta.shots.push({ i, t: Number(t.toFixed(3)), file: rel(out) });
}

// 5) 콘택트 시트 3x2
const sheet = path.join(SHOTS, 'leg01-video.jpg');
const fit = 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2:color=white';
const args = [...Q];
for (const j of jpgs) args.push('-i', j);
args.push('-filter_complex',
  jpgs.map((_, i) => '[' + i + ':v]' + fit + '[s' + i + '];').join('')
  + '[s0][s1][s2]hstack=inputs=3[t];[s3][s4][s5]hstack=inputs=3[b];[t][b]vstack=inputs=2[o]',
  '-map', '[o]', '-frames:v', '1', '-q:v', '3', sheet);
run(FF, args);
meta.sheet = rel(sheet);

console.log(JSON.stringify(meta, null, 2));
