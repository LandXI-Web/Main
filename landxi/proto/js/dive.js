/* Land-XI 메인 — 흰 아틀라스.
   바탕은 처음부터 끝까지 흰 종이다. 어두움은 오직 위성·정사영상 **판(plate)** 안에서만 나온다.
   한 대의 카메라가 궤도 → 구름 돌파 → 전국 → 강하 → 결과로 이어지되, 장면 전환은
   컬러웨이 반전이 아니라 **판의 크기 변화와 clip-path 리빌**로 만든다(취향 프로필 §2.2 정정).
   그리고 이 페이지의 목적은 하나다 — 13개 서비스 옆에 실제로 돌린 분석 결과를 놓는 것. */

import { resolveVWorld, EOX as EOX_TPL, DEM as DEM_TPL } from './sources.js';
import { buildStyle, AOI, ORTHO_LAYERS } from './style.js';
import { cameraAt, CHAPTERS } from './camera.js';
import { makeClouds } from './clouds.js';
import { makeOrbit, SAT } from './orbit.js';
import { subsolar, KST } from './sun.js';
import { SVC, HQ, EPOCHS, headDate, dateToQ, initServices, loadJSON, ringsToLines } from './layers.js';
import { makeSwipe } from './swipe.js';
import { makeDetect } from './detect.js';
import { describe, bake, centroids, filaments } from './results.js';
import { makePlate } from './plate.js';
import { buildRows, indexHTML, rowsHTML, makeAtlas, stamp, CROP_KEY, cropLabel, MIN_ABBR } from './atlas.js';
import { lerp, clamp01, fmt, makeCursor, magnetic, scaleBar, thumbFromTiles, develop, cropFromTiles, drawHist } from './hud.js';

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;
const tri = (x, w) => (x >= 0 && x < w ? x / w : 0);
const seg = (p, a, b) => clamp01((p - a) / (b - a));

/* ── 1. 품질 티어 ────────────────────────────────────────── */
function detectTier() {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
  const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const soft = /SwiftShader|Software|llvmpipe|Microsoft Basic/i.test(r);
  const weak = /Intel.*(HD|UHD) Graphics (5|6)\d\d/i.test(r);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 'still';
  if (!gl || soft) return 'lite';
  return (weak || (navigator.deviceMemory || 8) <= 4) ? 'lite' : 'full';
}
let TIER = detectTier();

/* ── 2. 프리로더 — 흰 종이 위 3단 조립. 진행률은 실제 타일 수신량이다. ── */
const pre = {
  el: $('#pre'), bar: $('#pre-bar i'), pct: $('#pre-pct'), ll: $('#pre-ll'),
  text: $('#pre-text'), img: $('#pre-mark img'), note: $('#pre-note'),
};

function prefetchList() {
  const out = [];
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++)
    out.push(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/2/${y}/${x}.jpg`);
  const z = 17, n = Math.pow(2, z);
  const lx = (l) => Math.floor((l + 180) / 360 * n);
  const ly = (a) => Math.floor((1 - Math.log(Math.tan(a * D2R) + 1 / Math.cos(a * D2R)) / Math.PI) / 2 * n);
  for (let x = lx(AOI.namwon[0]); x <= lx(AOI.namwon[2]); x++)
    for (let y = ly(AOI.namwon[3]); y <= ly(AOI.namwon[1]); y++)
      out.push(`../assets/tiles/namwon_2508/${z}/${x}/${y}.webp`);
  return out;
}

function runPreloader() {
  const chars = [...pre.text.textContent].map((c) => {
    const s = document.createElement('span');
    s.className = 'c'; s.textContent = c;
    return s;
  });
  pre.text.textContent = ''; chars.forEach((c) => pre.text.appendChild(c));
  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
  chars.forEach((c, i) => {
    const final = c.textContent;
    if (final === ' ') { c.style.opacity = '1'; return; }
    gsap.to(c, { opacity: 1, duration: 0.16, delay: 0.04 + i * 0.042 });
    const iv = setInterval(() => { c.textContent = pool[(Math.random() * pool.length) | 0]; }, 42);
    setTimeout(() => { clearInterval(iv); c.textContent = final; }, 380 + i * 46);
  });

  const urls = prefetchList();
  let done = 0, mapReady = 0, shown = 0;
  urls.forEach((u) => { const i = new Image(); i.onload = i.onerror = () => { done++; }; i.src = u; });
  const target = () => clamp01(done / urls.length) * 0.76 + mapReady * 0.24;
  const tick = () => {
    shown = lerp(shown, target(), 0.085);
    pre.pct.textContent = String(Math.min(99, Math.round(shown * 100))).padStart(2, '0');
    pre.bar.style.width = (shown * 100).toFixed(1) + '%';
    const k = shown * shown;
    pre.ll.textContent = `${lerp(127 + Math.random() * 0.9, 127.3524, k).toFixed(4)} / ${lerp(35 + Math.random() * 0.9, 35.5311, k).toFixed(4)}`;
    if (shown < 0.995) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return {
    mapLoaded() { mapReady = 1; },
    async finish() {
      pre.pct.textContent = '100';
      pre.bar.style.width = '100%';
      pre.note.textContent = '수신 완료 · 궤도 진입';
      await gsap.to(pre.text, { opacity: 0, duration: 0.28, delay: 0.1 });
      await gsap.to(pre.img, { opacity: 1, duration: 0.42, ease: 'power2.out' });
      await gsap.to(pre.el, { clipPath: 'inset(0 0 100% 0)', duration: 1.2, ease: 'expo.inOut', delay: 0.3 });
      pre.el.style.display = 'none';
    },
  };
}
const PRE = runPreloader();

/* ── 3. 지도 — 한 번 만들고 끝까지 파괴하지 않는다 ──────── */
const v = await resolveVWorld();
const map = new maplibregl.Map({
  container: 'map', style: buildStyle(v),
  center: [127.5, 36.2], zoom: 1.55, bearing: 28, pitch: 0,
  antialias: TIER === 'full', maxPitch: 80, fadeDuration: 0,
  attributionControl: false,
  localIdeographFontFamily: "'Pretendard','SUIT',sans-serif",
});
for (const h of ['scrollZoom', 'dragPan', 'dragRotate', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'boxZoom'])
  map[h] && map[h].disable();
if (typeof map.setPixelRatio === 'function') map.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
window.__map = map;

const errors = [];
map.on('error', (e) => {
  const m = String((e && e.error && e.error.message) || e.type || e);
  if (/calculateFogMatrix/.test(m)) return;
  errors.push((e.sourceId ? '[' + e.sourceId + '] ' : '') + m);
});
await new Promise((res) => { map.on('load', res); setTimeout(res, 25000); });
PRE.mapLoaded();

$('#attrib').textContent =
  `© V-World · 국토교통부${v.keyed ? ' WMTS' : ''} | Sentinel-2 cloudless © EOX | © Mapterhorn | OpenFreeMap © OpenMapTiles · OpenStreetMap | 정사영상 · AI 탐지 © LX 한국국토정보공사`;

/* ── 4. 페인트 헬퍼 ─────────────────────────────────────── */
const lastPaint = new Map();
function op(id, val, prop = 'raster-opacity') {
  const key = id + '|' + prop, r = Math.round(val * 1000) / 1000;
  if (lastPaint.get(key) === r) return;
  lastPaint.set(key, r);
  if (map.getLayer(id)) map.setPaintProperty(id, prop, r);
}
const tweens = new Map();
function opT(id, val, dur = 0.5, prop = 'raster-opacity') {
  const key = id + '|' + prop;
  tweens.get(key) && tweens.get(key).kill();
  const o = { v: lastPaint.get(key) ?? 0 };
  tweens.set(key, gsap.to(o, {
    v: val, duration: dur, ease: 'power2.inOut',
    onUpdate: () => op(id, o.v, prop),
    onComplete: () => op(id, val, prop),
  }));
}
function vis(id, on) {
  const key = id + '|vis';
  if (lastPaint.get(key) === on) return;
  lastPaint.set(key, on);
  if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
}

/* ── 5. 데이터 ──────────────────────────────────────────── */
initServices(map);

(async () => {
  try {
    const [outline, sido] = await Promise.all([
      loadJSON('../assets/data/geo/korea-outline.geojson'),
      loadJSON('../assets/data/geo/sido.geojson'),
    ]);
    map.getSource('outline').setData(ringsToLines(outline));
    map.getSource('sidoline').setData(ringsToLines(sido));
  } catch (e) { errors.push('outline: ' + e.message); }
})();

// 병렬 작업물이 도착했을 때만 켜지는 선택 레이어. 404 로 존재를 확인하면 콘솔 오류가 남는다.
const optional = { change: false, satellite: false, clouds: false, results: false, film: false, crops: false, filmLegs: false };
let RESULTS = [];
const assetsReady = (async () => {
  try {
    const a = await (await fetch('assets.json', { cache: 'no-store' })).json();
    Object.assign(optional, a);
    if (a.results) {
      try {
        const m = await import('../../assets/data/results.js');
        RESULTS = m.RESULTS || m.default || [];
      } catch (e) { optional.results = false; }
    }
  } catch (e) { /* 정적 호스팅 등 — 전부 없는 것으로 본다 */ }
  return optional;
})();
await assetsReady;

/* ── 5b. 강하 경로 타일 프리워밍 ────────────────────────── */
const lon2tx = (l, z) => Math.floor((l + 180) / 360 * Math.pow(2, z));
const lat2ty = (a, z) => Math.floor((1 - Math.log(Math.tan(a * D2R) + 1 / Math.cos(a * D2R)) / Math.PI) / 2 * Math.pow(2, z));
const fill = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);

function prewarmURLs() {
  const out = [];
  const push = (tpl, z, x, y, r) => {
    for (let i = x - r; i <= x + r; i++) for (let j = y - r; j <= y + r; j++) out.push(fill(tpl, z, i, j));
  };
  for (let q = 0.555; q <= 0.812; q += 0.005) {
    const c = cameraAt(q);
    const tz = Math.max(6, Math.min(v.maxzoom, Math.round(c.zoom + 1)));
    const x = lon2tx(c.center[0], tz), y = lat2ty(c.center[1], tz);
    push(v.sat, tz, x, y, tz >= 14 ? 2 : 1);
    if (tz <= 12) {
      const dz = Math.max(6, Math.min(12, Math.round(c.zoom)));
      push(DEM_TPL, dz, lon2tx(c.center[0], dz), lat2ty(c.center[1], dz), 1);
    }
    if (tz <= 15) {
      const ez = Math.max(6, Math.min(14, tz));
      push(EOX_TPL, ez, lon2tx(c.center[0], ez), lat2ty(c.center[1], ez), 1);
    }
  }
  return [...new Set(out)];
}
let warmed = false, warmDone = 0, warmTotal = 0;
function prewarmDescent() {
  if (warmed) return;
  warmed = true;
  const urls = prewarmURLs();
  warmTotal = urls.length;
  let i = 0;
  const LANES = 6;
  const next = () => {
    if (i >= urls.length) return;
    const u = urls[i++];
    const img = new Image();
    img.onload = img.onerror = () => { warmDone++; next(); };
    img.src = u;
  };
  for (let k = 0; k < LANES; k++) next();
}

/* ── 5c. 데이터 레인 (비닐하우스 9,664동) ───────────────── */
let rainLoaded = false, glowRows = null;
async function loadRain() {
  if (rainLoaded) return;
  rainLoaded = true;
  try {
    const g = await loadJSON('../assets/data/geo/results/namwon-greenhouse-2025.geojson');
    const fil = filaments(g, 'nobj', 70, 700, 22);
    map.getSource('rain').setData(fil);
    glowRows = fil.features.map((f) => {
      const r = f.geometry.coordinates[0];
      return { c: [(r[0][0] + r[1][0]) / 2, (r[0][1] + r[2][1]) / 2], h: f.properties._h };
    });
  } catch (e) { rainLoaded = false; }
}

/* ── 6. 투영 전환 + deck.gl 아크 ────────────────────────── */
let projGlobe = true;
function setProj(wantGlobe) {
  if (wantGlobe === projGlobe) return;
  projGlobe = wantGlobe;
  try { map.setProjection({ type: wantGlobe ? 'globe' : 'mercator' }); } catch (e) { errors.push('proj'); }
}

/* deck 오버레이는 mercator 구간에서만 붙인다(globe 에서 deck 이 예외를 던진다).
   붙였다 뗐다를 반복하면 deck 의 애니메이션 루프가 "already running" 을 던지므로,
   **투영이 바뀔 때만** 붙이고 뗀다. 그 밖에는 레이어만 비운다. */
let overlay = null, arcSig = '';
function ensureOverlay(on) {
  if (projGlobe) {
    if (overlay) {
      try { map.removeControl(overlay); } catch (e) { /* noop */ }
      overlay = null; arcSig = ''; glowSig = ''; arcLayer = null; glowLayer = null;
    }
    return;
  }
  if (!overlay) {
    overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay); arcSig = ''; glowSig = '';
  }
  if (!on && (arcLayer || glowLayer)) {
    arcLayer = null; glowLayer = null; arcSig = ''; glowSig = '';
    syncDeck();
  }
}
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
let arcLayer = null, glowLayer = null, glowSig = '';
function syncDeck() {
  if (!overlay) return;
  overlay.setProps({ layers: [arcLayer, glowLayer].filter(Boolean) });
}
/* 가산 혼합 발광 — 겹칠수록 밝아진다. 어두운 바닥이 필요한데, 여기서는 판 안쪽 정사영상이
   그 바닥이다. 종이 위가 아니라 사진 위에서만 성립하므로 판 안에서만 켠다. */
function setGlow(rows, k) {
  const sig = rows ? rows.length + '|' + k.toFixed(2) : '';
  if (sig === glowSig) return;
  glowSig = sig;
  glowLayer = (rows && rows.length && k > 0.01) ? new deck.LineLayer({
    id: 'lx-glow', data: rows,
    getSourcePosition: (d) => [d.c[0], d.c[1], 0],
    getTargetPosition: (d) => [d.c[0], d.c[1], d.h],
    getColor: [0, 109, 247, Math.round(150 * k)],
    getWidth: 1.4, widthMinPixels: 1, widthMaxPixels: 3,
    parameters: {
      blend: true,
      blendColorOperation: 'add', blendColorSrcFactor: 'src-alpha', blendColorDstFactor: 'one',
      blendAlphaOperation: 'add', blendAlphaSrcFactor: 'one', blendAlphaDstFactor: 'one',
      depthWriteEnabled: false,
    },
  }) : null;
  syncDeck();
}
function setArcs(rows) {
  if (!overlay) return;
  const sig = rows.map((r) => r.s.id + r.k.toFixed(2)).join('|');
  if (sig === arcSig) return;
  arcSig = sig;
  arcLayer = rows.length ? new deck.ArcLayer({
    id: 'lx-arcs', data: rows,
    getSourcePosition: () => HQ,
    getTargetPosition: (d) => d.s.lnglat,
    getSourceColor: (d) => [...rgb(d.s.hex), Math.round(16 + 130 * d.k)],
    getTargetColor: (d) => [...rgb(d.s.hex), Math.round(30 + 200 * d.k)],
    getWidth: (d) => 0.7 + 2.4 * d.k,
    getHeight: 0.42, widthMinPixels: 1, widthMaxPixels: 4,
  }) : null;
  syncDeck();
}

/* ── 7. 궤도 · 성층운 · 태양 · 별밭 ─────────────────────── */
const orbit = TIER === 'full' ? makeOrbit($('#orbit3d'), assetsReady) : null;
const clouds = makeClouds($('#sky'), assetsReady);
let SUN = subsolar();
setInterval(() => { SUN = subsolar(); }, 60000);
function drawStars() {
  const cv = $('#stars');
  const dpr = Math.min(1.5, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  const x = cv.getContext('2d');
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, innerWidth, innerHeight);
  const rnd = (() => { let s = 20260825; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  for (const [n, r0, r1, a0, a1] of [[620, 0.35, 0.75, 0.16, 0.42], [230, 0.6, 1.1, 0.34, 0.72], [70, 0.9, 1.7, 0.6, 1]]) {
    for (let i = 0; i < n; i++) {
      const px = rnd() * innerWidth, py = rnd() * innerHeight;
      const r = r0 + rnd() * (r1 - r0), a = a0 + rnd() * (a1 - a0);
      const g = x.createRadialGradient(px, py, 0, px, py, r * 3.4);
      const tint = rnd() < 0.12 ? '190,214,255' : rnd() < 0.1 ? '255,226,196' : '236,244,255';
      g.addColorStop(0, `rgba(${tint},${a})`);
      g.addColorStop(1, `rgba(${tint},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, r * 3.4, 0, 6.284); x.fill();
    }
  }
}

/* ── 8. 판 · 결과 아틀라스 · UI ─────────────────────────── */
/* 병렬 작업 산출물이 도착해 있으면 쓴다 — 없으면 우리가 직접 굽는다. 어느 쪽이든 실픽셀이다.
   존재 확인은 서버의 assets.json 으로 한다(404 로 확인하면 콘솔 오류가 남는다). */
const CROPS = optional.crops
  ? await import('../../assets/data/crops.js')
    .then((m) => m.CROPS || m.default || null).catch(() => null)
  : null;

const ROWS = buildRows(RESULTS, v.sat);
const atlas = makeAtlas({
  left: $('#res-left'), right: $('#res-right'), strip: $('#res-strip'),
  rows: ROWS, tier: TIER, crops: CROPS, sat: v.sat,
});
// CTA 는 지면의 맨 끝이다 — 결과 아틀라스 좌측 컬럼 바닥.
$('#res-left').appendChild($('#cta'));
$('#cta').hidden = false;

const plate = makePlate($('#stage'), $('#plate'), () => atlas.rowRect());
// 비교 커튼은 뷰포트가 아니라 **판** 안에서 움직인다.
const swipe = makeSwipe(map, $('#swipe'), () => {
  const r = plate.rect;
  return [r[0], innerWidth - r[2], r[1], innerHeight - r[3]];
});
let hudCountVal = null;
const detect = makeDetect(map, $('#fx'), (n, total) => { hudCountVal = [n, total]; });

const sizeAll = () => {
  orbit && orbit.resize(innerWidth, innerHeight, Math.min(1.5, devicePixelRatio || 1));
  drawStars();
};
addEventListener('resize', sizeAll); sizeAll();

function fly(cam, ms) {
  return new Promise((res) => {
    if (TIER === 'still') { map.jumpTo({ ...cam, padding: plate.padding() }); return res(); }
    map.easeTo({ ...cam, padding: plate.padding(), duration: ms, easing: (t) => 1 - Math.pow(1 - t, 4) });
    map.once('moveend', res);
    setTimeout(res, ms + 500);
  });
}

/* "Acquired" 크롭 — 축척이 안 보이는 탐지를 실제 z18 타일 크롭으로 병치한다.
   지도 정사영상은 저채도로 눌러 두고 이 크롭만 원본 채도다. */
let acqSeq = 0;
function centreOf(g) {
  let ring = g && g.coordinates;
  while (Array.isArray(ring) && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0];
  if (!Array.isArray(ring)) return null;
  if (typeof ring[0] === 'number') return ring;
  let x = 0, y = 0, n = 0;
  for (const c of ring) if (Array.isArray(c) && c.length >= 2) { x += c[0]; y += c[1]; n++; }
  return n ? [x / n, y / n] : null;
}
async function acquire(fc, row) {
  const el = $('#card-acq');
  const seq = ++acqSeq;
  el.hidden = true;
  // 사전 크롭이 있으면 그것을 먼저 쓴다 — 실 정사영상 z19 크롭이 라이브 스티칭보다 빠르고 선명하다.
  const pre = row && CROPS && (CROPS[CROP_KEY[row.id] || row.id] || [])[0];
  if (pre) {
    const img = new Image();
    img.onload = () => {
      if (seq !== acqSeq) return;
      const x = el.querySelector('canvas').getContext('2d');
      x.clearRect(0, 0, 132, 132);
      x.drawImage(img, 0, 0, 132, 132);
      el.querySelector('figcaption span').textContent = cropLabel(pre);
      el.hidden = false;
    };
    img.src = '../' + String(pre.file).replace(/^\.?\//, '');
    return;
  }
  const f = fc && (fc.features || [])[0];
  if (!f || !f.geometry) return;
  const c = centreOf(f.geometry);
  if (!c) return;
  const z = Math.min(18, v.maxzoom || 18);
  let cv = null;
  try { cv = await cropFromTiles(v.sat, c[0], c[1], z, 132, f.geometry); } catch (e) { cv = null; }
  if (!cv || seq !== acqSeq) return;
  const dst = el.querySelector('canvas').getContext('2d');
  dst.clearRect(0, 0, 132, 132);
  dst.drawImage(cv, 0, 0);
  el.querySelector('figcaption span').textContent =
    `${c[1].toFixed(4)} ${c[0].toFixed(4)}`;
  el.hidden = false;
}

/* ── 좌측 색인 — 13개 서비스, 실제 수치만 ────────────────── */
const MINISTRIES = [...new Set(SVC.map((s) => s.ministry))];
$('#atlas-n').textContent = `${SVC.length}종 · 부처 ${MINISTRIES.length}`;
$('#index').innerHTML = indexHTML(SVC, ROWS);
const idxEls = [...document.querySelectorAll('#index li')];
let hovered = null, hoveredSvc = null, selected = null;
idxEls.forEach((li) => {
  const id = li.dataset.id;
  li.addEventListener('pointerenter', () => { hoveredSvc = id; });
  li.addEventListener('pointerleave', () => { if (hoveredSvc === id) hoveredSvc = null; });
  li.addEventListener('focus', () => { hoveredSvc = id; });
  li.addEventListener('blur', () => { if (hoveredSvc === id) hoveredSvc = null; });
  const go = () => selectService(id);
  li.addEventListener('click', go);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});

// 스크린리더/키보드용 평면 목록 — 스크롤 연출에 갇히지 않게 한다.
const list = document.createElement('ul');
list.id = 'svc-list'; list.className = 'sr-only';
list.innerHTML = SVC.map((s) => {
  const rs = ROWS.filter((r) => r.service === s.id);
  const n = rs.reduce((a, r) => a + (r.count || 0), 0);
  return `<li><button type="button" data-id="${s.id}">${s.name} · ${s.ministry} · ${
    rs.length ? `실결과 ${fmt(n)}${rs[0].unit || ''}` : '실데이터 준비 중'} · 지도에서 열기</button></li>`;
}).join('');
$('#ui').appendChild(list);
list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) selectService(b.dataset.id); });

/* ── 4시점 필름스트립 + 흰 헤어라인 타임라인 ─────────────── */
const strip = $('#strip');
strip.innerHTML = EPOCHS.map((e, i) =>
  `<button type="button" data-i="${i}" aria-pressed="${i === 0}"><span>${e.label} · GSD ${e.gsd.toFixed(2)}cm</span></button>`).join('');
[...strip.children].forEach((b, i) => {
  b.addEventListener('click', () => { autoStarted = true; setEpoch(i); });
  thumbFromTiles(EPOCHS[i].id, AOI.namwon, 16, 300, 192).then((cv) => {
    cv.style.position = 'absolute'; cv.style.inset = '0';
    cv.style.width = '100%'; cv.style.height = '100%';
    b.insertBefore(cv, b.firstChild);
  });
});
const T0 = EPOCHS[0].date, T1 = EPOCHS[EPOCHS.length - 1].date;
$('#tl-ticks').innerHTML = EPOCHS.map((e) =>
  `<i class="ortho" data-e="${e.id}" style="left:${(((e.date - T0) / (T1 - T0)) * 100).toFixed(2)}%"></i>`).join('');
let epochIdx = 0;
function setEpoch(i, silent) {
  epochIdx = i;
  EPOCHS.forEach((e, j) => opT('o_' + e.id, j === i ? 1 : 0, 0.5));
  [...strip.children].forEach((b, j) => b.setAttribute('aria-pressed', String(j === i)));
  [...$('#tl-ticks').children].forEach((t, j) => t.classList.toggle('on', j === i));
  const k = (EPOCHS[i].date - T0) / (T1 - T0);
  $('#tl-fill').style.width = (k * 100).toFixed(2) + '%';
  $('#tl-head').style.left = (k * 100).toFixed(2) + '%';
  gsdOverride = EPOCHS[i].gsd.toFixed(2) + ' cm';
  epochDate = EPOCHS[i].label.replace('.', '-');
  if (!silent) swipe.hide();
}

/* 히어로 필름 — 미리 구운 실데이터 23초 필름(tools/film)이 있으면 궤도·구름 판의 바닥으로 깔고,
   없으면 라이브 지구본 그대로 간다. 있으면 "WebGL급 몰입"의 90%를 영상이 가져간다(벤치마크 §3).

   필름은 **재생하지 않고 스크럽한다**. 자유 재생하면 20초 뒤 필름은 지상을 날고 있는데
   캡션은 "고도 786 km" 라고 말하는 어긋남이 생긴다 — 한 대의 카메라라는 전제가 깨진다.
   필름의 0 → 6.0s 가 지구본 · 위성 · 성층운 돌파이고, 그것이 p 0 → 0.30 구간이다. */
const FILM_P = 0.30;    // 필름이 물러나고 라이브 지도가 카메라를 받는 스크롤 진행값
/* p → 필름 시간. 선형이 아니라 두 토막이다:
     ① 0 → 0.16   : 필름 0 → 3.5s   (지구본 · Sentinel-2 위성 통과)
     ② 0.16 → 0.30: 필름 4.4 → 6.0s (성층운 돌파 → 지표)
   3.5–4.4s 는 건너뛴다 — 그 구간의 프레임에는 globe → mercator 핸드오프 때
   비어 있던 타일이 검은 사각형으로 구워져 있다(필름은 다시 굽지 않는다). */
function filmTime(p) {
  return p < 0.16
    ? (p / 0.16) * 3.5
    : 4.4 + clamp01((p - 0.16) / 0.14) * 1.6;
}
let film = null;
if (optional.film) {
  const el = $('#hero-film');
  el.src = '../assets/proto/film/hero.mp4';
  el.hidden = false;
  el.removeAttribute('loop');
  el.addEventListener('loadeddata', () => {
    film = el;
    el.pause();
  }, { once: true });
  el.addEventListener('seeked', () => { filmSeeking = false; });
  el.load();
}
/* 스크럽은 매 프레임 다시 걸면 안 된다 — 탐색이 끝나기 전에 새 탐색이 들어오면
   디코더는 영원히 첫 프레임에 머문다(실제로 그렇게 됐다). 한 번에 하나만 건다.
   그리고 목표 시간에 lerp 0.12 로 따라붙는다 — 스크롤 지터가 그대로 프레임 점프가 되지 않게. */
let filmWant = -1, filmSeeking = false, filmAt = 0;
function scrubFilm(p) {
  if (!film) return;
  const on = p < FILM_P + 0.02;
  film.classList.toggle('on', on);
  if (!on) return;
  const target = filmTime(p);
  filmAt += (target - filmAt) * 0.12;
  if (Math.abs(target - filmAt) < 0.02) filmAt = target;
  if (filmSeeking || Math.abs(filmAt - filmWant) < 0.04) return;
  filmWant = filmAt;
  filmSeeking = true;
  try { film.currentTime = filmAt; } catch (e) { filmSeeking = false; }
}
// 스크린샷·딥링크는 따라붙을 시간이 없다 — 즉시 그 프레임에 선다.
function snapFilm(p) { filmAt = filmTime(p); }

/* 필름 → 라이브 지도 핸드오프.
   병렬 작업(landxi/proto/scrub/)이 레그별 종료 카메라를 담은 manifest 를 내놓으면,
   필름이 끝나는 그 카메라에서 라이브 지도가 이어받는다. 아직 없으면 camera.js 키프레임 그대로다. */
let FILM_HANDOFF = null;
if (optional.filmLegs) {
  fetch('../assets/proto/film/legs/manifest.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((m) => {
      const legs = m && (m.legs || m);
      const last = Array.isArray(legs) ? legs[legs.length - 1] : null;
      const cam = last && (last.endCamera || last.end || last.camera);
      if (cam && Array.isArray(cam.center)) FILM_HANDOFF = cam;
    })
    .catch(() => { /* 아직 없다 — 라이브 카메라가 그대로 간다 */ });
}

const tickMag = magnetic([...document.querySelectorAll('#cta a, #ah-cta a')]);
const tickCursor = makeCursor($('#cursor'), $('#cursor-ll'), map, (x, y) => plate.inside(x, y));

/* 내부 이동은 페이지 점프가 아니라 **같은 카메라의 스크롤 이동**이다(§5 규칙 4). */
document.querySelectorAll('[data-goto]').forEach((a) => {
  a.addEventListener('click', (e) => { e.preventDefault(); api.seek(+a.dataset.goto); });
});

/* 카피 리빌 — 줄 단위 clip-path 마스크(§4 모션). */
const cols = [...document.querySelectorAll('.col, #dhead, #atlas-head')].map((el) => ({
  el, lines: [...el.querySelectorAll('.ln')], shown: false,
}));
function showCol(el, on) {
  const c = cols.find((x) => x.el === el);
  if (!c || c.shown === on) return;
  c.shown = on;
  c.el.classList.toggle('on', on);
  c.lines.forEach((ln, i) => {
    ln.style.transitionDelay = on ? `${i * 60}ms` : '0ms';
    ln.firstElementChild.style.transitionDelay = on ? `${i * 60}ms` : '0ms';
    ln.classList.toggle('is-in', on);
  });
}

/* 챕터 룰러 */
$('#rl-ch').innerHTML = CHAPTERS.map((c) =>
  `<button type="button" style="left:${(c.at * 100).toFixed(2)}%" data-at="${c.at}"`
  + ` aria-label="${c.id}장 ${c.label} — ${c.ko}"><i></i></button>`).join('');
const railBtns = [...document.querySelectorAll('#rl-ch button')];
railBtns.forEach((b) => b.addEventListener('click', () => api.seek(+b.dataset.at)));

/* ── 9. 스크롤 → p ──────────────────────────────────────── */
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: TIER === 'still' ? 1 : 0.1, duration: 1.2, smoothWheel: TIER !== 'still' });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

let P = 0, PA = 0, throttleSince = 0;
ScrollTrigger.create({
  trigger: '#scroller', start: 'top top', end: 'bottom bottom',
  scrub: TIER !== 'still',
  onUpdate: (self) => { P = self.progress; },
});

/* ── 10. 장면 ───────────────────────────────────────────── */
const RES_A = 0.888, RES_B = 0.988;   // 결과 아틀라스 구간
let terrainOn = false, lastExag = 0, autoStarted = false;
let gsdOverride = '1.08 cm', epochDate = '2025-04', liveRow = -1, cardRow = null;
let camHold = false, holdP = 0;   // 서비스 선택 중에는 스크롤 카메라가 물러난다
let cardShown = null;             // 재생 헤드가 마지막으로 카드에 올린 서비스

// 가장 최근에 실행된 서비스 — 유휴 앰비언트가 이 하나만 호흡한다.
const NEWEST = SVC.slice().sort((a, b) => Date.parse(b.lastRun) - Date.parse(a.lastRun))[0];
const REAL_N = ROWS.reduce((a, r) => a + (r.count || 0), 0);
$('#atlas-foot').textContent = `수치가 있는 행만 실제 분석 결과다 — ${ROWS.length}건.`;

/* 판 위 지점 콜아웃 — B-Home 원판의 라벨. 서비스가 광고하는 수치가 아니라
   결과 아틀라스가 실제로 센 수치만 붙는다. 붙일 게 없으면 아무것도 안 붙는다. */
const PINS = (() => {
  const by = new Map();
  for (const s of SVC) {
    const rs = ROWS.filter((r) => r.service === s.id && r.count != null);
    if (!rs.length) continue;
    const n = rs.reduce((a, r) => a + r.count, 0);
    // 지명은 **그 서비스 지점에 가장 가까운 결과**의 것을 쓴다. 한 서비스가 여러 지역에
    // 결과를 가진 경우(드론 변화탐지 = 국산리 + 남원) 첫 행을 그냥 쓰면 라벨이 붙은 점과
    // 지명이 어긋난다 — 그건 지도 위의 거짓말이다.
    const near = rs.slice().sort((a, b) =>
      Math.hypot(a.camera.center[0] - s.lnglat[0], a.camera.center[1] - s.lnglat[1])
      - Math.hypot(b.camera.center[0] - s.lnglat[0], b.camera.center[1] - s.lnglat[1]))[0];
    // 가까이 선 서비스는 라벨 하나로 합친다 — 남원처럼 두 결과가 겹치는 곳에서
    // 흰 조각 두 장이 포개지면 판이 지저분해지고 어느 쪽도 읽히지 않는다(B 원판과 같은 처리).
    // 라벨이 서는 자리는 서비스 아이콘이 아니라 **결과가 실제로 있는 좌표**다.
    const at = near.camera.center;
    // 경계 반올림이 아니라 **근접 병합**이다 — 0.45° 안에 이미 선 라벨이 있으면 그 라벨에 합친다.
    let key = null;
    for (const [k, v] of by) {
      if (Math.hypot(v.ll[0] / v.k - at[0], v.ll[1] / v.k - at[1]) < 0.45) { key = k; break; }
    }
    if (key === null) key = `${at[0]},${at[1]}`;
    const g = by.get(key) || { place: near.place, ids: [], vals: [], mins: new Set(), ll: [0, 0], k: 0, top: 0 };
    g.ids.push(s.id);
    g.vals.push({ n, unit: near.unit || '건' });
    g.mins.add(MIN_ABBR[s.ministry] || s.ministry);
    g.ll = [g.ll[0] + at[0], g.ll[1] + at[1]];
    g.k += 1;
    if (n > g.top) { g.top = n; g.place = near.place; }
    by.set(key, g);
  }
  return [...by.values()]
    .map((g) => ({ ...g, ll: [g.ll[0] / g.k, g.ll[1] / g.k], vals: g.vals.sort((a, b) => b.n - a.n) }))
    .sort((a, b) => b.top - a.top);
})();
$('#pins').innerHTML = PINS.map((g) =>
  `<div class="pin" data-ids="${g.ids.join(' ')}">`
  + g.vals.map((v) => `<b>${fmt(v.n)}<u>${v.unit}</u></b>`).join('')
  + `<s>${g.place} · ${[...g.mins].join('·')}</s></div>`).join('');
const pinEls = [...document.querySelectorAll('#pins .pin')];

function layoutPins(on) {
  $('#pins').classList.toggle('on', on);
  if (!on) return;
  const r = plate.rect;
  const L = r[0], T = r[1], R = innerWidth - r[2], B = innerHeight - r[3];
  let shown = 0;
  pinEls.forEach((el, i) => {
    const g = PINS[i];
    const q = map.project(g.ll);
    // 판 밖으로 나간 라벨은 그리지 않는다 — 종이 위에 사진의 주석이 떠다니면 거짓말이 된다.
    const inside = shown < 3 && q.x > L + 46 && q.x < R - 46 && q.y > T + 52 && q.y < B - 14;
    el.style.display = inside ? '' : 'none';
    if (!inside) return;
    shown += 1;
    el.style.left = q.x.toFixed(1) + 'px';
    el.style.top = (q.y - 16).toFixed(1) + 'px';
    const foc = hoveredSvc || hovered || selected;
    el.classList.toggle('dim', !!foc && !g.ids.includes(foc));
  });
}

function applyAtlasChapter(p, now) {
  const on = p > 0.335 && p < 0.545;
  layoutPins(on);
  $('#atlas').classList.toggle('on', on);
  // 헤드라인 두 줄은 구름이 걷히는 그 프레임에 줄 마스크로 올라온다(§4 모션).
  showCol($('#atlas-head'), on);
  $('#card').classList.toggle('on', on || (p >= 0.545 && p < 0.57));
  if (!on) {
    setArcs([]);
    const l = p <= 0.335 ? 0 : (1 - seg(p, 0.545, 0.60));
    SVC.forEach((s) => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: l, ring: 0, dim: 1, hot: 0 }));
    return;
  }
  const q = seg(p, 0.345, 0.468);
  const d = new Date(headDate(q));
  $('#rl-r').textContent =
    `조사 이력 자동 재생 · ${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')} 기준`;

  // 유휴 앰비언트: 최근 실행 1건이 6s 주기로 호흡한다.
  const breath = 0.30 + 0.30 * (0.5 - 0.5 * Math.cos(now / 6000 * 6.2832));
  const arcs = [];
  SVC.forEach((s) => {
    const dq = q - s.q;
    const lit = clamp01(dq / 0.028);
    let ring = tri(dq, 0.085);
    if (s.real) ring = Math.max(ring, tri(dq - 0.13, 0.085));
    if (s.id === NEWEST.id && lit > 0.9) ring = Math.max(ring, breath);
    const hot = (hovered === s.id || hoveredSvc === s.id || selected === s.id) ? 1 : 0;
    const off = (hoveredSvc && hoveredSvc !== s.id) || (hovered && hovered !== s.id);
    map.setFeatureState({ source: 'svc', id: s.idx }, {
      lit, ring, hot, dim: off ? 0.22 : 1,
    });
    if (lit > 0.02) arcs.push({ s, k: clamp01(dq / 0.07) * (dq > 0.22 ? 0.32 : 1) });
  });
  idxEls.forEach((li) => {
    const s = SVC.find((x) => x.id === li.dataset.id);
    li.classList.toggle('on', !!s && q > s.q);
    li.classList.toggle('sel', li.dataset.id === selected);
  });
  $('#atlas').classList.toggle('focus', !!hoveredSvc);
  setArcs(TIER === 'full' ? arcs : arcs.slice(0, 5));

  /* 카드는 재생 헤드를 따라간다 — 방금 켜진 서비스가 그대로 FIG.02 가 된다.
     "5초 동안 아무것도 안 해도 실데이터 때문에 무언가 움직인다"(판정 규칙 2)를
     장식 애니메이션이 아니라 **조사 이력 날짜**로 만든다. */
  if (!selected) {
    const lit = SVC.filter((s) => q > s.q).sort((a, b) => b.q - a.q);
    // 실결과가 있는 서비스를 먼저 세운다 — 이 지면의 주인공은 결과이지 라인업이 아니다.
    // 셀 수 있는 탐지 결과가 있는 서비스를 먼저 세운다 — '2 시점' 같은 메타 수치를
    // 124px 통계 자리에 올리면 지면이 결과가 아니라 카탈로그로 읽힌다.
    const withRes = lit.find((s) => ROWS.some((r) => r.service === s.id && r.count >= 10))
      || lit.find((s) => ROWS.some((r) => r.service === s.id));
    const want = (withRes || lit[0] || SVC[0]).id;
    if (want !== cardShown) { cardShown = want; renderCard(want); }
  }
}

/* ── 결과 아틀라스 — 살아 있는 행 하나에 판이 도킹한다 ──── */
let rowSeq = 0;
async function goLive(i) {
  const seq = ++rowSeq;
  liveRow = i;
  const r = ROWS[i];
  hudCountVal = null;   // 이전 행의 탐지 수가 다음 행 캡션에 남지 않게 한다
  swipe.hide();
  detect.stop(); detect.unpin();
  clearRes();
  ORTHO_LAYERS.forEach((id) => opT(id, 0, 0.4));
  setGlow(null, 0);
  op('rain-3d', 0, 'fill-extrusion-opacity');
  $('#card-acq').hidden = true;
  // 우리 정사영상이 있는 지구는 우리 영상을 켠다.
  if (/^namwon-(farmland|greenhouse)/.test(r.id)) opT('o_namwon_city', 1, 0.6);
  if (r.id === 'jeju-illegal-2020') opT('o_jeju_2020', 1, 0.6);
  if (r.id === 'kuksan-2sortie') opT('o_kuksan_a68', 1, 0.6);
  if (r.id === 'namwon-change') opT('o_' + EPOCHS[epochIdx].id, 1, 0.6);
  await fly(r.camera, 1900);
  if (seq !== rowSeq) return;
  if (r.geojson) {
    try {
      const g = await loadJSON(r.geojson);
      if (seq !== rowSeq) return;
      const fc = { type: 'FeatureCollection', features: (g.features || []).filter((f) => f && f.geometry && (!r.filter || r.filter(f))) };
      const d = describe(fc);
      bake(fc, d);
      tintFeatures(fc, r);
      map.getSource('res0').setData(fc);
      map.getSource('res1').setData(centroids(fc));
      showRes(r);
      detect.play(fc, 'res0', 'res1');
      acquire(fc, r);
    } catch (e) { /* 결과 파일 없음 — 원본 영상만 둔다 */ }
  }
  if (r.swipe && TIER !== 'still') setTimeout(() => { if (seq === rowSeq) swipe.show(r.swipe); }, 900);
  if (r.id === 'namwon-greenhouse-2025') {
    await loadRain();
    if (seq !== rowSeq) return;
    op('rain-3d', 0.34, 'fill-extrusion-opacity');
    setGlow(glowRows, 0.9);
  }
}
function clearRes() {
  for (const [id, prop] of [['res0-3d', 'fill-extrusion-opacity'], ['res0-line', 'line-opacity'],
    ['res0-glow', 'line-opacity'], ['res0-dot', 'circle-opacity'], ['res1-dot', 'circle-opacity']]) op(id, 0, prop);
  op('res0-dot', 0, 'circle-stroke-opacity'); op('res1-dot', 0, 'circle-stroke-opacity');
}
function showRes(r) {
  try {
    map.setLayerZoomRange('res0-3d', 12.6, 24);
    map.setLayerZoomRange('res0-line', 13.2, 24);
    map.setLayerZoomRange('res1-dot', 0, 13.0);
  } catch (e) { /* noop */ }
  opT('res0-3d', 0.8, 0.6, 'fill-extrusion-opacity');
  opT('res0-line', 0.8, 0.6, 'line-opacity');
  opT('res0-glow', 0.34, 0.6, 'line-opacity');
  opT('res0-dot', 0.95, 0.6, 'circle-opacity');
  opT('res0-dot', 0.9, 0.6, 'circle-stroke-opacity');
  opT('res1-dot', 0.92, 0.6, 'circle-opacity');
  opT('res1-dot', 0.85, 0.6, 'circle-stroke-opacity');
}
// 행 슬라이더가 움직이면 지도 결과도 같은 임계로 필터한다(같은 프레임의 같은 값).
atlas.onCut((i, val) => {
  if (i !== liveRow) return;
  const f = ['>=', ['get', '_conf'], val];
  try {
    map.setFilter('res0-3d', f);
    map.setFilter('res0-line', f);
    map.setFilter('res0-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
    map.setFilter('res1-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
  } catch (e) { /* noop */ }
});

function applyResults(p) {
  const on = p > RES_A - 0.02;
  $('#results').classList.toggle('on', on);
  $('#results').hidden = !on;
  if (!on) { if (liveRow >= 0) { liveRow = -1; atlas.setLive(-1); } return; }
  const best = atlas.layout(seg(p, RES_A, RES_B));
  if (best >= 0 && best !== liveRow) { atlas.setLive(best); goLive(best); }
}
// 메뉴/판을 직접 누르면 그 데이터셋으로 스크롤이 옮겨 간다.
atlas.onPick((i) => api.seek(RES_A + (RES_B - RES_A) * (i / Math.max(1, ROWS.length - 1))));

/* ── 착지 · 필름스트립 ──────────────────────────────────── */
function applyLanding(p) {
  const on = p > 0.800 && p < RES_A - 0.01;
  $('#film').classList.toggle('on', on);
  $('#film').hidden = !on;
  if (on && !autoStarted && TIER !== 'still' && !api.suppressAuto) {
    autoStarted = true;
    EPOCHS.forEach((_, i) => setTimeout(() => {
      if (!autoStarted) return;
      setEpoch(i, true);
      if (i === EPOCHS.length - 1) setTimeout(() => {
        if (!autoStarted) return;
        setEpoch(0, true);
        swipe.show({ bdir: 'namwon_2510', bounds: AOI.namwon, z: 17, la: '2025.04', lb: '2025.10' });
      }, 1250);
    }, 420 + i * 1200));
  }
  if (!on && autoStarted && p < 0.79) { autoStarted = false; swipe.hide(); }
}

/* 타일 게이트 — 강하 구간에서 p 의 전진 속도를 제한한다. */
function baseReady() {
  const z = map.getZoom();
  const id = z < 13.2 ? 'eox' : 'vsat';
  try { return map.isSourceLoaded(id); } catch (e) { return true; }
}
let graceUntil = 0;
// 3단 강하 프로파일(Airbus 영상 해부): ① 가속 ② 최고속 ③ 감속 정착. 합계 ≈ 3,400ms.
const descentStep = (p) => (p < 0.62 ? 0.0009 : p < 0.72 ? 0.0016 : 0.0008);
function gate(now) {
  const inDescent = P > 0.545 && P < 0.815;
  if (!inDescent || P <= PA) {
    if (throttleSince) { throttleSince = 0; graceUntil = now + 260; $('#recv').hidden = true; }
    PA = P;
    return;
  }
  const ready = now < graceUntil || baseReady();
  if (ready) {
    if (throttleSince) { throttleSince = 0; graceUntil = now + 260; $('#recv').hidden = true; }
    PA = Math.min(P, PA + descentStep(PA));
    return;
  }
  if (!throttleSince) throttleSince = now;
  const stalled = now - throttleSince;
  $('#recv').hidden = stalled < 300;
  if (stalled > 12000) { PA = P; throttleSince = 0; graceUntil = now + 400; $('#recv').hidden = true; }
}

function setNight(p) {
  const el = $('#night');
  const a = 1 - seg(p, 0.13, 0.215);
  if (a <= 0.005 || !orbit) { el.style.opacity = '0'; return; }
  const tr = map.transform || {};
  const H = map.getCanvas().clientHeight || 800;
  const f = tr.cameraToCenterDistance || (0.5 * H / Math.tan(36.87 * D2R / 2));
  const R = (512 * Math.pow(2, map.getZoom())) / (2 * Math.PI * Math.cos(map.getCenter().lat * D2R));
  const r = f * R / Math.sqrt(Math.max(1, (f + R) * (f + R) - R * R));
  const s = orbit.state.sunScreen;
  const ang = Math.atan2(s.x, s.y) * 180 / Math.PI;
  const c = clamp01(0.5 - s.z * 0.5);
  el.style.width = el.style.height = (r * 2.08).toFixed(1) + 'px';
  el.style.left = `calc(50% + ${(orbit.state.offX || 0).toFixed(1)}px)`;
  el.style.top = `calc(50% + ${(orbit.state.offY || 0).toFixed(1)}px)`;
  el.style.opacity = (a * 0.95).toFixed(3);
  el.style.background = `linear-gradient(${ang.toFixed(1)}deg,`
    + ` rgba(0,3,12,.97) 0%,`
    + ` rgba(1,5,16,.95) ${(Math.max(0, c - 0.09) * 100).toFixed(1)}%,`
    + ` rgba(6,20,46,.55) ${(c * 100).toFixed(1)}%,`
    + ` rgba(14,32,66,.12) ${(Math.min(1, c + 0.055) * 100).toFixed(1)}%,`
    + ` rgba(20,40,80,0) ${(Math.min(1, c + 0.10) * 100).toFixed(1)}%)`;
}

/* 판 캡션 — FIG 번호 + 한 줄 설명 + 아래쪽 **지명 · 촬영일**(벤치마크 §4.6). */
const TODAY = new Date();
const NOW_STAMP = () => stamp(`${TODAY.getFullYear()}-${String(TODAY.getMonth() + 1).padStart(2, '0')}-${String(TODAY.getDate()).padStart(2, '0')}`);
const PLATE_FIG = [
  [0.000, 'FIG. 01', () => `SENTINEL-2 · 궤도 ${SAT.altKm} km`, () => '대한민국', () => NOW_STAMP()],
  [0.160, 'FIG. 01', () => '성층운 돌파 · 786 km → 8 km', () => '한반도 상공', () => NOW_STAMP()],
  // 판은 끝까지 FIG. 01 이다 — FIG. 02 는 우측 결과 카드가 쓴다(B-Home 원판의 번호 배분).
  [0.330, 'FIG. 01', () => `전국 · 서비스 ${SVC.length}종 · 실결과 ${ROWS.length}건`, () => '대한민국', () => '2025 — 2026'],
  [0.560, 'FIG. 03', () => 'V-World 정사영상 → LX 드론 정사영상', () => '남원 사매면 전북', () => stamp('2025-08-22')],
  [0.800, 'FIG. 03', () => `LX 드론 정사영상 · GSD ${gsdOverride}`, () => '남원 사매면 전북', () => stamp(epochDate + '-01')],
];
function figAt(p) {
  if (p >= RES_A - 0.005 && liveRow >= 0) {
    const r = ROWS[liveRow];
    return [r.fig, `${r.sensor} · ${r.title}`, r.place, stamp(r.shot)];
  }
  // 서비스를 고른 동안에는 판 캡션도 그 결과를 가리킨다 — 캡션과 카메라가 어긋나지 않는다.
  if (camHold && cardRow) return ['FIG. 01', `${cardRow.sensor} · ${cardRow.title}`, cardRow.place, stamp(cardRow.shot)];
  let out = PLATE_FIG[0];
  for (const row of PLATE_FIG) if (p >= row[0]) out = row;
  return [out[1], out[2](), out[3](), out[4]()];
}

function apply(p) {
  const now = performance.now();

  // 판 — 크기 변화가 곧 장면 전환이다.
  plate.update(p, p >= 0.895);
  const fg = figAt(p);
  plate.setFig(fg[0], fg[1]);
  if ($('#pc-a').textContent !== fg[2]) $('#pc-a').textContent = fg[2];
  if ($('#pc-b').textContent !== fg[3]) $('#pc-b').textContent = fg[3];
  // 결과 아틀라스에서는 각 판이 자기 캡션 바를 갖는다 — 전역 액자는 물러난다.
  $('#plate').classList.toggle('hide', p >= RES_A - 0.005);
  scrubFilm(p);
  document.documentElement.style.setProperty('--grain', TIER === 'full' ? '0.024' : '0.012');

  // 카메라. 결과 아틀라스 구간과 서비스 선택 중에는 flyTo 가 카메라를 가져간다.
  // (스크롤 카메라가 매 프레임 jumpTo 로 덮으면 클릭한 결과로 날아가다 말고 되돌아온다.)
  if (camHold && Math.abs(p - holdP) > 0.004) camHold = false;
  const camDriven = p < RES_A - 0.005 && !camHold;
  if (camDriven) {
    const c = cameraAt(p);
    const idle = (TIER === 'still') ? 0 : seg(p, 0.575, 0.62) * (1 - seg(p, 0.785, 0.805));
    const dLng = Math.sin(now / 4200) * 0.00042 * idle;
    const dLat = Math.cos(now / 5300) * 0.00026 * idle;
    map.jumpTo({
      center: [c.center[0] + dLng, c.center[1] + dLat], zoom: c.zoom, pitch: c.pitch,
      bearing: c.bearing + Math.sin(now / 7100) * 0.5 * idle,
      padding: plate.padding(),
    });
  }
  setProj(p < 0.258);
  ensureOverlay(!projGlobe && ((p > 0.31 && p < 0.57) || p >= RES_A - 0.02));

  // 지형은 DEM maxzoom(12) 근처까지만. 그 위에서는 드레이프 텍스처가 뭉개진다.
  const exag = TIER === 'full' && p > 0.588 && p < 0.72 ? 1.4 * (1 - seg(p, 0.662, 0.708)) : 0;
  const wantTerrain = exag > 0.02;
  if (wantTerrain !== terrainOn || (wantTerrain && Math.abs(exag - lastExag) > 0.035)) {
    terrainOn = wantTerrain; lastExag = exag;
    try { map.setTerrain(wantTerrain ? { source: 'dem2', exaggeration: exag } : null); } catch (e) { errors.push('terrain'); }
  }
  vis('hillshade', p > 0.24 && p < 0.73);

  /* 영상 처리 — 판 안쪽은 사진이다. 채도를 눌러 두고 색은 AI 결과에만 남긴다.
     다만 흰 종이 위의 판이므로 예전처럼 그림자를 뭉개지 않는다: 판이 그대로 어두운 사진이어야
     흰 종이와 대비가 생긴다(그것이 명암 교대를 대신한다). */
  op('vsat', p > 0.565 ? -0.35 : 0.06, 'raster-saturation');
  op('eox', p > 0.565 ? -0.30 : 0.10, 'raster-saturation');
  op('vsat', 1, 'raster-brightness-max');
  op('vsat', 0, 'raster-brightness-min');
  op('eox', 0, 'raster-brightness-min');
  for (const id of ORTHO_LAYERS) {
    op(id, 0.02, 'raster-brightness-min');
    op(id, 0.98, 'raster-brightness-max');
  }

  const silhouette = seg(p, 0.28, 0.355) * (1 - seg(p, 0.53, 0.59));
  op('coast-glow', 0.5 * silhouette, 'line-opacity');
  op('coast', 0.55 * silhouette, 'line-opacity');
  op('boundary', (0.16 + 0.30 * (1 - seg(p, 0.50, 0.60))) * seg(p, 0.31, 0.40), 'line-opacity');
  op('road-case', 0.72 * seg(p, 0.585, 0.69), 'line-opacity');
  op('road', 0.8 * seg(p, 0.585, 0.69) * (1 - 0.5 * seg(p, 0.77, 0.83)), 'line-opacity');
  op('label-sido', seg(p, 0.31, 0.39) * (1 - seg(p, 0.53, 0.59)), 'text-opacity');
  op('label-place', 0.92 * seg(p, 0.61, 0.71) * (1 - seg(p, 0.785, 0.825)), 'text-opacity');

  if (camDriven) {
    if (!autoStarted) {
      ORTHO_LAYERS.forEach((id) => op(id, 0));
      op('o_namwon_2504', seg(p, 0.725, 0.802));
    }
    op('o_namwon_city', 0);
    setGlow(null, 0);
    op('rain-3d', 0, 'fill-extrusion-opacity');
  }

  // 챕터 카피
  showCol($('#ch1'), p < 0.155);
  // 2장 카피는 이제 아틀라스 좌측 컬럼 안에 있다(B-Home 구도) — 구름 구간에는 활자가 없다.
  showCol($('#dhead'), p > 0.60 && p < 0.795);
  $('#dstrip').classList.toggle('on', p > 0.565 && p < 0.815);

  setNight(p);
  applyAtlasChapter(p, now);
  applyLanding(p);
  applyResults(p);

  // 유휴 앰비언트(착지 구간) — 최신 시점의 탐지 하나가 6초 주기로 호흡한다.
  if (p > 0.805 && p < RES_A - 0.02 && TIER !== 'still') {
    detect.pin([(AOI.namwon[0] + AOI.namwon[2]) / 2, (AOI.namwon[1] + AOI.namwon[3]) / 2],
      `남원 사매면 · GSD ${gsdOverride} · ${epochDate}`);
  } else if (p <= 0.805 || p >= RES_A - 0.02) detect.unpin();

  clouds.update(p);
  const spaceA = 1 - seg(p, 0.145, 0.235);
  $('#stars').style.opacity = spaceA.toFixed(3);
  $('#stars').style.transform = `scale(${(1 + p * 0.6).toFixed(3)}) rotate(${(p * 5).toFixed(2)}deg)`;
  if (orbit) orbit.update(map, SUN, TIER === 'full' ? (1 - seg(p, 0.14, 0.212)) : 0);

  let ci = 0;
  CHAPTERS.forEach((ch, i) => { if (p >= ch.at - 0.01) ci = i; });
  railBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === ci)));
  $('#rl-fill').style.width = (p * 100).toFixed(2) + '%';
  $('#rl-l').textContent = `0${CHAPTERS[ci].id} — ${CHAPTERS[ci].label}`;
  $('#ds-ch').textContent = `0${CHAPTERS[ci].id} — ${CHAPTERS[ci].label}`;
  if (!(p > 0.335 && p < 0.545)) {
    $('#rl-r').textContent =
      p < 0.16 ? `SENTINEL-2 · 저궤도 ${SAT.altKm} km`
        : p < 0.33 ? '성층운 돌파 · 고도 786 km → 8 km'
          : p < 0.80 ? `전북 남원시 · GSD ${gsdOverride} · ${epochDate}`
            : p < RES_A ? '남원 4시점 2025.04 → 2025.10 · 동일 좌표'
              : (liveRow >= 0 ? `${ROWS[liveRow].title} · ${ROWS[liveRow].when}` : '실제 분석 결과');
  }
  updateHUD(p);
}

/* ── 11. HUD — 모든 숫자가 해설이다 ─────────────────────── */
function updateHUD(p) {
  const t = KST();
  const c = map.getCenter();
  const z = map.getZoom();
  let txt;
  if (p >= RES_A - 0.02 && liveRow >= 0) {
    const r = ROWS[liveRow];
    const n = hudCountVal ? `${fmt(hudCountVal[0])} / ${fmt(hudCountVal[1])} 객체` : (r.count != null ? `${fmt(r.count)} ${r.unit}` : '2시점 원본');
    txt = `${r.title} · ${r.region} · ${n} · 기준 ${r.when}`;
  } else if (p < 0.16) {
    txt = `SENTINEL-2 · 고도 ${SAT.altKm} km · 한반도까지 ${orbit ? fmt(Math.round(orbit.state.distKm)) : '—'} km · KST ${t}`;
  } else if (p < 0.33) {
    txt = `SENTINEL-2 · 고도 ${SAT.altKm} km → 8 km · 성층운 돌파 · KST ${t}`;
  } else if (p < 0.565) {
    txt = `V-WORLD 정사영상 · ${SVC.length} 서비스 · 실결과 ${ROWS.length}건 ${fmt(REAL_N)}개체 · KST ${t}`;
  } else if (p < 0.80) {
    txt = `LX 드론 정사영상 · GSD ${gsdOverride} · 촬영 ${epochDate} · z${z.toFixed(1)}`;
  } else {
    txt = `남원 4시점 2025.04 → 2025.10 · GSD ${gsdOverride} · 동일 좌표 · KST ${t}`;
  }
  $('#meta-txt').textContent = txt;
  $('#ro-ll').textContent = `${c.lat.toFixed(5)} N  ${c.lng.toFixed(5)} E`;
  $('#ro-z').textContent = `z${z.toFixed(2)}`;
  $('#ro-gsd').textContent = `V-World 정사영상 → LX 드론 GSD ${gsdOverride}`;
  scaleBar(map, $('#scale-txt'), $('#scale-bar'));
}

/* ── 12. 서비스 ↔ 결과 매칭 — 이 페이지의 본문 ─────────────
   카드는 두 가지 방식으로 채워진다:
   (a) 조사 이력 자동 재생이 서비스를 하나씩 켤 때마다 그 서비스로 (유휴 앰비언트),
   (b) 색인 행을 누르면 그 서비스로 + 판의 카메라가 실제 결과 위로 난다. */
let selSeq = 0;

function renderCard(id) {
  const s = SVC.find((x) => x.id === id);
  if (!s) return null;
  const rows = ROWS.filter((r) => r.service === id);
  const card = $('#card');
  card.hidden = false;
  $('#card-sub').textContent = s.name;
  // 증거 크롭은 카드가 가리키는 결과의 것이어야 한다 — 앞 행의 크롭이 남으면 거짓말이 된다.
  acqSeq++;
  $('#card-acq').hidden = true;

  if (!rows.length) {
    $('#card-cap').textContent = `${s.ministry} · 최근 실행 ${s.lastRun}`;
    $('#card-title').textContent = s.name;
    $('#card-count').hidden = true;
    $('#card-rows').innerHTML =
      '<p class="rpend">실데이터 준비 중. 라인업이며 지도에 얹을 실제 결과가 아직 없다. 없는 것을 그리지 않는다.</p>';
    $('#card-prov').textContent = `실제 결과가 있는 서비스는 ${new Set(ROWS.map((r) => r.service)).size}종이다.`;
    cardRow = null;
    return null;
  }

  // 한 서비스에 결과가 여럿이면 **가장 크게 센 것**을 세운다 — 124px 통계 자리에
  // '2 시점' 같은 메타 수치가 올라가면 지면이 결과가 아니라 카탈로그로 읽힌다.
  const r = rows.slice().sort((a, b) => (b.count || 0) - (a.count || 0))[0];
  cardRow = r;
  acquire(null, r);
  $('#card-count').hidden = false;
  $('#card-cap').textContent = `${r.region} · ${r.sensor} · ${r.when}`;
  $('#card-title').textContent = r.title;
  develop($('#card-n'), r.count != null ? fmt(r.count) : '2');
  $('#card-unit').textContent = r.count != null ? r.unit : '시점';
  $('#card-rows').innerHTML = rowsHTML(r.classes, r.fixedMap)
    + (r.conf ? `<div class="ctl">
        <label for="rconf">신뢰도 임계값<output id="rconf-out">${r.conf.lo.toFixed(2)}</output></label>
        <input id="rconf" type="range" min="${r.conf.lo}" max="${r.conf.hi}" step="0.002" value="${r.conf.lo}">
        <canvas id="rhist"></canvas>
        <p class="n"><b id="rconf-n">${fmt(r.count)}</b> / ${fmt(r.count)} 표시 · 임계 이하는 지우지 않고 무채로 남긴다</p>
      </div>` : '')
    + (rows.length > 1 ? `<p class="caption rsub">이 서비스의 실결과 ${rows.length}건 — 결과 아틀라스에서 전부 본다.</p>` : '');
  $('#card-prov').textContent = r.prov;
  if (r.conf) drawHist($('#rhist'), r.conf.hist, r.conf.lo, null, r.conf.bins[0], r.conf.bins[r.conf.bins.length - 1]);
  return r;
}

// 결과 폴리곤의 색은 지도와 구운 판에서 같아야 한다(Roboflow 체크리스트 #14).
function tintFeatures(fc, r) {
  if (!r.fixed && !r.clsMap) return;
  for (const f of fc.features) {
    const p = f.properties || {};
    const cls = p.cls != null ? p.cls : p.class;
    p._color = r.fixed || (r.clsMap && r.clsMap[cls]) || p._color;
  }
}

async function selectService(id) {
  const s = SVC.find((x) => x.id === id);
  if (!s) return;
  const seq = ++selSeq;
  selected = id;
  hudCountVal = null;
  camHold = true; holdP = PA;
  idxEls.forEach((li) => li.classList.toggle('sel', li.dataset.id === id));
  detect.stop(); detect.unpin(); swipe.hide(); clearRes();
  $('#card-acq').hidden = true;
  ORTHO_LAYERS.forEach((l) => opT(l, 0, 0.4));
  const r = renderCard(id);

  if (!r) { await fly({ center: s.lnglat, zoom: 8.6, pitch: 42, bearing: -10 }, 1600); return; }
  await fly(r.camera, 2000);
  if (seq !== selSeq || !r.geojson) return;
  try {
    const g = await loadJSON(r.geojson);
    if (seq !== selSeq) return;
    const fc = { type: 'FeatureCollection', features: (g.features || []).filter((f) => f && f.geometry && (!r.filter || r.filter(f))) };
    const d = describe(fc);
    bake(fc, d);
    tintFeatures(fc, r);
    map.getSource('res0').setData(fc);
    map.getSource('res1').setData(centroids(fc));
    showRes(r);
    wireCardConf(r, fc);
    detect.play(fc, 'res0', 'res1');
    acquire(fc, r);
  } catch (e) { /* noop */ }
}

function wireCardConf(r, fc) {
  const sl = $('#rconf');
  if (!sl || !r.conf) return;
  const out = $('#rconf-out'), cv = $('#rhist'), nEl = $('#rconf-n');
  const apply = () => {
    const val = +sl.value;
    out.textContent = val.toFixed(3);
    const f = ['>=', ['get', '_conf'], val];
    try {
      map.setFilter('res0-3d', f);
      map.setFilter('res0-line', f);
      map.setFilter('res0-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
      map.setFilter('res1-dot', ['all', ['==', ['geometry-type'], 'Point'], f]);
    } catch (e) { /* noop */ }
    let c = 0;
    for (const ft of fc.features) if ((ft.properties._conf != null ? ft.properties._conf : 1) >= val) c++;
    nEl.textContent = fmt(c);
    drawHist(cv, r.conf.hist, val, null, r.conf.bins[0], r.conf.bins[r.conf.bins.length - 1]);
  };
  sl.addEventListener('input', apply);
  requestAnimationFrame(apply);
}

map.on('mousemove', 'svc-dot', (e) => {
  hovered = e.features[0] && e.features[0].properties.id;
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'svc-dot', () => { hovered = null; map.getCanvas().style.cursor = ''; });
map.on('click', 'svc-dot', (e) => { const f = e.features[0]; if (f) selectService(f.properties.id); });

addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    let i = CHAPTERS.findIndex((c) => P < c.at - 0.004);
    if (i < 0) i = CHAPTERS.length;
    api.seek(CHAPTERS[e.key === 'ArrowRight' ? Math.min(CHAPTERS.length - 1, i) : Math.max(0, i - 2)].at);
  }
});

/* ── 13. 루프 + 자동 강등 ───────────────────────────────── */
let frames = 0, fpsT0 = performance.now(), fps = 0, graded = false;
function loop() {
  requestAnimationFrame(loop);
  frames++;
  const now = performance.now();
  if (now - fpsT0 > 800) {
    fps = frames / ((now - fpsT0) / 1000);
    frames = 0; fpsT0 = now;
    $('#tier').textContent = `tier ${TIER} · ${fps.toFixed(0)} fps`;
    const warmBusy = warmTotal && warmDone < warmTotal * 0.92 && now - T_BOOT < 26000;
    if (!graded && !warmBusy && now - T_BOOT > 6500) {
      graded = true;
      if (fps < 24 && TIER === 'full') {
        TIER = 'lite';
        try { map.setTerrain(null); } catch (e) { /* noop */ }
        terrainOn = false;
        $('#orbit3d').style.display = 'none';
      }
    }
  }
  gate(now);
  apply(PA);
  tickCursor(); tickMag();
}

/* ── 14. 공개 API ───────────────────────────────────────── */
const api = {
  seek(p) {
    P = clamp01(p);
    snapFilm(P);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    lenis.scrollTo(P * max, { immediate: true, force: true, lock: true });
    ScrollTrigger.update();
    P = PA = clamp01(p);
    throttleSince = 0;
    $('#recv').hidden = true;
    apply(PA);
  },
  suppressAuto: false,
  get terrain() { return { on: terrainOn, exag: lastExag }; },
  set(p) { P = PA = clamp01(p); snapFilm(PA); apply(PA); },
  setRaw(p) { P = clamp01(p); },
  ramp(from, to, sec) {
    return new Promise((res) => {
      P = PA = clamp01(from);
      const o = { v: from };
      gsap.to(o, { v: to, duration: sec, ease: 'none', onUpdate: () => { P = o.v; }, onComplete: res });
    });
  },
  demo(sec = 30) {
    return new Promise((res) => {
      const o = { v: 0 };
      P = PA = 0; autoStarted = false; apply(0);
      gsap.to(o, { v: 1, duration: sec, ease: 'none', onUpdate: () => { P = o.v; }, onComplete: res });
    });
  },
  open: selectService, select: selectService,
  close() { $('#card').classList.remove('on'); selected = null; idxEls.forEach((li) => li.classList.remove('sel')); },
  rows: ROWS, atlas, plate,
  get filmAt() { return film ? film.currentTime : null; },
  get handoff() { return FILM_HANDOFF; },
  get p() { return PA; }, get raw() { return P; }, get warm() { return [warmDone, warmTotal]; },
  get fps() { return fps; }, get tier() { return TIER; }, get live() { return liveRow; },
  get errors() { return errors.slice(); },
  map, swipe,
};
window.__dive = api;

const T_BOOT = performance.now();
setEpoch(0, true);
await PRE.finish();
loop();
setTimeout(prewarmDescent, 1200);
document.body.dataset.ready = '1';
