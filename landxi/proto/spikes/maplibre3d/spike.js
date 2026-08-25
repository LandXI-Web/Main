// ══════════════════════════════════════════════════════════════════════
// SPIKE — 「스크롤하면 지구 → 지구 안으로 → 주택·마을이 3D → 구름이 움직인다」
// 스택: MapLibre GL JS 5.6.0 (핀) + GSAP ScrollTrigger + Lenis + three 0.185.1
// 검증 대상 3가지
//   1) 하나의 연속 스크롤 카메라로 궤도 → 국토 → 지역 → 마을 → 거리
//   2) 실제 건물 풋프린트(OSM)로 fill-extrusion 3D 주택이 정사영상 위에 선다
//   3) 움직이는 구름 3안(a CSS 시차 / b GIBS 래스터 / c three 스프라이트) 비교
// ══════════════════════════════════════════════════════════════════════
import * as THREE from 'three';

const q = new URLSearchParams(location.search);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── 좌표 ────────────────────────────────────────────────────────────
// 남원 시내(주택 밀집, OSM 풋프린트가 있는 곳). 과업이 지정한 진입점.
const NAMWON  = [127.39, 35.41];
// 금지면 — 우리 0.6m 정사영상 코어 + AI 검출 비닐하우스 397동이 있는 곳.
const GEUMJI  = [127.3230, 35.3395];
const KOREA   = [127.6, 35.95];
// 밀집 대조군 — OSM 풋프린트가 촘촘한 도심. 시골(남원)과 나란히 봐야 판단이 선다.
const JEONJU  = [127.1530, 35.8155];
const YEOSU   = [127.7395, 34.7452];
// namwon_city_2510 의 0.6m 코어 범위 (imagery.js 와 동일)
const CORE_B  = [127.292609, 35.318037, 127.35883, 35.372294];
const CITY_B  = [127.182606, 35.302858, 127.637309, 35.561786];

const VKEY = (window.VWORLD_KEY || '').trim();
// 키가 있으면 정식 WMTS, 없으면 키 없는 xdworld 폴백. (키는 소스에 두지 않는다)
const VSAT = VKEY
  ? `https://api.vworld.kr/req/wmts/1.0.0/${VKEY}/Satellite/{z}/{y}/{x}.jpeg`
  : 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const GIBS_DATE = q.get('gibs') || new Date(Date.now() - 36e5 * 30).toISOString().slice(0, 10);

// ══════════════════════════════════════════════════════════════════════
// 1. 스타일
// ══════════════════════════════════════════════════════════════════════
const style = {
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  projection: { type: ['interpolate', ['linear'], ['zoom'], 4, 'vertical-perspective', 7, 'mercator'] },
  sky: {
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 1, 6, 0.6, 8, 0],
    'sky-color': '#0a1c40', 'horizon-color': '#8cc0ee', 'fog-color': '#dfeaf8',
    'fog-ground-blend': 0.5, 'horizon-fog-blend': 0.62, 'sky-horizon-blend': 0.86,
  },
  light: { anchor: 'map', position: [1.4, 210, 42], color: '#fff6ea', intensity: 0.42 },
  sources: {
    eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
           tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless © EOX' },
    vsat: { type: 'raster', tiles: [VSAT], tileSize: 256, minzoom: 5, maxzoom: 19,
            bounds: [124.4, 32.9, 132.1, 38.8],   // 국외 타일 요청 차단
            attribution: '© V-World / 국토교통부' },
    gibs: { type: 'raster', tiles: [`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`],
            tileSize: 256, maxzoom: 8, attribution: 'NASA EOSDIS GIBS' },
    ofm: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    dem: { type: 'raster-dem', tiles: ['https://tiles.mapterhorn.com/{z}/{x}/{y}.webp'],
           tileSize: 512, maxzoom: 12, encoding: 'terrarium', attribution: '© Mapterhorn' },
    // 우리 정사영상 — 2m 전역과 0.6m 코어를 소스 2개로 쪼갠다.
    // 그래야 코어 밖에서 z16 타일을 z17.5 까지 늘려 뭉개는 일이 없다.
    ortho_city: { type: 'raster', tiles: ['/landxi/assets/tiles/namwon_city_2510/{z}/{x}/{y}.webp'],
                  tileSize: 256, minzoom: 11, maxzoom: 15, bounds: CITY_B },
    ortho_core: { type: 'raster', tiles: ['/landxi/assets/tiles/namwon_city_2510/{z}/{x}/{y}.webp'],
                  tileSize: 256, minzoom: 15, maxzoom: 17, bounds: CORE_B },
    // 구름 b2 — image 소스. MapLibre v5 래스터에 raster-translate 가 없으므로(실측)
    // 좌표 자체를 매 프레임 옮겨 흘린다.
    cloudsheet: { type: 'image', url: '/landxi/assets/proto/clouds/cloud_far.webp',
                  coordinates: [[124.0, 39.5], [132.0, 39.5], [132.0, 33.0], [124.0, 33.0]] },
    bld: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
    gh:  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'bg', type: 'background', paint: { 'background-color': '#050a14' } },

    { id: 'eox', type: 'raster', source: 'eox',
      paint: { 'raster-fade-duration': 260, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6.5, 1, 8.5, 0] } },

    // 구름 b — GIBS 실제 일자별 위성. raster-translate 로 흘린다.
    { id: 'gibs-clouds', type: 'raster', source: 'gibs', layout: { visibility: 'none' },
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 6, 0.42, 9, 0],
               'raster-contrast': 0.42, 'raster-brightness-min': 0.5, 'raster-saturation': -0.55,
               'raster-fade-duration': 0 } },

    { id: 'cloudsheet', type: 'raster', source: 'cloudsheet', layout: { visibility: 'none' },
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 3, 0, 4.5, 0.55, 9, 0.4, 12, 0],
               'raster-fade-duration': 0 } },

    { id: 'vsat', type: 'raster', source: 'vsat',
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5.5, 0, 8, 1],
               'raster-saturation': 0.06, 'raster-contrast': 0.06, 'raster-fade-duration': 260 } },

    // 우리 정사영상 — z12 부터 위성 위로. 코어는 z15 부터 이어받는다.
    { id: 'ortho-city', type: 'raster', source: 'ortho_city', maxzoom: 15.8,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 11.6, 0, 13, 1, 15.2, 1, 15.8, 0],
               'raster-fade-duration': 240 } },
    { id: 'ortho-core', type: 'raster', source: 'ortho_core', minzoom: 14.6,
      paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 14.6, 0, 15.4, 1], 'raster-fade-duration': 240 } },

    // 도로/수계 — 위성 위 최소한의 판독 보조
    { id: 'water', type: 'fill', source: 'ofm', 'source-layer': 'water', minzoom: 9,
      paint: { 'fill-color': '#123b5c', 'fill-opacity': 0.34 } },
    { id: 'road', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 12,
      filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']]],
      paint: { 'line-color': '#ffe6b8', 'line-opacity': 0.24,
               'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.6, 17, 4] } },

    // ── 3D 건물 ────────────────────────────────────────────────
    // (A) OpenFreeMap building — 비교군. 기본 off.
    { id: 'bld-ofm', type: 'fill-extrusion', source: 'ofm', 'source-layer': 'building',
      minzoom: 14, layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': '#ff9d5c',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.85,
        'fill-extrusion-vertical-gradient': true,
      } },

    // (B) 우리가 구운 OSM 풋프린트 — 주력.
    { id: 'bld', type: 'fill-extrusion', source: 'bld', minzoom: 13.6,
      paint: {
        // 낮은 시골 주택은 밝은 지붕색, 높을수록 회청색 → 마을의 스케일감이 읽힌다
        'fill-extrusion-color': ['interpolate', ['linear'], ['get', 'h'],
          3, '#f2ece2', 7, '#dcd3c6', 12, '#b9bec8', 24, '#8f9cb2', 45, '#6f8098'],
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.6, 0, 15.2, ['get', 'h']],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13.6, 0, 15.2, 0.95],
        'fill-extrusion-vertical-gradient': true,
      } },

    // (C) AI 검출 비닐하우스 — 청록 4m
    { id: 'gh', type: 'fill-extrusion', source: 'gh', minzoom: 13,
      paint: {
        'fill-extrusion-color': '#2fe3c4',
        'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.8, 4],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.6, 0.5],
        'fill-extrusion-vertical-gradient': true,
      } },

    { id: 'place', type: 'symbol', source: 'ofm', 'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      minzoom: 4, maxzoom: 13,
      layout: { 'text-field': ['coalesce', ['get', 'name:ko'], ['get', 'name']],
                'text-font': ['Noto Sans Regular'], 'text-size': 12, 'text-letter-spacing': 0.06 },
      paint: { 'text-color': '#eef7ff', 'text-halo-color': '#031020', 'text-halo-width': 1.5, 'text-opacity': 0.8 } },
  ],
};

const map = new maplibregl.Map({
  container: 'map', style, center: [127.5, 31], zoom: 2.05, pitch: 0, bearing: 0,
  antialias: true, maxPitch: 80, attributionControl: { compact: true },
  // 스크롤은 우리가 GSAP 로 몬다. 지도 자체 스크롤 줌은 끈다.
  scrollZoom: false, dragRotate: true, touchZoomRotate: false, boxZoom: false, doubleClickZoom: false,
});
window.map = map;

// ══════════════════════════════════════════════════════════════════════
// 2. 구름 c — three.js 스프라이트 덱 (CustomLayer)
//    실 고도 1.5~3km 에 판을 띄운다. 카메라가 마을로 내려가면 구름 밑을 통과한다.
// ══════════════════════════════════════════════════════════════════════
function cloudDeck(center, { n = 46, lo = 1500, hi = 3000, spread = 0.34, drift = 0.000018 } = {}) {
  return {
    id: 'three-clouds', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      this.map = m;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.renderer = new THREE.WebGLRenderer({ canvas: m.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
      this.t0 = performance.now();
      this.puffs = [];
      const tex = new THREE.TextureLoader().load('/landxi/assets/proto/clouds/cloud_near.webp');
      tex.colorSpace = THREE.SRGBColorSpace;
      // 스프라이트는 항상 카메라를 향한다 → 낮은 폴리곤 수로 볼륨감을 낸다
      for (let i = 0; i < n; i++) {
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true,
          opacity: 0.16 + Math.random() * 0.24, depthWrite: false, depthTest: true });
        const s = new THREE.Sprite(mat);
        const alt = lo + Math.random() * (hi - lo);
        s.userData = {
          lng: center[0] + (Math.random() - 0.5) * spread,
          lat: center[1] + (Math.random() - 0.5) * spread * 0.78,
          alt, scale: (900 + Math.random() * 2600),
          v: drift * (0.55 + Math.random() * 0.9),
        };
        this.puffs.push(s); this.scene.add(s);
      }
      this.scene.add(new THREE.AmbientLight(0xffffff, 2.0));
      this.on = true;
    },
    render(gl, args) {
      if (!this.on) return;
      const dt = (performance.now() - this.t0) / 1000;
      const pd = args.defaultProjectionData;
      // 덱 전체의 기준점을 중심 좌표에 두고, 각 스프라이트는 상대 위치로 배치한다.
      const base = maplibregl.MercatorCoordinate.fromLngLat(center, 0);
      const mpu = base.meterInMercatorCoordinateUnits();
      for (const s of this.puffs) {
        const u = s.userData;
        const lng = u.lng + (REDUCE ? 0 : u.v * dt * 1000);
        const c = maplibregl.MercatorCoordinate.fromLngLat([lng, u.lat], u.alt);
        s.position.set((c.x - base.x) / mpu, -(c.y - base.y) / mpu, (c.z - base.z) / mpu);
        s.scale.set(u.scale, u.scale, 1);
      }
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(pd.mainMatrix)
        .multiply(new THREE.Matrix4().makeTranslation(base.x, base.y, base.z))
        .multiply(new THREE.Matrix4().makeScale(mpu, -mpu, mpu));
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
  };
}

// ══════════════════════════════════════════════════════════════════════
// 3. 카메라 타임라인 — 하나의 연속 스크롤
// ══════════════════════════════════════════════════════════════════════
// [progress, lng, lat, zoom, pitch, bearing]
const KEYS = [
  [0.00, 127.50, 31.00,  2.05,  0,   0],
  [0.09, 127.50, 33.60,  3.10,  0,  -8],
  [0.18, 127.60, 35.30,  4.40, 12, -14],
  [0.29, KOREA[0], KOREA[1], 6.60, 44, -18],
  [0.40, 127.46, 35.62,  9.20, 52, -12],
  [0.50, NAMWON[0], NAMWON[1] + 0.030, 11.80, 60,  -6],
  [0.59, NAMWON[0], NAMWON[1] + 0.012, 14.20, 64,   6],
  [0.67, NAMWON[0], NAMWON[1] + 0.003, 16.40, 67,  18],
  [0.74, NAMWON[0] + 0.0012, NAMWON[1] - 0.0008, 17.50, 68, 30],
  [0.81, GEUMJI[0], GEUMJI[1], 15.20, 62, 18],
  [0.88, GEUMJI[0], GEUMJI[1], 17.20, 68, -4],
  [1.00, JEONJU[0], JEONJU[1], 17.30, 68, 24],
];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
function camAt(p) {
  p = Math.min(1, Math.max(0, p));
  let i = 0; while (i < KEYS.length - 2 && p > KEYS[i + 1][0]) i++;
  const A = KEYS[i], B = KEYS[i + 1];
  const t = ease((p - A[0]) / (B[0] - A[0] || 1));
  return { center: [lerp(A[1], B[1], t), lerp(A[2], B[2], t)],
           zoom: lerp(A[3], B[3], t), pitch: lerp(A[4], B[4], t), bearing: lerp(A[5], B[5], t) };
}

const STAGES = [
  [0.00, '궤도',   '지구 · Sentinel-2 무운 · 대기광'],
  [0.12, '접근',   '대기권 진입 · 구름층'],
  [0.25, '국토',   '대한민국 · V-World 위성'],
  [0.44, '지역',   '남원 · Mapterhorn 지형 ON'],
  [0.56, '마을',   '정사영상 2m → 위성 위로'],
  [0.65, '거리',   'OSM 풋프린트 3D · 실측 높이'],
  [0.79, '금지면', '정사영상 0.6m · AI 검출 온실 4m'],
  [0.93, '전주',   '밀집 대조군 · 한옥마을'],
];
// 지형은 이 구간에서만 켠다 — 성능 절벽이 여기 하나뿐이기 때문(조사 §7.2)
const TERRAIN_IN = [0.34, 0.70];

let terrainOn = false;
function applyTerrain(p) {
  const want = p >= TERRAIN_IN[0] && p <= TERRAIN_IN[1];
  if (want === terrainOn) return;
  terrainOn = want;
  map.setTerrain(want ? { source: 'dem', exaggeration: 1.5 } : null);
  document.getElementById('n-terrain').textContent = want ? 'ON ×1.5' : 'off';
}

let progress = 0;
function seek(p) {
  progress = Math.min(1, Math.max(0, p));
  const c = camAt(progress);
  applyTerrain(progress);
  // 전주 구간이 다가오면 미리 붙인다 (스크롤이 도착했을 때 이미 서 있게)
  if (progress > 0.72 && !loaded.has('jeonju')) ensure(['jeonju']);
  map.jumpTo(c);
  paintHud(c);
  driftCss(c);
}
let lastEle = 0;
function paintHud(c) {
  // MapLibre 는 카메라 실고도를 직접 안 주므로 스케일에서 역산한다.
  const alt = (40075016.686 * Math.cos(c.center[1] * Math.PI / 180) / Math.pow(2, c.zoom + 8)) * innerHeight
            / (2 * Math.tan(map.transform.fovInRadians ? map.transform.fovInRadians / 2 : 0.6435));
  const km = alt / 1000;
  document.getElementById('n-alt').textContent = km >= 10 ? Math.round(km) + ' km'
    : km >= 1 ? km.toFixed(1) + ' km' : Math.round(alt) + ' m';
  document.getElementById('n-zoom').textContent = c.zoom.toFixed(2);
  document.getElementById('n-pitch').textContent = Math.round(c.pitch) + '°';
  // ⚠ queryTerrainElevation 은 GPU 리드백을 유발한다. 매 프레임 호출하면
  //   "READ-usage buffer ... discarded the shadow copy" 경고가 쏟아지고 프레임이 씹힌다.
  //   HUD 표시용이므로 4Hz 로 충분하다.
  const now = performance.now();
  if (now - lastEle > 250) {
    lastEle = now;
    const e = terrainOn ? map.queryTerrainElevation(c.center) : null;
    document.getElementById('n-ele').textContent = e == null ? '—' : Math.round(e) + ' m';
  }
  let s = STAGES[0]; for (const k of STAGES) if (progress >= k[0]) s = k;
  const st = document.getElementById('hud-stage');
  if (st.textContent !== s[1]) { st.textContent = s[1]; document.getElementById('hud-sub').textContent = s[2]; }
}

// ── 구름 a : CSS 시차. 고도에 따라 세기와 시차량이 바뀐다 ──────────
const cssRoot = document.getElementById('cssclouds');
const cssLayers = [...cssRoot.querySelectorAll('.cl')];
const CSS_DEPTH = [0.22, 0.46, 1.0, 0.12];   // far / mid / near / haze
function driftCss(c) {
  // 구름은 z3~z13 사이에서만 의미가 있다. 그 밖에서는 투명.
  const w = c.zoom < 2.6 ? 0 : c.zoom < 4.2 ? (c.zoom - 2.6) / 1.6
          : c.zoom < 9 ? 1 : c.zoom < 13.2 ? 1 - (c.zoom - 9) / 4.2 : 0;
  cssRoot.style.setProperty('--w', w.toFixed(3));
  cssRoot.style.opacity = cssOn ? w : 0;
  const t = performance.now() / 1000;
  cssLayers.forEach((el, i) => {
    const d = CSS_DEPTH[i];
    // 카메라가 내려갈수록 근경 구름이 커지며 화면 밖으로 흘러나간다 → 통과감
    const s = 1 + d * Math.max(0, c.zoom - 5) * 0.22;
    const x = -(t * 14 * d) % 2000;
    el.style.backgroundPosition = `${x}px ${50 - d * (c.pitch * 0.25)}%`;
    el.style.transform = `scale(${s.toFixed(3)}) translate3d(0,${(d * (c.zoom - 5) * -1.4).toFixed(1)}%,0)`;
  });
}

// ══════════════════════════════════════════════════════════════════════
// 4. 부팅
// ══════════════════════════════════════════════════════════════════════
let cssOn = true, threeOn = true, gibsOn = false;
const stats = { bld: 0, ofm: 0, gh: 0, sources: {} };

async function loadJson(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }

// 지역별 지연 로딩 — 이미 붙은 지역은 다시 받지 않는다.
const loaded = new Map();
let pending = null;
async function ensure(ids) {
  const need = ids.filter((id) => !loaded.has(id));
  if (!need.length) return;
  for (const id of need) {
    loaded.set(id, []);   // 중복 요청 방지
    try {
      const g = await loadJson(`data/buildings-${id}.geojson`);
      loaded.set(id, g.features);
      stats.sources[id] = g.features.length;
    } catch (e) { console.warn('풋프린트 없음', id); stats.sources[id] = 0; }
  }
  const all = [].concat(...loaded.values());
  stats.bld = all.length;
  map.getSource('bld').setData({ type: 'FeatureCollection', features: all });
  const el = document.getElementById('n-bld');
  if (el) el.textContent = `${stats.bld} / 온실 ${stats.gh}`;
}

const boot = (m) => { const el = document.getElementById('boot'); if (el) el.textContent = m; console.log('boot:', m); };

map.on('load', async () => {
 try {
  boot('스타일 로드됨');
  // 풋프린트는 지역별로 지연 로딩한다. 여수 3.5MB / 전주 1.5MB 를 첫 화면에서
  // 다 받으면 궤도 장면이 늦어진다 — 카메라가 다가올 때 붙인다.
  await ensure(['namwon', 'geumji']);

  try {
    const g = await loadJson('data/greenhouse-core.geojson');
    stats.gh = g.features.length;
    map.getSource('gh').setData(g);
  } catch (e) { console.warn('온실 없음'); }

  document.getElementById('n-bld').textContent = `${stats.bld} / 온실 ${stats.gh}`;

  // 구름 c
  map.addLayer(cloudDeck(NAMWON, { n: 46, lo: 1500, hi: 3000, spread: 0.42 }));

  // 구름 b 흘리기 — GIBS 는 정지(그날의 실제 구름), image 구름장은 좌표를 옮겨 흐른다.
  const SHEET = [[124.0, 39.5], [132.0, 39.5], [132.0, 33.0], [124.0, 33.0]];
  let gt = 0;
  setInterval(() => {
    if (!gibsOn || REDUCE) return;
    gt = (gt + 0.006) % 8;           // 8도 주기로 되감는다(이음매는 seam 이 보인다 — 한계)
    map.getSource('cloudsheet').setCoordinates(SHEET.map(([x, y]) => [x + gt, y]));
  }, 60);

  seek(0);
  wire();
  document.getElementById('boot').classList.add('gone');
  document.body.dataset.ready = '1';
 } catch (e) { boot('부팅 실패: ' + e.message); console.error(e); }
});

map.on('error', (e) => console.warn('map error:', e && e.error && e.error.message));

// ── 스크롤 배선 ─────────────────────────────────────────────────────
function wire() {
  const trigger = document.getElementById('scroll');
  if (!REDUCE && window.Lenis) {
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
    lenis.on('scroll', () => ScrollTrigger.update());
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.create({
    trigger, start: 'top top', end: 'bottom bottom',
    scrub: REDUCE ? false : 0.55,
    onUpdate: (self) => seek(self.progress),
  });

  const bind = (id, fn) => document.getElementById(id).addEventListener('change', (e) => fn(e.target.checked));
  bind('t-css', (v) => { cssOn = v; driftCss(camAt(progress)); });
  bind('t-three', (v) => { threeOn = v; const l = map.getLayer('three-clouds'); if (l) l.implementation.on = v; map.triggerRepaint(); });
  bind('t-gibs', (v) => {
    gibsOn = v;
    map.setLayoutProperty('gibs-clouds', 'visibility', v ? 'visible' : 'none');
    map.setLayoutProperty('cloudsheet', 'visibility', v ? 'visible' : 'none');
  });
  bind('t-ofm', (v) => {
    map.setLayoutProperty('bld-ofm', 'visibility', v ? 'visible' : 'none');
    if (v) setTimeout(() => {
      const f = map.querySourceFeatures('ofm', { sourceLayer: 'building' });
      stats.ofm = f.length;
      const hh = f.filter((x) => x.properties.render_height != null).length;
      console.log('OpenFreeMap building:', f.length, '· render_height 보유', hh);
      document.getElementById('n-bld').textContent = `${stats.bld} / OFM ${f.length}`;
    }, 1200);
  });

  // rAF FPS
  let last = performance.now(), acc = 0, frames = 0, worst = 999;
  (function tick(t) {
    acc += t - last; frames++; last = t;
    if (acc >= 500) {
      const f = frames * 1000 / acc;
      if (progress > 0.02) worst = Math.min(worst, f);
      document.getElementById('fps').textContent = f.toFixed(0) + ' fps';
      document.getElementById('fps-min').textContent = worst < 999 ? 'min ' + worst.toFixed(0) : '';
      window.__fpsNow = f;
      acc = 0; frames = 0;
    }
    requestAnimationFrame(tick);
  })(performance.now());
  // CSS 구름은 rAF 로 계속 흘러야 한다(스크롤이 멈춰도 움직인다)
  (function drift() { if (cssOn) driftCss(camAt(progress)); requestAnimationFrame(drift); })();
}

// ── 자동 검증용 훅 ──────────────────────────────────────────────────
window.__spike = {
  seek: (p) => { window.scrollTo(0, (document.body.scrollHeight - innerHeight) * p); seek(p); },
  jump: seek,
  stats: () => stats,
  fps: () => window.__fpsNow || 0,
  // 타일이 다 붙었는지 — 흐린 스크린샷 방지
  ready: () => map.areTilesLoaded() && map.isStyleLoaded(),
  toggle: (k, v) => { const el = document.getElementById(k); el.checked = v; el.dispatchEvent(new Event('change')); },
  ensure,
  counts: () => {
    // ⚠ MapLibre v5 의 queryRenderedFeatures 에 옵션 객체만 넘기면 0 이 나온다(실측).
    //   뷰포트 사각형을 명시해야 fill-extrusion 이 잡힌다.
    const box = [[0, 0], [innerWidth, innerHeight]];
    const qr = (l) => { try { return map.queryRenderedFeatures(box, { layers: [l] }).length; } catch { return 0; } };
    return { bld: qr('bld'), gh: qr('gh'),
             ofm: map.querySourceFeatures('ofm', { sourceLayer: 'building' }).length,
             loadedBld: stats.bld, loadedGh: stats.gh };
  },
};
