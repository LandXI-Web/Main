// 제출 영상 자체의 먹색·검은 칸 측정(2차 판정: 별도 실행분이 아니라 제출 파일을 입력으로).
//   node shots/f1/A/tools/diag-descent.mjs [video=shots/f1/A/f1a.webm] [marks=shots/f1/A/marks.json]
// 방법: ffmpeg 20 fps · 720×450(1/4 면적) rgb24 → 프레임마다 max(R,G,B) < 24 인 픽셀 비율(전체 화면 · UI 포함).
// 구간: 글로브→남원 하강(0 → city.arrived) · 드론 AOI 하강(aoi.descend → aoi.arrived + 0.5) · 전 영상. 결과 logs/dark-frames.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const VIDEO = process.argv[2] || 'shots/f1/A/f1a.webm';
const MARKS = process.argv[3] || path.join(path.dirname(VIDEO), 'marks.json');
const W = 720, H = 450, FPS = 20, TH = 24, FR = W * H * 3;
const marks = fs.existsSync(MARKS) ? JSON.parse(fs.readFileSync(MARKS, 'utf8')) : { marks: [] };
const te = (k) => marks.marks?.find((m) => m.k === k)?.te ?? null;

const rows = [];
await new Promise((res, rej) => {
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-i', VIDEO, '-vf', `fps=${FPS},scale=${W}:${H}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  let buf = Buffer.alloc(0);
  ff.stdout.on('data', (d) => {
    buf = buf.length ? Buffer.concat([buf, d]) : d;
    while (buf.length >= FR) {
      let dark = 0, neu = 0;
      for (let i = 0; i < FR; i += 3) {
        const r = buf[i], g = buf[i + 1], b = buf[i + 2];
        if (r < TH && g < TH && b < TH) { dark++; if (Math.max(r, g, b) - Math.min(r, g, b) < 8) neu++; }
      }
      rows.push({ t: +(rows.length / FPS).toFixed(2), dark: +(dark / (W * H)).toFixed(5), neutral: +(neu / (W * H)).toFixed(5) });
      buf = buf.subarray(FR);
    }
  });
  ff.stderr.on('data', (d) => process.stderr.write(d));
  ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
});
// dark = 판정 지표 그대로(max(RGB) < 24) · neutral = 그중 무채색(max−min < 8 · 먹색 바탕·no-data 검정은 무채색, 밤바다·그림자는 푸르거나 초록)
const seg = (a, b) => { const r = rows.filter((x) => (a == null || x.t >= a) && (b == null || x.t <= b)); const m = r.reduce((p, x) => (x.dark > p.dark ? x : p), { dark: 0, t: null }); const n = r.reduce((p, x) => (x.neutral > p.neutral ? x : p), { neutral: 0, t: null });
  return { from: a, to: b, frames: r.length, max_pct: +(m.dark * 100).toFixed(2), at_s: m.t, over1pct: r.filter((x) => x.dark > 0.01).length, neutral_max_pct: +(n.neutral * 100).toFixed(2), neutral_at_s: n.t }; };
const out = {
  video: VIDEO, method: `ffmpeg fps=${FPS} scale=${W}x${H} · 픽셀 max(R,G,B) < ${TH} 비율 · 전체 화면(UI 포함)`, frames: rows.length,
  descent: seg(0, te('city.arrived')),
  aoi: seg(te('aoi.descend'), te('aoi.arrived') != null ? te('aoi.arrived') + 0.5 : null),
  all: seg(null, null),
  top: [...rows].sort((a, b) => b.dark - a.dark).slice(0, 8).map((x) => ({ t: x.t, pct: +(x.dark * 100).toFixed(2), neutral_pct: +(x.neutral * 100).toFixed(2) })),
};
const dst = path.join(path.dirname(VIDEO), 'logs', 'dark-frames.json');
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.writeFileSync(dst, JSON.stringify({ ...out, rows }, null, 0));
console.log(JSON.stringify(out, null, 1));
