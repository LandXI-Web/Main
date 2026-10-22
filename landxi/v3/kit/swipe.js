/* swipe.js — 두 시점 좌우 가르기(10-22 now21 제안-두시점겹쳐비교 '넣음' · CHANGE-DEMO-ORDER P1-8 "영상 비교에 좌우 스와이프 바 · 연도 표시").
   어느 지도 화면에서나 같은 부품: 왼쪽 = 위에 덮은 두 번째 지도(같은 카메라 · 가르기 선 왼쪽만 보임) · 오른쪽 = 본 지도.
   가운데 선을 끌어(키보드 ← →) 좌우로 견준다. 선 위 작은 이름표 둘 = 그 쪽 시점(예: '2020년' · '2024년').

     const sw = mountSwipe({ map, left: { label, spec }, right: { label, spec } })   // spec = maplibre raster 원천(없으면 그 쪽은 지금 지도 그대로)
     await sw.set({ left, right }) · sw.pos(30) · sw.close()
     const sw = await compareYears({ map, yearA: 2020, yearB: 2024 })               // 국토지리정보원 항공 정사영상 그 해 층(전국 · 25cm) — 화면 · 에이전트가 부른다
     yearSpec(2024) → { label, spec } | null                                        // 그 해 층이 없으면 null(지어낸 영상 0)

   영상 주소는 서버(GET /tiles/sign?set=cog/nat-ngii-air-{해})가 서명한 것 — 화면에 경로 · 아이디를 쓰지 않는다. 지역 고정값 0. */
import { h, api } from './util.js';
import { createStage } from './stage.js';
import { API } from '../../shared/api-v1.js';

const HERE = import.meta.url;
let cssOn = false;
function ensureCss() { if (cssOn) return; cssOn = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./swipe.css', HERE).href })); }
const LOOP = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const onApi = (u) => { try { const b = new URL(API.base); return LOOP.test(u) && LOOP.test(b.origin + '/') ? u.replace(LOOP, b.origin + '/') : u; } catch { return u; } };

/** 국토지리정보원 그 해 항공 정사영상(전국) — 영상 표에 그 해 층이 있을 때만 */
const YS = new Map();
export function yearSpec(year) {
  const y = parseInt(year, 10); if (!(y > 1990)) return Promise.resolve(null);
  if (!YS.has(y)) YS.set(y, api('/tiles/sign?' + new URLSearchParams({ set: 'cog/nat-ngii-air-' + y })).then((j) => (j?.url ? {
    label: `${y}년`, year: y,
    spec: { type: 'raster', tiles: [onApi(j.url)], tileSize: 256, bounds: [124.5, 33.0, 131.9, 38.7], minzoom: 12, maxzoom: 19, attribution: '국토지리정보원 항공 정사영상' },
  } : null)).catch(() => { YS.delete(y); return null; }));
  return YS.get(y);
}

/** 원천을 지도 영상 바로 위(결과 · 경계 · 필지 아래)에 — 같은 id 면 바꿔 끼운다 */
function putRaster(m, id, spec) {
  if (m.getLayer(id)) m.removeLayer(id);
  if (m.getSource(id)) m.removeSource(id);
  if (!spec) return;
  m.addSource(id, spec);
  const before = ['slot-reference', 'slot-result'].find((s) => m.getLayer(s));
  m.addLayer({ id, type: 'raster', source: id, paint: { 'raster-fade-duration': 150 } }, before);
}

/**
 * @param {object} o
 * @param {maplibregl.Map} o.map  본 지도(오른쪽)
 * @param {{label:string, spec?:object}|null} o.left
 * @param {{label:string, spec?:object}|null} o.right
 * @param {number} [o.at=50] 가르기 선 자리(%)
 */
export function mountSwipe({ map, left = null, right = null, at = 50 } = {}) {
  ensureCss();
  const host = map.getContainer();
  const pane = h('div.k-sw-pane', { 'aria-hidden': 'true' });
  const lab = (side) => h(`span.k-sw-lab.k-sw-lab--${side}`);
  const labL = lab('l'), labR = lab('r');
  const grip = h('div.k-sw-grip', { role: 'slider', tabindex: '0', 'aria-label': '두 시점 가르기 선', 'aria-valuemin': '3', 'aria-valuemax': '97', 'aria-valuenow': String(at) }, h('i.k-sw-knob', { 'aria-hidden': 'true' }), labL, labR);
  host.append(pane, grip);
  const B = createStage(pane, { interactive: false, scale: false, worldCredit: false });
  let cur = { left: null, right: null }, closed = false, x = at;
  const sync = () => { try { B.map.jumpTo({ center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() }); } catch { /* 닫힘 */ } };
  const pos = (v) => { x = Math.max(3, Math.min(97, v)); host.style.setProperty('--k-sw', x + '%'); grip.setAttribute('aria-valuenow', String(Math.round(x))); };
  pos(at);
  map.on('move', sync);
  const ro = new ResizeObserver(() => { try { B.map.resize(); sync(); } catch { /* 닫힘 */ } }); ro.observe(host);
  let drag = false;
  const toX = (cx) => { const r = host.getBoundingClientRect(); pos(((cx - r.left) / r.width) * 100); };
  grip.addEventListener('pointerdown', (e) => { drag = true; grip.setPointerCapture(e.pointerId); e.preventDefault(); });
  grip.addEventListener('pointermove', (e) => { if (drag) toX(e.clientX); });
  grip.addEventListener('pointerup', () => { drag = false; });
  grip.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { pos(x - 4); e.preventDefault(); } if (e.key === 'ArrowRight') { pos(x + 4); e.preventDefault(); } });
  const ready = B.ready.then(() => { B.map.resize(); sync(); });
  async function set({ left: l = cur.left, right: r = cur.right } = {}) {
    cur = { left: l, right: r };
    labL.textContent = l?.label || '지금 영상'; labR.textContent = r?.label || '지금 영상';
    await ready; if (closed) return;
    putRaster(B.map, 'k-sw-l', l?.spec || null);
    putRaster(map, 'k-sw-r', r?.spec || null);
    host.dataset.kSw = '1';
  }
  function close() {
    if (closed) return; closed = true;
    map.off('move', sync); ro.disconnect();
    try { putRaster(map, 'k-sw-r', null); } catch { /* 지도 닫힘 */ }
    try { B.map.remove(); } catch { /* */ }
    pane.remove(); grip.remove(); delete host.dataset.kSw; host.style.removeProperty('--k-sw');
  }
  set({ left, right });
  const api0 = { set, pos, close, get cur() { return cur; }, get left() { return B; }, ready };
  if (window.__lxSwipe) window.__lxSwipe.last = api0;
  return api0;
}

/** 두 해 견주기 한 번에 — 그 해 층이 없으면 { ok:false, missing:[해] } (화면 · XI ChatGEO 변화 탐지가 부른다) */
export async function compareYears({ map, yearA, yearB, at = 50, swipe = null } = {}) {
  const [a, b] = await Promise.all([yearSpec(yearA), yearSpec(yearB)]);
  const missing = [[yearA, a], [yearB, b]].filter(([, s]) => !s).map(([y]) => +y);
  if (missing.length) return { ok: false, missing, swipe };
  const sw = swipe || mountSwipe({ map, at });
  await sw.set({ left: a, right: b });
  return { ok: true, swipe: sw };
}
window.__lxSwipe = window.__lxSwipe || { mountSwipe, compareYears, yearSpec };
