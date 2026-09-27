// F2-∑ 통합 영상 편집 — record.mjs 의 원본(A 1440×900 · B 관제 720×900 · 같은 벽시계)을 자르고 반화면 합성만 한다(수치 합성 0).
//   node shots/f2/integrated/tools/edit.mjs → shots/f2/F2-integrated.mp4 (h264 · ≤ 150 s · ≤ 40 MB) + stills 8 + marks.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f2/integrated';
const FINAL = 'shots/f2/F2-integrated.mp4';
const R = JSON.parse(fs.readFileSync(path.join(OUT, 'logs', 'record-raw.json'), 'utf8'));
const { T, marks, ids } = R;
const RAWA = path.join(OUT, 'raw', 'A.webm'), RAWB = path.join(OUT, 'raw', 'B.webm');
const offB = (T.B0 - T.A0) / 1000;
const M = (k) => marks.find((m) => m.k === k)?.t;
const FONT = 'C\\:/Windows/Fonts/malgunbd.ttf';
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, '’').replace(/%/g, '\\%');
const dur = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const rawLen = dur(RAWA);
const cl = (a, b) => [Math.max(0, a), Math.min(rawLen, b)];

// ── 구간(원본 A 초) ──
const jRun = M('run'), jDone = T.jDone;
const keep = [];
const add = (a, b, o = {}) => { if (a == null || b == null || b - a < 0.3) return; const [x, y] = cl(a, b); keep.push({ a: x, b: y, ...o }); };
add(Math.max(T.film0, T.film1 - 7.5), T.film1, { tag: 'film' });
add(Math.max(T.pub0, T.pub1 - 4), T.pub1, { tag: 'public' });
add(T.login0, T.login1 + 0.4, { tag: 'login' });
add(T.xi0 - 0.2, Math.min(T.xiArr + 1.2, T.xi0 + 13), { tag: 'arrive' });
add(T.ag0 - 0.2, T.ag2, { tag: 'agent', max: 17 });
add(T.sv0, T.svDone + 1.2, { tag: 'sweep', max: 12, headTail: true });
add(T.svDone + 1.2, T.split1a, { tag: 'queue-card' });
add(T.split1a, T.split1b, { tag: 'assign', split: '관제(:8702) · 기관별 실태조사 막대(배정 실시간)' });
add(T.draftA - 0.3, T.draftA + 2.2, { tag: 'draft' });
if (T.docxA) add(T.docxA - 0.8, Math.min(T.draftEnd + 0.8, T.docxA + 3), { tag: 'docx' });
add(T.j0, T.split2a, { tag: 'frame' });
// 실추론 대기: 앞 9 s(칸 점등 · GPU 오름) + 끝 9 s(job.done 두 줄) — 가운데는 자막으로 건너뛴 초를 밝힌다
const runLen = T.split2b - T.split2a;
if (runLen > 20) {
  add(T.split2a, T.split2a + 9, { tag: 'job-run', split: `관제(:8702) · 같은 job …${String(ids.job_J).slice(-8)} · GPU0 이동평균·W` });
  add(T.split2b - 9.5, T.split2b, { tag: 'job-done', split: `관제(:8702) · 같은 job …${String(ids.job_J).slice(-8)} · ${Math.round(runLen - 18.5)} s 건너뜀` });
} else add(T.split2a, T.split2b, { tag: 'job', split: `관제(:8702) · 같은 job …${String(ids.job_J).slice(-8)} · GPU0 이동평균·W` });
add(T.split3a - 0.3, T.split3b, { tag: 'rollback', split: '관제(:8702) · 배포 제어 롤백 dp-nw-farm-25' });
add(T.g0, Math.min(T.g0 + 16, T.gCell ?? T.g0 + 16), { tag: 'global' });
if (T.gCell && T.gCell > T.g0 + 16) add(T.gCell - 1.5, T.gEnd, { tag: 'global-ndvi' });
// 구간 상한(max) — 앞머리 우선, headTail 이면 앞 절반 + 뒤 절반
const pieces0 = [];
for (const k of keep) {
  if (k.max && k.b - k.a > k.max) {
    if (k.headTail) { pieces0.push({ ...k, b: k.a + k.max / 2 }); pieces0.push({ ...k, a: k.b - k.max / 2 }); }
    else pieces0.push({ ...k, b: k.a + k.max });
  } else pieces0.push(k);
}
// 흰 프레임(90 % 이상 luma ≥ 235) 제거 — 세션 전환 백지 0
const WHITE = whiteSpans(RAWA);
const pieces = [];
const PAPER = new Set(['film', 'login', 'draft', 'docx']);   // 종이 바탕 화면(로그인·필름·초안)은 흰 판정에서 뺀다
for (const p of pieces0) { let segs = [[p.a, p.b]]; for (const [w0, w1] of (PAPER.has(p.tag) ? [] : WHITE)) segs = segs.flatMap(([x, y]) => (w1 <= x || w0 >= y ? [[x, y]] : [[x, w0], [w1, y]].filter(([s, e]) => e - s > 0.12))); for (const [a, b] of segs) pieces.push({ ...p, a, b }); }
let total = pieces.reduce((s, p) => s + p.b - p.a, 0) + 4.5;
console.log('[plan]', pieces.map((p) => `${p.tag} ${(p.b - p.a).toFixed(1)}`).join(' | '), 'total', total.toFixed(1));
// 150 s 상한: 넘치면 글로벌 → 도착 → 에이전트 순으로 깎는다
for (const tag of ['global', 'global-ndvi', 'arrive', 'agent', 'queue-card', 'film']) {
  if (total <= 149) break;
  for (const p of pieces.filter((x) => x.tag === tag)) { const cut = Math.min(total - 149, (p.b - p.a) - 3); if (cut > 0) { p.b -= cut; total -= cut; } }
}

fs.mkdirSync(path.join(OUT, 'parts'), { recursive: true });
for (const f of fs.readdirSync(path.join(OUT, 'parts'))) fs.rmSync(path.join(OUT, 'parts', f));
const parts = [];
pieces.forEach((p, i) => {
  const out = path.join(OUT, 'parts', `p${String(i).padStart(2, '0')}.mp4`); parts.push(out);
  const d = (p.b - p.a).toFixed(3);
  if (!p.split) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', p.a.toFixed(3), '-t', d, '-i', RAWA, '-vf', 'fps=25,scale=1440:900,format=yuv420p', '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', out]);
  else {
    const who = ['assign', 'rollback'].includes(p.tag) ? 'XI맵 · 남원시 농정과(기관)' : 'XI맵 · LX 직원';
    const fc = `[0:v]fps=25,split[a0][a1];[a1]scale=1440:900,drawbox=c=0xF2F4F6:t=fill[bg];[a0]scale=960:600[m];`
      + `[1:v]fps=25,scale=480:600[o];[bg][m]overlay=0:150:shortest=1[t1];[t1][o]overlay=960:150:shortest=1[t2];`
      + `[t2]drawtext=fontfile='${FONT}':text='${esc(who)}':x=24:y=108:fontsize=24:fontcolor=0x010102,drawtext=fontfile='${FONT}':text='${esc(p.split)}':x=984:y=112:fontsize=16:fontcolor=0x010102[v]`;
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', p.a.toFixed(3), '-t', d, '-i', RAWA, '-ss', Math.max(0, p.a - offB).toFixed(3), '-t', d, '-i', RAWB, '-filter_complex', fc, '-map', '[v]', '-an', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', out]);
  }
});
// 마감 4.5 s: XI맵 job.done HUD · 관제 같은 job 행 정지 2분할 + 모토
{
  const out = path.join(OUT, 'parts', 'p99-end.mp4'); parts.push(out);
  const a = path.join(OUT, 'stills', '_xi-job-done.png'), b = path.join(OUT, 'stills', '_ops-job.png');
  const J = String(ids.job_J || '');
  const fc = `color=c=0x010102:s=1440x900:d=4.5[bg];[0:v]scale=900:562[x];[1:v]scale=450:562[o];[bg][x]overlay=30:120[t1];[t1][o]overlay=960:120[t2];`
    + `[t2]drawtext=fontfile='${FONT}':text='같은 id 가 관통한다 · ${esc(J)} · ${esc(ids.run_E || 'run_E')} · ${esc(ids.finding || 'f_R1')} · dp-nw-farm-25':x=30:y=64:fontsize=20:fontcolor=0xFFFFFF,`
    + `drawtext=fontfile='${FONT}':text='Hyper Performance · Hyper Solution · Hyper GeoAI 통합 플랫폼 서비스':x=(w-text_w)/2:y=740:fontsize=34:fontcolor=0xFFFFFF,`
    + `drawtext=fontfile='${FONT}':text='Land-XI — 공공기관이 제공하는 유일한 GeoAI 실태조사 솔루션 · LX':x=(w-text_w)/2:y=800:fontsize=20:fontcolor=0xC8CCD2,fade=t=in:st=0:d=0.4[v]`;
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-loop', '1', '-i', a, '-loop', '1', '-i', b, '-filter_complex', fc, '-map', '[v]', '-t', '4.5', '-r', '25', '-c:v', 'libx264', '-crf', '20', '-pix_fmt', 'yuv420p', out]);
}
fs.writeFileSync(path.join(OUT, 'parts', 'list.txt'), parts.map((p) => `file '${path.resolve(p).replace(/\\/g, '/')}'`).join('\n'));
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'parts', 'list.txt'), '-c:v', 'libx264', '-crf', '23', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', FINAL]);
const D = dur(FINAL), MB = fs.statSync(FINAL).size / 1048576;
// 원본 시각 → 편집 시각
const edit = (t) => { let acc = 0; for (const p of pieces) { if (t >= p.a && t <= p.b) return acc + (t - p.a); acc += p.b - p.a; } return null; };
const em = marks.map((m) => ({ ...m, te: edit(m.t) == null ? null : +edit(m.t).toFixed(2) }));
// 스틸 8장(편집본에서)
const S = [['01-public', edit(T.pub1 - 1)], ['02-arrive-namwon', edit(Math.min(T.xiArr + 1, T.xi0 + 12.5))], ['03-agent', edit(Math.min(T.ag2 - 0.5, T.ag0 + 16.5))], ['04-sweep-result', edit(T.svDone + 1)],
  ['05-card-assign', edit(T.split1b - 0.5)], ['06-job-ops', edit(T.split2b - 0.5)], ['07-rollback-lineage', edit(T.split3b - 0.8)], ['08-global', edit(Math.min(T.gEnd, (T.gCell ?? T.g0 + 15)) - 0.3)]];
for (const [n, t] of S) if (t != null) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', Math.max(0, t).toFixed(2), '-i', FINAL, '-frames:v', '1', path.join(OUT, 'stills', `${n}.png`)]);
fs.writeFileSync(path.join(OUT, 'marks.json'), JSON.stringify({ duration_s: +D.toFixed(2), size_mb: +MB.toFixed(1), offB, pieces, white: WHITE, ids: { ...ids, jobApi: ids.jobApi ? { id: ids.jobApi.id, shards_total: ids.jobApi.shards_total, gpu_s: ids.jobApi.gpu_s, elapsed_s: ids.jobApi.elapsed_s, chips_per_gpu_s: ids.jobApi.chips_per_gpu_s, chips_per_wall_s: ids.jobApi.chips_per_wall_s } : null }, stills: S, marks: em, errors: R.logs }, null, 1));
console.log('[final]', FINAL, D.toFixed(1), 's', MB.toFixed(1), 'MB');

function whiteSpans(file) {
  const buf = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-vf', 'fps=25,scale=96:60,format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
  const F = 96 * 60, n = Math.floor(buf.length / F), spans = [];
  let st = -1;
  for (let i = 0; i < n; i++) { let w = 0; for (let k = i * F; k < (i + 1) * F; k++) if (buf[k] >= 235) w++; const white = w / F >= 0.9;
    if (white && st < 0) st = i; if (!white && st >= 0) { spans.push([Math.max(0, (st - 1) / 25), (i + 1) / 25]); st = -1; } }
  if (st >= 0) spans.push([(st - 1) / 25, n / 25]);
  return spans;
}
