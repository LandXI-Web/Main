/* 소개 영상 4판 편집 — 컷(story-v4 SHOTS)마다 원본 구간을 잇고, 화면을 통째로 줄여 틀 위에 얹고(자르기 · 확대 없음), 아래 띠에 자막을 얹는다.
   컷 길이 = 나레이션 길이에 맞춤(LEAD + 말 + TAIL · 그림이 모자라면 마지막 장면을 멈춰 이어 감 · 말은 그대로).
   node edit-v4.mjs   → <OUT4>/land-xi-intro-v4-silent.mp4 (소리 없음) · land-xi-intro-v4-narration.mp4 (나레이션) · land-xi-intro-v4.srt
                        narration.wav · narration.mp3 (-16 LUFS) · storyboard.md · story-times.json · stills/ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { SHOTS, SCREEN, BG, XF, LEAD, TAIL, CHAPTERS } from './story-v4.mjs';

const OUT2 = process.env.LX_VIDEO_OUT4 || 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v4';
const RAW = path.join(OUT2, 'raw'), TMP = path.join(OUT2, '_seg'), CARDS = path.join(OUT2, 'cards'), TTS = path.join(OUT2, 'tts');
fs.mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30'];
const IN = 0.25;   // 컷 안 조각 이음
const N2 = (i) => String(i + 1).padStart(2, '0');
const TT = JSON.parse(fs.readFileSync(path.join(TTS, 'times.json'), 'utf8'));
const narrDur = (i) => TT.lines[i]?.dur || 0;
const BGHEX = '0x' + BG.slice(1);

// 1) 컷 만들기
const shots = [];
for (const [i, s] of SHOTS.entries()) {
  // 1-a 조각
  const parts = s.pieces.map((pc, k) => {
    const out = path.join(TMP, `p-${N2(i)}-${k}.mp4`), sp = pc.speed || 1;
    let vf = `trim=start=${pc.from}:end=${pc.to},setpts=(PTS-STARTPTS)/${sp},fps=30`;
    if (pc.blur) { const [x, y, w, h] = pc.blur; vf = `${vf},split[a][b];[b]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=12:luma_power=2:chroma_radius=10:chroma_power=2[bl];[a][bl]overlay=${x}:${y}`; }
    ff(['-i', path.join(RAW, pc.clip + '.mp4'), '-filter_complex', `[0:v]${vf},format=yuv420p[v]`, '-map', '[v]', '-an', ...ENC, out]);
    return { file: out, dur: probe(out) };
  });
  // 1-b 조각 잇기(짧은 교차)
  let vis = parts[0].dur, chain = '', last = '[0:v]';
  for (let k = 1; k < parts.length; k++) { const off = vis - IN; chain += `${last}[${k}:v]xfade=transition=fade:duration=${IN}:offset=${off.toFixed(3)}[j${k}];`; last = `[j${k}]`; vis = off + parts[k].dur; }
  // 1-c 길이 — 말 + 여유, 그림이 길면(keep 아니면) 말 끝 조금 뒤에서 자름
  const need = narrDur(i) + LEAD + TAIL;
  const D = Math.max(need, s.keep ? vis : Math.min(vis, need + 0.4));
  const pad = Math.max(0, D - vis + 0.05);
  // 1-d 합성 — 전체 화면(끝 장면)은 그대로, 나머지는 줄여 틀 위에 + 자막
  const ins = parts.flatMap((p) => ['-i', p.file]);
  const nIn = parts.length;
  let fc = chain + `${last}tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},trim=duration=${D.toFixed(3)},setpts=PTS-STARTPTS[raw];`;
  if (s.full) fc += `[raw]null[o]`;
  else {
    ins.push('-i', path.join(CARDS, 'frame.png'));
    fc += `color=c=${BGHEX}:s=1920x1080:r=30:d=${D.toFixed(3)}[bg];[raw]scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos[sc];[bg][sc]overlay=${SCREEN.x}:${SCREEN.y}[b1];[b1][${nIn}:v]overlay=0:0[b2];`;
    if (s.cap) {
      ins.push('-loop', '1', '-t', D.toFixed(3), '-i', path.join(CARDS, `cap-${N2(i)}.png`));
      const a = 0.35, b = D - 0.45;
      fc += `[${nIn + 1}:v]format=rgba,fade=in:st=${a}:d=0.3:alpha=1,fade=out:st=${(b - 0.3).toFixed(3)}:d=0.3:alpha=1[cp];[b2][cp]overlay=0:0:shortest=1[o]`;
    } else fc += `[b2]null[o]`;
  }
  const out = path.join(TMP, `shot-${N2(i)}.mp4`);
  ff([...ins, '-filter_complex', fc + ';[o]format=yuv420p[v]', '-map', '[v]', '-an', ...ENC, '-t', D.toFixed(3), out]);
  shots.push({ ...s, i, file: out, dur: probe(out), vis: +vis.toFixed(2), need: +need.toFixed(2) });
  console.log(N2(i), s.id, 'vis', vis.toFixed(1), 'need', need.toFixed(1), 'D', D.toFixed(1));
}

// 2) 컷 잇기 — 교차 전환 XF
const starts = [0]; let t = shots[0].dur, fc = '', last = '[0:v]';
for (let i = 1; i < shots.length; i++) { const off = t - XF; fc += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`; last = `[x${i}]`; starts.push(off); t = off + shots[i].dur; }
const total = t;
const silent = path.join(OUT2, 'land-xi-intro-v4-silent.mp4');
ff([...shots.flatMap((s) => ['-i', s.file]), '-filter_complex', fc + `${last}fade=in:st=0:d=0.5:color=white,fade=out:st=${(total - 0.8).toFixed(2)}:d=0.8:color=white,scale=out_range=tv,format=yuv420p[v]`, '-map', '[v]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30', '-movflags', '+faststart', '-t', total.toFixed(3), silent]);

// 3) 나레이션 길 — 줄마다 컷 시작 + LEAD 에 놓고 섞은 뒤 -16 LUFS
const at = shots.map((s, i) => +(starts[i] + LEAD).toFixed(3));
const ains = TT.lines.flatMap((l) => ['-i', path.join(TTS, `line-${N2(l.i)}.wav`)]);
const afc = TT.lines.map((l, k) => `[${k}:a]adelay=${Math.round(at[l.i] * 1000)}:all=1[a${k}]`).join(';') + ';' + TT.lines.map((_, k) => `[a${k}]`).join('') + `amix=inputs=${TT.lines.length}:normalize=0:dropout_transition=0,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)}[mix]`;
const premix = path.join(TMP, 'narr-premix.wav');
ff([...ains, '-filter_complex', afc, '-map', '[mix]', '-ar', '48000', '-ac', '1', premix]);
// 두 번 재는 loudnorm(측정 → 맞춤)
const r = spawnSync('ffmpeg', ['-hide_banner', '-i', premix, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const J = JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1));
const narrWav = path.join(OUT2, 'narration.wav'), narrMp3 = path.join(OUT2, 'narration.mp3');
ff(['-i', premix, '-af', `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${J.input_i}:measured_TP=${J.input_tp}:measured_LRA=${J.input_lra}:measured_thresh=${J.input_thresh}:offset=${J.target_offset}:linear=true`, '-ar', '48000', '-ac', '1', narrWav]);
ff(['-i', narrWav, '-c:a', 'libmp3lame', '-b:a', '192k', narrMp3]);
const narrated = path.join(OUT2, 'land-xi-intro-v4-narration.mp4');
ff(['-i', silent, '-i', narrWav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ac', '2', '-ar', '48000', '-shortest', '-movflags', '+faststart', narrated]);
const r2 = spawnSync('ffmpeg', ['-hide_banner', '-i', narrWav, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
const J2 = JSON.parse(r2.stderr.slice(r2.stderr.lastIndexOf('{'), r2.stderr.lastIndexOf('}') + 1));

// 4) 자막 파일 · 시간표 · 이야기 판
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const caps = shots.filter((s) => s.cap).map((s) => ({ s, a: starts[s.i] + 0.35, b: starts[s.i] + s.dur - 0.45 }));
fs.writeFileSync(path.join(OUT2, 'land-xi-intro-v4.srt'), caps.map((c, k) => `${k + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.s.cap.join('\n')}\n`).join('\n'), 'utf8');
const rows = shots.map((s) => ({ i: s.i + 1, id: s.id, ch: s.ch, start: +starts[s.i].toFixed(2), dur: +s.dur.toFixed(2), narrAt: at[s.i], narrDur: narrDur(s.i), cap: s.cap, narr: s.narr }));
fs.writeFileSync(path.join(OUT2, 'story-times.json'), JSON.stringify({ total: +total.toFixed(2), loudness: { I: J2.input_i, TP: J2.input_tp }, engine: TT.engine, shots: rows }, null, 1));

// 5) 살펴볼 그림 — 자막마다 한 장(말이 끝날 즈음 · 화면이 다 바뀐 뒤) + 끝 장면
const ST = path.join(OUT2, 'stills'); fs.mkdirSync(ST, { recursive: true });
for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
shots.forEach((s) => { const x = starts[s.i] + Math.min(s.dur - 0.9, Math.max(1.2, LEAD + narrDur(s.i) - 0.3)); ff(['-ss', x.toFixed(2), '-i', silent, '-frames:v', '1', path.join(ST, `still-${N2(s.i)}-${s.id}.png`)]); });

const fmt = (x) => x.toFixed(1);
const md = `# Land-XI 소개 영상 4판 — 이야기 판 (2026-10-18)

- 사용자 피드백(3판 · 10-18): ① 지자체 다음 LX 관리자 — 지자체 서비스 만들기 · 기관에 공유 ② 영농관리 카드 먼저 → 결과 지도(끝까지 보이게) ③ 자막 '드론 촬영 / AI 분석 요청' ④ 라벨링은 지도 위에서 그리는 모습(화면 커밋 뒤 다시) ⑤ 지도 서비스는 추론 결과가 예쁘게 잘 나온 층(강진군 경작·휴경) ⑥ 끝 = 흰 바탕 · 예전 'LAND-XI PLATFORM' CI(A안 · B안 '국토를 읽는 AI' 그림은 cards/end-B.png)
- 녹화 안전: 저장 요청은 가짜 성공으로 막음 · 관리자 기관 공유 체크는 누르지 않음 · 학습 시작 제출은 가로채 가짜 성공(GPU 0) · 촬영 요청은 보내지 않음
- 결과: land-xi-intro-v4-silent.mp4(소리 없음) · land-xi-intro-v4-narration.mp4(나레이션) · 1920×1080 · 30fps · ${fmt(total)}초 · 자막 land-xi-intro-v4.srt
- 화면 배치: 녹화 화면(1920×1080)을 자르지 않고 0.858배로 줄여 위(${SCREEN.w}×${SCREEN.h})에, 자막은 아래 띠(945–1080)에만 — 화면 위에 글이 덮이지 않음 · 확대(줌) 없음 · 커서 없음
- 나레이션: ${TT.engine} · 줄마다 tts/line-XX.wav · 합친 소리 narration.wav / narration.mp3 (${J2.input_i} LUFS) · 원고 narration.txt — 사람 목소리로 바꾸면 같은 번호 파일만 바꾸고 edit-v4.mjs 를 다시 돌린다(컷 길이가 말에 맞춰짐)
- 녹화: 바깥 주소(app · namwon · kgz-agri .land-xi.dev) 로그인 폼 · 직원 test · 영업 sales · 기관은 기관 주소에서만 · 저장하는 동작 없음(쓰기 요청은 가짜 성공으로 막음)

| # | 장 | 시간(초) | 자막(띠) | 나레이션 |
|---|---|---|---|---|
${rows.map((r) => `| ${r.i} | ${r.ch} ${CHAPTERS[r.ch] || '마무리'} | ${fmt(r.start)}–${fmt(r.start + r.dur)} | ${r.cap ? r.cap.join(' / ') : '— (흰 바탕 · Land-XI 플랫폼 · LX 한국국토정보공사 CI)'} | ${r.narr} |`).join('\n')}

## 만드는 법
01. 디자인/docs/superpowers/final/process/video/ — capture-v4.mjs (adm · nw · map · chat — 나머지는 3판 raw 복사 · 학습데이터 구축은 라벨링 화면 커밋 뒤 다시) · capture-v3.mjs (lx · dash · sales · train) → cards-v4.mjs → tts-v4.mjs → edit-v4.mjs (이야기 판 = story-v4.mjs)
`;
fs.writeFileSync(path.join(OUT2, 'storyboard.md'), md, 'utf8');
console.log(JSON.stringify({ total: +total.toFixed(2), shots: shots.length, loud: J2.input_i, silent, narrated }));
