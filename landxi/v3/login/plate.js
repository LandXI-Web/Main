/* 실결과 판 — 정문 왼쪽의 영상 무대 한 장.
   실제 영상(V-World 위성 · EOX Sentinel-2) 위에 실제 판독 결과를 얹고, 지역을 바꿔 가며 카메라가 이동한다.
   지역은 변수다: 국내 2(남원 · 여수) + 해외 1(비슈케크). 숫자는 전부 결과 파일에서 읽는다(지어낸 값 0).
   데이터가 없으면 그 지역은 건너뛴다(판에 거짓 숫자를 세우지 않는다).
   유휴 모션 = 이 순환 하나(주기 ≥ 6 s). 축소 모션이면 첫 지역에 멈춘다. */

const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const DATA = new URL('../../data/', import.meta.url).href;            // /landxi/data/ (junction)
const GEO = new URL('../../assets/data/geo/results/', import.meta.url).href;
const AI = '#0FA9A0';
const HOLD = 6500;          // 도착 후 머무는 시간(ms)
const FLY = 2400;           // 카메라 사다리 최상단

/* e-cam = cubic-bezier(.16,1,.3,1) — 법전 §3 */
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => { let t = x; for (let i = 0; i < 6; i++) { const e = sx(t) - x, d = dx(t); if (Math.abs(e) < 1e-5 || !d) break; t -= e / d; } return sy(Math.min(1, Math.max(0, t))); };
}
const E_CAM = bezier(.16, 1, .3, 1);
const fmt = (v, d = 0) => Number(v).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ── 지역 정의 — 카메라와 층 이름만. 숫자는 load() 가 파일에서 채운다. ── */
const REGIONS = [
  {
    id: 'namwon', name: '남원시', task: '농지 실태조사', unit: '대장과 다른 필지', credit: '© V-World',
    cam: { center: [127.6245, 35.5150], zoom: 15.0, pitch: 42, bearing: -14 },
    layers: ['sv-parcel', 'sv-sus-halo', 'sv-sus-fill', 'sv-sus-line'],
    async load() {
      const r = await fetch(DATA + 'survey/findings-emd.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('findings');
      const j = await r.json();
      return { value: fmt(j.totals.suspect_parcels), sig: '~', tip: `V-World 연속지적 × AI 판독 · ${j.as_of} · 현장 확인 전` };
    },
  },
  {
    id: 'yeosu', name: '여수시', task: '해양쓰레기', unit: '탐지 객체', credit: '© V-World',
    cam: { center: [127.6842, 34.5738], zoom: 17.4, pitch: 38, bearing: 24 },
    layers: ['ys-halo', 'ys-dot'],
    async load(map) {
      const r = await fetch(GEO + 'yeosu-marine-2026-drone.geojson');
      if (!r.ok) throw new Error('yeosu');
      const g = await r.json();
      const pts = { type: 'FeatureCollection', features: g.features.map((f) => ({ type: 'Feature', properties: { conf: f.properties.conf }, geometry: { type: 'Point', coordinates: centroid(f.geometry) } })) };
      map.getSource('ys').setData(pts);
      return { value: fmt(g.features.length), sig: '~', tip: '드론 정사영상 × AI 판독 · 2026 · 검수 전' };
    },
  },
  {
    id: 'kgz', name: '비슈케크 · 키르기스스탄', task: '도시 확장 2017→2025', unit: 'km² 늘어남', credit: '© EOX · Esri/IO',
    cam: { center: [74.58, 42.875], zoom: 10.5, pitch: 36, bearing: 0 },
    layers: ['kg-fill'],
    async load(map) {
      const r = await fetch(DATA + 'global/kgz-sprawl-2017-2025.json');
      if (!r.ok) throw new Error('kgz');
      const j = await r.json();
      map.getSource('kg').setData({ type: 'FeatureCollection', features: j.grid.features.filter((f) => f.properties.d > 0) });
      const d = j.summary.delta_km2;
      return { value: fmt(d.value, 1), sig: '~', tip: `Sentinel-2 토지피복 2017 → 2025 · ${d.as_of} · 근사치` };
    },
  },
];

function centroid(geom) {
  let c = geom.coordinates; while (Array.isArray(c[0][0])) c = c[0];
  let x = 0, y = 0; for (const p of c) { x += p[0]; y += p[1]; } return [x / c.length, y / c.length];
}

function style() {
  const surveyUrl = 'pmtiles://' + new URL('survey/namwon-parcel-survey.pmtiles', DATA).href;
  return {
    version: 8,
    sources: {
      eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2025_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 14 },
      vw: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 6, maxzoom: 19, bounds: [124.5, 33.0, 131.9, 38.7] },
      sv: { type: 'vector', url: surveyUrl },
      ys: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      kg: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    },
    transition: { duration: 0, delay: 0 },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b0f14' } },
      { id: 'eox', type: 'raster', source: 'eox', paint: { 'raster-fade-duration': 500 } },
      { id: 'vw', type: 'raster', source: 'vw', paint: { 'raster-fade-duration': 500 } },
      /* 남원 — 대장(연속지적 필지선) 위에 AI와 어긋난 필지가 청록으로 선다 */
      { id: 'sv-parcel', type: 'line', source: 'sv', 'source-layer': 'parcels', minzoom: 13,
        paint: { 'line-color': '#FFFFFF', 'line-width': 0.6, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      { id: 'sv-sus-halo', type: 'line', source: 'sv', 'source-layer': 'suspects',
        paint: { 'line-color': 'rgba(15,169,160,.25)', 'line-width': 4, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      { id: 'sv-sus-fill', type: 'fill', source: 'sv', 'source-layer': 'suspects',
        paint: { 'fill-color': AI, 'fill-opacity': 0, 'fill-opacity-transition': { duration: 750 } } },
      { id: 'sv-sus-line', type: 'line', source: 'sv', 'source-layer': 'suspects',
        paint: { 'line-color': AI, 'line-width': 1.2, 'line-opacity': 0, 'line-opacity-transition': { duration: 750 } } },
      /* 여수 — 해양쓰레기 탐지 점 */
      { id: 'ys-halo', type: 'circle', source: 'ys',
        paint: { 'circle-color': AI, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 11], 'circle-blur': 0.6, 'circle-opacity': 0, 'circle-opacity-transition': { duration: 750 } } },
      { id: 'ys-dot', type: 'circle', source: 'ys',
        paint: { 'circle-color': '#FFFFFF', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 3.5], 'circle-stroke-color': AI, 'circle-stroke-width': 1.5,
          'circle-opacity': 0, 'circle-stroke-opacity': 0, 'circle-opacity-transition': { duration: 750 }, 'circle-stroke-opacity-transition': { duration: 750 } } },
      /* 비슈케크 — 2017 → 2025 시가지 증가 500 m 격자 */
      { id: 'kg-fill', type: 'fill', source: 'kg',
        paint: { 'fill-color': AI, 'fill-outline-color': 'rgba(15,169,160,0)', 'fill-opacity': 0, 'fill-opacity-transition': { duration: 750 } } },
    ],
  };
}

const ON = {
  'sv-parcel': [['line-opacity', 0.22]],
  'sv-sus-halo': [['line-opacity', ['match', ['get', 'priority'], 'A', 1, 0]]],
  'sv-sus-fill': [['fill-opacity', ['match', ['get', 'priority'], 'A', 0.5, 'B', 0.24, 0.08]]],
  'sv-sus-line': [['line-opacity', ['match', ['get', 'priority'], 'A', 1, 'B', 0.7, 0.35]]],
  'ys-halo': [['circle-opacity', 0.55]],
  'ys-dot': [['circle-opacity', 1], ['circle-stroke-opacity', 1]],
  'kg-fill': [['fill-opacity', ['interpolate', ['linear'], ['get', 'd'], 0, 0.04, 0.2, 0.16, 0.6, 0.5, 1, 0.72]]],
};
function show(map, ids, on) {
  for (const id of ids) for (const [p, v] of ON[id]) map.setPaintProperty(id, p, on ? v : 0);
}

/** 판을 세운다. door = 오른쪽 문 폭(px) — 카메라 중심을 보이는 판 가운데로. */
export function mountPlate({ el, cap, sweep, ticks, credit, padRight = () => 520 }) {
  const state = { region: null, arrived: 0, ready: false, error: null, visits: [] };
  window.__plate = state;
  if (!window.maplibregl || !el) { state.error = 'no-maplibre'; return state; }

  if (window.pmtiles && !window.__lxPm) { const p = new window.pmtiles.Protocol({ metadata: true }); window.maplibregl.addProtocol('pmtiles', p.tile); window.__lxPm = p; }

  let map;
  try {
    const c0 = REGIONS[0].cam;
    map = new window.maplibregl.Map({
      container: el, style: style(), center: c0.center, zoom: c0.zoom - 1.2, pitch: c0.pitch, bearing: c0.bearing + 8,
      interactive: false, attributionControl: false, fadeDuration: 300, maxPitch: 60, renderWorldCopies: false,
    });
  } catch (e) { state.error = 'webgl'; return state; }
  state.map = map;

  const pad = () => ({ top: 0, bottom: 0, left: 0, right: window.innerWidth > 960 ? padRight() : 0 });
  const ready = [];               // 데이터가 선 지역만 순환한다
  ticks.replaceChildren(...REGIONS.map((r) => { const li = document.createElement('li'); li.dataset.r = r.id; return li; }));

  const setCap = (r, d) => {
    for (const li of ticks.children) li.classList.toggle('on', li.dataset.r === r.id);
    cap.name.textContent = r.name; cap.task.textContent = r.task;
    cap.num.textContent = d.value; cap.unit.textContent = r.unit;
    cap.sigK.textContent = d.sig; cap.tip.textContent = d.tip;
    credit.textContent = r.credit;
    if (!REDUCE) for (const [i, n] of [cap.where, cap.row].entries()) { n.classList.remove('t-in'); void n.offsetWidth; n.style.animationDelay = (i * 60) + 'ms'; n.classList.add('t-in'); }
  };

  const idle = (ms) => new Promise((res) => { let done = false; const f = () => { if (!done) { done = true; res(); } }; map.once('idle', f); setTimeout(f, ms); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  async function arrive(r, d, first) {
    state.region = null;
    if (!first && cap.root) cap.root.classList.add('away');     // 떠나는 동안 캡션은 비운다(판과 글이 어긋나지 않게)
    const cam = { ...r.cam, padding: pad() };
    if (REDUCE) map.jumpTo(cam);
    else if (first) map.easeTo({ ...cam, duration: FLY, easing: E_CAM });
    else map.flyTo({ ...cam, duration: FLY, easing: E_CAM, curve: 1.6, essential: true });
    await wait(REDUCE ? 0 : FLY);
    await idle(1400);
    if (!REDUCE) { sweep.classList.remove('run'); void sweep.offsetWidth; sweep.classList.add('run'); await wait(1000); }
    show(map, r.layers, true);
    state.region = r.id;
    setCap(r, d);
    cap.root?.classList.remove('away');
    state.arrived++; state.visits.push({ id: r.id, value: d.value, at: Date.now() });
    document.documentElement.dataset.plate = r.id;
  }

  map.on('load', async () => {
    state.ready = true;
    // 첫 지역을 먼저 세우고, 나머지는 뒤에서 불러온다(첫 페인트를 막지 않는다)
    const loads = REGIONS.map((r) => r.load(map).then((d) => ({ r, d })).catch(() => null));
    const first = await loads[0];
    if (first) { ready.push(first); Promise.all(loads.slice(1)).then((xs) => { for (const x of xs) if (x) ready.push(x); }); }
    else { const all = (await Promise.all(loads)).filter(Boolean); if (!all.length) { state.error = 'no-data'; return; } ready.push(...all); }

    let i = 0, prev = null;
    await arrive(ready[0].r, ready[0].d, true); prev = ready[0].r;
    if (REDUCE) return;
    for (;;) {
      await wait(HOLD);
      if (state.stopped) return;
      if (ready.length < 2) continue;
      i = (i + 1) % ready.length;
      const { r, d } = ready[i];
      show(map, prev.layers, false);
      await arrive(r, d, false); prev = r;
    }
  });
  map.on('error', () => { /* 외부 타일 결손은 판의 빈 칸으로 남는다 — 콘솔 소음 없음 */ });

  addEventListener('resize', () => { if (state.region) map.easeTo({ padding: pad(), duration: 0 }); });

  /** 들어갈 때 — 문이 걷히는 동안 판이 전면이 된다(패딩 0으로 카메라가 가운데를 다시 잡는다). */
  state.release = () => { state.stopped = true; map.easeTo({ padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: 750, easing: E_CAM }); };
  return state;
}
