// Land-XI 지도 스타일 — OpenFreeMap(OpenMapTiles 스키마) 위에 LX 토큰 팔레트를 입힌다.
const TILES = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
export const ORTHO_TILES = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';

/**
 * IMAGERY 항목의 상대 타일 경로(`assets/tiles/…`)를 문서 기준 URL 템플릿으로 바꾼다.
 * 하위 폴더(dev/*.html)에서는 <html data-base="../"> 가 접두사를 준다.
 */
export const tileURL = im => (document.documentElement.dataset.base || '') + im.tiles;

const DEFAULTS = { mist: '#E9EEF1', ink: '#111C2D', water: '#CFE0EF', road: '#FFFFFF', building: '#DDE3E8' };

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }
function rgb(hex) { const h = hex.replace('#', ''); const v = h.length === 3 ? h.split('').map(c => c + c).join('') : h; return [0, 2, 4].map(i => parseInt(v.slice(i, i + 2), 16)); }
/** hex 색을 amount(0..1)만큼 어둡게 한다. landuse 는 mist 를 살짝 눌러 쓴다. */
export function darken(hex, amount = 0.06) { return '#' + rgb(hex).map(c => clamp(c * (1 - amount)).toString(16).padStart(2, '0')).join(''); }
/** hex + alpha → rgba() 문자열. 잉크 12%/25% 같은 토큰 파생색에 쓴다. */
export function alpha(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }

/** LX 토큰으로 MapLibre 스타일 JSON을 만든다. */
export function buildStyle(tokens = {}) {
  const t = { ...DEFAULTS, ...tokens };
  return {
    version: 8,
    name: 'Land-XI Mist',
    glyphs: GLYPHS,
    sources: { openfreemap: { type: 'vector', url: TILES } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': t.mist } },
      { id: 'landuse', type: 'fill', source: 'openfreemap', 'source-layer': 'landuse', paint: { 'fill-color': darken(t.mist, 0.06), 'fill-opacity': 0.9 } },
      { id: 'water', type: 'fill', source: 'openfreemap', 'source-layer': 'water', paint: { 'fill-color': t.water } },
      { id: 'road-casing', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', minzoom: 6, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': alpha(t.ink, 0.12), 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.4, 12, 4, 16, 12] } },
      { id: 'road', type: 'line', source: 'openfreemap', 'source-layer': 'transportation', minzoom: 6, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': t.road, 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.6, 12, 2.6, 16, 10] } },
      { id: 'building-3d', type: 'fill-extrusion', source: 'openfreemap', 'source-layer': 'building', minzoom: 14, paint: { 'fill-extrusion-color': t.building, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } },
      { id: 'boundary', type: 'line', source: 'openfreemap', 'source-layer': 'boundary', paint: { 'line-color': alpha(t.ink, 0.25), 'line-width': 1, 'line-dasharray': [3, 2] } },
      { id: 'label-place', type: 'symbol', source: 'openfreemap', 'source-layer': 'place', layout: { 'text-field': ['coalesce', ['get', 'name:ko'], ['get', 'name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 6, 11, 12, 14] }, paint: { 'text-color': t.ink, 'text-halo-color': alpha('#FFFFFF', 0.9), 'text-halo-width': 1.2 } },
    ],
  };
}
