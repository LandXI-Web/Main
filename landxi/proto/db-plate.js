// 판(plate) — 화면의 62%를 차지하는 V-World 위성 정사영상.
// A안 "지도 위 원장"(docs/superpowers/specs/2026-08-26-map-dashboard-options.md §3.1):
// 지도는 새 위젯이 아니라 원본 위젯 B1–B16 을 조판하는 **바탕**이다.
// 그래서 이 판 위에 남는 것은 실제 분석 결과 4건과 헤어라인 액자뿐이다 —
// 불투명 격자 사각형도, 앱 크롬 탭도 없다(반려 사유 1·2).
import { resolveVWorld } from './js/sources.js';
import { COVERAGE, APPROVALS, IMG } from './db-data.js';

const SIGUNGU_URL = '../assets/data/geo/sigungu.geojson';

const ACCENT = '#006DF7';
const DETECT = '#FFB633';

const EMPTY = { type: 'FeatureCollection', features: [] };
export const fc = (features) => ({ type: 'FeatureCollection', features });

/* ── 폴리곤 → 대표점 ──────────────────────────────────────────────────
   축척이 작아 폴리곤이 한 점으로 무너지는 구간에서 3px 이하의 점이 대신 선다. */
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
/** 피처 모음의 경계 상자. */
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
          // 사진 인화 — 채도 −35%, 대비 +6%, 검정을 살짝 들어 올린다(취향 §4 영상 처리).
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
    center: [127.55, 35.15],
    zoom: 7.2,
    pitch: 0,
    bearing: 0,
    maxZoom: 18.5,
    minZoom: 5.5,
  });
  await new Promise((res) => map.on('load', res));

  /* 행정경계 — 계기가 아니라 판에 새긴 눈금. 1px 잉크 헤어라인 하나. */
  const sig = await fetch(SIGUNGU_URL).then((r) => r.json());
  const covBy = Object.fromEntries(COVERAGE.map((c) => [c.code, c]));
  for (const f of sig.features) f.properties.lit = covBy[f.properties.code] ? 1 : 0;
  map.addSource('sig', { type: 'geojson', data: sig });
  map.addLayer({
    id: 'sig-line', type: 'line', source: 'sig',
    paint: { 'line-color': 'rgba(1,1,2,0.35)', 'line-width': 1 },
  });

  /* 정사영상 풋프린트 11종 — 어디까지가 실제 촬영 범위인지가 정직성이다(D17·D18). */
  map.addSource('imgbox', {
    type: 'geojson',
    data: fc(IMG.map((i) => ({
      type: 'Feature',
      properties: { id: i.id, label: i.label, kind: i.kind, city: i.coverage === 'city' ? 1 : 0 },
      geometry: {
        type: 'Polygon',
        coordinates: [[[i.bounds[0], i.bounds[3]], [i.bounds[2], i.bounds[3]], [i.bounds[2], i.bounds[1]], [i.bounds[0], i.bounds[1]], [i.bounds[0], i.bounds[3]]]],
      },
    }))),
  });
  map.addLayer({
    id: 'imgbox-line', type: 'line', source: 'imgbox',
    paint: { 'line-color': 'rgba(255,255,255,0.55)', 'line-width': 1 },
  });

  /* 결과 — 실제 분석 결과 4건(측정 = 실선 + 채움, D17). */
  map.addSource('res', { type: 'geojson', data: EMPTY });
  map.addSource('resdot', { type: 'geojson', data: EMPTY });
  map.addSource('chg', { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'res-fill', type: 'fill', source: 'res',
    paint: { 'fill-color': ACCENT, 'fill-opacity': ['case', ['<', ['get', 'conf'], ['literal', 0]], 0, 0.14] },
  });
  map.addLayer({
    id: 'res-line', type: 'line', source: 'res',
    paint: { 'line-color': ACCENT, 'line-width': 1, 'line-opacity': 0.8 },
  });
  map.addLayer({
    id: 'res-dot', type: 'circle', source: 'resdot',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.1, 12, 2, 16, 3],
      'circle-color': ACCENT,
      'circle-opacity': ['interpolate', ['linear'], ['zoom'], 13.4, 0.85, 15.4, 0],
    },
  });
  /* 변화 지수(비지도) — 모델 탐지가 아니므로 점선 고스트로만 그린다(D17 추정). */
  map.addLayer({
    id: 'chg-line', type: 'line', source: 'chg',
    paint: { 'line-color': DETECT, 'line-width': 1, 'line-opacity': 0.8, 'line-dasharray': [2, 2] },
  });

  /* 핀 — 원본 B13 `카드 발행 승인 대기` 2건이 요청 지역 위에 선다. */
  map.addSource('pins', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'pin-ring', type: 'circle', source: 'pins',
    paint: { 'circle-radius': 8, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,0.5)' },
  });
  map.addLayer({
    id: 'pin-dot', type: 'circle', source: 'pins',
    paint: { 'circle-radius': 2.6, 'circle-color': ACCENT, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' },
  });
  map.getSource('pins').setData(fc(APPROVALS.map((q) => ({
    type: 'Feature',
    properties: { i: q.i, id: q.id, title: q.title, sub: q.sub, requester: q.requester, at: q.at },
    geometry: { type: 'Point', coordinates: q.lnglat },
  }))));

  const show = (ids, on) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'));

  return {
    map, fc, show,
    setRes: (poly, dots) => { map.getSource('res').setData(poly || EMPTY); map.getSource('resdot').setData(dots || EMPTY); },
    setChange: (data) => map.getSource('chg').setData(data || EMPTY),
    keyed: v.keyed,
  };
}
