// 판(plate) — 남원 정사영상 위에 **위치를 가진 현황만** 스스로 자기 모양으로 선다.
// 등급표: docs/superpowers/specs/2026-08-26-dashboard-map-relationship.md §2
//   Ⅰ 상시 표시(조작 없이)  B9 작업 AOI · B10 사업 지역 · B12 정사영상 footprint · B13 발행 대기 핀
//   Ⅱ 원장을 만졌을 때만    B2 · B5 · B6 · B16
//   Ⅲ 판이 반응하지 않는다   B1 · B3 · B4 · B7 · B8 · B11 · B14 · B15
// 정직성은 색이 아니라 **선 종류**로 말한다: 측정 = 실선 · 추정 = 점선 · 미확정 = 파선.
import { resolveVWorld } from './js/sources.js';
import { APPROVALS, IMG, ASSET_SGG } from './db-data.js';

const SIGUNGU_URL = '../assets/data/geo/sigungu.geojson';

const ACCENT = '#006DF7';
const MUTE = '#E8EBEE';

const EMPTY = { type: 'FeatureCollection', features: [] };
export const fc = (features) => ({ type: 'FeatureCollection', features });

/* ── 기하 도우미 ──────────────────────────────────────────────────────── */
export function centroid(g) {
  if (!g) return null;
  if (g.type === 'Point') return g.coordinates;
  const rings = g.type === 'Polygon' ? g.coordinates
    : g.type === 'MultiPolygon' ? g.coordinates.flat()
      : g.type === 'LineString' ? [g.coordinates] : null;
  if (!rings || !rings[0] || !rings[0].length) return null;
  let sx = 0, sy = 0, n = 0;
  for (const pt of rings[0]) { sx += pt[0]; sy += pt[1]; n++; }
  return n ? [sx / n, sy / n] : null;
}
export function dotsOf(geo) {
  const out = [];
  for (const f of geo.features || []) {
    const c = centroid(f.geometry);
    if (c) out.push({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } });
  }
  return fc(out);
}
export function bboxOf(geo) {
  let w = 9e9, s = 9e9, e = -9e9, n = -9e9;
  const eat = ([x, y]) => { if (x < w) w = x; if (x > e) e = x; if (y < s) s = y; if (y > n) n = y; };
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'Point') eat(g.coordinates);
    else if (g.type === 'Polygon' || g.type === 'MultiLineString') g.coordinates.flat().forEach(eat);
    else if (g.type === 'MultiPolygon') g.coordinates.flat(2).forEach(eat);
    else if (g.type === 'LineString') g.coordinates.forEach(eat);
  };
  for (const f of geo.features || []) walk(f.geometry);
  return w > e ? null : [w, s, e, n];
}
export const boxPoly = (b) => ({
  type: 'Polygon',
  coordinates: [[[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]], [b[0], b[3]]]],
});

/** 읍면동별 실제 조사 범위 — 결과 폴리곤의 `emd` 를 되짚어 만든 실측 외곽이다. */
export function emdIndex(geos) {
  const by = new Map();
  for (const geo of geos) {
    for (const f of geo.features || []) {
      const k = f.properties && f.properties.emd;
      if (!k) continue;
      const c = centroid(f.geometry);
      if (!c) continue;
      const cur = by.get(k) || { n: 0, w: 9e9, s: 9e9, e: -9e9, no: -9e9 };
      cur.n++;
      if (c[0] < cur.w) cur.w = c[0];
      if (c[0] > cur.e) cur.e = c[0];
      if (c[1] < cur.s) cur.s = c[1];
      if (c[1] > cur.no) cur.no = c[1];
      by.set(k, cur);
    }
  }
  const out = new Map();
  for (const [k, v] of by) {
    if (v.e - v.w < 1e-5 || v.no - v.s < 1e-5) continue;
    out.set(k, { bbox: [v.w, v.s, v.e, v.no], n: v.n });
  }
  return out;
}

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
        { id: 'bg', type: 'background', paint: { 'background-color': '#11150F' } },
        {
          id: 'vsat', type: 'raster', source: 'vsat',
          // 사진 인화 — 채도 −35%, 대비 +6%, 검정을 살짝 들어 올린다(취향 §4).
          paint: {
            'raster-saturation': -0.35,
            'raster-contrast': 0.06,
            'raster-brightness-min': 0.06,
            'raster-brightness-max': 0.96,
            'raster-fade-duration': 220,
          },
        },
      ],
    },
    center: [127.42, 35.42],
    zoom: 11.4,
    maxZoom: 18.5,
    minZoom: 5.5,
  });
  await new Promise((res) => map.on('load', res));

  /* ── B10 사업 지역 — 실자산이 있는 시군구만 채운다. 나머지는 무채. ── */
  const sig = await fetch(SIGUNGU_URL).then((r) => r.json());
  for (const f of sig.features) f.properties.has = ASSET_SGG.includes(f.properties.code) ? 1 : 0;
  map.addSource('sig', { type: 'geojson', data: sig });
  map.addLayer({
    id: 'sig-mute', type: 'line', source: 'sig',
    filter: ['==', ['get', 'has'], 0],
    // 자산이 없는 곳은 어둡게 하지 않는다 — 밝은 판에서 어두움은 강조로 읽힌다.
    paint: { 'line-color': MUTE, 'line-width': 1, 'line-opacity': 0.5, 'line-dasharray': [1, 3] },
  });
  map.addLayer({
    id: 'sig-asset-fill', type: 'fill', source: 'sig',
    filter: ['==', ['get', 'has'], 1],
    paint: { 'fill-color': ACCENT, 'fill-opacity': ['case', ['boolean', ['feature-state', 'lit'], false], 0.16, 0.08] },
  });
  map.addLayer({
    id: 'sig-asset-line', type: 'line', source: 'sig',
    filter: ['==', ['get', 'has'], 1],
    paint: { 'line-color': 'rgba(1,1,2,0.5)', 'line-width': 1 },
  });

  /* ── B12 정사영상 footprint — 가장 얇은 헤어라인 액자. ── */
  map.addSource('imgbox', {
    type: 'geojson',
    data: fc(IMG.map((i) => ({
      type: 'Feature',
      properties: { id: i.id, label: i.label, captured: i.captured, city: i.coverage === 'city' ? 1 : 0 },
      geometry: boxPoly(i.bounds),
    }))),
  });
  map.addLayer({
    id: 'imgbox-line', type: 'line', source: 'imgbox',
    paint: {
      'line-color': 'rgba(255,255,255,0.5)',
      'line-width': ['case', ['boolean', ['feature-state', 'lit'], false], 1, 0.5],
    },
  });

  /* ── B9 작업 AOI — 상태를 색이 아니라 선 종류로 말한다. 채움은 0. ── */
  map.addSource('job', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'job-done', type: 'line', source: 'job',
    filter: ['==', ['get', 'st'], 'done'],
    paint: { 'line-color': 'rgba(255,255,255,0.92)', 'line-width': 1, 'line-opacity': ['case', ['boolean', ['feature-state', 'dim'], false], 0.25, 1] },
  });
  map.addLayer({
    id: 'job-run', type: 'line', source: 'job',
    filter: ['==', ['get', 'st'], 'run'],
    paint: { 'line-color': '#4E95F9', 'line-width': 1 },
  });
  map.addLayer({
    id: 'job-wait', type: 'line', source: 'job',
    filter: ['==', ['get', 'st'], 'wait'],
    paint: { 'line-color': 'rgba(255,255,255,0.75)', 'line-width': 1, 'line-dasharray': [4, 3] },
  });
  map.addLayer({
    id: 'job-fail', type: 'line', source: 'job',
    // 실패는 삭제하지 않는다 — 감쇠만 한다.
    filter: ['==', ['get', 'st'], 'fail'],
    paint: { 'line-color': 'rgba(255,255,255,0.42)', 'line-width': 1, 'line-dasharray': [4, 3] },
  });
  /* 실행 중 한 건의 스윕선 — 화면에서 유일한 운동. */
  map.addSource('sweep', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'sweep-line', type: 'line', source: 'sweep',
    paint: { 'line-color': '#4E95F9', 'line-width': 1, 'line-opacity': 0.9 },
  });

  /* ── 결과 폴리곤 — 원장에서 결과를 고를 때만 켠다(Ⅱ등급). ── */
  map.addSource('res', { type: 'geojson', data: EMPTY });
  map.addSource('resdot', { type: 'geojson', data: EMPTY });
  map.addSource('chg', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'res-fill', type: 'fill', source: 'res',
    paint: { 'fill-color': ACCENT, 'fill-opacity': 0.14 },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'res-line', type: 'line', source: 'res',
    paint: { 'line-color': ACCENT, 'line-width': 1, 'line-opacity': 0.8 },
    layout: { visibility: 'none' },
  });
  map.addLayer({
    id: 'res-dot', type: 'circle', source: 'resdot',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.1, 12, 2, 16, 3],
      'circle-color': ACCENT,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.4, 0.85, 15.4, 0],
    },
    layout: { visibility: 'none' },
  });
  /* 변화 지수(비지도)는 탐지가 아니다 — 점선 고스트로만 그린다. */
  map.addLayer({
    id: 'chg-line', type: 'line', source: 'chg',
    paint: { 'line-color': '#FFB633', 'line-width': 1, 'line-opacity': 0.8, 'line-dasharray': [2, 2] },
  });

  const show = (ids, on) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));

  return {
    map, fc, show,
    setJobs: (data) => map.getSource('job').setData(data || EMPTY),
    setSweep: (data) => map.getSource('sweep').setData(data || EMPTY),
    setRes: (poly, dots) => { map.getSource('res').setData(poly || EMPTY); map.getSource('resdot').setData(dots || EMPTY); },
    setChange: (data) => map.getSource('chg').setData(data || EMPTY),
    approvals: APPROVALS,
    keyed: v.keyed,
  };
}
