#!/usr/bin/env node
/**
 * kie leg mp4 -> 스크럽 인코딩 + 검수 프레임 추출.
 *
 *   node tools/kie/scrub-and-shoot.mjs <in.mp4> [--shots shots/kie] [--n 6]
 *
 * 스크럽 인코딩은 scrollcam 이 requestVideoFrameCallback 없이 currentTime 으로
 * 임의 지점을 튀어다닐 수 있게 GOP 를 8프레임으로 잘라둔 판이다. keyframe 간격이
 * 길면 seek 마다 디코더가 앞 프레임을 다 훑어서 스크럽이 끊긴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// leg 러너는 import 만 해도 CLI 분기가 돌아 exit 하므로 여기서 다시 찾는다.
function ffmpeg() {
  if (process.env.FFMPEG && fs.existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  const base = path.join(process.env.USERPROFILE || process.env.HOME,
    'AppData/Local/Microsoft/WinGet/Packages');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!d.startsWith('Gyan.FFmpeg')) continue;
    for (const b of fs.readdirSync(path.join(base, d))) {
      const c = path.join(base, d, b, 'bin/ffmpeg.exe');
      if (fs.existsSync(c)) return c;
    }
  }
  return 'ffmpeg';
}

const inFile = path.resolve(process.argv[2]);
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : d; };
const shotsDir = path.resolve(arg('--shots', 'shots/kie'));
const n = Number(arg('--n', 6));

const ff = ffmpeg();
const ffprobe = ff.replace(/ffmpeg(\.exe)?$/i, (m) => m.replace('ffmpeg', 'ffprobe'));
const run = (bin, args) => execFileSync(bin, args, { encoding: 'utf8' });

// ------------------------------------------------------------- 원본 정보 --
const probe = JSON.parse(run(ffprobe, ['-v', 'error', '-print_format', 'json',
  '-show_streams', '-show_format', inFile]));
const v = probe.streams.find((s) => s.codec_type === 'video');
const dur = Number(probe.format.duration);
const meta = {
  file: path.basename(inFile), bytes: fs.statSync(inFile).size,
  width: v.width, height: v.height, fps: eval(v.r_frame_rate), // eslint-disable-line
  frames: v.nb_frames ? Number(v.nb_frames) : null, durationSec: dur, codec: v.codec_name,
};

// ------------------------------------------------------------ 스크럽 인코딩 --
const scrub = inFile.replace(/\.mp4$/i, '.scrub.mp4');
run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', inFile,
  '-vf', 'scale=1280:720:flags=lanczos',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-g', '8', '-keyint_min', '8', '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', scrub]);
meta.scrub = { file: path.basename(scrub), bytes: fs.statSync(scrub).size };

// --------------------------------------------------------------- 프레임 --
fs.mkdirSync(shotsDir, { recursive: true });
const base = path.basename(inFile, '.mp4');
meta.shots = [];
for (let i = 0; i < n; i++) {
  // 첫/끝은 정확히 물고(seam 판정), 나머지는 균등 분할.
  const t = i === 0 ? 0 : i === n - 1 ? Math.max(0, dur - 1 / meta.fps) : (dur * i) / (n - 1);
  const out = path.join(shotsDir, `${base}-${String(i).padStart(2, '0')}.jpg`);
  run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', t.toFixed(3), '-i', inFile,
    '-frames:v', '1', '-q:v', '3', '-vf', 'scale=1280:-2', out]);
  meta.shots.push({ t: Number(t.toFixed(3)), file: path.basename(out) });
}

console.log(JSON.stringify(meta, null, 2));
