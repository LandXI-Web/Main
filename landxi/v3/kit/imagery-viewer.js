/* imagery-viewer.js — 영상 크게 보기(원칙 295 · 10-18 사용자 "공유 데이터에서 고르기 에서 영상이 미니 뷰어라 제대로 모른다 …
   지도를 펼쳐서 자세히 보고 닫을 수 있는 기능도 필요하겠다").
   공유 데이터에서 영상을 고르는 모든 곳이 같이 쓴다 — 고르는 창 위에 큰 지도 한 장을 덮고(아래 창의 상태는 그대로), 닫으면 제자리.
     openImageryViewer({ items, index, onPick, picked })  items = [{ id, name, region?, year?, kind? }] · 이 목록 안에서 앞 · 다음
     mountImageryPage(el, id)                              새 창(imagery-view.html)에서 같은 화면을 한 쪽으로 — 고르기 · 닫기 없음
   영상 정보(촬영 시기 · 해상도 · 범위)는 서버 GET /catalog/imagery/{id}, 타일은 엔진 sourceSpec(공유 영상 한 벌의 같은 길). 화면에는 경로 · 아이디 · 좌표를 쓰지 않는다. */
import { h, api } from './util.js';
import { createStage } from './stage.js';
import { sourceSpec } from '../../xi/engine/sources.js';

const HERE = import.meta.url;
const MAPLIBRE = new URL('../../proto/vendor/maplibre/', HERE).href;
const PMTILES = new URL('../../xi/vendor/pmtiles/pmtiles.js', HERE).href;
const PAGE = new URL('./imagery-view.html', HERE).href;
const detail = new Map();
let libs = null, cssOn = false;

function ensureCss() {
  if (cssOn) return; cssOn = true;
  for (const f of ['./stage.css', './imagery-viewer.css']) document.head.append(h('link', { rel: 'stylesheet', href: new URL(f, HERE).href }));
}
const loadScript = (src) => new Promise((ok, no) => {
  const s = document.querySelector(`script[src="${src}"]`);
  if (s && s.dataset.done) return ok();
  const el = s || h('script', { src, defer: true });
  el.addEventListener('load', () => { el.dataset.done = '1'; ok(); }, { once: true });
  el.addEventListener('error', () => no(new Error('지도를 불러오지 못했습니다')), { once: true });
  if (!s) document.head.append(el);
});
/** 지도 엔진(MapLibre · PMTiles)을 이 화면이 안 실었으면 한 번만 싣는다 */
function ensureLibs() {
  if (window.maplibregl && window.pmtiles) return Promise.resolve();
  libs ||= (async () => {
    if (!document.querySelector('link[href$="maplibre-gl.css"]')) document.head.append(h('link', { rel: 'stylesheet', href: MAPLIBRE + 'maplibre-gl.css' }));
    if (!window.maplibregl) await loadScript(MAPLIBRE + 'maplibre-gl.js');
    if (!window.pmtiles) await loadScript(PMTILES).catch(() => null);   // 없어도 열린다(PMTiles 영상만 못 그림)
  })().catch((e) => { libs = null; throw e; });
  return libs;
}

/** 고르는 화면이 열릴 때 미리 — 지도 엔진 · 모양 파일을 받아 두어 '크게 보기'가 바로 열린다(+ 영상 정보 미리) */
export function warmImageryViewer(ids = []) {
  ensureCss(); ensureLibs().catch(() => null);
  for (const id of ids.slice(0, 2)) getDetail(id).catch(() => null);
}

const getDetail = (id) => {
  if (!detail.has(id)) detail.set(id, api('/catalog/imagery/' + encodeURIComponent(id)).catch((e) => { detail.delete(id); throw e; }));
  return detail.get(id);
};
const KIND = (g) => (g == null ? '' : g < 0.1 ? '드론' : g >= 1 ? '위성' : '항공');
const gsdWord = (g) => (g == null ? '' : g < 0.1 ? `${+(g * 100).toFixed(1)}cm급` : g < 1 ? `${Math.round(g * 100)}cm급` : `${+(+g).toFixed(1)}m급`);
const whenWord = (e) => { const m = /^(\d{4})(?:-(\d{2}))?/.exec(String(e || '')); return m ? `${m[1]}년${m[2] ? ` ${+m[2]}월` : ''} 촬영` : ''; };

/** 영상 한 장을 큰 지도에 — 지도를 만들어 그 안에서 영상을 바꿔 보여 주는 손잡이를 돌려준다 */
function viewerBody(root, { onInfo }) {
  const mapEl = h('div.k-iv-map');
  const wait = h('p.k-iv-wait', { role: 'status', hidden: true, text: '불러오는 중' });
  const warn = h('p.k-iv-warn', { role: 'status', hidden: true });
  root.append(mapEl, wait, warn);
  let stage = null, map = null, seq = 0, cur = null;
  const ready = ensureLibs().then(() => {
    stage = createStage(mapEl, { interactive: true, scale: true, worldCredit: false, padding: 40 });
    return stage.ready;
  }).then(() => {
    map = stage.map;
    new ResizeObserver(() => { try { map.resize(); } catch { /* 닫힘 */ } }).observe(mapEl);
    map.addControl(new window.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    // 둘레는 옅게 — 영상이 또렷이 앞으로 나오게
    for (const id of ['k-world', 'k-vw']) if (map.getLayer(id)) { map.setPaintProperty(id, 'raster-opacity', 0.5); map.setPaintProperty(id, 'raster-saturation', -0.75); map.setPaintProperty(id, 'raster-brightness-min', 0.4); }
  });
  const clear = () => {
    for (const id of ['iv-fp', 'iv-r']) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ['iv-fp', 'iv-src']) if (map.getSource(id)) map.removeSource(id);
  };
  const say = (t) => { warn.textContent = t || ''; warn.hidden = !t; };

  async function show(item) {
    const my = ++seq; cur = null; say(''); window.__ivTiming = null;
    const t0 = performance.now(), mk = {};
    const slow = setTimeout(() => { if (my === seq) wait.hidden = false; }, 400);   // 0.4초 넘으면 '불러오는 중' (로딩 한 줄 규칙)
    const done = () => { clearTimeout(slow); if (my === seq) wait.hidden = true; };
    try {
      const [d] = await Promise.all([getDetail(item.id).then((v) => { mk.detail = Math.round(performance.now() - t0); return v; }), ready.then(() => { mk.map = Math.round(performance.now() - t0); })]);
      if (my !== seq) return null;
      clear();
      if (!d.bounds) { done(); say('이 영상의 범위를 알 수 없어 지도에 펼칠 수 없습니다'); return { d }; }
      const spec = await sourceSpec(d);
      if (my !== seq) return null;
      map.addSource('iv-src', { ...spec, tileSize: 256, bounds: d.bounds, minzoom: Math.max(0, (d.minzoom ?? 0) - 3), maxzoom: d.maxzoom ?? 19 });
      map.addLayer({ id: 'iv-r', type: 'raster', source: 'iv-src', paint: { 'raster-fade-duration': 150, 'raster-resampling': 'nearest' } });
      const fp = d.footprint || { type: 'Polygon', coordinates: [[[d.bounds[0], d.bounds[1]], [d.bounds[2], d.bounds[1]], [d.bounds[2], d.bounds[3]], [d.bounds[0], d.bounds[3]], [d.bounds[0], d.bounds[1]]]] };
      map.addSource('iv-fp', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: fp } });
      map.addLayer({ id: 'iv-fp', type: 'line', source: 'iv-fp', paint: { 'line-color': '#0FA9A0', 'line-width': 2.2 } });
      map.resize();
      map.fitBounds(d.bounds, { padding: 56, duration: 0 });
      cur = d;
      onInfo?.(d);
      setTimeout(done, 1200);   // 조각은 오는 대로 그려지므로 '불러오는 중'은 길어도 1.2초까지만
      // 영상 조각이 처음 도착할 때까지 — 걸린 시간을 남긴다(점검용)
      await new Promise((ok) => {   // 첫 그리기로 조각을 부른 뒤, 영상 조각이 다 도착하면
        let armed = false;
        const to = setTimeout(() => { map.off('render', on); ok(); }, 8000);
        const on = () => { if (!armed) { armed = true; return; } if (map.isSourceLoaded('iv-src') && !map.isMoving()) { clearTimeout(to); map.off('render', on); ok(); } };
        map.on('render', on); map.triggerRepaint();
      });
      if (my === seq) window.__ivTiming = { ms: Math.round(performance.now() - t0), ...mk, at: Date.now() };
      done();
      return { d };
    } catch (e) {
      done();
      if (my === seq) say(e?.message || '영상을 불러오지 못했습니다');
      return null;
    }
  }
  /** 영상 낱장 크기(실제 해상도)로 — 화면 한 점이 영상 한 점이 되는 확대 */
  function actual() {
    if (!map || !cur?.gsd_m) return;
    const lat = (cur.bounds[1] + cur.bounds[3]) / 2;
    const z = Math.log2(156543.03392 * Math.cos(lat * Math.PI / 180) / cur.gsd_m);
    map.easeTo({ zoom: Math.min(21, Math.max(map.getZoom(), z)), duration: 500 });
  }
  const fit = () => { if (map && cur?.bounds) map.fitBounds(cur.bounds, { padding: 56, duration: 400 }); };
  return { show, actual, fit, destroy: () => { seq++; try { map?.remove(); } catch { /* 이미 닫힘 */ } }, ready };
}

const infoLine = (item, d) => {
  const g = d?.gsd_m;
  return [whenWord(d?.epoch) || (item.year ? `${item.year}년 촬영` : ''), gsdWord(g), item.region, item.kind || KIND(g)].filter(Boolean);
};

/** 고르는 창 위에 크게 보기 — 앞 · 다음은 items 안에서 */
export function openImageryViewer({ items = [], index = 0, onPick, picked } = {}) {
  if (!items.length || document.querySelector('.k-iv')) return null;
  ensureCss();
  let i = Math.min(Math.max(0, index), items.length - 1);
  const back = document.activeElement;
  const title = h('h2.k-iv-t');
  const info = h('p.k-iv-i');
  const xBtn = h('button.k-iv-x', { type: 'button', 'aria-label': '닫기', text: '×' });
  const body = h('div.k-iv-body');
  const prev = h('button.k-iv-nav', { type: 'button', text: '‹ 앞 영상' });
  const next = h('button.k-iv-nav', { type: 'button', text: '다음 영상 ›' });
  const cnt = h('small.k-iv-n.num');
  const actual = h('button.k-iv-b', { type: 'button', text: '원래 해상도로' });
  const fit = h('button.k-iv-b', { type: 'button', text: '전체 보기' });
  const win = h('a.k-iv-b', { target: '_blank', rel: 'noopener', text: '새 창으로 열기' });
  const pick = h('button.k-iv-go', { type: 'button', text: '이 영상 고르기' });
  const closeB = h('button.k-iv-b', { type: 'button', text: '닫기' });
  const panel = h('div.k-iv-p', { role: 'dialog', 'aria-modal': 'true', 'aria-label': '영상 크게 보기' },
    h('div.k-iv-h', {}, h('div.k-iv-hh', {}, title, info), xBtn), body,
    h('div.k-iv-f', {}, h('div.k-iv-fn', {}, prev, cnt, next), h('div.k-iv-fb', {}, actual, fit, win, closeB, pick)));
  const root = h('div.k-iv', {}, panel);
  document.body.append(root);
  const V = viewerBody(body, { onInfo: (d) => { info.replaceChildren(...dots(infoLine(items[i], d))); } });
  const dots = (parts) => parts.flatMap((t, k) => (k ? [h('i', { 'aria-hidden': 'true', text: '·' }), h('span', { text: t })] : [h('span', { text: t })]));
  const draw = () => {
    const it = items[i];
    title.textContent = it.name;
    info.replaceChildren(...dots(infoLine(it, null)));
    cnt.textContent = items.length > 1 ? `${i + 1} / ${items.length}` : '';
    prev.hidden = next.hidden = cnt.hidden = items.length < 2;
    prev.disabled = i <= 0; next.disabled = i >= items.length - 1;
    win.href = PAGE + '?id=' + encodeURIComponent(it.id);
    const on = !!picked?.(it);
    pick.textContent = on ? '고른 영상입니다 · 닫기' : '이 영상 고르기';
    V.show(it);
    for (const j of [i + 1, i - 1]) if (items[j]) warmImageryViewer([items[j].id]);   // 앞 · 다음 영상 정보 미리 받기
  };
  const close = () => {
    removeEventListener('keydown', key, true);
    V.destroy(); root.remove();
    try { if (back && document.contains(back)) back.focus({ preventScroll: true }); } catch { /* 없어짐 */ }
  };
  function key(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'Tab') {                              // 창 안에서만 돈다
      const f = [...panel.querySelectorAll('button:not([disabled]),a[href]')].filter((x) => !x.hidden && x.offsetParent);
      if (!f.length) return;
      const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && (document.activeElement === a || !panel.contains(document.activeElement))) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && (document.activeElement === z || !panel.contains(document.activeElement))) { e.preventDefault(); a.focus(); }
    }
  }
  addEventListener('keydown', key, true);
  xBtn.addEventListener('click', close); closeB.addEventListener('click', close);
  root.addEventListener('mousedown', (e) => { if (e.target === root) close(); });   // 바깥을 누르면 닫는다
  prev.addEventListener('click', () => { if (i > 0) { i--; draw(); } });
  next.addEventListener('click', () => { if (i < items.length - 1) { i++; draw(); } });
  actual.addEventListener('click', () => V.actual());
  fit.addEventListener('click', () => V.fit());
  pick.addEventListener('click', () => { const it = items[i]; const on = !!picked?.(it); close(); if (!on) onPick?.(it); });
  draw();
  requestAnimationFrame(() => { root.classList.add('is-in'); xBtn.focus({ preventScroll: true }); });
  return { close };
}

/** 새 창 쪽(imagery-view.html) — 같은 화면을 한 쪽으로 */
export function mountImageryPage(el, id) {
  ensureCss();
  const title = h('h1.k-iv-t', { text: '영상' });
  const info = h('p.k-iv-i');
  const body = h('div.k-iv-body');
  const actual = h('button.k-iv-b', { type: 'button', text: '원래 해상도로' });
  const fit = h('button.k-iv-b', { type: 'button', text: '전체 보기' });
  el.classList.add('k-iv', 'k-iv--page', 'is-in');
  el.append(h('div.k-iv-p', {}, h('div.k-iv-h', {}, h('div.k-iv-hh', {}, title, info)), body, h('div.k-iv-f', {}, h('div.k-iv-fn'), h('div.k-iv-fb', {}, actual, fit))));
  const V = viewerBody(body, { onInfo: (d) => {
    const nm = d.name && typeof d.name === 'object' ? d.name.ko || d.name.en : d.name;
    title.textContent = nm || '영상'; document.title = `${nm || '영상'} · Land-XI`;
    const g = d.gsd_m;
    info.replaceChildren(...[whenWord(d.epoch), gsdWord(g), KIND(g)].filter(Boolean).flatMap((t, k) => (k ? [h('i', { 'aria-hidden': 'true', text: '·' }), h('span', { text: t })] : [h('span', { text: t })])));
  } });
  actual.addEventListener('click', () => V.actual()); fit.addEventListener('click', () => V.fit());
  V.show({ id });
  return V;
}
