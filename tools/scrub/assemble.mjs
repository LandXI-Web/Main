// tools/scrub/assemble.mjs — 월드플라이트 7레그 조립기
//
//   node tools/scrub/assemble.mjs            # 인코딩 + 포스터 + 씸검증 + 매니페스트
//   node tools/scrub/assemble.mjs --verify   # 인코딩 생략, 씸 diff / 페이스만 재측정
//   CRF=21 MCRF=26 node tools/scrub/assemble.mjs
//
// 왜 legs.mjs 와 따로 있나
//   legs.mjs 는 "하나의 결정론 필름(build/film/frames 575장)"을 6조각으로 자른다.
//   이 파일은 서로 다른 렌더러가 구운 소스를 한 편으로 잇는다 —
//     · build/film/legs/orbit-korea    (three-globe 스파이크, 궤도→한반도)
//     · build/film/legs/cloud-break-v2 (구름 스파이크, 대기권 진입·권운 돌파)
//     · build/film/frames              (MapLibre 결정론 필름, 한반도→남원→여수)
//     · build/film/legs/namwon-3d      (maplibre3d 스파이크, 실측 3D 남원)
//
// 스크럽 인코딩(worldflight §6): 일반 웹 인코딩은 키프레임을 2–5초에 한 번 넣는다.
// 스크럽은 랜덤 액세스이므로 긴 GOP 는 seek 마다 디코더가 앞 키프레임부터 걸어오게
// 만들고 재생헤드가 손보다 늦는다. -g 8 (모바일 -g 4) + keyint_min + sc_threshold 0.
//
// 씸 법칙 A: leg N+1 의 첫 프레임 vs leg N 의 **인코딩된** mp4 마지막 프레임.
//   한 소스를 자른 이음매(03→04, 04→05)는 경계 프레임을 공유시켜 구조적으로 만족시킨다.
//   렌더러가 바뀌는 이음매(01→02, 02→03, 05→06, 06→07)는 필름 자체가 컷이다.
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
  {
    id: '01', wp: '궤도', label: '궤도', place: '지구 저궤도', look: 'globe',
    dir: 'build/film/legs/orbit-korea', from: 0, to: 139,           // 5.60 s
    // three-globe LEGS['orbit-korea'].keys — [altKm, lat, lon, tilt]
    a: C(60.0, 13.0, 15000, 0, 0),
    b: C(127.95, 36.05, 460, 18, -6),
    caption: '궤도 합성 · three-globe · NASA BMNG 8k + 구름 8k',
  },
  {
    id: '02', wp: '성층운', label: '성층운', place: '한반도 상공 · 권운층', look: 'globe',
    dir: 'build/film/legs/cloud-break-v2', from: 40, to: 114,       // 3.00 s (t 1.60–4.56)
    // 구름 스파이크 cloud-break keys 중 권운 돌파 구간
    a: C(127.96, 35.80, 460, 27, -8),
    b: C(127.88, 35.52, 132, 35, -10),
    caption: '대기 산란 · 권운 3층 빌보드 · 고도 11 / 8 / 5 km',
  },
  {
    id: '03', wp: '한반도', label: '한반도', place: '전라북도', look: 'real',
    dir: 'build/film/frames', from: 217, to: 297,                   // 3.24 s
    a: C(127.70, 35.90, 434.5, 24, -9),
    b: C(127.326, 35.347, 22.2, 62, -25),
    caption: 'Mapterhorn terrarium DEM · 지형 과장 1.4× · EPSG:4326',
  },
  {
    id: '04', wp: '남원', label: '남원', place: '남원 분지', look: 'real',
    dir: 'build/film/frames', from: 297, to: 362,                   // 2.64 s
    a: C(127.326, 35.347, 22.2, 62, -25),
    b: C(127.348, 35.366, 16.3, 46, -13),
    caption: '항공 정사영상 2025-10 · GSD 25 cm · 남원시 전역',
  },
  {
    id: '05', wp: '남원', label: '남원 3D', place: '금지면 → 남원 시내', look: 'diorama',
    dir: 'build/film/legs/namwon-3d', from: 0, to: 140,             // 5.64 s
    // maplibre3d spike.js LEG[] — 실측 건물 풋프린트 위 3D
    a: C(127.3096, 35.3318, 3.3, 58, -34),
    b: C(127.3888, 35.4084, 0.88, 68, 26),
    caption: '건물 풋프린트 실측 + AI 온실 검출 · 남원 금지면 · GSD 1.54 cm',
  },
  {
    id: '06', wp: '남원', label: '비닐하우스', place: '남원 농경지', look: 'real',
    dir: 'build/film/frames', from: 362, to: 438,                   // 3.08 s
    a: C(127.348, 35.366, 16.3, 46, -13),
    b: C(127.425, 35.429, 52.4, 23, -3),
    caption: 'namwon-greenhouse-2025 · 9,664동 · 항공 정사영상 2025-10 · GSD 25 cm',
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

function encode(L) {
  const lst = concatList(L);
  const d = path.join(OUT, `w${L.id}.mp4`);
  const m = path.join(OUT, `w${L.id}-m.mp4`);
  run(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-r', String(FPS), ...D_ARGS, d]);
  run(['-y', '-f', 'concat', '-safe', '0', '-i', lst, '-r', String(FPS), ...M_ARGS, m]);
  const p = path.join(OUT, `w${L.id}.webp`);
  run(['-y', '-i', path.join(path.resolve(root, L.dir), pad(L.from)),
    '-vf', 'scale=960:-1:flags=lanczos', '-c:v', 'libwebp', '-quality', '80', '-an', p]);
  return { d, m, p };
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
  const count = L.to - L.from + 1;
  const seconds = +(count / FPS).toFixed(3);
  const w = +(seconds * RATE).toFixed(3);
  const d = path.join(OUT, `w${L.id}.mp4`);
  const m = path.join(OUT, `w${L.id}-m.mp4`);
  const p = path.join(OUT, `w${L.id}.webp`);
  if (!VERIFY_ONLY) {
    process.stdout.write(`enc ${L.id} ${L.label} ${count}f ${seconds}s ... `);
    encode(L);
    console.log(`${(size(d) / MB).toFixed(2)} MB / ${(size(m) / MB).toFixed(2)} MB`);
  }
  const real = +probe(['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=nb_frames', '-of', 'csv=p=0', d]);
  legs.push({
    id: L.id, wp: L.wp, label: L.label, place: L.place, look: L.look, caption: L.caption,
    source: L.dir + `#${L.from}..${L.to}`,
    frames: [L.from, L.to], count, encodedFrames: real, seconds, weightVh: w,
    rate: +(w / seconds).toFixed(4),
    src: `/landxi/assets/proto/film/legs/w${L.id}.mp4`,
    srcMobile: `/landxi/assets/proto/film/legs/w${L.id}-m.mp4`,
    poster: `/landxi/assets/proto/film/legs/w${L.id}.webp`,
    bytes: size(d), bytesMobile: size(m), bytesPoster: size(p),
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
  const sameSource = PLAN[i].dir === PLAN[i + 1].dir && PLAN[i].to === PLAN[i + 1].from;
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
  source: '4개 렌더러 · three-globe(궤도) + 구름 스파이크(권운) + MapLibre 결정론 필름 + maplibre3d 실측 3D',
  fps: FPS,
  filmSize: [1280, 720],
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
    '레그마다 렌더러가 다르다. 좌표·고도·방위·피치는 전부 그 레그를 구운 렌더러의 실제 ' +
    '카메라 값이다(three-globe LEGS[].keys · 구름 스파이크 keys · MapLibre 필름 SEG · ' +
    'maplibre3d LEG[]). 그래서 렌더러가 바뀌는 이음매에서는 고도가 실제로 튄다 — 필름 ' +
    '자체가 거기서 컷이기 때문이다. 계기 바늘이 스냅하지 않도록 페이지가 씸 밴드(0.16vh) ' +
    '위에서 두 레그의 판독값을 섞는다(scrub.js camAt). 인계 판은 그 덕분에 필름 마지막 ' +
    '프레임과 정확히 같은 카메라로 뜬다.',
  bytes: { desktop: dTot, mobile: mTot, poster: pTot,
    desktopMB: +(dTot / MB).toFixed(2), mobileMB: +(mTot / MB).toFixed(2), posterMB: +(pTot / MB).toFixed(2) },
  seams,
  legs,
  handoff: {
    afterLeg: '06',
    legIndex: 5,
    center: legs[5].endCamera.center,
    zoom: legs[5].endCamera.zoom,
    pitch: legs[5].endCamera.pitch,
    bearing: legs[5].endCamera.bearing,
    altitudeM: legs[5].endCamera.altitudeM,
    detections: '/landxi/assets/data/geo/results/namwon-greenhouse-2025.geojson',
    note: '남원 스케일 마지막 레그(06 비닐하우스)의 끝 카메라. 필름이 멈춘 그 자리에서 실지도가 같은 카메라로 이어받는다 — 1프레임 크로스페이드.',
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
