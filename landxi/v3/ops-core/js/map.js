/* 배포 지도 — 잉크 글로브(MapLibre 5 globe) · 점 = 기관 배포 지역 · 색 = 가장 앞선 단계 · 선 = LX 본사에서 나간 배포.
 * 모션은 데이터 도착에만: 도착 카메라 2400(e-cam) · 배포선 그리기 1250(e-arrive). */
import { STAGE, canonDeploys, regionShort, inbox, decisionSince, cardName, verOf } from './store.js';

const HQ = { lng: 127.06, lat: 35.83, name: 'LX 본사' };
const KR_BOX = [125.2, 33.3, 129.9, 38.4];
const cubic = (x1, y1, x2, y2) => (x) => { let t = x; for (let i = 0; i < 8; i++) { const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx; const X = ((ax * t + bx) * t + cx) * t - x; const d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(X) < 1e-5 || !d) break; t -= X / d; } const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by; return ((ay * t + by) * t + cy) * t; };
export const eCam = cubic(0.16, 1, 0.3, 1);
const eArrive = cubic(0.15, 1, 0.3, 1);

let map = null, markers = [], onPick = null, drawn = false, pins = [], hqPin = null, clusters = new Map(), raf = 0;

export async function initMap(el, { pick } = {}) {
  onPick = pick;
  const [world, sido, sgg] = await Promise.all([
    fetch('/landxi/global/data/lx-countries.json').then((r) => r.json()).then((j) => j.world).catch(() => null),
    fetch('/landxi/assets/data/geo/sido.geojson').then((r) => r.json()).catch(() => null),
    fetch('/landxi/assets/data/geo/sigungu.geojson').then((r) => r.json()).catch(() => null),
  ]);
  const empty = { type: 'FeatureCollection', features: [] };
  map = new window.maplibregl.Map({
    container: el, attributionControl: false, center: [112, 30], zoom: 1.35, maxPitch: 0, dragRotate: false, pitchWithRotate: false,
    style: {
      version: 8, projection: { type: 'globe' }, transition: { duration: 0, delay: 0 },
      sky: { 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 5, 0.12, 7, 0] },
      sources: {
        world: { type: 'geojson', data: world || empty, tolerance: 0.5 },
        sido: { type: 'geojson', data: sido || empty, tolerance: 0.4 },
        sgg: { type: 'geojson', data: sgg || empty, tolerance: 0.6 },
        aoi: { type: 'geojson', data: empty },
        arcs: { type: 'geojson', data: empty },
      },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#010102' } },
        { id: 'world', type: 'fill', source: 'world', paint: { 'fill-color': '#0B0F14' } },
        { id: 'world-l', type: 'line', source: 'world', paint: { 'line-color': 'rgba(255,255,255,.13)', 'line-width': 0.6 } },
        { id: 'sido', type: 'fill', source: 'sido', paint: { 'fill-color': '#10151C' } },
        { id: 'sgg-l', type: 'line', source: 'sgg', minzoom: 5, paint: { 'line-color': 'rgba(255,255,255,.07)', 'line-width': 0.6 } },
        { id: 'sido-l', type: 'line', source: 'sido', paint: { 'line-color': 'rgba(255,255,255,.26)', 'line-width': 0.9 } },
        { id: 'aoi-f', type: 'fill', source: 'aoi', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['case', ['==', ['get', 'box'], 1], 0.05, 0.22] } },
        { id: 'aoi-halo', type: 'line', source: 'aoi', filter: ['==', ['get', 'box'], 0], paint: { 'line-color': ['get', 'c'], 'line-width': 4, 'line-opacity': 0.25 } },
        { id: 'aoi-l', type: 'line', source: 'aoi', paint: { 'line-color': ['get', 'c'], 'line-width': ['case', ['==', ['get', 'box'], 1], 0.8, 1.2], 'line-opacity': ['case', ['==', ['get', 'box'], 1], 0.35, 1] } },
        { id: 'arcs', type: 'line', source: 'arcs', layout: { 'line-cap': 'round' }, paint: { 'line-color': ['get', 'c'], 'line-width': 1.2, 'line-opacity': 0.75 } },
      ],
    },
  });
  await new Promise((r) => map.once('load', r));
  map.on('move', () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; declutter(); }); });
  return map;
}

function bbox(g) {
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') { a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; } else c.forEach(walk); };
  if (g?.coordinates) walk(g.coordinates);
  return a;
}
function arc(a, b, n = 72) {
  const r = Math.PI / 180, toV = (p) => [Math.cos(p[1] * r) * Math.cos(p[0] * r), Math.cos(p[1] * r) * Math.sin(p[0] * r), Math.sin(p[1] * r)];
  const A = toV(a), B = toV(b); const d = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])) || 1e-9;
  const out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s1 = Math.sin((1 - t) * d) / Math.sin(d), s2 = Math.sin(t * d) / Math.sin(d);
    const v = [s1 * A[0] + s2 * B[0], s1 * A[1] + s2 * B[1], s1 * A[2] + s2 * B[2]];
    out.push([Math.atan2(v[1], v[0]) / r, Math.atan2(v[2], Math.hypot(v[0], v[1])) / r]);
  }
  return out;
}

/** 배포본을 지역별로 모은다(같은 region_profile = 한 점) */
export function regions() {
  const wait = new Set(inbox().filter((x) => x.type === 'promote' && !x.approved).map((x) => x.d.id));
  const by = new Map();
  for (const d of canonDeploys()) {
    const k = d.region_profile || d.tenant_id;
    const r = by.get(k) || { key: k, name: regionShort(d), items: [], box: [180, 90, -180, -90] };
    r.items.push(d);
    const b = bbox(d.aoi); r.box = [Math.min(r.box[0], b[0]), Math.min(r.box[1], b[1]), Math.max(r.box[2], b[2]), Math.max(r.box[3], b[3])];
    by.set(k, r);
  }
  for (const r of by.values()) {
    r.lng = (r.box[0] + r.box[2]) / 2; r.lat = (r.box[1] + r.box[3]) / 2;
    const top = r.items.reduce((m, d) => (STAGE[d.stage]?.order ?? -1) > (STAGE[m.stage]?.order ?? -1) ? d : m, r.items[0]);
    r.stage = top.stage; r.wait = r.items.some((d) => wait.has(d.id));
    r.live = r.items.filter((d) => d.stage === 'ga').length;
    const ko = r.items[0].region_name?.ko || '';
    const first = ko.split(/\s+/)[0] || r.name;
    r.kr = !/\s/.test(ko) || /(도|특별시|광역시|특별자치시)$/.test(first);
    r.country = r.kr ? '대한민국' : first;
    r.grp = r.kr ? first.replace(/(특별자치도|특별자치시|특별시|광역시)$/, '').replace(/^(전라|경상|충청)(남|북)도$/, (m, a, b) => a[0] + b) : first;
  }
  return [...by.values()];
}

export function paint(animate = !drawn) {
  if (!map) return;
  const rs = regions();
  const sig = JSON.stringify(rs.map((r) => [r.key, r.stage, r.wait, r.items.map((d) => d.id + d.stage + verOf(d))]));
  if (!animate && sig === paint.sig) return;
  paint.sig = sig;
  const aoi = { type: 'FeatureCollection', features: [] };
  for (const r of rs) for (const d of r.items) if (d.aoi) aoi.features.push({ type: 'Feature', geometry: d.aoi, properties: { c: STAGE[d.stage]?.c || '#fff', box: JSON.stringify(d.aoi.coordinates).split('],[').length <= 6 ? 1 : 0 } });
  map.getSource('aoi').setData(aoi);

  markers.forEach((m) => m.remove()); markers = []; pins = [];
  clusters.forEach((c) => c.m.remove()); clusters.clear();
  const hq = document.createElement('div'); hq.className = 'pin hq'; hq.innerHTML = `<i></i><b>${HQ.name}</b>`;
  hqPin = { el: hq, m: new window.maplibregl.Marker({ element: hq, anchor: 'left', offset: [-4, 0] }).setLngLat([HQ.lng, HQ.lat]).addTo(map) };
  markers.push(hqPin.m);
  for (const r of rs) {
    const el = pinEl(r.name, r.items.length, r.stage, r.wait, r.items.map((d) => `${STAGE[d.stage]?.ko} · ${cardName(d.card_id)} ${verOf(d)}`.trim()).join('\n'));
    el.addEventListener('click', (e) => { e.stopPropagation(); onPick && onPick(r); });
    const m = new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat([r.lng, r.lat]).addTo(map);
    markers.push(m); pins.push({ r, el, m });
  }
  declutter();
  const lines = rs.map((r) => ({ c: STAGE[r.stage]?.c || '#fff', pts: arc([HQ.lng, HQ.lat], [r.lng, r.lat]) }));
  const set = (k) => map.getSource('arcs').setData({ type: 'FeatureCollection', features: lines.map((l) => ({ type: 'Feature', properties: { c: l.c }, geometry: { type: 'LineString', coordinates: l.pts.slice(0, Math.max(2, Math.round(l.pts.length * k))) } })) });
  if (!animate) return set(1);
  drawn = true;
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / 1250); set(eArrive(k)); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/** 지도 가용 영역 — 현황 우측 패널 · 하단 분절 막대를 피한다(라벨이 패널 밑으로 들어가지 않게) */
function pad() {
  const col = document.querySelector('.ov-col');
  const W = map.getContainer().clientWidth;
  const right = col ? Math.min(W * 0.55, col.getBoundingClientRect().width + 24 + 150) : 160;
  return { top: 96, bottom: 96, left: 72, right };
}
function worldBox() {
  const b = [HQ.lng, HQ.lat, HQ.lng, HQ.lat];
  for (const p of pins) b.splice(0, 4, Math.min(b[0], p.r.lng), Math.min(b[1], p.r.lat), Math.max(b[2], p.r.lng), Math.max(b[3], p.r.lat));
  return [b[0] - 6, b[1] - 6, b[2] + 6, b[3] + 6];
}
export function fly(where, dur = 2400) {
  if (!map) return;
  const box = where === 'world' ? worldBox() : KR_BOX;
  fitBox(box, where === 'world' ? 4 : 7.2, dur);
}
/* globe 투영에서 카메라 padding 을 남기면 마커가 어긋난다(5.6) — 패딩은 카메라 계산에만 쓰고 이동은 center·zoom 으로 */
function fitBox(b, maxZoom, dur) {
  map.setPadding({ top: 0, bottom: 0, left: 0, right: 0 });
  const c = map.cameraForBounds([[b[0], b[1]], [b[2], b[3]]], { padding: pad(), maxZoom });
  if (!c) return;
  const o = { center: c.center, zoom: c.zoom, bearing: 0, pitch: 0, essential: true };
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || !dur) map.jumpTo(o); else map.flyTo({ ...o, duration: dur, easing: eCam });
}
export function flyTo(r) {
  if (!map) return;
  const w = r.box[2] - r.box[0];
  map.flyTo({ center: [r.lng, r.lat], zoom: w > 3 ? 5 : w > 0.6 ? 8 : 9.2, duration: 1600, easing: eCam, offset: [-200, 0] });
}
export const mapReady = () => !!map;
export { decisionSince };

/* ── 라벨 충돌 회피 — 화면에서 라벨 상자가 겹치는 점은 한 점으로 묶는다(같은 시도 → 시도 이름 · 같은 나라 → 나라 이름).
 *    확대하면 떨어지므로 저절로 펼쳐진다 · 묶음을 누르면 그 범위로 확대. */
function pinEl(name, n, stage, wait, title) {
  const el = document.createElement('button'); el.type = 'button'; el.className = 'pin';
  el.style.setProperty('--c', STAGE[stage]?.c || '#fff');
  if (stage === 'draft') el.dataset.draft = ''; if (wait) el.dataset.wait = '';
  el.innerHTML = `<i></i><b></b><em></em>`;
  el.querySelector('b').textContent = name; el.querySelector('em').textContent = `서비스 ${n}`;
  el.title = title;
  return el;
}
const boxOf = (x, y, w) => [x - 10, y - 13, x - 6 + w + 6, y + 13];
const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
function declutter() {
  if (!map || !pins.length) return;
  const P = pins.map((p) => { const q = map.project([p.r.lng, p.r.lat]); p.w = p.w || p.el.offsetWidth || 140; return { p, x: q.x, y: q.y, b: boxOf(q.x, q.y, p.w) }; });
  const par = P.map((_, i) => i); const f = (i) => (par[i] === i ? i : (par[i] = f(par[i])));
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (hit(P[i].b, P[j].b)) par[f(i)] = f(j);
  const groups = new Map();
  P.forEach((x, i) => { const k = f(i); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
  const live = new Set(); const shown = [];
  for (const g of groups.values()) {
    if (g.length === 1) { g[0].p.el.classList.remove('gone'); shown.push(g[0]); continue; }
    g.forEach((x) => x.p.el.classList.add('gone'));
    const rs = g.map((x) => x.p.r);
    const key = rs.map((r) => r.key).sort().join('|'); live.add(key);
    let c = clusters.get(key);
    if (!c) {
      const same = (k) => rs.every((r) => r[k] === rs[0][k]);
      const name = same('grp') ? rs[0].grp : same('country') ? rs[0].country : `${rs[0].name} 외 ${rs.length - 1}`;
      const top = rs.reduce((m, r) => ((STAGE[r.stage]?.order ?? -1) > (STAGE[m.stage]?.order ?? -1) ? r : m), rs[0]);
      const el = pinEl(name, rs.reduce((s, r) => s + r.items.length, 0), top.stage, rs.some((r) => r.wait), rs.map((r) => r.name).join(' · '));
      el.classList.add('grp'); el.dataset.n = rs.length;
      const lng = rs.reduce((s, r) => s + r.lng, 0) / rs.length, lat = rs.reduce((s, r) => s + r.lat, 0) / rs.length;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const b = rs.reduce((a, r) => [Math.min(a[0], r.box[0]), Math.min(a[1], r.box[1]), Math.max(a[2], r.box[2]), Math.max(a[3], r.box[3])], [180, 90, -180, -90]);
        fitBox(b, 8, 1600);
      });
      c = { el, lng, lat, m: new window.maplibregl.Marker({ element: el, anchor: 'left', offset: [-6, 0] }).setLngLat([lng, lat]).addTo(map) };
      clusters.set(key, c);
    }
    const q = map.project([c.lng, c.lat]); shown.push({ b: boxOf(q.x, q.y, c.el.offsetWidth || 140), x: q.x, y: q.y });
  }
  for (const [k, c] of clusters) if (!live.has(k)) { c.m.remove(); clusters.delete(k); }
  if (hqPin) {
    const q = map.project([HQ.lng, HQ.lat]); const hb = boxOf(q.x, q.y, hqPin.el.offsetWidth || 80);
    const dotHit = shown.some((s) => Math.hypot(s.x - q.x, s.y - q.y) < 16);
    hqPin.el.classList.toggle('gone', dotHit);
    hqPin.el.classList.toggle('mute', !dotHit && shown.some((s) => hit(s.b, hb)));
  }
}
