import { resolveVWorld } from './sources.js';
import { buildStyle, AOI, ORTHO_LAYERS } from './style.js';
import { cameraAt, CHAPTERS } from './camera.js';
import { makeClouds } from './clouds.js';
import { makeOrbit, SAT } from './orbit.js';
import { subsolar, KST } from './sun.js';
import { SVC, HQ, EPOCHS, headDate, dateToQ, initServices, loadJSON, ringsToLines } from './layers.js';
import { makeSwipe } from './swipe.js';
import { makeStories } from './stories.js';
import { lerp, clamp01, fmt, splitChars, makeCursor, magnetic, scaleBar, thumbFromTiles } from './hud.js';

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
  localIdeographFontFamily: "'Gothic A1','IBM Plex Sans KR',sans-serif",
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
    map.addControl(overlay); arcSig = '';
  } else if (!on && overlay) {
    try { map.removeControl(overlay); } catch (e) { /* noop */ }
    overlay = null; arcSig = '';
  }
}
const rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function setArcs(rows) {
  if (!overlay) return;
  const sig = rows.map((r) => r.s.id + r.k.toFixed(2)).join('|');
  if (sig === arcSig) return;
  arcSig = sig;
  overlay.setProps({
    layers: rows.length ? [new deck.ArcLayer({
      id: 'lx-arcs', data: rows,
      getSourcePosition: () => HQ,
      getTargetPosition: (d) => d.s.lnglat,
      getSourceColor: (d) => [...rgb(d.s.hex), Math.round(16 + 130 * d.k)],
      getTargetColor: (d) => [...rgb(d.s.hex), Math.round(30 + 200 * d.k)],
      getWidth: (d) => 0.7 + 2.4 * d.k,
      getHeight: 0.42, widthMinPixels: 1, widthMaxPixels: 4,
    })] : [],
  });
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
const els = { panel: $('#result'), min: $('#res-min'), title: $('#res-title'), meta: $('#res-meta'), ctl: $('#res-ctl'), foot: $('#res-foot') };
const swipe = makeSwipe(map, $('#swipe'));

function fly(cam, ms) {
  return new Promise((res) => {
    if (TIER === 'still') { map.jumpTo(cam); return res(); }
    map.easeTo({ ...cam, duration: ms, easing: (t) => 1 - Math.pow(1 - t, 4) });
    map.once('moveend', res);
    setTimeout(res, ms + 500);
  });
}

const stories = makeStories({
  map, els, data, fly, swipe, optional,
  get results() { return RESULTS; },
  op: (id, val, prop) => opT(id, val, 0.45, prop),
  onHud(h) { hudCtx = h; },
  onEpoch(i) { gsdOverride = EPOCHS[i].gsd.toFixed(2) + ' cm'; epochDate = EPOCHS[i].label.replace('.', '-'); },
});

const MINISTRIES = [...new Set(SVC.filter((s) => !/^LX/.test(s.ministry)).map((s) => s.ministry))];
// 카피의 숫자는 services.js 에서 직접 센다 — 데이터가 바뀌면 문장도 같이 바뀐다.
$('#cp3-sub').textContent =
  `${MINISTRIES.length}개 부처 · ${SVC.length}개 서비스 · 실탐지 ${fmt(SVC.filter((s) => s.real).reduce((a, s) => a + s.count, 0))}건`;
$('#chips').innerHTML = MINISTRIES.map((m) => `<li data-m="${m}"><i></i>${m}</li>`).join('');
const chipEls = [...document.querySelectorAll('#chips li')];

const tlTicks = $('#tl-ticks');
tlTicks.innerHTML = [
  ...EPOCHS.map((e) => `<i class="ortho" style="left:${(dateToQ(e.date) * 100).toFixed(2)}%"></i>`),
  ...SVC.map((s) => `<i data-s="${s.id}" style="left:${(dateToQ(Date.parse(s.lastRun)) * 100).toFixed(2)}%"></i>`),
].join('');
const tickEls = Object.fromEntries(SVC.map((s) => [s.id, tlTicks.querySelector(`[data-s="${s.id}"]`)]));

$('#rail').innerHTML = CHAPTERS.map((c) =>
  `<button type="button" data-at="${c.at}" aria-label="${c.id}장 ${c.label} — ${c.ko}"><i></i></button>`).join('');
const railBtns = [...document.querySelectorAll('#rail button')];
railBtns.forEach((b) => b.addEventListener('click', () => api.seek(+b.dataset.at)));

const list = document.createElement('ul');
list.id = 'svc-list'; list.className = 'sr-only';
list.innerHTML = SVC.map((s) =>
  `<li><button type="button" data-id="${s.id}">${s.name} · ${s.ministry} · ${fmt(s.count)}${s.unit} · 지도에서 결과 열기</button></li>`).join('');
$('#ui').appendChild(list);
list.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) openStory(b.dataset.id); });

const cps = [...document.querySelectorAll('.cp')].map((el) => ({
  el, chars: splitChars(el.querySelector('h1')), sub: el.querySelector('p'),
  in: +el.dataset.in, out: +el.dataset.out, shown: false,
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

const tickMag = magnetic([...document.querySelectorAll('.mag')]);
const tickCursor = makeCursor($('#cursor'), $('#cursor-ll'), map);

/* ── 9. 스크롤 → p ──────────────────────────────────────── */
gsap.registerPlugin(ScrollTrigger);
const lenis = new Lenis({ lerp: TIER === 'still' ? 1 : 0.1, duration: 1.2, smoothWheel: TIER !== 'still' });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

let P = 0;
ScrollTrigger.create({
  trigger: '#scroller', start: 'top top', end: 'bottom bottom',
  scrub: TIER !== 'still',
  onUpdate: (self) => { P = self.progress; },
});

/* ── 10. 장면 ───────────────────────────────────────────── */
let mode = 'scroll', terrainOn = false, scanned = false, autoStarted = false, hovered = null;
let gsdOverride = '1.54 cm', epochDate = '2025-08', hudCtx = null;

const LIGHT_STORY = new Set(['pothole', 'change', 'farmland']);
function setGrade(p) {
  // 색온도 이행: 챕터 1 새벽(5600K) → 챕터 4 정오. 밝기 반전은 실제 배경 밝기에 맞춘다 —
  // 위성영상 구간(p<0.75)은 어두우므로 계속 다크 UI 로 간다.
  const dark = 1 - seg(p, 0.24, 0.40);
  const light = mode === 'explore' ? LIGHT_STORY.has(stories.current) : p > 0.755;
  document.body.classList.toggle('is-light', light);
  const g = document.documentElement.style;
  g.setProperty('--temp', dark > 0.5
    ? 'linear-gradient(180deg,#8FB4F0 0%,#2B4682 100%)'
    : 'linear-gradient(180deg,#FFEBCC 0%,#F3DCB4 100%)');
  g.setProperty('--temp-a', (0.11 + dark * 0.23).toFixed(3));
  g.setProperty('--grain', String(TIER === 'full' ? (0.024 + dark * 0.028).toFixed(3) : 0.016));
  g.setProperty('--scrim', light
    ? 'radial-gradient(115% 105% at 0% 100%, rgba(247,251,255,.88) 0%, rgba(247,251,255,.46) 38%, rgba(247,251,255,0) 70%)'
    : 'radial-gradient(115% 105% at 0% 100%, rgba(2,8,20,.82) 0%, rgba(2,8,20,.40) 38%, rgba(2,8,20,0) 70%)');
  $('#brand').firstElementChild.src =
    light ? '../assets/brand/landxi-wordmark.png' : '../assets/brand/landxi-wordmark-dark.png';
  $('#grade').style.background =
    `radial-gradient(ellipse at 50% 46%, rgba(0,0,0,0) ${(42 + dark * 9).toFixed(0)}%, rgba(2,8,20,${(0.22 + dark * 0.3).toFixed(3)}) 100%)`;
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

function applyCopy(p, force) {
  cps.forEach((c) => {
    const inn = !force && p >= c.in && p <= c.out;
    if (inn && !c.shown) {
      c.shown = true;
      gsap.set(c.el, { opacity: 1 });
      gsap.fromTo(c.chars, { y: 20, filter: 'blur(12px)', opacity: 0 },
        { y: 0, filter: 'blur(0px)', opacity: 1, duration: 0.8, ease: 'power2.out', stagger: { each: 0.03, from: 'random' } });
      gsap.fromTo(c.sub, { opacity: 0, y: 10 },
        { opacity: 1, y: 0, duration: 0.55, ease: 'power2.out', delay: 0.42 });
    } else if (!inn && c.shown) {
      c.shown = false;
      gsap.to(c.el, { opacity: 0, duration: 0.4, ease: 'power2.in' });
      gsap.to(c.chars, { y: -22, filter: 'blur(9px)', duration: 0.4, ease: 'power2.in' });
    }
  });
}

function applyChapter2(p) {
  const on = p > 0.30 && p < 0.545;
  $('#timeline').hidden = !on;
  $('#chips').style.opacity = on ? '1' : '0';
  if (!on) {
    setArcs([]);
    const l = p <= 0.30 ? 0 : (1 - seg(p, 0.545, 0.60));
    SVC.forEach((s) => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: l, ring: 0, dim: 1, hot: 0 }));
    return;
  }
  const q = seg(p, 0.335, 0.515);
  const d = new Date(headDate(q));
  $('#tl-date').textContent = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  $('#tl-fill').style.width = (q * 100).toFixed(2) + '%';
  $('#tl-head-mark').style.left = (q * 100).toFixed(2) + '%';

  const arcs = [], litMin = new Set();
  SVC.forEach((s) => {
    const dq = q - s.q;
    const lit = clamp01(dq / 0.028);
    let ring = tri(dq, 0.085);
    if (s.real) ring = Math.max(ring, tri(dq - 0.13, 0.085));
    map.setFeatureState({ source: 'svc', id: s.idx }, {
      lit, ring, hot: hovered === s.id ? 1 : 0,
      dim: (hovered && hovered !== s.id) ? 0.32 : 1,
    });
    if (tickEls[s.id]) tickEls[s.id].classList.toggle('on', lit > 0.5);
    if (lit > 0.02) { litMin.add(s.ministry); arcs.push({ s, k: clamp01(dq / 0.07) * (dq > 0.22 ? 0.32 : 1) }); }
  });
  chipEls.forEach((c) => c.classList.toggle('on', litMin.has(c.dataset.m)));
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

function apply(p) {
  if (mode === 'explore') {
    setGrade(0.95); updateHUD(p); clouds.update(-1);
    $('#night').style.opacity = '0'; $('#stars').style.opacity = '0';
    orbit && orbit.update(map, SUN, 0);
    return;
  }

  const c = cameraAt(p);
  const padL = Math.round(Math.min(innerWidth * 0.26, 460) * (1 - seg(p, 0.15, 0.30)));
  map.jumpTo({ center: c.center, zoom: c.zoom, pitch: c.pitch, bearing: c.bearing,
    padding: { left: padL, top: 0, right: 0, bottom: 0 } });
  setProj(p < 0.255);
  ensureOverlay(!projGlobe && p > 0.30 && p < 0.56);

  const wantTerrain = TIER === 'full' && p > 0.578 && p < 0.778;
  if (wantTerrain !== terrainOn) {
    terrainOn = wantTerrain;
    try { map.setTerrain(wantTerrain ? { source: 'dem2', exaggeration: 1.4 } : null); } catch (e) { errors.push('terrain'); }
  }
  vis('hillshade', p > 0.235 && p < 0.83);

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
  op('change-3d', 0.58 * chg, 'fill-extrusion-opacity');
  op('change-edge', 0.75 * chg, 'line-opacity');
  $('#change-legend').hidden = !(optional.change && p > 0.862);

  if (!autoStarted) {
    ORTHO_LAYERS.forEach((id) => op(id, 0));
    op('o_namwon_2508', seg(p, 0.735, 0.80));
  }

  setGrade(p); setNight(p); applyCopy(p); applyChapter2(p); applyChapter45(p);

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
  updateHUD(p);
}

/* ── 11. HUD — 모든 숫자가 실제 값 ──────────────────────── */
function updateHUD(p) {
  $('#hud-time').textContent = KST();
  const deep = p > 0.60 || mode === 'explore';
  const c = map.getCenter();
  if (deep) {
    const h = (mode === 'explore' && hudCtx) ? hudCtx : { k2: 'GSD', v2: gsdOverride, k3: '촬영', v3: epochDate };
    $('#hud-k1').textContent = '좌표';    $('#hud-v1').textContent = `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
    $('#hud-k2').textContent = h.k2;      $('#hud-v2').textContent = h.v2;
    $('#hud-k3').textContent = h.k3;      $('#hud-v3').textContent = h.v3;
    $('#hud-k4').textContent = '줌';      $('#hud-v4').textContent = 'z' + map.getZoom().toFixed(2);
  } else {
    $('#hud-k1').textContent = '궤도체';     $('#hud-v1').textContent = SAT.name;
    $('#hud-k2').textContent = '고도';       $('#hud-v2').textContent = SAT.altKm + ' km';
    $('#hud-k3').textContent = '한반도까지'; $('#hud-v3').textContent = orbit ? fmt(Math.round(orbit.state.distKm)) + ' km' : '—';
    $('#hud-k4').textContent = '태양 직하점'; $('#hud-v4').textContent = `${SUN.lat.toFixed(1)}°, ${SUN.lng.toFixed(1)}°`;
  }
  scaleBar(map, $('#scale-txt'), $('#scale-bar'));
}

/* ── 12. 탐사 모드 ──────────────────────────────────────── */
function openStory(id) {
  mode = 'explore';
  lenis.stop();
  autoStarted = false;
  applyCopy(0, true);
  $('#chips').style.opacity = '0';
  $('#timeline').hidden = true;
  strip.style.opacity = STORY_IS_NAMWON(id) ? '1' : '0';
  strip.style.pointerEvents = STORY_IS_NAMWON(id) ? 'auto' : 'none';
  $('#cta').hidden = true;
  $('#change-legend').hidden = true;
  setArcs([]);
  ORTHO_LAYERS.forEach((l) => op(l, 0));
  SVC.forEach((s) => map.setFeatureState({ source: 'svc', id: s.idx }, { lit: 0, ring: 0, dim: 1, hot: 0 }));
  vis('hillshade', true);
  op('road-case', 0.7, 'line-opacity'); op('road', 0.82, 'line-opacity');
  op('boundary', 0.24, 'line-opacity'); op('coast', 0, 'line-opacity'); op('coast-glow', 0, 'line-opacity');
  op('label-place', 0.92, 'text-opacity'); op('label-sido', 0.85, 'text-opacity');
  try { map.setTerrain(null); } catch (e) { /* noop */ }
  terrainOn = false;
  hudCtx = null;
  dataReady.then(() => stories.enter(id));
}
const STORY_IS_NAMWON = (id) => id === 'pothole';

function closeStory() {
  mode = 'scroll';
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
    if (!graded && now - T_BOOT > 2600) {
      graded = true;
      if (fps < 24 && TIER === 'full') {
        TIER = 'lite';
        try { map.setTerrain(null); } catch (e) { /* noop */ }
        terrainOn = false;
        $('#orbit3d').style.display = 'none';
      }
    }
  }
  apply(P);
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
    P = clamp01(p);
    apply(P);
  },
  suppressAuto: false,
  // 프레임 단위 촬영용 — p 를 직접 세팅한다(rAF 루프가 다음 프레임에 반영).
  set(p) { P = clamp01(p); if (mode === 'scroll') apply(P); },
  // 데모/영상 촬영용 — 스크롤 대신 p 를 직접 시간으로 흘린다.
  demo(sec = 30) {
    return new Promise((res) => {
      if (mode === 'explore') closeStory();
      const o = { v: 0 };
      P = 0; scanned = false; autoStarted = false; apply(0);
      gsap.to(o, { v: 1, duration: sec, ease: 'none', onUpdate: () => { P = o.v; }, onComplete: res });
    });
  },
  open: openStory, close: closeStory, ready: dataReady,
  get p() { return P; }, get fps() { return fps; }, get tier() { return TIER; },
  get errors() { return errors.slice(); },
  map, stories, swipe,
};
window.__dive = api;

const T_BOOT = performance.now();
await PRE.finish();
loop();
document.body.dataset.ready = '1';
