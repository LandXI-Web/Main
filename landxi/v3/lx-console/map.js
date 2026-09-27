/* map.js — 전국 XI맵 한 벌(생산 콘솔 전용 얇은 판).
   엔진은 landxi/xi/engine/sources.js 를 import 만 한다(pmtiles · lxpm 프로토콜 · 카탈로그 항목 → 소스 스펙).
   바탕 = 위성(EOX S2 cloudless 2017 CC BY → V-World 위성 z6.5+) · 크롬 색 0 · 결과 위에서만 청록. */
import { registerPmtiles, sourceSpec } from '../../xi/engine/sources.js';
import { API } from '../../shared/api-v1.js';

/* 카메라 이징 = 법전 --e-cam cubic-bezier(.16,1,.3,1) */
function bezier(p1x, p1y, p2x, p2y) {
  const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
  const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t, dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 8; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return sy(Math.min(1, Math.max(0, t))); };
}
export const CAM = bezier(.16, 1, .3, 1);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const KOREA = [125.4, 33.6, 130.2, 38.5];

const EMPTY = { type: 'FeatureCollection', features: [] };
const GEO = ['focus', 'foot', 'find', 'fb', 'res', 'agent'];

export function createMap(el) {
  registerPmtiles();
  const map = new window.maplibregl.Map({
    container: el,
    style: {
      version: 8,
      transition: { duration: 0, delay: 0 },
      sources: {
        eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 13, attribution: 'Sentinel-2 cloudless 2020 by EOX (CC BY-NC-SA 4.0)' },
        vw: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 5, maxzoom: 19, bounds: [124.5, 33.0, 132.0, 38.9], attribution: '© 국토교통부 V-World' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0B1016' } },
        { id: 'eox', type: 'raster', source: 'eox', paint: { 'raster-saturation': -.35, 'raster-brightness-max': .74, 'raster-contrast': .04, 'raster-fade-duration': 500 } },
        { id: 'vw', type: 'raster', source: 'vw', minzoom: 9, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9, 0, 10, 1], 'raster-saturation': -.35, 'raster-brightness-max': .74, 'raster-contrast': .04, 'raster-fade-duration': 500 } },
      ],
    },
    bounds: KOREA, fitBoundsOptions: { padding: { top: 120, bottom: 120, left: 620, right: 120 } },
    attributionControl: false, fadeDuration: 0, maxPitch: 60, renderWorldCopies: false, dragRotate: true,
    canvasContextAttributes: { antialias: true },
  });
  map.getCanvas().setAttribute('aria-label', '전국 XI맵');
  return map;
}

export const ready = (map) => new Promise((res) => (map.isStyleLoaded() ? res() : map.once('load', res)));

/** 참조 층(시도·시군구 경계)과 결과 층 자리를 깐다. items = /catalog/layers */
export async function base(map, items) {
  const by = Object.fromEntries(items.map((i) => [i.id, i]));
  for (const [id, minz, alpha, w] of [['sido', 0, .55, 1], ['sigungu', 7, .28, .8]]) {
    const it = by[id]; if (!it) continue;
    try {
      map.addSource('ref-' + id, await sourceSpec(it));
      map.addLayer({ id: 'ref-' + id, type: 'line', source: 'ref-' + id, 'source-layer': it.layer, minzoom: minz,
        paint: { 'line-color': '#fff', 'line-opacity': alpha, 'line-width': w } });
    } catch { /* 경계 층 결손 — 지도는 계속 */ }
  }
  for (const k of GEO) map.addSource(k, { type: 'geojson', data: EMPTY });
  // 영상 자산 발자국(점선 흰 헤어라인)
  map.addLayer({ id: 'foot-l', type: 'line', source: 'foot', paint: { 'line-color': '#fff', 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': .85 } });
  map.addLayer({ id: 'foot-f', type: 'fill', source: 'foot', paint: { 'fill-color': '#fff', 'fill-opacity': ['case', ['boolean', ['feature-state', 'on'], false], .16, .04] } });
  // 초점 지역(배포본 AOI)
  map.addLayer({ id: 'focus-f', type: 'fill', source: 'focus', paint: { 'fill-color': '#fff', 'fill-opacity': .07 } });
  map.addLayer({ id: 'focus-l', type: 'line', source: 'focus', paint: { 'line-color': '#fff', 'line-width': 1.2, 'line-opacity': .8 } });
  // 의심 필지(점 · 등급 농도)
  map.addLayer({ id: 'find', type: 'circle', source: 'find', paint: {
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, ['match', ['get', 'p'], 'A', 2.6, 1.6], 14, ['match', ['get', 'p'], 'A', 6, 4]],
    'circle-color': ['match', ['get', 'p'], 'A', '#FFFFFF', 'rgba(255,255,255,.55)'], 'circle-stroke-color': '#0FA9A0', 'circle-stroke-width': ['match', ['get', 'p'], 'A', 1.2, 0] } });
  // 기관 신고(오탐)
  map.addLayer({ id: 'fb-halo', type: 'circle', source: 'fb', paint: { 'circle-radius': 14, 'circle-color': 'rgba(209,53,43,.18)', 'circle-stroke-color': '#D1352B', 'circle-stroke-width': 1.2 } });
  map.addLayer({ id: 'fb', type: 'circle', source: 'fb', paint: { 'circle-radius': 3.5, 'circle-color': '#fff' } });
  // AI 결과(이중 스트로크 글로우 · 청록)
  map.addLayer({ id: 'res-f', type: 'fill', source: 'res', paint: { 'fill-color': '#0FA9A0', 'fill-opacity': .18 } });
  map.addLayer({ id: 'res-h', type: 'line', source: 'res', paint: { 'line-color': 'rgba(15,169,160,.25)', 'line-width': 4 } });
  map.addLayer({ id: 'res-l', type: 'line', source: 'res', paint: { 'line-color': '#0FA9A0', 'line-width': 1.2 } });
  // 물어보기 결과(액센트 = 선택)
  map.addLayer({ id: 'agent-f', type: 'fill', source: 'agent', paint: { 'fill-color': '#006DF7', 'fill-opacity': .22 } });
  map.addLayer({ id: 'agent-l', type: 'line', source: 'agent', paint: { 'line-color': '#fff', 'line-width': 1.6 } });
}

export function setData(map, k, fc) { map.getSource(k)?.setData(fc || EMPTY); }
export function clear(map, keep = []) { for (const k of GEO) if (!keep.includes(k)) setData(map, k, EMPTY); }

/** 카메라 — 점프 없이 한 지도에서 이동(법전 §2 · 1600~2400) */
export function fly(map, bbox, { pad, pitch = 0, maxZoom = 15, ms = 2400 } = {}) {
  const drawer = document.body.classList.contains('has-drawer');
  const padding = pad || { top: 230, bottom: 120, left: drawer ? 90 : 600, right: drawer ? 470 : 120 };
  const cam = map.cameraForBounds(bbox, { padding, maxZoom });
  if (!cam) return;
  const o = { center: cam.center, zoom: Math.min(cam.zoom, maxZoom), pitch, bearing: 0 };
  if (REDUCE) map.jumpTo(o); else map.flyTo({ ...o, duration: ms, easing: CAM, curve: 1.3, essential: true });
}

/** 영상 한 벌(카탈로그 항목)을 판 위에 깐다 — 검수 스윕 때 AI 가 본 그 영상 */
export async function imagery(map, item, on = true) {
  const id = 'img-' + item.id;
  if (!on) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); return; }
  if (!map.getSource(id)) {
    map.addSource(id, await sourceSpec(item));
    map.addLayer({ id, type: 'raster', source: id, minzoom: item.minzoom ?? 0, paint: { 'raster-fade-duration': 500 } }, 'foot-l');
  }
  map.setLayoutProperty(id, 'visibility', 'visible');
}

/** V-World 대조 레이어(게이트웨이 프록시 WMS) */
export function wms(map, layer, on, { minzoom = 7, opacity = .75 } = {}) {
  const id = 'wms-' + layer;
  if (!on) { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none'); return; }
  if (!map.getSource(id)) {
    const q = `service=WMS&request=GetMap&version=1.3.0&layers=${layer}&styles=${layer}&crs=EPSG:3857&bbox={bbox-epsg-3857}&width=512&height=512&format=image/png&transparent=true`;
    map.addSource(id, { type: 'raster', tiles: [`${API.prefix}/proxy/vworld/wms?${q}`], tileSize: 512, minzoom, bounds: [124.5, 33.0, 132.0, 38.9] });
    map.addLayer({ id, type: 'raster', source: id, minzoom, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 500 } }, 'foot-l');
  }
  map.setLayoutProperty(id, 'visibility', 'visible');
}

export const bboxOf = (g) => {
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); };
  if (g.type === 'FeatureCollection') g.features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  else walk((g.geometry || g).coordinates);
  return a;
};
export const boxPoly = (b, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } });
