// 모의 실행(simulated run) — 그러나 훑는 타일과 세는 탐지는 진짜다.
// 1) 남원 전역 정사영상 z14 후보 격자(21×15=315칸)를 실제로 로드해 본다.
//    응답이 오는 칸만 실타일이다 → 총량은 브라우저가 센 값이고, 우리가 적은 값이 아니다.
// 2) 스윕은 그 실타일 목록을 순서대로 지나가며, 각 타일 안에 들어 있는
//    실제 탐지(assets/data/geo/results/*.geojson)를 세어 누적한다.
// 3) 진행률·처리속도(tiles/s)·ETA 는 전부 측정값이다.
import { SWEEP_TILE, SWEEP_TILE_URL } from './db-data.js';
import { tileFeature, tile2lng, tile2lat } from './db-plate.js';

const Z = SWEEP_TILE.z;

/** 후보 격자 전체. */
export function candidates() {
  const out = [];
  for (let y = SWEEP_TILE.y0; y <= SWEEP_TILE.y1; y++) {
    for (let x = SWEEP_TILE.x0; x <= SWEEP_TILE.x1; x++) out.push([x, y]);
  }
  return out;
}

// 실타일 판정 — 개발 서버는 없는 타일에 1x1 빈 PNG 를 준다(404 콘솔 오류를 피하려고).
// 그래서 "로드됐다"가 아니라 "256px 짜리가 왔다"로 센다. 배포에서는 404 → onerror.
const probeOne = (x, y) => new Promise((res) => {
  const im = new Image();
  im.onload = () => res(im.naturalWidth >= 64);
  im.onerror = () => res(false);
  im.src = SWEEP_TILE_URL(Z, x, y);
});

/** 후보를 병렬로 훑어 실제로 존재하는 타일만 남긴다. */
export async function realTiles(onProgress) {
  const cand = candidates();
  const real = [];
  const LANE = 24;
  let i = 0;
  await Promise.all(Array.from({ length: LANE }, async () => {
    while (i < cand.length) {
      const k = i++;
      const [x, y] = cand[k];
      if (await probeOne(x, y)) real.push([x, y]);
      if (onProgress) onProgress(k + 1, cand.length, real.length);
    }
  }));
  // 행 우선(북→남, 서→동)으로 정렬 — 스윕이 화면에서 위에서 아래로 지나간다.
  real.sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return real;
}

/* ── 탐지 → z14 타일 색인 ─────────────────────────────────────────────── */
const lng2tx = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);
const lat2ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

function centroid(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const rings = g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : null;
  if (!rings) return null;
  let sx = 0, sy = 0, n = 0;
  for (const pt of rings[0]) { sx += pt[0]; sy += pt[1]; n++; }
  return n ? [sx / n, sy / n] : null;
}

/** geojson 한 벌을 읽어 z14 타일별 탐지 수와 대표점 목록을 만든다. */
export async function indexDetections(url) {
  const j = await fetch(url).then((r) => r.json());
  const byTile = new Map();
  const pts = [];
  for (const f of j.features) {
    const c = centroid(f.geometry);
    if (!c) continue;
    pts.push(c);
    const k = `${lng2tx(c[0], Z)}|${lat2ty(c[1], Z)}`;
    const cur = byTile.get(k);
    if (cur) cur.push(c); else byTile.set(k, [c]);
  }
  return { byTile, pts, total: pts.length };
}

/* --v3-ease 를 JS 에서 그대로 쓴다(칸의 번쩍임과 CSS 전환이 같은 이징이어야 한다). */
const EASE = (() => {
  const [x1, y1, x2, y2] = [0.15, 1, 0.3, 1];
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const fx = (t) => ((ax * t + bx) * t + cx) * t;
  const fy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    let t = x;
    for (let i = 0; i < 5; i++) {
      const d = (3 * ax * t + 2 * bx) * t + cx;
      if (Math.abs(d) < 1e-6) break;
      t -= (fx(t) - x) / d;
    }
    return fy(Math.min(1, Math.max(0, t)));
  };
})();

/* 칸의 알파 — 처리되면 28% 로 번쩍했다가 500ms 에 걸쳐 제자리(8~12%)로 가라앉는다.
   불투명한 사각형은 만들지 않는다: 판이 사진으로 남아야 한다. */
export const FLASH_MS = 500;
const A_DONE = 0.08;
const A_HIT = 0.12;
const A_FLASH = 0.28;

/**
 * 스윕 하나. rate = 초당 타일 수(측정된 실제 진행 속도로 다시 계산된다).
 * 기본 rate 는 8.33 = 120ms 에 한 칸(스윕 틱).
 */
export function makeSweep({ tiles, index, rate = 1000 / 120, offset = 0 }) {
  let i = Math.floor(tiles.length * offset);
  const started = performance.now();
  let steps = 0;
  let carry = 0;              // 프레임당 소수점 이하 진행을 버리지 않는다
  let hits = 0;
  let det = 0;
  const state = new Map();               // "x|y" → 'idle' | 'live' | 'done' | 'hit'
  const lit = new Map();                 // "x|y" → 처리된 시각(번쩍임 기준)
  const counts = new Map();              // "x|y" → 그 칸의 탐지 수
  let dets = [];                         // 지나간 칸에서 쌓인 탐지 대표점
  for (const [x, y] of tiles) state.set(`${x}|${y}`, 'idle');

  const mark = (k, now) => {
    const pts = index?.byTile.get(k) || null;
    const n = pts ? pts.length : 0;
    state.set(k, n ? 'hit' : 'done');
    counts.set(k, n);
    lit.set(k, now);
    if (n) { hits++; det += n; dets = dets.concat(pts); }
    return n;
  };

  for (let k = 0; k < i; k++) mark(`${tiles[k][0]}|${tiles[k][1]}`, -1e9);

  return {
    get i() { return i; },
    get total() { return tiles.length; },
    get hits() { return hits; },
    get det() { return det; },
    state,
    /** 지금 칸의 탐지 수 — 현재 칸 안에 찍는 작은 숫자. */
    get liveCount() {
      const t = tiles[Math.min(i, tiles.length - 1)];
      return t ? (counts.get(`${t[0]}|${t[1]}`) ?? 0) : 0;
    },
    /** 경과 시간만큼 앞으로 간다. 화면 주사율과 무관하게 rate 를 지킨다. */
    advance(dtMs) {
      carry += (dtMs / 1000) * rate;
      const step = Math.floor(carry);
      carry -= step;
      const want = Math.min(tiles.length, i + Math.max(0, step));
      let moved = false;
      const now = performance.now();
      while (i < want) {
        mark(`${tiles[i][0]}|${tiles[i][1]}`, now);
        i++; steps++; moved = true;
      }
      if (i > 0 && i < tiles.length) {
        const [lx, ly] = tiles[Math.min(i, tiles.length - 1)];
        state.set(`${lx}|${ly}`, 'live');
      }
      return moved;
    },
    get tps() {
      const s = (performance.now() - started) / 1000;
      return s > 0.4 ? steps / s : rate;
    },
    get eta() {
      const t = this.tps;
      return t > 0 ? Math.max(0, Math.round((tiles.length - i) / t)) : 0;
    },
    get done() { return i >= tiles.length; },
    reset() {
      i = 0; hits = 0; det = 0; steps = 0; carry = 0;
      dets = [];
      lit.clear(); counts.clear();
      for (const k of state.keys()) state.set(k, 'idle');
    },
    /** 누적된 탐지 점. 칸이 지나갈 때마다 늘어난다. */
    detFC() {
      return { type: 'FeatureCollection', features: dets.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } })) };
    },
    /** 지도에 넣을 GeoJSON. a = 채움 알파, b = 현재 칸 테두리의 숨(호흡). */
    features(now = performance.now()) {
      const out = [];
      const breath = 0.62 + 0.38 * (0.5 - 0.5 * Math.cos((now % 2400) / 2400 * Math.PI * 2));
      for (const [x, y] of tiles) {
        const k = `${x}|${y}`;
        const st = state.get(k);
        let a = 0;
        if (st === 'done' || st === 'hit') {
          const base = st === 'hit' ? A_HIT : A_DONE;
          const dt = now - (lit.get(k) ?? -1e9);
          a = dt < FLASH_MS ? base + (A_FLASH - base) * (1 - EASE(dt / FLASH_MS)) : base;
        }
        out.push(tileFeature(x, y, Z, { st, a: +a.toFixed(3), b: st === 'live' ? +breath.toFixed(3) : 0 }));
      }
      return { type: 'FeatureCollection', features: out };
    },
    /** 현재 스캔 칸의 중심(칸 안에 숫자를 놓기 위해). */
    liveCenter() {
      const t = tiles[Math.min(i, tiles.length - 1)];
      if (!t) return null;
      return [(tile2lng(t[0], Z) + tile2lng(t[0] + 1, Z)) / 2, (tile2lat(t[1], Z) + tile2lat(t[1] + 1, Z)) / 2];
    },
    /** 현재 스캔 라인의 위도(스캔 스트립·라벨용). */
    lat() {
      const t = tiles[Math.min(i, tiles.length - 1)];
      return t ? tile2lat(t[1], Z) : null;
    },
    lng() {
      const t = tiles[Math.min(i, tiles.length - 1)];
      return t ? tile2lng(t[0], Z) : null;
    },
  };
}

export const fmtEta = (s) => (s >= 60 ? `${Math.floor(s / 60)}분 ${String(s % 60).padStart(2, '0')}초` : `${s}초`);
