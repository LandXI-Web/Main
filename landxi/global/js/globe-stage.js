/* GLOBE-STAGE — 같은 지도 한 장(페이지 이동 0) · 순백 글로브 · GIBS 어제 · LX 사업국 36 채색 · 우 목록 · 상단 날짜 스크러버.
   + F1-A fx(landxi/xi/fx) 도착 전까지 쓰는 자기 최소 부품: 카메라 이징 · 락온 · 스윕 · 스와이프 · 프로비넌스 · 지명 핀.
   인터페이스는 system-v2 §5 이름을 따른다(arrive/timescrub/swipe/prov) — F1-A 도착 후 import 교체. */
import { assertEnvelope, yesterdayUTC } from '/landxi/shared/api-v1.js';
import { t, num, basisLabel } from './i18n.js';

/* ── 모션 사다리(system-v2 §3) ─────────────────────────────────────── */
export const D = { 40: 40, 60: 60, 80: 80, 120: 120, 180: 180, 380: 380, 500: 500, 750: 750, 1000: 1000, 1250: 1250, 1600: 1600, 2400: 2400 };
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u, dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => { let u = x; for (let i = 0; i < 8; i++) { const e = sx(u) - x, d = dx(u); if (Math.abs(e) < 1e-6 || !d) break; u -= e / d; } return sy(Math.min(1, Math.max(0, u))); };
}
export const EASE = { cam: bezier(0.16, 1, 0.3, 1), ui: bezier(0.22, 1, 0.36, 1), arrive: bezier(0.15, 1, 0.3, 1) };
/** 스태거도 사다리 값만(motion-law) */
export const STAGGER = [0, 40, 60, 80, 120, 180, 380, 500, 750, 1000, 1250];
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── 지도 ──────────────────────────────────────────────────────────── */
const ML = () => window.maplibregl;
let pmReady = false;
/* ── 메모리 타일 캐시(lxm://) — no-store·휴리스틱 캐시 원천(GIBS · V-World)을 이 페이지 메모리에 둔다.
   판정 2차 불합격(부트 가림막 15.5 s): 숨은 점프 데우기(warmInMap) 대신 fetch 로 미리 받아 두고 지도는 그 바이트를 쓴다.
   → 본 지도는 남원에 머문 채 'Pre-fetching imagery n/m' 로 정직하게 받는다. */
const MEM = new Map(), MEM_MAX = 6000;
export const mem = (u) => String(u).replace(/^https:\/\//, 'lxm://');
function memGet(u) {   // u = https URL · 진행 중 공유 · 실패는 null(다음 요청 때 다시)
  let p = MEM.get(u);
  if (p) { MEM.delete(u); MEM.set(u, p); return p; }   // LRU 갱신
  p = fetch(u, { mode: 'cors', credentials: 'omit' }).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
  MEM.set(u, p);
  p.then((b) => { if (!b) MEM.delete(u); });
  if (MEM.size > MEM_MAX) MEM.delete(MEM.keys().next().value);
  return p;
}
let memReady = false;
function ensureMem() {
  if (memReady) return;
  ML().addProtocol('lxm', async (params) => {
    const b = await memGet(params.url.replace(/^lxm:\/\//, 'https://'));
    if (!b) throw new Error('tile unavailable');   // 지도 error 이벤트(stage.errors) — 콘솔 오류 아님
    return { data: b.slice(0) };
  });
  memReady = true;
}
function ensurePmtiles() {
  if (pmReady || !window.pmtiles) return;
  const p = new window.pmtiles.Protocol();
  ML().addProtocol('pmtiles', p.tile);
  pmReady = true;
}

export function baseStyle() {
  return {
    version: 8,
    projection: { type: 'globe' },
    sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.3, 7, 0] },   // 대기 테두리만(안개 없음 — 기울인 화면을 흐리지 않게)
    transition: { duration: 0, delay: 0 },   // system-v2 §3: 스타일 기본 전이 300 → 0
    sources: {},
    // 글로브(≤4.5)는 순백 · 영상 무대(≥5.5)는 흙빛 무채 — 급한 줌아웃에서 타일이 늦게 와도 흰 구멍이 번쩍이지 않게
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': ['interpolate', ['linear'], ['zoom'], 4.5, '#FFFFFF', 5.5, '#6F6A5E'] } }],
  };
}

export function createStage(root, { center = [100, 32], zoom = 1.7 } = {}) {
  ensurePmtiles(); ensureMem();
  // 캐시에 미리 받은 타일을 한꺼번에 올리도록 동시 이미지 요청 16 → 24(HTTP/2 원천 · 디스크 캐시 적중이 대부분)
  if (ML().setMaxParallelImageRequests) ML().setMaxParallelImageRequests(24);
  const el = root.querySelector('#map');
  const map = new (ML().Map)({ container: el, style: baseStyle(), center, zoom, attributionControl: false, maxPitch: 60,
    renderWorldCopies: false, canvasContextAttributes: { antialias: true },
    maxTileCacheZoomLevels: 24 });   // 부트에서 데운 후퇴·하강 경로 타일을 투어 끝까지 GPU 캐시에(≈ 35 장 × 24 줌 · 원천당)
  map.on('error', (e) => { stage.errors.push(String(e && e.error && e.error.message || e)); });   // 타일 오류는 화면 결손으로 · 콘솔 오류 0
  const stage = { root, map, mapB: null, errors: [], pins: [], locks: [], perf: [], onMove: new Set() };
  map.on('move', () => stage.onMove.forEach((f) => f()));
  // MapLibre 5.6 globe: 줌 점프 뒤 타일이 도착해도 다시 그리지 않는 경우가 있다(실측) → 타일 도착 이벤트에 묶어 다시 그림(데이터 이벤트 = 모션 법 허용)
  let rp = 0; const repaint = () => { if (!rp) rp = requestAnimationFrame(() => { rp = 0; map.triggerRepaint(); }); };
  map.on('sourcedata', repaint); map.on('moveend', repaint);
  // rAF 프레임 시각 계측(p95 ≤ 20 ms 판정 · 봉투는 perf() 가 만든다)
  let last = performance.now();
  const tick = (now) => { stage.perf.push(now - last); if (stage.perf.length > 4000) stage.perf.shift(); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return stage;
}

/** 스와이프용 두 번째 지도(같은 카메라 · 입력 없음). 캔버스 ≤ 2. */
export function ensureMapB(stage) {
  if (stage.mapB) return stage.mapB;
  const el = stage.root.querySelector('#map-b');
  const m = stage.map;
  const b = new (ML().Map)({ container: el, style: baseStyle(), center: m.getCenter(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(),
    
    interactive: false, attributionControl: false, renderWorldCopies: false, maxPitch: 60 });
  b.on('error', (e) => { stage.errors.push('B ' + String(e && e.error && e.error.message || e)); });
  b.on('sourcedata', () => requestAnimationFrame(() => b.triggerRepaint()));
  const sync = () => !stage.bHold && b.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), pitch: m.getPitch(), bearing: m.getBearing(), padding: m.getPadding() });
  stage.onMove.add(sync);
  stage.mapB = b;
  stage.mapBReady = new Promise((r) => b.once('load', r));   // isStyleLoaded 는 소스 로딩 중 false → once('load') 재대기 금지
  return b;
}

export const styleReady = (map) => new Promise((r) => (map.isStyleLoaded() ? r() : map.once('load', r)));
export const idle = (map, max = 6000) => new Promise((r) => { let done = false; const f = () => { if (!done) { done = true; r(); } }; if (map.loaded() && map.areTilesLoaded()) return f(); map.once('idle', f); setTimeout(f, max); });

/** 카메라 이동 — 점프 없음 · 해상도 공간 이징(--e-cam) · 1600/2400 만. reduced-motion = jumpTo. */
export function fly(map, cam, dur = D[2400]) {
  return new Promise((res) => {
    if (reduced()) { map.jumpTo(cam); return res(); }
    map.flyTo({ ...cam, duration: dur, easing: EASE.cam, essential: true, curve: cam.curve ?? 1.42 });
    map.once('moveend', () => res());   // flyTo 뒤에 건다 — 앞 이동을 끊을 때 나는 moveend 를 제 끝으로 오인하지 않게
  });
}
export function ease(map, cam, dur = D[1600]) {
  return new Promise((res) => {
    if (reduced()) { map.jumpTo(cam); return res(); }
    map.easeTo({ ...cam, duration: dur, easing: EASE.cam, essential: true });
    map.once('moveend', () => res());
  });
}

/* ── 선명한 하강(판정 1차 불합격 · 하강 뭉개짐) ────────────────────────
   카메라 줌보다 2단계 이상 낮은 타일이 500 ms 넘게 보이는 프레임 0 을 목표로:
   ① flyTo 궤적(van Wijk · MapLibre 와 같은 식)을 표본해 각 래스터 소스가 그 카메라에서 요청할 타일을 HTTP 캐시로 미리 받는다
      (EOX max-age 7d · PC 3600 · V-World Last-Modified — 캐시 가능한 원천만 · GIBS 는 no-store 라 ② 로).
   ② no-store 원천(GIBS)은 가림막 뒤에서 목표 카메라로 잠깐 점프해 지도 자체 타일 캐시에 올린다(부트 때 한 번).
   ③ 비행이 끝나도 목표 타일 idle 전에는 카드·HUD 를 올리지 않는다(boot.go). */
const merc = ([lng, lat]) => { const s = Math.sin((Math.max(-85.05, Math.min(85.05, lat)) * Math.PI) / 180); return [(lng + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]; };

/** 카메라 궤적 표본 — [{zoom, c:[mx,my], pitch, padding}] · mode fly = MapLibre camera.flyTo 와 같은 rho 곡선 · ease = 선형 보간(easeTo).
    from 을 주면 지금 카메라 대신 그 카메라에서 출발(투어가 다음 하강을 미리 받을 때). */
export function flySamples(map, to, { n = 28, rho = 1.42, easing = EASE.cam, mode = 'fly', from = null } = {}) {
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight;
  const f = from || { center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: map.getPitch(), padding: map.getPadding() };
  const Z = { top: 0, right: 0, bottom: 0, left: 0 };
  const z0 = f.zoom, z1 = to.zoom ?? z0;
  const c0 = merc(Array.isArray(f.center) ? f.center : [f.center.lng, f.center.lat]), c1 = merc(to.center || f.center);
  const p0 = f.pitch || 0, p1 = to.pitch ?? p0;
  const pad0 = { ...Z, ...(f.padding || {}) }, pad1 = { ...Z, ...(to.padding || pad0) };
  const w0 = Math.max(W, H), w1 = w0 / 2 ** (z1 - z0);
  const u1 = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) * 512 * 2 ** z0;
  const r2 = rho * rho;
  const r = (i) => { const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * r2 * r2 * u1 * u1) / (2 * (i ? w1 : w0) * r2 * u1); return Math.log(Math.sqrt(b * b + 1) - b); };
  let w, u, S;
  if (mode === 'ease') { S = 1; u = (s) => s; w = (s) => 2 ** (-(z1 - z0) * s); }
  else if (u1 < 1e-6 || !isFinite(r(0)) || !isFinite(r(1))) {
    const k = w1 < w0 ? -1 : 1; S = Math.abs(Math.log(w1 / w0)) / rho || 1; u = (s) => (S ? s / S : 1); w = (s) => Math.exp(k * rho * s);
  } else {
    const r0 = r(0); S = (r(1) - r0) / rho; w = (s) => Math.cosh(r0) / Math.cosh(r0 + rho * s); u = (s) => (w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / r2)) / u1;
  }
  const out = [];
  for (let i = 0; i <= n; i++) {
    const k = easing(i / n), s = k * S, uu = i === n ? 1 : Math.min(1, Math.max(0, u(s)));
    const zoom = i === n ? z1 : z0 + Math.log2(1 / w(s));
    const lerp = (a, b) => a + (b - a) * k;
    out.push({ zoom, c: [c0[0] + (c1[0] - c0[0]) * uu, c0[1] + (c1[1] - c0[1]) * uu], pitch: lerp(p0, p1),
      padding: { top: lerp(pad0.top, pad1.top), right: lerp(pad0.right, pad1.right), bottom: lerp(pad0.bottom, pad1.bottom), left: lerp(pad0.left, pad1.left) }, W, H });
  }
  return out;
}
/** 궤적 표본 → jumpTo 카메라. */
export function camOf(s) {
  const lng = s.c[0] * 360 - 180, lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * s.c[1]))) * 180) / Math.PI;
  return { center: [lng, lat], zoom: s.zoom, pitch: s.pitch, bearing: 0, padding: s.padding };
}
/** 카메라 표본 → 원천 하나가 요청할 타일 {z,x,y}(raster roundZoom · tileSize 256 이면 +1 · 소스 bounds 안). */
export function coverTiles(cam, src) {
  const ts = src.tileSize || 512;
  const tz = Math.max(src.minzoom ?? 0, Math.min(src.maxzoom ?? 22, Math.round(cam.zoom + Math.log2(512 / ts))));
  const N = 2 ** tz, world = 512 * 2 ** cam.zoom;
  const pd = cam.padding || { top: 0, right: 0, bottom: 0, left: 0 };
  const cx = pd.left + (cam.W - pd.left - pd.right) / 2, cy = pd.top + (cam.H - pd.top - pd.bottom) / 2;
  const up = 1 + Math.min(1, (cam.pitch || 0) / 45) * 0.9;   // 기울면 윗변이 멀다
  const x0 = cam.c[0] + (-cx - 32) / world, x1 = cam.c[0] + (cam.W - cx + 32) / world;
  const y0 = cam.c[1] + (-cy * up - 32) / world, y1 = cam.c[1] + (cam.H - cy + 32) / world;
  let bx0 = 0, bx1 = 1, by0 = 0, by1 = 1;
  if (src.bounds) { const a = merc([src.bounds[0], src.bounds[3]]), b = merc([src.bounds[2], src.bounds[1]]); [bx0, by0, bx1, by1] = [a[0], a[1], b[0], b[1]]; }
  const X0 = Math.floor(Math.max(x0, bx0, 0) * N), X1 = Math.floor(Math.min(x1, bx1, 0.999999) * N);
  const Y0 = Math.floor(Math.max(y0, by0, 0) * N), Y1 = Math.floor(Math.min(y1, by1, 0.999999) * N);
  const out = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) out.push({ z: tz, x, y });
  return out;
}
const pulled = new Map();   // url → Promise<boolean>(진행 중 공유 · 멱등)
const cacheable = (u) => /^lxm:\/\//.test(u) || /^https:\/\/(tiles\.maps\.eox\.at|planetarycomputer\.microsoft\.com|xdworld\.vworld\.kr)\//.test(u);
/** 궤적(또는 도착 카메라)에서 원천들이 요청할 타일 URL. specs = [id | {id, from, final} | {src:{tiles,minzoom,maxzoom,bounds,tileSize}, final}] */
export function tilesFor(map, path, specs, { dwell = 1 } = {}) {
  const style = map.getStyle(), want = new Set();
  for (const spec of specs) {
    const s = typeof spec === 'string' ? { id: spec } : spec;
    const src = s.src || (s.id && style.sources[s.id]);
    if (!src || !src.tiles || !src.tiles[0]) continue;
    // dwell = 같은 타일 줌 표본 수 하한. 1(기본) = 경로의 모든 줌 — 중간 줌은 도착 직후 캐시→GPU 지연 동안의 조상 타일이 된다(3 으로 줄이면 1.0–1.5 s 뭉개짐 실측)
    const tzOf = (c) => Math.round(c.zoom + Math.log2(512 / (src.tileSize || 512)));
    const cnt = {}; path.forEach((c) => { cnt[tzOf(c)] = (cnt[tzOf(c)] || 0) + 1; });
    const cams = s.final ? [path[path.length - 1]] : path.filter((c, i) => c.zoom >= (s.from ?? 0) && c.zoom < (s.to ?? 99) && (cnt[tzOf(c)] >= dwell || i === path.length - 1));
    for (const cam of cams) for (const tl of coverTiles(cam, src)) {
      const u = src.tiles[0].replace('{z}', tl.z).replace('{x}', tl.x).replace('{y}', src.scheme === 'tms' ? 2 ** tl.z - 1 - tl.y : tl.y);
      if (cacheable(u)) want.add(u);
    }
  }
  return [...want];
}
/** URL 들을 HTTP 캐시로(MapLibre 와 같은 fetch 모드 · 캐시 키 동일). conc 병렬. */
export async function pull(urls, { conc = 16, onProgress } = {}) {
  let ok = 0, done = 0;
  // 원천(호스트)마다 따로 conc 병렬 — EOX · GIBS · V-World 가 한 줄에 서지 않게(호스트당 공정 사용은 그대로)
  const groups = {}; urls.forEach((u) => { const h = u.replace(/^[a-z]+:\/\//, '').split('/')[0]; (groups[h] ||= []).push(u); });
  const lane = (list) => { let i = 0; return async () => {
    while (i < list.length) {
      const u = list[i++];
      let p = pulled.get(u);
      if (!p) {
        p = u.startsWith('lxm://') ? memGet(u.replace(/^lxm:\/\//, 'https://')).then((b) => !!b)
          : fetch(u, { mode: 'cors', credentials: 'same-origin' }).then(async (r) => { if (r.ok) await r.arrayBuffer(); return r.ok; }).catch(() => false);
        pulled.set(u, p); p.then((ok) => { if (!ok) pulled.delete(u); });
      }
      if (await p) ok++;
      done++; onProgress && onProgress(done, urls.length);
    }
  }; };
  await Promise.all(Object.values(groups).flatMap((list) => { const one = lane(list); return Array.from({ length: Math.min(conc, list.length) }, one); }));
  return { tiles: urls.length, ok };
}
/** 비행 경로 타일 미리 받기 — 반환 {tiles, ok, ms}. 화면에는 '영상 미리 받기 n/m' 으로 정직하게 보인다(boot). */
export async function prefetchFlight(map, to, specs, { samples = 28, mode = 'fly', from = null, conc = 16, onProgress } = {}) {
  const t0 = performance.now();
  const urls = tilesFor(map, flySamples(map, to, { n: samples, mode, from }), specs);
  const r = await pull(urls, { conc, onProgress });
  return { ...r, ms: Math.round(performance.now() - t0) };
}
/** 궤적 표본 → 타일 줌마다 하나씩 고른 데우기 카메라(sourceTs = 원천 tileSize). */
export function warmCams(samples, { lo = 0, hi = 99, ts = 256 } = {}) {
  const seen = new Set(), out = [];
  for (const s of samples) { if (s.zoom < lo || s.zoom > hi) continue; const k = Math.round(s.zoom + Math.log2(512 / ts)); if (seen.has(k)) continue; seen.add(k); out.push(camOf(s)); }
  return out;
}
/** no-store 원천(GIBS) — 가림막 뒤에서 카메라들로 점프해 지도 타일 캐시에 올린다(부트 한 번 · 사용자에게 보이지 않음). */
export async function warmInMap(map, cams, sourceIds, maxEach = 2500, onStep = null) {
  const back = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(), padding: map.getPadding() };
  for (const [i, cam] of cams.entries()) {
    onStep && onStep(i, cams.length);
    map.jumpTo(cam);
    await new Promise((r) => {
      const t0 = performance.now();
      const f = () => { if (sourceIds.every((id) => !map.getSource(id) || map.isSourceLoaded(id)) || performance.now() - t0 > maxEach) return r(); requestAnimationFrame(f); };
      requestAnimationFrame(() => requestAnimationFrame(f));
    });
  }
  map.jumpTo(back);
}
/** 보이는 타일 품질 계측 — 화면 표본점마다 맨 위 불투명 래스터의 타일 줌이 이상 줌보다 몇 단계 낮은가(deficit).
    99 = 어떤 영상도 덮지 않음(흰 화면). 판정: deficit ≥ 2 가 500 ms 넘게 이어지는 구간 0. */
export function tileDeficit(map) {
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight, z = map.getZoom(), pitch = map.getPitch();
  const style = map.style; if (!style) return { max: 0, pts: [] };
  const layers = style._order.map((id) => style._layers[id]).filter((l) => l.type === 'raster' && l.visibility !== 'none'
    && z >= (l.minzoom ?? 0) && z < (l.maxzoom ?? 24) && (l.paint.get('raster-opacity') ?? 1) >= 0.5).reverse();
  const P = pitch > 20 ? [[0.5, 0.62], [0.3, 0.8], [0.72, 0.8]] : [[0.5, 0.5], [0.34, 0.34], [0.72, 0.34], [0.34, 0.74], [0.72, 0.74]];
  const pts = [];
  for (const [fx, fy] of P) {
    const pt = [W * fx, H * fy];
    if (map.transform.isPointOnMapSurface && !map.transform.isPointOnMapSurface({ x: pt[0], y: pt[1] })) continue;
    const ll = map.unproject(pt); const m = merc([ll.lng, ll.lat]);
    let hit = null;
    for (const l of layers) {
      const sc = style.sourceCaches[l.source]; if (!sc) continue;
      const src = sc.getSource(); const ts = src.tileSize || 512;
      if (src.bounds && (ll.lng < src.bounds[0] || ll.lng > src.bounds[2] || ll.lat < src.bounds[1] || ll.lat > src.bounds[3])) continue;
      const ideal = Math.max(src.minzoom ?? 0, Math.min(src.maxzoom ?? 22, Math.round(z + Math.log2(512 / ts))));
      let best = -1;
      for (const id of sc.getRenderableIds()) {
        const c = sc.getTileByID(id).tileID.canonical, N = 2 ** c.z;
        if (Math.floor(m[0] * N) === c.x && Math.floor(m[1] * N) === c.y && c.z > best) best = c.z;
      }
      if (best >= 0) { hit = { layer: l.id, deficit: ideal - best, ideal, z: best }; break; }
    }
    pts.push(hit || { layer: null, deficit: 99 });
  }
  return { zoom: +z.toFixed(2), max: pts.length ? Math.max(...pts.map((p) => p.deficit)) : 0, pts };
}

/** 도착 크로스페이드 — 두 번째 지도를 목표 카메라에 먼저 세워 타일을 다 받게 한 뒤(idle), 본 지도가 이동하는 동안
    도착 500 전부터 그 완성 화면을 500 으로 겹쳐 올리고, 본 지도가 idle 이 되면 500 으로 걷어 낸다(업스케일 뭉개짐 0).
    layers(B, on) = 두 번째 지도에서 켜고 끌 층. 판정 1차 불합격 '하강 뭉개짐' 의 소쿨룩 z10→z14 건물 줌 해법. */
/** 크로스페이드 준비만 먼저(앞 비행과 겹쳐 돌리기) — 두 번째 지도를 목표 카메라에 세우고 idle 까지. */
export async function prepCross(stage, cam, layers) {
  const B = ensureMapB(stage);
  await stage.mapBReady;
  layers(B, true);
  stage.bHold = true;
  B.jumpTo(cam);
  await idle(B, D[2400]);
}
export async function arriveCross(stage, cam, dur, layers, { move = ease, prepared = null, at = 0.4, fade = [], waitPrep = false } = {}) {
  const A = stage.map;
  ensureMapB(stage);
  // 판정 2차 불합격(메이크틸라 정지 2.4–4.5 s → 10 % 컷): 준비를 기다리지 않고 바로 난다.
  // 겹치기 = max(이동의 at 지점, 두 번째 지도 준비 완료) · 500 으로 녹아든다. 준비가 늦으면 비행 뒤 idle 까지 본 지도가 그대로 보인다.
  const prep = prepared || prepCross(stage, cam, layers);
  if (waitPrep) await prep;   // 같은 자리 줌(소쿨룩 z10→14 pitch 45): 멈춘 화면에서 도착 화면을 먼저 완성 — 비행 중 뭉개짐 0
  const root = stage.root;
  root.dataset.bcover = '0';
  const fast = fastFade(A, fade);   // 비행 중 새 타일 페이드 0 — 부모 타일 업스케일이 500 ms 남지 않게
  const moving = move(A, cam, dur);
  let over = false;
  Promise.all([prep, wait(Math.round(dur * at))]).then(() => { if (!over) root.dataset.bcover = '1'; });
  await moving;
  fast();
  await Promise.race([prep, wait(D[1600])]);
  await idle(A, D[1600]);
  over = true;
  root.dataset.bcover = '0';
  await wait(D[500]);
  delete root.dataset.bcover;
  stage.bHold = false;
  const B = stage.mapB;
  B.jumpTo({ center: A.getCenter(), zoom: A.getZoom(), pitch: A.getPitch(), bearing: A.getBearing(), padding: A.getPadding() });
  layers(B, false);
}
/** 비행 동안 래스터 페이드 0(도착 뒤 500 복귀) — 반환 = 복귀 함수. */
export function fastFade(map, ids) {
  const on = ids.filter((id) => map.getLayer(id));
  on.forEach((id) => map.setPaintProperty(id, 'raster-fade-duration', 0));
  return () => on.forEach((id) => map.getLayer(id) && map.setPaintProperty(id, 'raster-fade-duration', D[500]));
}

/** 수치 애니메이션(rAF) — 페인트 속성·CSS 변수 보간용. */
export function tween(dur, fn, easing = EASE.arrive) {
  return new Promise((res) => {
    if (reduced()) { fn(1); return res(); }
    const t0 = performance.now();
    const f = (now) => { const k = Math.min(1, (now - t0) / dur); fn(easing(k)); if (k < 1) requestAnimationFrame(f); else res(); };
    requestAnimationFrame(f);
  });
}

/* ── 화면 좌표 추적 부품 ───────────────────────────────────────────── */
function screenBox(map, bbox) {
  const pts = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]]].map((p) => map.project(p));
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

/** 락온 — 브래킷 4귀 380(180/80/120). tag = {name, cyr, sub}. */
export function lockOn(stage, bbox, tag = null) {
  const el = document.createElement('div');
  el.className = 'gs-lock';
  el.innerHTML = '<i></i><i></i><i></i><i></i>' + (tag ? `<div class="gs-lock__tag g-in"><b>${tag.name}</b>${tag.cyr ? `<span class="g-cyr" lang="ru">${tag.cyr}</span>` : ''}${tag.sub ? `<small>${tag.sub}</small>` : ''}</div>` : '');
  stage.root.appendChild(el);
  const place = () => { if (stage.freeze) return; const b = screenBox(stage.map, bbox); Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' }); };
  place(); stage.onMove.add(place);
  const h = { el, remove() { stage.onMove.delete(place); el.remove(); } };
  stage.locks.push(h);
  return h;
}
export function clearLocks(stage) { stage.locks.splice(0).forEach((l) => l.remove()); }

/** 스윕 — 청록 1px + 24px 꼬리 · 1000 · 끝나면 resolve(그 뒤에 결과 현상 500). */
export function sweep(stage, bbox) {
  return new Promise((res) => {
    const b = screenBox(stage.map, bbox);
    const el = document.createElement('div');
    el.className = 'gs-sweep';
    Object.assign(el.style, { left: b.x + 'px', top: b.y + 'px', width: b.w + 'px', height: b.h + 'px' });
    el.style.setProperty('--sweep-w', b.w + 'px');
    el.innerHTML = '<div class="cw-sweep"></div>';
    stage.root.appendChild(el);
    const done = () => { el.remove(); res(); };
    if (reduced()) return done();
    el.firstElementChild.addEventListener('animationend', done, { once: true });
  });
}

/** 지명·시범지 핀(HTML · 지도 이동 추적). */
export function pin(stage, lnglat, html, cls = 'g-pin') {
  const el = document.createElement('div');
  el.className = cls + ' g-in';
  el.innerHTML = html;
  stage.root.appendChild(el);
  const place = () => { if (stage.freeze) return; const p = stage.map.project(lnglat); el.style.left = p.x + 'px'; el.style.top = p.y + 'px'; };
  place(); stage.onMove.add(place);
  const h = { el, remove() { stage.onMove.delete(place); el.remove(); } };
  stage.pins.push(h);
  return h;
}
export function clearPins(stage) { stage.pins.splice(0).forEach((p) => p.remove()); }

/** 프로비넌스 칩 — 봉투 없으면 throw(system-v2 §5 문법 7). */
export function prov(env, extra = '') {
  assertEnvelope(env, 'prov');
  const s = document.createElement('span');
  s.className = 'gs-prov';
  s.dataset.basis = env.basis;
  s.innerHTML = `<b>${basisLabel(env.basis)}</b><span>${env.source}</span><span>${String(env.as_of).slice(0, 10)}</span>${env.note ? `<span>${env.note}</span>` : ''}${extra}`;
  return s;
}

/** 스와이프 — clip-path inset(0 0 0 var(--swipe)) · 좌 = 지도 A · 우 = 지도 B · 양쪽 출처 칩. */
export function swipe(stage, { left, right, at = 50 }) {
  const root = stage.root;
  const bar = root.querySelector('.gs-swipe');
  bar.querySelector('.gs-swipe__side--l').replaceChildren(left);
  bar.querySelector('.gs-swipe__side--r').replaceChildren(right);
  const set = (pct) => { root.style.setProperty('--swipe', pct + '%'); stage.swipeAt = pct; };
  set(at);
  root.dataset.swipe = '1';
  const grip = bar.querySelector('.gs-swipe__grip');
  const move = (e) => { set(Math.max(4, Math.min(96, (e.clientX / innerWidth) * 100))); };
  const down = (e) => { grip.setPointerCapture(e.pointerId); grip.addEventListener('pointermove', move); };
  const up = () => grip.removeEventListener('pointermove', move);
  grip.onpointerdown = down; grip.onpointerup = up;
  grip.onkeydown = (e) => { if (e.key === 'ArrowLeft') set(stage.swipeAt - 4); if (e.key === 'ArrowRight') set(stage.swipeAt + 4); };
  return { set, glide: (to, dur = D[1600]) => { const from = stage.swipeAt; return tween(dur, (k) => set(from + (to - from) * k), EASE.cam); },
           off() { delete root.dataset.swipe; } };
}

/* ── GIBS 어제 · 날짜 스크러버(타일 페이드 500) ──────────────────────── */
const GIBS = (d) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
const BM = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
export function isoMinus(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

export function addGibs(map) {
  const y = yesterdayUTC();
  // 극지 무자료(VIIRS 일일 궤도 공백 = 검은 캡) → 아래에 Blue Marble 정적 바닥(같은 GIBS · 공개) · VIIRS 는 z3+ · ±79° 안에서만(z3 극 행 79.2–85° 제외)
  // Blue Marble 의 북극해는 짙은 남색 — 극 캡이 '검은 띠'로 번쩍였다(판정 2차). VIIRS 와 같은 z3+ · ±79°(z3 극 행 제외) → 극 캡은 순백 바탕.
  map.addSource('gibs-bm', { type: 'raster', tiles: [mem(BM)], tileSize: 256, minzoom: 3, maxzoom: 8, bounds: [-180, -79, 180, 79], attribution: 'NASA Blue Marble' });
  map.addLayer({ id: 'gibs-bm', type: 'raster', source: 'gibs-bm', paint: { 'raster-fade-duration': D[500] } });
  for (const k of ['a', 'b']) {
    map.addSource('gibs-' + k, { type: 'raster', tiles: [mem(GIBS(y))], tileSize: 256, minzoom: 3, maxzoom: 9, bounds: [-180, -79, 180, 79], attribution: 'NASA GIBS / ESDIS' });
    map.addLayer({ id: 'gibs-' + k, type: 'raster', source: 'gibs-' + k, layout: { visibility: k === 'a' ? 'visible' : 'none' },   // 뒷면은 쓸 때만(같은 타일 이중 요청 0)
      paint: { 'raster-opacity': k === 'a' ? 1 : 0, 'raster-opacity-transition': { duration: D[500], delay: 0 }, 'raster-fade-duration': D[500] } });
  }
  return { front: 'a', date: y };
}

export function dateScrubber(stage, gibs, el) {
  const y = yesterdayUTC();
  const days = Array.from({ length: 31 }, (_, i) => isoMinus(y, 30 - i));
  el.innerHTML = `<div class="gs-date__cap"><span>${t('date.cap')}</span><span><b id="gs-date-v">${y}</b> · <span id="gs-date-rel">${t('date.yday')}</span></span></div>
    <div class="gs-date__track" role="listbox" aria-label="GIBS date">${days.map((d, i) => `<button class="gs-date__tick" role="option" data-d="${d}" ${(30 - i) % 7 === 0 ? 'data-week' : ''} aria-current="${d === y}" title="${d}"></button>`).join('')}</div>`;
  const set = async (d) => {
    if (d === gibs.date) return;
    const map = stage.map;
    const back = gibs.front === 'a' ? 'b' : 'a';
    gibs.dates ||= { a: y, b: y };
    map.setLayoutProperty('gibs-' + back, 'visibility', 'visible');
    if (gibs.dates[back] !== d) { map.getSource('gibs-' + back).setTiles([mem(GIBS(d))]); gibs.dates[back] = d; }   // 같은 날짜면 다시 받지 않음(데운 타일 캐시 유지)
    await new Promise((r) => { const f = () => { if (map.isSourceLoaded('gibs-' + back)) { map.off('sourcedata', f); r(); } }; map.on('sourcedata', f); setTimeout(() => { map.off('sourcedata', f); r(); }, D[1250]); });
    map.setPaintProperty('gibs-' + back, 'raster-opacity', 1);
    map.setPaintProperty('gibs-' + gibs.front, 'raster-opacity', 0);   // 500 크로스페이드(raster-opacity-transition)
    const old = 'gibs-' + gibs.front;
    setTimeout(() => { if ('gibs-' + gibs.front !== old) map.setLayoutProperty(old, 'visibility', 'none'); }, D[500] + D[120]);   // 숨겨도 타일은 LRU 에 남는다
    gibs.front = back; gibs.date = d;
    el.querySelectorAll('.gs-date__tick').forEach((b) => b.setAttribute('aria-current', String(b.dataset.d === d)));
    el.querySelector('#gs-date-v').textContent = d;
    const n = Math.round((new Date(y) - new Date(d)) / 86400000);
    el.querySelector('#gs-date-rel').textContent = n === 0 ? t('date.yday') : t('date.back', { n: n + 1 });
    stage.root.dispatchEvent(new CustomEvent('gs:date', { detail: { date: d } }));
  };
  el.addEventListener('click', (e) => { const b = e.target.closest('.gs-date__tick'); if (b) set(b.dataset.d); });
  return { set, days };
}

/* ── LX 사업국 36 채색 · 사할린 점 · 우 목록 ─────────────────────────── */
export function addCountries(map, lx) {
  map.addSource('world', { type: 'geojson', data: lx.world });
  map.addLayer({ id: 'lx-fill', type: 'fill', source: 'world', filter: ['==', ['get', 'lx'], 1],
    paint: { 'fill-color': ['match', ['get', 'status'], 'active', '#006DF7', '#D6E6FF'],
             'fill-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, ['*', ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 1], ['match', ['get', 'status'], 'active', 0.35, 0.55]], 5, 0],
             'fill-opacity-transition': { duration: D[500], delay: 0 } } });
  map.addLayer({ id: 'world-line', type: 'line', source: 'world',
    paint: { 'line-color': '#FFFFFF', 'line-opacity': ['interpolate', ['linear'], ['zoom'], 1, 0.35, 5, 0.6], 'line-width': 0.6 } });
  map.addLayer({ id: 'lx-line', type: 'line', source: 'world', filter: ['==', ['get', 'lx'], 1],
    paint: { 'line-color': ['case', ['boolean', ['feature-state', 'hover'], false], '#010102', '#006DF7'], 'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.9],
             'line-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 0.9, 6, 0.25] } });
  map.addSource('lx-points', { type: 'geojson', data: { type: 'FeatureCollection', features: lx.points.map((p) => ({ type: 'Feature', properties: { id: p.id }, geometry: { type: 'Point', coordinates: p.lnglat } })) } });
  map.addLayer({ id: 'lx-points', type: 'circle', source: 'lx-points',
    paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#010102', 'circle-stroke-width': 1.5, 'circle-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 1, 5, 0], 'circle-stroke-opacity': ['interpolate', ['linear'], ['zoom'], 3.5, 1, 5, 0] } });
}

/** 사업 기간 표기 — 같은 해 '2025' · 다른 해 '2024–26' · 종료 미정 '2026–'. */
export function yearSpan(from, to) {
  const a = String(from || '').slice(0, 4), b = String(to || '').slice(0, 4);
  if (!a) return b || '—';
  if (!b || !/^\d{4}$/.test(b)) return a + '–';
  return a === b ? a : `${a}–${b.slice(2)}`;
}
export function countryList(stage, lx, el, onOpen) {
  const byIso = Object.fromEntries(lx.world.features.map((f) => [f.properties.iso3, f]));
  const rows = [...lx.countries].sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1)
    || ((b.projects[0]?.year || '0').localeCompare(a.projects[0]?.year || '0')) || a.name_en.localeCompare(b.name_en));
  const open = { KGZ: 'ysykata', MMR: 'meiktila' };
  const ko = document.documentElement.lang === 'ko';
  const li = rows.map((c, i) => {
    const p = c.projects[0];
    const title = p ? (ko ? p.title_ko : p.title_en) : t('list.noname');
    const yr = p ? yearSpan(p.from, p.to) : '2023';
    return `<li class="gs-row g-in" style="animation-delay:${STAGGER[Math.min(i, STAGGER.length - 1)]}ms" data-iso="${c.iso3}" data-status="${c.status}" ${open[c.iso3] ? `data-open="${open[c.iso3]}"` : ''} tabindex="0">
      <i></i><div><b>${ko ? c.name_ko : c.name_en}</b><small>${title}</small></div><em>${yr}</em></li>`;
  }).join('') + `<li class="gs-row g-in" data-status="point" data-iso="SAKHALIN" tabindex="0"><i></i><div><b>${ko ? lx.points[0].name_ko : lx.points[0].name_en}</b><small>${t('list.point')}</small></div><em>2019–20</em></li>`;
  el.querySelector('.gs-list__rows').innerHTML = li;
  let hov = null;
  const hover = (iso) => {
    const map = stage.map;
    if (hov !== null) map.setFeatureState({ source: 'world', id: hov }, { hover: false });
    hov = iso && byIso[iso] ? byIso[iso].id : null;
    if (hov !== null) map.setFeatureState({ source: 'world', id: hov }, { hover: true });
  };
  el.addEventListener('mouseover', (e) => { const r = e.target.closest('.gs-row'); hover(r && r.dataset.iso); });
  el.addEventListener('mouseleave', () => hover(null));
  el.addEventListener('click', (e) => {
    const r = e.target.closest('.gs-row'); if (!r) return;
    if (r.dataset.open) return onOpen(r.dataset.open);
    const c = lx.countries.find((x) => x.iso3 === r.dataset.iso);
    const ctr = c ? c.centroid : lx.points[0].lnglat;
    fly(stage.map, { center: ctr, zoom: 3.2, pitch: 0, bearing: 0 }, D[1600]);
  });
  return { hover, count: rows.length };
}

/* ── 계측 ───────────────────────────────────────────────────────────── */
export function perfOf(stage, fromIdx = 0) {
  const a = stage.perf.slice(fromIdx).filter((x) => x > 0 && x < 1000).sort((x, y) => x - y);
  if (!a.length) return { n: 0 };
  const q = (p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
  return { n: a.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +a[a.length - 1].toFixed(1), canvases: document.querySelectorAll('canvas').length };
}
export { num };
