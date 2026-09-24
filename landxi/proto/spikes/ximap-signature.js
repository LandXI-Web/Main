/* E0-S XI맵 시그니처 스파이크 — S1 도착 · S3 시점 스크럽 · S6 스와이프 (실데이터 · 제품 아님)
   숫자 출처: results.js stats · imagery.js · change.js · 실 GeoJSON(필지 속성) 뿐. 지어낸 값 0.
   부품은 import 만(map-gl.js createMap · setBase · haversine / map-data.js TEAL · centroid · clsLabel · isDashCls).
   두 층 크로스페이드 · 스윕 · 락온은 이 파일 안에서 map.addSource/addLayer 로 직접 — 부품화는 W2 E2-0.
   지속값은 D 한 곳(법전 §4 사다리 + 락온 380 = 180·80·120 + 스태거 40·60·120). 이징은 EASE 하나(+ CSS 호버 --hove). */
import { createMap, setBase, haversine } from '../map-gl.js';
import { TEAL, centroid, clsLabel, isDashCls } from '../map-data.js';
import { RESULTS } from '../../assets/data/results.js';
import { IMAGERY } from '../../assets/data/imagery.js';
import { CHANGE } from '../../assets/data/change.js';

/* ══ 0. 법전 값 ══════════════════════════════════════════════════════════ */
const D = {
  frame: 1000,      // S1 남원 전역 frame(부팅 자리 · 다른 장면에서 올라올 때)
  descend: 1250,    // S1 스윕 뒤 한 필지로 하강(브리프 900–1250 · 법전 사다리 1250)
  dive: 1000,       // S3 · S6 정사영상 범위 · 필지로 이어지는 카메라
  sweep: 1000,      // 스캔 스윕 1.0s
  fade: 500,        // 스윕이 지난 필지의 현상(0 → 1)
  lock: 380,        // 락온 = 180 + 80 + 120 (CSS .spk-lock)
  dig: 40,          // 숫자 글자별 현상
  tst: 60,          // 텍스트 인 스태거
  tin: 500,         // 텍스트 인(법전 600 대신 500 — 결과 문서 '남은 것' 참고)
  stop: 750,        // S3 재생 · 정수 시점 자동 정지
  hop: 1000,        // S3 재생 · 한 시점에서 다음 시점까지
  peel: 1000,       // S6 진입 · 가르는 선이 왼쪽 끝에서 들어와 결과를 벗긴다
  debounce: 120,    // 손으로 끄는 동안 URL 기록 간격
  tileFade: 500,    // 도시 바탕 · 정사영상 타일이 들어올 때(raster-fade-duration)
  reveal: 120,      // S6 착지 → 가르는 선 진입 사이 상한(B 한 장 그리기만 기다린다)
};
/* 재생 주기 = 정지 4 × 750 + 이동 3 × 1000 = 6000ms(법전 유휴 ≥ 6s · 화면 유휴 1개) */
const CYCLE = 4 * D.stop + 3 * D.hop;

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const EASE = bezier(0.15, 1, 0.3, 1);
/* 카메라 = 법전 이징을 '해상도 공간'에 건다. 이징을 줌(로그 척도)에 바로 걸면 +300ms 에 80 % 가 끝나고
   뒤 절반이 정지로 읽힌다. 대신 화면 해상도(m/px)가 깊이 2^14(= 14 줌 단계)의 가상 하강에서 법전 이징대로
   줄어든다고 보고, 그 하강이 지난 줌 단계의 비율을 경로 진행으로 쓴다: DEPTH(x) = -log2(1 - x(1 - 2^-14)) / 14.
   시작 · 끝 = 0 · 1, 단조 증가. 진행률 +300ms ≈ 22 % · +900ms(1000) ≈ 89 % · +900ms(1250) ≈ 58 %. */
const DEPTH_Z = 14, DEPTH_C = 1 - 2 ** -DEPTH_Z;
const CAM_EASE = (t) => (t >= 1 ? 1 : -Math.log2(1 - EASE(t) * DEPTH_C) / DEPTH_Z);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ 1. 실데이터 ═════════════════════════════════════════════════════════ */
const R = RESULTS.find((r) => r.id === 'namwon-farmland-2025');
const ST = R.stats;
const EP = IMAGERY.filter((i) => /^namwon_25\d\d$/.test(i.id)).sort((a, b) => a.captured.localeCompare(b.captured));
const CITY = IMAGERY.find((i) => i.id === 'namwon_city_2510');   // 남원 전역 2 m · 2시점 중 판독 범위를 더 넓게 덮는 10월
const OB = EP[0].bounds;                                   // 정사영상 4시점 공통 범위
const BB = ST.bbox;                                        // 결과 bbox
const ROOT = '../../';
const nf = new Intl.NumberFormat('ko-KR');
const lab = (im) => im.captured.replace('-', '.');
const gsd = (im) => (im.gsd * 100).toFixed(2);
const dot = (s) => s.replace(/-/g, '.');
const midLat = (OB[1] + OB[3]) / 2;
const OB_KM2 = (haversine(OB[0], midLat, OB[2], midLat) * haversine(OB[0], OB[1], OB[0], OB[3]) / 1e6).toFixed(2);

const $ = (s) => document.querySelector(s);
const el = {
  stage: $('#spk-stage'), a: $('#spk-map-a'), b: $('#spk-map-b'), sweep: $('#spk-sweep'), locks: $('#spk-locks'),
  hud: $('#spk-hud'), scene: $('#hud-scene'), title: $('#hud-title'), status: $('#hud-status'), big: $('#hud-big'), unit: $('#hud-unit'),
  note: $('#hud-note'), chg: $('#hud-chg'), replay: $('#spk-replay'),
  scrub: $('#spk-scrub'), play: $('#spk-play'), range: $('#spk-range'), ticks: $('#spk-ticks'), void: $('#spk-void'),
  seg: $('#spk-seg'), swipe: $('#spk-swipe'), grip: $('#spk-grip'), swL: $('#spk-swipe-l'), swR: $('#spk-swipe-r'),
};
$('#spk-band-n').textContent = nf.format(ST.count);

/* ══ 2. 상태 ═════════════════════════════════════════════════════════════ */
const S = {
  scene: 's1', phase: '', phases: [], marks: [], jumps: 0, started: false, arrived: false, ready: false,
  e: 3, swipe: 50, off: true, playing: false, paused: false, stops: [],
  frames: [], lastT: 0, A: null, B: null, geo: null, pts: null, order: [], chg: null,
};
const setPhase = (p) => { S.phase = p; S.phases.push(p); S.marks.push([p, Math.round(performance.now())]); document.documentElement.dataset.phase = p; };

/* 정사영상 타일셋은 성기다 — 없는 타일에 로컬 서버가 주는 투명 1×1 PNG 가 Chrome 에서 디코드되지 않아
   (tools/serve.mjs BLANK · 결과 문서 '요청') 콘솔 오류가 쌓였다. 스파이크의 타일은 spk:// 로 받아
   webp 가 아니면 브라우저가 만든 투명 1×1 로 바꾼다. */
let BLANK = null;
const blank = async () => {
  if (!BLANK) { const c = new OffscreenCanvas(1, 1); c.getContext('2d'); BLANK = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer(); }
  return BLANK.slice(0);
};
/* 타일 기억 — 로컬 서버는 검증자(ETag · Last-Modified)를 주지 않아 브라우저 HTTP 캐시가 타일을 다시 받는다.
   바이트는 URL 마다 한 번만 받고(BYTES), 미리 받아 둘 타일은 디코드까지 끝낸 ImageBitmap 으로 둔다(BMP).
   MapLibre 는 프로토콜이 ImageBitmap 을 주면 디코드 없이 바로 텍스처로 올린다 — 하강 중 낱장 팝인이 사라진다. */
const BYTES = new Map(), BMP = new Map();
const TSTAT = { log: [] };                                  // 테스트용 — 요청마다 [원천, 단계, 미리 받음?, 지연 ms]
const bytesOf = (url) => {
  if (!BYTES.has(url)) {
    const p = fetch(url).then(async (r) => (r.ok && /webp/.test(r.headers.get('content-type') || '') ? r.arrayBuffer() : null));
    BYTES.set(url, p);
    p.catch(() => BYTES.delete(url));
  }
  return BYTES.get(url);
};
/* 원천 타일셋은 줌마다 덮는 자리가 조금씩 다르다(도시 정사영상은 z13 에 있는 자리가 z14 에 빠지기도 한다).
   빠진 타일을 투명으로 두면 그 자리가 타일 모양 흰 사각형으로 뚫린다 — 부모 타일(최대 4단 위)의 해당 4분면을 확대해 채운다. */
const TILE_RE = /^(.*\/)(\d+)\/(\d+)\/(\d+)\.webp$/;
const PARENT = new Map();
const decode = (b) => createImageBitmap(new Blob([b], { type: 'image/webp' }));
function tileBitmap(url, depth = 0) {
  return bytesOf(url).then(async (b) => {
    if (b) return decode(b);
    const m = TILE_RE.exec(url);
    if (!m || depth >= 4 || +m[2] <= 0) return null;
    const z = +m[2], x = +m[3], y = +m[4], pu = `${m[1]}${z - 1}/${x >> 1}/${y >> 1}.webp`;
    if (!PARENT.has(pu)) { PARENT.set(pu, tileBitmap(pu, depth + 1).catch(() => null)); if (PARENT.size > 400) PARENT.delete(PARENT.keys().next().value); }
    const p = await PARENT.get(pu);
    if (!p) return null;
    const h = p.width / 2;
    return createImageBitmap(p, (x & 1) * h, (y & 1) * h, h, h, { resizeWidth: p.width, resizeHeight: p.height, resizeQuality: 'medium' });
  }).catch(() => null);
}
const bitmapOf = (url) => {
  if (!BMP.has(url)) BMP.set(url, tileBitmap(url));
  return BMP.get(url);
};
const abortable = (p, ac) => new Promise((res, rej) => {
  const no = () => rej(new Error('AbortError'));
  if (ac.signal.aborted) return no();
  ac.signal.addEventListener('abort', no, { once: true });
  p.then(res, rej);
});
maplibregl.addProtocol('spk', (params, ac) => abortable((async () => {
  const url = params.url.slice('spk://'.length), t0 = performance.now(), warm = BMP.has(url);
  let data;
  if (warm) { const bm = await BMP.get(url); data = bm ? await createImageBitmap(bm).catch(() => null) : null; }
  if (!data) { const b = await bytesOf(url); data = b ? b.slice(0) : (await tileBitmap(url)) || (await blank()); }
  const src = /tiles\/([^/]+)\//.exec(url)?.[1] || '';
  TSTAT.log.push([src, S.phase, warm, Math.round(performance.now() - t0), S.scene, url.split('/').slice(-3).join('/')]);
  if (TSTAT.log.length > 4000) TSTAT.log.shift();
  return { data };
})(), ac));
const TILE_BASE = () => new URL(ROOT, location.href).href;
const tileURL = (t) => 'spk://' + TILE_BASE() + t;   // {z}/{x}/{y} 가 인코딩되지 않게 뒤에 붙인다

/* 미리 받기 — 카메라가 지날 자리의 타일 목록(웹 메르카토르 · 256 px 타일 = 지도 줌 + 1). */
const mercX = (lng) => (lng + 180) / 360;
const mercY = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
/** 카메라 cam(center · zoom) 화면(W×H px)을 덮는 원천 im 의 타일 URL — 타일 줌 z 들, 원천 bounds 안만. */
function tilesFor(im, cam, zs, W, H, pad = 1) {
  const c = maplibregl.LngLat.convert(cam.center), ws = 512 * 2 ** cam.zoom, out = [];
  const fx0 = mercX(c.lng) - W / 2 / ws, fx1 = mercX(c.lng) + W / 2 / ws, fy0 = mercY(c.lat) - H / 2 / ws, fy1 = mercY(c.lat) + H / 2 / ws;
  const b = im.bounds;
  for (const z of zs) {
    if (z < im.minzoom || z > srcMax(im)) continue;
    const n = 2 ** z, cl = (v) => Math.max(0, Math.min(n - 1, v));
    const x0 = cl(Math.max(Math.floor(fx0 * n) - pad, Math.floor(mercX(b[0]) * n))), x1 = cl(Math.min(Math.floor(fx1 * n) + pad, Math.floor(mercX(b[2]) * n)));
    const y0 = cl(Math.max(Math.floor(fy0 * n) - pad, Math.floor(mercY(b[3]) * n))), y1 = cl(Math.min(Math.floor(fy1 * n) + pad, Math.floor(mercY(b[1]) * n)));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push(TILE_BASE() + im.tiles.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  }
  return out;
}
/** 카메라 a → b 사이(해상도 가중 보간)를 k 칸으로 나눠 지나는 화면들의 타일. flyTo 경로의 근사 — 둘레 2 타일로 여유를 둔다. */
function tilesAlong(im, a, b, W, H, k = 12) {
  const ca = maplibregl.LngLat.convert(a.center), cb = maplibregl.LngLat.convert(b.center), set = new Set();
  const ra = 2 ** -a.zoom, rb = 2 ** -b.zoom;
  for (let i = 0; i <= k; i++) {
    const z = a.zoom + ((b.zoom - a.zoom) * i) / k, w = Math.abs(ra - rb) < 1e-12 ? i / k : (ra - 2 ** -z) / (ra - rb);
    const cam = { center: [ca.lng + (cb.lng - ca.lng) * w, ca.lat + (cb.lat - ca.lat) * w], zoom: z };
    const tz = Math.round(z + 1);
    for (const u of tilesFor(im, cam, [tz - 1, tz], W, H, 2)) set.add(u);
  }
  return [...set];
}
const WARM = { n: 0, ms: 0 };
function prewarm(urls) {
  const t0 = performance.now();
  return Promise.all(urls.map(bitmapOf)).then((r) => { WARM.n = r.filter(Boolean).length; WARM.ms = Math.round(performance.now() - t0); return WARM; });
}
/** 하강을 마치면 디코드해 둔 비트맵을 놓는다(바이트는 남는다 — 다시 보기 · B 는 바이트에서 곧장 디코드). */
function releaseBitmaps(keep = () => false) {
  for (const [u, p] of BMP) if (!keep(u)) { BMP.delete(u); p.then((b) => b?.close()).catch(() => {}); }
}

/* ══ 3. 지도 꾸미기 — 도시 바탕(실색 · 밑깔개) · 정사영상 4층 · 읍면동 · 변화 지수 · 결과 ══ */
const FS = ['coalesce', ['feature-state', 'a'], 0];
function decorate(map, { results = true } = {}) {
  // MapLibre 의 기본 속성 전이(300ms)는 법전 사다리 밖 — 스타일 전체를 0 으로 두고 필요한 곳만 D 값으로 연다.
  if (map.style?.stylesheet) map.style.stylesheet.transition = { duration: 0, delay: 0 };
  setBase(map, 'none');                                    // V-World 끄고 흰 바탕 — 바탕은 LX 도시 정사영상(로컬 타일)
  map.addSource('city', { type: 'raster', tiles: [tileURL(CITY.tiles)], tileSize: 256, minzoom: CITY.minzoom, maxzoom: srcMax(CITY), bounds: CITY.bounds, attribution: '' });
  // 도시 바탕 = LX 남원 전역 정사영상(2 m · 원천 실색 그대로 — 채도 · 밝기 · 대비 보정 0).
  // 모든 줌에서 드론 4층 아래 밑깔개로 남는다 — 하강 · S3 · S6 어디서도 영상 밖 흰 종이가 드러나지 않게.
  map.addLayer({ id: 'city', type: 'raster', source: 'city', paint: { 'raster-fade-duration': RM ? 0 : D.tileFade } }, 'emd-fill');
  EP.forEach((im, k) => {
    map.addSource('ep' + k, { type: 'raster', tiles: [tileURL(im.tiles)], tileSize: 256, minzoom: im.minzoom, maxzoom: im.maxzoom, bounds: im.bounds, attribution: '' });
    map.addLayer({ id: 'ep' + k, type: 'raster', source: 'ep' + k, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0 }, 'raster-fade-duration': RM ? 0 : D.tileFade } }, 'emd-fill');
  });
  map.addSource('spk-emd', { type: 'geojson', data: S.emd });
  map.addLayer({ id: 'spk-emd', type: 'line', source: 'spk-emd', maxzoom: 14, layout: { 'line-join': 'miter' }, paint: { 'line-color': '#010102', 'line-width': 0.8, 'line-opacity': 0.22 } }, 'sr-fill');
  // 정사영상 4시점 범위 = 헤어라인 틀 하나. S1 에선 없고, S3 · S6 에서 카메라가 서고 영상이 깔린 뒤(idle)에만 들어온다.
  map.addSource('spk-ob', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[OB[0], OB[1]], [OB[2], OB[1]], [OB[2], OB[3]], [OB[0], OB[3]], [OB[0], OB[1]]]] } } });
  map.addLayer({ id: 'spk-ob', type: 'line', source: 'spk-ob', minzoom: 12, layout: { 'line-join': 'miter' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 1, 'line-opacity': 0, 'line-opacity-transition': { duration: RM ? 0 : D.fade } } }, 'sr-fill');
  map.addSource('spk-chg', { type: 'geojson', data: S.chg });
  map.addLayer({ id: 'spk-chg', type: 'line', source: 'spk-chg', filter: ['==', ['get', 'pair'], ''], layout: { 'line-join': 'miter' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [2, 1.5], 'line-opacity': 0, 'line-opacity-transition': { duration: RM ? 0 : D.fade } } }, 'sr-fill');
  if (!results) return;
  const dash = S.dash = ['in', ['get', 'cls'], ['literal', [...new Set(S.geo.features.map((f) => f.properties.cls))].filter(isDashCls)]];
  const k = ['-', 2, FS];                                  // 막 도착한 점은 두 배 크기에서 1 로 가라앉는다
  map.addSource('r', { type: 'geojson', data: S.geo });
  map.addSource('r-pt', { type: 'geojson', data: S.pts });
  // 도시 스케일에서 필지(≈ 50 m)는 1 px 안팎 — 폴리곤 자체를 청록 면·선으로 그리고, 막 도착한 자리엔
  // 두 배 크기에서 가라앉는 점 하나가 '도착' 을 알린다(도착이 끝나면 점은 옅게 남아 폴리곤 위치를 짚는다).
  map.addLayer({ id: 'r-pt', type: 'circle', source: 'r-pt', maxzoom: 12.5, paint: {
    'circle-color': TEAL, 'circle-opacity': ['*', ['-', 1.3, FS], 0.7, FS],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['*', 1.5, k], 11, ['*', 2.2, k], 12.5, ['*', 3, k]],
    'circle-stroke-width': 0 } }, 'sr-fill');
  const W = ['interpolate', ['linear'], ['zoom'], 9, 2, 11.5, 1.8, 13, 1.2, 15, 1.7, 18, 2.6];
  map.addLayer({ id: 'r-fill', type: 'fill', source: 'r', filter: ['!', dash], paint: { 'fill-color': TEAL, 'fill-opacity': rOp(0.8, 0.2, false) } }, 'sr-fill');
  map.addLayer({ id: 'r-line', type: 'line', source: 'r', filter: ['!', dash], layout: { 'line-join': 'miter' },
    paint: { 'line-color': TEAL, 'line-width': W, 'line-opacity': rOp(0.95, 0.95, false) } }, 'sr-fill');
  map.addLayer({ id: 'r-dash', type: 'line', source: 'r', filter: dash, layout: { 'line-join': 'miter' },
    paint: { 'line-color': TEAL, 'line-width': W, 'line-dasharray': [3, 2], 'line-opacity': rOp(0.95, 0.95, false) } }, 'sr-fill');
  // 범위에 걸치기만 한 필지 = 정사영상 범위로 자른 모양(S3 · S6 에서만). 영상 밖으로 튀어나온 청록 조각이 없다.
  map.addSource('r-clip', { type: 'geojson', data: S.clip });
  const cOp = (hi) => ['interpolate', ['linear'], ['zoom'], SCOPE_Z - 1.5, 0, SCOPE_Z, hi];
  map.addLayer({ id: 'rc-fill', type: 'fill', source: 'r-clip', filter: ['!', dash], layout: { visibility: 'none' }, paint: { 'fill-color': TEAL, 'fill-opacity': cOp(0.2) } }, 'sr-fill');
  map.addLayer({ id: 'rc-line', type: 'line', source: 'r-clip', filter: ['!', dash], layout: { visibility: 'none', 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': W, 'line-opacity': cOp(0.95) } }, 'sr-fill');
  map.addLayer({ id: 'rc-dash', type: 'line', source: 'r-clip', filter: dash, layout: { visibility: 'none', 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': W, 'line-dasharray': [3, 2], 'line-opacity': cOp(0.95) } }, 'sr-fill');
}
const R_LAYERS = ['r-pt', 'r-fill', 'r-line', 'r-dash'];
/* 도시 정사영상 원천의 실제 최대 줌 — 판독 범위(농경지) 둘레 타일은 z15 까지이고 z16–17 은 시내 core 에만 있다.
   원천 maxzoom 을 15 로 두면 그 위 줌에선 z15 를 확대해 그린다(빈 z16 타일이 흰 구멍으로 뚫리지 않는다). */
const CITY_MAX = 15;
const srcMax = (im) => (im === CITY ? CITY_MAX : im.maxzoom);
const RC_LAYERS = ['rc-fill', 'rc-line', 'rc-dash'];
/* 결과 면·선의 불투명도. scoped(S3 · S6) = 정사영상 범위 안에 온전히 든 필지만 원래 모양으로 남고, 범위에 걸친 필지는
   범위로 자른 모양(r-clip)으로 바뀌며, 범위 밖 필지는 z13 → 14.5 하강하며 걷힌다. z13 아래에선 두 식이 같아 장면 전환에 튐이 없다. */
const SCOPE_Z = 14.5;
function rOp(lo, hi, scoped) {
  const a = ['*', lo, FS], b = ['*', hi, FS];
  return ['interpolate', ['linear'], ['zoom'], 11, a, SCOPE_Z - 1.5, b, SCOPE_Z, scoped ? ['*', hi, FS, ['case', ['get', 'inside'], 1, 0]] : b];
}
function scopeResults(map, scoped) {
  if (!map?.getLayer('r-fill')) return;
  map.__scoped = scoped;
  map.setPaintProperty('r-fill', 'fill-opacity', rOp(0.8, 0.2, scoped));
  map.setPaintProperty('r-line', 'line-opacity', rOp(0.95, 0.95, scoped));
  map.setPaintProperty('r-dash', 'line-opacity', rOp(0.95, 0.95, scoped));
  showResults(map, map.__shown !== false);
}
function showResults(map, on) {
  if (!map) return;
  map.__shown = on;
  const vis = (l, v) => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', v ? 'visible' : 'none');
  R_LAYERS.forEach((l) => vis(l, on));
  RC_LAYERS.forEach((l) => vis(l, on && !!map.__scoped));
}
/** 정사영상 범위 틀 — S3 · S6 에서 영상이 깔린 뒤에만(D.fade 로 들어온다). */
const showFrame = (map, on) => map?.getLayer('spk-ob') && map.setPaintProperty('spk-ob', 'line-opacity', on ? 0.6 : 0);
/** 사각형 [W,S,E,N] 로 폴리곤 자르기(Sutherland–Hodgman · 링마다). */
function clipRect(geom, r) {
  const clipRing = (ring) => {
    let pts = ring.slice(0, -1);
    const edges = [[(p) => p[0] >= r[0], (a, b) => [r[0], a[1] + ((b[1] - a[1]) * (r[0] - a[0])) / (b[0] - a[0])]],
      [(p) => p[0] <= r[2], (a, b) => [r[2], a[1] + ((b[1] - a[1]) * (r[2] - a[0])) / (b[0] - a[0])]],
      [(p) => p[1] >= r[1], (a, b) => [a[0] + ((b[0] - a[0]) * (r[1] - a[1])) / (b[1] - a[1]), r[1]]],
      [(p) => p[1] <= r[3], (a, b) => [a[0] + ((b[0] - a[0]) * (r[3] - a[1])) / (b[1] - a[1]), r[3]]]];
    for (const [inside, cut] of edges) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[i];
        if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
      }
      pts = out;
      if (!pts.length) break;
    }
    return pts.length >= 3 ? [...pts, pts[0]] : null;
  };
  const poly = (rings) => { const o = rings.map(clipRing); return o[0] ? o.filter(Boolean) : null; };
  if (geom.type === 'Polygon') { const p = poly(geom.coordinates); return p && { type: 'Polygon', coordinates: p }; }
  const ps = geom.coordinates.map(poly).filter(Boolean);
  return ps.length ? { type: 'MultiPolygon', coordinates: ps } : null;
}
function revealAll(map, a = 1) {
  if (map === S.A) S.level.fill(a);
  for (let i = 0; i < S.geo.features.length; i++) { map.setFeatureState({ source: 'r', id: i }, { a }); map.setFeatureState({ source: 'r-pt', id: i }, { a }); }
}

/* ══ 4. 시점(0–3 소수) — 두 층 크로스페이드 ═══════════════════════════════ */
function epochLayers(e) {
  const k = Math.min(3, Math.floor(e + 1e-6)), f = +(e - k).toFixed(4);
  if (f < 0.005 || k >= 3) return { a: EP[k].id, b: null, opA: 1, opB: 0, k, f: 0 };
  return { a: EP[k].id, b: EP[k + 1].id, opA: +(1 - f).toFixed(4), opB: f, k, f };
}
/* 층 켜기 — 불투명도 0 이어도 켜진 래스터 층은 타일을 받는다. S1 · S6 은 보이는 시점 층만 켜고(하강 · 착지에 4배 적재 없음),
   S3 는 카메라가 선 뒤 4층을 모두 켠다(재생 · 스크럽이 콜드 타일을 만나지 않게 — epAll). */
function paintEpoch(map, e) {
  if (!map?.getLayer('ep0')) return;
  const L = epochLayers(e);
  EP.forEach((im, i) => {
    const op = im.id === L.a ? L.opA : im.id === L.b ? L.opB : 0, id = 'ep' + i, vis = map.__epAll || op > 0 ? 'visible' : 'none';
    map.setPaintProperty(id, 'raster-opacity', op);
    if (map.getLayoutProperty(id, 'visibility') !== vis) map.setLayoutProperty(id, 'visibility', vis);
  });
}
function epAll(map, on) { if (!map) return; map.__epAll = on; paintEpoch(map, S.e); }
const valueText = (e) => { const L = epochLayers(e); return L.b ? `${lab(EP[L.k])} → ${lab(EP[L.k + 1])} · ${Math.round(L.f * 100)} %` : lab(EP[L.k]); };
const pairAt = (k) => CHANGE[Math.max(0, Math.min(CHANGE.length - 1, k - 1))];
let urlTimer = 0;
function setEpoch(e, { url = 'now', from = 'api' } = {}) {
  e = Math.max(0, Math.min(3, Math.round(e * 100) / 100));
  S.e = e;
  paintEpoch(S.A, e); paintEpoch(S.B, e);
  if (from !== 'range') el.range.value = String(e);
  el.range.setAttribute('aria-valuetext', valueText(e));
  el.ticks.querySelectorAll('li').forEach((li, i) => { li.dataset.on = Math.round(e) === i ? '1' : '0'; });
  const L = epochLayers(e), atInt = !L.b;
  // 정수 시점 = 변화 pair 경계 → 변화 지수(비지도) 한 줄 + 그 pair 의 윤곽
  const pair = atInt ? pairAt(L.k) : null;
  for (const m of [S.A, S.B]) {
    if (!m?.getLayer('spk-chg')) continue;
    if (pair) m.setFilter('spk-chg', ['==', ['get', 'pair'], pair.pair]);
    m.setPaintProperty('spk-chg', 'line-opacity', pair && S.scene === 's3' ? 0.9 : 0);
  }
  if (S.scene === 's3') {
    el.chg.hidden = !pair;
    if (pair) el.chg.innerHTML = `변화 지수(비지도) · ${pair.label} · <span class="n">${nf.format(pair.stats.n)}</span>건 · 학습 결과 아님`;
    hudEpoch(false);                                       // 재생·스크럽 중 시점 전환 = 제자리 교체(텍스트 인은 enterS3 한 번)
  }
  if (S.scene === 's6') hudSwipe();
  if (url === 'now') writeURL();
  else if (url === 'later') { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, D.debounce); }
}
function writeURL() {
  const q = new URLSearchParams();
  q.set('scene', S.scene);
  if (S.scene !== 's1') q.set('epoch', String(S.e));
  if (S.scene === 's6') q.set('swipe', String(Math.round(S.swipe)));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

/* ══ 5. HUD ══════════════════════════════════════════════════════════════ */
function bigText(txt, animate = true) {
  el.big.innerHTML = [...txt].map((c, i) => `<span class="ch" style="--i:${i}">${c}</span>`).join('');
  if (!animate) el.big.querySelectorAll('.ch').forEach((s) => { s.style.animation = 'none'; });
  el.big.setAttribute('aria-label', txt);
}
function noteSegs(segs, animate = true) {
  el.note.innerHTML = segs.map((s, i) => `<span class="seg" style="--i:${i}">${s}</span>`).join('');
  if (!animate) el.note.querySelectorAll('.seg').forEach((s) => { s.style.animation = 'none'; });
}
const N = (v) => `<span class="n">${v}</span>`;
function hudS1(done, animate) {
  hudKey = '';
  el.scene.textContent = 'S1 도착';
  el.title.textContent = `${R.title} · ${R.year} · 드론`;
  el.status.textContent = done ? `판독 결과 도착 · 기준 ${dot(ST.analyzedAt)}` : '판독 결과 도착 중';
  el.status.dataset.state = done ? 'live' : '';
  el.unit.textContent = R.unit;
  el.chg.hidden = true;
  el.replay.parentElement.hidden = false;
  if (!done) { el.big.textContent = '—'; el.note.innerHTML = ''; return; }
  bigText(nf.format(ST.count), animate);
  noteSegs([`경작지 ${N(nf.format(ST.classes['경작지']))}`, `비경작지 ${N(nf.format(ST.classes['비경작지']))}`,
    `${N(ST.areaHa.toFixed(1))} ha`, `신뢰도 중앙값 ${N(ST.confMedian.toFixed(2))}`, `기준 ${N(dot(ST.analyzedAt))}`], animate);
}
let hudKey = '';
function hudEpoch(animate) {
  const L = epochLayers(S.e), im = EP[Math.round(S.e)];
  el.status.textContent = L.b ? valueText(S.e) : `시점 ${lab(im)} · 크로스페이드 없음`;
  const key = 's3:' + im.id;
  if (!animate && hudKey === key) return;                 // 같은 시점이면 큰 숫자·해설 줄은 그대로
  hudKey = key;
  el.scene.textContent = 'S3 시점';
  el.title.textContent = '남원 농경지 정사영상 · LX 드론 4시점';
  el.status.dataset.state = '';
  el.unit.textContent = '촬영';
  el.replay.parentElement.hidden = true;
  bigText(lab(im), animate && !RM);
  noteSegs([`GSD ${N(gsd(im))} cm`, `범위 ${N(OB_KM2)} km²`, `이 범위 판독 ${N(IN.n)} 필지`], animate && !RM);
}
function hudSwipe(animate = false) {
  hudKey = '';
  const im = EP[Math.round(S.e)];
  el.scene.textContent = 'S6 스와이프';
  el.title.textContent = '원본 ↔ AI 판독 · 한 선으로 가른다';
  el.status.textContent = `원본 ${lab(im)} · GSD ${gsd(im)} cm`;
  el.status.dataset.state = '';
  el.unit.textContent = R.unit;
  el.chg.hidden = true;
  el.replay.parentElement.hidden = true;
  if (animate) {
    bigText(nf.format(IN.n), !RM);
    noteSegs(['정사영상 범위 안 판독', `경작지 ${N(IN.cls['경작지'] || 0)}`, `비경작지 ${N(IN.cls['비경작지'] || 0)}`, `전체 ${N(nf.format(ST.count))} 필지 중`], !RM);
  }
  el.swL.innerHTML = `<span>원본 · ${N(lab(im))} · ${N(gsd(im))} cm</span>`;
  el.swR.innerHTML = '<span><b>AI 판독</b>경작지 · 비경작지</span>';
}

/* ══ 6. 락온 — 브래킷 성장 180 → 앰버 80 → 청록 120 ═══════════════════════ */
const locks = [];
function lockAt(i) {
  const f = S.geo.features[i]; if (!f) return null;
  const p = f.properties;
  const box = document.createElement('div');
  box.className = 'spk-lock';
  box.dataset.fid = String(i);
  box.dataset.lockAt = String(Math.round(performance.now()));
  box.innerHTML = `<span class="spk-flag"><b>${clsLabel(p.cls)}</b>${p.emd} · ${N(nf.format(Math.round(p.area)))} m² · 신뢰도 ${N(p.conf.toFixed(2))}</span>`;
  box.addEventListener('animationend', (ev) => {
    if (ev.animationName !== 'spk-settle') return;
    box.dataset.lockEnd = String(Math.round(performance.now()));
    box.dispatchEvent(new Event('spk-locked'));
  });
  el.locks.appendChild(box);
  locks.push({ i, box, c: [p.cx, p.cy], bb: S.bbox[i] });
  while (locks.length > 4) locks.shift().box.remove();
  placeLocks();
  return box;
}
function placeLocks() {
  const m = S.A; if (!m) return;
  for (const L of locks) {
    const c = m.project(L.c), a = m.project([L.bb[0], L.bb[3]]), b = m.project([L.bb[2], L.bb[1]]);
    const w = Math.max(40, Math.min(380, Math.abs(b.x - a.x) + 24)), h = Math.max(40, Math.min(380, Math.abs(b.y - a.y) + 24));
    L.box.style.setProperty('--w', w + 'px'); L.box.style.setProperty('--h', h + 'px');
    L.box.style.translate = `${(c.x - w / 2).toFixed(1)}px ${(c.y - h / 2).toFixed(1)}px`;
    // 오른쪽 끝에 닿는 필지는 속성 한 줄을 왼쪽으로 — 창 밖으로 잘리지 않게
    const fw = L.flagW || (L.flagW = L.box.firstElementChild.offsetWidth);
    L.box.classList.toggle('flip', c.x + w / 2 + 8 + fw > el.stage.clientWidth - 16);
  }
}
const clearLocks = () => { while (locks.length) locks.pop().box.remove(); };

/* ══ 7. 대기 — 시간이 아니라 사건(카메라 moveend · 지도 idle · animationend · 스윕 끝)을 기다린다 ══ */
let run = 0;                                               // 다시 보기 · 장면 전환이 이전 흐름을 끊는다
const bus = new EventTarget();                             // 'sweepline' · 'peeled'
const once = (t, type) => new Promise((res) => t.addEventListener(type, res, { once: true }));
const moveEnd = (map) => new Promise((res) => (map.isMoving() ? map.once('moveend', res) : res()));
/** 타일 적재 + 타일 페이드 + 카메라 정지까지(= MapLibre 'idle'). 이미 멈춘 지도는 한 번 다시 그려 idle 을 받는다. */
const idleOf = (map) => new Promise((res) => { map.once('idle', res); map.triggerRepaint(); });
/** 사건 또는 안전핀 — 안전핀은 사건이 오지 않는 경우(타일 결손 등)에만 쓰인다. */
const either = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(res, ms))]);
/** 테스트 · 시연용 정지점 — window.__spikeHold = '<phase>' 이면 그 단계 직전에서 멈추고 __spike.release() 를 기다린다. */
async function gate(p) {
  if (window.__spikeHold !== p) return;
  document.documentElement.dataset.hold = p;
  await new Promise((res) => { S.release = res; });
  delete document.documentElement.dataset.hold;
}
const fly = (map, cam, dur) => {
  if (map === S.A) S.cam.push([Math.round(performance.now()), +map.getZoom().toFixed(4), S.scene, S.phase, ...map.getCenter().toArray().map((v) => +v.toFixed(6)), 'start']);
  map.flyTo({ ...cam, duration: dur, easing: CAM_EASE, essential: true });
  return moveEnd(map);
};

/* ══ 8. 카메라 한 줄 — 남원 전역 → 한 필지(S1) → 정사영상 범위(S3) → 같은 필지(S6) ══════ */
const PAD = () => {
  const left = el.hud.offsetLeft + el.hud.offsetWidth + 24;
  const bottom = el.stage.clientHeight - el.scrub.offsetTop + 24;
  return { top: 32, right: 32, bottom: Math.max(48, bottom), left: Math.min(left, el.stage.clientWidth * 0.45) };
};
const LAND_Z = 18;                                          // 드론 4시점(1–2 cm)이 화면을 채우는 줌
const box2 = (b) => [[b[0], b[1]], [b[2], b[3]]];
const CAM = {
  city: () => S.A.cameraForBounds(box2(BB), { padding: PAD() }),
  land: () => S.A.cameraForBounds(box2(S.bbox[IN.focus]), { padding: PAD(), maxZoom: LAND_Z }),
  ortho: () => S.A.cameraForBounds(box2(OB), { padding: PAD() }),
  parcel: () => { const p = S.geo.features[IN.focus].properties; return { center: maplibregl.LngLat.convert([p.cx, p.cy]), zoom: LAND_Z }; },
};
async function toCam(cam, animate, dur = D.dive) {
  const c = S.A.getCenter(), z = S.A.getZoom(), cc = maplibregl.LngLat.convert(cam.center);
  if (Math.abs(z - cam.zoom) < 0.05 && Math.abs(c.lng - cc.lng) < 1e-5 && Math.abs(c.lat - cc.lat) < 1e-5) return;
  if (!animate) { S.A.jumpTo(cam); return; }
  await fly(S.A, cam, dur);
}

/* ══ 9. S1 도착 — 남원 전역 정사영상 → 스윕(필지 폴리곤 청록 도착) → 한 필지로 하강 → 락온 → 숫자 현상 ══ */
async function arrive({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay(); endPeel();
  S.scene = 's1'; S.arrived = false; S.ready = false; S.sweepT0 = 0; S.sweepLo = 0; S.sweepLng = null;
  document.documentElement.dataset.scene = 's1';
  segCurrent();
  leaveS6();
  el.play.hidden = true;                                    // 재생은 S3 의 것 — S1 의 띠는 눈금만
  scopeResults(S.A, false);
  showResults(S.A, true);
  showFrame(S.A, false);
  epAll(S.A, false);
  el.locks.hidden = false;
  clearLocks();
  revealAll(S.A, 0);
  paintChg0();
  hudS1(false);
  S.perfReset();
  if (!animate) {
    S.A.jumpTo(CAM.land());
    revealAll(S.A, 1);
    for (const p of ['frame', 'sweep', 'dive', 'lock', 'count']) setPhase(p);
    lockAt(IN.focus);
    hudS1(true, false);
    setPhase('arrived'); S.arrived = true; S.ready = true; S.started = true;
    checkRange();
    return;
  }
  // ① 남원 전역 — 부팅이면 살짝 먼 자리에서 밀어 들어가고, 다른 장면에서 왔으면 그 자리에서 올라온다(끊김 없음)
  setPhase('frame');
  const city = CAM.city();
  if (!S.started) S.A.jumpTo({ center: city.center, zoom: city.zoom - 0.4 });
  S.started = true;
  checkRange();
  await fly(S.A, city, D.frame);
  if (id !== run) return;
  // 도시 정사영상이 선 뒤에 스윕한다 — 흰 바탕 위에 점이 떨어지는 장면을 만들지 않는다
  if (!S.A.areTilesLoaded()) await either(idleOf(S.A), D.frame);
  await gate('sweep');
  if (id !== run) return;
  // ② 스캔 스윕 1.0s — 선이 지나간 자리에만 필지 폴리곤이 청록으로 도착한다.
  //    스윕이 도는 동안 하강 경로 · 착지 화면의 타일(도시 z12–15 · 드론 2025.10 z12–19)을 받아 디코드해 둔다.
  setPhase('sweep');
  const warm = prewarm(landTiles());
  S.sweepT0 = performance.now(); S.sweepEmitted = false;
  el.sweep.classList.add('is-on');
  await once(bus, 'sweepline');
  if (id !== run) return;
  await either(warm, D.frame);                              // 보통은 스윕보다 먼저 끝난다
  if (id !== run) return;
  el.sweep.classList.remove('is-on');
  await gate('dive');
  if (id !== run) return;
  // ③ 한 필지로 하강 1250 — 드론 정사영상(1–2 cm) 범위 안에 온전히 들어온 판독 필지
  setPhase('dive');
  el.status.textContent = '판독 결과 도착 · 필지 하나로 하강';
  await fly(S.A, CAM.land(), D.descend);
  if (id !== run) return;
  // ④ 락온 380
  setPhase('lock');
  const box = lockAt(IN.focus);
  await either(once(box, 'spk-locked'), D.lock + D.tin);
  if (id !== run) return;
  // ⑤ 숫자 현상 — 글자별 40ms · 해설 줄 텍스트 인 60 스태거. 마지막 글자의 animationend 가 곧 도착
  setPhase('count');
  hudS1(true, true);
  await Promise.all([...el.big.getAnimations({ subtree: true }), ...el.note.getAnimations({ subtree: true })].map((a) => a.finished.catch(() => {})));
  if (id !== run) return;
  setPhase('arrived'); S.arrived = true; S.ready = true;
  releaseBitmaps();
  prewarmNext();
}
/** 하강 경로 + 착지 화면의 타일 — 도시 바탕(z12–15)과 착지 시점 드론 층(z12–19). */
function landTiles() {
  const W = el.stage.clientWidth, H = el.stage.clientHeight, a = { center: S.A.getCenter(), zoom: S.A.getZoom() }, b = CAM.land();
  const ep = EP[Math.round(S.e)];
  return [...new Set([...tilesAlong(CITY, a, b, W, H), ...tilesAlong(ep, a, b, W, H), ...tilesFor(ep, b, [18, 19], W, H)])];
}
/** S1 이 끝나 쉬는 동안 — S3 화면(4층) · S6 착지(보이는 시점) 타일을 받아 두고, B 를 착지 카메라에 세워 둔다. */
function prewarmNext() {
  const W = el.stage.clientWidth, H = el.stage.clientHeight, o = CAM.ortho(), z = Math.round(o.zoom + 1);
  (window.requestIdleCallback || requestAnimationFrame)(() => {
    if (!S.arrived) return;
    prewarm(EP.flatMap((im) => tilesFor(im, o, [z - 1, z], W, H))).then(() => { if (!S.B && !S.bBoot) ensureB(); });
  });
}
/** 스윕 한 프레임 — 선 위치 + 지나간 필지 현상(0 → 1, 500ms · 4단 양자화로 feature-state 호출을 줄인다). */
function sweepFrame(now) {
  if (!S.sweepT0) return;
  const W = BB[0], E = BB[2], span = E - W;
  const p = Math.min(1, (now - S.sweepT0) / D.sweep);
  S.sweepLng = W + span * p;
  const x = S.A.project([S.sweepLng, (BB[1] + BB[3]) / 2]).x;
  el.sweep.style.transform = `translateX(${(x - 9).toFixed(1)}px)`;
  const ord = S.order;
  let lo = S.sweepLo || 0, allDone = true;
  for (let n = lo; n < ord.length; n++) {
    const i = ord[n], ti = S.sweepT0 + ((S.cx[i] - W) / span) * D.sweep;
    if (ti > now) { allDone = false; break; }
    const a = Math.min(1, (now - ti) / D.fade), q = a >= 1 ? 1 : Math.ceil(a * 4) / 4;
    if (S.level[i] !== q) { S.level[i] = q; S.A.setFeatureState({ source: 'r', id: i }, { a: q }); S.A.setFeatureState({ source: 'r-pt', id: i }, { a: q }); }
    if (q === 1 && n === lo) lo = n + 1;
    if (q < 1) allDone = false;
  }
  S.sweepLo = lo;
  if (p >= 1 && !S.sweepEmitted) { S.sweepEmitted = true; bus.dispatchEvent(new Event('sweepline')); }
  if (allDone && lo >= ord.length) { S.sweepT0 = 0; S.sweepLo = 0; }
}
function paintChg0() { for (const m of [S.A, S.B]) if (m?.getLayer('spk-chg')) m.setPaintProperty('spk-chg', 'line-opacity', 0); }

/* ══ 10. S3 · S6 — 같은 카메라가 이어진다 ═══════════════════════════════════ */
function finishS1Instant() {
  // 장면을 URL 로 바로 열었거나 도착 도중 넘어왔을 때 — S1 은 끝난 상태로(결과 전부 · 필지 락온 1)
  S.sweepT0 = 0; el.sweep.classList.remove('is-on');
  revealAll(S.A, 1); S.arrived = true; S.started = true;
  if (!locks.some((L) => L.i === IN.focus)) lockAt(IN.focus);
  if (!S.phases.includes('arrived')) setPhase('arrived');
}
async function enterS3({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay(); endPeel();
  if (!S.arrived) finishS1Instant();
  S.scene = 's3'; S.ready = false;
  document.documentElement.dataset.scene = 's3';
  segCurrent(); leaveS6();
  showResults(S.A, true); el.locks.hidden = false;
  scopeResults(S.A, true);
  S.perfReset();
  setEpoch(S.e);
  hudEpoch(true);
  // 필지에서 정사영상 4시점 범위로 한 걸음 물러선다 — 락온 브래킷은 그 필지에 붙은 채 따라온다
  await toCam(CAM.ortho(), animate);
  if (id !== run) return;
  el.play.hidden = false;                                   // 재생은 카메라가 정사영상 위에 섰을 때 나타난다
  epAll(S.A, true);                                         // 4층을 모두 켜 둔다(미리 받은 비트맵 — 재생 · 스크럽이 콜드 타일을 만나지 않게)
  placeLocks(); checkRange();
  S.ready = true;
  // 범위 틀은 영상이 다 깔린 뒤에만
  idleOf(S.A).then(() => { if (id === run && S.scene === 's3') showFrame(S.A, true); });
}
/** S6 의 두 번째 지도(결과 겹침). S1 이 끝나 쉬는 동안 S6 착지 카메라(필지 · z18)에 미리 세워 타일까지 받아 두고,
    S6 전까지는 그 자리에 세워 둔 채 숨긴다(A 를 따라다니지 않는다 — 착지 타일이 캐시에서 밀려나지 않게). */
async function ensureB() {
  if (S.B) return S.B;
  S.bBoot = S.bBoot || (async () => {
    el.b.style.visibility = 'hidden'; el.b.hidden = false;
    const cam = CAM.parcel();
    const B = await createMap(el.b, { center: cam.center.toArray(), zoom: cam.zoom, label: '지도 B — AI 판독 겹침(오른쪽)' });
    B.getCanvas().setAttribute('tabindex', '-1');
    decorate(B, { results: true });
    scopeResults(B, true);
    revealAll(B, 1);
    paintEpoch(B, S.e);
    await either(idleOf(B), D.frame);
    S.B = B;
    if (S.scene !== 's6') el.b.hidden = true;
    return B;
  })();
  return S.bBoot;
}
async function enterS6({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay(); endPeel();
  if (!S.arrived) finishS1Instant();
  S.scene = 's6'; S.ready = false;
  document.documentElement.dataset.scene = 's6';
  segCurrent();
  el.play.hidden = true;                                    // 재생(유휴)은 S3 에만 — 화면당 1개
  el.chg.hidden = true; paintChg0();
  showResults(S.A, true); el.locks.hidden = false;
  scopeResults(S.A, true);
  S.perfReset();
  hudSwipe(true);
  epAll(S.A, false);                                        // 하강 동안은 보이는 시점 층만
  // B(결과 겹침)는 이미 착지 카메라에 서 있다(prewarmNext) — 카메라가 내려가는 동안 A 를 따라다니지 않는다
  const bReady = ensureB();
  await toCam(CAM.parcel(), animate);
  if (id !== run) return;
  S.marks.push(['s6-land', Math.round(performance.now())]);
  const B = await bReady;
  if (id !== run) return;
  el.b.style.visibility = 'hidden'; el.b.hidden = false; B.resize();
  B.jumpTo({ center: S.A.getCenter(), zoom: S.A.getZoom() });
  scopeResults(B, true); paintEpoch(B, S.e);
  // B 한 장이 그려질 때까지만(상한 D.reveal) — 타일 적재(idle)는 선 진입과 나란히 기다린다
  await either(new Promise((res) => { B.once('render', res); B.triggerRepaint(); }), D.reveal);
  if (id !== run) return;
  const bIdle = B.loaded() && B.areTilesLoaded() ? null : either(idleOf(B), D.frame);
  // 이음매 없이 — B 가 화면 전체를 덮은 상태(= 지금 A 와 같은 그림)로 드러나고, 선이 왼쪽에서 들어와 결과를 벗긴다
  el.stage.style.setProperty('--swipe', animate ? '0%' : S.swipe + '%');
  el.b.style.visibility = '';
  el.locks.hidden = true;
  showResults(S.A, false);                                  // 왼쪽 = 원본(결과 없음) · 오른쪽 = 원본 + 결과(청록)
  el.swipe.hidden = false;
  setEpoch(S.e);
  checkRange();
  if (animate) { await Promise.all([peel(S.swipe), bIdle]); if (id !== run) return; }
  else if (bIdle) { await bIdle; if (id !== run) return; }
  setSwipe(S.swipe);
  showFrame(S.A, true); showFrame(B, true);
  S.ready = true;
}
function leaveS6() {
  endPeel();
  el.swipe.hidden = true;
  if (S.B) {
    el.b.hidden = true; el.b.style.visibility = 'hidden';
    if (S.geo) S.B.jumpTo(CAM.parcel());                    // 다음 S6 착지 자리로 되돌려 세워 둔다
  }
  showResults(S.A, true);
}
/** 가르는 선 진입 — 0 % → 목표, 1000ms 한 이징(rAF tick 이 그린다). */
const PEEL = { t0: 0, to: 50 };
function peel(to) { PEEL.t0 = performance.now(); PEEL.to = to; S.marks.push(['s6-peel', Math.round(PEEL.t0)]); return once(bus, 'peeled'); }
function endPeel() { if (PEEL.t0) { PEEL.t0 = 0; bus.dispatchEvent(new Event('peeled')); } }
function peelFrame(now) {
  if (!PEEL.t0) return;
  const p = Math.min(1, (now - PEEL.t0) / D.peel);
  el.stage.style.setProperty('--swipe', (PEEL.to * EASE(p)).toFixed(2) + '%');
  if (p >= 1) endPeel();
}
function setSwipe(pct, { url = 'now' } = {}) {
  S.swipe = Math.max(6, Math.min(94, Math.round(pct * 10) / 10));
  if (!PEEL.t0) el.stage.style.setProperty('--swipe', S.swipe + '%');
  el.grip.setAttribute('aria-valuenow', String(Math.round(S.swipe)));
  el.grip.setAttribute('aria-valuetext', `왼쪽 원본 ${Math.round(S.swipe)} % · 오른쪽 AI 판독 ${100 - Math.round(S.swipe)} %`);
  if (S.scene === 's6') { if (url === 'now') writeURL(); else if (url === 'later') { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, D.debounce); } }
}

/* 스크러버 띠의 세 상태.
   S1 = 조용히(눈금만 · 손잡이·재생 없음 · 조작 불가) — 결손 안내 없음.
   S3 · S6 = 카메라가 정사영상 범위 안이면 조작 가능, 밖(또는 z < 12)이면 끄고 점선 무채 + 이유 한 줄(브리프 S3 §5). */
function checkRange() {
  const m = S.A; if (!m) return;
  const ortho = S.scene === 's3' || S.scene === 's6';
  const b = m.getBounds(), z = m.getZoom();
  const hit = !(b.getEast() < OB[0] || b.getWest() > OB[2] || b.getNorth() < OB[1] || b.getSouth() > OB[3]);
  const out = ortho && (z < EP[0].minzoom || !hit);
  const off = !ortho || out;
  S.off = off;
  el.range.disabled = off; el.play.disabled = off;
  el.scrub.dataset.quiet = ortho ? '0' : '1';
  el.scrub.dataset.off = out ? '1' : '0';
  el.void.hidden = !out;
  if (out) el.void.textContent = `이 자리엔 정사영상이 없습니다 — 남원 농경지 ${OB_KM2} km² 만 4시점`;
  if (off) stopPlay();
}

/* ══ 11. S3 재생 — 화면 유휴 1개 · 6s 주기 · 정수 시점마다 750ms 정지 ═════════
   시간표(타임라인)로 돈다: 위치 = f(경과 시간). 프레임이 늦게 와도 정지 길이 · 주기가 밀리지 않는다. */
const SEG = D.stop + D.hop;                                  // 시점 k 정지 시작 = k × SEG
const P = { t0: 0, k: -1, stopSeen: 0 };
function posAt(t) {
  const k = Math.min(3, Math.floor(t / SEG)), r = t - k * SEG;
  if (r < D.stop || k >= 3) return { e: k, stop: true };
  return { e: k + (r - D.stop) / D.hop, stop: false };
}
function startPlay() {
  if (S.off || S.scene !== 's3') return;
  S.playing = true; el.play.setAttribute('aria-pressed', 'true'); el.play.setAttribute('aria-label', '시점 재생 정지');
  // 첫 홉은 4층 타일이 모두 선 뒤(idle)에 — 재생 도중 콜드 타일 적재 · 디코드로 프레임이 멈추지 않게
  const token = P.token = (P.token || 0) + 1;
  P.t0 = 0; P.k = -1;
  epAll(S.A, true);
  const go = () => {
    if (!S.playing || P.token !== token) return;
    S.perfReset();
    const k = Math.floor(S.e + 1e-6), f = S.e - k;
    const off = f < 0.005 ? k * SEG : k * SEG + D.stop + f * D.hop;
    P.t0 = performance.now() - off; P.k = -1;
    playFrame(performance.now());
  };
  if (S.A.loaded() && S.A.areTilesLoaded()) go(); else idleOf(S.A).then(go);
}
function stopPlay() {
  if (!S.playing) return;
  S.playing = false; S.paused = false; P.k = -1;
  el.play.setAttribute('aria-pressed', 'false'); el.play.setAttribute('aria-label', '시점 재생');
  writeURL();
}
function playFrame(now) {
  if (!S.playing || !P.t0) return;
  const t = (now - P.t0) % CYCLE, q = posAt(t);
  if (q.stop) {
    if (P.k !== q.e) {
      if (P.k >= 0) closeStop(now);
      P.k = q.e; P.stopSeen = now; S.paused = true;
      setEpoch(q.e, { url: 'now' });
    }
    return;
  }
  if (P.k >= 0) closeStop(now);
  S.paused = false;
  setEpoch(q.e, { url: 'none' });
}
/** 정지 기록 — ms = 시간표상 정지 길이(엔진이 지키는 값) · seen = 실제 화면에 머문 시간(프레임 해상도) */
function closeStop(now) {
  S.stops.push({ e: P.k, ms: D.stop, seen: Math.round(now - P.stopSeen) });
  if (S.stops.length > 24) S.stops.shift();
  P.k = -1;
}

/* ══ 12. 한 박자 — rAF 하나가 스윕 · 재생 · 가르는 선 · 프레임 간격 · 카메라 기록을 모두 돈다 ═════ */
S.perfReset = () => { S.frames = []; };
S.cam = [];
function tick(now) {
  if (S.lastT) { S.frames.push(now - S.lastT); if (S.frames.length > 1200) S.frames.shift(); }
  S.lastT = now;
  if (S.A) {
    sweepFrame(now); playFrame(now); peelFrame(now);
    if (S.A.isMoving()) { S.cam.push([Math.round(now), +S.A.getZoom().toFixed(4), S.scene, S.phase, ...S.A.getCenter().toArray().map((v) => +v.toFixed(6))]); if (S.cam.length > 900) S.cam.shift(); }
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function perf() {
  const a = [...S.frames].sort((x, y) => x - y);
  const p95 = a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0;
  return { p95: +p95.toFixed(2), max: +(a[a.length - 1] || 0).toFixed(2), n: a.length, canvases: document.querySelectorAll('canvas').length };
}

/* ══ 13. 조작 ═════════════════════════════════════════════════════════════ */
function segCurrent() { el.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.scene === S.scene))); }
const play = (scene) => {
  const p = scene === 's3' ? enterS3() : scene === 's6' ? enterS6() : arrive();
  if (scene === 's1') { S.scene = 's1'; writeURL(); }
  return p.then(() => { if (scene !== 's1') writeURL(); });
};
el.seg.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-scene]'); if (b) play(b.dataset.scene); });
el.replay.addEventListener('click', () => play('s1'));
el.play.addEventListener('click', () => (S.playing ? stopPlay() : startPlay()));
el.range.addEventListener('pointerdown', () => stopPlay());
el.range.addEventListener('input', () => { stopPlay(); setEpoch(parseFloat(el.range.value), { url: 'later', from: 'range' }); });
el.range.addEventListener('keydown', (ev) => {
  const step = { ArrowLeft: -0.25, ArrowDown: -0.25, ArrowRight: 0.25, ArrowUp: 0.25 }[ev.key];
  if (step == null && ev.key !== 'Home' && ev.key !== 'End') return;
  ev.preventDefault(); stopPlay();
  setEpoch(ev.key === 'Home' ? 0 : ev.key === 'End' ? 3 : S.e + step, { url: 'now' });
});
// 스와이프 손잡이 — 끌기 · ←/→ ±4 %
let drag = false;
const pctAt = (x) => { const r = el.stage.getBoundingClientRect(); return ((x - r.left) / r.width) * 100; };
el.grip.addEventListener('pointerdown', (ev) => { drag = true; el.grip.setPointerCapture(ev.pointerId); ev.preventDefault(); });
el.grip.addEventListener('pointermove', (ev) => { if (drag) setSwipe(pctAt(ev.clientX), { url: 'later' }); });
const endDrag = () => { if (drag) { drag = false; writeURL(); } };
el.grip.addEventListener('pointerup', endDrag); el.grip.addEventListener('pointercancel', endDrag);
el.grip.addEventListener('keydown', (ev) => {
  const d = { ArrowLeft: -4, ArrowRight: 4, ArrowDown: -4, ArrowUp: 4 }[ev.key];
  if (d == null && ev.key !== 'Home' && ev.key !== 'End') return;
  ev.preventDefault(); setSwipe(ev.key === 'Home' ? 6 : ev.key === 'End' ? 94 : S.swipe + d);
});

/* ══ 14. 부팅 ═════════════════════════════════════════════════════════════ */
const IN = { n: 0, cls: {} };
function ticks() {
  el.ticks.innerHTML = EP.map((im, k) => `<li style="left:calc(6px + (100% - 12px) * ${k} / 3)" data-on="0"><b class="n">${lab(im)}</b><br><span class="n">${gsd(im)}</span> cm</li>`).join('');
}
async function boot() {
  ticks();
  const [geo, emd, chg] = await Promise.all([
    fetch(ROOT + R.geojson).then((r) => r.json()),
    fetch(ROOT + 'assets/data/geo/namwon-emd.geojson').then((r) => r.json()),
    fetch(ROOT + CHANGE[0].polygons).then((r) => r.json()),
  ]);
  // 피처마다 중심 경도 cx · 위도 cy · bbox — 스윕 · 락온이 읽는다
  S.cx = new Float64Array(geo.features.length); S.level = new Float32Array(geo.features.length); S.bbox = [];
  const clip = [];
  geo.features.forEach((f, i) => {
    f.id = i;
    const c = centroid(f); f.properties.cx = c[0]; f.properties.cy = c[1]; S.cx[i] = c[0];
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    const eat = (q) => { if (typeof q[0] === 'number') b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; else q.forEach(eat); };
    eat(f.geometry.coordinates); S.bbox[i] = b;
    f.properties.inOb = b[2] > OB[0] && b[0] < OB[2] && b[3] > OB[1] && b[1] < OB[3];
    f.properties.inside = b[0] >= OB[0] && b[2] <= OB[2] && b[1] >= OB[1] && b[3] <= OB[3];
    if (f.properties.inOb) {
      IN.n++; IN.cls[f.properties.cls] = (IN.cls[f.properties.cls] || 0) + 1;
      if (f.properties.inside && (IN.focus == null || f.properties.area > geo.features[IN.focus].properties.area)) IN.focus = i;
      else if (!f.properties.inside) { const g = clipRect(f.geometry, OB); if (g) clip.push({ type: 'Feature', properties: { cls: f.properties.cls, src: i }, geometry: g }); }
    }
  });
  S.clip = { type: 'FeatureCollection', features: clip };
  IN.clipped = clip.length;
  S.order = geo.features.map((_, i) => i).sort((a, b) => S.cx[a] - S.cx[b]);
  S.geo = geo;
  S.pts = { type: 'FeatureCollection', features: geo.features.map((f, i) => ({ type: 'Feature', id: i, properties: { cls: f.properties.cls }, geometry: { type: 'Point', coordinates: [f.properties.cx, f.properties.cy] } })) };
  S.emd = emd;
  S.chg = chg;

  el.a.style.visibility = 'hidden';                        // createMap 의 기본 어두운 바탕 한 장면을 보이지 않는다
  const A = await createMap(el.a, { center: [(BB[0] + BB[2]) / 2, (BB[1] + BB[3]) / 2], zoom: 11.2, label: '지도 — 남원 판독 결과 · 화살표 키로 이동, +/- 로 확대·축소' });
  S.A = A;
  decorate(A, { results: true });
  revealAll(A, 0);
  await new Promise((res) => A.once('render', res));
  el.a.style.visibility = '';
  A.on('move', () => {
    // 장면 전환(ready=false) 중 애니메이션 없이 카메라가 옮겨진 횟수 = 순간이동. 이음매 없는 한 장면이면 0.
    if (S.started && !S.ready && !A.isEasing()) S.jumps++;
    placeLocks();
    if (S.B && !el.b.hidden) S.B.jumpTo({ center: A.getCenter(), zoom: A.getZoom() });
  });
  A.on('moveend', checkRange);
  A.on('zoomend', checkRange);
  A.on('click', (ev) => {
    if (S.scene === 's6') return;
    const q = A.queryRenderedFeatures([[ev.point.x - 8, ev.point.y - 8], [ev.point.x + 8, ev.point.y + 8]], { layers: R_LAYERS.filter((l) => A.getLayer(l)) });
    if (!q.length) return;
    let best = q[0], bd = Infinity;
    for (const f of q) { const p = S.geo.features[f.id]?.properties; if (!p) continue; const s = A.project([p.cx, p.cy]); const d = Math.hypot(s.x - ev.point.x, s.y - ev.point.y); if (d < bd) { bd = d; best = f; } }
    if (best.id != null) lockAt(best.id);
  });
  window.addEventListener('resize', () => { placeLocks(); checkRange(); });

  // URL 복원 — ?scene=s3&epoch=1.5 · ?scene=s6&swipe=42
  const q = new URLSearchParams(location.search);
  const ep = parseFloat(q.get('epoch')); if (isFinite(ep)) S.e = Math.max(0, Math.min(3, ep));
  const sw = parseFloat(q.get('swipe')); if (isFinite(sw)) S.swipe = Math.max(6, Math.min(94, sw));
  setSwipe(S.swipe, { url: 'none' });
  const scene = q.get('scene');
  setEpoch(S.e, { url: 'none' });
  checkRange();
  if (scene === 's3') { finishS1Instant(); hudS1(true, false); await enterS3({ animate: false }); }
  else if (scene === 's6') { finishS1Instant(); await enterS6({ animate: false }); }
  else await arrive();
}

/* ══ 15. 테스트 훅 ═══════════════════════════════════════════════════════ */
window.__spike = {
  state: () => {
    const L = epochLayers(S.e);
    return { scene: S.scene, phase: S.phase, phases: [...S.phases], started: S.started, arrived: S.arrived, ready: S.ready,
      epoch: S.e, layers: { a: L.a, b: L.b, opA: L.opA, opB: L.opB }, playing: S.playing, paused: S.paused, stops: [...S.stops],
      swipe: S.swipe, off: S.off, locks: locks.length, lockIds: locks.map((L) => L.i), jumps: S.jumps, cycle: CYCLE, hold: document.documentElement.dataset.hold || '',
      idle: !!S.A && S.A.loaded() && S.A.areTilesLoaded() && !S.A.isMoving() && (!S.B || el.b.hidden || (S.B.loaded() && S.B.areTilesLoaded() && !S.B.isMoving())),
      centers: [S.A?.getCenter().toArray(), S.B && !el.b.hidden ? S.B.getCenter().toArray() : null] };
  },
  perf,
  play,
  setEpoch: (e) => setEpoch(e, { url: 'now' }),
  setSwipe: (p) => setSwipe(p, { url: 'now' }),
  /** 테스트용 — 판 밖에 보이는 필지 하나의 화면 좌표(페이지 기준). */
  sample: () => {
    const r = el.stage.getBoundingClientRect(), vis = [];
    for (let i = 0; i < S.geo.features.length; i++) {
      const p = S.geo.features[i].properties, s = S.A.project([p.cx, p.cy]);
      if (s.x < 460 || s.y < 40 || s.x > r.width - 300 || s.y > r.height - 160) continue;
      if (locks.some((L) => L.i === i)) continue;
      vis.push({ i, x: r.left + s.x, y: r.top + s.y, area: p.area });
    }
    vis.sort((a, b) => b.area - a.area);
    return vis[0] || null;
  },
  jump: (center, zoom) => S.A.jumpTo({ center, zoom }),
  /** 사건 기반 대기 — 보이는 지도(A · 드러난 B)가 모두 MapLibre 'idle'(타일 적재 + 페이드 + 카메라 정지). */
  whenIdle: () => Promise.all([S.A, S.B && !el.b.hidden ? S.B : null].filter(Boolean).map(idleOf)).then(() => true),
  /** window.__spikeHold 로 멈춘 단계를 놓는다. */
  release: () => { const r = S.release; S.release = null; if (r) r(); return !!r; },
  /** 카메라 기록 — 움직이는 프레임마다 [t, zoom, phase] · 단계 표식 [phase, t] */
  camLog: () => [...S.cam],
  camReset: () => { S.cam.length = 0; S.jumps = 0; },
  marks: () => [...S.marks],
  focus: () => IN.focus,
  /** 테스트용 — 타일 요청 기록([원천, 단계, 미리 받음?, 지연 ms, 장면]) · 미리 받기 결과 · 잘린 필지 수 */
  tiles: () => ({ log: TSTAT.log.map((r) => [...r]), warm: { ...WARM }, clipped: IN.clipped }),
  tilesReset: () => { TSTAT.log.length = 0; },
  /** 테스트용 — 지금 보이는(현상된) 필지가 모두 스윕 선 뒤쪽(서쪽)에 있는가. */
  audit: () => {
    let shown = 0, hidden = 0, ahead = 0;
    for (let i = 0; i < S.geo.features.length; i++) {
      const a = S.A.getFeatureState({ source: 'r-pt', id: i })?.a || 0;
      if (a > 0) { shown++; if (S.cx[i] > (S.sweepLng ?? -Infinity) + 1e-9) ahead++; } else hidden++;
    }
    return { shown, hidden, ahead, sweepLng: S.sweepLng ?? null };
  },
  get map() { return S.A; },
};
boot().catch((err) => { console.error('spike boot', err); });
