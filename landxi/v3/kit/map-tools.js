/* map-tools.js — 지도 재기 · 지도 그림 저장(10-22 now21 제안-지도재기저장 '넣음' — "XI맵 도구 줄에 재기 · 저장 두 단추부터 · 저장은 지도 + 범례 + 날짜 한 줄 그림").
   브이월드 · 공공 GIS 지도와 같은 말: 거리 재기 · 면적 재기 · 지도 저장.
     const m = measureTool({ map, host, onClose })   // 지도를 눌러 점을 찍는다 · 두 번 누르거나 '끝'으로 마침 · Esc 닫기
     await saveMapPicture(map, { title, legend: [{ color, label }], source })   // PNG 내려받기(브라우저 안에서 만든다 · 서버로 보내지 않는다)
   지역 고정값 0 · 숫자는 지도에서 직접 잰 값(지구 곡면 거리 · 넓이). */
import { h } from './util.js';

const HERE = import.meta.url;
let cssOn = false;
function ensureCss() { if (cssOn) return; cssOn = true; document.head.append(h('link', { rel: 'stylesheet', href: new URL('./map-tools.css', HERE).href })); }
const nf = (v, d = 0) => Number(v).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const R = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;
/** 두 점 거리(m) — 대원 거리 */
export function dist(a, b) {
  const dφ = rad(b[1] - a[1]), dλ = rad(b[0] - a[0]);
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dλ / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
/** 고리 넓이(㎡) — 구면 다각형 넓이 */
export function ringArea(pts) {
  if (pts.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += rad(q[0] - p[0]) * (2 + Math.sin(rad(p[1])) + Math.sin(rad(q[1])));
  }
  return Math.abs((a * R * R) / 2);
}
export const lenText = (m) => (m >= 1000 ? `${nf(m / 1000, 2)}km` : `${nf(m, m < 10 ? 1 : 0)}m`);
export const areaText = (a) => (a >= 1e6 ? `${nf(a / 1e6, 2)}㎢` : a >= 1e4 ? `${nf(a, 0)}㎡ (${nf(a / 1e4, 2)}ha)` : `${nf(a, 0)}㎡`);

/** 재기 — 거리 · 면적. 작은 판(지도 왼쪽 아래 · 다른 판과 겹치지 않게 화면이 자리를 준다)과 지도 위 선 · 면 */
export function measureTool({ map, host, onClose } = {}) {
  ensureCss();
  let mode = 'len', pts = [], done = false;
  const val = h('b.k-ms-v.num', { text: '—' });
  const hint = h('small.k-ms-h', { text: '지도를 눌러 점을 찍으세요' });
  const tab = (k, t) => h('button.k-ms-t', { type: 'button', role: 'tab', 'aria-selected': String(mode === k), text: t, onclick: () => { mode = k; pts = []; done = false; paint(); } });
  const tLen = tab('len', '거리'), tArea = tab('area', '면적');
  const card = h('section.k-ms.t-card.t-card--map', { role: 'dialog', 'aria-label': '재기', 'data-zone': 'measure' },
    h('div.k-ms-tabs', { role: 'tablist' }, tLen, tArea, h('button.k-ms-x', { type: 'button', 'aria-label': '재기 닫기', text: '×', onclick: () => close() })),
    val, hint,
    h('div.k-ms-a', {}, h('button.k-ms-b', { type: 'button', text: '지우기', onclick: () => { pts = []; done = false; paint(); } }),
      h('button.k-ms-b', { type: 'button', text: '한 점 빼기', onclick: () => { pts.pop(); done = false; paint(); } })));
  host.append(card);
  const EMPTY = { type: 'FeatureCollection', features: [] };
  map.addSource('k-ms', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'k-ms-f', type: 'fill', source: 'k-ms', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#FFD43B', 'fill-opacity': 0.18 } });
  map.addLayer({ id: 'k-ms-c', type: 'line', source: 'k-ms', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#191F28', 'line-width': 4.5, 'line-opacity': 0.55 } });
  map.addLayer({ id: 'k-ms-l', type: 'line', source: 'k-ms', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': '#FFD43B', 'line-width': 2.4 } });
  map.addLayer({ id: 'k-ms-p', type: 'circle', source: 'k-ms', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4.5, 'circle-color': '#fff', 'circle-stroke-color': '#191F28', 'circle-stroke-width': 1.6 } });
  const cur0 = map.getCanvas().style.cursor;
  map.getCanvas().style.cursor = 'crosshair';
  function paint() {
    tLen.setAttribute('aria-selected', String(mode === 'len')); tArea.setAttribute('aria-selected', String(mode === 'area'));
    const f = pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }));
    if (pts.length >= 2) f.push({ type: 'Feature', properties: {}, geometry: mode === 'area' && pts.length >= 3 ? { type: 'Polygon', coordinates: [[...pts, pts[0]]] } : { type: 'LineString', coordinates: pts } });
    map.getSource('k-ms')?.setData({ type: 'FeatureCollection', features: f });
    let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
    if (mode === 'len') val.textContent = pts.length >= 2 ? lenText(L) : '—';
    else val.textContent = pts.length >= 3 ? areaText(ringArea(pts)) : '—';
    hint.textContent = done ? '다시 재려면 지우기' : !pts.length ? '지도를 눌러 점을 찍으세요' : '두 번 누르면 마칩니다';
    if (window.__xc) window.__xc.measure = { mode, n: pts.length, text: val.textContent };
  }
  /* 지도 누르기를 재기가 먼저 받는다(문서 단계 잡기 — 화면의 다른 누르기 동작(필지 카드 · 객체 카드 · 강조 숫자)이 함께 열리지 않게). 끌기(4px 넘게 움직임)는 지도 이동 그대로 */
  const box = map.getContainer(), cv = map.getCanvas();
  let down = null;
  const ll = (e) => { const r = cv.getBoundingClientRect(); const p = map.unproject([e.clientX - r.left, e.clientY - r.top]); return [p.lng, p.lat]; };
  const onCanvas = (e) => e.target === cv || cv.parentElement?.contains(e.target) && !e.target.closest?.('.maplibregl-marker, .maplibregl-ctrl');
  const pd = (e) => { if (onCanvas(e)) down = [e.clientX, e.clientY]; };
  const click = (e) => {
    if (!onCanvas(e)) return;
    e.stopPropagation();
    if (down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 4) return;
    if (e.detail > 1) return;                            // 두 번 누르기의 둘째 — 아래 dblclick 이 마친다
    if (done) { pts = []; done = false; }
    pts.push(ll(e)); paint();
  };
  const dbl = (e) => { if (!onCanvas(e)) return; e.stopPropagation(); e.preventDefault(); done = true; paint(); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  box.addEventListener('pointerdown', pd, true); box.addEventListener('click', click, true); box.addEventListener('dblclick', dbl, true); addEventListener('keydown', key);
  paint();
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    box.removeEventListener('pointerdown', pd, true); box.removeEventListener('click', click, true); box.removeEventListener('dblclick', dbl, true); removeEventListener('keydown', key);
    for (const id of ['k-ms-p', 'k-ms-l', 'k-ms-c', 'k-ms-f']) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource('k-ms')) map.removeSource('k-ms');
    map.getCanvas().style.cursor = cur0;
    card.remove(); onClose?.();
  }
  return { close, el: card, get active() { return !closed; } };
}

/** 지금 지도 한 장 + 아래 띠(제목 · 범례 · 날짜 · 출처) → PNG 내려받기. 마커(꼬리표 · 말풍선)는 그림에 넣지 않는다(지도 그림만) */
export async function saveMapPicture(map, { title = '지도', legend = [], source = '', file = '' } = {}) {
  const shot = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('지도를 그리지 못했습니다')), 5000);
    map.once('render', () => { try { const c = map.getCanvas(); const o = document.createElement('canvas'); o.width = c.width; o.height = c.height; o.getContext('2d').drawImage(c, 0, 0); clearTimeout(t); res(o); } catch (e) { clearTimeout(t); rej(e); } });
    map.triggerRepaint();
  });
  const dpr = shot.width / Math.max(1, map.getCanvas().clientWidth);
  const W = shot.width, band = Math.round((legend.length > 0 ? 92 : 64) * dpr);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = shot.height + band;
  const g = cv.getContext('2d');
  g.drawImage(shot, 0, 0);
  g.fillStyle = '#fff'; g.fillRect(0, shot.height, W, band);
  g.fillStyle = '#E5E8EB'; g.fillRect(0, shot.height, W, Math.max(1, dpr));
  const font = (w, px) => `${w} ${Math.round(px * dpr)}px Pretendard, 'Noto Sans KR', sans-serif`;
  const pad = 16 * dpr; let y = shot.height + 26 * dpr;
  const d = new Date(), day = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  g.fillStyle = '#191F28'; g.font = font(700, 16); g.textBaseline = 'alphabetic'; g.fillText(title, pad, y);
  g.fillStyle = '#4E5968'; g.font = font(400, 13); g.textAlign = 'right';
  g.fillText(`${day} 저장 · Land-XI${source ? ' · ' + source : ''}`, W - pad, y); g.textAlign = 'left';
  if (legend.length) {
    y += 30 * dpr; let x = pad;
    g.font = font(500, 13);
    for (const it of legend.slice(0, 10)) {
      const w = g.measureText(it.label).width;
      if (x + 18 * dpr + w > W - pad) break;
      g.fillStyle = it.color || '#0FA9A0'; g.fillRect(x, y - 11 * dpr, 12 * dpr, 12 * dpr);
      g.fillStyle = '#191F28'; g.fillText(it.label, x + 18 * dpr, y);
      x += 18 * dpr + w + 18 * dpr;
    }
  }
  const blob = await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('그림을 만들지 못했습니다'))), 'image/png'));
  const name = (file || `${title}-${day}`).replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ') + '.png';
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  if (window.__xc) window.__xc.saved = { name, w: cv.width, h: cv.height };
  return { name, blob };
}
