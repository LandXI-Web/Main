/* 카드 발행 관리 — 증거 판(MapLibre). 선례 ds-plate.js.
   베이스 = V-World 위성(js/sources.js resolveVWorld — 키가 죽으면 키 없는 xdworld 로 폴백), 결과 = assets/data/geo/results/*.geojson 을 청록으로.
   원판의 손 배치 폴리곤을 흉내 내지 않는다 — 실 도형이 없는 과제는 도형을 올리지 않고 판이 그렇게 말한다(점선 + 이유 한 줄). */
import { resolveVWorld } from './js/sources.js';

export const TEAL = '#0FA9A0';
const geoCache = new Map();
export function loadGeo(url) {
  if (!geoCache.has(url)) geoCache.set(url, fetch(url).then((r) => { if (!r.ok) throw new Error(`geojson ${r.status}`); return r.json(); }));
  return geoCache.get(url);
}
export const hasGL = () => typeof window.maplibregl !== 'undefined';

const ring = (g) => (g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0]);
export function centroid(f) { const r = ring(f.geometry); let x = 0, y = 0; for (const c of r) { x += c[0]; y += c[1]; } return [x / r.length, y / r.length]; }
export const kmBetween = (a, b) => Math.hypot((a[0] - b[0]) * 111.32 * Math.cos((b[1] * Math.PI) / 180), (a[1] - b[1]) * 110.57);
export function near(geo, center, km) { return geo.features.filter((f) => kmBetween(centroid(f), center) <= km); }
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

/** 판을 세운다. 컨트롤은 달지 않는다(라운드 · 그림자가 딸려 온다) — 확대/축소는 화면의 각진 버튼이 한다. */
export async function mountPlate(el, opt = {}) {
  const v = await resolveVWorld();
  const map = new maplibregl.Map({
    container: el, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    style: { version: 8,
      sources: { vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' },
        vhyb: { type: 'raster', tiles: [v.hyb], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '' } },
      layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        { id: 'vsat', type: 'raster', source: 'vsat', paint: { 'raster-saturation': -0.12, 'raster-contrast': 0.04, 'raster-fade-duration': 200 } },
        { id: 'vhyb', type: 'raster', source: 'vhyb', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } }] },
    center: opt.center || [127.42136, 35.43203], zoom: opt.zoom ?? 10, maxZoom: 18.4, minZoom: 6,
  });
  map.touchZoomRotate?.disableRotation?.();
  map.keyboard?.disableRotation?.();
  await new Promise((res) => map.on('load', res));
  el.dataset.map = 'ready';
  return map;
}

/** 실 결과를 청록으로 — 첫 클래스 = 실선 + 옅은 면, 둘째 클래스 = 점선(면 없음). cls 속성은 GeoJSON 의 값 그대로. */
export function setResult(map, data, classes) {
  clearResult(map);
  map.addSource('res', { type: 'geojson', data });
  // 시 전체를 볼 때 1,500 m² 필지는 1px 도 안 된다 — 낮은 줌에서는 같은 실 도형의 중심점을 청록 점으로(원본도 낮은 줌은 점, 높은 줌은 폴리곤).
  map.addSource('res-pt', { type: 'geojson', data: points(data) });
  map.addLayer({ id: 'res-pt', type: 'circle', source: 'res-pt', maxzoom: PT_MAX, paint: { 'circle-color': TEAL, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.4, 11, 2.2, 13.5, 3.4], 'circle-opacity': 0.92, 'circle-stroke-width': 0 } });
  const solid = classes?.[0]?.key, dash = classes?.filter((c) => c.dash).map((c) => c.key) || [];
  const isDash = ['in', ['get', 'cls'], ['literal', dash]];
  map.addLayer({ id: 'res-fill', type: 'fill', source: 'res', minzoom: PT_MAX - 1.5, filter: ['!', isDash], paint: { 'fill-color': TEAL, 'fill-opacity': 0.16 } });
  map.addLayer({ id: 'res-line', type: 'line', source: 'res', filter: ['!', isDash], paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6, 18, 2.4], 'line-opacity': 0.95 } });
  map.addLayer({ id: 'res-dash', type: 'line', source: 'res', filter: isDash, paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 15, 1.6, 18, 2.4], 'line-dasharray': [3, 2], 'line-opacity': 0.95 } });
  return solid;
}
export function clearResult(map) {
  for (const l of ['res-pt', 'res-fill', 'res-line', 'res-dash']) if (map.getLayer(l)) map.removeLayer(l);
  for (const s of ['res', 'res-pt']) if (map.getSource(s)) map.removeSource(s);
}
export const hasResult = (map) => !!map.getSource('res');
export function frame(map, b, o = {}) { map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: o.pad ?? 24, duration: o.instant ? 0 : 1250, maxZoom: o.maxZoom || 17.4, essential: true }); }
export function setHybrid(map, on) { if (map.getLayer('vhyb')) map.setLayoutProperty('vhyb', 'visibility', on ? 'visible' : 'none'); }
