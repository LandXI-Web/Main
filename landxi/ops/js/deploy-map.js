/* 배포 지도 — MapLibre 잉크 스타일(A11 sido/sigungu 헤어라인 + korea-outline) · 배포본 stage 색 점 · 글로브 인셋(2D 캔버스 정사도법).
 * 로그인 얼굴판(xdworld 위성 + 경작지 2,098 결과) → 잉크 반전 1600 → 같은 지도가 운영 현황 배포 지도로 자란다(카메라 점프 0).
 * stage 색: draft 점선 · shadow 슬레이트 · canary 액센트 · ga 청록(AI) · rolled_back 앰버 테두리(Ops 주의).
 * 모든 전이는 사다리 값(380 · 1250 · 1600)과 --e-* 이징만. */
import { h, t, hhmmss, esc, get, prov, setText, fmt, SRC, tag, ymd } from './boot.js';
import { ring } from './rings.js';
import { alertStrip } from './alerts.js';
import { connect } from './telemetry.js';

export const CAM = [0.16, 1, 0.3, 1];   // --e-cam
export const ARRIVE = [0.15, 1, 0.3, 1];
export function bezier([x1, y1, x2, y2]) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-5) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; } return Y(Math.max(0, Math.min(1, t))); };
}
export const eCam = bezier(CAM);

/* ── 라이브러리 ─────────────────────────────────────────────────── */
const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.append(s); });
const loadCss = (href) => { if (document.querySelector(`link[href="${href}"]`)) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = href; document.head.append(l); };
let libs = null;
export function loadLibs() {
  return libs || (libs = (async () => {
    loadCss('/landxi/proto/vendor/maplibre/maplibre-gl.css');
    if (!window.maplibregl) await loadScript('/landxi/proto/vendor/maplibre/maplibre-gl.js');
    if (!window.pmtiles) await loadScript('https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js');
    const protocol = new window.pmtiles.Protocol();
    window.maplibregl.addProtocol('pmtiles', protocol.tile);
    return window.maplibregl;
  })());
}
const D = (p) => 'pmtiles://' + location.origin + '/landxi/data/' + p;

/* ── 스타일 ─────────────────────────────────────────────────────── */
// F1-C must_fix 3 — 헤어라인 대비 ↑(빈 판으로 읽히지 않게): 해안선 .46 · 시도 .26 · 시군구 .12 (1차 .30 · .12 · .055)
export const INK = { bg: '#010102', land: '#080B0F', rule: 'rgba(255,255,255,.46)', rule2: 'rgba(255,255,255,.26)', rule3: 'rgba(255,255,255,.12)', ai: '#2BD9CF' };
export function baseStyle({ face = false } = {}) {
  return {
    version: 8, transition: { duration: 0, delay: 0 },
    sources: {
      sat: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 5, maxzoom: 19, attribution: 'V-World 위성(xdworld)' },
      outline: { type: 'vector', url: D('vector/pmtiles/korea-outline.pmtiles') },
      sido: { type: 'vector', url: D('vector/pmtiles/sido.pmtiles') },
      sgg: { type: 'vector', url: D('vector/pmtiles/sigungu.pmtiles') },
      emd: { type: 'vector', url: D('vector/pmtiles/namwon-emd.pmtiles') },
      farm: { type: 'vector', url: D('vector/pmtiles/namwon-farmland-2025.pmtiles') },
      // 시도 GeoJSON(199KB · 반전 전에 이미 읽혀 있다) — 남원 z12 → 전국으로 물러날 때 새 타일을 기다리지 않고 헤어라인이 유지된다(검정 판 0)
      sidoj: { type: 'geojson', data: '/landxi/assets/data/geo/sido.geojson', tolerance: 0.6 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': face ? '#FFFFFF' : INK.bg } },
      { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-opacity': face ? 1 : 0, 'raster-fade-duration': 500, 'raster-saturation': 0 } },
      { id: 'outline-fill', type: 'fill', source: 'outline', 'source-layer': 'korea_outline', paint: { 'fill-color': INK.land, 'fill-opacity': face ? 0 : 1 } },
      { id: 'sidoj-fill', type: 'fill', source: 'sidoj', paint: { 'fill-color': INK.land, 'fill-opacity': face ? 0 : 1 } },
      { id: 'sidoj-line', type: 'line', source: 'sidoj', paint: { 'line-color': INK.rule2, 'line-width': 1, 'line-opacity': face ? 0 : 1 } },
      { id: 'sgg-line', type: 'line', source: 'sgg', 'source-layer': 'sigungu', minzoom: 4, paint: { 'line-color': INK.rule3, 'line-width': 0.7, 'line-opacity': face ? 0 : 1 } },
      { id: 'sido-line', type: 'line', source: 'sido', 'source-layer': 'sido', paint: { 'line-color': INK.rule2, 'line-width': 1, 'line-opacity': face ? 0 : 1 } },
      { id: 'outline-line', type: 'line', source: 'outline', 'source-layer': 'korea_outline', paint: { 'line-color': INK.rule, 'line-width': 1, 'line-opacity': face ? 0 : 1 } },
      { id: 'emd-line', type: 'line', source: 'emd', 'source-layer': 'namwon_emd', minzoom: 8, paint: { 'line-color': face ? 'rgba(255,255,255,.55)' : INK.rule2, 'line-width': 0.8, 'line-opacity': 1 } },
      { id: 'farm-fill', type: 'fill', source: 'farm', 'source-layer': 'namwon_farmland_2025', paint: { 'fill-color': face ? '#0FA9A0' : INK.ai, 'fill-opacity': face ? 0.38 : 0.22 } },
      { id: 'farm-line', type: 'line', source: 'farm', 'source-layer': 'namwon_farmland_2025', paint: { 'line-color': face ? '#0FA9A0' : INK.ai, 'line-width': 1.2, 'line-opacity': 0.95 } },
    ],
  };
}
export async function createMap(container, { face = false, center = [127.8, 36.05], zoom = 6.2, interactive = true } = {}) {
  const ml = await loadLibs();
  const map = new ml.Map({ container, style: baseStyle({ face }), center, zoom, interactive, attributionControl: false, fadeDuration: 0, maxPitch: 0, dragRotate: false, pitchWithRotate: false, renderWorldCopies: false });
  map.touchZoomRotate?.disableRotation?.();
  await new Promise((res) => { if (map.loaded()) res(); else map.once('load', res); });
  return map;
}
/** 종이 얼굴판 → 잉크(0..1). 1600 --e-cam 동안 rAF 로 호출된다. */
export function inkMix(map, k, lin = k) {   // k = --e-cam 명도 · lin = 선형 시간(위성은 선형으로 물러나 줌아웃 동안 땅이 보인다)
  const lerp = (a, b) => a + (b - a) * k;
  const c = Math.round(lerp(255, 1));
  map.setPaintProperty('bg', 'background-color', `rgb(${c},${c},${Math.round(lerp(255, 2))})`);
  map.setPaintProperty('sat', 'raster-opacity', Math.max(0, 1 - lin * 1.1) * 0.95);
  map.setPaintProperty('emd-line', 'line-opacity', 1);
  map.setPaintProperty('outline-fill', 'fill-opacity', k); map.setPaintProperty('sidoj-fill', 'fill-opacity', k);
  for (const id of ['sgg-line', 'sido-line', 'outline-line', 'sidoj-line']) map.setPaintProperty(id, 'line-opacity', k);
  map.setPaintProperty('farm-fill', 'fill-opacity', lerp(0.38, 0.26));
  const ai = (a, b) => `rgb(${Math.round(lerp(a[0], b[0]))},${Math.round(lerp(a[1], b[1]))},${Math.round(lerp(a[2], b[2]))})`;
  map.setPaintProperty('farm-fill', 'fill-color', ai([15, 169, 160], [43, 217, 207]));
  map.setPaintProperty('farm-line', 'line-color', ai([15, 169, 160], [43, 217, 207]));
  map.setPaintProperty('emd-line', 'line-color', `rgba(255,255,255,${lerp(0.55, 0.12).toFixed(3)})`);
}
export function tween(ms, ease, fn) {
  return new Promise((res) => { const t0 = performance.now(); const step = (now) => { const x = Math.min(1, (now - t0) / ms); fn(ease(x)); if (x < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
}

/* ── 배포본 점 ──────────────────────────────────────────────────── */
export function centroid(g) {
  const pts = []; const walk = (c) => (typeof c[0] === 'number' ? pts.push(c) : c.forEach(walk)); walk(g?.coordinates || []);
  if (!pts.length) return null; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}
export const inKorea = ([x, y]) => x > 124 && x < 131.5 && y > 33 && y < 39;

export class DeployLayer {
  constructor(map, { onPick } = {}) { this.map = map; this.onPick = onPick; this.m = new Map(); this.labels = []; }
  set(deploys, { arrive = false } = {}) {
    const ml = window.maplibregl; const local = deploys.filter((d) => { const c = centroid(d.aoi); return c && inKorea(c); });
    const groups = new Map();
    for (const d of local) { const c = centroid(d.aoi); const k = d.tenant_id === 'namwon' ? 'namwon' : c.map((v) => v.toFixed(1)).join(','); if (!groups.has(k)) groups.set(k, { c, list: [] }); groups.get(k).list.push(d); }
    const seen = new Set(); let i = 0;
    for (const [k, g] of groups) {
      const n = g.list.length; const R = n > 1 ? 16 + n * 3 : 0;
      g.list.forEach((d, j) => {
        seen.add(d.id); const a = -Math.PI / 2 + (j / n) * 2 * Math.PI; const off = [Math.round(R * Math.cos(a)), Math.round(R * Math.sin(a))];
        let rec = this.m.get(d.id);
        if (!rec) {
          const el = h('button', { class: 'dm-pt', type: 'button', 'data-id': d.id, 'aria-label': `${d.id} · ${d.stage}`, title: `${d.name}\n${d.id} · ${t('stage.' + d.stage, d.stage)} · ${d.version || '버전 없음'}` });
          el.addEventListener('click', (e) => { e.stopPropagation(); this.onPick && this.onPick(d.id); });
          const wrap = h('div', { class: 'dm-mk' }, el);   // 마커 위치 transform 은 wrap 이, 락온·호버 transform 은 el 이 갖는다
          const mk = new ml.Marker({ element: wrap, offset: off, anchor: 'center' }).setLngLat(g.c).addTo(this.map);
          rec = { el, mk, arrived: null }; this.m.set(d.id, rec);
          if (arrive) { el.style.animationDelay = (i * 60) + 'ms'; el.classList.add('is-arrive'); el.style.setProperty('--lk-delay', (i * 60) + 'ms'); el.classList.add('is-arrive-lock'); rec.arrived = new Promise((r) => setTimeout(r, i * 60 + 380)); }
        } else rec.mk.setOffset(off);
        rec.el.dataset.stage = d.stage; rec.el.dataset.basis = d.basis;
        rec.d = d; i++;
      });
      if (!this.labels.find((l) => l.k === k)) {
        const first = g.list[0]; const nm = first.region_name?.ko?.replace('전북특별자치도 ', '').split(' · ')[0] || k;
        const el = h('div', { class: 'dm-label' }, h('b', {}, nm), ` · 배포 ${g.list.length}`, g.list.some((d) => d.basis === 'history') ? h('span', { class: 'og-tag', 'data-basis': 'history' }, '이력') : null);
        const east = k === 'namwon';   // 남원 무리는 동쪽, 나머지는 서쪽에 이름표 — 이웃 무리 점 위에 겹치지 않게
        const mk = new ml.Marker({ element: el, offset: [east ? R + 16 : -(R + 16), 0], anchor: east ? 'left' : 'right' }).setLngLat(g.c).addTo(this.map);
        this.labels.push({ k, el, mk, g });
      } else { const L = this.labels.find((l) => l.k === k); L.el.querySelector('b').nextSibling.textContent = ` · 배포 ${g.list.length}`; }
    }
    for (const [id, rec] of this.m) if (!seen.has(id)) { rec.mk.remove(); this.m.delete(id); }
  }
  /** 롤백 R-1: 앰버 380(성장 180 → 앰버 80 → 정착 120) → 새 stage 색 */
  lock(id, stage) {
    const rec = this.m.get(id); if (!rec) return;
    rec.el.classList.remove('is-lock'); void rec.el.offsetWidth; rec.el.classList.add('is-lock');
    setTimeout(() => { if (stage) rec.el.dataset.stage = stage; }, 260);
    setTimeout(() => rec.el.classList.remove('is-lock'), 400);
  }
  select(id) { for (const [k, r] of this.m) r.el.classList.toggle('is-sel', k === id); }
  job(ev) {   // job.state → 실행 중 AOI 점 S1 도착
    const ml = window.maplibregl; if (!ev.aoi_centroid) return;
    const key = 'job:' + ev.job_id; let rec = this.m.get(key);
    if (ev.state === 'running' || ev.state === 'queued') {
      if (!rec) { const el = h('div', { class: 'dm-job is-arrive', title: `${ev.job_id} · ${ev.tenant_id}` }, h('i')); const mk = new ml.Marker({ element: el }).setLngLat(ev.aoi_centroid).addTo(this.map); rec = { el, mk, job: true }; this.m.set(key, rec); }
      rec.el.dataset.state = ev.state;
    } else if (rec) { rec.el.dataset.state = ev.state; setTimeout(() => { rec.mk.remove(); this.m.delete(key); }, 1250); }
  }
}

/* ── 글로브 인셋(2D 정사도법 · WebGL 캔버스 수를 늘리지 않는다) ─────── */
let landP = null;
/** 육지 점 격자(1.5°) — 110m 육지 다각형에 점-다각형 판정 1회. 뒷면 클리핑이 필요 없는 도트 글로브. */
async function land() {
  return landP || (landP = (async () => {
    try {
      if (!window.topojson) await loadScript('https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js');
      const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json')).json();
      const fc = window.topojson.feature(topo, topo.objects.land);
      const polys = [];
      for (const f of fc.features) for (const poly of (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates)) {
        const r = poly[0]; let x0 = 180, y0 = 90, x1 = -180, y1 = -90; for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        polys.push({ r, b: [x0, y0, x1, y1] });
      }
      const inRing = (x, y, r) => { let o = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o; } return o; };
      const dots = [];
      for (let lat = -58.5; lat <= 78; lat += 1.5) {
        const step = 1.5 / Math.max(0.35, Math.cos((lat * Math.PI) / 180));
        for (let lon = -180; lon < 180; lon += step) if (polys.some((p) => lon >= p.b[0] && lon <= p.b[2] && lat >= p.b[1] && lat <= p.b[3] && inRing(lon, lat, p.r))) dots.push([lon, lat]);
      }
      return dots;
    } catch { return null; }
  })());
}
export class Globe {
  constructor(host, { size = 180 } = {}) {
    this.size = size; this.dpr = Math.min(2, devicePixelRatio || 1); this.rot = [-100, -30]; this.pts = [];
    this.cv = h('canvas', { class: 'dm-globe-cv', width: size * this.dpr, height: size * this.dpr, 'aria-hidden': 'true' }); this.cv.style.width = this.cv.style.height = size + 'px';
    this.cap = h('div', { class: 'dm-globe-cap og-lbl' }, '해외 배포 · 글로브');
    this.el = h('div', { class: 'dm-globe' }, this.cv, this.cap); host.append(this.el);
    this.ctx = this.cv.getContext('2d'); land().then((g) => { this.dots = g; if (!g) this.cap.textContent = '해외 배포 · 육지 윤곽 로드 실패(CDN)'; this.draw(); });
    this.draw();
  }
  proj([lon, lat]) {
    const r = (this.size / 2 - 6); const l0 = -this.rot[0] * Math.PI / 180, p0 = -this.rot[1] * Math.PI / 180; const l = lon * Math.PI / 180, p = lat * Math.PI / 180;
    const cosc = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(l - l0);
    const x = r * Math.cos(p) * Math.sin(l - l0); const y = r * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(l - l0));
    return [this.size / 2 + x, this.size / 2 - y, cosc >= 0, cosc];
  }
  draw() {
    const c = this.ctx, s = this.size, r = s / 2 - 6; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, s, s);
    c.beginPath(); c.arc(s / 2, s / 2, r, 0, 2 * Math.PI); c.fillStyle = '#05070A'; c.fill(); c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.05)'; c.lineWidth = 0.6;
    for (let lon = -180; lon < 180; lon += 30) this.line(Array.from({ length: 37 }, (_, i) => [lon, -90 + i * 5]));
    for (let lat = -60; lat <= 60; lat += 30) this.line(Array.from({ length: 73 }, (_, i) => [-180 + i * 5, lat]));
    if (this.dots) {
      for (const d of this.dots) { const [x, y, vis, k] = this.proj(d); if (!vis) continue; c.fillStyle = `rgba(171,179,191,${(0.18 + 0.5 * k).toFixed(3)})`; c.fillRect(x - 0.7, y - 0.7, 1.4, 1.4); }
    }
    for (const p of this.pts) {
      const [x, y, vis] = this.proj(p.lnglat); if (!vis) continue;
      c.fillStyle = p.color; c.strokeStyle = p.color; c.lineWidth = 1.2;
      if (p.dashed) { c.setLineDash([2, 2]); c.strokeRect(x - 4, y - 4, 8, 8); c.setLineDash([]); } else c.fillRect(x - 3.5, y - 3.5, 7, 7);
      if (p.lock) { const k = p.lock; c.strokeStyle = k < 0.68 ? '#FFB633' : '#2BD9CF'; c.globalAlpha = Math.min(1, k * 2.1); const b = 7 + (1 - Math.min(1, k * 2.1)) * 6; c.strokeRect(x - b, y - b, b * 2, b * 2); c.globalAlpha = 1; }
    }
  }
  line(coords) {
    const c = this.ctx; c.beginPath(); let pen = false, n = 0;
    for (const ll of coords) { const [x, y, vis] = this.proj(ll); if (!vis) { pen = false; continue; } if (!pen) { c.moveTo(x, y); pen = true; } else c.lineTo(x, y); n++; }
    if (n) c.stroke();
  }
  setPoints(pts) { this.pts = pts; this.draw(); }
  /** 초점 이동 1600 --e-cam (카메라 점프 0) */
  focus([lon, lat], ms = 1600) {
    const [a0, b0] = this.rot; const a1 = -lon, b1 = -lat; let d = a1 - a0; d = ((d + 540) % 360) - 180;
    return tween(ms, eCam, (k) => { this.rot = [a0 + d * k, b0 + (b1 - b0) * k]; this.draw(); });
  }
  lockPoint(id) { const p = this.pts.find((x) => x.id === id); if (!p) return Promise.resolve(); return tween(380, (x) => x, (k) => { p.lock = k; this.draw(); }).then(() => { p.lock = 0; this.draw(); }); }
}
export const STAGE_COLOR = { draft: '#8F99A8', shadow: '#738091', canary: '#4E9BFF', ga: '#2BD9CF', rolled_back: '#FFB633' };
export function globePoints(deploys) {
  return deploys.map((d) => ({ id: d.id, lnglat: centroid(d.aoi), color: STAGE_COLOR[d.stage] || '#8F99A8', dashed: d.stage === 'draft' })).filter((p) => p.lnglat);
}
export function legend() {
  return h('div', { class: 'dm-legend' }, ...['draft', 'shadow', 'canary', 'ga', 'rolled_back'].map((s) => h('span', { class: 'dm-leg', 'data-stage': s }, h('i'), t('stage.' + s, s))));
}
export { esc, hhmmss };

/* ══ 운영 현황(index) 조립 — 로그인 반전에서 넘어온 지도(map · fly)를 그대로 키운다 ══════════ */
export const KOREA = [124.55, 33.05, 131.0, 38.7];
export function fitCamera(W, H, [x0, y0, x1, y1], pad = 28) {
  const my = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  const zw = Math.log2(((W - 2 * pad) / 512) * (360 / (x1 - x0)));   // MapLibre 줌 = 512px 타일 기준
  const zh = Math.log2(((H - 2 * pad) * 2 * Math.PI) / (512 * (my(y1) - my(y0))));
  const cy = (Math.atan(Math.sinh((my(y0) + my(y1)) / 2)) * 180) / Math.PI;
  const z = Math.min(zw, zh);
  return { center: [(x0 + x1) / 2, cy], zoom: Number.isFinite(z) ? Math.max(3, z) : 6.2 };
}
/** 지도 판이 실제 크기를 가질 때까지 기다린다(첫 레이아웃 전 0px → MapLibre 기본 300px 캔버스 방지) */
export async function sized(el, min = 60) {
  for (let i = 0; i < 30 && (el.clientHeight < min || el.clientWidth < min); i++) await new Promise((r) => requestAnimationFrame(r));
  return [el.clientWidth, el.clientHeight];
}
/** 판 크기가 바뀌면 캔버스를 맞추고, 처음 한 번은 카메라를 판에 맞춘다 */
export function fitOnResize(map, el, bounds, pad) {
  let first = true;
  new ResizeObserver(() => { map.resize(); if (first && el.clientHeight > 60) { first = false; map.jumpTo(fitCamera(el.clientWidth, el.clientHeight, bounds, pad)); } }).observe(el);
}
export const panel = (title, sub, right, ...body) => h('section', { class: 'og-panel' }, h('header', {}, h('h2', {}, title), sub ? h('span', { class: 'og-sub' }, sub) : null, right ? h('span', { class: 'og-right' }, right) : null), ...body);

/* 운영 현황 조립은 overview.js(F2-C) — 반전 중 셸을 세우고 같은 지도를 전국 → 배포 밀집으로 이어 움직인다. */
