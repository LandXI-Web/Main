/* 분석 서비스 — 결과 지도(MapLibre). 선례 publish-map.js · admin-map.js 와 같은 규칙:
   베이스 = V-World(js/sources.js resolveVWorld — 키가 죽으면 키 없는 xdworld 로 폴백),
   결과 = assets/data/geo/results/*.geojson 실 도형을 청록으로. 손 배치 폴리곤은 쓰지 않는다.
   컨트롤(maplibre 기본)은 달지 않는다 — 라운드·그림자가 딸려 오므로 화면의 각진 버튼이 확대/축소를 한다. */
import { resolveVWorld } from './js/sources.js';

export const TEAL = '#0FA9A0';
export const hasGL = () => typeof window.maplibregl !== 'undefined';

const cache = new Map();
export function loadGeo(url) {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`geojson ${r.status}`); return r.json(); }));
  return cache.get(url);
}

const ring = (g) => (g.type === 'Polygon' ? g.coordinates[0] : g.type === 'MultiPolygon' ? g.coordinates[0][0] : null);
export function centroid(f) {
  const g = f.geometry;
  if (g.type === 'Point') return g.coordinates;
  const r = ring(g); if (!r) return [0, 0];
  let x = 0, y = 0; for (const c of r) { x += c[0]; y += c[1]; }
  return [x / r.length, y / r.length];
}
export function bboxOf(features) {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  const eat = (c) => { if (typeof c[0] === 'number') { b = [Math.min(b[0], c[0]), Math.min(b[1], c[1]), Math.max(b[2], c[0]), Math.max(b[3], c[1])]; } else c.forEach(eat); };
  features.forEach((f) => eat(f.geometry.coordinates));
  return b;
}

const PT_MAX = 13.5;
const ptCache = new WeakMap();
function points(geo) {
  if (!ptCache.has(geo)) ptCache.set(geo, { type: 'FeatureCollection', features: geo.features.map((f) => ({ type: 'Feature', properties: { cls: f.properties.cls }, geometry: { type: 'Point', coordinates: centroid(f) } })) });
  return ptCache.get(geo);
}

export async function mountMap(el, opt = {}) {
  const v = await resolveVWorld();
  const map = new maplibregl.Map({
    container: el, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    style: {
      version: 8,
      sources: {
        vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' },
        vhyb: { type: 'raster', tiles: [v.hyb], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        { id: 'vsat', type: 'raster', source: 'vsat', paint: { 'raster-saturation': -0.12, 'raster-contrast': 0.04, 'raster-fade-duration': 200 } },
        { id: 'vhyb', type: 'raster', source: 'vhyb', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } },
      ],
    },
    center: opt.center || [127.42136, 35.43203], zoom: opt.zoom ?? 10, maxZoom: 18.4, minZoom: 6,
  });
  map.touchZoomRotate?.disableRotation?.();
  map.keyboard?.disableRotation?.();
  await new Promise((res) => map.on('load', res));
  el.dataset.map = 'ready';
  return map;
}

/** 결과 도형을 청록으로. 낮은 줌에서는 같은 도형의 중심점(1,500 m² 필지는 시 전역 줌에서 1px 도 안 된다). */
export function setResult(map, data, opt = {}) {
  clearResult(map);
  map.addSource('res', { type: 'geojson', data });
  map.addSource('res-pt', { type: 'geojson', data: points(data) });
  map.addLayer({ id: 'res-pt', type: 'circle', source: 'res-pt', maxzoom: PT_MAX, paint: { 'circle-color': TEAL, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 2.2, 13.5, 3.4], 'circle-opacity': 0.92, 'circle-stroke-width': 0 } });
  const dash = opt.dashClasses || [];
  const isDash = ['in', ['get', 'cls'], ['literal', dash]];
  map.addLayer({ id: 'res-fill', type: 'fill', source: 'res', minzoom: PT_MAX - 1.5, filter: ['!', isDash], paint: { 'fill-color': TEAL, 'fill-opacity': 0.16 } });
  map.addLayer({ id: 'res-line', type: 'line', source: 'res', filter: ['!', isDash], paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6, 18, 2.4], 'line-opacity': 0.95 } });
  map.addLayer({ id: 'res-dash', type: 'line', source: 'res', filter: isDash, paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6, 18, 2.4], 'line-dasharray': [3, 2], 'line-opacity': 0.95 } });
}
export function clearResult(map) {
  for (const l of ['res-pt', 'res-fill', 'res-line', 'res-dash', 'sel-line', 'sel-gone']) if (map.getLayer(l)) map.removeLayer(l);
  for (const s of ['res', 'res-pt', 'sel']) if (map.getSource(s)) map.removeSource(s);
}
/** 결과 편집에서 고른 도형 — 옮긴 것은 파랑 2px, 지운 것은 흰 점선(원판 B7-Analysis-Result-Edit).
    line-dasharray 는 데이터 식을 받지 않으므로 레이어를 둘로 나눈다. */
export function setPick(map, features) {
  for (const l of ['sel-line', 'sel-gone']) if (map.getLayer(l)) map.removeLayer(l);
  if (map.getSource('sel')) map.removeSource('sel');
  if (!features?.length) return;
  map.addSource('sel', { type: 'geojson', data: { type: 'FeatureCollection', features } });
  const gone = ['==', ['get', '_gone'], true];
  map.addLayer({ id: 'sel-line', type: 'line', source: 'sel', filter: ['!', gone], paint: { 'line-color': '#006DF7', 'line-width': 2 } });
  map.addLayer({ id: 'sel-gone', type: 'line', source: 'sel', filter: gone, paint: { 'line-color': '#FFFFFF', 'line-width': 2, 'line-dasharray': [3, 2] } });
}
export function frame(map, b, o = {}) {
  map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: o.pad ?? 28, duration: o.instant ? 0 : 1100, maxZoom: o.maxZoom || 17.4, essential: true });
}
export function setHybrid(map, on) { if (map.getLayer('vhyb')) map.setLayoutProperty('vhyb', 'visibility', on ? 'visible' : 'none'); }
export function setBase(map, on) { if (map.getLayer('vsat')) map.setLayoutProperty('vsat', 'visibility', on ? 'visible' : 'none'); }
export function setResultVisible(map, on) {
  for (const l of ['res-pt', 'res-fill', 'res-line', 'res-dash']) if (map.getLayer(l)) map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
}
