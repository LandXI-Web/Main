// 판(plate) — 뷰포트 전체를 채우는 V-World 위성 정사영상 지도.
// 이 파일이 "지도와 어울리는 대시보드"의 절반이다: 세 레지스터가 각각
// 지도 레이어 한 벌을 켠다. 대시보드를 지도 위에 얹는 것이 아니라,
// 지도가 대시보드다.
//   추론 현황  → AOI 윤곽 + z14 실타일 스윕 + 탐지 점 + 큐 핀
//   학습데이터 → 100m 라벨 표본 밀도 격자(+ 점선 결측 칸) + 영상 인벤토리 풋프린트
//   결과 누적  → 시군구별 epoch 적층 기둥(fill-extrusion) + 커버리지 코로플레스
import { resolveVWorld } from './js/sources.js';
import { DONE, COVERAGE, QUEUE, IMG, STACKS, STACK_MAX, SWEEP_TILE } from './db-data.js';


const SIGUNGU_URL = '../assets/data/geo/sigungu.geojson';

const ACCENT = '#006DF7';
const DETECT = '#FFB633';
const TEAL = '#0FA9A0';
const INK = '#010102';

const EMPTY = { type: 'FeatureCollection', features: [] };
const fc = (features) => ({ type: 'FeatureCollection', features });

/* ── 타일 ↔ 좌표 ─────────────────────────────────────────────────────── */
export const tile2lng = (x, z) => (x / 2 ** z) * 360 - 180;
export const tile2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
export function tileBox(x, y, z) {
  const w = tile2lng(x, z), e = tile2lng(x + 1, z);
  const n = tile2lat(y, z), s = tile2lat(y + 1, z);
  return [[w, n], [e, n], [e, s], [w, s], [w, n]];
}
export function tileFeature(x, y, z, props = {}) {
  return { type: 'Feature', properties: { x, y, z, ...props }, geometry: { type: 'Polygon', coordinates: [tileBox(x, y, z)] } };
}

/* ── 100m 격자 집계 ──────────────────────────────────────────────────── */
const M_PER_DEG_LAT = 110540;
function cellKey(lng, lat, m) {
  const dLat = m / M_PER_DEG_LAT;
  const dLng = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return [Math.floor(lat / dLat), Math.floor(lng / dLng), dLat, dLng];
}
/** 탐지 피처 목록 → m 미터 격자 셀 폴리곤(개수 포함). 값이 0인 칸은 만들지 않는다. */
export function densify(points, m = 100) {
  const map = new Map();
  for (const [lng, lat] of points) {
    const [gy, gx, dLat, dLng] = cellKey(lng, lat, m);
    const k = `${gy}|${gx}`;
    const c = map.get(k);
    if (c) { c.n++; } else { map.set(k, { gy, gx, dLat, dLng, n: 1 }); }
  }
  let max = 0;
  for (const c of map.values()) if (c.n > max) max = c.n;
  const feats = [];
  for (const c of map.values()) {
    const y0 = c.gy * c.dLat, y1 = y0 + c.dLat;
    const x0 = c.gx * c.dLng, x1 = x0 + c.dLng;
    feats.push({
      type: 'Feature',
      properties: { n: c.n, w: max ? c.n / max : 0 },
      geometry: { type: 'Polygon', coordinates: [[[x0, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1]]] },
    });
  }
  return { fc: fc(feats), max, cells: feats.length };
}

/** 채워진 칸에 맞닿아 있는데 비어 있는 칸 = 결측(점선 회색).
 *  bbox 전체를 채우면 수만 칸이 되고 의미도 없다 — 표본이 끊긴 자리만 보여 준다. */
export function gapCells(filledFC, m = 100, cap = 4000) {
  const feats = filledFC.features;
  if (!feats.length) return EMPTY;
  const have = new Set();
  let minY = 9e9, maxY = -9e9, minX = 9e9, maxX = -9e9, dLat = 0, dLng = 0;
  for (const f of feats) {
    const r = f.geometry.coordinates[0];
    const lat = r[2][1], lng = r[0][0];
    const [gy, gx, dy, dx] = cellKey(lng + 1e-9, lat + 1e-9, m);
    dLat = dy; dLng = dx;
    have.add(`${gy}|${gx}`);
    if (gy < minY) minY = gy; if (gy > maxY) maxY = gy;
    if (gx < minX) minX = gx; if (gx > maxX) maxX = gx;
  }
  const seen = new Set();
  const out = [];
  for (const key of have) {
    const [gy, gx] = key.split('|').map(Number);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        const ny = gy + dy, nx = gx + dx, k = `${ny}|${nx}`;
        if (have.has(k) || seen.has(k)) continue;
        seen.add(k);
        if (out.length >= cap) continue;
        const y0 = ny * dLat, y1 = y0 + dLat, x0 = nx * dLng, x1 = x0 + dLng;
        out.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[x0, y1], [x1, y1], [x1, y0], [x0, y0], [x0, y1]]] } });
      }
    }
  }
  return fc(out);
}

/* ── 적층 기둥: 시군구 중심에 사각 기둥, epoch 층마다 base/height ──────── */
const COL_M = 2600;   // 기둥 한 변(m)
const H_MAX = 26000;  // 최고 스택의 높이(m) — 축척은 캡션에 적는다
function square(center, m) {
  const [lng, lat] = center;
  const dLat = m / 2 / M_PER_DEG_LAT;
  const dLng = m / 2 / (111320 * Math.cos((lat * Math.PI) / 180));
  return [[[lng - dLng, lat + dLat], [lng + dLng, lat + dLat], [lng + dLng, lat - dLat], [lng - dLng, lat - dLat], [lng - dLng, lat + dLat]]];
}
/** 스크럽 날짜 이하의 층만 세운다 — 스트립을 끌면 기둥이 자란다. */
export function stackFC(uptoDate) {
  const feats = [];
  for (const s of STACKS) {
    for (const l of s.layers) {
      if (uptoDate && l.date > uptoDate) continue;
      feats.push({
        type: 'Feature',
        properties: {
          code: s.code, region: s.region, id: l.id, title: l.title, date: l.date,
          count: l.count, unit: l.unit,
          base: (l.base / STACK_MAX) * H_MAX,
          top: (l.top / STACK_MAX) * H_MAX,
          alt: s.layers.indexOf(l) % 2,
        },
        geometry: { type: 'Polygon', coordinates: square(s.center, COL_M) },
      });
    }
  }
  return fc(feats);
}
export const STACK_SCALE = { colM: COL_M, hMax: H_MAX, per: Math.round(STACK_MAX / (H_MAX / 1000)) };

/* ── 지도 ────────────────────────────────────────────────────────────── */
export async function mountPlate(el) {
  const v = await resolveVWorld();
  const map = new maplibregl.Map({
    container: el,
    attributionControl: false,
    style: {
      version: 8,
      sources: {
        vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0b0e12' } },
        {
          id: 'vsat', type: 'raster', source: 'vsat',
          // −35% 채도. 판이 물러나야 흰 크롬과 액센트 하나가 앞으로 나온다.
          paint: { 'raster-saturation': -0.35, 'raster-contrast': -0.04, 'raster-brightness-max': 0.94, 'raster-fade-duration': 220 },
        },
      ],
    },
    center: [127.55, 35.15],
    zoom: 7.4,
    pitch: 0,
    bearing: 0,
    dragRotate: true,
    maxZoom: 18.5,
    minZoom: 5.5,
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'bottom-right');
  await new Promise((res) => map.on('load', res));

  /* 실경계 헤어라인 — sigungu.geojson 249개. 위성 위에서 흰 실선 한 겹. */
  const sig = await fetch(SIGUNGU_URL).then((r) => r.json());
  const covBy = Object.fromEntries(COVERAGE.map((c) => [c.code, c]));
  for (const f of sig.features) {
    const c = covBy[f.properties.code];
    f.properties.cov = c ? c.coverage : 0;
    f.properties.lit = c ? 1 : 0;
    f.properties.measured = c && c.measured ? 1 : 0;
  }
  // 실측 결과가 있는 두 시군구는 커버리지 목업과 무관하게 표시한다.
  for (const f of sig.features) {
    if (f.properties.code === '52190' || f.properties.code === '46130') f.properties.measured = 1;
  }
  map.addSource('sig', { type: 'geojson', data: sig });

  map.addLayer({
    id: 'sig-cov', type: 'fill', source: 'sig',
    filter: ['>', ['get', 'lit'], 0],
    paint: {
      'fill-color': ACCENT,
      'fill-opacity': ['interpolate', ['linear'], ['get', 'cov'], 0, 0.06, 1, 0.34],
    },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'sig-line', type: 'line', source: 'sig',
    paint: {
      'line-color': '#ffffff',
      'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 1],
      'line-opacity': ['case', ['>', ['get', 'lit'], 0], 0.55, 0.26],
    },
  });
  map.addLayer({
    id: 'sig-measured', type: 'line', source: 'sig',
    filter: ['>', ['get', 'measured'], 0],
    paint: { 'line-color': ACCENT, 'line-width': 1.4, 'line-opacity': 0.9 },
  });

  /* 학습데이터 — 밀도 격자 + 결측 점선 */
  map.addSource('grid', { type: 'geojson', data: EMPTY });
  map.addSource('gap', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'gap-cells', type: 'line', source: 'gap',
    paint: { 'line-color': '#c9ccd1', 'line-width': 0.7, 'line-opacity': 0.5, 'line-dasharray': [1.4, 2.2] },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'grid-fill', type: 'fill', source: 'grid',
    paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'w'], 0, '#cfe1fb', 0.5, '#5f9bf4', 1, ACCENT],
      'fill-opacity': ['interpolate', ['linear'], ['get', 'w'], 0, 0.42, 1, 0.9],
    },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'grid-line', type: 'line', source: 'grid',
    paint: { 'line-color': '#ffffff', 'line-width': 0.4, 'line-opacity': 0.35 },
    layout: { visibility: 'none' },
  });

  /* 영상 인벤토리 풋프린트 */
  map.addSource('imgbox', {
    type: 'geojson',
    data: fc(IMG.map((i) => ({
      type: 'Feature',
      properties: { id: i.id, label: i.label, kind: i.kind, city: i.coverage === 'city' ? 1 : 0 },
      geometry: { type: 'Polygon', coordinates: [[[i.bounds[0], i.bounds[3]], [i.bounds[2], i.bounds[3]], [i.bounds[2], i.bounds[1]], [i.bounds[0], i.bounds[1]], [i.bounds[0], i.bounds[3]]]] },
    }))),
  });
  map.addLayer({
    id: 'imgbox-line', type: 'line', source: 'imgbox',
    paint: { 'line-color': '#ffffff', 'line-width': ['case', ['>', ['get', 'city'], 0], 1.2, 1.8], 'line-opacity': 0.85 },
    layout: { visibility: 'none' },
  });

  /* 추론 — AOI 윤곽 + z14 실타일 스윕 */
  const aoi = fc([tileFeature(0, 0, 0)]);
  aoi.features = [{
    type: 'Feature', properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [tile2lng(SWEEP_TILE.x0, 14), tile2lat(SWEEP_TILE.y0, 14)],
        [tile2lng(SWEEP_TILE.x1 + 1, 14), tile2lat(SWEEP_TILE.y0, 14)],
        [tile2lng(SWEEP_TILE.x1 + 1, 14), tile2lat(SWEEP_TILE.y1 + 1, 14)],
        [tile2lng(SWEEP_TILE.x0, 14), tile2lat(SWEEP_TILE.y1 + 1, 14)],
        [tile2lng(SWEEP_TILE.x0, 14), tile2lat(SWEEP_TILE.y0, 14)],
      ]],
    },
  }];
  map.addSource('aoi', { type: 'geojson', data: aoi });
  map.addSource('sweep', { type: 'geojson', data: EMPTY });
  map.addSource('det', { type: 'geojson', data: EMPTY });
  map.addSource('pins', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'aoi-line', type: 'line', source: 'aoi',
    paint: { 'line-color': '#ffffff', 'line-width': 1.2, 'line-opacity': 0.9, 'line-dasharray': [3, 2] },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'sweep-fill', type: 'fill', source: 'sweep',
    paint: {
      // 90/8/2 — 앰버는 '지금 스캔 중인 칸' 한 줄에만 쓴다. 탐지가 있는 칸은 액센트.
      'fill-color': ['match', ['get', 'st'], 'live', DETECT, 'hit', ACCENT, '#ffffff'],
      'fill-opacity': ['match', ['get', 'st'], 'live', 0.55, 'hit', 0.3, 'done', 0.1, 0.0],
    },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'sweep-line', type: 'line', source: 'sweep',
    paint: {
      'line-color': ['match', ['get', 'st'], 'live', DETECT, 'hit', ACCENT, '#ffffff'],
      'line-width': ['match', ['get', 'st'], 'live', 1.6, 0.5],
      'line-opacity': ['match', ['get', 'st'], 'idle', 0.16, 'done', 0.4, 0.8],
    },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'det-dot', type: 'circle', source: 'det',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.4, 16, 4.5],
      'circle-color': TEAL,
      'circle-opacity': 0.85,
      'circle-stroke-width': 0.4,
      'circle-stroke-color': '#ffffff',
    },
    layout: { visibility: 'none' },
  });

  /* 결과 누적 — epoch 적층 기둥 */
  map.addSource('stack', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'stack-3d', type: 'fill-extrusion', source: 'stack',
    paint: {
      'fill-extrusion-color': ['case', ['>', ['get', 'alt'], 0], TEAL, ACCENT],
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'top'],
      'fill-extrusion-opacity': 0.82,
    },
    layout: { visibility: 'none' },
  });

  /* 큐 핀 — 기존 대시보드의 처리 대기 큐가 지도 위 점이 된다(시연). */
  map.addLayer({
    id: 'pin-halo', type: 'circle', source: 'pins',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'pulse'], 0, 6, 1, 15],
      'circle-color': ACCENT,
      'circle-opacity': ['interpolate', ['linear'], ['get', 'pulse'], 0, 0.24, 1, 0],
    },
  });
  map.addLayer({
    id: 'pin-dot', type: 'circle', source: 'pins',
    paint: {
      'circle-radius': 3.4, 'circle-color': '#ffffff',
      'circle-stroke-width': 1.6, 'circle-stroke-color': ACCENT,
    },
  });
  map.getSource('pins').setData(fc(QUEUE.map((q, i) => ({
    type: 'Feature',
    properties: { i, type: q.type, title: q.title, sub: q.sub, status: q.status, hot: i === 0 ? 1 : 0, pulse: 0 },
    geometry: { type: 'Point', coordinates: q.lnglat },
  }))));

  const show = (ids, on) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));

  return {
    map, fc, show,
    setSweep: (data) => map.getSource('sweep').setData(data),
    setDet: (data) => map.getSource('det').setData(data),
    setGrid: (g, gap) => { map.getSource('grid').setData(g); map.getSource('gap').setData(gap || EMPTY); },
    setStack: (data) => map.getSource('stack').setData(data),
    pins: () => map.getSource('pins'),
    keyed: v.keyed,
  };
}
