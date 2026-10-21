/* 숏츠 2판 편집(PC 화면 · 세로 1080×1920 · 30fps · 소리 없음 · 자막만)
   1) 컷마다 PC 화면 조각을 잇고(2880×1620) 2) shorts-v2-render.py 가 카메라(전체 → 확대) · 바탕 · 자막을 그려 1080×1920 3) 컷을 교차 전환으로 잇는다.
   로딩 검사: 쓰는 조각이 녹화 때 적은 로딩 구간(raw2/capture-log.json loading — '불러오는 중' · '찾는 중' · 도는 표시 · 덜 그린 타일)과 겹치면 멈춘다.
   node shorts-v2-edit.mjs → <OUTS>/land-xi-shorts-v2.mp4 · land-xi-shorts-v2.srt · storyboard-v2.md · story-times-v2.json · stills-v2/ (자막마다 한 장 + 확대 중간 그림) */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { OUTS } from './shorts-lib.mjs';
import { SHOTS, XF, IN, CH } from './shorts-v2-story.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW2 = path.join(OUTS, 'raw2'), RAW = path.join(OUTS, 'raw'), TMP = path.join(OUTS, '_seg2'), CARDS = path.join(OUTS, 'cards');
fs.mkdirSync(TMP, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const N2 = (i) => String(i + 1).padStart(2, '0');
const LOG = JSON.parse(fs.readFileSync(path.join(RAW2, 'capture-log.json'), 'utf8'));

// 0) 로딩 검사 — 조각 [from, to] 이 로딩 구간과 겹치면(앞뒤 0.05초 여유) 멈춘다
const hits = [];
for (const s of SHOTS) for (const pc of s.pieces) {
  for (const [a, b, why] of LOG[pc.clip]?.loading || []) if (a <= pc.to + 0.05 && b >= pc.from - 0.05) hits.push({ shot: s.id, clip: pc.clip, piece: [pc.from, pc.to], loading: [a, b, why] });
  if (pc.clip === 'd2-fly' && LOG['d2-fly']?.notReadyAtShot?.length) hits.push({ shot: s.id, clip: 'd2-fly', notReady: LOG['d2-fly'].notReadyAtShot });
}
fs.writeFileSync(path.join(OUTS, 'loading-check-v2.json'), JSON.stringify({ hits, at: new Date().toISOString() }, null, 1));
if (hits.length) { console.log('로딩 구간과 겹침', JSON.stringify(hits, null, 1)); process.exit(1); }

// 1) 컷 만들기
const shots = [];
for (const [i, s] of SHOTS.entries()) {
  const W = s.full ? 1080 : 2880, H = s.full ? 1920 : 1620;
  const parts = s.pieces.map((pc, k) => {
    const out = path.join(TMP, `p-${N2(i)}-${k}.mp4`), sp = pc.speed || 1;
    ff(['-i', path.join(pc.raw === 'raw' ? RAW : RAW2, pc.clip + '.mp4'), '-vf', `trim=start=${pc.from}:end=${pc.to},setpts=(PTS-STARTPTS)/${sp},fps=30,scale=${W}:${H},format=yuv420p`, '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '10', '-r', '30', out]);
    return { file: out, dur: probe(out) };
  });
  let vis = parts[0].dur, chain = '', last = '[0:v]';
  for (let k = 1; k < parts.length; k++) { const off = vis - IN; chain += `${last}[${k}:v]xfade=transition=fade:duration=${IN}:offset=${off.toFixed(3)}[j${k}];`; last = `[j${k}]`; vis = off + parts[k].dur; }
  const scr = path.join(TMP, `scr-${N2(i)}.mp4`);
  if (parts.length > 1) ff([...parts.flatMap((p) => ['-i', p.file]), '-filter_complex', chain + `${last}format=yuv420p[v]`, '-map', '[v]', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '10', '-r', '30', scr]);
  else fs.copyFileSync(parts[0].file, scr);
  const D = probe(scr), out = path.join(TMP, `shot-${N2(i)}.mp4`);
  if (s.full) fs.copyFileSync(scr, out);
  else {
    const spec = path.join(TMP, `spec-${N2(i)}.json`);
    fs.writeFileSync(spec, JSON.stringify({ src: scr, out, dur: D, cam: s.cam, cap: s.cap ? path.join(CARDS, `cap-${N2(i)}.png`) : null }));
    execFileSync('python', [path.join(HERE, 'shorts-v2-render.py'), spec], { stdio: 'inherit' });
  }
  shots.push({ ...s, i, file: out, dur: probe(out) });
  console.log(N2(i), s.id, 'D', probe(out).toFixed(2));
}

// 2) 컷 잇기 — 교차 전환 XF · 처음은 흰색에서
const starts = [0]; let t = shots[0].dur, fc = '', last = '[0:v]';
for (let i = 1; i < shots.length; i++) { const off = t - XF; fc += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`; last = `[x${i}]`; starts.push(off); t = off + shots[i].dur; }
const total = t;
const out = path.join(OUTS, 'land-xi-shorts-v2.mp4');
ff([...shots.flatMap((s) => ['-i', s.file]), '-filter_complex', fc + `${last}fade=in:st=0:d=0.4:color=white,scale=out_range=tv,format=yuv420p[v]`, '-map', '[v]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30', '-movflags', '+faststart', '-t', total.toFixed(3), out]);

// 3) 자막 · 시간표
const ts = (x) => { const ms = Math.round(x * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, se = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(se).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
const caps = shots.filter((s) => s.cap).map((s) => ({ s, a: starts[s.i] + 0.15, b: starts[s.i] + s.dur - 0.2 }));
fs.writeFileSync(path.join(OUTS, 'land-xi-shorts-v2.srt'), caps.map((c, k) => `${k + 1}\n${ts(c.a)} --> ${ts(c.b)}\n${c.s.cap.join('\n')}\n`).join('\n'), 'utf8');
const rows = shots.map((s) => ({ i: s.i + 1, id: s.id, ch: s.ch, start: +starts[s.i].toFixed(2), dur: +s.dur.toFixed(2), cap: s.cap || null, pieces: s.pieces, cam: s.cam || null }));
fs.writeFileSync(path.join(OUTS, 'story-times-v2.json'), JSON.stringify({ total: +total.toFixed(2), shots: rows }, null, 1));

// 4) 그림 — 자막마다 한 장 + 확대 중간(카메라 걸음 가운데)
const ST = path.join(OUTS, 'stills-v2'); fs.mkdirSync(ST, { recursive: true });
for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
const grab = (x, name) => ff(['-ss', x.toFixed(2), '-i', out, '-frames:v', '1', path.join(ST, name)]);
shots.forEach((s) => {
  grab(starts[s.i] + Math.min(s.dur - XF - 0.1, s.still ?? s.dur - 0.6), `still-${N2(s.i)}-${s.id}.png`);
  (s.cam || []).forEach((c, k) => { const nx = s.cam[k + 1]; if (nx && (nx[3] !== c[3] || nx[1] !== c[1])) grab(starts[s.i] + (c[0] + nx[0]) / 2, `zoom-${N2(s.i)}-${s.id}-${k}.png`); });
});

const fmt = (x) => x.toFixed(1);
const md = `# Land-XI 숏츠 2판 — 이야기 판 (2026-10-21)

- 사용자(10-21): "왜 영상이 모바일 버젼이지?" → PC 화면으로 · "지금 영상을 보면 로딩중이 계속 뜨는데 이런게 뜨면 안된다." · (앞서) "나레이션은 필요 없고. 자막만 있으면 된다."
- 결과: land-xi-shorts-v2.mp4 · 1080×1920 · 30fps · ${fmt(total)}초 · 소리 없음 · 자막 land-xi-shorts-v2.srt (1판 land-xi-shorts.mp4 는 그대로 둠)
- 화면: PC 화면(1920×1080 · 배율 1.5 로 찍어 확대해도 또렷)을 위 무대(1080×1620)에 — 컷마다 먼저 화면 전체(폭 1080 · 위아래는 같은 그림을 흐리고 밝게), 그다음 보여 줄 곳으로 천천히 확대(ease-in-out). 자막은 아래 띠(1620–1920)에만 · 커서 없음 · 끝은 흰 바탕 LAND-XI PLATFORM + LX 한국국토정보공사
- 로딩 표시 0: 녹화 때 0.1초마다 '불러오는 중' · '찾는 중' · 도는 표시 · 덜 그린 지도 타일을 적어 두고(raw2/capture-log.json) 그 구간은 쓰지 않음(편집 때 검사 · loading-check-v2.json — 겹침 ${hits.length}) · 지도는 미리 한 번 돌아 타일을 받아 둠 · 전국 → 함양군 날기는 걸음마다 다 그려진 뒤 한 장씩 찍음 · XI ChatGEO 는 물음 → 답 사이 기다림을 잘라 냄(내용은 실제 답)
- 녹화: 바깥 주소 app.land-xi.dev 로그인 폼(직원 test) · 메인은 로그인 전 공개 화면 · 저장 요청은 가짜 성공으로 막음(색칠 끄기의 사람별 기억 저장도 막힘) · GPU 작업 0 · 보고서(한글 문서 초안)는 녹화 때 실제로 한 번 만들어짐(읽기 전용)

| # | 장 | 시간(초) | 자막(띠) |
|---|---|---|---|
${rows.map((r) => `| ${r.i} | ${r.ch ? `${r.ch} ${CH[r.ch]}` : '마무리'} | ${fmt(r.start)}–${fmt(r.start + r.dur)} | ${r.cap ? r.cap.join(' / ') : '— (흰 바탕 · LAND-XI PLATFORM · LX 한국국토정보공사)'} |`).join('\n')}

## 만드는 법
01. 디자인/docs/superpowers/final/process/video/ — shorts-v2-capture.mjs (main · nat · chat) → shorts-cards.mjs(자막 · 끝 컷 — 1판과 같음) → shorts-v2-edit.mjs (+ shorts-v2-render.py) · 이야기 판 = shorts-v2-story.mjs
`;
fs.writeFileSync(path.join(OUTS, 'storyboard-v2.md'), md, 'utf8');
console.log(JSON.stringify({ total: +total.toFixed(2), shots: shots.length, out, loadingHits: hits.length }));
