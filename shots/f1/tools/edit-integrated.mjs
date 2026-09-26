// F1-∑ 통합 영상 편집 — record-integrated.mjs 의 원본 두 벌(A 4173 · B 8702)을 marks 로 잘라 잇는다(내용 손대지 않음).
//   node shots/f1/tools/edit-integrated.mjs
// 산출: shots/f1/F1-integrated.mp4(h264 · yuv420p · faststart · ≤50MB) · shots/f1/integrated/stills/*.png(대표 6) · shots/f1/integrated/edit.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const OUT = 'shots/f1';
const RAW = path.join(OUT, 'integrated-raw');
const DIR = path.join(OUT, 'integrated');
fs.mkdirSync(path.join(DIR, 'stills'), { recursive: true });
const M = JSON.parse(fs.readFileSync(path.join(RAW, 'marks-raw.json'), 'utf8'));
const t = (k) => { const m = M.marks.find((x) => x.k === k); if (!m) throw new Error('mark 없음 ' + k); return m.t; };
const has = (k) => M.marks.some((x) => x.k === k);
const V = { A: path.join(RAW, 'A-4173.webm'), B: path.join(RAW, 'B-8702.webm') };
const OFF = { A: M.tA0, B: M.tB0 };   // 녹화 0 s = 페이지 생성 시각
const FONT = 'C\\:/Windows/Fonts/malgun.ttf';

// G-J1 — 제출(큐 대기) → 첫 NDVI 값이 선 달 → 8/8 도착. 계산 대기는 건너뛰고 자막에 실측 경과를 적는다.
const hud = M.marks.find((x) => x.k === 'A.global.hudLog')?.hudLog || [];
const tPlay = t('A.global.play-done'), tGj1 = t('A.global.gj1-done');
const shardOf = (x) => { const m = x.match(/shard (\d)\/8/); return m ? +m[1] : null; };
const firstVal = hud.find((h) => /\d\.\d\dNDVI/.test(h.x)) || hud.find((h) => (shardOf(h.x) || 0) >= 1);
const a4end = tPlay + 7;
const fmt = (sec) => (sec >= 60 ? `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s` : `${Math.round(sec)} s`);
const lastLine = hud.at(-1)?.x || '';
const runS = (lastLine.match(/shard 8\/8 · (\d+) s elapsed/) || [])[1];
const skip1 = firstVal ? firstVal.t - 1 - a4end : 0;
const skip2 = firstVal ? tGj1 - 2.5 - (firstVal.t + 5) : tGj1 - 2.5 - a4end;
const skipped = skip1 + skip2;
const SEG = [
  { v: 'A', s: t('A.ready') - 0.2, e: t('A.city.arrived') + 1.8, name: 'XI맵 글로브 → 남원 25cm · P4 129,420 도착' },
  { v: 'A', s: t('A.emd.click') - 0.4, e: t('A.parcel.card') + 2.6, name: '운봉읍 집계 → 드론 AOI 1cm 하강 → 필지 카드' },
  { v: 'A', s: t('A.frame.start') - 0.3, e: Math.min(t('A.snapshot') + 5.5, t('A.global.goto') - 0.3), name: '프레임 → 견적 → 실행 · 실추론 shard 도착 · job.done · 스냅샷' },
  { v: 'B', s: t('B.login.ready') + 0.3, e: t('B.overview.grown') + 1.5, name: '관제 종이 무대 → 잉크 반전 → 운영 현황' },
  { v: 'B', s: t('A.run') - 0.6, e: t('B.deploys.ready') - 1.3, name: '같은 시각 관제 인프라 · 같은 job 큐 행 · GPU0 실측' },
  { v: 'B', s: t('B.deploys.ready') - 0.3, e: t('B.end'), name: '배포 제어 · R-1 롤백 v2.1 → v2.0' },
  { v: 'A', s: t('A.global.rolling') - 0.2, e: a4end, name: 'Global 영문판 · 남원 → 글로브 → 으슥아타 · G-J1 프레임 → 견적 → 제출(큐 대기)' },
  ...(firstVal ? [{ v: 'A', s: firstVal.t - 1, e: firstVal.t + 5, name: 'G-J1 첫 NDVI 값 도착(CPU 워커 · 실측)', cap: `+${fmt(skip1)} later (skipped) · queued, then CPU worker reads Sentinel-2 months from Planetary Computer` }] : []),
  { v: 'A', s: tGj1 - 2.5, e: tGj1 + 4.2, name: 'G-J1 8/8 도착 · job.done', cap: `+${fmt(skip2)} later (skipped) · 8 / 8 months arrived${runS ? ' · ' + runS + ' s measured run' : ''}` },
  { v: 'A', s: t('A.global.meiktila') - 0.3, e: t('A.global.end'), name: '메이크틸라 EMSR798 전후 스와이프' },
];
if (has('A.global.sokuluk')) SEG.splice(SEG.length - 1, 0, { v: 'A', s: t('A.global.sokuluk') - 0.2, e: Math.min(t('A.global.sokuluk') + 10, t('A.global.meiktila') - 0.5), name: '소쿨룩·비슈케크 시가지 확산' });

const parts = [];
let acc = 0; const edl = [];
SEG.forEach((g, i) => {
  const s = Math.max(0, g.s - OFF[g.v]), d = g.e - g.s;
  if (d <= 0.3) return;
  const f = path.join(DIR, `seg-${String(i).padStart(2, '0')}.mp4`);
  const vf = ['fps=30', 'scale=1440:900', 'format=yuv420p'];
  if (g.cap) vf.push(`drawtext=fontfile='${FONT}':text='${g.cap.replace(/:/g, '\\:').replace(/'/g, '')}':x=(w-tw)/2:y=h-64:fontsize=22:fontcolor=white:box=1:boxcolor=0x010102@0.82:boxborderw=12:enable='lt(t,3.2)'`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', s.toFixed(3), '-i', V[g.v], '-t', d.toFixed(3), '-vf', vf.join(','), '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '22', '-pix_fmt', 'yuv420p', f]);
  parts.push(f); edl.push({ i, src: g.v, raw_s: +s.toFixed(2), dur: +d.toFixed(2), at: +acc.toFixed(2), name: g.name, cap: g.cap || null }); acc += d;
});
fs.writeFileSync(path.join(DIR, 'concat.txt'), parts.map((p) => `file '${path.resolve(p).replace(/\\/g, '/')}'`).join('\n'));
const MP4 = path.join(OUT, 'F1-integrated.mp4');
execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', path.join(DIR, 'concat.txt'), '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', '23', '-maxrate', '3000k', '-bufsize', '6000k', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', MP4]);
const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', MP4]).toString());
const size = fs.statSync(MP4).size;
// 대표 스틸 6 — 장면 이름으로
const pick = [
  ['01-xi-namwon-p4-arrived', edl[0].at + edl[0].dur - 0.6],
  ['02-xi-aoi-parcel-card', edl[1].at + edl[1].dur - 0.5],
  ['03-xi-job-done-live', edl[2].at + edl[2].dur - 1.2],
  ['04-ops-infra-same-job', edl[4].at + edl[4].dur - 2.0],
  ['05-ops-rollback', edl[5].at + edl[5].dur - 0.8],
  ['06-global-en-gj1-done', ((g) => g.at + 2.4)(edl.find((x) => /G-J1 8\/8/.test(x.name)) || edl.at(-1))],
];
for (const [n, at] of pick) execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', Math.max(0, at).toFixed(2), '-i', MP4, '-frames:v', '1', path.join(DIR, 'stills', n + '.png')]);
fs.writeFileSync(path.join(DIR, 'edit.json'), JSON.stringify({ at: new Date().toISOString(), duration_s: +dur.toFixed(2), size_mb: +(size / 1048576).toFixed(1), jobId: M.jobId, skipped_gj1_s: +skipped.toFixed(1), edl, stills: pick.map(([n, a]) => ({ n, at: +a.toFixed(2) })), errors: M.errs }, null, 1));
for (const p of parts) fs.rmSync(p);
console.log(`[mp4] ${MP4} · ${dur.toFixed(1)} s · ${(size / 1048576).toFixed(1)} MB`);
console.table(edl.map((x) => ({ at: x.at, dur: x.dur, src: x.src, name: x.name })));
