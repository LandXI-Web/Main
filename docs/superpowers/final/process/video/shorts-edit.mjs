/* 숏츠 편집(세로 1080×1920 · 30fps · 소리 없음 — 10-21 사용자 "나레이션은 필요 없고. 자막만 있으면 된다.")
   컷(shorts-story SHOTS)마다 원본 조각을 잇고, 화면(1080×1620)을 자르지 않고 위에 얹고, 아래 띠(1620–1920)에 자막을 얹는다. 끝 컷(흰 바탕 CI)은 통째로.
   node shorts-edit.mjs → <OUTS>/land-xi-shorts.mp4 · land-xi-shorts.srt · storyboard.md · story-times.json · stills/ */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { OUTS, SH, BAND } from './shorts-lib.mjs';
import { SHOTS, XF, IN, CH } from './shorts-story.mjs';

const RAW = path.join(OUTS, 'raw'), TMP = path.join(OUTS, '_seg'), CARDS = path.join(OUTS, 'cards');
fs.mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30'];
const N2 = (i) => String(i + 1).padStart(2, '0');
const BANDBG = '0xF2F4F6';

// 1) 컷 만들기
const shots = [];
for (const [i, s] of SHOTS.entries()) {
  const parts = s.pieces.map((pc, k) => {
    const out = path.join(TMP, `p-${N2(i)}-${k}.mp4`), sp = pc.speed || 1;
    // steady: 걸음마다 타일을 기다린 동안의 같은 그림을 덜어 내고(mpdecimate) 남은 그림을 고르게 다시 놓는다
    const base = `trim=start=${pc.from}:end=${pc.to},setpts=PTS-STARTPTS`;
    const vf = pc.steady ? `${base},mpdecimate=hi=768:lo=320:frac=0.33,setpts=N/30/TB,setpts=PTS/${sp},fps=30` : `${base},setpts=PTS/${sp},fps=30`;
    ff(['-i', path.join(RAW, pc.clip + '.mp4'), '-vf', `${vf},format=yuv420p`, '-an', ...ENC, out]);
    return { file: out, dur: probe(out) };
  });
  let vis = parts[0].dur, chain = '', last = '[0:v]';
  for (let k = 1; k < parts.length; k++) { const off = vis - IN; chain += `${last}[${k}:v]xfade=transition=fade:duration=${IN}:offset=${off.toFixed(3)}[j${k}];`; last = `[j${k}]`; vis = off + parts[k].dur; }
  const D = vis;
  const ins = parts.flatMap((p) => ['-i', p.file]);
  const nIn = parts.length;
  let fc = chain + `${last}trim=duration=${D.toFixed(3)},setpts=PTS-STARTPTS[raw];`;
  if (s.full) fc += `[raw]scale=1080:1920:flags=lanczos[o]`;
  else {
    fc += `color=c=${BANDBG}:s=1080x1920:r=30:d=${D.toFixed(3)}[bg];[bg][raw]overlay=0:0[b1];`;
    ins.push('-loop', '1', '-t', D.toFixed(3), '-i', path.join(CARDS, `cap-${N2(i)}.png`));
    const a = 0.2, b = D - 0.3;
    fc += `[${nIn}:v]format=rgba,fade=in:st=${a}:d=0.25:alpha=1,fade=out:st=${(b - 0.25).toFixed(3)}:d=0.25:alpha=1[cp];[b1][cp]overlay=0:0:shortest=1[o]`;
  }
  const out = path.join(TMP, `shot-${N2(i)}.mp4`);
  ff([...ins, '-filter_complex', fc + ';[o]format=yuv420p[v]', '-map', '[v]', '-an', ...ENC, '-t', D.toFixed(3), out]);
  shots.push({ ...s, i, file: out, dur: probe(out) });
  console.log(N2(i), s.id, 'D', probe(out).toFixed(2));
}

// 2) 컷 잇기 — 교차 전환 XF · 처음은 흰색에서 · 끝은 흰 바탕 그대로
const starts = [0]; let t = shots[0].dur, fc = '', last = '[0:v]';
for (let i = 1; i < shots.length; i++) { const off = t - XF; fc += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`; last = `[x${i}]`; starts.push(off); t = off + shots[i].dur; }
const total = t;
const out = path.join(OUTS, 'land-xi-shorts.mp4');
ff([...shots.flatMap((s) => ['-i', s.file]), '-filter_complex', fc + `${last}fade=in:st=0:d=0.4:color=white,scale=out_range=tv,format=yuv420p[v]`, '-map', '[v]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30', '-movflags', '+faststart', '-t', total.toFixed(3), out]);

// 3) 자막 파일 · 시간표 · 이야기 판
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const caps = shots.filter((s) => s.cap).map((s) => ({ s, a: starts[s.i] + 0.2, b: starts[s.i] + s.dur - 0.3 }));
fs.writeFileSync(path.join(OUTS, 'land-xi-shorts.srt'), caps.map((c, k) => `${k + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.s.cap.join('\n')}\n`).join('\n'), 'utf8');
const rows = shots.map((s) => ({ i: s.i + 1, id: s.id, ch: s.ch, start: +starts[s.i].toFixed(2), dur: +s.dur.toFixed(2), cap: s.cap || null }));
fs.writeFileSync(path.join(OUTS, 'story-times.json'), JSON.stringify({ total: +total.toFixed(2), shots: rows }, null, 1));

// 4) 살펴볼 그림 — 자막마다 한 장(컷 끝 무렵 · 자막이 다 보일 때) + 끝 장면
const ST = path.join(OUTS, 'stills'); fs.mkdirSync(ST, { recursive: true });
for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
shots.forEach((s) => { const x = starts[s.i] + (s.still ?? Math.max(0.6, s.dur - (s.full ? 0.3 : 0.75))); ff(['-ss', x.toFixed(2), '-i', out, '-frames:v', '1', path.join(ST, `still-${N2(s.i)}-${s.id}.png`)]); });

const fmt = (x) => x.toFixed(1);
const md = `# Land-XI 숏츠 — 이야기 판 (2026-10-21)

- 사용자 지시(10-21): "지금 우리 영상 만든거 있자나 숏츠 버젼으로 하나 만들어야 되서 … 영상의 주요 내용은 1. 메인화면 2. 전국단위 하천계곡 의심시설/농지이용 AI분석 결과 3. LLM 기반 지도분석 및 보고서 발행의 내용으로 30초 분량으로 만들어줘" · "나레이션은 필요 없고. 자막만 있으면 된다."
- 화면 글: 'LLM 기반'은 쓰지 않고 'XI ChatGEO'(10-18 "LLM 기반은 삭제하자") · 하천 결과는 사이트 이름 그대로 '하천구역 안 건물'
- 결과: land-xi-shorts.mp4 · 1080×1920 · 30fps · ${fmt(total)}초 · 소리 없음(자막만) · 자막 파일 land-xi-shorts.srt
- 화면 배치: 사이트를 휴대폰 배치(창 432×648 · 배율 2.5)로 찍어 1080×1620 을 자르지 않고 위에, 자막은 아래 띠(${BAND.y}–1920)에만 — 화면 위에 글이 덮이지 않음 · 확대 · 자르기 없음 · 커서 없음 · 끝은 흰 바탕 LAND-XI PLATFORM + LX 한국국토정보공사
- 녹화: 바깥 주소 app.land-xi.dev 로그인 폼(직원 test) · 메인은 로그인 전 공개 화면 · 저장 요청은 가짜 성공으로 막음(색칠 끄기의 사람별 기억 저장도 막힘 → 서버 설정 그대로) · GPU 작업 0 · XI ChatGEO 보고서(한글 문서 초안)는 실제로 한 번 만들어짐(읽기 전용 문서)
- 2장 날기: 한 걸음씩 옮기며 걸음마다 타일이 다 그려질 때까지 기다리고, 기다린 동안의 같은 그림은 편집에서 덜어 냄 → 끊김 없이 내려앉음(화면 속도만 빠르게 · 그림은 실제 화면)

| # | 장 | 시간(초) | 자막(띠) |
|---|---|---|---|
${rows.map((r) => `| ${r.i} | ${r.ch ? `${r.ch} ${CH[r.ch]}` : '마무리'} | ${fmt(r.start)}–${fmt(r.start + r.dur)} | ${r.cap ? r.cap.join(' / ') : '— (흰 바탕 · LAND-XI PLATFORM · LX 한국국토정보공사)'} |`).join('\n')}

## 만드는 법
01. 디자인/docs/superpowers/final/process/video/ — shorts-capture.mjs (main · nat · chat) → shorts-cards.mjs → shorts-edit.mjs (이야기 판 = shorts-story.mjs · 공용 = shorts-lib.mjs)
`;
fs.writeFileSync(path.join(OUTS, 'storyboard.md'), md, 'utf8');
console.log(JSON.stringify({ total: +total.toFixed(2), shots: shots.length, out }));
