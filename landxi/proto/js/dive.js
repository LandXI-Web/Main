import { resolveVWorld, EOX as EOX_TPL, DEM as DEM_TPL } from './sources.js';
import { buildStyle, AOI, ORTHO_LAYERS } from './style.js';
import { cameraAt, CHAPTERS } from './camera.js';
import { makeClouds } from './clouds.js';
import { makeOrbit, SAT } from './orbit.js';
import { subsolar, KST } from './sun.js';
import { SVC, HQ, EPOCHS, headDate, dateToQ, initServices, loadJSON, ringsToLines } from './layers.js';
import { makeSwipe } from './swipe.js';
import { makeStories } from './stories.js';
import { makeDetect } from './detect.js';
import { makeVecCard } from './veccard.js';
import { filaments } from './results.js';
import { lerp, clamp01, fmt, makeCursor, magnetic, scaleBar, thumbFromTiles, develop, cropFromTiles } from './hud.js';

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

/* ── 2. 프리로더 — 진행률은 실제 타일 수신량이다 ───────── */
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
  `© V-World · 국토교통부${v.keyed ? ' WMTS' : ''} | Sentinel-2 cloudless © EOX | © Mapterhorn | OpenFreeMap © OpenMapTiles · OpenStreetMap | 정사영상 · 탐지 © LX 한국국토정보공사`;

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

// 실제 해안선 · 시도 경계 (링 → 라인)
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

// 병렬 작업물이 도착했을 때만 켜지는 선택 레이어.
// 존재 확인을 404 로 하면 콘솔 오류가 남으므로 서버의 assets.json 목록을 쓴다.
const optional = { change: false, satellite: false, clouds: false, results: false };
let RESULTS = [];
const assetsReady = (async () => {
  try {
    const a = await (await fetch('assets.json', { cache: 'no-store' })).json();
    Object.assign(optional, a);
    if (a.change) {
      const g = await loadJSON('../assets/data/geo/namwon-change.geojson');
      if (g.features && g.features.length) {
        map.getSource('change').setData(g); data.change = g;
        map.setFilter('change-3d', ['==', ['get', 'pair'], '2504-2510']);
        map.setFilter('change-edge', ['==', ['get', 'pair'], '2504-2510']);
        const n = g.features.filter((f) => f.properties.pair === '2504-2510').length;
        $('#cp5-sub').textContent = `4시점 정사영상 2025.04 → 2025.10 · 변화 지수(비지도) ${fmt(n)}건 · 동일 좌표`;
      }
      else optional.change = false;
    }
    if (a.results) {
      try {
        const m = await import('../../assets/data/results.js');
        RESULTS = m.RESULTS || m.default || [];
      } catch (e) { optional.results = false; }
    }
  } catch (e) { /* 정적 호스팅 등 — 전부 없는 것으로 본다 */ }
  return optional;
})();
const data = { debris: { type: 'FeatureCollection', features: [] }, change: { type: 'FeatureCollection', features: [] }, conf: [], gridConf: [], bins: new Array(50).fill(0) };
const dataReady = (async () => {
  try {
    const [deb, grid, jj] = await Promise.all([
      loadJSON('../assets/data/geo/marine-debris.geojson'),
      loadJSON('../assets/data/geo/marine-debris-grid.geojson'),
      loadJSON('../assets/data/geo/jeju-illegal.geojson'),
    ]);
    // coordinates 가 null 인 피처가 117건 있다 — 그대로 넣으면 MapLibre 가 매 타일마다 경고를 낸다.
    deb.features = deb.features.filter((f) => f.geometry && Array.isArray(f.geometry.coordinates) && f.geometry.coordinates.length);
    data.debris = deb;
    data.conf = deb.features.map((f) => f.properties.confidence);
    // count/mean_conf 가 null 인 격자 2개가 있다 — 넣으면 표현식 평가 경고가 난다.
    grid.features = grid.features.filter((f) => f.properties.count != null && f.properties.mean_conf != null);
    data.gridConf = grid.features.map((f) => f.properties.mean_conf);
    for (const c of data.conf) data.bins[Math.min(49, Math.max(0, Math.floor((c - 0.5) * 100)))]++;
    map.getSource('det').setData(deb);
    map.getSource('grid').setData(grid);
    map.getSource('jeju_det').setData(jj);
  } catch (e) { errors.push('data: ' + e.message); }
})();

/* ── 5b. 강하 경로 타일 프리워밍 ────────────────────────
   챕터 4 강하는 z8.5 → z18 을 3초 만에 통과한다. 그 사이 V-World/DEM 타일이 도착하지 못하면
   MapLibre 가 저줌 타일을 확대해 덮으므로 "1.5cm 까지"를 말하는 화면이 뭉개진 텍스처가 된다.
   그래서 챕터 3(전국 점등) 동안 네트워크가 한가할 때 강하 키프레임 경로의 타일을 미리 받아둔다.
   Image() 와 MapLibre 는 같은 HTTP 캐시를 쓰므로 그대로 캐시 히트가 된다. */
const lon2tx = (l, z) => Math.floor((l + 180) / 360 * Math.pow(2, z));
const lat2ty = (a, z) => Math.floor((1 - Math.log(Math.tan(a * D2R) + 1 / Math.cos(a * D2R)) / Math.PI) / 2 * Math.pow(2, z));
const fill = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);

// 프리워밍 대상은 손으로 찍지 않고 **카메라 트랙에서 직접 뽑는다**.
// 중심을 눈대중으로 넣으면 이징 때문에 실제 경로와 어긋나 하나도 안 맞는다(실측).
// MapLibre 는 256px 소스에 대해 z = round(mapZoom + 1) 타일을 요청한다.
function prewarmURLs() {
  const out = [];
  const push = (tpl, z, x, y, r) => {
    for (let i = x - r; i <= x + r; i++) for (let j = y - r; j <= y + r; j++) out.push(fill(tpl, z, i, j));
  };
  for (let q = 0.545; q <= 0.806; q += 0.005) {
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
  const LANES = 6;   // 지도 자신의 요청을 완전히 굶기지 않는 선
  const next = () => {
    if (i >= urls.length) return;
    const u = urls[i++];
    const img = new Image();
    img.onload = img.onerror = () => { warmDone++; next(); };
    img.src = u;
  };
  for (let k = 0; k < LANES; k++) next();
}

/* ── 5c. 데이터 레인 (비닐하우스) ───────────────────────── */
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
    let n = 0;
    for (const f of g.features) n += Number(f.properties.nobj) || 0;
    $('#rain-note').innerHTML =
      `<b>비닐하우스 ${fmt(n)}동</b> · ${fmt(fil.features.length)}필지 · 남원시 전역 · 높이 = 동수`;
  } catch (e) { rainLoaded = false; }
}

/* ── 6. 투영 전환 + deck.gl 아크 ────────────────────────── */
let projGlobe = true;
function setProj(wantGlobe) {
  if (wantGlobe === projGlobe) return;
  projGlobe = wantGlobe;
  try { map.setProjection({ type: wantGlobe ? 'globe' : 'mercator' }); } catch (e) { errors.push('proj'); }
}

// deck 오버레이는 mercator 구간에서만 붙인다(globe 에서 deck 이 예외를 던진다).
let overlay = null, arcSig = '';
function ensureOverlay(on) {
  if (on && !overlay) {
    overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay); arcSig = ''; glowSig = '';
  } else if (!on && overlay) {
    try { map.removeControl(overlay); } catch (e) { /* noop */ }
    overlay = null; arcSig = ''; glowSig = ''; arcLayer = null; glowLayer = null;
  }
}
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
let arcLayer = null, glowLayer = null, glowSig = '';
function syncDeck() {
  if (!overlay) return;
  overlay.setProps({ layers: [arcLayer, glowLayer].filter(Boolean) });
}
/* 가산 혼합 발광 — 겹칠수록 밝아진다. kepler 의 `Layer Blending: additive` 가 근거다.
   9,664동을 폴리곤이 아니라 **빛의 밀도**로 먼저 보여준다. 어두운 바닥(3악장)에서만 성립. */
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

/* ── 7. 궤도 · 성층운 · 태양 ────────────────────────────── */
const orbit = TIER === 'full' ? makeOrbit($('#orbit3d'), assetsReady) : null;
const clouds = makeClouds($('#sky'), assetsReady);
let SUN = subsolar();
setInterval(() => { SUN = subsolar(); }, 60000);
// 별밭 — 3개 시차 레이어. 정지된 우주는 "위젯"으로 읽힌다(자체비평 #12).
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
const sizeAll = () => {
  orbit && orbit.resize(innerWidth, innerHeight, Math.min(1.5, devicePixelRatio || 1));
  drawStars();
};
addEventListener('resize', sizeAll); sizeAll();

/* ── 8. UI ──────────────────────────────────────────────── */
const els = { panel: $('#result'), cap: $('#res-cap'), title: $('#res-title'),
  count: $('#res-n'), unit: $('#res-unit'), meta: $('#res-meta'), ctl: $('#res-ctl'), foot: $('#res-foot') };
const swipe = makeSwipe(map, $('#swipe'));
// 탐지 이벤트 오버레이 — HUD 카운트업까지 여기서 구동한다.
let hudCountVal = null;
const detect = makeDetect(map, $('#fx'), (n, total) => { hudCountVal = [n, total]; });
const veccard = TIER === 'full' ? makeVecCard(map, $('#veccard')) : null;

function fly(cam, ms) {
  return new Promise((res) => {
    if (TIER === 'still') { map.jumpTo(cam); return res(); }
    map.easeTo({ ...cam, duration: ms, easing: (t) => 1 - Math.pow(1 - t, 4) });
    map.once('moveend', res);
    setTimeout(res, ms + 500);
  });
}

/* "Acquired" 크롭 — 축척이 안 보이는 탐지를 실제 z18 타일 크롭으로 병치한다.
   지도 정사영상은 저채도로 눌러 두고 이 크롭만 원본 채도다: AI 가 본 곳에서만 색이 산다. */
let acqSeq = 0;
function centreOf(g) {
  let ring = g.coordinates;
  while (Array.isArray(ring) && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0];
  if (!Array.isArray(ring)) return null;
  if (typeof ring[0] === 'number') return ring;
  let x = 0, y = 0, n = 0;
  for (const c of ring) if (Array.isArray(c) && c.length >= 2) { x += c[0]; y += c[1]; n++; }
  return n ? [x / n, y / n] : null;
}
async function acquire(fc) {
  const el = $('#acq');
  const seq = ++acqSeq;
  el.hidden = true;
  const f = fc && (fc.features || [])[0];
  if (!f || !f.geometry) return;
  const c = centreOf(f.geometry);
  if (!c) return;
  const z = Math.min(18, v.maxzoom || 18);
  let cv = null;
  try { cv = await cropFromTiles(v.sat, c[0], c[1], z, 252, f.geometry); } catch (e) { cv = null; }
  if (!cv || seq !== acqSeq || mode !== 'explore') return;
  const dst = $('#acq-cv').getContext('2d');
  dst.clearRect(0, 0, 252, 252);
  dst.drawImage(cv, 0, 0);
  $('#acq-ll').textContent =
    `${c[1].toFixed(4)} ${c[0].toFixed(4)} · conf ${(f.properties._conf || 0).toFixed(2)}`;
  el.hidden = false;
}

const stories = makeStories({
  map, els, data, fly, swipe, optional, detect, veccard, acquire,
  get results() { return RESULTS; },
  op: (id, val, prop) => opT(id, val, 0.45, prop),
  onHud(h) { hudCtx = h; },
  onEpoch(i) { gsdOverride = EPOCHS[i].gsd.toFixed(2) + ' cm'; epochDate = EPOCHS[i].label.replace('.', '-'); },
});

const MINISTRIES = [...new Set(SVC.filter((s) => !/^LX/.test(s.ministry)).map((s) => s.ministry))];
// 카피의 숫자는 services.js 에서 직접 센다 — 데이터가 바뀌면 문장도 같이 바뀐다.
const REAL_N = SVC.filter((s) => s.real).reduce((a, s) => a + s.count, 0);
$('#cp3-sub').textContent =
  `${MINISTRIES.length}개 부처 · ${SVC.length}개 서비스 · 실탐지 ${fmt(REAL_N)}건 · 기준 2026-08`;
$('#fig-sub').textContent = `대한민국 · ${SVC.length}개 서비스 · 조사 이력 2025-04 → 2026-08`;

// 부처 색인 — 유리 칩이 아니라 헤어라인 행. 호버는 4px 이동(색만 바뀌면 실패).
$('#index').innerHTML = MINISTRIES.map((m, i) => {
  const n = SVC.filter((s) => s.ministry === m).length;
  return `<li data-m="${m}"><span class="n">${String(i + 1).padStart(2, '0')}</span>`
    + `<span class="m">${m}</span><span class="c">${n}</span></li>`;
}).join('');
const chipEls = [...document.querySelectorAll('#index li')];
// 색인 행은 장식이 아니다 — 호버하면 그 부처만 남기고 나머지를 감쇠시키고(Palantir 디밍),
// 누르면 그 부처의 첫 실데이터 서비스가 지도 위에 열린다.
let hoveredMin = null;
chipEls.forEach((li) => {
  const m = li.dataset.m;
  const first = SVC.find((x) => x.ministry === m && x.real) || SVC.find((x) => x.ministry === m);
  li.tabIndex = 0;
  li.setAttribute('role', 'button');
  li.setAttribute('aria-label', `${m} — ${first ? first.name : ''} 결과 열기`);
  li.addEventListener('pointerenter', () => { hoveredMin = m; });
  li.addEventListener('pointerleave', () => { if (hoveredMin === m) hoveredMin = null; });
  li.addEventListener('focus', () => { hoveredMin = m; });
  li.addEventListener('blur', () => { if (hoveredMin === m) hoveredMin = null; });
  const go = () => { if (first) openStory(first.id); };
  li.addEventListener('click', go);
  li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
});

const tlTicks = $('#rl-tl');
tlTicks.innerHTML = [
  ...EPOCHS.map((e) => `<i class="ortho" style="left:${(dateToQ(e.date) * 100).toFixed(2)}%"></i>`),
  ...SVC.map((s) => `<i data-s="${s.id}" style="left:${(dateToQ(Date.parse(s.lastRun)) * 100).toFixed(2)}%"></i>`),
].join('');
const tickEls = Object.fromEntries(SVC.map((s) => [s.id, tlTicks.querySelector(`[data-s="${s.id}"]`)]));

$('#rl-ch').innerHTML = CHAPTERS.map((c) =>
  `<button type="button" style="left:${(c.at * 100).toFixed(2)}%" data-at="${c.at}"`
  + ` aria-label="${c.id}장 ${c.label} — ${c.ko}"><i></i></button>`).join('');
const railBtns = [...document.querySelectorAll('#rl-ch button')];
railBtns.forEach((b) => b.addEventListener('click', () => api.seek(+b.dataset.at)));

const list = document.createElement('ul');
list.id = 'svc-list'; list.className = 'sr-only';
list.innerHTML = SVC.map((s) =>
  `<li><button type="button" data-id="${s.id}">${s.name} · ${s.ministry} · ${fmt(s.count)}${s.unit} · 지도에서 결과 열기</button></li>`).join('');
$('#ui').appendChild(list);
list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openStory(b.dataset.id); });

// 카피 리빌은 글자 블러가 아니라 **줄 단위 clip-path 마스크**다(Vantor 4.3).
const cps = [...document.querySelectorAll('.cp')].map((el) => ({
  el, lines: [...el.querySelectorAll('.ln')], sub: el.querySelector('.caption'),
  in: +el.dataset.in, out: +el.dataset.out, shown: false,
}));
// 통계 — 124px 숫자가 글자별로 현상된다. 한 화면에 하나씩.
const sts = [...document.querySelectorAll('.st')].map((el) => ({
  el, num: el.querySelector('.stat'), txt: el.querySelector('.stat').textContent,
  sub: el.querySelector('.caption'), in: +el.dataset.in, out: +el.dataset.out, shown: false,
}));

const strip = $('#strip');
strip.hidden = false;
strip.innerHTML = EPOCHS.map((e, i) =>
  `<button type="button" data-i="${i}" aria-pressed="${i === 0}"><span>${e.label} · GSD ${e.gsd.toFixed(2)}cm</span></button>`).join('');
[...strip.children].forEach((b, i) => {
  b.addEventListener('click', () => { autoStarted = true; stories.setEpoch(i); });
  thumbFromTiles(EPOCHS[i].id, AOI.namwon, 16, 224, 156).then((cv) => {
    cv.style.position = 'absolute'; cv.style.inset = '0';
    b.insertBefore(cv, b.firstChild);
  });
});

const tickMag = magnetic([...document.querySelectorAll('#cta a')]);
const tickCursor = makeCursor($('#cursor'), $('#cursor-ll'), map);

/* ── 9. 스크롤 → p ──────────────────────────────────────── */
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: TIER === 'still' ? 1 : 0.1, duration: 1.2, smoothWheel: TIER !== 'still' });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

let P = 0;     // 스크롤 원본
let PA = 0;    // 실제 적용값 — 타일이 못 따라오면 전진 속도를 제한한다
let throttleSince = 0;
ScrollTrigger.create({
  trigger: '#scroller', start: 'top top', end: 'bottom bottom',
  scrub: TIER !== 'still',
  onUpdate: (self) => { P = self.progress; },
});

/* ── 10. 장면 ───────────────────────────────────────────── */
let mode = 'scroll', terrainOn = false, lastExag = 0, scanned = false, autoStarted = false, hovered = null;
let gsdOverride = '1.54 cm', epochDate = '2025-08', hudCtx = null;

/* 3악장 — 디센트(검정) · 아틀라스(밝음) · 옵서버토리(어두움).
   경계는 그라디언트 없이 **한 프레임에 칼로 자른다**. 명암이 교대하는 것 자체가 연출이다
   (취향 벤치마크 §6.1 · "단조롭다 = 명암이 교대하지 않는 것"). */
const FLIP_IN = 0.262;    // 성층운 화이트아웃 정점 — 페이지 전체가 흑 → 백으로 뒤집힌다
const FLIP_OUT = 0.792;   // 착지 = 증명 악장 — 다시 흑으로. 분석은 어두운 바닥 위 발광이다.
let movement = '';
function setGrade(p) {
  const mv = mode === 'explore' ? 'obs' : (p < FLIP_IN ? 'desc' : (p < FLIP_OUT ? 'atlas' : 'obs'));
  const light = mv === 'atlas';
  if (mv !== movement) {
    movement = mv;
    document.body.dataset.movement = mv;
    document.body.dataset.colorway = light ? 'light' : 'dark';
    $('#brand').firstElementChild.src =
      light ? '../assets/brand/landxi-wordmark.png' : '../assets/brand/landxi-wordmark-dark.png';
  }
  // 아틀라스 판 — 전국 챕터에서만. 강하 챕터는 정사영상이 밝으므로 스크림 없이 간다.
  $('#paper').classList.toggle('on', !light ? false : p < 0.556);
  $('#atlas').classList.toggle('on', light && p < 0.556);
  const dark = 1 - seg(p, 0.24, 0.40);
  const g = document.documentElement.style;
  g.setProperty('--temp', dark > 0.5 ? '#8FB4F0' : '#FFE9C6');
  g.setProperty('--temp-a', (0.10 + dark * 0.20).toFixed(3));
  g.setProperty('--grain', String(TIER === 'full' ? (0.022 + dark * 0.026).toFixed(3) : 0.014));
  $('#grade').style.background = light ? 'none'
    : `radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) ${(42 + dark * 9).toFixed(0)}%, rgba(1,1,2,${(0.24 + dark * 0.3).toFixed(3)}) 100%)`;
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
  el.style.background = `linear-gradient(${ang.toFixed(1)}deg,` +
    ` rgba(0,3,12,.97) 0%,` +
    ` rgba(1,5,16,.95) ${(Math.max(0, c - 0.09) * 100).toFixed(1)}%,` +
    ` rgba(6,20,46,.55) ${(c * 100).toFixed(1)}%,` +
    ` rgba(14,32,66,.12) ${(Math.min(1, c + 0.055) * 100).toFixed(1)}%,` +
    ` rgba(20,40,80,0) ${(Math.min(1, c + 0.10) * 100).toFixed(1)}%)`;
}

// 텍스트 리빌 — clip-path 라인 마스크 1000ms, 줄당 60ms 스태거(취향 프로필 §4 모션).
function applyCopy(p, force) {
  cps.forEach((c) => {
    const inn = !force && p >= c.in && p <= c.out;
    if (inn === c.shown) return;
    c.shown = inn;
    c.el.classList.toggle('on', inn);
    c.lines.forEach((ln, i) => {
      ln.style.transitionDelay = inn ? `${i * 60}ms` : '0ms';
      ln.firstElementChild.style.transitionDelay = inn ? `${i * 60}ms` : '0ms';
      ln.classList.toggle('is-in', inn);
    });
    if (c.sub) {
      c.sub.style.transition = 'opacity var(--v3-d1) var(--v3-ease)';
      c.sub.style.transitionDelay = inn ? `${c.lines.length * 60 + 260}ms` : '0ms';
      c.sub.style.opacity = inn ? '1' : '0';
    }
  });
}

// 통계 — 124px 숫자가 글자별 42ms 스태거로 현상된다. 화면당 하나.
function applyStats(p, force) {
  sts.forEach((t) => {
    const inn = !force && p >= t.in && p <= t.out && mode === 'scroll';
    if (inn === t.shown) return;
    t.shown = inn;
    t.el.classList.toggle('on', inn);
    if (inn) develop(t.num, t.txt);
    else t.num.dataset.dev = '';
  });
}

// 가장 최근에 실행된 서비스 — 유휴 앰비언트가 이 하나만 호흡한다(화면당 움직이는 요소 1개).
const NEWEST = SVC.slice().sort((a, b) => Date.parse(b.lastRun) - Date.parse(a.lastRun))[0];

function applyChapter2(p, now) {
  const on = p > 0.33 && p < 0.556;
  // kepler 식 어두운 유리 시간 스크러버 — 밝은 아틀라스 위에 얹는 유일한 유리 예외.
  $('#ruler').classList.toggle('tl', on);
  $('#rl-tl').classList.toggle('on', on);
  if (!on) {
    setArcs([]);
    const l = p <= 0.33 ? 0 : (1 - seg(p, 0.556, 0.61));
    SVC.forEach((s) => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: l, ring: 0, dim: 1, hot: 0 }));
    return;
  }
  const q = seg(p, 0.345, 0.528);
  const d = new Date(headDate(q));
  $('#rl-mark').style.left = (q * 100).toFixed(2) + '%';
  $('#rl-r').textContent =
    `조사 이력 자동 재생 · ${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')} 기준`;

  // 유휴 앰비언트: 최근 실행 1건이 6s 주기로 호흡한다(주기 ≥6s · 위상 고정).
  const breath = 0.30 + 0.30 * (0.5 - 0.5 * Math.cos(now / 6000 * 6.2832));
  const arcs = [], litMin = new Set();
  SVC.forEach((s) => {
    const dq = q - s.q;
    const lit = clamp01(dq / 0.028);
    let ring = tri(dq, 0.085);
    if (s.real) ring = Math.max(ring, tri(dq - 0.13, 0.085));
    if (s.id === NEWEST.id && lit > 0.9) ring = Math.max(ring, breath);
    const off = (hovered && hovered !== s.id) || (hoveredMin && s.ministry !== hoveredMin);
    map.setFeatureState({ source: 'svc', id: s.idx }, {
      lit, ring, hot: (hovered === s.id || hoveredMin === s.ministry) ? 1 : 0,
      dim: off ? 0.22 : 1,
    });
    if (tickEls[s.id]) tickEls[s.id].classList.toggle('on', lit > 0.5);
    if (lit > 0.02) { litMin.add(s.ministry); arcs.push({ s, k: clamp01(dq / 0.07) * (dq > 0.22 ? 0.32 : 1) }); }
  });
  chipEls.forEach((c) => c.classList.toggle('on', litMin.has(c.dataset.m)));
  $('#atlas').classList.toggle('focus', !!hoveredMin);
  setArcs(TIER === 'full' ? arcs : arcs.slice(0, 5));
}

function applyChapter45(p) {
  const on = p > 0.795;
  strip.style.opacity = on ? '1' : '0';
  strip.style.pointerEvents = on ? 'auto' : 'none';
  $('#cta').hidden = p < 0.945;
  if (on && !autoStarted && TIER !== 'still' && !api.suppressAuto) {
    autoStarted = true;
    // Palantir 방식 재생: 각 시점 1.2s 정지 후 마지막에 멈추고 비교 커튼으로 넘긴다.
    const PAIR_OF = [null, '2504-2506', '2506-2508', '2508-2510'];
    EPOCHS.forEach((_, i) => setTimeout(() => {
      if (stories.current || !autoStarted) return;
      stories.setEpoch(i, true);
      if (optional.change) stories.setPair(PAIR_OF[i] || '2504-2506');
      if (i === EPOCHS.length - 1) setTimeout(() => {
        if (stories.current || !autoStarted) return;
        stories.setEpoch(0, true);
        stories.setPair('2504-2510');
        swipe.show({ bdir: 'namwon_2510', bounds: AOI.namwon, z: 17, la: '2025.04', lb: '2025.10' });
      }, 1250);
    }, 420 + i * 1200));
  }
  if (!on && autoStarted && p < 0.78) { autoStarted = false; swipe.hide(); }
}

// 타일이 도착하지 못하면 강하 구간에서 p 의 전진 속도를 제한한다.
// 완전히 멈추지는 않는다(정지는 버그로 읽힌다) — 프레임당 0.0009 로 기어가며 타일을 기다린다.
// areTilesLoaded() 는 모든 소스를 보므로 강하 중엔 항상 false 다. 그 줌에서 화면을 책임지는
// 소스 하나만 본다: z<13 은 EOX(빠르고 이음매 없음), z≥13 은 V-World.
function baseReady() {
  const z = map.getZoom();
  const id = z < 13.2 ? 'eox' : 'vsat';
  try { return map.isSourceLoaded(id); } catch (e) { return true; }
}
let graceUntil = 0;
// 강하 구간 최소 소요시간 — 스크롤을 아무리 빨리 굴려도 z6.8→z18.2 를 3초 안에 통과하지 못한다.
// (a) 연출상 이 구간이 이 페이지의 하이라이트이고, (b) 뷰포트가 천천히 변해야 타일 큐가 비워진다.
// 3단 강하 프로파일(Airbus 영상 해부 §장치 1): ① 가속 ② 최고속 ③ 감속 정착. 합계 ≈ 3,300ms.
const descentStep = (p) => (p < 0.60 ? 0.0018 : p < 0.72 ? 0.0030 : 0.0014);
function gate(now) {
  const inDescent = P > 0.47 && P < 0.84;
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
  // **완전히 멈춘다.** 조금씩 기어가면 매 프레임 타일 세트가 바뀌어 큐가 영원히 비지 않는다(실측).
  // 카메라를 세워야 MapLibre 가 큐를 비우고, 비는 순간 바로 풀린다.
  if (!throttleSince) throttleSince = now;
  const stalled = now - throttleSince;
  $('#recv').hidden = stalled < 300;
  if (stalled > 12000) { PA = P; throttleSince = 0; graceUntil = now + 400; $('#recv').hidden = true; }
}

function apply(p) {
  const now = performance.now();
  if (mode === 'explore') {
    setGrade(0.95); updateHUD(p); clouds.update(-1);
    $('#rl-l').textContent = '탐사 — 분석 결과';
    $('#rl-r').textContent = (hudCtx && hudCtx.line) || '';
    $('#night').style.opacity = '0'; $('#stars').style.opacity = '0';
    orbit && orbit.update(map, SUN, 0);
    // 옵서버토리 — 어두운 바닥 위 발광 데이터. 영상은 눌러 두고 색은 결과에만 남긴다.
    op('vsat', -0.42, 'raster-saturation'); op('eox', -0.35, 'raster-saturation');
    op('vsat', 0.72, 'raster-brightness-max'); op('eox', 0.72, 'raster-brightness-max');
    for (const id of ORTHO_LAYERS) { op(id, 0, 'raster-brightness-min'); op(id, 0.66, 'raster-brightness-max'); }
    $('#readout').classList.add('on');
    return;
  }

  const c = cameraAt(p);
  // 유휴 드리프트 — 강하·착지 구간에서 카메라가 아주 느리게 흐른다(주기 26s).
  // 좌표 판독이 실제로 갱신되므로 "실데이터에 묶인 앰비언트"가 된다.
  const idle = (TIER === 'still') ? 0 : seg(p, 0.556, 0.60) * (1 - seg(p, 0.775, 0.795));
  const dLng = Math.sin(now / 4200) * 0.00042 * idle;
  const dLat = Math.cos(now / 5300) * 0.00026 * idle;
  const padL = Math.round(
    Math.min(innerWidth * 0.26, 460) * (1 - seg(p, 0.15, 0.30))
    + 544 * seg(p, 0.30, 0.352) * (1 - seg(p, 0.545, 0.60)));
  map.jumpTo({ center: [c.center[0] + dLng, c.center[1] + dLat], zoom: c.zoom, pitch: c.pitch,
    bearing: c.bearing + Math.sin(now / 7100) * 0.5 * idle,
    padding: { left: padL, top: 56, right: 0, bottom: 78 } });
  setProj(p < 0.255);
  ensureOverlay(!projGlobe && ((p > 0.30 && p < 0.56) || p > 0.928));

  // 지형은 DEM maxzoom(12) 근처까지만 켠다.
  // 그 위에서는 MapLibre 가 지형 메시에 드레이프한 텍스처를 확대해 쓰기 때문에
  // **영상만 뭉개지고 라벨은 선명한** 특유의 스미어가 생긴다(실측 A/B 확인).
  // 그래서 z13 부근에서 과장을 0 으로 부드럽게 눕힌 뒤 끈다 — 시각적 튐이 없다.
  const exag = TIER === 'full' && p > 0.578 ? 1.4 * (1 - seg(p, 0.652, 0.698)) : 0;
  const wantTerrain = exag > 0.02;
  if (wantTerrain !== terrainOn || (wantTerrain && Math.abs(exag - lastExag) > 0.035)) {
    terrainOn = wantTerrain; lastExag = exag;
    try { map.setTerrain(wantTerrain ? { source: 'dem2', exaggeration: exag } : null); } catch (e) { errors.push('terrain'); }
  }
  vis('hillshade', p > 0.235 && p < 0.72);
  // 선택적 채도 — 강하 이후(정사영상 구간)에는 베이스 영상도 눌러 둔다.
  op('vsat', p > 0.556 ? -0.42 : 0.06, 'raster-saturation');
  op('eox', p > 0.556 ? -0.35 : 0.10, 'raster-saturation');
  op('vsat', p > FLIP_OUT ? 0.74 : 1, 'raster-brightness-max');
  // 강하 구간은 활자가 영상 위에 직접 얹힌다 — 그림자를 들어올려 밝은 판으로 만든다.
  const liftBase = (p > 0.50 && p < FLIP_OUT) ? 0.30 : 0;
  op('vsat', liftBase, 'raster-brightness-min');
  op('eox', liftBase, 'raster-brightness-min');
  // 밝은 아틀라스 악장(강하)은 그림자를 들어올려 검은 활자가 읽히게,
  // 어두운 옵서버토리 악장(증명)은 눌러서 흰 활자와 발광 데이터가 읽히게 한다.
  for (const id of ORTHO_LAYERS) {
    op(id, p > FLIP_OUT ? 0 : 0.30, 'raster-brightness-min');
    op(id, p > FLIP_OUT ? 0.62 : 1, 'raster-brightness-max');
  }

  const silhouette = seg(p, 0.275, 0.35) * (1 - seg(p, 0.525, 0.585));
  op('coast-glow', 0.5 * silhouette, 'line-opacity');
  op('coast', 0.55 * silhouette, 'line-opacity');
  op('boundary', (0.16 + 0.30 * (1 - seg(p, 0.50, 0.60))) * seg(p, 0.30, 0.39), 'line-opacity');
  op('road-case', 0.72 * seg(p, 0.575, 0.68), 'line-opacity');
  op('road', 0.8 * seg(p, 0.575, 0.68) * (1 - 0.5 * seg(p, 0.76, 0.82)), 'line-opacity');
  op('label-sido', seg(p, 0.30, 0.38) * (1 - seg(p, 0.525, 0.585)), 'text-opacity');
  op('label-place', 0.92 * seg(p, 0.60, 0.70) * (1 - seg(p, 0.775, 0.815)), 'text-opacity');
  for (const l of ['grid-3d', 'grid-dim', 'det-3d', 'det-dim', 'jeju-det-3d']) op(l, 0, 'fill-extrusion-opacity');
  const chg = optional.change ? seg(p, 0.855, 0.905) : 0;
  const chgOut = 1 - seg(p, 0.930, 0.952);
  op('change-3d', 0.58 * chg * chgOut, 'fill-extrusion-opacity');
  op('change-edge', 0.75 * chg * chgOut, 'line-opacity');
  $('#change-legend').hidden = !(optional.change && p > 0.862 && p < 0.94);

  if (!autoStarted) {
    ORTHO_LAYERS.forEach((id) => op(id, 0));
    op('o_namwon_2508', seg(p, 0.715, 0.792));
  }
  // 피날레: 한 필지 → 남원시 전역. 시 전체 정사영상 위로 비닐하우스 데이터 레인이 솟는다.
  const city = seg(p, 0.935, 0.968);
  op('o_namwon_city', city);
  if (city > 0.02 && !rainLoaded) loadRain();
  op('rain-3d', 0.34 * seg(p, 0.945, 0.982), 'fill-extrusion-opacity');
  // 밀도를 먼저, 개체를 나중에 — 가산 발광이 9,664동을 빛의 밀도로 보여준다.
  setGlow(p > 0.93 ? glowRows : null, seg(p, 0.940, 0.980));
  $('#rain-note').hidden = p < 0.955;

  setGrade(p); setNight(p); applyCopy(p); applyStats(p); applyChapter2(p, now); applyChapter45(p);
  $('#readout').classList.toggle('on', p > 0.556 && p < 0.938);

  // 5장 유휴 앰비언트 — 가장 최신 시점의 탐지 하나가 6초 주기로 호흡한다.
  if (p > 0.80 && p < 0.93 && TIER !== 'still') {
    detect.pin([(AOI.namwon[0] + AOI.namwon[2]) / 2, (AOI.namwon[1] + AOI.namwon[3]) / 2],
      `남원 사매면 · GSD ${gsdOverride} · ${epochDate}`);
  }
  else if (p <= 0.80 || p >= 0.93) detect.unpin();

  if (!scanned && p > 0.795 && TIER !== 'still') {
    scanned = true;
    gsap.fromTo($('#scan'), { top: '-40vh', opacity: 0.9 },
      { top: '105vh', opacity: 0, duration: 0.8, ease: 'power1.in' });
  }
  if (p < 0.74) scanned = false;

  clouds.update(p);
  const spaceA = 1 - seg(p, 0.14, 0.225);
  $('#stars').style.opacity = spaceA.toFixed(3);
  $('#stars').style.transform = `scale(${(1 + p * 0.6).toFixed(3)}) rotate(${(p * 5).toFixed(2)}deg)`;
  if (orbit) orbit.update(map, SUN, TIER === 'full' ? (1 - seg(p, 0.135, 0.205)) : 0);

  let ci = 0;
  CHAPTERS.forEach((ch, i) => { if (p >= ch.at - 0.01) ci = i; });
  railBtns.forEach((b, i) => b.setAttribute('aria-current', String(i === ci)));
  $('#rl-fill').style.width = (p * 100).toFixed(2) + '%';
  $('#rl-l').textContent = `0${CHAPTERS[ci].id} — ${CHAPTERS[ci].label}`;
  if (!(p > 0.33 && p < 0.556)) {
    $('#rl-r').textContent =
      p < 0.19 ? 'SENTINEL-2 · 저궤도 786 km'
      : p < 0.33 ? '성층운 돌파 · 고도 786 km → 8 km'
      : p < 0.792 ? `전북 남원시 · GSD ${gsdOverride} · ${epochDate}`
      : '남원 4시점 · 2025.04 → 2025.10 · 동일 좌표';
  }
  updateHUD(p);
}

/* ── 11. HUD — 모든 숫자가 실제 값 ──────────────────────── */
/* HUD 는 캡션 한 줄이다. 모서리 스티커를 쓰지 않는다.
   모든 값은 해설이어야 한다 — 단위·범위·기준시점이 없는 장식 숫자는 여기 오지 않는다
   (판정 규칙 9. '태양 직하점 10.9°' 는 그래서 삭제했다). */
function updateHUD(p) {
  const t = KST();
  const c = map.getCenter();
  const z = map.getZoom();
  let txt;
  if (mode === 'explore') {
    const h = hudCtx || {};
    const n = hudCountVal ? `${fmt(hudCountVal[0])} / ${fmt(hudCountVal[1])} 객체` : (h.v2 || '');
    txt = [h.line || 'LX AI 분석 결과', n, h.v3 ? `기준 ${h.v3}` : ''].filter(Boolean).join(' · ');
  } else if (p < 0.19) {
    txt = `SENTINEL-2 · 고도 ${SAT.altKm} km · 한반도까지 ${orbit ? fmt(Math.round(orbit.state.distKm)) : '—'} km · KST ${t}`;
  } else if (p < 0.33) {
    txt = `SENTINEL-2 · 고도 ${SAT.altKm} km → 8 km · 성층운 돌파 · KST ${t}`;
  } else if (p < 0.556) {
    txt = `V-WORLD 정사영상 · ${MINISTRIES.length}개 부처 ${SVC.length}개 서비스 · 실탐지 ${fmt(REAL_N)}건 · KST ${t}`;
  } else if (p < 0.792) {
    txt = `LX 드론 정사영상 · GSD ${gsdOverride} · 촬영 ${epochDate} · z${z.toFixed(1)}`;
  } else {
    txt = `남원 4시점 2025.04 → 2025.10 · GSD ${gsdOverride} · 동일 좌표 · KST ${t}`;
  }
  $('#meta-txt').textContent = txt;
  $('#ro-ll').textContent = `${c.lat.toFixed(5)} N  ${c.lng.toFixed(5)} E`;
  $('#ro-z').textContent = `z${z.toFixed(2)} · ${epochDate}`;
  scaleBar(map, $('#scale-txt'), $('#scale-bar'));
}

/* ── 12. 탐사 모드 ──────────────────────────────────────── */
function openStory(id) {
  mode = 'explore';
  lenis.stop();
  autoStarted = false;
  applyCopy(0, true);
  $('#ruler').classList.remove('tl');
  $('#rl-tl').classList.remove('on');
  $('#paper').classList.remove('on');
  $('#atlas').classList.remove('on');
  applyStats(0, true);
  strip.style.opacity = STORY_IS_NAMWON(id) ? '1' : '0';
  strip.style.pointerEvents = STORY_IS_NAMWON(id) ? 'auto' : 'none';
  $('#cta').hidden = true;
  $('#change-legend').hidden = true;
  $('#rain-note').hidden = true;
  $('#recv').hidden = true;
  document.body.dataset.panel = '1';
  setArcs([]);
  ORTHO_LAYERS.forEach((l) => op(l, 0));
  SVC.forEach((s) => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: 0, ring: 0, dim: 1, hot: 0 }));
  vis('hillshade', true);
  op('road-case', 0.7, 'line-opacity'); op('road', 0.82, 'line-opacity');
  op('boundary', 0.24, 'line-opacity'); op('coast', 0, 'line-opacity'); op('coast-glow', 0, 'line-opacity');
  op('label-place', 0.92, 'text-opacity'); op('label-sido', 0.85, 'text-opacity');
  try { map.setTerrain(null); } catch (e) { /* noop */ }
  terrainOn = false;
  hudCtx = null; hudCountVal = null;
  detect.stop(); veccard && veccard.hide();
  // 결과 패널이 우측 400px 을 덮는다 — 카메라 중심을 남은 프레임 가운데로 옮긴다.
  map.easeTo({ padding: { left: 0, top: 56, right: 400, bottom: 78 }, duration: 600 });
  dataReady.then(() => stories.enter(id));
}
const STORY_IS_NAMWON = (id) => id === 'pothole';

function closeStory() {
  mode = 'scroll';
  delete document.body.dataset.panel;
  hudCountVal = null;
  detect.stop(); veccard && veccard.hide();
  stories.exit();
  lenis.start();
  const c = cameraAt(0.44);
  map.easeTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing, duration: 1500, easing: (t) => 1 - Math.pow(1 - t, 3) });
  setTimeout(() => api.seek(0.44), 1520);
}
$('#res-back').addEventListener('click', closeStory);

map.on('mousemove', 'svc-dot', (e) => {
  hovered = e.features[0] && e.features[0].properties.id;
  map.getCanvas().style.cursor = 'pointer';
});
map.on('mouseleave', 'svc-dot', () => { hovered = null; map.getCanvas().style.cursor = ''; });
map.on('click', 'svc-dot', (e) => { const f = e.features[0]; if (f) openStory(f.properties.id); });

addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && mode === 'explore') { closeStory(); return; }
  if (mode !== 'scroll') return;
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
    if (mode === 'explore') closeStory();
    P = clamp01(p);
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
  // 프레임 단위 촬영용 — p 를 직접 세팅한다(rAF 루프가 다음 프레임에 반영).
  set(p) { P = PA = clamp01(p); if (mode === 'scroll') apply(PA); },
  // 실제 스크롤처럼 원본 p 만 밀어 넣는다(타일 게이트가 그대로 작동한다).
  setRaw(p) { P = clamp01(p); },
  ramp(from, to, sec) {
    return new Promise((res) => {
      P = PA = clamp01(from);
      const o = { v: from };
      gsap.to(o, { v: to, duration: sec, ease: 'none', onUpdate: () => { P = o.v; }, onComplete: res });
    });
  },
  // 데모/영상 촬영용 — 스크롤 대신 p 를 직접 시간으로 흘린다.
  demo(sec = 30) {
    return new Promise((res) => {
      if (mode === 'explore') closeStory();
      const o = { v: 0 };
      P = PA = 0; scanned = false; autoStarted = false; apply(0);
      gsap.to(o, { v: 1, duration: sec, ease: 'none', onUpdate: () => { P = o.v; }, onComplete: res });
    });
  },
  open: openStory, close: closeStory, ready: dataReady,
  get p() { return PA; }, get raw() { return P; }, get warm() { return [warmDone, warmTotal]; },
  get fps() { return fps; }, get tier() { return TIER; },
  get errors() { return errors.slice(); },
  map, stories, swipe,
};
window.__dive = api;

const T_BOOT = performance.now();
await PRE.finish();
loop();
// 궤도 챕터는 EOX z0–4 만 쓰므로 네트워크가 한가하다. 이때 강하 경로 타일을 미리 받아둔다.
setTimeout(prewarmDescent, 1200);
document.body.dataset.ready = '1';
