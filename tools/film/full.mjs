// tools/film/full.mjs — 풀 영상본. 스크럽 매니페스트(manifest.json)의 레그를 순서대로 한 편으로 잇는다.
//
//   node tools/film/full.mjs            # legs/full.mp4 + legs/full.webp (+ manifest.full)
//   XFADE=0 node tools/film/full.mjs    # 씸 크로스페이드 없이 하드컷
//
// 클라이언트 결정(2026-08-27): "필름타임라인 한 공간에 풀 영상본도 만들어 놓는다."
// 스크럽 페이지의 씸 밴드 0.16vh 는 필름 시간으로 0.16 / 0.218 ≈ 0.734 s 다 — 그만큼을 ffmpeg xfade(fade) 로 겹친다.
// 인코딩 규격은 스크럽본과 같다(1920×1080, libx264 high, GOP 8, faststart, 무음). tools/scrub/assemble.mjs 가 끝에서 이 파일을 부른다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const root = process.cwd();
const OUT = path.resolve(root, 'landxi/assets/proto/film/legs');
const MAN = path.join(OUT, 'manifest.json');
const M = JSON.parse(fs.readFileSync(MAN, 'utf8'));
const XF = process.env.XFADE === '0' ? 0 : +(M.seam / M.pace.targetRate).toFixed(3);   // 0.734 s
const W = 1920, H = 1080;

const run = a => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = a => execFileSync(FFPROBE, a, { encoding: 'utf8' }).trim();

const files = M.legs.map(L => path.join(OUT, `w${L.id}.mp4`));
const durs = M.legs.map(L => L.seconds);
const inputs = files.flatMap(f => ['-i', f]);
const n = files.length;
const chain = [];
for (let i = 0; i < n; i++) chain.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=24,format=yuv420p[v${i}]`);
if (XF > 0 && n > 1) {
  let off = 0, prev = 'v0';
  for (let i = 1; i < n; i++) {
    off += durs[i - 1] - XF;
    const out = i === n - 1 ? 'vout' : `x${i}`;
    chain.push(`[${prev}][v${i}]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[${out}]`);
    prev = out;
  }
} else {
  chain.push(M.legs.map((_, i) => `[v${i}]`).join('') + `concat=n=${n}:v=1:a=0[vout]`);
}
const mp4 = path.join(OUT, 'full.mp4');
const webp = path.join(OUT, 'full.webp');
process.stdout.write(`full ${n} legs, xfade ${XF}s ... `);
run(['-y', ...inputs, '-filter_complex', chain.join(';'), '-map', '[vout]',
  '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', process.env.CRF || '25',
  '-g', '8', '-keyint_min', '8', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
run(['-y', '-i', mp4, '-vf', 'scale=960:-2:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', '-an', webp]);
const [wStr, hStr, durStr, nb] = probe(['-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,duration,nb_frames', '-of', 'csv=p=0', mp4]).split(',');
const full = {
  src: '/landxi/assets/proto/film/legs/full.mp4', poster: '/landxi/assets/proto/film/legs/full.webp',
  legs: M.legs.map(L => L.id), legCount: n, size: [+wStr, +hStr], fps: 24, frames: +nb,
  seconds: +(+durStr).toFixed(3), legSecondsSum: +durs.reduce((s, d) => s + d, 0).toFixed(3),
  xfadeSeconds: XF, bytes: fs.statSync(mp4).size,
  encode: `xfade=fade:${XF}s × ${n - 1} · scale/crop 1920×1080 · libx264 high crf ${process.env.CRF || '25'} -g 8 -keyint_min 8 -sc_threshold 0 +faststart -an`,
  note: XF > 0 ? `레그 사이를 ${XF}s 씩 xfade(fade) 로 겹쳤다(스크럽 씸 밴드 0.16vh ÷ 0.218 vh/s). 하드컷보다 ${(XF * (n - 1)).toFixed(2)}s 짧다.` : '하드컷.',
};
M.full = full;
fs.writeFileSync(MAN, JSON.stringify(M, null, 2));
console.log(`${full.seconds}s ${(full.bytes / 1048576).toFixed(2)} MB ${full.size.join('×')} (${full.legSecondsSum}s 합, xfade ${XF}s × ${n - 1})`);
