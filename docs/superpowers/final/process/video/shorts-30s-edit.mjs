/* 30초 소개 영상(가로 1920×1080 · 30fps · 자막만 · 10-21 사용자 "쇼츠 사이즈로 하라는게 아니라" → 긴 영상 4판과 같은 틀의 짧은 판)
   화면 = 2판 PC 녹화(raw2 · shorts-v2-capture.mjs) · 조각 = shorts-v2-story.mjs 그대로(로딩 구간을 피해 고른 것) · 틀 = 4판(story-v4 SCREEN · BAND · BG · frame.png) — 자르기 · 확대 없음.
   자막 = 4판과 같은 글꼴 · 띠 · 왼쪽 선(큰 줄 Paperlogy 38 · 작은 줄 Pretendard 27 · 오른쪽 장 이름) · 끝 = 4판 끝 컷 A(흰 바탕 LAND-XI PLATFORM + LX CI).
   node shorts-30s-edit.mjs → <OUTS>/land-xi-short-30s.mp4 · .srt · storyboard-30s.md · stills-30s/ · loading-check-30s.json */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { chromium, ROOT, sleep } from './lib.mjs';
import { OUTS } from './shorts-lib.mjs';
import { SHOTS, XF, IN, CH } from './shorts-v2-story.mjs';
import { SCREEN, BAND, BG } from './story-v4.mjs';

const V4 = 'E:/Land-XI 플랫폼/02. 데이터/_video/intro-2026-10-18-v4';
const RAW2 = path.join(OUTS, 'raw2'), TMP = path.join(OUTS, '_seg30'), CARDS = path.join(OUTS, 'cards30');
fs.mkdirSync(TMP, { recursive: true }); fs.mkdirSync(CARDS, { recursive: true });
const ff = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const ENC = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', '30'];
const N2 = (i) => String(i + 1).padStart(2, '0');
const LOG = JSON.parse(fs.readFileSync(path.join(RAW2, 'capture-log.json'), 'utf8'));

// 0) 로딩 검사 — 조각이 녹화 때 적은 로딩 · 감시 공백 구간과 겹치면 멈춘다
const hits = [];
for (const s of SHOTS) for (const pc of s.pieces) for (const [a, b, why] of LOG[pc.clip]?.loading || []) if (a <= pc.to + 0.05 && b >= pc.from - 0.05) hits.push({ shot: s.id, piece: [pc.from, pc.to], loading: [a, b, why] });
fs.writeFileSync(path.join(OUTS, 'loading-check-30s.json'), JSON.stringify({ hits, flyNotReady: LOG['d2-fly']?.notReadyAtShot || [], at: new Date().toISOString() }, null, 1));
if (hits.length) { console.log('로딩 구간과 겹침', JSON.stringify(hits)); process.exit(1); }

// 1) 자막 그림 — 4판 cards-v4 와 같은 틀
const F = (n) => pathToFileURL(path.join(ROOT, 'landxi/assets/fonts', n)).href;
const FONTS = `@font-face{font-family:P;src:url('${F('Pretendard-Regular.woff2')}');font-weight:400}@font-face{font-family:P;src:url('${F('Pretendard-Medium.woff2')}');font-weight:600}@font-face{font-family:PL;src:url('${F('Paperlogy-7Bold.woff2')}');font-weight:700}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
for (const [i, s] of SHOTS.entries()) {
  if (!s.cap) continue;
  const [t, sub] = s.cap;
  const html = `<!doctype html><meta charset=utf-8><style>${FONTS}
  html,body{margin:0;background:transparent;width:1920px;height:1080px;overflow:hidden}
  .band{position:absolute;left:${SCREEN.x}px;right:${1920 - SCREEN.x - SCREEN.w}px;top:${BAND.y}px;height:${BAND.h}px;display:flex;align-items:center;justify-content:space-between;gap:48px}
  .tx{min-width:0}.t{font:700 38px/1.22 PL;color:#191F28;margin:0;letter-spacing:-.6px;white-space:nowrap}
  .s{font:400 27px/1.38 P;color:#4E5968;margin:4px 0 0;letter-spacing:-.3px;white-space:nowrap}
  .ch{font:600 21px/1.2 P;color:#8B95A1;white-space:nowrap;letter-spacing:-.2px}.ch b{color:#3182F6;font-weight:600;margin-right:10px}
  </style><div class=band><div class=tx><p class=t>${esc(t)}</p>${sub ? `<p class=s>${esc(sub)}</p>` : ''}</div><div class=ch><b>${s.ch}</b>${esc(CH[s.ch] || '')}</div></div>`;
  const hf = path.join(CARDS, '_cap.html'); fs.writeFileSync(hf, html);
  await p.goto(pathToFileURL(hf).href); await p.evaluate(() => document.fonts.ready); await sleep(120);
  const m = await p.evaluate(() => { const r = (q) => document.querySelector(q)?.getBoundingClientRect(); const t = r('.t'), s = r('.s'), ch = r('.ch'); return { right: Math.max(t.right, s ? s.right : 0), chLeft: ch.left, bottom: (s || t).bottom, top: t.top }; });
  if (m.right > m.chLeft - 32 || m.top < BAND.y || m.bottom > BAND.y + BAND.h) throw new Error('자막 넘침 ' + s.id);
  await p.screenshot({ path: path.join(CARDS, `cap-${N2(i)}.png`), omitBackground: true });
}
await b.close();

// 2) 컷 — 조각 잇기 → 화면을 통째로 줄여 4판 틀 위에(자르기 · 확대 없음) + 자막
const BGHEX = '0x' + BG.slice(1);
const shots = [];
for (const [i, s] of SHOTS.entries()) {
  const parts = s.pieces.map((pc, k) => {
    const out = path.join(TMP, `p-${N2(i)}-${k}.mp4`);
    const src = s.full ? path.join(V4, 'raw', 'e1-end.mp4') : path.join(RAW2, pc.clip + '.mp4');
    ff(['-i', src, '-vf', `trim=start=${pc.from}:end=${pc.to},setpts=(PTS-STARTPTS)/${pc.speed || 1},fps=30,scale=1920:1080:flags=lanczos,format=yuv420p`, '-an', ...ENC, out]);
    return { file: out, dur: probe(out) };
  });
  let vis = parts[0].dur, chain = '', last = '[0:v]';
  for (let k = 1; k < parts.length; k++) { const off = vis - IN; chain += `${last}[${k}:v]xfade=transition=fade:duration=${IN}:offset=${off.toFixed(3)}[j${k}];`; last = `[j${k}]`; vis = off + parts[k].dur; }
  const D = vis, n = parts.length, ins = parts.flatMap((q) => ['-i', q.file]);
  let fc = chain + `${last}trim=duration=${D.toFixed(3)},setpts=PTS-STARTPTS[raw];`;
  if (s.full) fc += '[raw]null[o]';
  else {
    ins.push('-i', path.join(V4, 'cards', 'frame.png'), '-loop', '1', '-t', D.toFixed(3), '-i', path.join(CARDS, `cap-${N2(i)}.png`));
    fc += `color=c=${BGHEX}:s=1920x1080:r=30:d=${D.toFixed(3)}[bg];[raw]scale=${SCREEN.w}:${SCREEN.h}:flags=lanczos[sc];[bg][sc]overlay=${SCREEN.x}:${SCREEN.y}[b1];[b1][${n}:v]overlay=0:0[b2];`
      + `[${n + 1}:v]format=rgba,fade=in:st=0.25:d=0.3:alpha=1,fade=out:st=${(D - 0.65).toFixed(3)}:d=0.3:alpha=1[cp];[b2][cp]overlay=0:0:shortest=1[o]`;
  }
  const out = path.join(TMP, `shot-${N2(i)}.mp4`);
  ff([...ins, '-filter_complex', fc + ';[o]format=yuv420p[v]', '-map', '[v]', '-an', ...ENC, '-t', D.toFixed(3), out]);
  shots.push({ ...s, i, file: out, dur: probe(out) });
  console.log(N2(i), s.id, probe(out).toFixed(2));
}
// 3) 잇기
const starts = [0]; let t = shots[0].dur, fc = '', last = '[0:v]';
for (let i = 1; i < shots.length; i++) { const off = t - XF; fc += `${last}[${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`; last = `[x${i}]`; starts.push(off); t = off + shots[i].dur; }
const total = t, out = path.join(OUTS, 'land-xi-short-30s.mp4');
ff([...shots.flatMap((s) => ['-i', s.file]), '-filter_complex', fc + `${last}fade=in:st=0:d=0.4:color=white,scale=out_range=tv,format=yuv420p[v]`, '-map', '[v]', '-an',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-r', '30', '-movflags', '+faststart', '-t', total.toFixed(3), out]);
// 4) 자막 파일 · 그림 · 이야기 판
const ts = (x) => { const ms = Math.round(x * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
fs.writeFileSync(path.join(OUTS, 'land-xi-short-30s.srt'), shots.filter((s) => s.cap).map((s, k) => `${k + 1}\n${ts(starts[s.i] + 0.25)} --> ${ts(starts[s.i] + s.dur - 0.35)}\n${s.cap.join('\n')}\n`).join('\n'), 'utf8');
const ST = path.join(OUTS, 'stills-30s'); fs.mkdirSync(ST, { recursive: true }); for (const f of fs.readdirSync(ST)) fs.rmSync(path.join(ST, f));
shots.forEach((s) => ff(['-ss', (starts[s.i] + Math.min(s.dur - XF - 0.15, Math.max(0.8, s.dur - 0.9))).toFixed(2), '-i', out, '-frames:v', '1', path.join(ST, `still-${N2(s.i)}-${s.id}.png`)]));
fs.writeFileSync(path.join(OUTS, 'storyboard-30s.md'), `# Land-XI 30초 소개 영상 (2026-10-21)

- 사용자(10-21): "쇼츠 사이즈로 하라는게 아니라" → 세로가 아니라 긴 영상 4판과 같은 가로 틀의 30초 판 · "나레이션은 필요 없고. 자막만 있으면 된다." · "로딩중이 계속 뜨는데 이런게 뜨면 안된다."
- 결과: land-xi-short-30s.mp4 · 1920×1080 · 30fps · ${total.toFixed(1)}초 · 소리 없음 · 자막 land-xi-short-30s.srt
- 틀: 4판과 같음 — PC 화면을 자르지 않고 줄여 위(${SCREEN.w}×${SCREEN.h}), 자막은 아래 띠(945–1080) · 확대 없음 · 커서 없음 · 끝 = 흰 바탕 LAND-XI PLATFORM + LX 한국국토정보공사(4판 A)
- 로딩 표시 0: 녹화 때 0.1초마다 '불러오는 중' · '찾는 중' · 도는 표시 · 덜 그린 타일 · 감시 공백을 적어 두고 그 구간은 쓰지 않음(loading-check-30s.json 겹침 ${hits.length}) · 전국 → 함양군 날기는 걸음마다 다 그려진 뒤 한 장씩 · XI ChatGEO 는 물음 → 답 사이 기다림을 잘라 냄(내용은 실제 답)

| # | 장 | 시간(초) | 자막 |
|---|---|---|---|
${shots.map((s) => `| ${s.i + 1} | ${s.ch ? `${s.ch} ${CH[s.ch]}` : '마무리'} | ${starts[s.i].toFixed(1)}–${(starts[s.i] + s.dur).toFixed(1)} | ${s.cap ? s.cap.join(' / ') : '— (흰 바탕 CI)'} |`).join('\n')}

만드는 법: shorts-v2-capture.mjs(main · nat · chat) → shorts-30s-edit.mjs (조각 = shorts-v2-story.mjs · 틀 = story-v4.mjs)
`, 'utf8');
console.log(JSON.stringify({ total: +total.toFixed(2), out, loadingHits: hits.length }));
