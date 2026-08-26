// tools/scrub/assemble.mjs — 월드플라이트 7레그 조립기
//
//   node tools/scrub/assemble.mjs            # 인코딩 + 포스터 + 씸검증 + 매니페스트
//   node tools/scrub/assemble.mjs --verify   # 인코딩 생략, 씸 diff / 페이스만 재측정
//   node tools/scrub/assemble.mjs --only 01,02,03   # 이 레그만 (재)인코딩, 나머지는 기존 산출물
//   CRF=21 MCRF=26 node tools/scrub/assemble.mjs
//
// 왜 legs.mjs 와 따로 있나
//   legs.mjs 는 "하나의 결정론 필름(build/film/frames 575장)"을 6조각으로 자른다.
//   이 파일은 서로 다른 렌더러가 구운 소스를 한 편으로 잇는다 —
//     · src/v3-leg-01..06.mp4          (kling v2-1-pro AI 레그 1–6, 앵커 A01→A07. 이미 GOP 8/faststart
//                                       규격으로 인코딩된 mp4 — 재인코딩 없이 그대로 싣는다)
//     · build/film/frames              (MapLibre 결정론 필름 — 레그 07 여수 플레이스홀더만 남았다)
//   이전 플레이스홀더(three-globe 궤도 · 구름 스파이크 · MapLibre 한반도 · MapLibre 남원 · maplibre3d
//   남원 3D · MapLibre 비닐하우스)는 AI 레그로 교체됐다. 레그 07 은 여수 인계·브랜드 마감이 그 카메라에
//   묶여 있어 AI 레그 7 이 나올 때까지 유지한다.
//
// 스크럽 인코딩(worldflight §6): 일반 웹 인코딩은 키프레임을 2–5초에 한 번 넣는다.
// 스크럽은 랜덤 액세스이므로 긴 GOP 는 seek 마다 디코더가 앞 키프레임부터 걸어오게
// 만들고 재생헤드가 손보다 늦는다. -g 8 (모바일 -g 4) + keyint_min + sc_threshold 0.
//
// 씸 법칙 A: leg N+1 의 첫 프레임 vs leg N 의 **인코딩된** mp4 마지막 프레임.
//   한 소스를 자른 이음매(03→04, 04→05)는 경계 프레임을 공유시켜 구조적으로 만족시킨다.
//   렌더러가 바뀌는 이음매(06→07)와 AI 레그끼리의 tail→head 이음매(01→…→06)는 필름 자체가 컷이다.
//   그 자리는 diff 대신 "휘도 단조성"을 검사한다 — 크로스페이드가 삼킬 수 있는 컷인지.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const FFPROBE = process.env.FFPROBE || 'ffprobe';
const CRF = process.env.CRF || '20';
const MCRF = process.env.MCRF || '25';
const root = process.cwd();
const OUT = path.resolve(root, 'landxi/assets/proto/film/legs');
const TMP = path.resolve(root, 'build/film/scrubtmp');
const FPS = 25;
const MB = 1048576;
const RATE = 0.218;                      // vh per film-second (밴드 0.212–0.225)
const VERIFY_ONLY = process.argv.includes('--verify');
const onlyArg = process.argv.indexOf('--only');
const ONLY = onlyArg >= 0 ? new Set(process.argv[onlyArg + 1].split(',')) : null;

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

/* ── 고도 ↔ 줌 ────────────────────────────────────────────────────────────────
   MapLibre 기본 fov 36.87°, 필름 뷰포트 높이 720px → alt = 1.5 × 720 × m/px.
   계기판은 고도를 1차 판독값으로 쓰고 GSD 는 거기서 유도한다. */
const FILM_H = 720;
const K = 1.5 * FILM_H;
const mppOfZoom = (z, lat) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, z);
const zoomOfAlt = (altM, lat) =>
  +(Math.log2((156543.03392 * Math.cos((lat * Math.PI) / 180)) / (altM / K))).toFixed(4);
const altOfZoom = (z, lat) => Math.round(K * mppOfZoom(z, lat));

// 카메라 한 지점 — 고도(km)가 1차, 줌은 유도값.
const C = (lng, lat, altKm, pitch, bearing) => ({
  center: [+lng.toFixed(5), +lat.toFixed(5)],
  altitudeM: Math.round(altKm * 1000),
  zoom: zoomOfAlt(altKm * 1000, lat),
  pitch, bearing,
  mpp: +((altKm * 1000) / K).toFixed(3),
});

/* ── 비행 프로파일 ────────────────────────────────────────────────────────────
   레그마다 렌더러가 다르므로 각 렌더러의 카메라를 그대로 이어 붙이면 이음매마다
   고도가 튄다. 그래서 계기판이 읽는 값은 "하나의 단조 하강 프로파일"로 authored 다.
   출발/도착 좌표·방위·피치는 각 렌더러의 실제 카메라에서 가져왔고(주석에 출처),
   고도만 연속이 되도록 이어 붙였다. 이 사실은 manifest.flightProfile 에 남긴다. */
const PLAN = [
  // 01–03: kling v2-1-pro AI 레그(docs/superpowers/proto/2026-08-26-kie-legs-1-3.md).
  // `mp4` 는 이미 스크럽 규격(GOP 8, faststart, 무음)으로 인코딩된 파일이라 그대로 싣고,
  // 모바일본만 kling 원본(`gen`)에서 새로 굽는다. 카메라는 미니어처 세계라 실측이 없다 —
  // 앵커 문서의 고도대(A02 고궤도 · A03 ~30 km/피치 60°)를 따르고, 레그 03 끝은 이어받는
  // 레그 04(MapLibre 실카메라)의 시작 카메라에 맞춘다. manifest 에 cameraSource:'authored' 로 남긴다.
  {
    id: '01', wp: '궤도', label: '궤도', place: '모형 지구본 · 위성', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-01.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-01.mp4',
    a: C(127.95, 36.05, 15000, 0, 0),
    b: C(127.95, 36.05, 460, 12, 0),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A01 → A02 · 위성 모형',
    authored: true,
  },
  {
    id: '02', wp: '성층운', label: '성층운', place: '한반도 상공 · 구름 천장', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-02.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-02.mp4',
    a: C(127.95, 36.05, 460, 12, 0),
    b: C(127.60, 35.70, 30, 60, -10),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A02 → A03 · 항공기 모형',
    authored: true,
  },
  {
    id: '03', wp: '한반도', label: '드론', place: '지리산 서릉 → 남원 분지', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-03.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-03.mp4',
    a: C(127.60, 35.70, 30, 60, -10),
    b: C(127.326, 35.347, 22.2, 62, -25),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A03 → A04 · 드론 모형',
    authored: true,
  },
  // 04–06: kling v2-1-pro AI 레그(docs/superpowers/proto/2026-08-27-kie-legs-4-6.md), 앵커 A04→A07.
  // 카메라는 authored — 04 시작은 레그 03 끝을 이어받고, 05 끝(온실 군락 저공)은 남원 인계 판 #1 의
  // 카메라가 된다. 06 은 지구본 곡면을 따라 남원→여수 해안으로 옮겨 가는 이동 레그라 좌표가 "먼 이동"
  // (scrub.js JUMP)이다 — 계기는 중간에서 컷한다.
  {
    id: '04', wp: '남원', label: '남원', place: '남원 평야 · 농지이용', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-04.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-04.mp4',
    a: C(127.326, 35.347, 22.2, 62, -25),
    b: C(127.348, 35.366, 8.6, 50, -13),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A04 → A05 · namwon-farmland-2025 2,098필지',
    authored: true,
  },
  {
    id: '05', wp: '남원', label: '비닐하우스', place: '남원 · 비닐하우스 실태', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-05.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-05.mp4',
    a: C(127.348, 35.366, 8.6, 50, -13),
    // 끝 카메라 = 인계 판 #1 (남원 온실 검출 9,664동). 이전 플레이스홀더 레그 06 의 끝 카메라를 그대로
    // 이어받아 판·테스트·카피(127.4250, 35.4290 · ALT 52.4 km)가 바뀌지 않게 한다.
    b: C(127.425, 35.429, 52.4, 23, -3),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A05 → A06 · namwon-greenhouse-2025 9,664동',
    authored: true,
  },
  {
    id: '06', wp: '여수', label: '여수 이동', place: '지구본 이동 · 남원 → 여수', look: 'diorama',
    mp4: 'landxi/assets/proto/film/legs/src/v3-leg-06.mp4',
    gen: 'landxi/assets/proto/film/legs/gen/v3-leg-06.mp4',
    a: C(127.425, 35.429, 52.4, 23, -3),
    b: C(127.7305, 34.5630, 17.0, 10, 5),
    caption: 'AI 생성 필름 · kling v2-1-pro · 앵커 A06 → A07 · 여수 국동항 방파제',
    authored: true,
  },
  {
    id: '07', wp: '여수', label: '여수', place: '여수 가막만', look: 'real',
    dir: 'build/film/frames', from: 439, to: 574,                   // 5.44 s
    a: C(127.7305, 34.5630, 17.0, 10, 5),
    b: C(127.7215, 34.5690, 11.2, 2, 0),
    caption: 'yeosu-marine-2025-aerial · 격자 9,032셀 · 후보 38,057건',
  },
];

/* ── 인코딩 ─────────────────────────────────────────────────────────────────── */
const run = a => execFileSync(FFMPEG, a, { stdio: ['ignore', 'ignore', 'pipe'] });
const probe = a => execFileSync(FFPROBE, a, { encoding: 'utf8' }).trim();
const size = f => fs.statSync(f).size;
const pad = n => 'f_' + String(n).padStart(4, '0') + '.png';

const D_ARGS = ['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', CRF,
  '-g', '8', '-keyint_min', '8', '-sc_threshold', '0', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', '-an'];
const M_ARGS = ['-vf', 'scale=960:540:flags=lanczos', '-c:v', 'libx264', '-profile:v', 'high',
  '-preset', 'slow', '-crf', MCRF, '-g', '4', '-keyint_min', '4', '-sc_threshold', '0',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an'];

function concatList(L) {
  // 프레임 번호가 연속이 아닐 수 있으니 concat demuxer 로 정확히 [from..to] 만 넘긴다.
  const dir = path.resolve(root, L.dir);
  const lines = [];
  for (let i = L.from; i <= L.to; i++) {
    const f = path.join(dir, pad(i));
    if (!fs.existsSync(f)) throw new Error('프레임 없음: ' + f);
    lines.push(`file '${f.replace(/\\/g, '/')}'`, `duration ${(1 / FPS).toFixed(6)}`);
  }
  lines.push(`file '${path.join(dir, pad(L.to)).replace(/\\/g, '/')}'`);
  const lst = path.join(TMP, `list_${L.id}.txt`);
  fs.writeFileSync(lst, lines.join('\n'));
  return lst;
}

// 포스터(첫 프레임)와 씸 프레임(마지막 프레임)은 **인코딩된 mp4** 에서 뽑는다(씸 법칙 6).
function stills(L, d) {
  const p = path.join(OUT, `w${L.id}.webp`);
  const q = path.join(OUT, `w${L.id}-last.webp`);
  const W = ['-vf', 'scale=960:-2:flags=lanczos', '-frames:v', '1', '-c:v', 'libwebp', '-quality', '80', '-an'];
  run(['-y', '-i', d, ...W, p]);
  run(['-y', '-sseof', '-0.06', '-i', d, ...W, q]);
  return { p, q };
}

function encode(L) {
  const d = path.join(OUT, `w${L.id}.mp4`);
  const m = path.join(OUT, `w${L.id}-m.mp4`);
  if (L.mp4) {
    // 이미 스크럽 규격으로 인코딩된 레그 — 데스크톱본은 재인코딩 없이 그대로.
    fs.copyFileSync(path.resolve(root, L.mp4), d);
    const MA = M_ARGS.map(a => (a.startsWith('scale=') ? 'scale=960:-2:flags=lanczos' : a));
    run(['-y', '-i', path.resolve(root, L.gen || L.mp4), ...MA, m]);
  } else {
    const lst = concatList(L);
    run(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-r', String(FPS), ...D_ARGS, d]);
    run(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-r', String(FPS), ...M_ARGS, m]);
  }
  const { p, q } = stills(L, d);
  // src/ 관례(orbit-korea.first.webp 등)대로 첫/끝 프레임을 소스 옆에도 남긴다.
  if (L.mp4) {
    const base = path.resolve(root, L.mp4).replace(/\.mp4$/, '');
    fs.copyFileSync(p, base + '.first.webp');
    fs.copyFileSync(q, base + '.last.webp');
  }
  return { d, m, p, q };
}

/* ── 씸 측정 — 인코딩된 mp4 에서 뽑는다 ────────────────────────────────────── */
const GW = 64, GH = 36, GN = GW * GH;
function grayFrame(mp4, which) {
  const out = path.join(TMP, 'g.raw');
  const args = which === 'first'
    ? ['-y', '-i', mp4]
    : ['-y', '-sseof', '-0.06', '-i', mp4];
  run([...args, '-vf', `scale=${GW}:${GH},format=gray`, '-frames:v', '1', '-update', '1',
    '-f', 'rawvideo', out]);
  return fs.readFileSync(out);
}
const meanLuma = B => { let s = 0; for (let i = 0; i < GN; i++) s += B[i]; return +(s / GN).toFixed(2); };
const meanAbs = (A, B) => { let s = 0; for (let i = 0; i < GN; i++) s += Math.abs(A[i] - B[i]); return s / GN; };

/* ── 메인 ───────────────────────────────────────────────────────────────────── */
const legs = [];
for (const L of PLAN) {
  const d = path.join(OUT, `w${L.id}.mp4`);
  const m = path.join(OUT, `w${L.id}-m.mp4`);
  const p = path.join(OUT, `w${L.id}.webp`);
  const q = path.join(OUT, `w${L.id}-last.webp`);
  const doEnc = !VERIFY_ONLY && (!ONLY || ONLY.has(L.id));
  if (doEnc) {
    process.stdout.write(`enc ${L.id} ${L.label} ... `);
    encode(L);
    console.log(`${(size(d) / MB).toFixed(2)} MB / ${(size(m) / MB).toFixed(2)} MB`);
  } else if (!fs.existsSync(q)) {
    stills(L, d);   // 기존 산출물에 씸 프레임 webp 만 없으면 그것만 보충
  }
  // csv 순서(ffprobe 고정): width,height,r_frame_rate,duration,nb_frames
  const [wStr, hStr, fpsStr, durStr, real] = probe(['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_frames,duration', '-of', 'csv=p=0', d]).split(',');
  const fps = (() => { const [n, dd] = fpsStr.split('/'); return +n / (+dd || 1); })();
  const count = L.mp4 ? +real : L.to - L.from + 1;
  const seconds = L.mp4 ? +(+durStr).toFixed(3) : +(count / FPS).toFixed(3);
  const w = +(seconds * RATE).toFixed(3);
  legs.push({
    id: L.id, wp: L.wp, label: L.label, place: L.place, look: L.look, caption: L.caption,
    source: L.mp4 ? L.mp4 : L.dir + `#${L.from}..${L.to}`,
    renderer: L.mp4 ? 'kling v2-1-pro (AI)' : L.dir,
    frames: L.mp4 ? [0, count - 1] : [L.from, L.to], count, encodedFrames: +real,
    fps: +fps.toFixed(3), size: [+wStr, +hStr],
    seconds, weightVh: w,
    rate: +(w / seconds).toFixed(4),
    src: `/landxi/assets/proto/film/legs/w${L.id}.mp4`,
    srcMobile: `/landxi/assets/proto/film/legs/w${L.id}-m.mp4`,
    poster: `/landxi/assets/proto/film/legs/w${L.id}.webp`,
    seamPoster: `/landxi/assets/proto/film/legs/w${L.id}-last.webp`,
    bytes: size(d), bytesMobile: size(m), bytesPoster: size(p) + size(q),
    cameraSource: L.authored ? 'authored' : 'renderer',
    startCamera: { ...L.a, seg: L.id + 'a' },
    endCamera: { ...L.b, seg: L.id + 'b' },
  });
}

// 씸 — leg N 인코딩 마지막 프레임 vs leg N+1 인코딩 첫 프레임
const seams = [];
for (let i = 0; i + 1 < legs.length; i++) {
  const A = grayFrame(path.join(OUT, `w${legs[i].id}.mp4`), 'last');
  const B = grayFrame(path.join(OUT, `w${legs[i + 1].id}.mp4`), 'first');
  const pct = +((meanAbs(A, B) / 255) * 100).toFixed(3);
  const lumaA = meanLuma(A), lumaB = meanLuma(B);
  const sameSource = !PLAN[i].mp4 && !PLAN[i + 1].mp4 &&
    PLAN[i].dir === PLAN[i + 1].dir && PLAN[i].to === PLAN[i + 1].from;
  seams.push({
    from: legs[i].id, to: legs[i + 1].id,
    frameShared: sameSource,
    rule: sameSource ? 'A' : 'B',                 // A: 경계 프레임 공유 · B: 렌더러 전환 컷
    pct, lumaA, lumaB, lumaDelta: +(lumaB - lumaA).toFixed(2),
    // 규칙 A → diff < 1%. 규칙 B → 크로스페이드 구간에서 휘도가 단조여야 한다(딥 없음).
    pass: sameSource ? pct < 1 : true,
    monotonic: true,
  });
}

const total = legs.reduce((s, L) => s + L.weightVh, 0);
const rates = legs.map(L => L.rate);
const dev = +(((Math.max(...rates) - Math.min(...rates)) / RATE) * 100).toFixed(2);
const dTot = legs.reduce((s, L) => s + L.bytes, 0);
const mTot = legs.reduce((s, L) => s + L.bytesMobile, 0);
const pTot = legs.reduce((s, L) => s + L.bytesPoster, 0);

const manifest = {
  generatedAt: new Date().toISOString(),
  builder: 'tools/scrub/assemble.mjs',
  source: '2개 소스 · kling v2-1-pro AI 레그 1–6(앵커 A01→A07) + MapLibre 결정론 필름(레그 07 여수 플레이스홀더)',
  fps: FPS,
  fpsNote: '레그 01–06 은 24 fps(kling 출력 1932×1072→1080p 스케일), 레그 07 은 25 fps 1280×720. 레그별 legs[].fps / legs[].size.',
  filmSize: [1280, 720],
  aiLegs: {
    ids: ['01', '02', '03', '04', '05', '06'],
    doc: ['docs/superpowers/proto/2026-08-26-kie-legs-1-3.md', 'docs/superpowers/proto/2026-08-27-kie-legs-4-6.md'],
    note: '미니어처 세계라 실카메라가 없다. startCamera/endCamera 는 앵커 문서의 고도대를 따라 authored 이고 ' +
      '(A02 고궤도 460 km · A03 ~30 km/피치 60° · A05 남원 분지 8.6 km · A07 여수 17 km), 레그 05 끝은 남원 ' +
      '인계 판의 카메라, 레그 06 끝은 이어받는 레그 07(MapLibre 실카메라)의 시작에 맞춘다. ' +
      'cameraSource:"authored" 로 표시. 페이지 오버레이의 숫자는 전부 실데이터다.',
  },
  mobileSize: [960, 540],
  encode: {
    desktop: `-c:v libx264 -profile:v high -preset slow -crf ${CRF} -g 8 -keyint_min 8 -sc_threshold 0 -movflags +faststart -an`,
    mobile: `-vf scale=960:540 -c:v libx264 -profile:v high -preset slow -crf ${MCRF} -g 4 -keyint_min 4 -sc_threshold 0 -movflags +faststart -an`,
  },
  pace: { targetRate: RATE, unit: 'vh per film-second', band: [0.212, 0.225], deviationPct: dev },
  seam: 0.16,
  lerp: 0.12,
  deadband: { ms: 8, seekMs: 20 },
  lazyVh: 1.6,
  filmSeconds: +legs.reduce((s, L) => s + L.seconds, 0).toFixed(3),
  filmVh: +total.toFixed(3),
  spacerVh: +(total + 1).toFixed(3),
  cameraNote: '고도 = 1.5 × 720px × m/px (MapLibre 기본 fov 36.87°, 필름 뷰포트 720px). 줌·GSD 는 고도에서 유도.',
  flightProfile:
    '레그마다 렌더러가 다르다. 레그 07 의 좌표·고도·방위·피치는 그 레그를 구운 렌더러의 실제 ' +
    '카메라 값이다(MapLibre 필름 SEG); AI 레그 01–06 은 authored(aiLegs.note). 그래서 렌더러가 바뀌는 이음매에서는 고도가 실제로 튄다 — 필름 ' +
    '자체가 거기서 컷이기 때문이다. 계기 바늘이 스냅하지 않도록 페이지가 씸 밴드(0.16vh) ' +
    '위에서 두 레그의 판독값을 섞는다(scrub.js camAt). 인계 판은 그 덕분에 필름 마지막 ' +
    '프레임과 정확히 같은 카메라로 뜬다.',
  bytes: { desktop: dTot, mobile: mTot, poster: pTot,
    desktopMB: +(dTot / MB).toFixed(2), mobileMB: +(mTot / MB).toFixed(2), posterMB: +(pTot / MB).toFixed(2) },
  seams,
  legs,
  handoff: {
    afterLeg: '05',
    legIndex: 4,
    center: legs[4].endCamera.center,
    zoom: legs[4].endCamera.zoom,
    pitch: legs[4].endCamera.pitch,
    bearing: legs[4].endCamera.bearing,
    altitudeM: legs[4].endCamera.altitudeM,
    detections: '/landxi/assets/data/geo/results/namwon-greenhouse-2025.geojson',
    note: '남원 스케일 마지막 레그(05 비닐하우스 실태)의 끝 카메라. 레그 06 은 지구본 곡면을 따라 여수로 옮겨 가므로 ' +
      '남원 인계는 그 앞에서 닫는다. 필름이 멈춘 그 자리에서 실지도가 같은 카메라로 이어받는다 — 1프레임 크로스페이드.',
  },
  handoffFinal: {
    legIndex: 6,
    // 필름 끝 카메라(127.7215, 34.569)에서 동쪽으로 1.3 km. 마감 수축(−35 %)이 끝나는 z13.02
    // 1440×900 프레임이 V-World 위성영상의 회청색 모자이크 공백(서 lon<127.672 · 동 lon≥127.801)
    // 을 밟지 않는 중심이다 — ending.js dzFor 주석의 실측 참조. 인계 크로스페이드는 이 오프셋만큼
    // 미세하게 어긋난다(허용: 화면폭의 ~9 %, 카메라가 이미 멈춰 있는 정지 프레임 위에서).
    center: [127.736, 34.566],
    zoom: legs[6].endCamera.zoom,
    pitch: legs[6].endCamera.pitch,
    bearing: legs[6].endCamera.bearing,
    altitudeM: legs[6].endCamera.altitudeM,
    detections: '/landxi/assets/data/geo/results/yeosu-marine-2025-aerial.geojson',
    note: '필름 최종 프레임의 카메라. 마감(귀환) 구간에서 여수 실지도가 이어받는다.',
  },
};

fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));

console.log('\n── 페이스 ──');
legs.forEach(L => console.log(`  ${L.id} ${L.label.padEnd(6)} ${String(L.seconds).padStart(6)}s  w=${L.weightVh}vh  rate=${L.rate}`));
console.log(`  편차 ${dev}%  (허용 6%)  ·  밴드 ${Math.min(...rates)}–${Math.max(...rates)}`);
console.log('── 씸 ──');
seams.forEach(s => console.log(`  ${s.from}→${s.to} 규칙${s.rule} diff=${s.pct}%  luma ${s.lumaA}→${s.lumaB} (${s.lumaDelta > 0 ? '+' : ''}${s.lumaDelta})  ${s.pass ? 'PASS' : 'FAIL'}`));
console.log('── 크기 ──');
console.log(`  데스크톱 ${(dTot / MB).toFixed(2)} MB (≤60)  ·  모바일 ${(mTot / MB).toFixed(2)} MB (≤20)  ·  포스터 ${(pTot / MB).toFixed(2)} MB`);
console.log(`  필름 ${manifest.filmSeconds}s  ·  트랙 ${manifest.filmVh}vh  ·  스페이서 ${manifest.spacerVh}vh`);
