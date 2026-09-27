/* K3 stage.js — 지도 무대. V-World 위성 기반 · 전국 → 지역 카메라 · (선택) 영상 사다리.
   엔진은 landxi/xi/engine 을 import 만 한다(lx-map createMap · camera flyLadder · sources lxw 프로토콜 · ladder mountLadder · tier gpuInfo).
   · 기본 카메라 = 대한민국 전역 bounds [124.5,33.0]–[131.9,38.7] · 로드 전 바탕 --bg-0 · 기본 컨트롤 숨김 · 축척 막대만
   · stage.go(region|bbox) = 시군구 경계로 --e-cam 2400(해상도 공간 이징 · 점프 0)
   · stage.mode('ops') = 바탕 영상 saturate(.6)(데이터 층은 그대로)
   페이지는 maplibre-gl.js(+ pmtiles.js 권장)를 먼저 싣는다.
   const st = createStage(el); await st.ready; st.go(region); st.geo('ai', featureCollection, 'ai'); st.pad({ right: 416 }) */
import { createMap, loaded } from '../../xi/engine/lx-map.js';
import { flyLadder, stopFlight } from '../../xi/engine/camera.js';
import { registerPmtiles, setExtMode } from '../../xi/engine/sources.js';
import { gpuInfo } from '../../xi/engine/tier.js';
import { bboxOf, RM } from './util.js';

export const KOREA = [124.5, 33.0, 131.9, 38.7];
const EOX = 'tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/GoogleMapsCompatible/{z}/{y}/{x}.jpg';
const VW = 'xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const EMPTY = { type: 'FeatureCollection', features: [] };

/* 데이터 층 모양 3종 — 색은 AI 결과 위에서만 청록(법전 §1) */
const LOOK = {
  ai: (id) => [
    { id: id + '-f', type: 'fill', paint: { 'fill-color': '#0FA9A0', 'fill-opacity': 0.22 } },
    { id: id + '-h', type: 'line', paint: { 'line-color': 'rgba(15,169,160,.28)', 'line-width': 4 } },
    { id: id + '-l', type: 'line', paint: { 'line-color': '#0FA9A0', 'line-width': 1.4 } },
    { id: id + '-p', type: 'circle', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#0FA9A0', 'circle-stroke-width': 1.6 } },
  ],
  focus: (id) => [
    { id: id + '-f', type: 'fill', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.06 } },
    { id: id + '-l', type: 'line', paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-opacity': 0.9 } },
  ],
  point: (id) => [
    { id: id + '-p', type: 'circle', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3, 14, 6], 'circle-color': '#FFFFFF', 'circle-stroke-color': '#1C1F25', 'circle-stroke-width': 1 } },
  ],
};

export function createStage(el, { mode = 'app', bounds = KOREA, interactive = true, scale = true, padding } = {}) {
  if (!window.maplibregl) throw new Error('[kit/stage] maplibre-gl.js 를 먼저 싣는다');
  el.classList.add('k-stage');
  const wrap = document.createElement('div'); wrap.className = 'k-stage-map'; el.prepend(wrap);
  const ext = !!window.pmtiles;           // lxw 프로토콜(Worker fetch · 외부 타일 실패가 콘솔 오류가 되지 않음)은 pmtiles 가 있어야 등록된다
  if (ext) { setExtMode('worker'); registerPmtiles(); }
  const url = (u) => (ext ? 'lxw://' : 'https://') + u;
  const soft = /swiftshader|llvmpipe|software/i.test(gpuInfo().renderer || '');
  const map = createMap({ container: wrap, mode: 'flat', center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], zoom: 6, maxPitch: soft ? 45 : 60, interactive });
  map.getCanvas().setAttribute('aria-label', '지도');
  let pad = padding || defaultPad();
  map.fitBounds(bounds, { padding: pad, duration: 0 });
  if (scale) map.addControl(new window.maplibregl.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');

  const ready = loaded(map).then(() => {
    map.addSource('k-eox', { type: 'raster', tiles: [url(EOX)], tileSize: 256, maxzoom: 13 });
    map.addSource('k-vw', { type: 'raster', tiles: [url(VW)], tileSize: 256, minzoom: 6, maxzoom: 19, bounds: [124.5, 33.0, 132.0, 38.9] });
    map.addLayer({ id: 'k-eox', type: 'raster', source: 'k-eox', paint: { 'raster-fade-duration': 500 } }, 'slot-imagery');
    map.addLayer({ id: 'k-vw', type: 'raster', source: 'k-vw', minzoom: 6.5, paint: { 'raster-fade-duration': 500, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0, 7.4, 1] } }, 'slot-imagery');
    setMode(mode);
    el.classList.add('is-ready');
    return map;
  });

  function setMode(m) {
    mode = m; el.dataset.mode = m;
    const sat = m === 'ops' ? -0.4 : 0;     // raster-saturation −0.4 ≈ CSS saturate(.6)
    for (const id of ['k-eox', 'k-vw', ...(map.getStyle()?.layers || []).filter((l) => l.type === 'raster' && /^img-/.test(l.id)).map((l) => l.id)])
      if (map.getLayer(id)) map.setPaintProperty(id, 'raster-saturation', sat);
  }

  /** 지역으로(시군구 경계) — region = { bbox } | bbox 배열 | GeoJSON */
  async function go(region, { ms = 2400, maxZoom = 13.5, pitch = 0 } = {}) {
    const b = Array.isArray(region) ? region : region?.bbox || bboxOf(region);
    if (!b) return false;
    await ready;
    const cam = map.cameraForBounds(b, { padding: pad, maxZoom });
    if (!cam) return false;
    const to = { center: cam.center, zoom: Math.min(cam.zoom, maxZoom), pitch, bearing: 0 };
    if (RM()) { map.jumpTo(to); return true; }
    return flyLadder([map], to, { duration: ms });
  }
  const home = (opt = {}) => go(bounds, { maxZoom: 7.5, ...opt });
  map.on('mousedown', stopFlight); map.on('wheel', stopFlight); map.on('touchstart', stopFlight);

  /** 데이터 층: geo(id, fc, look='ai'|'focus'|'point') — 같은 id 면 데이터만 바꾼다 */
  async function geo(id, fc, look = 'ai') {
    await ready;
    const sid = 'k-' + id;
    if (!map.getSource(sid)) {
      map.addSource(sid, { type: 'geojson', data: fc || EMPTY });
      for (const l of LOOK[look](sid)) map.addLayer({ ...l, source: sid }, 'slot-overlay');
    } else map.getSource(sid).setData(fc || EMPTY);
  }
  function clear(id) { const s = map.getSource('k-' + id); if (s) s.setData(EMPTY); }
  function show(id, on) { for (const l of map.getStyle().layers) if (l.source === 'k-' + id) map.setLayoutProperty(l.id, 'visibility', on ? 'visible' : 'none'); }

  /** (선택) 영상 사다리 — 카탈로그 LayerItem 을 xi 엔진 ladder 로 쌓는다 */
  async function ladder(items, order, opts = {}) {
    await ready;
    const { mountLadder } = await import('../../xi/engine/ladder.js');
    const L = await mountLadder(map, items, { order, before: 'slot-imagery', ...opts });
    setMode(mode);
    return L;
  }

  addEventListener('resize', () => { if (!padding) pad = defaultPad(); });
  const st = { el, map, ready, go, home, geo, clear, show, ladder, mode: setMode, pad(p) { pad = { ...defaultPad(), ...p }; }, get padding() { return pad; } };
  el.__stage = st;
  return st;
}

function defaultPad() {
  const m = matchMedia('(max-width: 640px)').matches;
  return m ? { top: 72, bottom: 72, left: 20, right: 20 } : { top: 96, bottom: 72, left: 64, right: 64 };
}
