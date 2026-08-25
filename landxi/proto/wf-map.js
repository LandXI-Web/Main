/* wf-map.js — 지도가 곧 캔버스 (3안 A)
   이 화면의 바탕은 흰 캔버스가 아니라 남원 전역 정사영상이다.
   · 베이스   landxi/assets/tiles/namwon_city_2504|2510  (실제 드론 정사영상, 로컬 파일)
   · 주변부   V-World 위성(키 없으면 xdworld 폴백) — 어둡게 눌러 무대로만 쓴다
   · 데이터   실제 탐지 폴리곤. 채도는 여기에만 준다.
   가산 혼합 발광(kepler Layer Blending: additive)은 오버레이 캔버스에서 처리한다.
*/

import { C, imagery, EPOCHS } from './wf-data.js';

const VSAT_FREE = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const keyed = (k, layer, ext) => `https://api.vworld.kr/req/wmts/1.0.0/${k}/${layer}/{z}/{y}/{x}.${ext}`;

export async function resolveVWorld() {
  const key = (window.VWORLD_KEY || '').trim();
  const out = { sat: VSAT_FREE, keyed: false, minzoom: 5, maxzoom: 19 };
  if (!key) return out;
  try {
    const probe = keyed(key, 'Satellite', 'jpeg').replace('{z}', '9').replace('{y}', '204').replace('{x}', '437');
    const r = await fetch(probe, { cache: 'no-store' });
    if (r.ok && /image/.test(r.headers.get('content-type') || '')) {
      Object.assign(out, { sat: keyed(key, 'Satellite', 'jpeg'), keyed: true, minzoom: 7, maxzoom: 18 });
    }
  } catch { /* 오프라인 → 로컬 정사영상만으로도 화면은 성립한다 */ }
  return out;
}

const rasterSrc = (img, tiles) => ({
  type: 'raster', tiles: [tiles], tileSize: 256,
  minzoom: img.minzoom, maxzoom: img.maxzoom, bounds: img.bounds, attribution: 'LX 국토정보공사',
});

export async function createMap(el, data, hooks = {}) {
  const vw = await resolveVWorld();
  const city04 = imagery('namwon_city_2504'), city10 = imagery('namwon_city_2510');
  const abs = (t) => '../' + t;

  const sources = {
    sat: { type: 'raster', tiles: [vw.sat], tileSize: 256, minzoom: vw.minzoom, maxzoom: vw.maxzoom, attribution: 'V-World' },
    det: { type: 'geojson', data: data.fc, promoteId: null },
    sel: { type: 'geojson', data: empty() },
    brk: { type: 'geojson', data: empty() },
  };
  const layers = [
    { id: 'bg', type: 'background', paint: { 'background-color': C.bg } },
    { id: 'sat', type: 'raster', source: 'sat',
      paint: { 'raster-opacity': 0.85, 'raster-saturation': -0.82, 'raster-contrast': 0.12, 'raster-brightness-max': 0.62 } },
  ];

  if (city04) {
    sources.o04 = rasterSrc(city04, abs(city04.tiles));
    layers.push({ id: 'o04', type: 'raster', source: 'o04',
      paint: { 'raster-opacity': 1, 'raster-saturation': -0.58, 'raster-contrast': 0.14, 'raster-brightness-max': 0.86, 'raster-fade-duration': 160 } });
  }
  if (city10) {
    sources.o10 = rasterSrc(city10, abs(city10.tiles));
    layers.push({ id: 'o10', type: 'raster', source: 'o10',
      paint: { 'raster-opacity': 1, 'raster-saturation': -0.58, 'raster-contrast': 0.14, 'raster-brightness-max': 0.86, 'raster-fade-duration': 160 } });
  }
  // AOI 4시점 — 전역에는 없는 06·08 이 실제로 존재하는 유일한 도엽(금지 농경지).
  for (const e of EPOCHS) {
    const im = imagery(e.aoi);
    if (!im) continue;
    sources['aoi' + e.key] = rasterSrc(im, abs(im.tiles));
    layers.push({ id: 'aoi' + e.key, type: 'raster', source: 'aoi' + e.key,
      layout: { visibility: e.key === '2510' ? 'visible' : 'none' },
      paint: { 'raster-opacity': 1, 'raster-saturation': -0.5, 'raster-contrast': 0.12, 'raster-fade-duration': 120 } });
  }

  layers.push(
    // 탈락한 것도 지우지 않는다 — 무채로 남긴다(Palantir P1 · FUI 결손은 무채).
    { id: 'det-dim', type: 'fill', source: 'det', minzoom: 12.6,
      paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.045 } },
    { id: 'det-dim-line', type: 'line', source: 'det', minzoom: 12.6,
      paint: { 'line-color': 'rgba(255,255,255,.28)', 'line-width': 0.6 } },
    // 통과 — 채도는 여기에만.
    { id: 'det-fill', type: 'fill', source: 'det', minzoom: 12.6,
      paint: { 'fill-color': C.teal, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 12.6, 0.04, 15.4, 0.10, 16.6, 0.24] } },
    { id: 'det-line', type: 'line', source: 'det', minzoom: 12.6,
      paint: { 'line-color': C.teal, 'line-width': ['interpolate', ['linear'], ['zoom'], 12.6, 0.5, 17, 1.6],
               'line-opacity': ['interpolate', ['linear'], ['zoom'], 12.6, 0.25, 15.8, 1] } },
    { id: 'sel-fill', type: 'fill', source: 'sel', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.05 } },
    { id: 'sel-line', type: 'line', source: 'sel',
      paint: { 'line-color': '#FFFFFF', 'line-width': 1, 'line-opacity': 0.85 } },
    { id: 'brk', type: 'line', source: 'brk',
      paint: { 'line-color': C.amber, 'line-width': 1.5 } },
  );

  const map = new maplibregl.Map({
    container: el,
    style: { version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf', sources, layers },
    center: [(data.core[0] + data.core[2]) / 2, (data.core[1] + data.core[3]) / 2],
    zoom: 10.2, pitch: 62, bearing: -26,
    attributionControl: false, fadeDuration: 140, dragRotate: true,
    localIdeographFontFamily: '"Pretendard", sans-serif',
  });

  // 성긴 타일셋의 빈 칸은 투명 1×1 로 돌아온다(tools/serve.mjs). 그것을 디코딩 실패로
  // 콘솔에 쏟아 내지 않는다 — 우리 코드가 낸 오류만 남긴다.
  map.on('error', (e) => {
    const m = String(e?.error?.message || e?.error || '');
    if (/could not be decoded|Failed to fetch|AbortError|404/i.test(m)) return;
    console.warn('[map]', m);
  });

  const state = { thr: data.preset.conf0, classes: new Set(data.classes.map((c) => c.cls)), cascade: 1, t: 3 };

  function empty() { return { type: 'FeatureCollection', features: [] }; }

  function passExpr() {
    return ['all',
      ['>=', ['get', 'conf'], state.thr],
      ['<=', ['get', 'r'], state.cascade],
      ['in', ['get', 'cls'], ['literal', [...state.classes]]]];
  }
  function apply() {
    const f = passExpr();
    for (const id of ['det-fill', 'det-line']) if (map.getLayer(id)) map.setFilter(id, f);
    hooks.onFilter?.();
  }

  /* ── 시점 스크럽 — 전역 정사영상은 04·10 두 장뿐이다. 그 사실을 숨기지 않는다. */
  function setEpoch(t) {
    state.t = t;
    const mix = Math.max(0, Math.min(1, t / 3));
    if (map.getLayer('o10')) map.setPaintProperty('o10', 'raster-opacity', mix);
    const near = EPOCHS[Math.max(0, Math.min(3, Math.round(t)))];
    for (const e of EPOCHS) {
      const id = 'aoi' + e.key;
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', e.key === near.key ? 'visible' : 'none');
    }
    return near;
  }

  /* ── 뷰어 플래그 — 정확히 한 노드가 "지도가 지금 보고 있는 단계"다 (D7) */
  const VIEWS = {
    source: { det: false, dim: false, grid: false },
    tile:   { det: false, dim: false, grid: true },
    model:  { det: false, dim: true,  grid: false },
    detect: { det: true,  dim: false, grid: false },
    post:   { det: true,  dim: true,  grid: false },
    mapout: { det: true,  dim: true,  grid: false },
  };
  function setViewer(stage) {
    const v = VIEWS[stage] || VIEWS.detect;
    const vis = (id, on) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    vis('det-fill', v.det); vis('det-line', v.det);
    vis('det-dim', v.dim); vis('det-dim-line', v.dim);
    return v;
  }

  /* ── 선택 — lasso(Shift+드래그) / 클릭 ─────────────────────────────── */
  function showSelection(bbox) {
    const s = map.getSource('sel'); if (!s) return;
    if (!bbox) { s.setData(empty()); return; }
    const [w, so, e, n] = bbox;
    s.setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {},
      geometry: { type: 'Polygon', coordinates: [[[w, so], [e, so], [e, n], [w, n], [w, so]]] } }] });
  }
  // 코너 브래킷 — 전체 테두리보다 가볍고 "관측 장비" 느낌이 난다(장치 6).
  function showBrackets(bbox) {
    const s = map.getSource('brk'); if (!s) return;
    if (!bbox) { s.setData(empty()); return; }
    const [w, so, e, n] = bbox;
    const dx = (e - w) * 0.28, dy = (n - so) * 0.28;
    const seg = (a, b, c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [a, b, c] } });
    s.setData({ type: 'FeatureCollection', features: [
      seg([w, so + dy], [w, so], [w + dx, so]),
      seg([e - dx, so], [e, so], [e, so + dy]),
      seg([e, n - dy], [e, n], [e - dx, n]),
      seg([w + dx, n], [w, n], [w, n - dy]),
    ] });
  }

  let lasso = null;
  const box = document.createElement('div');
  box.id = 'lasso'; box.hidden = true;
  el.parentElement.appendChild(box);
  const canvas = () => map.getCanvasContainer();

  canvas().addEventListener('mousedown', (ev) => {
    if (!ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault(); ev.stopPropagation();
    map.dragPan.disable();
    const r = el.getBoundingClientRect();
    lasso = { x0: ev.clientX - r.left, y0: ev.clientY - r.top, x1: 0, y1: 0 };
    box.hidden = false;
  }, true);
  window.addEventListener('mousemove', (ev) => {
    if (!lasso) return;
    const r = el.getBoundingClientRect();
    lasso.x1 = ev.clientX - r.left; lasso.y1 = ev.clientY - r.top;
    const x = Math.min(lasso.x0, lasso.x1), y = Math.min(lasso.y0, lasso.y1);
    box.style.transform = `translate(${x}px,${y}px)`;
    box.style.width = Math.abs(lasso.x1 - lasso.x0) + 'px';
    box.style.height = Math.abs(lasso.y1 - lasso.y0) + 'px';
  });
  window.addEventListener('mouseup', () => {
    if (!lasso) return;
    box.hidden = true; map.dragPan.enable();
    const { x0, y0, x1, y1 } = lasso; lasso = null;
    if (Math.abs(x1 - x0) < 8 || Math.abs(y1 - y0) < 8) return;
    const a = map.unproject([Math.min(x0, x1), Math.min(y0, y1)]);
    const b = map.unproject([Math.max(x0, x1), Math.max(y0, y1)]);
    hooks.onLasso?.([Math.min(a.lng, b.lng), Math.min(a.lat, b.lat), Math.max(a.lng, b.lng), Math.max(a.lat, b.lat)]);
  });

  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(
      [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]],
      { layers: ['det-fill', 'det-dim'].filter((l) => map.getLayer(l)) })[0];
    hooks.onPick?.(hit ? hit.id : null, e.lngLat);
  });
  map.on('mousemove', (e) => {
    hooks.onMove?.(e.lngLat, e.point);
  });

  await new Promise((res) => (map.loaded() ? res() : map.once('load', res)));
  apply();

  return {
    map, state, apply, setEpoch, setViewer, showSelection, showBrackets,
    keyed: vw.keyed, satUrl: vw.sat,
    setThreshold(v) { state.thr = v; apply(); },
    setClasses(cs) { state.classes = new Set(cs); apply(); },
    setCascade(p) { state.cascade = p; apply(); },
    counts() {
      let shown = 0, obj = 0, area = 0, sum = 0;
      const per = new Map();
      for (const f of data.feats) {
        const p = f.properties;
        const on = p.conf >= state.thr && state.classes.has(p.cls) && p.r <= state.cascade;
        if (on) { shown++; obj += p.nobj; area += p.area; sum += p.conf; }
        const e = per.get(p.cls) || per.set(p.cls, { on: 0, all: 0, obj: 0 }).get(p.cls);
        e.all++; if (on) { e.on++; e.obj += p.nobj; }
      }
      return { shown, obj, total: data.feats.length, objTotal: data.objTotal, area, mean: shown ? sum / shown : 0, per };
    },
  };
}
