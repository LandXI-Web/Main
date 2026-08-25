import { buildStyle, ORTHO_TILES, tileURL } from './style.js';
import { createFallback } from './fallback.js';
import { createRulebar } from './rulebar.js';
import { icon } from '../ui/icon.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const AI = '#0FA9A0', LX = '#2457D6';

/**
 * 지도 셸. MapLibre 를 먼저 시도하고, 라이브러리·타일 서버가 없거나 8초 안에
 * 뜨지 않으면 절차적 캔버스 폴백으로 내려간다. 두 경로 모두 같은 LXMap API.
 */
export async function createMap(container, o = {}) {
  container.classList.add('lxmap', `lxmap--${o.mode || 'canvas'}`);
  const box = document.createElement('div'); box.className = 'lxmap__canvas'; container.append(box);
  let api;
  try {
    if (!window.maplibregl) throw new Error('no maplibre');
    api = await maplibre(box, o);
  } catch (e) {
    console.warn('[LX.map] fallback:', e && e.message);
    box.innerHTML = '';
    api = createFallback(box, o);
  }
  const tools = o.tools !== false ? renderTools(api, o) : null;
  if (tools) container.append(tools);
  if (o.rulebar !== false) api.rulebar = createRulebar(container, api);
  // 엔진이 만든 것뿐 아니라 createMap 이 붙인 DOM 과 전역 참조까지 되돌린다.
  const inner = api.destroy;
  api.destroy = () => {
    try { inner(); } finally {
      if (tools) tools.remove();
      if (api.rulebar && api.rulebar.el) api.rulebar.el.remove();
      box.remove();
      if (window.LX && window.LX.map === api) delete window.LX.map;
    }
  };
  window.LX = Object.assign(window.LX || {}, { map: api });
  return api;
}

async function maplibre(box, o) {
  const map = new maplibregl.Map({
    container: box, style: buildStyle(), center: o.center || [127.8, 36.2], zoom: o.zoom == null ? 6 : o.zoom,
    pitch: o.pitch || 0, interactive: o.interactive !== false && o.mode !== 'backdrop', attributionControl: false,
  });
  await new Promise((res, rej) => {
    let done = false;
    const ok = () => { if (!done) { done = true; res(); } };
    const no = m => { if (!done) { done = true; rej(m instanceof Error ? m : new Error(m)); } };
    // 스타일이 뜨기 전의 오류만 폴백 사유. 그 뒤의 개별 타일 오류는 무시한다.
    const onErr = e => { if (map.isStyleLoaded && map.isStyleLoaded()) return; no((e && e.error) || new Error('style')); };
    map.on('error', onErr);
    map.once('load', () => { map.off('error', onErr); ok(); });
    setTimeout(() => no(new Error('timeout')), 8000);
  }).catch(e => { try { map.remove(); } catch (_) { /* noop */ } throw e; });

  if (o.globe && map.setProjection) { try { map.setProjection({ type: 'globe' }); } catch (_) { /* 구버전 */ } }

  const state = { ortho: false };
  if (o.ortho) {
    map.addSource('vworld-sat', { type: 'raster', tiles: [ORTHO_TILES], tileSize: 256, maxzoom: 19, attribution: 'VWorld' });
    map.addLayer({ id: 'ortho', type: 'raster', source: 'vworld-sat', paint: { 'raster-opacity': 0 } }, 'road');
    state.ortho = true;
    // 키 없는 공개 엔드포인트가 막히면 레이어를 걷어내고 슬라이더를 비활성화한다.
    map.on('error', e => {
      if (!state.ortho || !e || e.sourceId !== 'vworld-sat') return;
      state.ortho = false;
      if (map.getLayer('ortho')) map.removeLayer('ortho');
      if (map.getSource('vworld-sat')) map.removeSource('vworld-sat');
      box.dispatchEvent(new CustomEvent('lx:ortho-unavailable', { bubbles: true }));
    });
  }

  const kinds = new Map(), data = new Map(), rasters = new Map(), handlers = {};
  let moveEmit = null, destroyed = false;
  const clamp01 = v => Math.max(0, Math.min(1, Number(v) || 0));
  const hit = (id, kind) => id + (kind === 'org' ? '-pt' : '-fill');
  const baseOpacity = kind => kind === 'detection' ? 0.18 : kind === 'org' ? 1 : 0.06;

  const api = {
    engine: 'maplibre', ready: true, raw: map, box,
    flyTo: (c, z, x = {}) => REDUCE ? map.jumpTo({ center: c, zoom: z, ...x }) : map.flyTo({ center: c, zoom: z, duration: 1200, essential: true, ...x }),
    jumpTo: (c, z, x = {}) => map.jumpTo({ center: c, zoom: z, ...x }),
    addGeoJSON(id, geojson, { kind = 'detection', paint = {} } = {}) {
      // 같은 id 로 다시 부르면 교체한다(폴백과 동일). 이미 만든 레이어와 어긋나지 않도록
      // kind 는 최초 등록값을 유지하고 데이터만 갈아끼운다.
      const existing = map.getSource(id);
      if (existing) { existing.setData(geojson); data.set(id, geojson); return; }
      map.addSource(id, { type: 'geojson', data: geojson });
      kinds.set(id, kind); data.set(id, geojson);
      if (kind === 'org') {
        map.addLayer({ id: id + '-pt', type: 'circle', source: id, paint: { 'circle-radius': 6, 'circle-color': LX, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2, ...paint } });
      } else {
        const color = kind === 'detection' ? AI : LX;
        const opacity = kind === 'coverage' ? ['*', 0.5, ['coalesce', ['get', 'coverage'], 0]] : baseOpacity(kind);
        map.addLayer({ id: id + '-fill', type: 'fill', source: id, paint: { 'fill-color': color, 'fill-opacity': opacity, ...paint } });
        map.addLayer({ id: id + '-line', type: 'line', source: id, paint: { 'line-color': color, 'line-width': 1.5, 'line-opacity': kind === 'extent' ? 0.35 : 1 } });
      }
      const L = hit(id, kind);
      map.on('mousemove', L, e => handlers.hover && handlers.hover({ id, feature: e.features[0], point: [e.point.x, e.point.y] }));
      map.on('mouseleave', L, () => handlers.hover && handlers.hover(null));
      map.on('click', L, e => handlers.click && handlers.click({ id, feature: e.features[0], lnglat: [e.lngLat.lng, e.lngLat.lat] }));
    },
    setHighlight(id, fn) {
      const kind = kinds.get(id); if (kind == null || !map.getLayer(hit(id, kind))) return;
      const L = hit(id, kind), prop = kind === 'org' ? 'circle-opacity' : 'fill-opacity';
      if (typeof fn !== 'function') {
        const base = kind === 'coverage' ? ['*', 0.5, ['coalesce', ['get', 'coverage'], 0]] : baseOpacity(kind);
        return map.setPaintProperty(L, prop, base);
      }
      // 뷰포트 밖 피처도 살리려고 원본 GeoJSON에서 id 를 뽑는다(querySourceFeatures 는 화면 안만 준다).
      const src = data.get(id), feats = (src && src.features) || [];
      const ids = feats.filter(f => fn(f.properties || {})).map(f => (f.properties || {}).id).filter(v => v != null);
      map.setPaintProperty(L, prop, ['case', ['in', ['get', 'id'], ['literal', ids]], kind === 'detection' ? 0.45 : 1, 0.05]);
    },
    setOrthoOpacity: v => { if (map.getLayer('ortho')) map.setPaintProperty('ortho', 'raster-opacity', Math.max(0, Math.min(1, Number(v) || 0))); },
    /**
     * 실촬영 정사영상 타일(assets/data/imagery.js 의 IMAGERY 항목)을 얹는다.
     * id 는 호출자가 정하는 키이고 소스·레이어는 `r-<id>` 로 만든다. 같은 id 로 다시
     * 부르면 갈아끼운다.
     */
    addRaster(id, imagery, { opacity = 1, before } = {}) {
      if (!imagery || !imagery.tiles) return;
      const key = 'r-' + id;
      if (map.getLayer(key)) map.removeLayer(key);
      if (map.getSource(key)) map.removeSource(key);
      map.addSource(key, {
        type: 'raster', tiles: [tileURL(imagery)], tileSize: 256,
        bounds: imagery.bounds, minzoom: imagery.minzoom, maxzoom: imagery.maxzoom,
        attribution: imagery.label || 'LX',
      });
      const at = before && map.getLayer(before) ? before : undefined;
      map.addLayer({ id: key, type: 'raster', source: key, paint: { 'raster-opacity': clamp01(opacity) } }, at);
      rasters.set(id, imagery);
    },
    setRasterOpacity(id, v) {
      const key = 'r-' + id;
      if (map.getLayer(key)) map.setPaintProperty(key, 'raster-opacity', clamp01(v));
    },
    // 핸들러는 교체 방식(폴백과 동일). 'move' 는 등록 즉시 1회 동기 발화한 뒤
    // 카메라가 움직일 때마다 발화하며, 이전 emitter 는 반드시 떼어 낸다.
    on(ev, fn) {
      handlers[ev] = fn;
      if (ev !== 'move') return;
      if (moveEmit) { map.off('move', moveEmit); moveEmit = null; }
      if (typeof fn !== 'function') return;
      moveEmit = () => fn({ center: map.getCenter().toArray(), zoom: map.getZoom() });
      map.on('move', moveEmit); moveEmit();
    },
    getLayer(id) {
      if (!kinds.has(id)) {
        const im = rasters.get(id);
        return im ? { id, kind: 'raster', imagery: im, count: 0 } : null;
      }
      const d = data.get(id), feats = (d && d.features) || [];
      return { id, kind: kinds.get(id), data: d, count: feats.length };
    },
    getCenter: () => map.getCenter().toArray(),
    getZoom: () => map.getZoom(),
    project: c => { const p = map.project(c); return [p.x, p.y]; },
    destroy() { destroyed = true; if (moveEmit) { map.off('move', moveEmit); moveEmit = null; } map.remove(); },
  };

  if (o.ambient === 'spin' && !REDUCE) {
    let stop = false;
    map.on('mousedown', () => { stop = true; });
    (function spin() {
      if (stop || destroyed) return;
      const c = map.getCenter();
      map.easeTo({ center: [c.lng + 0.08, c.lat], duration: 100, easing: t => t });
      requestAnimationFrame(() => setTimeout(spin, 90));
    })();
  }
  return api;
}

const TOOLS = [
  ['search', '검색'], ['layers', '배경지도'], ['ruler', '측정'],
  ['pen', '그리기'], ['download', '내보내기'], ['globe', 'LX 레이어'],
];

function renderTools(api, o) {
  const t = document.createElement('div'); t.className = 'lxmap__tools';
  t.innerHTML = TOOLS.map(([i, l]) => `<button type="button" class="lxmap__tool" data-tool="${i}" aria-label="${l}" title="${l}">${icon(i, 16)}</button>`).join('')
    + `<div class="lxmap__zoom"><button type="button" aria-label="확대">+</button><button type="button" aria-label="축소">−</button></div>`
    + (o.ortho ? `<label class="lxmap__ortho" hidden><span>정사영상</span><input type="range" min="0" max="1" step="0.05" value="0" aria-label="정사영상 불투명도"></label>` : '');

  const notify = m => (window.NotifyUI && window.NotifyUI.info) ? window.NotifyUI.info(m) : console.info('[LX.map]', m);
  const actions = {
    search: () => {
      const p = window.LX && window.LX.palette;
      if (p && p.open) p.open();
      else { const b = document.querySelector('[data-palette]'); b ? b.click() : notify('검색 팔레트를 찾을 수 없습니다'); }
    },
    layers: () => { const l = t.querySelector('.lxmap__ortho'); l ? (l.hidden = !l.hidden) : notify('배경지도 전환은 XI 맵에서 제공됩니다'); },
    ruler: () => notify('측정 도구는 XI 맵에서 제공됩니다'),
    pen: () => notify('그리기 도구는 XI 맵에서 제공됩니다'),
    download: () => notify('현재 보기를 내보냅니다'),
    globe: () => notify('LX 레이어'),
  };
  t.querySelectorAll('.lxmap__tool').forEach(b => b.addEventListener('click', () => actions[b.dataset.tool]()));

  const [zin, zout] = t.querySelectorAll('.lxmap__zoom button');
  zin.addEventListener('click', () => api.flyTo(api.getCenter(), api.getZoom() + 1));
  zout.addEventListener('click', () => api.flyTo(api.getCenter(), api.getZoom() - 1));

  const slider = t.querySelector('.lxmap__ortho input');
  if (slider) slider.addEventListener('input', e => api.setOrthoOpacity(+e.target.value));
  if (api.box) api.box.addEventListener('lx:ortho-unavailable', () => {
    const l = t.querySelector('.lxmap__ortho');
    if (!l) return;
    l.hidden = true; if (slider) slider.disabled = true;
    t.querySelector('[data-tool=layers]').disabled = true;
  });
  return t;
}
