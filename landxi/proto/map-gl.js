/* 지도 서비스 — MapLibre 층. 진짜 지도 · 진짜 타일 · 진짜 도형만 올린다.
   배경 = V-World(js/sources.js · 키가 죽으면 키 없는 xdworld, 그것도 막히면 EOX)
   결과 = assets/data/geo/results/**.geojson 을 청록으로(탐지 색은 원본에도 속성이 없다 — admin-map.js 와 같은 규칙)
   선 색·두께 · 면 투명도 · 배경지도 · 탐지 외곽선 두께는 서비스 관리가 저장한 `lx-map-props` 를 그대로 받는다. */
import { EOX, resolveVWorld } from './js/sources.js';
import { TEAL, isDashCls, QUINT_FILL, centroid } from './map-data.js';

export const hasGL = () => typeof window.maplibregl !== 'undefined';
const FC = (features = []) => ({ type: 'FeatureCollection', features });
const PT_MAX = 13.6;                                    // 이 줌 아래에서는 필지가 1px 도 안 된다 → 중심점

/* ══ 1. 판 세우기 ═════════════════════════════════════════════════════════ */
export async function createMap(el, opt = {}) {
  const v = await resolveVWorld().catch(() => null);
  const ok = !!v;
  const swap = (layer, ext) => (v?.keyed ? v.sat.replace('Satellite', layer).replace('.jpeg', '.' + ext) : `https://xdworld.vworld.kr/2d/${layer}/service/{z}/{x}/{y}.${ext}`);
  const ras = (tiles, mn, mx) => ({ type: 'raster', tiles: [tiles], tileSize: 256, minzoom: mn ?? v?.minzoom ?? 5, maxzoom: mx ?? v?.maxzoom ?? 19, attribution: '' });
  const map = new maplibregl.Map({
    container: el, attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    center: opt.center || [127.42136, 35.43203], zoom: opt.zoom ?? 11.4, minZoom: 6, maxZoom: 18.4,
    style: { version: 8,
      sources: {
        vsat: ras(ok ? v.sat : EOX), vbase: ras(swap('Base', 'png')), vnight: ras(swap('midnight', 'png')), vhyb: ras(ok ? v.hyb : EOX),
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#0A1018' } },
        { id: 'b-sat', type: 'raster', source: 'vsat', paint: { 'raster-saturation': -0.1, 'raster-contrast': 0.04, 'raster-fade-duration': 200 } },
        { id: 'b-base', type: 'raster', source: 'vbase', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } },
        { id: 'b-night', type: 'raster', source: 'vnight', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } },
        { id: 'b-hyb', type: 'raster', source: 'vhyb', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } },
      ] },
  });
  map.touchZoomRotate?.disableRotation?.();
  map.keyboard?.disableRotation?.();
  map.getCanvas().setAttribute('aria-label', opt.label || '지도 — 화살표 키로 이동, +/- 로 확대·축소');
  map.getCanvas().setAttribute('tabindex', '0');
  await new Promise((res) => map.on('load', res));

  /* 고정 자리 — 결과 레이어는 언제나 `sr-fill` 앞에 꽂는다(순서가 흔들리지 않게). */
  map.addSource('emd', { type: 'geojson', data: FC() });
  map.addSource('emd-pt', { type: 'geojson', data: FC() });
  map.addSource('sr', { type: 'geojson', data: FC() });
  map.addSource('hl', { type: 'geojson', data: FC() });
  map.addSource('num', { type: 'geojson', data: FC() });
  map.addSource('msr', { type: 'geojson', data: FC() });
  map.addSource('msr-pt', { type: 'geojson', data: FC() });
  map.addSource('aoi', { type: 'geojson', data: FC() });
  map.addLayer({ id: 'emd-fill', type: 'fill', source: 'emd', layout: { visibility: 'none' }, paint: { 'fill-color': ['get', 'fill'], 'fill-opacity': 1 } });
  map.addLayer({ id: 'emd-line', type: 'line', source: 'emd', layout: { visibility: 'none', 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1, 'line-opacity': 0.72 } });
  map.addLayer({ id: 'emd-sel', type: 'line', source: 'emd', layout: { visibility: 'none', 'line-join': 'miter' }, filter: ['==', ['get', 'sel'], true], paint: { 'line-color': '#1BA3E8', 'line-width': 2.4 } });
  map.addLayer({ id: 'sr-fill', type: 'fill', source: 'sr', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.12 } });
  map.addLayer({ id: 'sr-line', type: 'line', source: 'sr', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 2 } });
  map.addLayer({ id: 'hl-line', type: 'line', source: 'hl', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 2.2 } });
  map.addLayer({ id: 'num-dot', type: 'circle', source: 'num', paint: { 'circle-radius': 3, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#010102', 'circle-stroke-width': 1 } });
  map.addLayer({ id: 'aoi-fill', type: 'fill', source: 'aoi', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.1 } });
  map.addLayer({ id: 'aoi-line', type: 'line', source: 'aoi', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1.6, 'line-dasharray': [3, 2] } });
  map.addLayer({ id: 'msr-fill', type: 'fill', source: 'msr', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.14 } });
  map.addLayer({ id: 'msr-line', type: 'line', source: 'msr', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1.8 } });
  map.addLayer({ id: 'msr-vx', type: 'circle', source: 'msr-pt', paint: { 'circle-radius': 3.6, 'circle-color': ['coalesce', ['get', 'c'], '#FFFFFF'], 'circle-stroke-color': '#010102', 'circle-stroke-width': 1 } });
  el.dataset.map = 'ready';
  map.__keys = new Set();
  return map;
}

/* ══ 2. 배경지도 ══════════════════════════════════════════════════════════ */
export function setBase(map, id) {
  if (!map?.getLayer('b-sat')) return;
  const vis = (l, on) => map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none');
  vis('b-sat', id === 'satellite'); vis('b-base', id === 'base' || id === 'gray'); vis('b-night', id === 'night');
  map.setPaintProperty('b-base', 'raster-saturation', id === 'gray' ? -1 : 0);
  map.setPaintProperty('bg', 'background-color', id === 'none' ? '#FFFFFF' : '#0A1018');
  map.__base = id;
}
export const setHybrid = (map, on) => { if (map?.getLayer('b-hyb')) map.setLayoutProperty('b-hyb', 'visibility', on ? 'visible' : 'none'); };

/* ══ 3. 결과 레이어 ═══════════════════════════════════════════════════════
   한 결과 = 점(낮은 줌) · 면 · 선 · 점선 네 켜. 탐지 외곽선 두께는 지도 속성 polyWidth. */
export function addResult(map, key, geo, o = {}) {
  removeResult(map, key);
  const w = o.polyWidth ?? 2, op = (o.opacity ?? 100) / 100;
  const dash = [...new Set(geo.features.map((f) => f.properties.cls))].filter(isDashCls);
  const isD = ['in', ['get', 'cls'], ['literal', dash]];
  map.addSource(key, { type: 'geojson', data: geo, promoteId: 'id' });
  map.addSource(key + '-pt', { type: 'geojson', data: { type: 'FeatureCollection', features: geo.features.map((f) => ({ type: 'Feature', properties: { cls: f.properties.cls }, geometry: { type: 'Point', coordinates: centroid(f) } })) } });
  const before = 'sr-fill';
  map.addLayer({ id: key + '-pt', type: 'circle', source: key + '-pt', maxzoom: PT_MAX, paint: { 'circle-color': TEAL, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.3, 11, 2.2, 13.6, 3.4], 'circle-opacity': 0.92 * op } }, before);
  map.addLayer({ id: key + '-fill', type: 'fill', source: key, minzoom: PT_MAX - 1.6, filter: ['!', isD], paint: { 'fill-color': TEAL, 'fill-opacity': 0.18 * op } }, before);
  map.addLayer({ id: key + '-line', type: 'line', source: key, minzoom: PT_MAX - 1.6, filter: ['!', isD], layout: { 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, w * 0.5, 15, w * 0.85, 18, w * 1.3], 'line-opacity': 0.95 * op } }, before);
  map.addLayer({ id: key + '-dash', type: 'line', source: key, minzoom: PT_MAX - 1.6, filter: isD, layout: { 'line-join': 'miter' }, paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, w * 0.5, 15, w * 0.85, 18, w * 1.3], 'line-dasharray': [3, 2], 'line-opacity': 0.95 * op } }, before);
  map.__keys.add(key);
}
export function removeResult(map, key) {
  for (const s of ['-pt', '-fill', '-line', '-dash']) if (map.getLayer(key + s)) map.removeLayer(key + s);
  for (const s of ['', '-pt']) if (map.getSource(key + s)) map.removeSource(key + s);
  map.__keys?.delete(key);
}
export function setResultOpacity(map, key, pct) {
  const op = Math.max(0, Math.min(100, pct)) / 100;
  if (map.getLayer(key + '-pt')) map.setPaintProperty(key + '-pt', 'circle-opacity', 0.92 * op);
  if (map.getLayer(key + '-fill')) map.setPaintProperty(key + '-fill', 'fill-opacity', 0.18 * op);
  for (const s of ['-line', '-dash']) if (map.getLayer(key + s)) map.setPaintProperty(key + s, 'line-opacity', 0.95 * op);
}
export function setResultWidth(map, key, w) {
  for (const s of ['-line', '-dash']) if (map.getLayer(key + s)) map.setPaintProperty(key + s, 'line-width', ['interpolate', ['linear'], ['zoom'], 12, w * 0.5, 15, w * 0.85, 18, w * 1.3]);
}
export function setResultFilter(map, key, filter) {
  const dashOnly = map.getLayer(key + '-dash') ? map.getFilter(key + '-dash') : null;
  if (!map.getLayer(key + '-fill')) return;
  const base = map.__baseFilter?.[key] || null;
  map.__baseFilter = map.__baseFilter || {};
  if (!base) map.__baseFilter[key] = { fill: map.getFilter(key + '-fill'), line: map.getFilter(key + '-line'), dash: dashOnly };
  const b = map.__baseFilter[key];
  const and = (f) => (filter ? ['all', f, filter] : f);
  map.setFilter(key + '-fill', and(b.fill)); map.setFilter(key + '-line', and(b.line));
  if (b.dash) map.setFilter(key + '-dash', and(b.dash));
  map.setFilter(key + '-pt', filter || null);
}
export const resultKeys = (map) => [...(map.__keys || [])];

/* ══ 4. 원본 영상(정사영상 시점) — 실 타일 ═══════════════════════════════ */
export function setEpoch(map, ep) {
  if (map.getLayer('epoch')) map.removeLayer('epoch');
  if (map.getSource('epoch')) map.removeSource('epoch');
  if (!ep) { map.__epoch = null; return; }
  map.addSource('epoch', { type: 'raster', tiles: [ep.tiles], tileSize: 256, minzoom: ep.minzoom, maxzoom: ep.maxzoom, bounds: ep.bounds, attribution: '' });
  map.addLayer({ id: 'epoch', type: 'raster', source: 'epoch', paint: { 'raster-fade-duration': 200 } }, 'emd-fill');
  map.__epoch = ep.id;
}
/** 분석 영역 = 결과 bbox 윤곽(원본 `분석 영역` 체크). */
export function setExtent(map, boxes) {
  const fs = boxes.map((b) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]], [b[0], b[1]]]] } }));
  if (!map.getSource('ext')) {
    map.addSource('ext', { type: 'geojson', data: FC(fs) });
    map.addLayer({ id: 'ext-line', type: 'line', source: 'ext', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1, 'line-dasharray': [4, 3], 'line-opacity': 0.6 } }, 'sr-fill');
  } else map.getSource('ext').setData(FC(fs));
}

/* ══ 5. 지역 구분(읍면동 5분위) ═══════════════════════════════════════════ */
export function setEmd(map, features, o = {}) {
  const vis = features.length ? 'visible' : 'none';
  map.getSource('emd').setData(FC(features));
  map.getSource('emd-pt').setData(FC(features.map((f) => ({ type: 'Feature', properties: f.properties, geometry: { type: 'Point', coordinates: centroid(f) } }))));
  for (const l of ['emd-fill', 'emd-line', 'emd-sel']) map.setLayoutProperty(l, 'visibility', vis);
  if (o.lxColor) { map.setPaintProperty('emd-line', 'line-color', o.lxColor); map.setPaintProperty('emd-line', 'line-width', o.lxWidth || 1); }
}
export const EMD_FILL = QUINT_FILL;
export function markEmd(map, names) {
  const src = map.getSource('emd'); if (!src) return;
  const d = src._data || src.serialize?.().data; if (!d) return;
  const set = new Set(names);
  d.features.forEach((f) => { f.properties.sel = set.has(f.properties.nm); });
  src.setData(d);
}

/* ══ 6. 선택 · 검색 표식 · 표 번호 ═══════════════════════════════════════ */
export const setSearchShapes = (map, fs) => map.getSource('sr')?.setData(FC(fs));
export const setHighlight = (map, fs) => map.getSource('hl')?.setData(FC(fs));
export const setNumbers = (map, fs) => map.getSource('num')?.setData(FC(fs));
export function applyProps(map, p) {
  if (!map?.getLayer('sr-fill')) return;
  map.setPaintProperty('sr-fill', 'fill-color', p.searchFillColor);
  map.setPaintProperty('sr-fill', 'fill-opacity', (p.searchFillOpacity || 0) / 100);
  map.setPaintProperty('sr-line', 'line-color', p.searchStrokeColor);
  map.setPaintProperty('sr-line', 'line-width', p.searchWidth);
  map.setPaintProperty('hl-line', 'line-color', p.searchStrokeColor);
  map.setPaintProperty('hl-line', 'line-width', Math.max(2, p.searchWidth + 0.4));
  map.setPaintProperty('emd-line', 'line-color', p.lxColor);
  map.setPaintProperty('emd-line', 'line-width', p.lxWidth);
  for (const k of resultKeys(map)) setResultWidth(map, k, p.polyWidth);
  setBase(map, p.baseMap);
}

/* ══ 7. 창 안 집계 · 스케일 ══════════════════════════════════════════════ */
export function inView(map, geo) {
  const b = map.getBounds();
  let n = 0; const cls = {};
  for (const f of geo.features) {
    const c = centroid(f);
    if (c[0] < b.getWest() || c[0] > b.getEast() || c[1] < b.getSouth() || c[1] > b.getNorth()) continue;
    n++; cls[f.properties.cls] = (cls[f.properties.cls] || 0) + 1;
  }
  return { n, cls };
}
const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
export function scaleBar(map, maxPx = 108) {
  const c = map.getCenter(), y = map.getContainer().clientHeight / 2;
  const a = map.unproject([0, y]), b = map.unproject([maxPx, y]);
  const m = haversine(a.lng, a.lat, b.lng, b.lat);
  const pick = NICE.filter((v) => v <= m).pop() || NICE[0];
  return { px: Math.round((pick / m) * maxPx), label: pick >= 1000 ? `${pick / 1000} km` : `${pick} m`, center: c };
}
export function haversine(x1, y1, x2, y2) {
  const R = 6371008.8, r = Math.PI / 180;
  const dx = (x2 - x1) * r * Math.cos(((y1 + y2) / 2) * r), dy = (y2 - y1) * r;
  return Math.hypot(dx, dy) * R;
}
export function pathLength(coords) { let s = 0; for (let i = 1; i < coords.length; i++) s += haversine(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]); return s; }
export function polyArea(coords) {
  if (coords.length < 3) return 0;
  const R = 6378137, r = Math.PI / 180; let a = 0;
  for (let i = 0, n = coords.length; i < n; i++) {
    const [x1, y1] = coords[i], [x2, y2] = coords[(i + 1) % n];
    a += (x2 - x1) * r * (2 + Math.sin(y1 * r) + Math.sin(y2 * r));
  }
  return Math.abs((a * R * R) / 2);
}

/* ══ 8. 재는 도구 · 그리는 도구 · 관심 구역 — 한 몸 ══════════════════════
   mode: null | 'distance' | 'area' | 'radius' | 'point' | 'line' | 'circle' | 'polygon' | 'aoi'
   클릭 = 꼭지점 추가 · 더블클릭/Enter = 완료 · Esc = 취소. 값은 실좌표로 계산한다. */
export function tools(map, onChange) {
  let mode = null, pts = [], done = [], moving = null;
  const circle = (c, r, n = 48) => { const out = []; for (let i = 0; i <= n; i++) { const t = (i / n) * 2 * Math.PI; const dy = (r / 110574) * Math.cos(t), dx = (r / (111320 * Math.cos(c[1] * Math.PI / 180))) * Math.sin(t); out.push([c[0] + dx, c[1] + dy]); } return out; };
  const feat = (g, p = {}) => ({ type: 'Feature', properties: p, geometry: g });
  const isArea = () => mode === 'area' || mode === 'polygon' || mode === 'aoi';
  const isLine = () => mode === 'distance' || mode === 'line';

  function shape(list, m) {
    if (!list.length) return null;
    if (m === 'point') return feat({ type: 'Point', coordinates: list[0] });
    if (m === 'radius' || m === 'circle') { if (list.length < 2) return null; const r = haversine(list[0][0], list[0][1], list[1][0], list[1][1]); return feat({ type: 'Polygon', coordinates: [circle(list[0], r)] }, { r }); }
    if (m === 'area' || m === 'polygon' || m === 'aoi') { if (list.length < 3) return feat({ type: 'LineString', coordinates: list }); return feat({ type: 'Polygon', coordinates: [[...list, list[0]]] }); }
    return feat({ type: 'LineString', coordinates: list });
  }
  function label(f, m) {
    if (!f) return '';
    if (m === 'point') return `점 · ${f.geometry.coordinates[0].toFixed(4)} E · ${f.geometry.coordinates[1].toFixed(4)} N`;
    if (m === 'radius' || m === 'circle') return `반경 ${f.properties.r >= 1000 ? (f.properties.r / 1000).toFixed(2) + ' km' : Math.round(f.properties.r) + ' m'}`;
    if (f.geometry.type === 'Polygon') { const a = polyArea(f.geometry.coordinates[0]); return m === 'aoi' ? `관심 구역 · ${(a / 10000).toFixed(1)} ha` : `면적 ${a >= 1e6 ? (a / 1e6).toFixed(2) + ' km²' : Math.round(a).toLocaleString('ko-KR') + ' m²'}`; }
    const d = pathLength(f.geometry.coordinates); return `거리 ${d >= 1000 ? (d / 1000).toFixed(2) + ' km' : d.toFixed(1) + ' m'}`;
  }
  function paint() {
    const live = shape(moving ? [...pts, moving] : pts, mode);
    const fs = [...done.map((d) => d.f), ...(live ? [live] : [])];
    const src = mode === 'aoi' ? 'aoi' : 'msr';
    map.getSource('msr').setData(FC(mode === 'aoi' ? [] : fs));
    map.getSource('aoi').setData(FC(mode === 'aoi' ? fs : (map.__aoi || [])));
    map.getSource('msr-pt').setData(FC(pts.map((p) => feat({ type: 'Point', coordinates: p }, { c: src === 'aoi' ? '#1BA3E8' : '#FFFFFF' }))));
    onChange?.({ mode, live, liveLabel: label(live, mode), done: done.map((d) => ({ label: d.label, at: centroid2(d.f) })), pts: pts.length });
  }
  const centroid2 = (f) => { const g = f.geometry; if (g.type === 'Point') return g.coordinates; const cs = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates; let x = 0, y = 0; for (const c of cs) { x += c[0]; y += c[1]; } return [x / cs.length, y / cs.length]; };

  function finish() {
    const f = shape(pts, mode);
    if (f && (mode === 'point' || pts.length >= (isArea() ? 3 : 2))) done.push({ f, label: label(f, mode), mode });
    pts = []; moving = null; paint();
  }
  const onClick = (e) => { if (!mode) return; pts.push([e.lngLat.lng, e.lngLat.lat]); if (mode === 'point') finish(); else if ((mode === 'radius' || mode === 'circle') && pts.length === 2) finish(); else paint(); };
  const onMove = (e) => { if (!mode || !pts.length) return; moving = [e.lngLat.lng, e.lngLat.lat]; paint(); };
  const onDbl = (e) => { if (!mode) return; e.preventDefault?.(); if (pts.length) finish(); };
  map.on('click', onClick); map.on('mousemove', onMove); map.on('dblclick', onDbl);

  return {
    set(m) { mode = m; pts = []; moving = null; if (!m) { done = []; } map.getCanvas().style.cursor = m ? 'crosshair' : ''; map.doubleClickZoom[m ? 'disable' : 'enable'](); paint(); },
    get mode() { return mode; },
    undo() { if (pts.length) pts.pop(); else done.pop(); paint(); },
    clear() { pts = []; moving = null; done = []; paint(); },
    cancel() { this.set(null); map.__aoi = map.__aoi || []; paint(); },
    saveAoi() { if (pts.length >= 3) finish(); const fs = done.map((d) => d.f); map.__aoi = fs; const total = fs.reduce((a, f) => a + (f.geometry.type === 'Polygon' ? polyArea(f.geometry.coordinates[0]) : 0), 0); this.set(null); map.getSource('aoi').setData(FC(fs)); return { n: fs.length, ha: total / 10000 }; },
    get done() { return done; },
  };
}

/* ══ 9. 겹쳐보기 스와이프 — 오른쪽 시점을 잘라 보여 준다 ═════════════════ */
export function swipe(map, ratio) { map.__swipe = ratio; }
export function fit(map, bbox, o = {}) {
  if (!bbox || !isFinite(bbox[0])) return;
  map.fitBounds([[bbox[0], bbox[1]], [bbox[2], bbox[3]]], { padding: o.pad ?? 40, duration: o.instant ? 0 : 900, maxZoom: o.maxZoom ?? 17.2, essential: true });
}
