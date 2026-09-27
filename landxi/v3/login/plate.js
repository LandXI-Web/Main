/* 히어로 카드 — 정문 오른쪽 둥근 24 카드 속 실결과 지도. 모토 3축(스펙시먼 C)과 장면이 동기한다.
   장면 · 지역 · 업무 · 카메라 · 결과 파일은 전부 scenes.json(데이터)에서 온다 — 여기는 kind 별로 읽고 그리기만 한다(명세 §4-6).
     kind view     — 지도만(캡션·숫자 없음). 'korea' 카메라 = K3 기본 카메라(대한민국 전역 bounds).
     kind findings — 대장 대조 결과(필지 타일 + 합계 봉투)
     kind points   — 탐지 점(GeoJSON · 건수 봉투). ask 가 있으면 Ctrl K 한 줄이 먼저 타이핑된다.
     kind grid     — 전역 격자 변화(격자 중심 열점 + 합계 봉투)
   장면 1(HYPER PERFORMANCE) = 공개 전국 결과(S-4 GET /public/stats · 252 시군구 면이 스윕과 함께 차오름). 결과를 못 읽으면 전국 지도만.
   숫자는 전부 봉투(value·unit·basis·as_of·source)로 세우고 기호·근거는 키트 K6 가 낸다.
   데이터를 못 읽은 장면은 순환에서 빠진다(캡션·숫자를 지어내지 않는다).
   유휴 모션 = 이 순환 하나(주기 ≥ 6 s). 축소 모션이면 첫 장면에 멈춘다. */

import { sig } from '../kit/sig.js';
import { nf } from '../kit/i18n.js';
import { hasRoute, api, isEnvelope } from '../kit/util.js';
import { KOREA } from '../kit/stage.js';

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ROOT = {
  data: new URL('../../data/', import.meta.url).href,                  // /landxi/data/ (junction)
  geo: new URL('../../assets/data/geo/results/', import.meta.url).href,
};
const SCENES_URL = new URL('scenes.json', import.meta.url).href;
const AI = '#0FA9A0';
const HOLD = 6500;          // 도착 후 머무는 시간(ms)
const FLY = 2400;           // 카메라 사다리 최상단
const INK = '#1C1F25';      // 타일이 비는 자리 = 잉크(회백 빈 판 0)

/* e-cam = cubic-bezier(.16,1,.3,1) — 법전 §4 */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return sy(Math.min(1, Math.max(0, t))); };
}
const E_CAM = bezier(.16, 1, .3, 1);
/* 결과 파일 → 봉투(서버 봉투와 같은 모양 · 기호·호버는 K6 가 접는다) */
const envOf = (value, unit, basis, as_of, source) => ({ value, unit, basis, as_of: String(as_of || new Date().toISOString()), source });
const AX = {
  Performance: { title: 'HYPER PERFORMANCE', line: '전국을 바로 읽습니다' },
  Solution: { title: 'HYPER SOLUTION', line: '대장 대조에서 보고서까지' },
  GeoAI: { title: 'HYPER GEOAI', line: '위성·항공·드론을 한 지도에' },
};
const AXES = Object.keys(AX);
const UNIT = { findings: 'parcels', points: 'count', grid: 'km2' };
/* 'data:…' → /landxi/data/… · 'geo:…' → 결과 GeoJSON 폴더 */
const href = (ref) => { const m = /^(data|geo):(.+)$/.exec(ref || ''); return m ? new URL(m[2], ROOT[m[1]]).href : null; };
/* 'a.b.c' 경로로 값을 꺼낸다. 값이 {value, as_of} 모양이면 그대로 돌려준다 */
const pick = (o, path) => String(path || '').split('.').reduce((x, k) => (x == null ? x : x[k]), o);

/* ── 장면 행(scenes.json) → 장면. 층 이름은 kind 로만 정한다(지역 이름 없음) ── */
const LAYERS = { view: [], findings: ['ld-parcel', 'ld-sus-halo', 'ld-sus-fill', 'ld-sus-line'], points: ['pt-halo', 'pt-dot'], grid: ['grid-heat'] };
function sceneOf(row) {
  const s = { ...row, ...AX[row.axis], layers: LAYERS[row.kind] || [] };
  const url = href(row.data);
  if (row.kind === 'view') s.load = async () => ({ env: null });
  else if (row.kind === 'findings') s.load = async () => {
    const j = await fetch(url, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(row.id); return r.json(); });
    return { env: envOf(pick(j, row.value), UNIT.findings, row.basis, j.as_of, row.source), digits: row.digits };
  };
  else if (row.kind === 'points') s.load = async (map) => {
    const g = await fetch(url).then((r) => { if (!r.ok) throw new Error(row.id); return r.json(); });
    map.getSource('pt').setData({ type: 'FeatureCollection', features: g.features.map((f) => ({ type: 'Feature', properties: { conf: f.properties.conf }, geometry: { type: 'Point', coordinates: centroid(f.geometry) } })) });
    return { env: envOf(g.features.length, UNIT.points, row.basis, row.as_of || g.as_of, row.source), digits: row.digits };
  };
  else if (row.kind === 'grid') s.load = async (map) => {
    const j = await fetch(url).then((r) => { if (!r.ok) throw new Error(row.id); return r.json(); });
    const min = row.min || 0;
    map.getSource('grid').setData({ type: 'FeatureCollection', features: j.grid.features.filter((f) => f.properties.d >= min)
      .map((f) => ({ type: 'Feature', properties: { d: f.properties.d }, geometry: { type: 'Point', coordinates: centroid(f.geometry) } })) });
    const v = pick(j, row.value);
    const val = v && typeof v === 'object' ? v.value : v, asOf = v && typeof v === 'object' ? v.as_of : j.as_of;
    return { env: envOf(val, UNIT.grid, row.basis, asOf, row.source), digits: row.digits };
  };
  else s.load = async () => { throw new Error('kind'); };
  return s;
}

/* 장면 1 — 공개 전국 결과(S-4). 서버에 경로가 있을 때만 세운다(없으면 null → 전국 지도만).
   합계 봉투는 가벼운 질의(query)로 먼저 세우고, 시군구 면(shape = &geom=1 GeoJSON · value · breaks)은 뒤에서 받는다.
   도착하면 스윕이 지나가는 자리부터 시군구가 5분위 농도로 '차오른다'(feature-state · 스윕 위치를 매 프레임 읽는다).
   면이 없으면 장면을 만들지 않는다 — 숫자만 있는 위성지도는 세우지 않는다(지어내지 않음). */
async function nationalScene(meta, base) {
  if (!meta?.query || !(await hasRoute(meta.query))) return null;
  const jP = api(meta.query);                                                              // 가벼운 합계가 먼저 떠난다
  const shapeP = meta.shape ? api(meta.shape).catch(() => null) : Promise.resolve(null);   // 면은 바로 뒤따른다(첫 장면을 막지 않게)
  let j;
  try { j = await jP; } catch { return null; }
  const total = [j?.total, j?.value, j?.summary?.total, j].find(isEnvelope);
  if (!total) return null;
  const brk = (j.breaks || []).map((b) => (isEnvelope(b) ? b.value : +b)).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  const sc = {
    ...base, kind: 'stats', where: meta.where, unit: meta.unit, credit: meta.credit || base.credit,
    layers: ['kr-fill', 'kr-line'], feats: [],
    async load(map) {
      const g = await shapeP;
      const fc = g?.geojson || (g?.type === 'FeatureCollection' ? g : null);
      const fs = (fc?.features || []).filter((f) => f.geometry && f.properties && f.properties.sgg_cd != null)
        .map((f) => ({ type: 'Feature', properties: { cd: String(f.properties.sgg_cd), value: +f.properties.value || 0 }, geometry: f.geometry }));
      if (!fs.length) throw new Error('shape');
      sc.feats = fs.map((f) => ({ id: f.properties.cd, c: centroid(f.geometry) }));
      /* 5분위 → 면마다 농도(o)·색(c)을 속성으로 싣는다. 페인트 식은 스타일에 처음부터 고정(feature-state 로만 켜고 끈다) */
      const b = brk.length >= 4 ? brk.slice(0, 4) : quantiles(fs.map((f) => f.properties.value));
      const O = [0.06, 0.16, 0.3, 0.48, 0.66], C = ['#0FA9A0', '#0FA9A0', '#0FA9A0', '#19BDB2', '#5FE0D6'];
      for (const f of fs) { const q = b.filter((x) => f.properties.value >= x).length; f.properties.o = O[q]; f.properties.c = C[q]; }
      map.getSource('kr').setData({ type: 'FeatureCollection', features: fs });
      return { env: total };
    },
    /* 스윕과 함께 차오름 — 스윕 선의 현재 x(카드 폭 대비)를 지난 시군구부터 켠다. 끝나면 전부 켠다 */
    reveal(map, sweep, ms) {
      const w = map.getCanvas().clientWidth || 1;
      const xs = sc.feats.map((f) => ({ id: f.id, x: map.project(f.c).x / w })).sort((a, b) => a.x - b.x);
      /* 막 켜진 면은 잠깐(320ms) 더 밝게 섰다가 제 농도로 가라앉는다 — 스윕의 앞머리가 보인다 */
      let i = 0; const on = (k, hot = true) => {
        const ids = [];
        for (; i < k; i++) { map.setFeatureState({ source: 'kr', id: xs[i].id }, { on: true, hot }); ids.push(xs[i].id); }
        if (hot && ids.length) setTimeout(() => { for (const id of ids) map.setFeatureState({ source: 'kr', id }, { hot: false }); }, 320);
        state.kr.on = i;
      };
      state.kr = { n: xs.length, on: 0, t: 0, x0: +xs[0].x.toFixed(3), x1: +xs[xs.length - 1].x.toFixed(3) };
      if (REDUCE || !sweep) { on(xs.length, false); return Promise.resolve(); }
      return new Promise((res) => {
        const t0 = performance.now(), host = sweep.parentElement;
        const tick = () => {
          const fx = sweep.offsetLeft / (host.clientWidth || 1);
          let k = i; while (k < xs.length && xs[k].x <= fx) k++;
          on(k); state.kr.t = Math.round(performance.now() - t0);
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); else { on(xs.length); res(); }
        };
        requestAnimationFrame(tick);
      });
    },
    hide(map) { try { map.removeFeatureState({ source: 'kr' }); } catch { /* 없음 */ } if (state.kr) state.kr.on = 0; },
  };
  return sc;
}
const quantiles = (vs) => { const a = [...vs].sort((x, y) => x - y); return [0.2, 0.4, 0.6, 0.8].map((q) => a[Math.floor(q * (a.length - 1))]); };
const state = { region: null, axis: null, arrived: 0, ready: false, error: null, visits: [], covered: true, kr: { n: 0, on: 0 } };

function centroid(geom) {
  let c = geom.coordinates; while (Array.isArray(c[0][0])) c = c[0];
  let x = 0, y = 0; for (const p of c) { x += p[0]; y += p[1]; } return [x / c.length, y / c.length];
}

function style(rows) {
  const tiles = href(rows.find((r) => r.kind === 'findings' && r.tiles)?.tiles);
  const gridMin = rows.find((r) => r.kind === 'grid')?.min || 0;
  const st = {
    version: 8,
    sources: {
      eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 14 },
      vw: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 6, maxzoom: 19, bounds: KOREA },
      ...(tiles ? { ld: { type: 'vector', url: 'pmtiles://' + tiles } } : {}),
      pt: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      grid: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      kr: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'cd' },
    },
    transition: { duration: 0, delay: 0 },
    layers: [
      /* 타일이 아직 안 온 자리 = 잉크. 카드 속에서 회백 빈 판 + 흰 글자가 드러나지 않게(카드 겉 바탕만 --bg-0) */
      { id: 'bg', type: 'background', paint: { 'background-color': INK } },
      { id: 'eox', type: 'raster', source: 'eox', paint: { 'raster-fade-duration': 500 } },
      { id: 'vw', type: 'raster', source: 'vw', minzoom: 6.5, paint: { 'raster-fade-duration': 500, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 0, 7.4, 1] } },   // K3 와 같은 넘김 — 전국 저줌에서 V-World 사각 경계가 드러나지 않게
      /* 대장 대조 — 대장(연속지적 필지선) 위에 AI와 어긋난 필지가 청록으로 선다 */
      { id: 'ld-parcel', type: 'line', source: 'ld', 'source-layer': 'parcels', minzoom: 13,
        paint: { 'line-color': '#FFFFFF', 'line-width': 0.6, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      { id: 'ld-sus-halo', type: 'line', source: 'ld', 'source-layer': 'suspects',
        paint: { 'line-color': 'rgba(15,169,160,.25)', 'line-width': 4, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      { id: 'ld-sus-fill', type: 'fill', source: 'ld', 'source-layer': 'suspects',
        paint: { 'fill-color': AI, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 750 } } },
      { id: 'ld-sus-line', type: 'line', source: 'ld', 'source-layer': 'suspects',
        paint: { 'line-color': AI, 'line-width': 1.2, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      /* 탐지 점 */
      { id: 'pt-halo', type: 'circle', source: 'pt',
        paint: { 'circle-color': AI, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 11], 'circle-blur': 0.6, 'circle-opacity': 0, 'circle-opacity-transition': { duration: 750 } } },
      { id: 'pt-dot', type: 'circle', source: 'pt',
        paint: { 'circle-color': '#FFFFFF', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 3.5], 'circle-stroke-color': AI, 'circle-stroke-width': 1.5,
          'circle-opacity': 0, 'circle-stroke-opacity': 0, 'circle-opacity-transition': { duration: 750 }, 'circle-stroke-opacity-transition': { duration: 750 } } },
      /* 전역 격자 변화 — 시가지 증가(격자 중심점 · 증가율 가중). 실제로 늘어난 격자만 얇게 빛난다(영상이 60% 이상 그대로 읽힌다) */
      { id: 'grid-heat', type: 'heatmap', source: 'grid',
        paint: { 'heatmap-weight': ['interpolate', ['linear'], ['get', 'd'], Math.min(gridMin, 19), 0.25, 20, 0.5, 50, 0.85, 100, 1],   // d = 시가지 비율 증가(%p)
          'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 9, 5, 11, 14, 13, 40],
          'heatmap-intensity': 1.2,
          'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(15,169,160,0)', 0.12, 'rgba(15,169,160,.16)', 0.35, 'rgba(15,169,160,.48)', 0.65, 'rgba(45,196,186,.7)', 1, 'rgba(150,242,234,.86)'],
          'heatmap-opacity': 0, 'heatmap-opacity-transition': { duration: 750 } } },
      /* 전국 — 시군구별 하천구역 건물 점유(공개 · 252 시군구 면). 5분위가 높을수록 진하고 밝게. 스윕이 지난 자리부터 켜진다 */
      { id: 'kr-fill', type: 'fill', source: 'kr', paint: { 'fill-color': ['get', 'c'], 'fill-opacity': ['case', ['boolean', ['feature-state', 'hot'], false], ['min', 0.9, ['+', ['get', 'o'], 0.3]], ['boolean', ['feature-state', 'on'], false], ['get', 'o'], 0] } },
      { id: 'kr-line', type: 'line', source: 'kr', paint: { 'line-color': '#FFFFFF', 'line-width': 0.5, 'line-opacity': ['case', ['boolean', ['feature-state', 'hot'], false], 0.9, ['boolean', ['feature-state', 'on'], false], 0.3, 0] } },
    ],
  };
  if (!tiles) st.layers = st.layers.filter((l) => l.source !== 'ld');
  return st;
}

const ON = {
  'ld-parcel': [['line-opacity', 0.22]],
  'ld-sus-halo': [['line-opacity', ['match', ['get', 'priority'], 'A', 1, 0]]],
  'ld-sus-fill': [['fill-opacity', ['match', ['get', 'priority'], 'A', 0.5, 'B', 0.24, 0.08]]],
  'ld-sus-line': [['line-opacity', ['match', ['get', 'priority'], 'A', 1, 'B', 0.7, 0.35]]],
  'pt-halo': [['circle-opacity', 0.55]],
  'pt-dot': [['circle-opacity', 1], ['circle-stroke-opacity', 1]],
  'grid-heat': [['heatmap-opacity', 1]],
};
function show(map, ids, on) {
  for (const id of ids) for (const [p, v] of ON[id] || []) map.setPaintProperty(id, p, on ? v : 0);
}

/** 판을 세운다. pad() = 카메라 패딩(글이 얹히는 쪽을 비켜 가운데를 잡는다).
    덮개(ui.cover) = 카드 속 맨 위 사진 한 장. 첫 페인트에는 첫 장면 스틸, 장면을 옮길 때는 떠나는 장면의 마지막 프레임.
    도착지 영상이 다 찬 뒤에만 걷는다 — 카드 속에 회백 빈 판이 드러나는 순간 0. */
export function mountPlate({ el, ui, sweep, credit, pad = () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }) {
  window.__plate = state;
  const cover = ui.cover;

  /* 색인 — 세 축 이름 · 첫 제목을 0초에 세운다(스틸 위라 지도가 늦어도 카드는 비지 않는다) */
  ui.ix.replaceChildren(...AXES.map((a) => { const li = document.createElement('li'); li.dataset.r = a; li.append(a, document.createElement('i')); return li; }));
  ui.ix.style.setProperty('--hold', (HOLD + FLY + 2400) + 'ms');
  let axisNow = null;
  const setAxis = (s, anim = true) => {
    const same = axisNow === s.axis; axisNow = s.axis;
    credit.textContent = s.credit || ''; if (ui.credit2) ui.credit2.textContent = s.credit || '';
    for (const li of ui.ix.children) { li.classList.remove('on'); if (li.dataset.r === s.axis) { void li.offsetWidth; li.classList.add('on'); } }
    if (same) return;                                   // 같은 축의 보조 장면 — 제목은 그대로 둔다
    ui.title.textContent = s.title; ui.line.textContent = s.line;
    if (anim && !REDUCE) for (const [i, n] of [ui.title, ui.line].entries()) { n.classList.remove('t-in'); void n.offsetWidth; n.style.animationDelay = (i * 120) + 'ms'; n.classList.add('t-in'); }
  };
  setAxis({ axis: AXES[0], ...AX[AXES[0]] }, false);
  const lit = () => ui.hero?.classList.add('is-lit');

  /* 덮개 — 켜기는 즉시(전환 없음), 걷기는 750 페이드 */
  const coverOn = (url) => new Promise((res) => {
    const put = () => { cover.style.transition = 'none'; cover.classList.remove('off', 'drift'); void cover.offsetWidth; cover.style.transition = ''; if (!REDUCE) cover.classList.add('drift'); state.covered = true; res(); };
    if (!url) return put();
    const img = new Image(); img.src = url;
    img.decode().then(() => { cover.src = url; put(); }, put);
  });
  const coverOff = () => { cover.classList.add('off'); state.covered = false; };

  if (!window.maplibregl || !el) { state.error = 'no-maplibre'; lit(); return state; }
  if (window.pmtiles && !window.__lxPm) { const p = new window.pmtiles.Protocol({ metadata: true }); window.maplibregl.addProtocol('pmtiles', p.tile); window.__lxPm = p; }

  let map = null;
  /* 카메라 — 'korea' = K3 기본 카메라(대한민국 전역 bounds) · 그 밖은 행에 적힌 그대로.
     전국 카메라는 지도 padding 0 에서 한 번 계산해 캐시한다(앞 장면 easeTo 가 남긴 padding 이 더해져 구도가 밀리지 않게).
     돌려주는 카메라에 padding 0 을 실어 도착할 때 남은 padding 도 걷는다 → 재도착 구도 = 첫 도착 구도. 크기가 바뀌면 다시 계산 */
  const ZERO = { top: 0, bottom: 0, left: 0, right: 0 };
  let korea = null, koreaKey = '';
  const camOf = (s) => {
    if (s.cam === 'korea') {
      const cv = map.getCanvas(), key = cv.clientWidth + 'x' + cv.clientHeight;
      if (!korea || koreaKey !== key) {
        const p0 = map.getPadding(); map.setPadding(ZERO);
        const c = map.cameraForBounds(KOREA, { padding: pad() });
        map.setPadding(p0);
        korea = c ? { center: [c.center.lng ?? c.center[0], c.center.lat ?? c.center[1]], zoom: c.zoom } : { center: [(KOREA[0] + KOREA[2]) / 2, (KOREA[1] + KOREA[3]) / 2], zoom: 6 };
        koreaKey = key;
      }
      return { center: korea.center, zoom: korea.zoom, pitch: s.pitch || 0, bearing: s.bearing || 0, padding: ZERO };
    }
    return { ...s.cam, padding: pad() };
  };

  function run(meta, rows) {
    const SCENES = rows.map(sceneOf);
    try {
      const c0 = SCENES[0].cam === 'korea'
        ? { center: [(KOREA[0] + KOREA[2]) / 2, (KOREA[1] + KOREA[3]) / 2], zoom: 5.4, pitch: 0, bearing: 0 } : SCENES[0].cam;
      map = new window.maplibregl.Map({
        container: el, style: style(rows), center: c0.center, zoom: c0.zoom - 0.6, pitch: c0.pitch, bearing: c0.bearing,
        interactive: false, attributionControl: false, fadeDuration: 300, maxPitch: 60, renderWorldCopies: false,
        canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },   // 장면 전환 때 마지막 프레임을 덮개로 쓴다
        preserveDrawingBuffer: true,
      });
    } catch (e) { state.error = 'webgl'; lit(); return; }
    state.map = map;

    const ready = [];               // 데이터가 선 장면만 순환한다
    const natP = SCENES[0].axis === 'Performance' ? nationalScene(meta.national, SCENES[0]) : Promise.resolve(null);

    const setRes = (s, d) => {
      if (!d.env) { ui.where.textContent = ''; ui.num.textContent = ''; ui.unit.textContent = ''; ui.sig.textContent = ''; return false; }   // 지도만 — 캡션·숫자 없음
      ui.where.textContent = s.where || '';
      ui.num.textContent = nf(d.env.value, d.digits); ui.unit.textContent = s.unit || '';
      ui.sig.innerHTML = sig(d.env);                        // K6 — 기호 3종 + 호버 근거 한 줄(경로·id 제거)
      return true;
    };

    const idle = (ms) => new Promise((res) => { let done = false; const f = () => { if (!done) { done = true; res(); } }; map.once('idle', f); setTimeout(f, ms); });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    /* 보이는 타일이 다 찼는가 — 최대 ms 까지. 찬 뒤 래스터 페이드(500)가 끝날 틈을 둔다 */
    const filled = async (ms) => {
      const t0 = performance.now(); await wait(250);
      while (performance.now() - t0 < ms) { if (map.areTilesLoaded() && !map.isMoving()) break; await wait(120); }
      await wait(520);
    };
    const snapshot = () => { try { return map.getCanvas().toDataURL('image/jpeg', 0.86); } catch { return null; } };

    /* Ctrl K 한 줄 — 글자가 한 자씩 들어가고(40ms) 잠깐 머문 뒤 지도가 떠난다 */
    async function ask(text) {
      const t = ui.askT; t.textContent = ''; ui.ask.classList.add('on');
      if (REDUCE) { t.textContent = text; return; }
      await wait(380);
      for (const ch of text) { t.textContent += ch; await wait(42); }
      await wait(520);
    }

    async function arrive(s, d, prev) {
      state.region = null;
      const cam = camOf(s);
      if (!prev) {
        /* 첫 장면 — 스틸이 덮고 있는 동안 같은 구도로 영상을 채우고, 차면 스틸을 걷고 내려앉는다 */
        map.jumpTo(REDUCE ? cam : { ...cam, zoom: cam.zoom - 0.5 });
        await filled(8000); lit(); coverOff();
        if (!REDUCE) { map.easeTo({ ...cam, duration: 1600, easing: E_CAM }); await wait(1600); }
      } else {
        /* 대륙을 건너는 비행은 저줌 빈 타일을 거친다 — 떠나는 장면의 마지막 프레임을 덮개로 세우고,
           그 밑에서 도착지 근처로 옮겨 영상을 채운 뒤 덮개를 걷고 마지막 구간만 카메라로 내려앉는다.
           제목 · 크레딧 교체도 영상이 찬 뒤(덮개를 걷을 때) 한다. */
        ui.res.classList.add('away');
        if (s.ask && ui.ask) await ask(s.ask);             // Ctrl K 한 줄이 먼저, 지도가 뒤따른다
        await coverOn(snapshot());
        show(map, prev.layers, false); prev.hide?.(map);
        map.jumpTo({ ...cam, zoom: cam.zoom - 1.1, bearing: (cam.bearing || 0) + 8 });
        await filled(9000);
        setAxis(s); coverOff();
        map.easeTo({ ...cam, duration: 1600, easing: E_CAM }); await wait(1600);
      }
      await idle(1400);
      const hasNum = !!d.env;
      const runSweep = () => { sweep.classList.remove('run'); void sweep.offsetWidth; sweep.classList.add('run'); };
      if (s.reveal) {
        show(map, s.layers, true);                          // 층은 켜 두고 시군구는 스윕이 지나갈 때 하나씩(feature-state)
        if (!REDUCE) { sweep.classList.add('fill'); runSweep(); }       // 채움 스윕은 1.8 s · 고른 속도(국토를 가로지르는 동안 차오름이 보이게)
        await s.reveal(map, sweep, 1800);
        sweep.classList.remove('fill');
      } else {
        if (!REDUCE && hasNum) { runSweep(); await wait(1000); }
        show(map, s.layers, true);
      }
      state.region = s.id; state.axis = s.title;
      if (setRes(s, d)) ui.res.classList.remove('away');
      if (ui.ask) setTimeout(() => ui.ask.classList.remove('on'), 900);
      state.arrived++; state.visits.push({ id: s.id, axis: s.title, value: hasNum ? d.env.value : null, at: Date.now() });
      document.documentElement.dataset.plate = s.id;
    }

    map.on('load', async () => {
      state.ready = true;
      ui.res.classList.add('away');
      // 첫 장면을 먼저 세우고, 나머지는 뒤에서 불러온다(첫 페인트를 막지 않는다)
      const nat = await Promise.race([natP, wait(6000).then(() => null)]).catch(() => null);   // 스틸이 덮고 있는 동안 공개 전국 결과를 기다린다(최대 6 s)
      const base0 = SCENES[0];
      if (nat) SCENES[0] = nat;                     // 공개 전국 결과가 있으면 장면 1 을 그 결과로
      const loads = SCENES.map((s) => s.load(map).then((d) => ({ s, d })).catch(() => null));
      if (nat) loads[0] = loads[0].then((x) => x || base0.load(map).then((d) => { SCENES[0] = base0; return { s: base0, d }; }).catch(() => null));   // 면을 못 받으면 전국 지도만
      const first = await loads[0];
      if (first) { ready.push(first); Promise.all(loads.slice(1)).then((xs) => { for (const x of xs) if (x) ready.push(x); }); }
      else {
        const all = (await Promise.all(loads)).filter(Boolean);
        if (!all.length) { state.error = 'no-data'; lit(); return; }       // 결과가 하나도 없으면 스틸 · 3축만 남긴다
        ready.push(...all);
      }
      setAxis(ready[0].s, false);

      let prev = null;
      await arrive(ready[0].s, ready[0].d, null); prev = ready[0].s;
      if (REDUCE) return;
      for (;;) {
        await wait(HOLD);
        if (state.stopped) return;
        if (ready.length < 2) continue;
        // 행 순서(= 축 순서)를 지킨다
        ready.sort((a, b) => SCENES.indexOf(a.s) - SCENES.indexOf(b.s));
        const i = (ready.findIndex((x) => x.s === prev) + 1) % ready.length;
        const { s, d } = ready[i];
        await arrive(s, d, prev); prev = s;
      }
    });
    map.on('error', () => { /* 외부 타일 결손은 잉크 칸으로 남는다 — 콘솔 소음 없음 */ });
    addEventListener('resize', () => { map.resize(); if (state.region) map.easeTo({ ...camOf(ready.find((x) => x.s.id === state.region)?.s || SCENES[0]), duration: 0 }); });
  }

  fetch(SCENES_URL).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((meta) => {
    const rows = (meta?.scenes || []).filter((r) => AX[r.axis]);
    if (!rows.length) { state.error = 'no-data'; lit(); return; }       // 장면 데이터가 없으면 스틸 · 3축만
    run(meta, rows);
  });

  /** 들어갈 때 — 카드가 화면 전체로 펼쳐지는 동안 카메라가 가운데를 다시 잡는다. */
  state.release = () => {
    state.stopped = true;
    coverOff(); lit();
    if (!map) return;
    const t0 = performance.now();
    const tick = () => { map.resize(); if (performance.now() - t0 < 800) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 750, easing: E_CAM });
  };
  return state;
}
