// Land-XI 폴백 지도 — MapLibre/타일 서버를 쓸 수 없을 때 쓰는 절차적 캔버스 지도.
// design-review/03-lx-interactive.html 의 makeWorld/makeDetections/renderer 를 모듈로 옮기고
// MapLibre 경로와 동일한 LXMap 시그니처로 감쌌다.
import { tileURL } from './style.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 지리 ↔ 월드 좌표 ─────────────────────────────────────────────── */
export const BOUNDS = { west: 127.0, east: 128.4, south: 35.0, north: 36.4 };
const SPAN_LNG = BOUNDS.east - BOUNDS.west, SPAN_LAT = BOUNDS.north - BOUNDS.south;
// 표시용 줌 곡선. 폴백 세계는 실제 축척이 아니라 장식이므로, 줌 6~18 이 보기 좋은
// 배율 0.62~14 에 대응하도록 압축한 지수를 쓴다(줌 값 자체는 그대로 보존된다).
const Z0 = 0.62, ZOOM0 = 6, K = 0.375;
const zFromZoom = z => Z0 * Math.pow(2, (z - ZOOM0) * K);
const zoomFromZ = s => ZOOM0 + Math.log2(s / Z0) / K;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ── 시드 난수 ────────────────────────────────────────────────────── */
export function rng(seed) { let s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* ── 절차 지도 생성 ───────────────────────────────────────────────── */
export function makeWorld(seed) {
  const r = rng(seed), W = 2400, H = 1600, w = { W, H, roads: [], streets: [], river: [], bld: [], fields: [] };
  let y = H * 0.62;
  for (let x = -100; x <= W + 100; x += 120) { w.river.push([x, y]); y += (r() - 0.5) * 140; y = clamp(y, H * 0.35, H * 0.85); }
  for (let i = 0; i < 4; i++) { const pts = []; let yy = H * (0.15 + i * 0.22) + r() * 80; for (let x = -100; x <= W + 100; x += 160) { pts.push([x, yy]); yy += (r() - 0.5) * 90; } w.roads.push(pts); }
  for (let i = 0; i < 3; i++) { const pts = []; let xx = W * (0.2 + i * 0.3) + r() * 120; for (let yy = -100; yy <= H + 100; yy += 160) { pts.push([xx, yy]); xx += (r() - 0.5) * 90; } w.roads.push(pts); }
  const cx = W * 0.42, cy = H * 0.42, gw = 700, gh = 520, cs = 64;
  w.town = [cx - gw / 2, cy - gh / 2, gw, gh];
  for (let x = cx - gw / 2; x <= cx + gw / 2; x += cs) w.streets.push([[x, cy - gh / 2], [x, cy + gh / 2]]);
  for (let yy = cy - gh / 2; yy <= cy + gh / 2; yy += cs) w.streets.push([[cx - gw / 2, yy], [cx + gw / 2, yy]]);
  for (let x = cx - gw / 2; x < cx + gw / 2; x += cs) for (let yy = cy - gh / 2; yy < cy + gh / 2; yy += cs) {
    const n = 2 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) { const bw = 12 + r() * 22, bh = 10 + r() * 20; w.bld.push([x + 6 + r() * (cs - bw - 12), yy + 6 + r() * (cs - bh - 12), bw, bh]); }
  }
  for (let i = 0; i < 260; i++) {
    const px = r() * W, py = r() * H;
    if (Math.abs(px - cx) < gw / 2 + 40 && Math.abs(py - cy) < gh / 2 + 40) continue;
    w.fields.push([px, py, 40 + r() * 110, 30 + r() * 80, (r() - 0.5) * 0.5, r()]);
  }
  return w;
}

function poly(cx, cy, n, rad, r) { const p = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, rr = rad * (0.75 + r() * 0.5); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.7]); } return p; }
export function makeDetections(w, seed) {
  const r = rng(seed), d = [], statuses = ['found', 'doing', 'done'];
  for (let i = 0; i < 34; i++) { const cx = w.W * (0.12 + r() * 0.76), cy = w.H * (0.12 + r() * 0.76); d.push({ p: poly(cx, cy, 5 + Math.floor(r() * 3), 14 + r() * 22, r), cx, cy, s: statuses[Math.floor(r() * 3)], delay: r() * 6 }); }
  return d;
}

const AI = '#0FA9A0', LX = '#2457D6';
const KIND = {
  detection: { fill: 'rgba(15,169,160,.18)', stroke: AI, width: 1.5, hi: 'rgba(15,169,160,.45)' },
  extent: { fill: 'rgba(36,87,214,.06)', stroke: 'rgba(36,87,214,.35)', width: 1, hi: 'rgba(36,87,214,.18)' },
  coverage: { fill: 'rgba(36,87,214,.30)', stroke: 'rgba(36,87,214,.30)', width: 1, hi: 'rgba(36,87,214,.50)' },
  org: { fill: LX, stroke: '#FFFFFF', width: 2, hi: LX },
};

/** GeoJSON → 월드 좌표 피처 목록(Polygon / MultiPolygon / Point). */
function toFeatures(data, toWorld) {
  const src = data && data.type === 'FeatureCollection' ? data.features : data && data.type === 'Feature' ? [data] : [];
  const out = [];
  for (const f of src || []) {
    const g = f && f.geometry; if (!g) continue;
    const props = f.properties || {};
    if (g.type === 'Point') out.push({ props, point: toWorld(g.coordinates) });
    else if (g.type === 'Polygon') out.push({ props, rings: g.coordinates.map(r => r.map(toWorld)) });
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) out.push({ props, rings: p.map(toWorld) });
  }
  return out;
}
/* ── XYZ 타일 ↔ 경위도 ───────────────────────────────────────────────── */
const P2 = z => Math.pow(2, z);
const lon2t = (lon, z) => (lon + 180) / 360 * P2(z);
const lat2t = (lat, z) => { const r = lat * Math.PI / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * P2(z); };
const t2lon = (x, z) => x / P2(z) * 360 - 180;
const t2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / P2(z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

function inRing(pt, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/* ── LXMap 폴백 구현 ──────────────────────────────────────────────── */
export function createFallback(box, o = {}) {
  const canvas = document.createElement('canvas'); canvas.className = 'lxmap__fallback'; box.append(canvas);
  const ctx = canvas.getContext('2d');
  const world = makeWorld(o.seed == null ? 7 : o.seed), det = makeDetections(world, (o.seed == null ? 7 : o.seed) + 4);
  const toWorld = c => [(c[0] - BOUNDS.west) / SPAN_LNG * world.W, (1 - (c[1] - BOUNDS.south) / SPAN_LAT) * world.H];
  const toLngLat = p => [BOUNDS.west + p[0] / world.W * SPAN_LNG, BOUNDS.south + (1 - p[1] / world.H) * SPAN_LAT];
  const c0 = toWorld(o.center || [127.8, 36.2]);
  const cam = { x: c0[0], y: c0[1], z: zFromZoom(o.zoom == null ? 6 : o.zoom), tx: null, ty: null, tz: null };
  const st = { t: 0, ortho: 0, hover: null };
  const layers = new Map(), rasters = new Map(), tileCache = new Map(), handlers = {};
  const interactive = o.interactive !== false && o.mode !== 'backdrop';
  let dpr = 1, Wc = 1, Hc = 1, raf = 0, dead = false, last = performance.now(), moved = true;

  function resize() {
    dpr = Math.min(2, devicePixelRatio || 1);
    const b = box.getBoundingClientRect();
    Wc = Math.max(1, Math.round(b.width) || box.clientWidth || 1); Hc = Math.max(1, Math.round(b.height) || box.clientHeight || 1);
    canvas.width = Wc * dpr; canvas.height = Hc * dpr; canvas.style.width = Wc + 'px'; canvas.style.height = Hc + 'px'; moved = true;
  }
  const toS = (x, y) => [(x - cam.x) * cam.z + Wc / 2, (y - cam.y) * cam.z + Hc / 2];
  const toW = (sx, sy) => [(sx - Wc / 2) / cam.z + cam.x, (sy - Hc / 2) / cam.z + cam.y];
  function line(pts, w, col) { ctx.beginPath(); pts.forEach((p, i) => { const s = toS(p[0], p[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke(); }

  // 정사영상 슬라이더는 폴백에서 "위성처럼 보이는" 색으로 베이스를 갈아끼워 흉내낸다.
  const sat = () => st.ortho > 0.02;
  function drawBase() {
    // 세계 밖 = 자료 없음. 옅은 수면 톤으로 칠해 경계가 의도된 것으로 읽히게 한다.
    ctx.fillStyle = sat() ? '#243040' : '#DCE6EC'; ctx.fillRect(0, 0, Wc, Hc);
    const o0 = toS(0, 0), o1 = toS(world.W, world.H);
    ctx.fillStyle = sat() ? '#3B4A3A' : '#E9EEF1'; ctx.fillRect(o0[0], o0[1], o1[0] - o0[0], o1[1] - o0[1]);
    ctx.save(); ctx.beginPath(); ctx.rect(o0[0], o0[1], o1[0] - o0[0], o1[1] - o0[1]); ctx.clip();
    const a0 = 0.35 + st.ortho * 0.65;
    world.fields.forEach(f => {
      const s = toS(f[0], f[1]); ctx.save(); ctx.translate(s[0], s[1]); ctx.rotate(f[4]);
      ctx.fillStyle = sat() ? (f[5] < 0.5 ? 'rgba(74,92,56,' + a0 + ')' : 'rgba(104,116,74,' + a0 + ')') : (f[5] < 0.5 ? '#E2E9E4' : '#EEF1EC');
      ctx.fillRect(0, 0, f[2] * cam.z, f[3] * cam.z);
      ctx.strokeStyle = 'rgba(17,28,45,.10)'; ctx.lineWidth = 1; ctx.strokeRect(0, 0, f[2] * cam.z, f[3] * cam.z); ctx.restore();
    });
    line(world.river, 26 * cam.z, sat() ? '#3F5A6B' : '#CFE0EF'); line(world.river, 3, '#B9D1E6');
    ctx.fillStyle = sat() ? '#575C5D' : '#F3F5F6';
    const a = toS(world.town[0], world.town[1]); ctx.fillRect(a[0], a[1], world.town[2] * cam.z, world.town[3] * cam.z);
    world.streets.forEach(s => line(s, Math.max(1, 3 * cam.z), sat() ? '#8E9295' : '#FFFFFF'));
    world.bld.forEach(b => { const s = toS(b[0], b[1]); ctx.fillStyle = sat() ? '#9AA0A4' : '#DDE3E8'; ctx.fillRect(s[0], s[1], b[2] * cam.z, b[3] * cam.z); });
    world.roads.forEach(rd => { line(rd, Math.max(2, 9 * cam.z) + 2, 'rgba(17,28,45,.12)'); line(rd, Math.max(2, 9 * cam.z), sat() ? '#C9CCC6' : '#FFFFFF'); });
    ctx.restore();
    ctx.strokeStyle = 'rgba(17,28,45,.16)'; ctx.lineWidth = 1; ctx.strokeRect(o0[0], o0[1], o1[0] - o0[0], o1[1] - o0[1]);
    ctx.strokeStyle = 'rgba(17,28,45,.05)'; ctx.lineWidth = 1;
    const step = 200 * cam.z, ox = (Wc / 2 - cam.x * cam.z) % step, oy = (Hc / 2 - cam.y * cam.z) % step;
    for (let x = ox; x < Wc; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, Hc); ctx.stroke(); }
    for (let y = oy; y < Hc; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(Wc, y); ctx.stroke(); }
  }

  // 세계에 심어둔 AI 탐지 흔적(장식). 실제 addGeoJSON 결과보다 옅게 그린다.
  function drawSeeded(t) {
    ctx.save(); ctx.globalAlpha = 0.55;
    det.forEach(d => {
      const prog = REDUCE ? 1 : clamp((t - d.delay) / 1.2, 0, 1); if (prog <= 0) return;
      const pts = d.p.map(p => toS(p[0], p[1]));
      ctx.beginPath(); pts.forEach((s, k) => k ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1])); ctx.closePath();
      ctx.fillStyle = 'rgba(15,169,160,.12)'; ctx.fill();
      const len = pts.length * 40; ctx.setLineDash([len]); ctx.lineDashOffset = len * (1 - prog);
      ctx.strokeStyle = AI; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
  }

  /* ── 실촬영 정사영상 타일 ────────────────────────────────────────────
     MapLibre 경로와 같은 URL(assets/tiles/…/{z}/{x}/{y}.webp)에서 타일을 받아
     실제 경위도 위치에 그린다. 폴백 세계는 경위도를 BOUNDS 안에 선형으로 펴 놓은
     것이라, 타일의 경위도 모서리를 그대로 toWorld→toS 로 옮기면 남원 타일이
     127.35/35.53 자리에 정확히 앉는다. BOUNDS 밖(제주·국산리)은 자리가 없어 건너뛴다. */
  const TILE_CACHE_MAX = 400;      // 줌·패닝을 오래 하면 캐시가 무한히 늘어난다.
  function tileImg(url) {
    let img = tileCache.get(url);
    if (img) { tileCache.delete(url); tileCache.set(url, img); return img; }   // LRU: 최근 사용을 뒤로
    img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => { if (!dead) moved = true; });
    img.addEventListener('error', () => { img.failed = true; });
    img.src = url;
    tileCache.set(url, img);
    while (tileCache.size > TILE_CACHE_MAX) tileCache.delete(tileCache.keys().next().value);
    return img;
  }

  function bestZoom(im) {
    const a = toWorld([im.bounds[0], im.bounds[3]]), b = toWorld([im.bounds[2], im.bounds[1]]);
    const px = Math.abs(toS(b[0], b[1])[0] - toS(a[0], a[1])[0]);
    let best = im.minzoom, bd = Infinity;
    for (let z = im.minzoom; z <= im.maxzoom; z++) {
      const across = Math.max(1e-6, lon2t(im.bounds[2], z) - lon2t(im.bounds[0], z));
      const d = Math.abs(px / across - 256);
      if (d < bd) { bd = d; best = z; }
    }
    return best;
  }

  const MAX_TILES = 256;           // 한 프레임에 그리는 타일 상한
  // NaN 이 들어와도 투명도가 NaN 이 되지 않게 한다(MapLibre 경로와 같은 규칙).
  const clamp01 = v => { const x = Number(v); return Number.isFinite(x) ? clamp(x, 0, 1) : 0; };

  function drawRaster(R) {
    const im = R.im, [w, s, e, n] = im.bounds;
    if (e < BOUNDS.west || w > BOUNDS.east || n < BOUNDS.south || s > BOUNDS.north) return;
    // 화면에 실제로 보이는 경위도 창 ∩ 영상 범위 만 그린다. 영상 서쪽 끝에서 세면
    // 16타일보다 넓은 영상(국산리 z19 = 27타일)은 동쪽으로 패닝해도 계속 서쪽만 나온다.
    const nw = toLngLat(toW(0, 0)), se = toLngLat(toW(Wc, Hc));
    const vw = Math.max(w, Math.min(nw[0], se[0])), ve = Math.min(e, Math.max(nw[0], se[0]));
    const vs = Math.max(s, Math.min(nw[1], se[1])), vn = Math.min(n, Math.max(nw[1], se[1]));
    if (vw >= ve || vs >= vn) return;
    const z = bestZoom(im), tpl = tileURL(im);
    const x0 = Math.floor(lon2t(vw, z)), x1 = Math.floor(lon2t(ve, z) - 1e-9);
    const y0 = Math.floor(lat2t(vn, z)), y1 = Math.floor(lat2t(vs, z) - 1e-9);
    ctx.save(); ctx.globalAlpha = R.opacity;
    let drawn = 0;
    for (let x = x0; x <= x1 && drawn < MAX_TILES; x++) {
      for (let y = y0; y <= y1 && drawn < MAX_TILES; y++) {
        drawn++;
        const img = tileImg(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
        if (img.failed || !img.complete || !img.naturalWidth) continue;
        const p = toWorld([t2lon(x, z), t2lat(y, z)]), q = toWorld([t2lon(x + 1, z), t2lat(y + 1, z)]);
        const A = toS(p[0], p[1]), B = toS(q[0], q[1]);
        // 이웃 타일 사이에 반올림 틈이 생기지 않도록 1px 넉넉히 그린다.
        ctx.drawImage(img, A[0], A[1], B[0] - A[0] + 1, B[1] - A[1] + 1);
      }
    }
    ctx.restore();
  }

  function drawLayer(L, t) {
    const k = KIND[L.kind] || KIND.detection;
    const prog = REDUCE ? 1 : clamp((t - L.at) / 0.9, 0, 1);
    if (prog <= 0) return;
    for (const f of L.features) {
      const on = !L.filter || !!L.filter(f.props);
      ctx.save(); ctx.globalAlpha = L.filter ? (on ? 1 : 0.12) : 1;
      if (f.point) {
        const s = toS(f.point[0], f.point[1]);
        ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, Math.PI * 2);
        ctx.fillStyle = L.paint.fill || k.fill; ctx.fill();
        ctx.lineWidth = k.width; ctx.strokeStyle = L.paint.stroke || k.stroke; ctx.stroke();
      } else {
        const cov = L.kind === 'coverage' ? clamp(Number(f.props.coverage == null ? 1 : f.props.coverage), 0, 1) * 0.5 : null;
        ctx.beginPath();
        for (const ring of f.rings) ring.forEach((p, i) => { const s = toS(p[0], p[1]); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
        ctx.closePath();
        ctx.fillStyle = cov != null ? 'rgba(36,87,214,' + cov + ')' : (L.paint.fill || (L.filter && on ? k.hi : k.fill));
        ctx.fill();
        ctx.setLineDash([9999]); ctx.lineDashOffset = 9999 * (1 - prog);
        ctx.strokeStyle = L.paint.stroke || k.stroke; ctx.lineWidth = L.paint.width || k.width; ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
    }
  }

  function drawSweep(t) {
    if (REDUCE) return;
    const x = ((t * 40) % (Wc + 300)) - 150;
    const g = ctx.createLinearGradient(x - 140, 0, x, 0);
    g.addColorStop(0, 'rgba(15,169,160,0)'); g.addColorStop(1, 'rgba(15,169,160,.16)');
    ctx.fillStyle = g; ctx.fillRect(x - 140, 0, 140, Hc);
    ctx.fillStyle = 'rgba(15,169,160,.5)'; ctx.fillRect(x, 0, 1, Hc);
  }

  function frame(now) {
    if (dead) return;
    const dt = Math.min(0.05, (now - last) / 1000); last = now; st.t += dt;
    if (cam.tx != null) {
      cam.x += (cam.tx - cam.x) * 0.12; cam.y += (cam.ty - cam.y) * 0.12; cam.z += (cam.tz - cam.z) * 0.12; moved = true;
      if (Math.abs(cam.tx - cam.x) < 0.5 && Math.abs(cam.ty - cam.y) < 0.5 && Math.abs(cam.tz - cam.z) < 0.002) { cam.x = cam.tx; cam.y = cam.ty; cam.z = cam.tz; cam.tx = null; }
    }
    if (o.ambient === 'spin' && !REDUCE && cam.tx == null && !drag) { cam.x += 0.4 / cam.z; if (cam.x > world.W) cam.x -= world.W; moved = true; }
    if (moved) { moved = false; if (handlers.move) handlers.move({ center: toLngLat([cam.x, cam.y]), zoom: zoomFromZ(cam.z) }); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBase();
    for (const R of rasters.values()) drawRaster(R);
    drawSeeded(st.t);
    for (const L of layers.values()) drawLayer(L, st.t);
    drawSweep(st.t);
    raf = requestAnimationFrame(frame);
  }

  function pick(sx, sy) {
    const w = toW(sx, sy);
    const ls = [...layers.values()].reverse();
    for (const L of ls) for (const f of L.features) {
      if (f.point) { const s = toS(f.point[0], f.point[1]); if (Math.hypot(s[0] - sx, s[1] - sy) <= 9) return { id: L.id, feature: { properties: f.props, type: 'Feature' } }; }
      else if (f.rings.some(r => inRing(w, r))) return { id: L.id, feature: { properties: f.props, type: 'Feature' } };
    }
    return null;
  }

  /* 입력 — 드래그 팬 / 휠 줌 / 클릭·호버 히트테스트 */
  let drag = null;
  const onDown = e => { if (!interactive) return; drag = [e.clientX, e.clientY]; cam.tx = null; };
  const onMove = e => {
    if (!interactive) return;
    if (drag) { cam.x -= (e.clientX - drag[0]) / cam.z; cam.y -= (e.clientY - drag[1]) / cam.z; drag = [e.clientX, e.clientY]; moved = true; return; }
    if (!handlers.hover) return;
    const b = canvas.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top;
    if (sx < 0 || sy < 0 || sx > Wc || sy > Hc) { if (st.hover) { handlers.hover(null); st.hover = null; } return; }
    const hit = pick(sx, sy);
    if (hit) handlers.hover({ id: hit.id, feature: hit.feature, point: [sx, sy] });
    else if (st.hover) handlers.hover(null);
    st.hover = hit;
  };
  const onUp = () => { drag = null; };
  const onWheel = e => { if (!interactive) return; e.preventDefault(); cam.tx = null; cam.z = clamp(cam.z * (e.deltaY > 0 ? 0.9 : 1.1), zFromZoom(3), zFromZoom(20)); moved = true; };
  const onClick = e => {
    if (!interactive || !handlers.click) return;
    const b = canvas.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top;
    const hit = pick(sx, sy);
    if (hit) handlers.click({ id: hit.id, feature: hit.feature, lnglat: toLngLat(toW(sx, sy)) });
  };

  resize(); addEventListener('resize', resize);
  canvas.addEventListener('mousedown', onDown); addEventListener('mousemove', onMove); addEventListener('mouseup', onUp);
  canvas.addEventListener('wheel', onWheel, { passive: false }); canvas.addEventListener('click', onClick);
  raf = requestAnimationFrame(frame);

  const jump = (c, z) => { const w = toWorld(c); cam.tx = null; cam.x = w[0]; cam.y = w[1]; if (z != null) cam.z = zFromZoom(clamp(z, 3, 20)); moved = true; };
  return {
    engine: 'fallback', ready: true, raw: { world, cam, canvas },
    flyTo(c, z) { if (REDUCE) return jump(c, z); const w = toWorld(c); cam.tx = w[0]; cam.ty = w[1]; cam.tz = z != null ? zFromZoom(clamp(z, 3, 20)) : cam.z; },
    jumpTo: jump,
    // 같은 id 로 다시 부르면 교체한다(MapLibre 경로와 동일).
    addGeoJSON(id, data, opt) {
      const { kind = 'detection', paint = {} } = opt || {};
      const prev = layers.get(id);
      layers.set(id, { id, kind: prev ? prev.kind : kind, paint, data, filter: null, at: st.t, features: toFeatures(data, toWorld) });
    },
    getLayer(id) {
      const L = layers.get(id);
      if (L) return { id, kind: L.kind, data: L.data, count: L.features.length };
      const R = rasters.get(id);
      return R ? { id, kind: 'raster', imagery: R.im, count: 0 } : null;
    },
    /** MapLibre 경로와 같은 시그니처. before 는 폴백에 레이어 순서 개념이 없어 무시한다. */
    addRaster(id, imagery, opt) {
      if (!imagery || !imagery.tiles) return;
      const { opacity = 1 } = opt || {};
      rasters.set(id, { id, im: imagery, opacity: clamp01(opacity) });
      moved = true;
    },
    setRasterOpacity(id, v) {
      const R = rasters.get(id);
      if (R) { R.opacity = clamp01(v); moved = true; }
    },
    setHighlight(id, fn) { const L = layers.get(id); if (L) L.filter = typeof fn === 'function' ? fn : null; },
    setOrthoOpacity(v) { st.ortho = clamp(Number(v) || 0, 0, 1); },
    // 핸들러는 교체 방식. 'move' 는 등록 즉시 1회 동기 발화한 뒤 카메라가 움직일 때만 발화한다.
    on(ev, fn) {
      handlers[ev] = fn;
      if (ev !== 'move' || typeof fn !== 'function') return;
      moved = false; fn({ center: toLngLat([cam.x, cam.y]), zoom: zoomFromZ(cam.z) });
    },
    getCenter: () => toLngLat([cam.x, cam.y]),
    getZoom: () => zoomFromZ(cam.z),
    project(c) { const w = toWorld(c); return toS(w[0], w[1]); },
    destroy() { dead = true; cancelAnimationFrame(raf); removeEventListener('resize', resize); removeEventListener('mousemove', onMove); removeEventListener('mouseup', onUp); rasters.clear(); tileCache.clear(); canvas.remove(); },
  };
}
