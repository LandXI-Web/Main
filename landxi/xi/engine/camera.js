/* camera.js — flyLadder: 해상도 공간 이징(E0-S CAM_EASE 승격 · ximap-signature.js:35-43 을 옮겨 개작).
   이징을 줌(로그 척도)에 바로 걸면 앞 300ms 에 80 % 가 끝나고 뒤가 정지로 읽힌다. 대신 해상도(m/px)가 깊이 2^14 의
   가상 하강에서 법전 이징(--e-cam .16,1,.3,1)대로 줄어든다고 보고, 지난 줌 단계의 비율을 진행으로 쓴다.
   중심은 해상도 가중(목표가 화면에 수렴) · pitch 는 도착 직전(진행 55 % 이후)에만 오른다 · 카메라 점프 0 을 기록으로 증명.
   한 rAF 에서 A·B 두 지도에 같은 카메라를 준다(스와이프 · 스윕 캔버스 동기 지연 0). */
export function bezier(x1, y1, x2, y2) {
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
export const E_UI = bezier(0.22, 1, 0.36, 1);
export const E_ARRIVE = bezier(0.15, 1, 0.3, 1);
export const E_CAM = bezier(0.16, 1, 0.3, 1);
const DEPTH_Z = 14, DEPTH_C = 1 - 2 ** -DEPTH_Z;
export const CAM_EASE = (t) => (t >= 1 ? 1 : -Math.log2(1 - E_CAM(t) * DEPTH_C) / DEPTH_Z);
export const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const mx = (lng) => (lng + 180) / 360;
const my = (lat) => { const s = Math.sin((lat * Math.PI) / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
const lng = (x) => x * 360 - 180;
const lat = (y) => (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const CAMLOG = { frames: [], flights: [] };   // [t, zoom, lng, lat, pitch, flightId]
let flightSeq = 0;
let current = null;
/** 진행 중인 비행을 멈춘다(사용자 입력 · 새 비행). */
export function stopFlight() { if (current) { current.stop = true; current = null; } }

/**
 * flyLadder(maps, to, { duration, pitchFrom, onFrame }) → Promise(arrived:boolean)
 * maps = [A, B?] · to = { center, zoom, pitch?, bearing? } · duration = 1600 | 2400 | 1250 | 1000
 */
export function flyLadder(maps, to, { duration = 1600, onFrame } = {}) {
  const [A] = maps;
  stopFlight();
  const id = ++flightSeq;
  const a = { c: A.getCenter(), z: A.getZoom(), p: A.getPitch(), b: A.getBearing() };
  const b = { c: window.maplibregl.LngLat.convert(to.center), z: to.zoom, p: to.pitch ?? a.p, b: to.bearing ?? a.b };
  const set = (cam) => { for (const m of maps) if (m) m.jumpTo(cam); };
  if (RM() || duration <= 0) { set({ center: b.c, zoom: b.z, pitch: b.p, bearing: b.b }); return Promise.resolve(true); }
  const ax = mx(a.c.lng), ay = my(a.c.lat), bx = mx(b.c.lng), by = my(b.c.lat);
  const ra = 2 ** -a.z, rb = 2 ** -b.z, dz = Math.abs(b.z - a.z);
  let db = b.b - a.b; if (db > 180) db -= 360; if (db < -180) db += 360;
  const me = { stop: false };
  current = me;
  CAMLOG.flights.push({ id, from: [a.c.lng, a.c.lat, a.z, a.p], to: [b.c.lng, b.c.lat, b.z, b.p], duration, t0: performance.now() });
  return new Promise((res) => {
    const t0 = performance.now();
    const frame = (now) => {
      if (me.stop) return res(false);
      const t = Math.min(1, (now - t0) / duration), p = CAM_EASE(t);
      const z = a.z + (b.z - a.z) * p;
      const w = dz < 0.05 ? E_CAM(t) : (ra - 2 ** -z) / (ra - rb);
      const cam = {
        center: [lng(ax + (bx - ax) * w), lat(ay + (by - ay) * w)], zoom: z,
        pitch: a.p + (b.p - a.p) * (b.p > a.p ? smooth((p - 0.55) / 0.45) : E_CAM(t)),
        bearing: a.b + db * E_CAM(t),
      };
      set(cam);
      CAMLOG.frames.push([Math.round(now), +z.toFixed(4), +cam.center[0].toFixed(6), +cam.center[1].toFixed(6), +cam.pitch.toFixed(2), id]);
      if (CAMLOG.frames.length > 8000) CAMLOG.frames.shift();
      onFrame && onFrame(cam, t);
      if (t < 1) requestAnimationFrame(frame); else { if (current === me) current = null; res(true); }
    };
    requestAnimationFrame(frame);
  });
}

/** 카메라 기록에서 점프(한 프레임에 줌 > .5 또는 화면 폭 25 % 넘는 이동)를 센다. */
export function jumps(frames = CAMLOG.frames) {
  let n = 0;
  for (let i = 1; i < frames.length; i++) {
    const [, z0, x0, y0, , f0] = frames[i - 1], [, z1, x1, y1, , f1] = frames[i];
    if (f0 !== f1) continue;
    const scale = 512 * 2 ** z1 / 1440, dx = Math.abs(mx(x1) - mx(x0)) * scale, dy = Math.abs(my(y1) - my(y0)) * scale;
    if (Math.abs(z1 - z0) > 0.5 || dx > 0.25 || dy > 0.25) n++;
  }
  return n;
}

/** 필름 → 지도 인계(설계서 §3.5 S4): sessionStorage.lx_cam {center, zoom, bearing, pitch, t} — 60s 안의 것만. */
export function readHandoff() {
  try {
    const c = JSON.parse(sessionStorage.getItem('lx_cam') || 'null');
    if (c && Array.isArray(c.center) && Number.isFinite(c.zoom) && (!c.t || Date.now() - c.t < 60000)) { sessionStorage.removeItem('lx_cam'); return c; }
  } catch { /* */ }
  return null;
}

/**
 * pathCams(from, to, { step }) — flyLadder 가 지날 카메라를 줌 step 간격으로(선적재용 · 같은 식).
 * from/to = { center:[lng,lat], zoom, pitch } → [{ center, zoom, pitch }]
 */
export function pathCams(from, to, { step = 0.5 } = {}) {
  const ax = mx(from.center[0]), ay = my(from.center[1]), bx = mx(to.center[0]), by = my(to.center[1]);
  const ra = 2 ** -from.zoom, rb = 2 ** -to.zoom, dz = to.zoom - from.zoom;
  const n = Math.max(1, Math.ceil(Math.abs(dz) / step)), out = [];
  for (let i = 0; i <= n; i++) {
    const z = from.zoom + (dz * i) / n;
    const w = Math.abs(dz) < 0.05 ? i / n : (ra - 2 ** -z) / (ra - rb);
    const p = dz ? (z - from.zoom) / dz : 1;
    const pa = from.pitch || 0, pb = to.pitch ?? pa;
    out.push({ center: [lng(ax + (bx - ax) * w), lat(ay + (by - ay) * w)], zoom: z, pitch: pa + (pb - pa) * (pb > pa ? smooth((p - 0.55) / 0.45) : p) });
  }
  return out;
}
