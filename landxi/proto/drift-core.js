/* 표류 이류 계산 — 진짜로 도는 계산. 화면과 분리해 둔다(시험 가능하게).
   속도장만 모의이고 계산은 실제다. 해류 수치모델 산출이 들어오면 sim.js 의 sample() 만 바꾼다. */
import { sample, mToDeg, RUN, DENSITY, landfallOf } from '../assets/data/sim.js';

/** 패치 하나를 입자 구름으로 흩는다. 면적이 넓고 짙을수록 입자가 많다. */
export function seed(patch) {
  const n = Math.min(RUN.maxParticles, Math.max(24, Math.round(patch.areaKm2 * RUN.particlesPerKm2 * (DENSITY[patch.density]?.w || 0.6) * 6)));
  const rKm = Math.sqrt(patch.areaKm2 / Math.PI);
  const deg = mToDeg(patch.lat);
  const ps = [];
  for (let i = 0; i < n; i++) {
    // 원판 안에 고르게 (√u 로 반지름을 잡아야 가장자리에 몰리지 않는다)
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * rKm * 1000;
    ps.push({ src: patch.id, kind: patch.kind, w: DENSITY[patch.density]?.w || 0.6,
      lon: patch.lon + Math.cos(a) * r * deg.x, lat: patch.lat + Math.sin(a) * r * deg.y,
      t0: Date.parse(patch.at), alive: true, land: null, landAt: null });
  }
  return ps;
}

/** 4차 룽게-쿠타 한 걸음. 오일러보다 궤적이 훨씬 덜 휘어 나간다. */
function rk4(lon, lat, h, dtSec, wind) {
  const step = (L, P, hh) => {
    const [u, v] = sample(L, P, hh);
    const d = mToDeg(P);
    return [(u + wind[0]) * d.x, (v + wind[1]) * d.y];
  };
  const [k1x, k1y] = step(lon, lat, h);
  const [k2x, k2y] = step(lon + k1x * dtSec / 2, lat + k1y * dtSec / 2, h + dtSec / 7200);
  const [k3x, k3y] = step(lon + k2x * dtSec / 2, lat + k2y * dtSec / 2, h + dtSec / 7200);
  const [k4x, k4y] = step(lon + k3x * dtSec, lat + k3y * dtSec, h + dtSec / 3600);
  return [lon + (k1x + 2 * k2x + 2 * k3x + k4x) * dtSec / 6,
    lat + (k1y + 2 * k2y + 2 * k3y + k4y) * dtSec / 6];
}

/** 해상풍 — 모의. 3월 동중국해는 북서 계절풍이 남는다. 풍압류는 풍속의 1.8 %. */
const windAt = (h) => {
  const sp = 7.5 + Math.sin(h / 18) * 2.2;                 // m/s
  const dir = (305 + Math.sin(h / 26) * 18) * Math.PI / 180; // 부는 쪽 방향
  return [Math.cos(dir) * sp * RUN.windage, Math.sin(dir) * sp * RUN.windage];
};

/**
 * 궤적을 끝까지 계산한다(예보 전체를 한 번에).
 * 반환: 시각 배열 + 각 시각의 입자 위치 — 재생은 화면이 훑기만 하면 된다.
 */
export function run(patches, { horizonDays = RUN.horizonDays, stepHours = RUN.stepHours, back = false } = {}) {
  const ps = patches.flatMap(seed);
  const steps = Math.round((horizonDays * 24) / stepHours);
  const dt = stepHours * 3600 * (back ? -1 : 1);
  const t0 = Math.min(...ps.map((p) => p.t0));
  const frames = [], landfall = new Map();

  // 패치마다 관측 시각이 다르다. 제 시각이 오기 전에는 움직이지 않는다(그 전엔 바다에 없다).
  const pos = ps.map((p) => ({ ...p, path: [[p.lon, p.lat]], born: back ? 0 : Math.max(0, Math.round((p.t0 - t0) / 3600e3)) }));
  for (let s = 0; s <= steps; s++) {
    const h = s * stepHours * (back ? -1 : 1);
    if (s > 0) {
      const w = back ? [0, 0] : windAt(h);
      pos.forEach((p) => {
        if (!p.alive) return;
        if (!back && Math.abs(h) < p.born) { p.path.push([p.lon, p.lat]); return; }   // 아직 관측 전
        const [nl, na] = rk4(p.lon, p.lat, h, dt, w);
        // 난류 확산 — 실제 바다는 입자를 흩는다. 이게 없으면 구름이 실처럼 가늘어진다.
        const d = mToDeg(p.lat), k = 0.9 * Math.sqrt(Math.abs(dt));
        p.lon = nl + (Math.random() - 0.5) * k * d.x * 2;
        p.lat = na + (Math.random() - 0.5) * k * d.y * 2;
        p.path.push([p.lon, p.lat]);
        if (!back) {
          const lf = landfallOf(p.lon, p.lat);
          if (lf) {
            p.alive = false; p.land = lf.coast.id; p.landAt = t0 + h * 3600e3;
            const cur = landfall.get(lf.coast.id) || { coast: lf.coast, n: 0, w: 0, first: p.landAt, last: p.landAt };
            cur.n++; cur.w += p.w; cur.first = Math.min(cur.first, p.landAt); cur.last = Math.max(cur.last, p.landAt);
            landfall.set(lf.coast.id, cur);
          }
        }
      });
    }
    frames.push({ h, at: t0 + h * 3600e3,
      // 세 번째 값: 0 = 상륙 · -1 = 아직 관측 전(그리지 않는다) · 그 외 = 밀도 가중치
      pts: pos.map((p) => [p.lon, p.lat, !back && Math.abs(h) < p.born ? -1 : (p.alive ? p.w : 0)]) });
  }

  const total = pos.length;
  const arrivals = [...landfall.values()]
    .map((a) => ({ ...a, ratio: +(a.n / total * 100).toFixed(1) }))
    .sort((x, y) => y.n - x.n);
  return { frames, tracks: pos, total,
    arrived: pos.filter((p) => !p.alive).length, arrivals, t0,
    horizonDays, stepHours, back };
}

/** 도착 확률 격자 — 마지막까지 살아 있는 입자 + 상륙 지점을 격자에 눌러 담는다. */
export function probGrid(result, cell = 0.12) {
  const g = new Map();
  result.tracks.forEach((p) => {
    const pts = p.alive ? [p.path[p.path.length - 1]] : [[p.lon, p.lat]];
    pts.forEach(([lo, la]) => {
      const k = `${Math.floor(lo / cell)}:${Math.floor(la / cell)}`;
      const c = g.get(k) || { lon: (Math.floor(lo / cell) + 0.5) * cell, lat: (Math.floor(la / cell) + 0.5) * cell, w: 0 };
      c.w += p.w; g.set(k, c);
    });
  });
  const rows = [...g.values()];
  const max = Math.max(1, ...rows.map((r) => r.w));
  return rows.map((r) => ({ ...r, p: r.w / max, cell }));
}

/** 도착 예상 시각 — 구간별 첫 도달과 절반 도달. */
export function eta(result) {
  return result.arrivals.map((a) => {
    const ps = result.tracks.filter((p) => p.land === a.coast.id).map((p) => p.landAt).sort((x, y) => x - y);
    return { coast: a.coast, n: a.n, ratio: a.ratio,
      first: ps[0], half: ps[Math.floor(ps.length / 2)], last: ps[ps.length - 1] };
  });
}
