// tools/scrub/legs.mjs — build/film/frames/*.png → landxi/assets/proto/film/legs/
//
//   node tools/scrub/legs.mjs               # 전체 (데스크톱 + 모바일 + 포스터 + 매니페스트)
//   node tools/scrub/legs.mjs --verify      # 인코딩 생략, 씸 diff 만 재측정
//
// 이 스크립트가 존재하는 이유(scroll-craft references/worldflight.md §6, scripts/encode.sh):
//   일반 웹 인코딩은 키프레임을 2–5초에 한 번 넣는다. 스크럽은 랜덤 액세스이므로
//   긴 GOP 는 seek 마다 디코더가 앞 키프레임부터 걸어오게 만들고, 재생헤드가 손보다 늦는다.
//   -g 8 (모바일 -g 4) + keyint_min + sc_threshold 0 이 이 파일의 전부다.
//
// 씸 법칙 A(worldflight.md §6):
//   leg N+1 의 첫 프레임 = leg N 의 **인코딩된** mp4 마지막 프레임.
//   우리는 AI 생성이 아니라 하나의 결정론적 필름을 자르는 것이므로,
//   경계 소스 프레임을 두 leg 가 공유하게 해서 이 법칙을 구조적으로 만족시킨다.
//   (여수 하드 컷 1곳만 예외 — 필름 자체가 컷이므로 씸 크로스페이드가 그 컷을 삼킨다.)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const root = process.cwd();
const FRAMES = path.resolve(root, 'build/film/frames');
const OUT = path.resolve(root, 'landxi/assets/proto/film/legs');
const TMP = path.resolve(root, 'build/film/legtmp');
const FPS = 25;
const MB = 1024 * 1024;
const VERIFY_ONLY = process.argv.includes('--verify');

// ── 1. 카메라 트랙 (tools/film/render.html 의 SEG 와 한 글자도 다르지 않다) ──
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const inv = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const smooth = x => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const easeLin = x => x;
const easeInOut = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOut = x => 1 - Math.pow(1 - x, 3);
const easeOut4 = x => 1 - Math.pow(1 - x, 4);

const SEG = [
  { id: 'orbit',   t0: 0.00,  t1: 3.20,  ease: easeLin, easeName: 'easeLin',
    a: { c: [109.0, 29.6],       z: 1.84,  p: 0,  b: 0 },   b: { c: [122.6, 33.6],       z: 2.62,  p: 0,  b: -2 } },
  { id: 'dive',    t0: 3.20,  t1: 5.10,  ease: easeInOut, easeName: 'easeInOut',
    a: { c: [122.6, 33.6],       z: 2.62,  p: 0,  b: -2 },  b: { c: [127.85, 36.20],     z: 6.55,  p: 10, b: -4 } },
  { id: 'korea',   t0: 5.10,  t1: 8.70,  ease: easeOut, easeName: 'easeOut',
    a: { c: [127.85, 36.20],     z: 6.55,  p: 10, b: -4 },  b: { c: [127.70, 35.90],     z: 8.30,  p: 24, b: -9 } },
  { id: 'descent', t0: 8.70,  t1: 11.90, ease: easeInOut, easeName: 'easeInOut',
    a: { c: [127.70, 35.90],     z: 8.30,  p: 24, b: -9 },  b: { c: [127.3260, 35.3470], z: 12.60, p: 62, b: -25 } },
  { id: 'ortho',   t0: 11.90, t1: 14.50, ease: easeInOut, easeName: 'easeInOut',
    a: { c: [127.3260, 35.3470], z: 12.60, p: 62, b: -25 }, b: { c: [127.3480, 35.3660], z: 13.05, p: 46, b: -13 } },
  { id: 'green',   t0: 14.50, t1: 17.55, ease: easeInOut, easeName: 'easeInOut',
    a: { c: [127.3480, 35.3660], z: 13.05, p: 46, b: -13 }, b: { c: [127.4250, 35.4290], z: 11.36, p: 23, b: -3 } },
  { id: 'yeosu',   t0: 17.55, t1: 23.00, ease: easeOut4, easeName: 'easeOut4',
    a: { c: [127.7305, 34.5630], z: 13.00, p: 10, b: 5 },   b: { c: [127.7215, 34.5690], z: 13.60, p: 2,  b: 0 } },
];
function camAt(t) {
  let s = SEG[0];
  for (const g of SEG) if (t >= g.t0) s = g;
  const k = s.ease(inv(t, s.t0, s.t1));
  return {
    center: [+lerp(s.a.c[0], s.b.c[0], k).toFixed(5), +lerp(s.a.c[1], s.b.c[1], k).toFixed(5)],
    zoom: +lerp(s.a.z, s.b.z, k).toFixed(3),
    pitch: +lerp(s.a.p, s.b.p, k).toFixed(2),
    bearing: +lerp(s.a.b, s.b.b, k).toFixed(2),
    seg: s.id,
  };
}
// 카메라 고도 — MapLibre 기본 fov(36.87°)에서 alt = 1.5 × 뷰포트높이(px) × m/px.
// 필름은 1280×720 로 구워졌으므로 720 이 기준자다. (장식이 아니라 유도된 실수치)
const FILM_H = 720;
function altitudeM(zoom, lat) {
  const mpp = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  return 1.5 * FILM_H * mpp;
}
function metersPerPixel(zoom, lat) {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
}

// ── 2. 레그 분할 ────────────────────────────────────────────────────────────
// 프레임 인덱스(포함, 25fps). 경계 프레임은 두 leg 가 공유한다 = 씸 법칙 A.
// 예외: 여수(하드 컷)는 공유하지 않는다 — 필름이 그 자리에서 컷하기 때문.
const LEGS = [
  { id: '01', a: 0,   b: 127, label: '궤도',      place: '지구 저궤도',        seamShared: true  },
  { id: '02', a: 127, b: 217, label: '성층운',    place: '한반도 상공',        seamShared: true  },
  { id: '03', a: 217, b: 297, label: '한반도',    place: '전라북도',            seamShared: true  },
  { id: '04', a: 297, b: 362, label: '남원',      place: '남원 분지',          seamShared: true  },
  { id: '05', a: 362, b: 438, label: '비닐하우스', place: '남원 농경지',        seamShared: false }, // 다음이 하드 컷
  { id: '06', a: 439, b: 574, label: '여수',      place: '여수 가막만',        seamShared: true  },
];
const RATE_TARGET = 0.218;   // vh / 필름초 — worldflight.md §7c 의 0.212–0.225 한가운데

const legs = LEGS.map(L => {
  const n = L.b - L.a + 1;
  const dur = n / FPS;
  return { ...L, n, dur, t0: L.a / FPS, t1: L.b / FPS, w: +(dur * RATE_TARGET).toFixed(3) };
});

// ── 3. 인코딩 ───────────────────────────────────────────────────────────────
const run = a => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = a => execFileSync(FFPROBE, a, { encoding: 'utf8' }).trim();
const size = f => fs.statSync(f).size;

function encodeLeg(L, mode) {
  const mobile = mode === 'mobile';
  const out = path.join(OUT, `leg_${L.id}${mobile ? '-m' : ''}.mp4`);
  const gop = mobile ? 4 : 8;
  const crf = mobile ? 24 : 20;
  const scale = mobile ? 'scale=960:540' : 'scale=1280:720';
  run([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(FPS), '-start_number', String(L.a),
    '-i', path.join(FRAMES, 'f_%04d.png'),
    '-frames:v', String(L.n),
    '-an',
    '-vf', `${scale}:flags=lanczos,format=yuv420p`,
    '-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', String(crf),
    '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0',
    // 씸 프레임을 IDR 로 강제한다. leg N 의 마지막 프레임과 leg N+1 의 첫 프레임은
    // 같은 소스 PNG 인데, 한쪽만 키프레임이면 압축 잡음 차이만으로 씸 diff 가 1% 를 넘는다.
    // 양쪽 다 같은 설정의 IDR 이면 인코더가 사실상 같은 픽셀을 낸다.
    '-force_key_frames', `expr:eq(n\,${L.n - 1})`,
    '-movflags', '+faststart',
    out,
  ]);
  return out;
}

// 포스터 — **인코딩된** mp4 의 첫 프레임에서 뽑는다. 인코딩이 픽셀을 바꾸므로
// 프리인코드 마스터에서 뽑은 포스터는 브라우저가 실제로 디코드할 프레임과 다르다.
function poster(mp4, id) {
  const out = path.join(OUT, `leg_${id}.webp`);
  run(['-y', '-hide_banner', '-loglevel', 'error', '-i', mp4, '-frames:v', '1',
    '-vf', 'scale=1280:720:flags=lanczos', '-quality', '82', out]);
  return out;
}

// 프레임 두 장의 평균 절대차(0..255).
function meanAbsDiff(A, B) {
  let out = '';
  try {
    out = execFileSync(FFMPEG, ['-hide_banner', '-i', A, '-i', B, '-lavfi',
      '[0:v][1:v]blend=all_mode=difference,format=gray,signalstats,metadata=print:file=-', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout || ''); }
  const m = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}
// 프레임 한 장의 평균 휘도 — 씸에 검은 프레임이 끼었는지 보는 유일하게 확실한 검사.
function luma(A) {
  let out = '';
  try {
    out = execFileSync(FFMPEG, ['-hide_banner', '-i', A, '-lavfi',
      'format=gray,signalstats,metadata=print:file=-', '-f', 'null', '-'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) { out = String(e.stdout || ''); }
  const m = out.match(/lavfi\.signalstats\.YAVG=([\d.]+)/);
  return m ? parseFloat(m[1]) : NaN;
}

// 씸 검증 — leg N 인코딩된 mp4 의 마지막 프레임 vs leg N+1 의 첫 프레임.
//
// 이 필름은 프레임마다 오프셋이 바뀌는 결정론적 그레인을 굽는다(render.html §5 grain).
// 그래서 **인접한 두 소스 프레임끼리도** 이미 0.8% 안팎 다르다. 절대 1% 기준은
// 이 소재의 자체 노이즈 바닥보다 낮아서 의미가 없다. 실제로 판정해야 하는 것은 둘이다.
//   (1) 씸 diff ≤ 같은 지점의 프레임간 diff × 1.6 → 씸이 "한 프레임 넘어간 것"보다 튀지 않는다
//   (2) 씸 양쪽 평균 휘도차 < 4/255              → 검은 프레임·플래시가 없다
function seamDiff(prevMp4, nextMp4, tag) {
  fs.mkdirSync(TMP, { recursive: true });
  const A = path.join(TMP, `${tag}_a.png`), B = path.join(TMP, `${tag}_b.png`),
        P = path.join(TMP, `${tag}_p.png`);
  // -sseof -0.15 는 25fps 에서 뒤에서 4번째 프레임을 준다(scroll-craft 는 그 정도로 충분한
  // AI 클립을 쓴다). 우리는 진짜 마지막 프레임이 필요하므로 꼬리를 전부 뽑아 마지막을 고른다.
  const tail = path.join(TMP, `${tag}_t`);
  fs.rmSync(tail, { recursive: true, force: true });
  fs.mkdirSync(tail, { recursive: true });
  run(['-y', '-hide_banner', '-loglevel', 'error', '-sseof', '-0.3', '-i', prevMp4,
    '-fps_mode', 'passthrough', path.join(tail, 'f_%03d.png')]);
  const tf = fs.readdirSync(tail).sort();
  fs.copyFileSync(path.join(tail, tf[tf.length - 1]), A);       // 나가는 leg 의 마지막 프레임
  fs.copyFileSync(path.join(tail, tf[tf.length - 2]), P);       // 그 직전 프레임 = 기준선
  run(['-y', '-hide_banner', '-loglevel', 'error', '-i', nextMp4, '-frames:v', '1', '-update', '1', B]);
  const seam = meanAbsDiff(A, B);
  const base = meanAbsDiff(P, A);
  const lA = luma(A), lB = luma(B);
  return {
    pct: +((seam / 255) * 100).toFixed(3),
    basePct: +((base / 255) * 100).toFixed(3),
    ratio: +(seam / base).toFixed(2),
    lumaA: +lA.toFixed(2), lumaB: +lB.toFixed(2), lumaDrop: +Math.abs(lA - lB).toFixed(2),
  };
}

fs.mkdirSync(OUT, { recursive: true });
if (!VERIFY_ONLY) {
  console.log(`레그 ${legs.length}개 · 목표 페이스 ${RATE_TARGET} vh/필름초`);
  for (const L of legs) {
    const d = encodeLeg(L, 'desktop');
    const m = encodeLeg(L, 'mobile');
    const p = poster(d, L.id);
    L.bytes = size(d); L.bytesMobile = size(m); L.bytesPoster = size(p);
    console.log(`  leg_${L.id} ${L.label.padEnd(6)} f${L.a}–${L.b} ${L.dur.toFixed(2)}s ` +
      `w=${L.w} rate=${(L.w / L.dur).toFixed(4)}  ` +
      `${(L.bytes / MB).toFixed(2)}MB / ${(L.bytesMobile / MB).toFixed(2)}MB / ${(L.bytesPoster / 1024).toFixed(0)}KB`);
  }
} else {
  for (const L of legs) {
    L.bytes = size(path.join(OUT, `leg_${L.id}.mp4`));
    L.bytesMobile = size(path.join(OUT, `leg_${L.id}-m.mp4`));
    L.bytesPoster = size(path.join(OUT, `leg_${L.id}.webp`));
  }
}

// ── 4. 씸 검증 ──────────────────────────────────────────────────────────────
console.log('\n씸 검증 (인코딩된 mp4 기준)   씸diff / 프레임간기준선 / 비율 / 휘도차');
const seams = [];
for (let i = 0; i < legs.length - 1; i++) {
  const A = path.join(OUT, `leg_${legs[i].id}.mp4`);
  const B = path.join(OUT, `leg_${legs[i + 1].id}.mp4`);
  const r = seamDiff(A, B, `s${i}`);
  const shared = legs[i].seamShared;
  // 하드컷 씸의 판정은 "휘도가 같은가"가 아니라 "검은 프레임이 없는가"다.
  const pass = shared ? (r.ratio <= 1.6 && r.lumaDrop < 4) : (r.lumaA > 12 && r.lumaB > 12);
  seams.push({ from: legs[i].id, to: legs[i + 1].id, frameShared: shared, pass, ...r });
  const verdict = shared ? (pass ? 'OK' : '실패!') : `의도적 하드컷 ${pass ? `OK(검은 프레임 없음 ${r.lumaA}→${r.lumaB})` : "실패!"}`;
  console.log(`  ${legs[i].id}→${legs[i + 1].id}  ${String(r.pct).padStart(6)}% / ${String(r.basePct).padStart(6)}% / ` +
    `×${String(r.ratio).padStart(5)} / ${String(r.lumaDrop).padStart(5)}   ${verdict}`);
}

// ── 5. 매니페스트 ───────────────────────────────────────────────────────────
const total = legs.reduce((s, L) => s + L.w, 0);
const manifest = {
  generatedAt: new Date().toISOString(),
  source: 'build/film/frames (tools/film/render.html, 결정론적 렌더 575프레임 @25fps)',
  fps: FPS,
  filmSize: [1280, 720],
  mobileSize: [960, 540],
  encode: {
    desktop: '-c:v libx264 -profile:v high -preset slow -crf 20 -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an',
    mobile: '-c:v libx264 -profile:v high -preset slow -crf 24 -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart -an',
  },
  pace: { targetRate: RATE_TARGET, unit: 'vh per film-second', band: [0.212, 0.225] },
  seam: 0.16,
  lerp: 0.12,
  // 필름의 카메라 트랙 원본. 페이지의 계기판이 이 표를 그대로 읽어 방위·고도·좌표를 낸다
  // (값을 지어내지 않는다 — 필름을 실제로 구운 그 카메라다).
  cameraTrack: SEG.map(s => ({ id: s.id, t0: s.t0, t1: s.t1, ease: s.easeName, a: s.a, b: s.b })),
  cameraNote: '고도 = 1.5 × 720px × (156543.03392 · cos φ / 2^z). MapLibre 기본 fov 36.87°, 필름 뷰포트 높이 720px 기준.',
  spacerVh: +(total + 1).toFixed(3),
  filmVh: +total.toFixed(3),
  seams,
  legs: legs.map(L => {
    const c0 = camAt(L.t0), c1 = camAt(L.t1);
    return {
      id: L.id, label: L.label, place: L.place,
      // look: 'real'   = 실데이터 렌더(정사영상·DEM·탐지 결과)로 구운 v1 필름
      //       'diorama' = 나중에 슬롯 교체될 AI 생성 미니어처 디오라마 레그
      // 슬롯 교체 규칙: seconds 만 같으면 weightVh 는 seconds × 0.218 로 자동 재계산되고
      // 페이지 코드는 한 줄도 바뀌지 않는다. endCamera 는 핸드오프·계기판이 읽는 계약이다.
      look: L.look || 'real',
      frames: [L.a, L.b], count: L.n, seconds: +L.dur.toFixed(3),
      weightVh: L.w, rate: +(L.w / L.dur).toFixed(4),
      src: `/landxi/assets/proto/film/legs/leg_${L.id}.mp4`,
      srcMobile: `/landxi/assets/proto/film/legs/leg_${L.id}-m.mp4`,
      poster: `/landxi/assets/proto/film/legs/leg_${L.id}.webp`,
      bytes: L.bytes, bytesMobile: L.bytesMobile, bytesPoster: L.bytesPoster,
      startCamera: { ...c0, altitudeM: Math.round(altitudeM(c0.zoom, c0.center[1])), mpp: +metersPerPixel(c0.zoom, c0.center[1]).toFixed(3) },
      endCamera: { ...c1, altitudeM: Math.round(altitudeM(c1.zoom, c1.center[1])), mpp: +metersPerPixel(c1.zoom, c1.center[1]).toFixed(3) },
    };
  }),
};
// 핸드오프 — 필름 마지막 프레임의 카메라. 살아 있는 MapLibre 가 여기서 정확히 이어받는다.
const last = camAt(574 / FPS);
manifest.handoff = {
  ...last,
  altitudeM: Math.round(altitudeM(last.zoom, last.center[1])),
  mpp: +metersPerPixel(last.zoom, last.center[1]).toFixed(3),
  note: '필름 최종 프레임(f_0574, t=22.96s)의 카메라. 스크럽 종료 지점에서 실지도가 같은 카메라로 이어받는다.',
};

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

const dTot = legs.reduce((s, L) => s + L.bytes, 0);
const mTot = legs.reduce((s, L) => s + L.bytesMobile, 0);
const pTot = legs.reduce((s, L) => s + L.bytesPoster, 0);
const rates = legs.map(L => L.w / L.dur);
console.log(`\n페이스 스프레드 ${(((Math.max(...rates) - Math.min(...rates)) / Math.min(...rates)) * 100).toFixed(2)}%  (목표 ≤ 6%)`);
console.log(`필름 ${total.toFixed(3)}vh · 스페이서 ${(total + 1).toFixed(3)}vh`);
console.log(`데스크톱 ${(dTot / MB).toFixed(2)}MB (예산 60) · 모바일 ${(mTot / MB).toFixed(2)}MB (예산 20) · 포스터 ${(pTot / 1024).toFixed(0)}KB`);
console.log(`manifest → ${path.relative(root, path.join(OUT, 'manifest.json'))}`);
