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

/**
 * 스윕 하나. rate = 초당 타일 수(측정된 실제 진행 속도로 다시 계산된다).
 * onStep({i, total, tps, eta, hits, tile, det}) 로 매 칸을 알린다.
 */
export function makeSweep({ tiles, index, rate = 27, offset = 0 }) {
  let i = Math.floor(tiles.length * offset);
  const started = performance.now();
  let steps = 0;
  let carry = 0;              // 프레임당 소수점 이하 진행을 버리지 않는다
  let hits = 0;
  let det = 0;
  const state = new Map();               // "x|y" → 'idle' | 'live' | 'done' | 'hit'
  for (const [x, y] of tiles) state.set(`${x}|${y}`, 'idle');
  for (let k = 0; k < i; k++) {
    const [x, y] = tiles[k];
    const n = index?.byTile.get(`${x}|${y}`)?.length || 0;
    state.set(`${x}|${y}`, n ? 'hit' : 'done');
    if (n) { hits++; det += n; }
  }

  return {
    get i() { return i; },
    get total() { return tiles.length; },
    get hits() { return hits; },
    get det() { return det; },
    state,
    /** 경과 시간만큼 앞으로 간다. 화면 주사율과 무관하게 rate 를 지킨다. */
    advance(dtMs) {
      carry += (dtMs / 1000) * rate;
      const step = Math.floor(carry);
      carry -= step;
      const want = Math.min(tiles.length, i + Math.max(0, step));
      let moved = false;
      while (i < want) {
        const [x, y] = tiles[i];
        const k = `${x}|${y}`;
        const n = index?.byTile.get(k)?.length || 0;
        state.set(k, n ? 'hit' : 'done');
        if (n) { hits++; det += n; }
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
      for (const k of state.keys()) state.set(k, 'idle');
    },
    /** 지도에 넣을 GeoJSON. */
    features() {
      const out = [];
      for (const [x, y] of tiles) {
        const st = state.get(`${x}|${y}`);
        out.push(tileFeature(x, y, Z, { st }));
      }
      return { type: 'FeatureCollection', features: out };
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
