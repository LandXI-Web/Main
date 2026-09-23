/* E0-S XI맵 시그니처 스파이크 — S1 도착 · S3 시점 스크럽 · S6 스와이프 (실데이터 · 제품 아님)
   숫자 출처: results.js stats · imagery.js · change.js · 실 GeoJSON(필지 속성) 뿐. 지어낸 값 0.
   부품은 import 만(map-gl.js createMap · setBase · haversine / map-data.js TEAL · centroid · clsLabel · isDashCls).
   두 층 크로스페이드 · 스윕 · 락온은 이 파일 안에서 map.addSource/addLayer 로 직접 — 부품화는 W2 E2-0.
   지속값은 D 한 곳(법전 §4 사다리 + 락온 380 = 180·80·120 + 스태거 40·60·120). 이징은 EASE 하나(+ CSS 호버 --hove). */
import { createMap, setBase, haversine } from '../map-gl.js';
import { TEAL, centroid, clsLabel, isDashCls } from '../map-data.js';
import { RESULTS } from '../../assets/data/results.js';
import { IMAGERY } from '../../assets/data/imagery.js';
import { CHANGE } from '../../assets/data/change.js';

/* ══ 0. 법전 값 ══════════════════════════════════════════════════════════ */
const D = {
  frame: 1250,      // S1 결과 bbox 로 카메라 frame
  dive: 1000,       // S3 · S6 정사영상 범위로 frame
  sweep: 1000,      // 스캔 스윕 1.0s
  fade: 500,        // 스윕이 지난 필지의 현상(0 → 1)
  lock: 380,        // 락온 = 180 + 80 + 120 (CSS .spk-lock)
  stagger: 120,     // 자동 락온 3곳 사이
  dig: 40,          // 숫자 글자별 현상
  tst: 60,          // 텍스트 인 스태거
  tin: 500,         // 텍스트 인(법전 600 대신 500 — 결과 문서 '남은 것' 참고)
  stop: 750,        // S3 재생 · 정수 시점 자동 정지
  hop: 1000,        // S3 재생 · 한 시점에서 다음 시점까지
  debounce: 120,    // 손으로 끄는 동안 URL 기록 간격
  tileFade: 500,    // 도시 바탕 · 정사영상 타일이 들어올 때(raster-fade-duration)
};
/* 재생 주기 = 정지 4 × 750 + 이동 3 × 1000 = 6000ms(법전 유휴 ≥ 6s · 화면 유휴 1개) */
const CYCLE = 4 * D.stop + 3 * D.hop;

function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => {
    if (x <= 0) return 0; if (x >= 1) return 1;
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 24; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return sy(t);
  };
}
const EASE = bezier(0.15, 1, 0.3, 1);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ══ 1. 실데이터 ═════════════════════════════════════════════════════════ */
const R = RESULTS.find((r) => r.id === 'namwon-farmland-2025');
const ST = R.stats;
const EP = IMAGERY.filter((i) => /^namwon_25\d\d$/.test(i.id)).sort((a, b) => a.captured.localeCompare(b.captured));
const CITY = IMAGERY.find((i) => i.id === 'namwon_city_2504');
const OB = EP[0].bounds;                                   // 정사영상 4시점 공통 범위
const BB = ST.bbox;                                        // 결과 bbox
const ROOT = '../../';
const nf = new Intl.NumberFormat('ko-KR');
const lab = (im) => im.captured.replace('-', '.');
const gsd = (im) => (im.gsd * 100).toFixed(2);
const dot = (s) => s.replace(/-/g, '.');
const midLat = (OB[1] + OB[3]) / 2;
const OB_KM2 = (haversine(OB[0], midLat, OB[2], midLat) * haversine(OB[0], OB[1], OB[0], OB[3]) / 1e6).toFixed(2);

const $ = (s) => document.querySelector(s);
const el = {
  stage: $('#spk-stage'), a: $('#spk-map-a'), b: $('#spk-map-b'), sweep: $('#spk-sweep'), locks: $('#spk-locks'),
  hud: $('#spk-hud'), scene: $('#hud-scene'), title: $('#hud-title'), status: $('#hud-status'), big: $('#hud-big'), unit: $('#hud-unit'),
  note: $('#hud-note'), chg: $('#hud-chg'), replay: $('#spk-replay'),
  scrub: $('#spk-scrub'), play: $('#spk-play'), range: $('#spk-range'), ticks: $('#spk-ticks'), void: $('#spk-void'),
  seg: $('#spk-seg'), swipe: $('#spk-swipe'), grip: $('#spk-grip'), swL: $('#spk-swipe-l'), swR: $('#spk-swipe-r'),
};
$('#spk-band-n').textContent = nf.format(ST.count);

/* ══ 2. 상태 ═════════════════════════════════════════════════════════════ */
const S = {
  scene: 's1', phase: '', phases: [], started: false, arrived: false, ready: false,
  e: 1, swipe: 50, off: true, playing: false, paused: false, stops: [],
  frames: [], lastT: 0, A: null, B: null, geo: null, pts: null, order: [], chg: null,
};
const setPhase = (p) => { S.phase = p; S.phases.push(p); document.documentElement.dataset.phase = p; };

/* 정사영상 타일셋은 성기다 — 없는 타일에 로컬 서버가 주는 투명 1×1 PNG 가 Chrome 에서 디코드되지 않아
   (tools/serve.mjs BLANK · 결과 문서 '요청') 콘솔 오류가 쌓였다. 스파이크의 타일은 spk:// 로 받아
   webp 가 아니면 브라우저가 만든 투명 1×1 로 바꾼다. */
let BLANK = null;
const blank = async () => {
  if (!BLANK) { const c = new OffscreenCanvas(1, 1); c.getContext('2d'); BLANK = await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer(); }
  return BLANK.slice(0);
};
maplibregl.addProtocol('spk', async (params, ac) => {
  const r = await fetch(params.url.slice('spk://'.length), { signal: ac.signal });
  if (!r.ok || !/webp/.test(r.headers.get('content-type') || '')) return { data: await blank() };
  return { data: await r.arrayBuffer() };
});
const tileURL = (t) => 'spk://' + new URL(ROOT, location.href).href + t;   // {z}/{x}/{y} 가 인코딩되지 않게 뒤에 붙인다

/* ══ 3. 지도 꾸미기 — 도시 바탕(무채) · 정사영상 4층 · 읍면동 · 변화 지수 · 결과 ══ */
const FS = ['coalesce', ['feature-state', 'a'], 0];
function decorate(map, { results = true } = {}) {
  // MapLibre 의 기본 속성 전이(300ms)는 법전 사다리 밖 — 스타일 전체를 0 으로 두고 필요한 곳만 D 값으로 연다.
  if (map.style?.stylesheet) map.style.stylesheet.transition = { duration: 0, delay: 0 };
  setBase(map, 'none');                                    // V-World 끄고 흰 바탕 — 바탕은 LX 도시 정사영상(로컬 타일)
  map.addSource('city', { type: 'raster', tiles: [tileURL(CITY.tiles)], tileSize: 256, minzoom: CITY.minzoom, maxzoom: CITY.maxzoom, bounds: CITY.bounds, attribution: '' });
  // 도시 바탕은 도시 스케일에서만 — z13 → 14.5 사이에 줌으로 걷힌다(다이브 중 과확대된 회색 덩어리 0).
  map.addLayer({ id: 'city', type: 'raster', source: 'city', maxzoom: CITY_OUT, paint: {
    'raster-opacity': ['interpolate', ['linear'], ['zoom'], CITY_OUT - 1.5, 1, CITY_OUT, 0],
    'raster-saturation': -1, 'raster-contrast': -0.12, 'raster-brightness-min': 0.16, 'raster-fade-duration': RM ? 0 : D.tileFade } }, 'emd-fill');
  EP.forEach((im, k) => {
    map.addSource('ep' + k, { type: 'raster', tiles: [tileURL(im.tiles)], tileSize: 256, minzoom: im.minzoom, maxzoom: im.maxzoom, bounds: im.bounds, attribution: '' });
    map.addLayer({ id: 'ep' + k, type: 'raster', source: 'ep' + k, paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 0 }, 'raster-fade-duration': RM ? 0 : D.tileFade } }, 'emd-fill');
  });
  map.addSource('spk-emd', { type: 'geojson', data: S.emd });
  map.addLayer({ id: 'spk-emd', type: 'line', source: 'spk-emd', maxzoom: 14, layout: { 'line-join': 'miter' }, paint: { 'line-color': '#010102', 'line-width': 0.8, 'line-opacity': 0.22 } }, 'sr-fill');
  // 정사영상 4시점 범위 = 헤어라인 틀 하나(도시 스케일에서 걷히고 정사영상 스케일에서 들어온다) — 틀 밖은 흰 바탕
  map.addSource('spk-ob', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[OB[0], OB[1]], [OB[2], OB[1]], [OB[2], OB[3]], [OB[0], OB[3]], [OB[0], OB[1]]]] } } });
  map.addLayer({ id: 'spk-ob', type: 'line', source: 'spk-ob', minzoom: 12, layout: { 'line-join': 'miter' },
    paint: { 'line-color': '#010102', 'line-width': 1, 'line-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 0.55] } }, 'sr-fill');
  map.addSource('spk-chg', { type: 'geojson', data: S.chg });
  map.addLayer({ id: 'spk-chg', type: 'line', source: 'spk-chg', filter: ['==', ['get', 'pair'], ''], layout: { 'line-join': 'miter' },
    paint: { 'line-color': '#FFFFFF', 'line-width': 1.2, 'line-dasharray': [2, 1.5], 'line-opacity': 0, 'line-opacity-transition': { duration: RM ? 0 : D.fade } } }, 'sr-fill');
  if (!results) return;
  const dash = S.dash = ['in', ['get', 'cls'], ['literal', [...new Set(S.geo.features.map((f) => f.properties.cls))].filter(isDashCls)]];
  const k = ['-', 2, FS];                                  // 막 도착한 점은 두 배 크기에서 1 로 가라앉는다
  map.addSource('r', { type: 'geojson', data: S.geo });
  map.addSource('r-pt', { type: 'geojson', data: S.pts });
  map.addLayer({ id: 'r-pt', type: 'circle', source: 'r-pt', maxzoom: 13.6, paint: {
    'circle-color': TEAL, 'circle-opacity': ['*', 0.95, FS],
    'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, ['*', 1.6, k], 11, ['*', 2.4, k], 13.6, ['*', 3.6, k]],
    'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 0.6, 'circle-stroke-opacity': ['*', 0.9, FS] } }, 'sr-fill');
  map.addLayer({ id: 'r-fill', type: 'fill', source: 'r', minzoom: 12, filter: ['!', dash], paint: { 'fill-color': TEAL, 'fill-opacity': rOp(0.18, false) } }, 'sr-fill');
  map.addLayer({ id: 'r-line', type: 'line', source: 'r', minzoom: 12, filter: ['!', dash], layout: { 'line-join': 'miter' },
    paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 15, 1.7, 18, 2.6], 'line-opacity': rOp(0.95, false) } }, 'sr-fill');
  map.addLayer({ id: 'r-dash', type: 'line', source: 'r', minzoom: 12, filter: dash, layout: { 'line-join': 'miter' },
    paint: { 'line-color': TEAL, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 1, 15, 1.7, 18, 2.6], 'line-dasharray': [3, 2], 'line-opacity': rOp(0.95, false) } }, 'sr-fill');
}
const R_LAYERS = ['r-pt', 'r-fill', 'r-line', 'r-dash'];
/* 결과 면·선의 불투명도. scoped(S3 · S6) = 정사영상 범위에 걸친 필지만 남기고 나머지는 z13 → 14.5 하강하며 걷힌다
   — 틀 밖 흰 바탕에 청록 조각이 흩어지지 않게. z13 아래에선 두 식이 같아 장면 전환에 튐이 없다. */
const CITY_OUT = 14.5;
function rOp(base, scoped) {
  const v = ['*', base, FS];
  if (!scoped) return v;
  return ['interpolate', ['linear'], ['zoom'], CITY_OUT - 1.5, v, CITY_OUT, ['*', base, FS, ['case', ['get', 'inOb'], 1, 0]]];
}
function scopeResults(map, scoped) {
  if (!map?.getLayer('r-fill')) return;
  map.setPaintProperty('r-fill', 'fill-opacity', rOp(0.18, scoped));
  map.setPaintProperty('r-line', 'line-opacity', rOp(0.95, scoped));
  map.setPaintProperty('r-dash', 'line-opacity', rOp(0.95, scoped));
}
const showResults = (map, on) => R_LAYERS.forEach((l) => map.getLayer(l) && map.setLayoutProperty(l, 'visibility', on ? 'visible' : 'none'));
function revealAll(map, a = 1) {
  if (map === S.A) S.level.fill(a);
  for (let i = 0; i < S.geo.features.length; i++) { map.setFeatureState({ source: 'r', id: i }, { a }); map.setFeatureState({ source: 'r-pt', id: i }, { a }); }
}

/* ══ 4. 시점(0–3 소수) — 두 층 크로스페이드 ═══════════════════════════════ */
function epochLayers(e) {
  const k = Math.min(3, Math.floor(e + 1e-6)), f = +(e - k).toFixed(4);
  if (f < 0.005 || k >= 3) return { a: EP[k].id, b: null, opA: 1, opB: 0, k, f: 0 };
  return { a: EP[k].id, b: EP[k + 1].id, opA: +(1 - f).toFixed(4), opB: f, k, f };
}
function paintEpoch(map, e) {
  if (!map?.getLayer('ep0')) return;
  const L = epochLayers(e);
  EP.forEach((im, i) => map.setPaintProperty('ep' + i, 'raster-opacity', im.id === L.a ? L.opA : im.id === L.b ? L.opB : 0));
}
const valueText = (e) => { const L = epochLayers(e); return L.b ? `${lab(EP[L.k])} → ${lab(EP[L.k + 1])} · ${Math.round(L.f * 100)} %` : lab(EP[L.k]); };
const pairAt = (k) => CHANGE[Math.max(0, Math.min(CHANGE.length - 1, k - 1))];
let urlTimer = 0;
function setEpoch(e, { url = 'now', from = 'api' } = {}) {
  e = Math.max(0, Math.min(3, Math.round(e * 100) / 100));
  S.e = e;
  paintEpoch(S.A, e); paintEpoch(S.B, e);
  if (from !== 'range') el.range.value = String(e);
  el.range.setAttribute('aria-valuetext', valueText(e));
  el.ticks.querySelectorAll('li').forEach((li, i) => { li.dataset.on = Math.round(e) === i ? '1' : '0'; });
  const L = epochLayers(e), atInt = !L.b;
  // 정수 시점 = 변화 pair 경계 → 변화 지수(비지도) 한 줄 + 그 pair 의 윤곽
  const pair = atInt ? pairAt(L.k) : null;
  for (const m of [S.A, S.B]) {
    if (!m?.getLayer('spk-chg')) continue;
    if (pair) m.setFilter('spk-chg', ['==', ['get', 'pair'], pair.pair]);
    m.setPaintProperty('spk-chg', 'line-opacity', pair && S.scene === 's3' ? 0.9 : 0);
  }
  if (S.scene === 's3') {
    el.chg.hidden = !pair;
    if (pair) el.chg.innerHTML = `변화 지수(비지도) · ${pair.label} · <span class="n">${nf.format(pair.stats.n)}</span>건 · 학습 결과 아님`;
    hudEpoch(false);                                       // 재생·스크럽 중 시점 전환 = 제자리 교체(텍스트 인은 enterS3 한 번)
  }
  if (S.scene === 's6') hudSwipe();
  if (url === 'now') writeURL();
  else if (url === 'later') { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, D.debounce); }
}
function writeURL() {
  const q = new URLSearchParams();
  q.set('scene', S.scene);
  if (S.scene !== 's1') q.set('epoch', String(S.e));
  if (S.scene === 's6') q.set('swipe', String(Math.round(S.swipe)));
  history.replaceState(null, '', `${location.pathname}?${q}`);
}

/* ══ 5. HUD ══════════════════════════════════════════════════════════════ */
function bigText(txt, animate = true) {
  el.big.innerHTML = [...txt].map((c, i) => `<span class="ch" style="--i:${i}">${c}</span>`).join('');
  if (!animate) el.big.querySelectorAll('.ch').forEach((s) => { s.style.animation = 'none'; });
  el.big.setAttribute('aria-label', txt);
}
function noteSegs(segs, animate = true) {
  el.note.innerHTML = segs.map((s, i) => `<span class="seg" style="--i:${i}">${s}</span>`).join('');
  if (!animate) el.note.querySelectorAll('.seg').forEach((s) => { s.style.animation = 'none'; });
}
const N = (v) => `<span class="n">${v}</span>`;
function hudS1(done, animate) {
  hudKey = '';
  el.scene.textContent = 'S1 도착';
  el.title.textContent = `${R.title} · ${R.year} · 드론`;
  el.status.textContent = done ? `판독 결과 도착 · 기준 ${dot(ST.analyzedAt)}` : '판독 결과 도착 중';
  el.status.dataset.state = done ? 'live' : '';
  el.unit.textContent = R.unit;
  el.chg.hidden = true;
  el.replay.parentElement.hidden = false;
  if (!done) { el.big.textContent = '—'; el.note.innerHTML = ''; return; }
  bigText(nf.format(ST.count), animate);
  noteSegs([`경작지 ${N(nf.format(ST.classes['경작지']))}`, `비경작지 ${N(nf.format(ST.classes['비경작지']))}`,
    `${N(ST.areaHa.toFixed(1))} ha`, `신뢰도 중앙값 ${N(ST.confMedian.toFixed(2))}`, `기준 ${N(dot(ST.analyzedAt))}`], animate);
}
let hudKey = '';
function hudEpoch(animate) {
  const L = epochLayers(S.e), im = EP[Math.round(S.e)];
  el.status.textContent = L.b ? valueText(S.e) : `시점 ${lab(im)} · 크로스페이드 없음`;
  const key = 's3:' + im.id;
  if (!animate && hudKey === key) return;                 // 같은 시점이면 큰 숫자·해설 줄은 그대로
  hudKey = key;
  el.scene.textContent = 'S3 시점';
  el.title.textContent = '남원 농경지 정사영상 · LX 드론 4시점';
  el.status.dataset.state = '';
  el.unit.textContent = '촬영';
  el.replay.parentElement.hidden = true;
  bigText(lab(im), animate && !RM);
  noteSegs([`GSD ${N(gsd(im))} cm`, `범위 ${N(OB_KM2)} km²`, `이 범위 판독 ${N(IN.n)} 필지`], animate && !RM);
}
function hudSwipe(animate = false) {
  hudKey = '';
  const im = EP[Math.round(S.e)];
  el.scene.textContent = 'S6 스와이프';
  el.title.textContent = '원본 ↔ AI 판독 · 한 선으로 가른다';
  el.status.textContent = `원본 ${lab(im)} · GSD ${gsd(im)} cm`;
  el.status.dataset.state = '';
  el.unit.textContent = R.unit;
  el.chg.hidden = true;
  el.replay.parentElement.hidden = true;
  if (animate) {
    bigText(nf.format(IN.n), !RM);
    noteSegs(['정사영상 범위 안 판독', `경작지 ${N(IN.cls['경작지'] || 0)}`, `비경작지 ${N(IN.cls['비경작지'] || 0)}`, `전체 ${N(nf.format(ST.count))} 필지 중`], !RM);
  }
  el.swL.innerHTML = `<span>원본 · ${N(lab(im))} · ${N(gsd(im))} cm</span>`;
  el.swR.innerHTML = '<span><b>AI 판독</b>경작지 · 비경작지</span>';
}

/* ══ 6. 락온 — 브래킷 성장 180 → 앰버 80 → 청록 120 ═══════════════════════ */
const locks = [];
function lockAt(i) {
  const f = S.geo.features[i]; if (!f) return;
  const p = f.properties;
  const box = document.createElement('div');
  box.className = 'spk-lock';
  box.dataset.fid = String(i);
  box.dataset.lockAt = String(Math.round(performance.now()));
  box.innerHTML = `<span class="spk-flag"><b>${clsLabel(p.cls)}</b>${p.emd} · ${N(nf.format(Math.round(p.area)))} m² · 신뢰도 ${N(p.conf.toFixed(2))}</span>`;
  box.addEventListener('animationend', (ev) => { if (ev.animationName === 'spk-settle') box.dataset.lockEnd = String(Math.round(performance.now())); });
  el.locks.appendChild(box);
  locks.push({ i, box, c: [p.cx, p.cy], bb: S.bbox[i] });
  while (locks.length > 4) locks.shift().box.remove();
  placeLocks();
}
function placeLocks() {
  const m = S.A; if (!m) return;
  for (const L of locks) {
    const c = m.project(L.c), a = m.project([L.bb[0], L.bb[3]]), b = m.project([L.bb[2], L.bb[1]]);
    const w = Math.max(40, Math.min(160, Math.abs(b.x - a.x) + 16)), h = Math.max(40, Math.min(160, Math.abs(b.y - a.y) + 16));
    L.box.style.setProperty('--w', w + 'px'); L.box.style.setProperty('--h', h + 'px');
    L.box.style.translate = `${(c.x - w / 2).toFixed(1)}px ${(c.y - h / 2).toFixed(1)}px`;
  }
}
const clearLocks = () => { while (locks.length) locks.pop().box.remove(); };
/** 자동 락온 3곳 — 클래스를 번갈아 신뢰도 높은 순으로, 서로 0.06° 이상 떨어진 필지(결과 GeoJSON 에서 고른다). */
function autoPicks() {
  const byConf = S.geo.features.map((f, i) => [i, f.properties.conf]).sort((a, b) => b[1] - a[1]);
  const want = ['경작지', '비경작지', '경작지'];
  const out = [];
  for (let pass = 0; pass < 2 && out.length < 3; pass++) for (const [i] of byConf) {
    if (out.includes(i)) continue;
    if (pass === 0 && S.geo.features[i].properties.cls !== want[out.length]) continue;
    const p = S.geo.features[i].properties;
    const hud = S.A.project([p.cx, p.cy]);
    if (hud.x < el.hud.offsetLeft + el.hud.offsetWidth + 24 && hud.y < el.hud.offsetTop + el.hud.offsetHeight + 24) continue;
    if (hud.x > el.stage.clientWidth - 280 || hud.y > el.stage.clientHeight - 140 || hud.y < 30) continue;
    if (out.every((j) => Math.hypot(S.geo.features[j].properties.cx - p.cx, S.geo.features[j].properties.cy - p.cy) > 0.06)) out.push(i);
    if (out.length === 3) break;
  }
  return out;
}

/* ══ 7. S1 도착 ══════════════════════════════════════════════════════════ */
const PAD = () => {
  const left = el.hud.offsetLeft + el.hud.offsetWidth + 24;
  const bottom = el.stage.clientHeight - el.scrub.offsetTop + 24;
  return { top: 32, right: 32, bottom: Math.max(48, bottom), left: Math.min(left, el.stage.clientWidth * 0.45) };
};
let run = 0;                                               // 다시 보기 · 장면 전환이 이전 타이머를 끊는다
const wait = (ms, id) => new Promise((res) => setTimeout(() => res(id === run), ms));
const moveEnd = (map) => new Promise((res) => (map.isMoving() ? map.once('moveend', res) : res()));

async function arrive({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay();
  S.scene = 's1'; S.arrived = false; S.ready = false; S.started = false; S.sweepT0 = 0; S.sweepLo = 0; S.sweepLng = null;
  document.documentElement.dataset.scene = 's1';
  segCurrent();
  leaveS6();
  el.play.hidden = true;                                    // 재생은 S3 의 것 — S1 의 띠는 눈금만
  scopeResults(S.A, false);
  checkRange();
  showResults(S.A, true);
  el.locks.hidden = false;
  clearLocks();
  revealAll(S.A, 0);
  paintChg0();
  hudS1(false);
  const cam = S.A.cameraForBounds([[BB[0], BB[1]], [BB[2], BB[3]]], { padding: PAD() });
  S.perfReset();
  if (!animate) {
    S.A.jumpTo(cam);
    revealAll(S.A, 1);
    for (const p of ['sweep', 'lock', 'count']) setPhase(p);
    autoPicks().forEach(lockAt);
    hudS1(true, false);
    setPhase('arrived'); S.arrived = true; S.ready = true; S.started = true;
    return;
  }
  // t=0 — 조금 떨어진 자리에서 결과 0 으로 시작해 frame 1250
  S.A.jumpTo({ center: [cam.center.lng + (BB[2] - BB[0]) * 0.18, cam.center.lat - (BB[3] - BB[1]) * 0.08], zoom: Math.max(CITY.minzoom + 0.02, cam.zoom - 0.55) });
  S.started = true;
  S.A.easeTo({ ...cam, duration: D.frame, easing: EASE, essential: true });
  if (!(await wait(D.frame, id))) return;
  // 스캔 스윕 1.0s — 지나간 자리에만 결과가 남는다
  setPhase('sweep');
  S.sweepT0 = performance.now();
  el.sweep.classList.add('is-on');
  if (!(await wait(D.sweep, id))) return;
  el.sweep.classList.remove('is-on');
  // 락온 3곳 · 120 스태거
  setPhase('lock');
  const picks = autoPicks();
  picks.forEach((i, n) => setTimeout(() => { if (id === run) lockAt(i); }, n * D.stagger));
  if (!(await wait(D.lock + (picks.length - 1) * D.stagger, id))) return;
  // 숫자 현상 — 글자별 40ms · 해설 줄 텍스트 인 60 스태거
  setPhase('count');
  hudS1(true, true);
  const nCh = nf.format(ST.count).length, nSeg = el.note.children.length;
  if (!(await wait(Math.max(D.tin + (nCh - 1) * D.dig, D.tin + (nSeg - 1) * D.tst), id))) return;
  setPhase('arrived'); S.arrived = true; S.ready = true;
}
/** 스윕 한 프레임 — 선 위치 + 지나간 필지 현상(0 → 1, 500ms · 4단 양자화로 feature-state 호출을 줄인다). */
function sweepFrame(now) {
  if (!S.sweepT0) return;
  const W = BB[0], E = BB[2], span = E - W;
  const p = Math.min(1, (now - S.sweepT0) / D.sweep);
  S.sweepLng = W + span * p;
  const x = S.A.project([S.sweepLng, (BB[1] + BB[3]) / 2]).x;
  el.sweep.style.transform = `translateX(${(x - 9).toFixed(1)}px)`;
  const ord = S.order;
  let lo = S.sweepLo || 0, allDone = true;
  for (let n = lo; n < ord.length; n++) {
    const i = ord[n], ti = S.sweepT0 + ((S.cx[i] - W) / span) * D.sweep;
    if (ti > now) { allDone = false; break; }
    const a = Math.min(1, (now - ti) / D.fade), q = a >= 1 ? 1 : Math.ceil(a * 4) / 4;
    if (S.level[i] !== q) { S.level[i] = q; S.A.setFeatureState({ source: 'r', id: i }, { a: q }); S.A.setFeatureState({ source: 'r-pt', id: i }, { a: q }); }
    if (q === 1 && n === lo) lo = n + 1;
    if (q < 1) allDone = false;
  }
  S.sweepLo = lo;
  if (allDone && lo >= ord.length) { S.sweepT0 = 0; S.sweepLo = 0; }
}
function paintChg0() { for (const m of [S.A, S.B]) if (m?.getLayer('spk-chg')) m.setPaintProperty('spk-chg', 'line-opacity', 0); }

/* ══ 8. S3 · S6 ═════════════════════════════════════════════════════════ */
async function toOrtho(animate) {
  // S6 = 정사영상 안에 온전히 들어온 판독 필지 하나에 붙는다 — 가르는 선이 그 필지를 지나가게(화면 가운데)
  const f = S.scene === 's6' && IN.focus != null ? S.geo.features[IN.focus].properties : null;
  const cam = f ? { center: maplibregl.LngLat.convert([f.cx, f.cy]), zoom: 18 }
    : S.A.cameraForBounds([[OB[0], OB[1]], [OB[2], OB[3]]], { padding: PAD() });
  const c = S.A.getCenter(), z = S.A.getZoom();
  const near = Math.abs(z - cam.zoom) < 0.3 && Math.abs(c.lng - cam.center.lng) < 0.002 && Math.abs(c.lat - cam.center.lat) < 0.002;
  if (near) return;
  if (!animate) { S.A.jumpTo(cam); return; }
  S.A.easeTo({ ...cam, duration: D.dive, easing: EASE, essential: true });
  await moveEnd(S.A);
}
function finishS1Instant() {
  // 장면을 URL 로 바로 열었을 때 — S1 은 끝난 상태로 둔다
  revealAll(S.A, 1); S.arrived = true; S.started = true;
  if (!S.phases.includes('arrived')) setPhase('arrived');
}
async function enterS3({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay();
  S.sweepT0 = 0; el.sweep.classList.remove('is-on');
  if (!S.arrived) finishS1Instant();
  S.scene = 's3'; S.ready = false;
  document.documentElement.dataset.scene = 's3';
  segCurrent(); leaveS6();
  showResults(S.A, true); el.locks.hidden = false;
  scopeResults(S.A, true);
  S.perfReset();
  setEpoch(S.e);
  hudEpoch(true);
  await toOrtho(animate);
  if (id !== run) return;
  el.play.hidden = false;                                   // 재생은 하강이 끝나 정사영상 위에 섰을 때 나타난다
  placeLocks(); checkRange();
  S.ready = true;
}
async function ensureB() {
  if (S.B) return S.B;
  el.b.hidden = false; el.b.style.visibility = 'hidden';
  const B = await createMap(el.b, { center: S.A.getCenter().toArray(), zoom: S.A.getZoom(), label: '지도 B — AI 판독 겹침(오른쪽)' });
  B.getCanvas().setAttribute('tabindex', '-1');
  decorate(B, { results: true });
  scopeResults(B, true);
  revealAll(B, 1);
  S.B = B;
  paintEpoch(B, S.e);
  B.jumpTo({ center: S.A.getCenter(), zoom: S.A.getZoom() });
  // 오른쪽 절반이 흰 허공으로 비었다가 타일이 페이드 인하는 '로딩' 장면을 보이지 않는다 — B 는 타일이 다 선 뒤에 드러낸다(상한 1250)
  await new Promise((res) => { B.once('idle', res); setTimeout(res, D.frame); });
  el.b.style.visibility = '';
  return B;
}
async function enterS6({ animate = !RM } = {}) {
  const id = ++run;
  stopPlay();
  S.sweepT0 = 0; el.sweep.classList.remove('is-on');
  if (!S.arrived) finishS1Instant();
  S.scene = 's6'; S.ready = false;
  document.documentElement.dataset.scene = 's6';
  segCurrent();
  el.play.hidden = true;                                    // 재생(유휴)은 S3 에만 — 화면당 1개
  el.chg.hidden = true; paintChg0();
  el.locks.hidden = true;
  scopeResults(S.A, true);
  S.perfReset();
  hudSwipe(true);
  await toOrtho(animate);
  if (id !== run) return;
  await ensureB();
  if (id !== run) return;
  el.b.hidden = false; S.B.resize();
  S.B.jumpTo({ center: S.A.getCenter(), zoom: S.A.getZoom() });
  showResults(S.A, false);                                  // 왼쪽 = 원본(결과 없음) · 오른쪽 = 원본 + 결과(청록)
  el.swipe.hidden = false;
  setSwipe(S.swipe);
  setEpoch(S.e);
  checkRange();
  S.ready = true;
}
function leaveS6() {
  el.swipe.hidden = true;
  if (S.B) el.b.hidden = true;
  showResults(S.A, true);
}
function setSwipe(pct, { url = 'now' } = {}) {
  S.swipe = Math.max(6, Math.min(94, Math.round(pct * 10) / 10));
  el.stage.style.setProperty('--swipe', S.swipe + '%');
  el.grip.setAttribute('aria-valuenow', String(Math.round(S.swipe)));
  el.grip.setAttribute('aria-valuetext', `왼쪽 원본 ${Math.round(S.swipe)} % · 오른쪽 AI 판독 ${100 - Math.round(S.swipe)} %`);
  if (S.scene === 's6') { if (url === 'now') writeURL(); else if (url === 'later') { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, D.debounce); } }
}

/* 스크러버 띠의 세 상태.
   S1 = 조용히(눈금만 · 손잡이·재생 없음 · 조작 불가) — 결손 안내 없음.
   S3 · S6 = 카메라가 정사영상 범위 안이면 조작 가능, 밖(또는 z < 12)이면 끄고 점선 무채 + 이유 한 줄(브리프 S3 §5). */
function checkRange() {
  const m = S.A; if (!m) return;
  const ortho = S.scene === 's3' || S.scene === 's6';
  const b = m.getBounds(), z = m.getZoom();
  const hit = !(b.getEast() < OB[0] || b.getWest() > OB[2] || b.getNorth() < OB[1] || b.getSouth() > OB[3]);
  const out = ortho && (z < EP[0].minzoom || !hit);
  const off = !ortho || out;
  S.off = off;
  el.range.disabled = off; el.play.disabled = off;
  el.scrub.dataset.quiet = ortho ? '0' : '1';
  el.scrub.dataset.off = out ? '1' : '0';
  el.void.hidden = !out;
  if (out) el.void.textContent = `이 자리엔 정사영상이 없습니다 — 남원 농경지 ${OB_KM2} km² 만 4시점`;
  if (off) stopPlay();
}

/* ══ 9. S3 재생 — 화면 유휴 1개 · 6s 주기 · 정수 시점마다 750ms 정지 ═════════ */
const P = { mode: '', t0: 0, from: 0, to: 0, dur: 0, until: 0, stopAt: 0 };
function startPlay() {
  if (S.off || S.scene !== 's3') return;
  S.playing = true; el.play.setAttribute('aria-pressed', 'true'); el.play.setAttribute('aria-label', '시점 재생 정지');
  S.perfReset();
  const now = performance.now(), r = Math.round(S.e);
  if (Math.abs(S.e - r) < 0.005) enterStop(r, now);
  else { P.mode = 'hop'; P.t0 = now; P.from = S.e; P.to = Math.ceil(S.e); P.dur = (P.to - P.from) * D.hop; }
}
function stopPlay() {
  if (!S.playing) return;
  S.playing = false; S.paused = false; P.mode = '';
  el.play.setAttribute('aria-pressed', 'false'); el.play.setAttribute('aria-label', '시점 재생');
  writeURL();
}
function enterStop(k, now) {
  P.mode = 'stop'; P.until = now + D.stop; P.stopAt = now; S.paused = true;
  setEpoch(k, { url: 'now' });
}
function playFrame(now) {
  if (!S.playing) return;
  if (P.mode === 'stop' && now >= P.until) {
    S.stops.push({ e: Math.round(S.e), ms: Math.round(now - P.stopAt) });
    if (S.stops.length > 24) S.stops.shift();
    S.paused = false;
    const k = Math.round(S.e);
    if (k >= 3) { enterStop(0, now); return; }                 // 0 → 3 한 방향 뒤 0 으로
    P.mode = 'hop'; P.t0 = now; P.from = k; P.to = k + 1; P.dur = D.hop;
  }
  if (P.mode === 'hop') {
    const p = Math.min(1, (now - P.t0) / P.dur);
    if (p >= 1) enterStop(P.to, now);
    else setEpoch(P.from + (P.to - P.from) * p, { url: 'none' });
  }
}

/* ══ 10. 한 박자 — rAF 하나가 스윕 · 재생 · 프레임 간격 측정을 모두 돈다 ═════ */
S.perfReset = () => { S.frames = []; };
function tick(now) {
  if (S.lastT) { S.frames.push(now - S.lastT); if (S.frames.length > 1200) S.frames.shift(); }
  S.lastT = now;
  if (S.A) { sweepFrame(now); playFrame(now); }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
function perf() {
  const a = [...S.frames].sort((x, y) => x - y);
  const p95 = a.length ? a[Math.min(a.length - 1, Math.floor(a.length * 0.95))] : 0;
  return { p95: +p95.toFixed(2), n: a.length, canvases: document.querySelectorAll('canvas').length };
}

/* ══ 11. 조작 ═════════════════════════════════════════════════════════════ */
function segCurrent() { el.seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-current', String(b.dataset.scene === S.scene))); }
const play = (scene) => {
  const p = scene === 's3' ? enterS3() : scene === 's6' ? enterS6() : arrive();
  if (scene === 's1') { S.scene = 's1'; writeURL(); }
  return p.then(() => { if (scene !== 's1') writeURL(); });
};
el.seg.addEventListener('click', (ev) => { const b = ev.target.closest('button[data-scene]'); if (b) play(b.dataset.scene); });
el.replay.addEventListener('click', () => play('s1'));
el.play.addEventListener('click', () => (S.playing ? stopPlay() : startPlay()));
el.range.addEventListener('pointerdown', () => stopPlay());
el.range.addEventListener('input', () => { stopPlay(); setEpoch(parseFloat(el.range.value), { url: 'later', from: 'range' }); });
el.range.addEventListener('keydown', (ev) => {
  const step = { ArrowLeft: -0.25, ArrowDown: -0.25, ArrowRight: 0.25, ArrowUp: 0.25 }[ev.key];
  if (step == null && ev.key !== 'Home' && ev.key !== 'End') return;
  ev.preventDefault(); stopPlay();
  setEpoch(ev.key === 'Home' ? 0 : ev.key === 'End' ? 3 : S.e + step, { url: 'now' });
});
// 스와이프 손잡이 — 끌기 · ←/→ ±4 %
let drag = false;
const pctAt = (x) => { const r = el.stage.getBoundingClientRect(); return ((x - r.left) / r.width) * 100; };
el.grip.addEventListener('pointerdown', (ev) => { drag = true; el.grip.setPointerCapture(ev.pointerId); ev.preventDefault(); });
el.grip.addEventListener('pointermove', (ev) => { if (drag) setSwipe(pctAt(ev.clientX), { url: 'later' }); });
const endDrag = () => { if (drag) { drag = false; writeURL(); } };
el.grip.addEventListener('pointerup', endDrag); el.grip.addEventListener('pointercancel', endDrag);
el.grip.addEventListener('keydown', (ev) => {
  const d = { ArrowLeft: -4, ArrowRight: 4, ArrowDown: -4, ArrowUp: 4 }[ev.key];
  if (d == null && ev.key !== 'Home' && ev.key !== 'End') return;
  ev.preventDefault(); setSwipe(ev.key === 'Home' ? 6 : ev.key === 'End' ? 94 : S.swipe + d);
});

/* ══ 12. 부팅 ═════════════════════════════════════════════════════════════ */
const IN = { n: 0, cls: {} };
function ticks() {
  el.ticks.innerHTML = EP.map((im, k) => `<li style="left:calc(6px + (100% - 12px) * ${k} / 3)" data-on="0"><b class="n">${lab(im)}</b><br><span class="n">${gsd(im)}</span> cm</li>`).join('');
}
async function boot() {
  ticks();
  const [geo, emd, chg] = await Promise.all([
    fetch(ROOT + R.geojson).then((r) => r.json()),
    fetch(ROOT + 'assets/data/geo/namwon-emd.geojson').then((r) => r.json()),
    fetch(ROOT + CHANGE[0].polygons).then((r) => r.json()),
  ]);
  // 피처마다 중심 경도 cx · 위도 cy · bbox — 스윕 · 락온이 읽는다
  S.cx = new Float64Array(geo.features.length); S.level = new Float32Array(geo.features.length); S.bbox = [];
  geo.features.forEach((f, i) => {
    f.id = i;
    const c = centroid(f); f.properties.cx = c[0]; f.properties.cy = c[1]; S.cx[i] = c[0];
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    const eat = (q) => { if (typeof q[0] === 'number') b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[0]), Math.max(b[3], q[1])]; else q.forEach(eat); };
    eat(f.geometry.coordinates); S.bbox[i] = b;
    f.properties.inOb = b[2] > OB[0] && b[0] < OB[2] && b[3] > OB[1] && b[1] < OB[3];
    if (f.properties.inOb) {
      IN.n++; IN.cls[f.properties.cls] = (IN.cls[f.properties.cls] || 0) + 1;
      const inside = b[0] >= OB[0] && b[2] <= OB[2] && b[1] >= OB[1] && b[3] <= OB[3];
      if (inside && (IN.focus == null || f.properties.area > geo.features[IN.focus].properties.area)) IN.focus = i;
    }
  });
  S.order = geo.features.map((_, i) => i).sort((a, b) => S.cx[a] - S.cx[b]);
  S.geo = geo;
  S.pts = { type: 'FeatureCollection', features: geo.features.map((f, i) => ({ type: 'Feature', id: i, properties: { cls: f.properties.cls }, geometry: { type: 'Point', coordinates: [f.properties.cx, f.properties.cy] } })) };
  S.emd = emd;
  S.chg = chg;

  el.a.style.visibility = 'hidden';                        // createMap 의 기본 어두운 바탕 한 장면을 보이지 않는다
  const A = await createMap(el.a, { center: [(BB[0] + BB[2]) / 2, (BB[1] + BB[3]) / 2], zoom: 11.2, label: '지도 — 남원 판독 결과 · 화살표 키로 이동, +/- 로 확대·축소' });
  S.A = A;
  decorate(A, { results: true });
  revealAll(A, 0);
  await new Promise((res) => A.once('render', res));
  el.a.style.visibility = '';
  A.on('move', () => {
    placeLocks();
    if (S.B && !el.b.hidden) S.B.jumpTo({ center: A.getCenter(), zoom: A.getZoom() });
  });
  A.on('moveend', checkRange);
  A.on('zoomend', checkRange);
  A.on('click', (ev) => {
    if (S.scene === 's6') return;
    const q = A.queryRenderedFeatures([[ev.point.x - 8, ev.point.y - 8], [ev.point.x + 8, ev.point.y + 8]], { layers: R_LAYERS.filter((l) => A.getLayer(l)) });
    if (!q.length) return;
    let best = q[0], bd = Infinity;
    for (const f of q) { const p = S.geo.features[f.id]?.properties; if (!p) continue; const s = A.project([p.cx, p.cy]); const d = Math.hypot(s.x - ev.point.x, s.y - ev.point.y); if (d < bd) { bd = d; best = f; } }
    if (best.id != null) lockAt(best.id);
  });
  window.addEventListener('resize', () => { placeLocks(); checkRange(); });

  // URL 복원 — ?scene=s3&epoch=1.5 · ?scene=s6&swipe=42
  const q = new URLSearchParams(location.search);
  const ep = parseFloat(q.get('epoch')); if (isFinite(ep)) S.e = Math.max(0, Math.min(3, ep));
  const sw = parseFloat(q.get('swipe')); if (isFinite(sw)) S.swipe = Math.max(6, Math.min(94, sw));
  setSwipe(S.swipe, { url: 'none' });
  const scene = q.get('scene');
  setEpoch(S.e, { url: 'none' });
  checkRange();
  if (scene === 's3') { finishS1Instant(); hudS1(true, false); await enterS3({ animate: false }); }
  else if (scene === 's6') { finishS1Instant(); await enterS6({ animate: false }); }
  else await arrive();
}

/* ══ 13. 테스트 훅 ═══════════════════════════════════════════════════════ */
window.__spike = {
  state: () => {
    const L = epochLayers(S.e);
    return { scene: S.scene, phase: S.phase, phases: [...S.phases], started: S.started, arrived: S.arrived, ready: S.ready,
      epoch: S.e, layers: { a: L.a, b: L.b, opA: L.opA, opB: L.opB }, playing: S.playing, paused: S.paused, stops: [...S.stops],
      swipe: S.swipe, off: S.off, locks: locks.length, cycle: CYCLE,
      idle: !!S.A && S.A.loaded() && S.A.areTilesLoaded() && !S.A.isMoving() && (!S.B || el.b.hidden || (S.B.loaded() && S.B.areTilesLoaded() && !S.B.isMoving())),
      centers: [S.A?.getCenter().toArray(), S.B && !el.b.hidden ? S.B.getCenter().toArray() : null] };
  },
  perf,
  play,
  setEpoch: (e) => setEpoch(e, { url: 'now' }),
  setSwipe: (p) => setSwipe(p, { url: 'now' }),
  /** 테스트용 — 판 밖에 보이는 필지 하나의 화면 좌표(페이지 기준). */
  sample: () => {
    const r = el.stage.getBoundingClientRect(), vis = [];
    for (let i = 0; i < S.geo.features.length; i++) {
      const p = S.geo.features[i].properties, s = S.A.project([p.cx, p.cy]);
      if (s.x < 460 || s.y < 40 || s.x > r.width - 300 || s.y > r.height - 160) continue;
      if (locks.some((L) => L.i === i)) continue;
      vis.push({ i, x: r.left + s.x, y: r.top + s.y, area: p.area });
    }
    vis.sort((a, b) => b.area - a.area);
    return vis[0] || null;
  },
  jump: (center, zoom) => S.A.jumpTo({ center, zoom }),
  /** 테스트용 — 지금 보이는(현상된) 필지가 모두 스윕 선 뒤쪽(서쪽)에 있는가. */
  audit: () => {
    let shown = 0, hidden = 0, ahead = 0;
    for (let i = 0; i < S.geo.features.length; i++) {
      const a = S.A.getFeatureState({ source: 'r-pt', id: i })?.a || 0;
      if (a > 0) { shown++; if (S.cx[i] > (S.sweepLng ?? -Infinity) + 1e-9) ahead++; } else hidden++;
    }
    return { shown, hidden, ahead, sweepLng: S.sweepLng ?? null };
  },
  get map() { return S.A; },
};
boot().catch((err) => { console.error('spike boot', err); });
