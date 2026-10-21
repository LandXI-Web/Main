/* 30초 소개 영상 — 4판 긴 영상(소리 없는 판)에서 조각을 골라 잇는다(10-21 · 보고서 장면은 통계 판 없이 다시 찍은 것).
   조각 = 4판 story-times.json 의 컷 시작 기준(컷 안 상대 초) · 사이 0.2초 교차 · 마지막 = 4판 끝 컷(흰 바탕 CI) 3.5초.
   node shorts-30s-cut.mjs → E:/Land-XI 플랫폼/02. 데이터/_video/short-30s/land-xi-short-30s.mp4 (+ stills-30s-cut/ · cut-30s.json) */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const V4 = 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v4', OUT = 'E:/Land-XI 플랫폼/02. 데이터/_video/short-30s';
const SRC = path.join(V4, 'land-xi-intro-v4-silent.mp4');
const T = JSON.parse(fs.readFileSync(path.join(V4, 'story-times.json'), 'utf8'));
const at = (id) => T.shots.find((s) => s.id === id).start;
// [컷, 컷 안 시작, 컷 안 끝]
const PICK = [['main', 0.35, 4.35], ['main-map', 0.67, 6.67], ['chat', 0.93, 3.13], ['chat', 4.83, 10.33], ['chat-stats', 0.63, 5.43],
  ['chat-report', 6.3, 16.3],            // 지도 위 답 → 대화 서랍(답 + 한글 문서 줄 · 천천히 가까이)
  ['end', 0.57, 4.07]];                   // 흰 바탕 LAND-XI PLATFORM + LX CI 3.5초
const XF = 0.2, ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '30'];
const TMP = path.join(OUT, '_cut'); fs.mkdirSync(TMP, { recursive: true });
const ff = (a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a], { stdio: 'inherit' });
const segs = PICK.map(([id, a, b], k) => { const f = path.join(TMP, `s${k}.mp4`); const s0 = at(id) + a; ff(['-ss', s0.toFixed(3), '-t', (b - a).toFixed(3), '-i', SRC, '-an', ...ENC, f]); return { id, from: +s0.toFixed(2), to: +(at(id) + b).toFixed(2), dur: b - a, f }; });
let t = segs[0].dur, fc = '', last = '[0:v]'; const starts = [0];
for (let k = 1; k < segs.length; k++) { const off = t - XF; fc += `${last}[${k}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${k}];`; last = `[x${k}]`; starts.push(off); t = off + segs[k].dur; }
const out = path.join(OUT, 'land-xi-short-30s.mp4');
ff([...segs.flatMap((s) => ['-i', s.f]), '-filter_complex', fc + `${last}format=yuv420p[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-t', t.toFixed(3), out]);
const ST = path.join(OUT, 'stills-30s-cut'); fs.mkdirSync(ST, { recursive: true }); for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
segs.forEach((s, k) => ff(['-ss', (starts[k] + s.dur * 0.7).toFixed(2), '-i', out, '-frames:v', '1', path.join(ST, `still-${k + 1}-${s.id}.png`)]));
fs.writeFileSync(path.join(OUT, 'cut-30s.json'), JSON.stringify({ src: SRC, total: +t.toFixed(2), segments: segs.map(({ f, ...s }, k) => ({ ...s, at: +starts[k].toFixed(2) })) }, null, 1));
console.log(JSON.stringify({ total: +t.toFixed(2), out }));
