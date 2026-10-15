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
/* 세계 바탕(낮은 줌 · 지구본 · 국내 전국 축척) — NASA Blue Marble 로 구운 판(공공 · 상업 이용 가능 · z0–8 · 10-15 EOx-모두교체).
   조각 폴더의 meta.json 이 없으면(정적 배포) 국내 바탕(V-World)을 범위 없이 세계 전체로 깐다(V-World 는 z0–7 세계를 그린다 · 실측). */
const WORLD = new URL('../../data/tiles/world-bm/', import.meta.url).href;
export const WORLD_V = '?v=2';   // 판을 다시 구우면 올린다(바깥 주소 앞단이 지도 조각을 하루 보관 · 주소가 바뀌어야 새 조각)
const VW = 'xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
/* 해외 바탕 — Copernicus Sentinel-2 L2A 원 자료로 만든 구름 없는 모자이크(10 m · 무료 · 상업 이용 가능 · 10-14 해외바탕-교체).
   판 목록(나라 판 낮은 줌 · 구역 판 고줌 · 범위)은 조각 폴더의 meta.json 이 정한다(지역 고정값 0) · 없으면(정적 배포) 그냥 건너뛴다. */
const S2 = new URL('../../data/tiles/overseas-s2/', import.meta.url).href;
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

/* 지도 조각이 잠깐 끊긴 서버(502 · 503 · 504 · 연결 끊김)로 못 온 것 — 지도 엔진은 '오류' 듣는 이가 없으면 콘솔에 오류 객체를 그대로 찍었다
   (XI맵 콘솔의 'pt' 수백 건 = 지도 엔진의 AJAXError · impl-34 no-502). 그 조각만 조금 뒤 다시 받는다(조각마다 2번까지 · 1.5초 · 4초).
   그 밖의 오류(404 · 모양 오류 등)와 다시 받기를 다 쓴 경우는 경고 한 줄로 남긴다(화면마다 따로 단 오류 처리는 그대로 받는다). */
const TILE_RETRY = new Set([0, 502, 503, 504]);
function tileRetry(map) {
  const tries = new Map();
  map.on('error', (e) => {
    const err = e?.error, st = err?.status, sid = e?.sourceId || e?.source?.id;
    if (err?.name === 'AbortError' || /aborted/i.test(String(err?.message || ''))) return;
    const c = e?.tile?.tileID?.canonical;
    if (sid && TILE_RETRY.has(st) && map.getSource(sid)) {
      const key = sid + '/' + (c ? `${c.z}/${c.x}/${c.y}` : '*');
      const n = tries.get(key) || 0;
      if (n < 2) {
        tries.set(key, n + 1);
        setTimeout(() => { try { if (map.getSource(sid)) map.refreshTiles(sid, c ? [{ z: c.z, x: c.x, y: c.y }] : undefined); } catch { /* 지도가 닫혔다 */ } }, n ? 4000 : 1500);
        return;
      }
    }
    console.warn('[지도]', String(err?.message || err || e).slice(0, 200));
  });
}

export function createStage(el, { mode = 'app', bounds = KOREA, interactive = true, scale = true, padding, under = false } = {}) {
  if (!window.maplibregl) throw new Error('[kit/stage] maplibre-gl.js 를 먼저 싣는다');
  el.classList.add('k-stage');
  const wrap = document.createElement('div'); wrap.className = 'k-stage-map'; el.prepend(wrap);
  const ext = !!window.pmtiles;           // lxw 프로토콜(Worker fetch · 외부 타일 실패가 콘솔 오류가 되지 않음)은 pmtiles 가 있어야 등록된다
  if (ext) { setExtMode('worker'); registerPmtiles(); }
  const url = (u) => (ext ? 'lxw://' : 'https://') + u;
  const soft = /swiftshader|llvmpipe|software/i.test(gpuInfo().renderer || '');
  const map = createMap({ container: wrap, mode: 'flat', center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2], zoom: 6, maxPitch: soft ? 45 : 60, interactive });
  map.getCanvas().setAttribute('aria-label', '지도');
  tileRetry(map);
  let pad = padding || defaultPad();
  map.fitBounds(bounds, { padding: pad, duration: 0 });
  if (scale) map.addControl(new window.maplibregl.ScaleControl({ maxWidth: 96, unit: 'metric' }), 'bottom-left');

  const ready = loaded(map).then(() => {
    // 밑받침 — 아주 거친 한 장(z2 · 동아시아 전체를 타일 한두 장으로)이 늘 깔려, 입체로 기울이거나 돌릴 때 아직 안 온 타일 자리가 흰 바탕으로 비지 않는다(GPT2-1)
    //   under: true 인 화면만(XI맵 — 입체 보기가 있는 화면 · 지구본 · 영상 숨김 화면은 그대로)
    if (under) {
      map.addSource('k-under', { type: 'raster', tiles: [WORLD + '{z}/{x}/{y}.webp' + WORLD_V], tileSize: 256, maxzoom: 2 });
      map.addLayer({ id: 'k-under', type: 'raster', source: 'k-under', paint: { 'raster-fade-duration': 0 } }, 'slot-imagery');
    }
    map.addSource('k-world', { type: 'raster', tiles: [WORLD + '{z}/{x}/{y}.webp' + WORLD_V], tileSize: 256, maxzoom: 8 });
    map.addSource('k-vw', { type: 'raster', tiles: [url(VW)], tileSize: 256, minzoom: 6, maxzoom: 19, bounds: [124.5, 33.0, 132.0, 38.9] });
    map.addLayer({ id: 'k-world', type: 'raster', source: 'k-world', paint: { 'raster-fade-duration': 500 } }, 'slot-imagery');
    map.addLayer({ id: 'k-vw', type: 'raster', source: 'k-vw', minzoom: 6.5, paint: { 'raster-fade-duration': 500, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0, 7.4, 1] } }, 'slot-imagery');
    const S2P = overseas().catch(() => []);   // 해외 바탕 조각 없음 — 기존 바탕 그대로
    // 세계 바탕 판이 없으면(정적 배포) 국내 바탕(V-World)을 전국 축척부터 — 빈 바탕 지도 대신
    //   V-World 위성은 낮은 축척에서 세계 전체를 그려 준다(z0–7 실측) — 범위 없이 다시 올린다(층 순서는 그대로 · 자체 영상 아래 · 지구본 장면 포함)
    fetch(WORLD + 'meta.json').then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => {
      S2P.then((sets) => credits(sets, m));
      if (m || !map.getLayer('k-vw')) return;
      const ls = map.getStyle().layers, next = ls[ls.findIndex((l) => l.id === 'k-vw') + 1]?.id;
      map.removeLayer('k-vw'); map.removeSource('k-vw');
      map.addSource('k-vw', { type: 'raster', tiles: [url(VW)], tileSize: 256, minzoom: 0, maxzoom: 19 });
      map.addLayer({ id: 'k-vw', type: 'raster', source: 'k-vw', paint: { 'raster-fade-duration': 300, 'raster-saturation': mode === 'ops' ? -0.4 : 0 } }, next);
    });
    setMode(mode);
    el.classList.add('is-ready');
    return map;
  });

  function setMode(m) {
    mode = m; el.dataset.mode = m;
    const sat = m === 'ops' ? -0.4 : 0;     // raster-saturation −0.4 ≈ CSS saturate(.6)
    for (const id of ['k-under', 'k-world', 'k-vw', ...(map.getStyle()?.layers || []).filter((l) => l.type === 'raster' && /^(img-|k-s2-)/.test(l.id)).map((l) => l.id)])
      if (map.getLayer(id)) map.setPaintProperty(id, 'raster-saturation', sat);
  }

  /** 해외 바탕 판을 국내 바탕(k-vw) 바로 위에 — 자체 영상(img-*) · 결과 층 아래 → 판 목록(출처 한 줄이 쓴다) */
  async function overseas() {
    const r = await fetch(S2 + 'meta.json');
    if (!r.ok) return [];
    const meta = await r.json();
    const sets = Object.entries(meta.sets || {}).sort((a, b) => a[1].minzoom - b[1].minzoom);
    sets.attribution = meta.attribution;
    if (!sets.length) return sets;
    const ls = map.getStyle().layers, next = ls[ls.findIndex((l) => l.id === 'k-vw') + 1]?.id;
    for (const [id, s] of sets) {
      map.addSource('k-s2-' + id, { type: 'raster', tiles: [S2 + id + '/{z}/{x}/{y}.webp'], tileSize: 256, bounds: s.bounds, minzoom: s.minzoom, maxzoom: s.maxzoom });
      map.addLayer({ id: 'k-s2-' + id, type: 'raster', source: 'k-s2-' + id, paint: { 'raster-fade-duration': 300, 'raster-saturation': mode === 'ops' ? -0.4 : 0 } }, next);
    }
    return sets;
  }
  /** 지도 아래 출처 한 줄 — 해외 Sentinel-2 판이 보이면 그 출처, 세계 바탕(국내 바탕이 덮기 전 축척)이 보이면 NASA */
  function credits(sets, world) {
    const cr = document.createElement('p');
    cr.className = 'k-credit'; cr.hidden = true;
    cr.style.cssText = 'position:absolute;right:8px;bottom:3px;margin:0;font-size:var(--fs-tag,14px);line-height:var(--lh-tag,20px);color:rgba(255,255,255,.92);text-shadow:0 0 3px rgba(0,0,0,.6);pointer-events:none;z-index:2;white-space:nowrap';
    el.append(cr);
    const upd = () => {
      const b = map.getBounds(), z = map.getZoom();
      const s2 = sets.some(([id, s]) => z >= s.minzoom && map.getLayoutProperty('k-s2-' + id, 'visibility') !== 'none'
        && !(s.bounds[2] < b.getWest() || s.bounds[0] > b.getEast() || s.bounds[3] < b.getSouth() || s.bounds[1] > b.getNorth()));
      const wd = world && z < 7.4 && map.getLayoutProperty('k-world', 'visibility') !== 'none';
      cr.textContent = s2 ? sets.attribution || 'Contains modified Copernicus Sentinel data' : wd ? world.attribution || 'NASA Blue Marble' : '';
      cr.hidden = !cr.textContent;
    };
    map.on('moveend', upd); upd();
  }

  /** 지역으로(시군구 경계) — region = { bbox } | bbox 배열 | GeoJSON */
  async function go(region, { ms = 2400, maxZoom = 13.5, pitch = 0 } = {}) {
    const b = Array.isArray(region) ? region : region?.bbox || bboxOf(region);
    if (!b) return false;
    await ready;
    const cam = map.cameraForBounds(b, { padding: pad, maxZoom });
    if (!cam) return false;
    const to = { center: cam.center, zoom: Math.min(cam.zoom, maxZoom), pitch, bearing: 0 };
    if (RM() || ms === 0) { map.jumpTo(to); return true; }   // ms 0 = 날지 않고 그 자리(해외 두 번째 방문 · 10-15)
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
