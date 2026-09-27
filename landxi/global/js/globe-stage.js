/* GLOBE-STAGE — 같은 지도 한 장(페이지 이동 0) · 순백 글로브 · GIBS 어제 · LX 사업국 36 채색 · 우 목록 · 상단 날짜 스크러버.
   F2-D: 락온 · 스와이프 · 프로비넌스 · 핀 앵커 · 카드 등장은 F1-A fx(landxi/xi/fx/*) import — 로컬 부품 삭제.
   남은 로컬: 스윕(fx 는 arrive() 안에만 있고 단독 export 가 없다 · 결과 문서 인터페이스 요청) · GIBS 날짜 띠(에포크 층이 아니라 setTiles 교체).
   카메라: 장거리(≥ 6 줌) = --e-fly cubic-bezier(.45,0,.25,1) 2400(법전 §3 추가 · Fable 채택) · 단거리 = --e-cam. */
import { yesterdayUTC } from '/landxi/shared/api-v1.js';
import { t, num, basisLabel, locale } from './i18n.js';
import { lock as fxLock, clearLocks as fxClearLocks } from '/landxi/xi/fx/arrive.js';
import { swipe as fxSwipe } from '/landxi/xi/fx/swipe.js';
import { prov as fxProv } from '/landxi/xi/fx/provenance.js';
import { anchor as fxAnchor } from '/landxi/xi/fx/glass.js';

/* ── 모션 사다리(system-v2 §3) ─────────────────────────────────────── */
export const D = { 40: 40, 60: 60, 80: 80, 120: 120, 180: 180, 380: 380, 500: 500, 750: 750, 1000: 1000, 1250: 1250, 1600: 1600, 2400: 2400, 3200: 3200 };   // 3200 = --e-fly 초장거리(Δz ≥ 10 · 판정 3차 제안 값 · §3 기입 요청)
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (u) => ((ax * u + bx) * u + cx) * u, sy = (u) => ((ay * u + by) * u + cy) * u, dx = (u) => (3 * ax * u + 2 * bx) * u + cx;
  return (x) => { let u = x; for (let i = 0; i < 8; i++) { const e = sx(u) - x, d = dx(u); if (Math.abs(e) < 1e-6 || !d) break; u -= e / d; } return sy(Math.min(1, Math.max(0, u))); };
}
export const EASE = { cam: bezier(0.16, 1, 0.3, 1), ui: bezier(0.22, 1, 0.36, 1), arrive: bezier(0.15, 1, 0.3, 1),
  fly: bezier(0.45, 0, 0.25, 1) };   // --e-fly(system-v2 §3 추가 · tokens-v2 반영 전엔 global.css 로컬 변수) — 장거리 비행 ease-in-out
/** 장거리 비행 문턱(줌 단계) — 이 이상이면 --e-fly 2400 · 아래면 --e-cam(판정 1차 must_fix 1: 하강 스냅 → 비행) */
export const LONG_Z = 6;
export const camEase = (dz) => (Math.abs(dz) >= LONG_Z ? EASE.fly : EASE.cam);
/** 글로브 하강의 정점 줌(flyTo minZoom) — 글로브(z < 3)에서 ≤ 9 단계 내려갈 때만 0.8 단계 떠올랐다 내려간다:
    같은 --e-fly 2400 안에서 z < 5(곡률 가시) 체류가 ≥ 1 s 로 늘고 100 ms 당 Δz ≤ 1.5 를 지킨다(실측 · 결과 문서).
    Δz > 9(메이크틸라 12.1)는 정점을 두면 프레임당 Δz 가 1.5 를 넘는다 → 두지 않는다. */
export const peakZoom = (z0, z1) => {
  const dz = z1 - z0;
  if (z0 < 3 && dz >= LONG_Z && dz <= 9) return Math.max(0.9, z0 - 0.8);
  if (z0 < 3 && dz >= XLONG_Z) return z0;   // 초장거리(3200): 출발 줌을 정점으로 — 궤적이 출발 글로브에 접해 출발(z < 5 체류 ≥ 1 s · 100 ms 당 Δz ≤ 1.5 실측)
  return null;
};
/** 초장거리 문턱 — 글로브(z 1.8) ↔ 메이크틸라(z 13.9) Δz 12.1: --e-fly 2400 으로는 z < 5 가 0.68–0.77 s(판정 3차 실측) →
    같은 --e-fly 곡선을 3200 으로(판정 3차가 제시한 값 · 법전 §3 '--e-fly 2400 · Δz ≥ 10 = 3200' 기입은 Fable · 결과 문서 요청). */
export const XLONG_Z = 10;
export const flyMs = (span) => (span >= XLONG_Z ? D[3200] : D[2400]);
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
/* ── 영속 타일 캐시(lxc://) — EOX s2cloudless(max-age 7 d)를 Cache Storage 에 둔다(판정 3차: 재방문 EOX 네트워크 342 건).
   HTTP 캐시는 탭 설정에 따라 메모리 50 MB(시크릿 · 자동화 컨텍스트)라 NDVI·PC 모자이크(PNG 100 KB+)가 들어오면 하강 경로 타일이 밀려난다 →
   하강 경로 원천만 origin 저장소에 영속 · 받은 타일은 다음 방문(새 문서 · 새 세션)에 네트워크 0 으로 나온다. 실패하면 그냥 네트워크(결손 0). */
const DC_NAME = 'lx-global-tiles-v1', DC_MAX = 6000;   // ≈ 90–150 MB(EOX 15–25 KB/장) · 세 장면 다리 합 ≈ 2,000 장
export const dcache = (u) => String(u).replace(/^https:\/\//, 'lxc://');
let dcOpen = null;
const dcStore = () => (dcOpen ||= (typeof caches !== 'undefined' ? caches.open(DC_NAME).catch(() => null) : Promise.resolve(null)));
const dcFlight = new Map();
/** 계측 — 지도 요청(map_*) · 미리 받기(pull_*) 별 저장소 적중 · 네트워크 · 지도 네트워크 URL 최근 40(재방문 판정 · 결과 문서) */
const dcStat = (window.__dcStat = { map_hit: 0, map_net: 0, map_join: 0, pull_hit: 0, pull_net: 0, pull_retry: 0, pull_fail: 0, fail_why: {}, map_net_urls: [] });
/** 저장소에 있으면 바이트(없으면 null) — 네트워크 없음 */
async function dcPeek(u) { const c = await dcStore(); if (!c) return null; const hit = await c.match(u, { ignoreVary: true }).catch(() => null); return hit ? hit.arrayBuffer() : null; }
/** https URL → ArrayBuffer | null. 같은 URL 은 한 비행(미리 받기 · 지도 요청이 같은 fetch 를 나눈다 · 중복 네트워크 0) —
    저장(put)이 끝날 때까지 비행 표에 남겨 그 사이 요청도 네트워크로 새지 않게. Vary: Origin 은 무시하고 찾는다(ignoreVary). */
function dcGet(u) {
  const e = dcFlight.get(u); if (e) return e;
  const p = (async () => {
    const c = await dcStore();
    if (c) { const hit = await c.match(u, { ignoreVary: true }).catch(() => null); if (hit) { dcFlight.delete(u); dcStat.pull_hit++; return hit.arrayBuffer(); } }
    dcStat.pull_net++;
    // 원천이 몰림에 거절하면(CORS 없는 5xx · 스트림 거절 — 실측 767 중 205) 사다리 값 뒤 한 번 더
    const get = () => fetch(u, { mode: 'cors', credentials: 'same-origin' }).catch((e) => ({ ok: false, status: 'net' }));
    let r = await get();
    if (!r.ok) { dcStat.pull_retry++; await wait(D[750]); r = await get(); }
    if (!r.ok) { dcStat.pull_fail++; dcStat.fail_why[r.status] = (dcStat.fail_why[r.status] || 0) + 1; dcFlight.delete(u); return null; }
    const buf = await r.clone().arrayBuffer();
    if (c) dcQueue(c, u, r); else dcFlight.delete(u);
    return buf;
  })().catch(() => { dcFlight.delete(u); return null; });
  dcFlight.set(u, p);
  return p;
}
/* 저장(put)은 줄 세워 한 번에 2 건 · 비행 중엔 멈춘다 — Cache Storage 의 put 은 배타 작업이라 몰리면 지도 타일 읽기(match)가 그 뒤에 선다
   (실측: 미리 받기 646 장의 put 폭주 중 하강 부족 ≥ 2 가 1.3–1.5 s). 저장 전까지는 비행 표가 같은 바이트를 준다. */
const dcPut = []; let dcRun = 0, dcHeld = false;
export function dcHold(on) { dcHeld = !!on; if (!on) dcPump(); }
function dcQueue(c, u, r) { dcPut.push([c, u, r]); dcPump(); }
function dcPump() {
  while (!dcHeld && dcRun < 2 && dcPut.length) {
    const [c, u, r] = dcPut.shift(); dcRun++;
    c.put(u, r).catch(() => {}).finally(() => { dcRun--; dcFlight.delete(u); dcPump(); });
  }
}
/** 부트 뒤 한 번 — 항목이 DC_MAX 를 넘으면 오래된 것부터(삽입 순) 지운다. */
export async function dcTrim() {
  const c = await dcStore(); if (!c) return null;
  const keys = await c.keys().catch(() => []);
  const over = keys.length - DC_MAX;
  for (let i = 0; i < over; i++) await c.delete(keys[i]).catch(() => {});
  return { entries: keys.length, trimmed: Math.max(0, over) };
}
let memReady = false;
function ensureMem() {
  if (memReady) return;
  ML().addProtocol('lxm', async (params) => {
    const b = await memGet(params.url.replace(/^lxm:\/\//, 'https://'));
    if (!b) throw new Error('tile unavailable');   // 지도 error 이벤트(stage.errors) — 콘솔 오류 아님
    return { data: b.slice(0) };
  });
  // 지도 요청 — 저장소 적중이면 바로 · 미리 받기가 받는 중이면 그 비행 · 아니면 지도 자신의 fetch(거둠 신호 연결 — 지나간 줌 타일은
  // 네트워크에서도 취소된다 · 판정 3차 실측: 취소를 무시하면 하강 중 부족 ≥ 2 가 1.3–1.6 s) → 받은 바이트는 저장 줄에.
  ML().addProtocol('lxc', async (params, ac) => {
    const u = params.url.replace(/^lxc:\/\//, 'https://');
    let b = await dcPeek(u);
    if (b) dcStat.map_hit++;
    else if (dcFlight.has(u)) { dcStat.map_join++; b = await dcFlight.get(u); }
    if (!b) {
      dcStat.map_net++; dcStat.map_net_urls.push(u); if (dcStat.map_net_urls.length > 40) dcStat.map_net_urls.shift();
      const r = await fetch(u, { mode: 'cors', credentials: 'same-origin', signal: ac && ac.signal });
      if (!r.ok) throw new Error('tile unavailable');
      b = await r.clone().arrayBuffer();
      const c = await dcStore();
      if (c && !dcFlight.has(u)) { dcFlight.set(u, Promise.resolve(b)); dcQueue(c, u, r); }
    }
    if (!b) throw new Error('tile unavailable');
    return { data: b.slice(0) };   // 같은 비행을 나눈 소비자끼리 버퍼를 공유하지 않게(전송 시 분리 방지)
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
    // 글로브(≤4.5)는 순백 · 영상 무대(≥5.5)는 흙빛 무채 — 급한 줌아웃에서 타일이 늦게 와도 흰 구멍이 번쩍이지 않게(극 캡은 addGibs 의 해빙 바닥층)
    layers: [{ id: 'bg', type: 'background', paint: { 'background-color': ['interpolate', ['linear'], ['zoom'], 4.5, '#FFFFFF', 5.5, '#6F6A5E'] } }],
  };
}

export function createStage(root, { center = [100, 32], zoom = 1.7 } = {}) {
  ensurePmtiles(); ensureMem();
  // 캐시에 미리 받은 타일을 한꺼번에 올리도록 동시 이미지 요청 16 → 24(HTTP/2 원천 · 디스크 캐시 적중이 대부분)
  if (ML().setMaxParallelImageRequests) ML().setMaxParallelImageRequests(16);   // F2-D: 24 → 16(미리 받기 호스트 상한과 합쳐 소켓 폭주 0 · ERR_NO_BUFFER_SPACE 실측)
  const el = root.querySelector('#map');
  const map = new (ML().Map)({ container: el, style: baseStyle(), center, zoom, attributionControl: false, maxPitch: 60,
    renderWorldCopies: false, canvasContextAttributes: { antialias: true },
    maxTileCacheZoomLevels: 24,
    // F2-D: --e-fly 는 중간 줌을 100 ms 에 약 1 단계씩 지난다 — 기본(true)은 앞 줌의 로딩 타일을 취소해 z3 조상이 600 ms 늘어진다(실측)
    // → false: 앞 줌 타일이 차례로 나타난다(MapLibre 5 cancelPendingTileRequestsWhileZooming)
    cancelPendingTileRequestsWhileZooming: false });   // 부트에서 데운 후퇴·하강 경로 타일을 투어 끝까지 GPU 캐시에(≈ 35 장 × 24 줌 · 원천당)
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
    
    interactive: false, attributionControl: false, renderWorldCopies: false, maxPitch: 60, cancelPendingTileRequestsWhileZooming: false,
    maxTileCacheZoomLevels: 24 });
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

/** 카메라 이동 — 점프 없음 · 1600/2400 만. 장거리(|Δz| ≥ 6) = --e-fly ease-in-out 2400(곡률이 1 s 이상 보이며 내려간다 ·
    100 ms 당 z ≤ 1.5) · 단거리 = --e-cam. reduced-motion = jumpTo. 비행마다 window.__f2dFlights 에 기록(z 트레이스 판정). */
export function fly(map, cam, dur = D[2400]) {
  return new Promise((res) => {
    if (reduced()) { map.jumpTo(cam); return res(); }
    const z0 = map.getZoom(), dz = (cam.zoom ?? z0) - z0;
    // 장거리 = 끝점 Δz ≥ 6 또는 궤적이 그만큼 떠올랐다 내려오는 대륙 간 이동(메이크틸라 → 소쿨룩 13.9 → ≈3 → 10.35)
    const span = Math.abs(dz) >= LONG_Z ? Math.abs(dz) : pathSpan(map, cam);
    const long = span >= LONG_Z;
    const d = long ? flyMs(span) : dur;
    const mz = long ? peakZoom(z0, cam.zoom ?? z0) : null;
    map.flyTo({ ...cam, duration: d, easing: long ? EASE.fly : EASE.cam, essential: true, curve: cam.curve ?? 1.42, ...(mz != null ? { minZoom: mz } : {}) });
    const rec = { t: Math.round(performance.now()), z0: +z0.toFixed(2), z1: +(cam.zoom ?? z0).toFixed(2), ms: d, ease: long ? 'e-fly' : 'e-cam', ...(mz != null ? { minZoom: mz } : {}) };
    (window.__f2dFlights ||= []).push(rec);
    map.once('moveend', () => { rec.end = Math.round(performance.now()); res(); });   // flyTo 뒤에 건다 — 앞 이동을 끊을 때 나는 moveend 를 제 끝으로 오인하지 않게
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

/** 궤적의 줌 폭 — (시작 − 최저) + (끝 − 최저). flyTo 가 떠올랐다 내려오는 양까지 센다. */
export function pathSpan(map, cam) {
  const S = flySamples(map, cam, { n: 16, easing: (x) => x });
  const lo = Math.min(...S.map((x) => x.zoom)), z0 = S[0].zoom, z1 = S[S.length - 1].zoom;
  return (z0 - lo) + (z1 - lo);
}
/** 카메라 궤적 표본 — [{zoom, c:[mx,my], pitch, padding}] · mode fly = MapLibre camera.flyTo 와 같은 rho 곡선 · ease = 선형 보간(easeTo).
    from 을 주면 지금 카메라 대신 그 카메라에서 출발(투어가 다음 하강을 미리 받을 때). */
export function flySamples(map, to, { n = 28, rho = 1.42, easing = null, mode = 'fly', from = null } = {}) {
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight;
  const f = from || { center: map.getCenter().toArray(), zoom: map.getZoom(), pitch: map.getPitch(), padding: map.getPadding() };
  const Z = { top: 0, right: 0, bottom: 0, left: 0 };
  const z0 = f.zoom, z1 = to.zoom ?? z0;
  const c0 = merc(Array.isArray(f.center) ? f.center : [f.center.lng, f.center.lat]), c1 = merc(to.center || f.center);
  const p0 = f.pitch || 0, p1 = to.pitch ?? p0;
  const pad0 = { ...Z, ...(f.padding || {}) }, pad1 = { ...Z, ...(to.padding || pad0) };
  const w0 = Math.max(W, H), w1 = w0 / 2 ** (z1 - z0);
  const u1 = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) * 512 * 2 ** z0;
  const mz = mode === 'fly' ? peakZoom(z0, z1) : null;
  if (mz != null && u1 > 1e-6) rho = Math.sqrt(((w0 / 2 ** (Math.min(mz, z0, z1) - z0)) / u1) * 2);   // MapLibre flyTo minZoom 와 같은 식
  const r2 = rho * rho;
  const r = (i) => { const b = (w1 * w1 - w0 * w0 + (i ? -1 : 1) * r2 * r2 * u1 * u1) / (2 * (i ? w1 : w0) * r2 * u1); return Math.log(Math.sqrt(b * b + 1) - b); };
  let w, u, S;
  if (mode === 'ease') { S = 1; u = (s) => s; w = (s) => 2 ** (-(z1 - z0) * s); }
  else if (u1 < 1e-6 || !isFinite(r(0)) || !isFinite(r(1))) {
    const k = w1 < w0 ? -1 : 1; S = Math.abs(Math.log(w1 / w0)) / rho || 1; u = (s) => (S ? s / S : 1); w = (s) => Math.exp(k * rho * s);
  } else {
    const r0 = r(0); S = (r(1) - r0) / rho; w = (s) => Math.cosh(r0) / Math.cosh(r0 + rho * s); u = (s) => (w0 * ((Math.cosh(r0) * Math.tanh(r0 + rho * s) - Math.sinh(r0)) / r2)) / u1;
  }
  if (!easing) {   // fly() 와 같은 이징 — 장거리(끝점 Δz 또는 궤적 줌 폭 ≥ 6) = --e-fly
    let lo = Math.min(z0, z1); if (mode === 'fly') for (let i = 1; i < 16; i++) lo = Math.min(lo, z0 + Math.log2(1 / w((i / 16) * S)));
    easing = mode === 'fly' && (z0 - lo) + (z1 - lo) >= LONG_Z ? EASE.fly : EASE.cam;
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
  // 글로브 줌(< 5)은 구면이 평면 근사보다 넓게 보인다(가장자리 · 판정 2차 후퇴 z4–3 조각보) → 여백을 줌에 따라 키운다(z3 ≈ 화면 폭 절반씩)
  const gm = cam.zoom < 5 ? Math.min(1, (5 - cam.zoom) / 2) * 0.5 * Math.max(cam.W, cam.H) : 0;
  // 여백 64 px — 글로브 변환의 덮기(covering)는 평면 근사보다 가장자리 타일을 한 줄 더 부른다(판정 3차 재방문 실측: z9 가장자리 4 장)
  const M = 64;
  const x0 = cam.c[0] + (-cx - M - gm) / world, x1 = cam.c[0] + (cam.W - cx + M + gm) / world;
  const y0 = cam.c[1] + (-cy * up - M - gm) / world, y1 = cam.c[1] + (cam.H - cy + M + gm) / world;
  let bx0 = 0, bx1 = 1, by0 = 0, by1 = 1;
  if (src.bounds) { const a = merc([src.bounds[0], src.bounds[3]]), b = merc([src.bounds[2], src.bounds[1]]); [bx0, by0, bx1, by1] = [a[0], a[1], b[0], b[1]]; }
  const X0 = Math.floor(Math.max(x0, bx0, 0) * N), X1 = Math.floor(Math.min(x1, bx1, 0.999999) * N);
  const Y0 = Math.floor(Math.max(y0, by0, 0) * N), Y1 = Math.floor(Math.min(y1, by1, 0.999999) * N);
  const out = [];
  for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) out.push({ z: tz, x, y });
  return out;
}
const pulled = new Map();   // url → Promise<boolean>(진행 중 공유 · 멱등)
const cacheable = (u) => /^lx[mc]:\/\//.test(u) || /^https:\/\/(tiles\.maps\.eox\.at|planetarycomputer\.microsoft\.com|xdworld\.vworld\.kr)\//.test(u);
/** 궤적(또는 도착 카메라)에서 원천들이 요청할 타일 URL. specs = [id | {id, from, final} | {src:{tiles,minzoom,maxzoom,bounds,tileSize}, final}] */
export function tilesFor(map, path, specs, { dwell = 1, endFirst = false, order = null } = {}) {
  const style = map.getStyle(), want = new Set(), zOf = new Map();
  // endFirst — 하강: 도착 카메라 쪽 타일부터(느린 원천에서 착지 화면이 먼저 차도록 · 궤적 앞 1 s 는 이미 받은 글로브 줌)
  if (endFirst) path = [...path].reverse();
  for (const spec of specs) {
    const s = typeof spec === 'string' ? { id: spec } : spec;
    const src = s.src || (s.id && style.sources[s.id]);
    if (!src || !src.tiles || !src.tiles[0]) continue;
    // dwell = 같은 타일 줌 표본 수 하한. 1(기본) = 경로의 모든 줌 — 중간 줌은 도착 직후 캐시→GPU 지연 동안의 조상 타일이 된다(3 으로 줄이면 1.0–1.5 s 뭉개짐 실측)
    const tzOf = (c) => Math.round(c.zoom + Math.log2(512 / (src.tileSize || 512)));
    const cnt = {}; path.forEach((c) => { cnt[tzOf(c)] = (cnt[tzOf(c)] || 0) + 1; });
    const last = endFirst ? 0 : path.length - 1;
    const cams = s.final ? [path[last]] : path.filter((c, i) => c.zoom >= (s.from ?? 0) && c.zoom < (s.to ?? 99) && (cnt[tzOf(c)] >= (s.dwell ?? dwell) || i === last));
    for (const cam of cams) for (const tl of coverTiles(cam, src)) {
      if (s.even && tl.z % 2 && !(s.keepZ || []).includes(tl.z)) continue;   // 짝수 타일 줌만 — 이웃 줌(±1)은 부모·자식으로 부족 1 단계(판정 기준 < 2) · 장수 절반
      const u = src.tiles[0].replace('{z}', tl.z).replace('{x}', tl.x).replace('{y}', src.scheme === 'tms' ? 2 ** tl.z - 1 - tl.y : tl.y);
      if (cacheable(u)) { want.add(u); if (!zOf.has(u)) zOf.set(u, tl.z); }
    }
  }
  const out = [...want];
  // order 'need' — 비행이 지나는 순서(낮은 줌부터) · 짝수 줌 먼저(모두 받기 전에 눌러도 부족 ≤ 1) · 착지 줌은 맨 뒤(착지 직전 부모로 1 단계)
  if (order === 'need') { const k = (u) => { const z = zOf.get(u); return (z % 2 ? 100 : 0) + z; }; out.sort((a, b) => k(a) - k(b)); }
  return out;
}
/** 원천(호스트)별 동시 요청 상한 — 여러 pull() 이 겹쳐도(하강 · 의도 · 배경) 합이 이 값을 넘지 않는다.
    EOX: 한 탭 24(판정 3차 재실측: 32 는 다리 767 장 중 205 거절 · 실측 2026-09-27 · 브라우저 h2 60 장: conc 6 = 16 장/s · 20 = 41 장/s · 40 = 89 장/s · 거절 0 — 두 워커 병렬 폭주 때만 CORS 없는 거절).
    prio — 0 = 지금 보일 것(후퇴 게이트 · 클릭한 하강) · 1 = 다음 하강(글로브→으슥아타) · 2 = 배경. 빈 슬롯은 낮은 숫자부터. */
const HOST_MAX = { 'tiles.maps.eox.at': 24, 'gibs.earthdata.nasa.gov': 24, 'tiles.maps.eox.at#bg': 6 }, HOST_DEF = 16, inflight = {}, waiters = {};
const hostOf = (u) => u.replace(/^[a-z]+:\/\//, '').split('/')[0];
/** 배경(prio 2 · 다음 다리)은 EOX 에서 배경 몫 6 과 호스트 몫 24 를 둘 다 쥔다 — 합이 24 를 넘지 않는다(2차 부하 봉투 그대로).
    판정 3차 실측: 배경을 호스트 몫 밖(+12)으로 두니 EOX 가 CORS 없는 거절 93 건/45 s · 호스트 몫을 16 으로 줄이면 하강 부족 1.6 s. */
async function slot(h0, prio = 0, signal = null) {
  if (prio >= 2 && HOST_MAX[h0 + '#bg']) {
    const r1 = await slotRaw(h0 + '#bg', prio, signal);
    let r2; try { r2 = await slotRaw(h0, prio, signal); } catch (e) { r1(); throw e; }
    return () => { r2(); r1(); };
  }
  return slotRaw(h0, prio, signal);
}
async function slotRaw(h, prio = 0, signal = null) {
  const max = HOST_MAX[h] || HOST_DEF, w = (waiters[h] ||= []);
  // 슬롯은 반환 때 대기열 머리(낮은 prio 먼저)에게 곧바로 넘긴다 — 방금 끝난 낮은 순위 lane 이 빈 슬롯을 가로채지 못하게(우선순위 보장)
  const release = () => { if (w.length) w.shift().r(); else inflight[h]--; };
  if ((inflight[h] || 0) < max && !w.length) { inflight[h] = (inflight[h] || 0) + 1; return release; }
  await new Promise((r, j) => {
    const me = { prio, r };
    const i = w.findIndex((x) => x.prio > prio); w.splice(i < 0 ? w.length : i, 0, me);
    // 지도가 요청을 거두면(줌이 지나감) 줄에서 빠진다 — 지나간 줌 타일이 슬롯을 먹지 않게
    if (signal) signal.addEventListener('abort', () => { const k = w.indexOf(me); if (k >= 0) { w.splice(k, 1); j(new DOMException('aborted', 'AbortError')); } }, { once: true });
  });
  return release;
}
/** URL 들을 HTTP 캐시로(MapLibre 와 같은 fetch 모드 · 캐시 키 동일 — mode cors · credentials same-origin · Origin 같음 · EOX Vary: Origin). conc 병렬. */
export async function pull(urls, { conc = 16, onProgress, prio = 0, gate = null } = {}) {
  let ok = 0, done = 0;
  // 원천(호스트)마다 따로 conc 병렬 — EOX · GIBS · V-World 가 한 줄에 서지 않게(호스트당 공정 사용은 그대로)
  const groups = {}; urls.forEach((u) => { const h = u.replace(/^[a-z]+:\/\//, '').split('/')[0]; (groups[h] ||= []).push(u); });
  const lane = (list) => { let i = 0; return async () => {
    while (i < list.length) {
      if (gate) await gate();   // 배경 lane — 사용자가 비행 중이면 멈춘다(비행 타일과 소켓 다툼 0)
      const u = list[i++];
      if (u === undefined) break;
      let p = pulled.get(u);
      if (!p) {
        const release = await slot(hostOf(u), prio);
        p = pulled.get(u) || (u.startsWith('lxm://') ? memGet(u.replace(/^lxm:\/\//, 'https://')).then((b) => !!b)
          : u.startsWith('lxc://') ? dcGet(u.replace(/^lxc:\/\//, 'https://')).then((b) => !!b)
          : fetch(u, { mode: 'cors', credentials: 'same-origin' }).then(async (r) => { if (r.ok) await r.arrayBuffer(); return r.ok; }).catch(() => false));
        if (!pulled.has(u)) { pulled.set(u, p); p.then((ok) => { if (!ok) pulled.delete(u); }); }
        p.finally(release);
      }
      if (await p) ok++;
      done++; onProgress && onProgress(done, urls.length);
    }
  }; };
  await Promise.all(Object.values(groups).flatMap((list) => { const one = lane(list); return Array.from({ length: Math.min(conc, list.length) }, one); }));
  return { tiles: urls.length, ok };
}
/** 비행 경로 타일 미리 받기 — 반환 {tiles, ok, ms}. 화면에는 '영상 미리 받기 n/m' 으로 정직하게 보인다(boot). */
export async function prefetchFlight(map, to, specs, { samples = 28, mode = 'fly', from = null, conc = 16, onProgress, dwell = 1, endFirst = true, order = null, prio = 0 } = {}) {
  const t0 = performance.now();
  const urls = tilesFor(map, flySamples(map, to, { n: samples, mode, from }), specs, { dwell, endFirst: order ? false : endFirst, order });
  const r = await pull(urls, { conc, onProgress, prio });
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
  const layers = style._order.map((id) => style._layers[id]).filter((l) => l.type === 'raster' && l.id !== 'gibs-cap' && l.visibility !== 'none'   // 해빙 바닥층은 영상이 아니다(부족 판정 제외)
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
export async function arriveCross(stage, cam, dur, layers, { move = ease, prepared = null, at = 0.4, fade = [], waitPrep = false, onLand = null } = {}) {
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
  // 판정 3차(F2-D must_fix · 메이크틸라 하강 = 컷): 덮개는 '보이는 지도'가 착지 줌 −1 이내에 닿은 뒤에만 — 시간 비율(dur·at)은
  // 실제 비행 지속(초장거리 3200)과 어긋나 1.0–1.3 s 지점에 착지 정지 프레임을 덮어 Δz≈8 컷을 만들었다.
  const near = new Promise((res) => {
    const tz = cam.zoom ?? A.getZoom();
    const chk = () => { if (Math.abs(A.getZoom() - tz) <= 1) { A.off('move', chk); res(); } };
    A.on('move', chk); chk();
    moving.then(() => { A.off('move', chk); res(); });
  });
  Promise.all([prep, near]).then(() => { if (!over) root.dataset.bcover = '1'; });
  await moving;
  fast();
  onLand && onLand();   // 착지 즉시(카드 · 판정 1차 must_fix 4) — 크로스페이드 마무리는 뒤에서
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
/* ── 두 번째 지도 EOX(b-eox · 소쿨룩 스와이프 2025 쪽) ─────────────────
   F2-D 2차: 비행 대역(warmFlightB · coverFlight)은 폐기 — 하강은 HTTP 캐시 선행(비행이 지나는 순서 · 짝수 줌 먼저)만(결과 문서 §1). */
/** 두 번째 지도의 EOX(b-eox) 켜고 끄기 — 층은 늘 '보이게' 두고 불투명도만. */
export function eoxB(B, on) { if (B && B.getLayer('b-eox')) { B.setLayoutProperty('b-eox', 'visibility', 'visible'); B.setPaintProperty('b-eox', 'raster-opacity', on ? 1 : 0); } }

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

/** 락온 — F1-A fx/arrive.lock(380 = 180 · 80 · 120 · tokens-v2 .cw-lock) · tag = {name, cyr, sub} → 깃발(화면 안으로 반전 · fx flip). */
export function lockOn(stage, bbox, tag = null) {
  const html = tag ? `<b>${tag.name}</b>${tag.cyr ? `<span class="g-cyr" lang="ru">${tag.cyr}</span>` : ''}${tag.sub ? `<small>${tag.sub}</small>` : ''}` : '';
  const L = fxLock(stage.root, stage.map, { lngLat: [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2], bbox, html });
  L.box.classList.add('gs-lock');
  const h = { el: L.box, done: L.done, remove() { stage.map.off('move', L.place); L.box.remove(); } };
  stage.locks.push(h);
  return h;
}
export function clearLocks(stage) { stage.locks.splice(0); fxClearLocks(); }

/** 스윕 — 청록 1px + 24px 꼬리(tokens-v2 .cw-sweep) · 1000 · 끝나면 resolve(그 뒤에 결과 현상 500).
    fx 는 스윕을 arrive() 안에서만 돌린다(단독 export 없음) → 결과 문서 인터페이스 요청 1. 값은 fx 와 같다(1000 · 선형). */
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

/** 지명 라벨(한 줄 · 점 위 가운데) — 이동 추적. 시범지 상자는 pinBox(fx anchor · 화면 안으로 반전). */
export function pin(stage, lnglat, html, cls = 'g-place') {
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
/** 시범지 상자 — F1-A fx/glass.anchor(점 옆 · 화면 밖이면 반대쪽으로 접고 · 카드·HUD 를 피한다) + 점 표지.
    판정 1차 must_fix 5: 'Bishkek … bo…' 라벨이 화면 밖으로 잘림 → 반전 · 여백 16 안. */
export function pinBox(stage, lnglat, html, { avoid = [], below = false } = {}) {
  const el = document.createElement('div');
  el.className = 'g-pin g-pin--anchored';   // g-in(transform 애니메이션)은 anchor 의 transform 을 덮는다 → 불투명도만
  el.innerHTML = `<div class="g-pin__box">${html}</div>`;
  const dot = document.createElement('i');
  dot.className = 'g-pin__dot';
  stage.root.append(dot, el);
  // below = 점 아래로(이웃 시범지 상자와 위·아래로 엇갈려 겹침 0 · 판정 1차 must_fix 5 'Sokuluk 라벨 겹침')
  const detach = fxAnchor(el, stage.map, lnglat, { dx: 12, dy: below ? 12 : -12 - (el.offsetHeight || 60), avoid });
  // 점이 화면 밖이면 상자도 숨긴다(가리키는 곳 없는 라벨 0) — anchor 는 상자만 화면 안으로 접는다
  const placeDot = () => { const p = stage.map.project(lnglat); const out = p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight;
    dot.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`; dot.hidden = out; el.style.visibility = out ? 'hidden' : ''; };
  placeDot(); stage.map.on('move', placeDot);
  const h = { el, remove() { detach(); stage.map.off('move', placeDot); el.remove(); dot.remove(); } };
  stage.pins.push(h);
  return h;
}
export function clearPins(stage) { stage.pins.splice(0).forEach((p) => p.remove()); }

/** 프로비넌스 칩 — F1-A fx/provenance.prov(봉투 없으면 throw · system-v2 §5 문법 7).
    영문판: 꼬리표는 영문 basis · 호버 카드도 영문(fx 카드는 국문 고정 → 결과 문서 인터페이스 요청 2). extra = 덧붙일 조각(HTML). */
export function prov(env, extra = '') {
  const s = document.createElement('span');
  fxProv(s, env, { tagText: basisLabel(env.basis) });
  s.classList.add('gs-prov');
  s.removeAttribute('title');
  const card = s.querySelector('.xi-prov-card');
  if (locale !== 'ko' && card) {
    const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const v = typeof env.value === 'number' ? num(env.value, Number.isInteger(env.value) ? 0 : 2) : env.value === null ? '—' : env.value;
    card.innerHTML = `<span class="br tl"></span><span class="br tr"></span><span class="br bl"></span><span class="br br_"></span>`
      + `<b>${esc(basisLabel(env.basis))}</b> · value ${esc(v)} ${esc(env.unit)}<br>source ${esc(env.source)}<br>as of ${esc(env.as_of)}${env.note ? `<br>${esc(env.note)}` : ''}`;
  }
  if (extra) (card ? card.insertAdjacentHTML('beforebegin', extra) : s.insertAdjacentHTML('beforeend', extra));
  return s;
}

/** 스와이프 — F1-A fx/swipe(clip-path · 손잡이 끌기 · ←/→ ±4 % · 6–94 %). 좌 = 지도 A · 우 = 지도 B · 양쪽 출처 칩.
    반환 {set, glide, off} — glide 는 사다리 값(1000/1250 · --e-cam) 트윈으로 fx set 을 부른다. */
export function swipe(stage, { left, right, at = 50 }) {
  const root = stage.root;
  const bar = root.querySelector('.gs-swipe');
  if (!stage.fxSwipe) {
    stage.fxSwipe = fxSwipe({ A: stage.map, B: ensureMapB(stage), wrap: bar, handle: bar.querySelector('.gs-swipe__grip'),
      chipL: bar.querySelector('.gs-swipe__side--l'), chipR: bar.querySelector('.gs-swipe__side--r'),
      onChange: (v) => { stage.swipeAt = v; root.style.setProperty('--swipe', v + '%'); } });
  }
  const W = stage.fxSwipe;
  root.dataset.swipe = '1';
  W.open(at, { left: left.outerHTML, right: right.outerHTML });
  return { set: (v) => W.set(v, false), glide: (to, dur = D[1600]) => { const from = stage.swipeAt; return tween(dur, (k) => W.set(from + (to - from) * k, false), EASE.cam); },
           off() { W.close(); delete root.dataset.swipe; } };
}

/* ── GIBS 어제 · 날짜 스크러버(타일 페이드 500) ──────────────────────── */
const GIBS = (d) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;
const BM = 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
export function isoMinus(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); }

export function addGibs(map) {
  const y = yesterdayUTC();
  // 극지 무자료(VIIRS 일일 궤도 공백 = 검은 캡) → 아래에 Blue Marble 정적 바닥(같은 GIBS · 공개) · VIIRS 는 z3+ · ±79° 안에서만(z3 극 행 79.2–85° 제외)
  // Blue Marble 의 북극해는 짙은 남색 — 극 캡이 '검은 띠'로 번쩍였다(판정 2차). VIIRS 와 같은 z3+ · ±79°(z3 극 행 제외) → 극 캡은 순백 바탕.
  // 하강 정점(글로브 하강의 flyTo minZoom · 위도 보정으로 z ≈ 1.2 · 타일 z2)용 z2 전용 층 — 극 행(±66.5 밖)을 빼 남색 캡 0 · 흰 지구 0
  // 극 캡 해빙 바닥층(판정 2차: GIBS ±79° 밖 북극이 순백 페이지와 같은 흰색으로 뚫려 구체 실루엣이 깨졌다) — Blue Marble z1–3 · 경계 없음(±85 · 극 캡은 MapLibre
  // 글로브가 가장자리 타일로 닫는다) · 무채 · 밝게(짙은 남색 북극해 '검은 띠' 재발 0 · 판정 2차 전회) · 맨 아래. 구면 바탕은 순백 그대로(늦은 가장자리 타일 = 흰 테두리 · 유령 원판 0).
  map.addSource('gibs-cap', { type: 'raster', tiles: [mem(BM)], tileSize: 256, minzoom: 1, maxzoom: 3, attribution: 'NASA Blue Marble' });
  map.addLayer({ id: 'gibs-cap', type: 'raster', source: 'gibs-cap', maxzoom: 5.5, paint: { 'raster-saturation': -1, 'raster-brightness-min': 0.78, 'raster-fade-duration': D[500] } });
  for (const [id, url] of [['gibs-bm2', BM], ['gibs-a2', GIBS(y)]]) {
    map.addSource(id, { type: 'raster', tiles: [mem(url)], tileSize: 256, minzoom: 2, maxzoom: 2, bounds: [-180, -66, 180, 66], attribution: 'NASA GIBS' });
    map.addLayer({ id, type: 'raster', source: id, maxzoom: 1.6, paint: { 'raster-fade-duration': D[500] } });
  }
  map.addSource('gibs-bm', { type: 'raster', tiles: [mem(BM)], tileSize: 256, minzoom: 3, maxzoom: 8, bounds: [-180, -79, 180, 79], attribution: 'NASA Blue Marble' });
  map.addLayer({ id: 'gibs-bm', type: 'raster', source: 'gibs-bm', paint: { 'raster-fade-duration': D[500] } });
  for (const k of ['a', 'b']) {
    map.addSource('gibs-' + k, { type: 'raster', tiles: [mem(GIBS(y))], tileSize: 256, minzoom: 3, maxzoom: 9, bounds: [-180, -79, 180, 79], attribution: 'NASA GIBS / ESDIS' });
    map.addLayer({ id: 'gibs-' + k, type: 'raster', source: 'gibs-' + k, layout: { visibility: k === 'a' ? 'visible' : 'none' },   // 뒷면은 쓸 때만(같은 타일 이중 요청 0)
      paint: { 'raster-opacity': k === 'a' ? 1 : 0, 'raster-opacity-transition': { duration: D[500], delay: 0 }, 'raster-fade-duration': D[500] } });
  }
  // z2 정점 타일(2 × 8장)은 바로 메모리에 — 첫 하강의 정점에서 기다리지 않게
  const z2 = []; for (const u of [BM, GIBS(y)]) for (let x = 0; x < 4; x++) for (const yy of [1, 2]) z2.push(mem(u).replace('{z}', 2).replace('{x}', x).replace('{y}', yy));
  for (let x = 0; x < 4; x++) for (const yy of [0, 3]) z2.push(mem(BM).replace('{z}', 2).replace('{x}', x).replace('{y}', yy));   // 극 행(해빙 바닥층)
  for (let x = 0; x < 8; x++) for (const yy of [0, 1, 6, 7]) z2.push(mem(BM).replace('{z}', 3).replace('{x}', x).replace('{y}', yy));
  pull(z2, { conc: 8 }).catch(() => {});
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
