// 결과 지도 — MapLibre 5.6.0. 이 화면의 계약은 하나다:
//   슬라이더를 끄는 동안 setFilter 가 **같은 프레임에** 폴리곤을 걸러내고,
//   같은 프레임에 카운트·히스토그램·클래스 막대가 갱신된다 (Roboflow P2).
// 그리고 걸러진 것은 사라지지 않고 opacity .12 로 감쇠한다 (Palantir P1).

import { classColor, ko } from './wf-data.js';

const VSAT_FREE = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const VHYB_FREE = 'https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png';
const keyed = (k, layer, ext) => `https://api.vworld.kr/req/wmts/1.0.0/${k}/${layer}/{z}/{y}/{x}.${ext}`;

// 키가 살아 있는지 타일 1장으로 확인한다. 실패하면 키 없는 xdworld 로 조용히 폴백.
export async function resolveVWorld() {
  const key = (window.VWORLD_KEY || '').trim();
  const out = { sat: VSAT_FREE, hyb: VHYB_FREE, keyed: false, minzoom: 5, maxzoom: 19 };
  if (!key) return out;
  try {
    const probe = keyed(key, 'Satellite', 'jpeg').replace('{z}', '9').replace('{y}', '204').replace('{x}', '437');
    const r = await fetch(probe, { cache: 'no-store' });
    if (r.ok && /image/.test(r.headers.get('content-type') || '')) {
      Object.assign(out, { sat: keyed(key, 'Satellite', 'jpeg'), hyb: keyed(key, 'Hybrid', 'png'),
                          keyed: true, minzoom: 7, maxzoom: 18 });
    }
  } catch { /* 오프라인 → 폴백 유지 */ }
  return out;
}

const CELL = 0.0045;                                  // 약 500 m — 격자 집계 셀 크기
const GRID_Z = 10.6;                                  // 이 아래로 줌아웃하면 격자로 바뀐다

export async function createMap(el, data, hooks) {
  const src = await resolveVWorld();

  const style = {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      sat: { type: 'raster', tiles: [src.sat], tileSize: 256, minzoom: src.minzoom, maxzoom: src.maxzoom,
             attribution: 'V-World' },
      hyb: { type: 'raster', tiles: [src.hyb], tileSize: 256, minzoom: src.minzoom, maxzoom: src.maxzoom },
      det: { type: 'geojson', data: data.fc },
      pts: { type: 'geojson', data: pointsOf(data.feats) },
      cells: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0C1620' } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-opacity': 1 } },
      { id: 'hyb', type: 'raster', source: 'hyb', paint: { 'raster-opacity': 0.85 } },
      // 격자 — 광역 스케일에서 수천 건을 한눈에. 500m 셀은 z7 에서 0.4px 이라 폴리곤으로는 안 보인다.
      // 그래서 셀을 "개수에 비례하는 원"으로 그린다. 최소 반경이 있어 어느 줌에서도 읽힌다.
      { id: 'cells', type: 'circle', source: 'cells', maxzoom: GRID_Z,
        paint: {
          'circle-color': ['interpolate', ['linear'], ['get', 'n'], 1, '#7FDCD6', 6, '#0FA9A0', 20, '#006DF7', 60, '#003B85'],
          'circle-opacity': 0.62,
          'circle-stroke-color': 'rgba(255,255,255,.42)', 'circle-stroke-width': 0.5,
          'circle-radius': ['interpolate', ['linear'], ['zoom'],
            5, ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 1.4, 8, 4.4],
            9, ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 2.4, 8, 9],
            GRID_Z, ['interpolate', ['linear'], ['sqrt', ['get', 'n']], 1, 4, 8, 16]] } },
      // 감쇠 레이어 — 걸러진 것도 화면에 남는다
      { id: 'det-dim', type: 'fill', source: 'det', minzoom: 13.4,
        paint: { 'fill-color': classExpr(), 'fill-opacity': 0.12 } },
      { id: 'pts-dim', type: 'circle', source: 'pts', minzoom: GRID_Z,
        paint: { 'circle-color': classExpr(), 'circle-opacity': 0.12,
                 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.6, 14, 4, 17, 7] } },
      // 통과 레이어
      { id: 'pts-on', type: 'circle', source: 'pts', minzoom: GRID_Z,
        paint: { 'circle-color': classExpr(), 'circle-opacity': 0.9,
                 'circle-stroke-color': 'rgba(255,255,255,.75)', 'circle-stroke-width': 0.6,
                 'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 1.9, 14, 4.6, 17, 8] } },
      { id: 'det-fill', type: 'fill', source: 'det', minzoom: 13.4,
        paint: { 'fill-color': classExpr(), 'fill-opacity': 0.22 } },
      { id: 'det-line', type: 'line', source: 'det', minzoom: 13.4,
        paint: { 'line-color': classExpr(), 'line-width': 2 } },
      { id: 'sel', type: 'circle', source: 'pts', filter: ['==', ['id'], -1],
        paint: { 'circle-radius': 11, 'circle-color': 'rgba(255,255,255,0)',
                 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 } },
    ],
  };

  const map = new maplibregl.Map({
    container: el, style, center: [126.72, 34.72], zoom: 8.1, pitch: 0, bearing: 0,
    attributionControl: false, fadeDuration: 120,
    localIdeographFontFamily: '"IBM Plex Sans KR", sans-serif',
  });
  map.dragRotate.disable();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-left');

  function classExpr() {
    const stops = [];
    for (const c of data.classes) stops.push(c.cls, classColor(c.cls));
    return ['match', ['get', 'cls'], ...stops, '#6675FF'];
  }
  function pointsOf(feats) {
    return { type: 'FeatureCollection',
      features: feats.map((f) => ({ type: 'Feature', id: f.id,
        properties: { cls: f.properties.cls, conf: f.properties.conf, area: f.properties.area, src: f.properties.src },
        geometry: { type: 'Point', coordinates: f.properties.c } })) };
  }

  /* ── 라이브 필터 ──────────────────────────────────────────────────── */
  const state = { thr: 0.5, classes: new Set(data.classes.map((c) => c.cls)), rep: 'poly' };

  function filterExpr() {
    return ['all',
      ['>=', ['get', 'conf'], state.thr],
      ['in', ['get', 'cls'], ['literal', [...state.classes]]]];
  }

  // 격자는 매번 실제 통과 검출에서 다시 센다 — mean_conf 로 근사하지 않는다.
  function aggregate() {
    const cells = new Map();
    for (const f of data.feats) {
      const p = f.properties;
      if (p.conf < state.thr || !state.classes.has(p.cls)) continue;
      const ix = Math.floor(p.c[0] / CELL), iy = Math.floor(p.c[1] / CELL);
      const k = ix + ':' + iy;
      const c = cells.get(k) || (cells.set(k, { ix, iy, n: 0, s: 0 }).get(k));
      c.n++; c.s += p.conf;
    }
    return { type: 'FeatureCollection', features: [...cells.values()].map((c) => ({
      type: 'Feature',
      properties: { n: c.n, conf: Math.round((c.s / c.n) * 1000) / 1000 },
      geometry: { type: 'Point', coordinates: [(c.ix + 0.5) * CELL, (c.iy + 0.5) * CELL] },
    })) };
  }

  let gridDirty = true;
  function refreshGrid() {
    if (!gridDirty) return;
    const s = map.getSource('cells'); if (!s) return;
    s.setData(aggregate()); gridDirty = false;
  }

  function apply({ thr, classes, rep } = {}) {
    if (thr != null) state.thr = thr;
    if (classes) state.classes = new Set(classes);
    if (rep) state.rep = rep;
    const f = filterExpr();
    for (const id of ['det-fill', 'det-line', 'pts-on']) if (map.getLayer(id)) map.setFilter(id, f);
    gridDirty = true;
    if (map.getZoom() < GRID_Z || state.rep === 'grid') refreshGrid();

    // 표현 모드 — 신뢰도 농도는 클래스색 대신 LX 블루 램프로 바꾼다.
    if (map.getLayer('det-fill')) {
      const ramp = ['interpolate', ['linear'], ['get', 'conf'],
        0.05, '#BFD9FF', 0.4, '#7FB2FF', 0.6, '#3E8BF9', 0.8, '#0052B9', 1, '#003B85'];
      const col = state.rep === 'conf' ? ramp : classExpr();
      map.setPaintProperty('det-fill', 'fill-color', col);
      map.setPaintProperty('det-line', 'line-color', col);
      map.setPaintProperty('pts-on', 'circle-color', col);
      const gridOnly = state.rep === 'grid';
      map.setLayerZoomRange('cells', 0, gridOnly ? 22 : GRID_Z);
      for (const id of ['pts-on', 'pts-dim']) map.setLayerZoomRange(id, gridOnly ? 22 : GRID_Z, 22);
      for (const id of ['det-fill', 'det-line', 'det-dim']) map.setLayerZoomRange(id, gridOnly ? 22 : 13.4, 22);
    }
  }

  map.on('zoomend', () => { if (map.getZoom() < GRID_Z || state.rep === 'grid') refreshGrid(); });

  /* ── 호버 · 선택 ─────────────────────────────────────────────────── */
  let hoverId = null;
  const HOVER = () => ['pts-on', 'det-fill', 'cells'].filter((l) => map.getLayer(l));
  map.on('mousemove', (e) => {
    const hit = map.queryRenderedFeatures(
      [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: HOVER() })[0];
    map.getCanvas().style.cursor = hit ? 'pointer' : '';
    if (!hit) { if (hoverId != null) { hoverId = null; hooks.onHover?.(null); } return; }
    // 격자 버블에는 id 가 없다 — 광역 줌에서도 호버가 죽지 않도록 셀 요약을 돌려준다.
    if (hit.layer.id === 'cells') {
      const c = hit.geometry.coordinates;
      const key = 'cell:' + c.join(',');
      if (key === hoverId) { hooks.onHoverMove?.(e.point); return; }
      hoverId = key;
      hooks.onHover?.({ cell: true, n: hit.properties.n, conf: hit.properties.conf, c }, e.point);
      return;
    }
    if (hit.id === hoverId) { hooks.onHoverMove?.(e.point); return; }
    hoverId = hit.id;
    const f = data.feats.find((x) => x.id === hit.id) || null;
    hooks.onHover?.(f ? { ...f.properties, id: f.id } : hit.properties, e.point);
  });
  map.on('mouseout', () => { hoverId = null; hooks.onHover?.(null); });
  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(
      [[e.point.x - 6, e.point.y - 6], [e.point.x + 6, e.point.y + 6]], { layers: HOVER() })[0];
    if (!hit) { if (map.getLayer('sel')) map.setFilter('sel', ['==', ['id'], -1]); return; }
    // 격자 버블 클릭 = 그 셀로 내려간다. 통계가 보고서가 아니라 항법이 된다.
    if (hit.layer.id === 'cells') {
      map.easeTo({ center: hit.geometry.coordinates, zoom: Math.max(14.2, map.getZoom() + 4), duration: 1200 });
      return;
    }
    if (map.getLayer('sel')) map.setFilter('sel', ['==', ['id'], hit.id]);
    hooks.onPick?.(data.feats.find((x) => x.id === hit.id));
  });

  return {
    map, state, apply, satUrl: src.sat, keyed: src.keyed,
    setLabels(on) { if (map.getLayer('hyb')) map.setLayoutProperty('hyb', 'visibility', on ? 'visible' : 'none'); },
    flyTo(o) { map.flyTo({ duration: 1200, essential: true, ...o }); },
    counts() {
      let shown = 0, area = 0, sum = 0;
      const per = new Map();
      for (const f of data.feats) {
        const p = f.properties;
        const on = p.conf >= state.thr && state.classes.has(p.cls);
        if (on) { shown++; area += p.area; sum += p.conf; }
        const e = per.get(p.cls) || (per.set(p.cls, { on: 0, all: 0 }).get(p.cls));
        e.all++; if (p.conf >= state.thr) e.on++;
      }
      return { shown, total: data.feats.length, area, mean: shown ? sum / shown : 0, per };
    },
  };
}

export { ko };
