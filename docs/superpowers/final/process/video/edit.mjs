/* 소개 영상 편집 — story.mjs 의 조각(원본 녹화 구간 · 빠르기 · 가림 · 줌)을 이어 붙이고(교차 전환), 자막 판을 얹는다. 소리 없음.
   node edit.mjs   → <OUT>/land-xi-intro-2026-10-18.mp4 · .srt · storyboard 시간표(story-times.json) · stills/*.png */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { OUT } from './lib.mjs';
import { SEGMENTS, CAPTIONS, XF } from './story.mjs';

const RAW = path.join(OUT, 'raw'), TMP = path.join(OUT, '_seg'), CARDS = path.join(OUT, 'cards');
fs.mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30'];

// 1) 조각 만들기
const segs = [];
for (const [i, s] of SEGMENTS.entries()) {
  const src = path.join(RAW, s.clip + '.mp4');
  const out = path.join(TMP, `seg-${String(i).padStart(2, '0')}.mp4`);
  const sp = s.speed || 1;
  const len = (s.to - s.from) / sp;
  const f = [`trim=start=${s.from}:end=${s.to}`, `setpts=(PTS-STARTPTS)/${sp}`, 'fps=30'];
  if (s.zoom) {   // 천천히 다가가기 — 끝 배율 z · 중심 (cx, cy)(0~1) · 두 배로 키운 뒤 zoompan(흔들림 줄임)
    const [z, cx, cy] = s.zoom, N = Math.round(len * 30);
    f.push('scale=3840:2160:flags=lanczos', `zoompan=z='1+${z - 1}*(1-cos(PI*min(on/${N},1)))/2':x='(iw-iw/zoom)*${cx}':y='(ih-ih/zoom)*${cy}':d=1:s=1920x1080:fps=30`);
  }
  let vf = f.join(',');
  if (s.blur) { const [x, y, w, h] = s.blur; vf = `${vf},split[a][b];[b]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=12:luma_power=2:chroma_radius=10:chroma_power=2[bl];[a][bl]overlay=${x}:${y}`; }
  ff(['-i', src, '-filter_complex', `[0:v]${vf},format=yuv420p[v]`, '-map', '[v]', '-an', ...ENC, out]);
  segs.push({ ...s, file: out, dur: probe(out) });
}

// 2) 교차 전환으로 잇기 — 조각 사이 XF 초(장면 안 이음은 cutXF)
let inputs = [], fc = '', last = '[0:v]', t = segs[0].dur;
const starts = [0];
segs.forEach((s) => inputs.push('-i', s.file));
for (let i = 1; i < segs.length; i++) {
  const x = segs[i].xf ?? XF;
  const off = t - x;
  fc += `${last}[${i}:v]xfade=transition=fade:duration=${x}:offset=${off.toFixed(3)}[x${i}];`;
  last = `[x${i}]`; starts.push(off); t = off + segs[i].dur;
}
const total = t;
const joined = path.join(TMP, 'joined.mp4');
ff([...inputs, '-filter_complex', fc.replace(/;$/, ''), '-map', last, ...ENC, joined]);

// 3) 자막 시간 — 조각 번호 + 그 안 몇 초
const sceneEnd = (k) => { for (let j = k + 1; j < segs.length; j++) if (segs[j].scene !== segs[k].scene) return starts[j]; return total; };   // 자막은 다음 장면이 겹쳐 오기 전에 끝
const caps = CAPTIONS.map((c, i) => { const a = starts[c.seg] + (c.at || 0); return { ...c, i, a, b: Math.min(a + c.dur, sceneEnd(c.seg) - 0.05, total - 0.2) }; });
caps.forEach((c, k) => { if (caps[k + 1] && caps[k + 1].a < c.b + 0.1) c.b = caps[k + 1].a - 0.1; });   // 자막은 한 번에 하나
let cfc = '', cl = '[0:v]';
const cin = ['-i', joined];
caps.forEach((c, k) => {
  cin.push('-loop', '1', '-t', String(total), '-i', path.join(CARDS, `cap-${String(c.i).padStart(2, '0')}.png`));
  cfc += `[${k + 1}:v]format=rgba,fade=in:st=${c.a.toFixed(2)}:d=0.35:alpha=1,fade=out:st=${(c.b - 0.35).toFixed(2)}:d=0.35:alpha=1[c${k}];${cl}[c${k}]overlay=0:0:enable='between(t,${c.a.toFixed(2)},${c.b.toFixed(2)})'[o${k}];`;
  cl = `[o${k}]`;
});
const final = path.join(OUT, 'land-xi-intro-2026-10-18.mp4');
ff([...cin, '-filter_complex', cfc + `${cl}fade=in:st=0:d=0.6:color=white,fade=out:st=${(total - 0.8).toFixed(2)}:d=0.8:color=white,scale=out_range=tv,format=yuv420p[v]`, '-map', '[v]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30', '-movflags', '+faststart', '-t', total.toFixed(3), final]);

// 4) 자막 파일(.srt) · 시간표
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(path.join(OUT, 'land-xi-intro-2026-10-18.srt'), caps.map((c, k) => `${k + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${[c.kicker, ...c.lines].filter(Boolean).join('\n')}\n`).join('\n'), 'utf8');
fs.writeFileSync(path.join(OUT, 'story-times.json'), JSON.stringify({ total, segments: segs.map((s, i) => ({ i, clip: s.clip, scene: s.scene, start: +starts[i].toFixed(2), dur: +s.dur.toFixed(2) })), captions: caps.map((c) => ({ seg: c.seg, a: +c.a.toFixed(2), b: +c.b.toFixed(2), text: [c.kicker, ...c.lines].filter(Boolean).join(' / ') })) }, null, 1));

// 5) 살펴볼 그림 — 자막마다 가운데 한 장
const ST = path.join(OUT, 'stills'); fs.mkdirSync(ST, { recursive: true });
for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
caps.forEach((c, k) => ff(['-ss', (c.a + Math.min(2.2, (c.b - c.a) / 2)).toFixed(2), '-i', final, '-frames:v', '1', path.join(ST, `still-${String(k + 1).padStart(2, '0')}-${c.scene || 's'}.png`)]));
ff(['-ss', (total - 1.6).toFixed(2), '-i', final, '-frames:v', '1', path.join(ST, `still-${String(caps.length + 1).padStart(2, '0')}-end.png`)]);
console.log(JSON.stringify({ total: +total.toFixed(2), segs: segs.length, caps: caps.length, final }));
