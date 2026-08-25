/* 데모 (a) — MapLibre 5.6.0. 글로브에서 남원 정사영상까지 한 대의 카메라.
   소스: EOX s2cloudless(전지구) → xdworld 위성(키 없음, z5–19) → 우리 namwon_city_2510(z11–17). */

const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const XD_SAT = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const XD_HYB = 'https://xdworld.vworld.kr/2d/Hybrid/service/{z}/{x}/{y}.png';
const DEM = 'https://tiles.mapterhorn.com/{z}/{x}/{y}.webp';
const T = '../../../assets/tiles';
const NW_BOUNDS = [127.182606, 35.302858, 127.637309, 35.561786];

/* 결과 판 — 실제로 분석 결과가 있는 지점만 올린다. 좌표·줌 범위는 타일셋에서 실측했다. */
export const PLATES = [
  { id: 'city',   ko: '남원 시 전역',   src: 'namwon_city_2510', minzoom: 11, maxzoom: 17,
    bounds: NW_BOUNDS,                                     center: [127.3247, 35.3454], zoom: 16.2, pitch: 34, bearing: -8 },
  { id: 'drone',  ko: '남원 드론 AOI',  src: 'namwon_2510', minzoom: 12, maxzoom: 19,
    bounds: [127.3481, 35.5276, 127.3567, 35.5347],        center: [127.3524, 35.5311], zoom: 18.1, pitch: 46, bearing: 18 },
  { id: 'kuksan', ko: '군산 국산 A71',  src: 'kuksan_a71', minzoom: 13, maxzoom: 19,
    bounds: [126.973996, 35.825613, 126.992145, 35.838284], center: [126.9831, 35.8320], zoom: 17.4, pitch: 52, bearing: -26 },
  { id: 'jeju',   ko: '제주 애월',      src: 'jeju_2022', minzoom: 13, maxzoom: 19,
    bounds: [126.81996, 33.504972, 126.82504, 33.510028],   center: [126.8224, 33.5076], zoom: 18.4, pitch: 40, bearing: 8 },
];

const ramp = (...s) => ['interpolate', ['linear'], ['zoom'], ...s];

export function style() {
  return {
    version: 8,
    projection: { type: 'globe' },
    sources: {
      eox: { type: 'raster', tiles: [EOX], tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless © EOX' },
      vsat: { type: 'raster', tiles: [XD_SAT], tileSize: 256, minzoom: 5, maxzoom: 19, attribution: '© V-World' },
      vhyb: { type: 'raster', tiles: [XD_HYB], tileSize: 256, minzoom: 5, maxzoom: 19 },
      ...Object.fromEntries(PLATES.map((p) => [`o_${p.id}`, {
        type: 'raster', tiles: [`${T}/${p.src}/{z}/{x}/{y}.webp`], tileSize: 256,
        minzoom: p.minzoom, maxzoom: p.maxzoom, bounds: p.bounds, attribution: 'LX 정사영상' }])),
      dem: { type: 'raster-dem', tiles: [DEM], tileSize: 512, maxzoom: 12, encoding: 'terrarium',
             bounds: [124.0, 32.5, 132.0, 39.5], attribution: '© Mapterhorn' },
      dem2: { type: 'raster-dem', tiles: [DEM], tileSize: 512, maxzoom: 12, encoding: 'terrarium',
              bounds: [124.0, 32.5, 132.0, 39.5] },
    },
    sky: {
      'atmosphere-blend': ramp(0, 1, 3.2, 0.72, 5.6, 0.28, 9, 0.12),
      'sky-color': '#0A1A3C', 'horizon-color': '#88B3E2', 'fog-color': '#B7CFE8',
      'fog-ground-blend': 0.92, 'horizon-fog-blend': 0.88, 'sky-horizon-blend': 0.9,
    },
    light: { anchor: 'map', position: [1.4, 120, 62], color: '#FFF6E6', intensity: 0.42 },
    layers: [
      /* 함정: **완전 불투명한 background 는 위의 raster 를 가린다.**
         MapLibre 는 불투명 레이어를 opaque 패스에서 깊이버퍼와 함께 먼저 그리므로,
         translucent 패스로 가는 raster 가 깊이 테스트에서 탈락한다. 레이어 순서와 무관하다.
         알파를 1 미만으로만 두면(0.999) translucent 패스로 내려와 순서대로 그려진다. */
      { id: 'bg', type: 'background', paint: {
        'background-opacity': 0.999,
        'background-color': ramp(5.2, 'rgba(246,244,240,0)', 6.4, 'rgba(28,48,78,1)', 11, 'rgba(78,108,148,1)') } },
      { id: 'eox', type: 'raster', source: 'eox',
        paint: { 'raster-opacity': ramp(6.6, 1, 8.2, 0), 'raster-fade-duration': 0, 'raster-saturation': 0.05 } },
      { id: 'hillshade', type: 'hillshade', source: 'dem', minzoom: 4, maxzoom: 13,
        paint: { 'hillshade-exaggeration': ramp(4, 0, 6.5, 0.42, 12, 0.16),
                 'hillshade-shadow-color': '#20303F', 'hillshade-highlight-color': '#FFF8EC' } },
      { id: 'vsat', type: 'raster', source: 'vsat', minzoom: 5,
        paint: { 'raster-opacity': ramp(5.4, 0, 7.4, 1), 'raster-fade-duration': 0 } },
      // 시 전역 정사영상은 강하 구간에서 줌으로 켜지고, 나머지 판은 클릭할 때만 켜진다.
      { id: 'o_city', type: 'raster', source: 'o_city', minzoom: 11,
        paint: { 'raster-opacity': ramp(11.6, 0, 12.8, 1), 'raster-fade-duration': 0 } },
      ...PLATES.slice(1).map((p) => ({ id: `o_${p.id}`, type: 'raster', source: `o_${p.id}`, minzoom: p.minzoom,
        paint: { 'raster-opacity': 0, 'raster-opacity-transition': { duration: 520 }, 'raster-fade-duration': 0 } })),
      { id: 'vhyb', type: 'raster', source: 'vhyb', minzoom: 9,
        paint: { 'raster-opacity': ramp(9, 0, 11, 0.5, 15, 0.75), 'raster-fade-duration': 0 } },
    ],
  };
}

export function createMapDemo(container) {
  const map = new maplibregl.Map({
    container, style: style(),
    center: [127.5, 36.2], zoom: 1.55, bearing: 28, pitch: 0,
    antialias: true, maxPitch: 85, fadeDuration: 0,
    attributionControl: { compact: true },
    localIdeographFontFamily: "'Pretendard','SUIT',sans-serif",
  });
  for (const h of ['scrollZoom', 'dragPan', 'dragRotate', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'boxZoom'])
    map[h] && map[h].disable();
  if (typeof map.setPixelRatio === 'function') map.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));

  const errs = [];
  map.on('error', (e) => {
    const m = String((e && e.error && e.error.message) || e.type || e);
    if (/calculateFogMatrix/.test(m)) return;       // 글로브의 알려진 무해 경고
    errs.push(m);
  });

  /* 투영 전환 — 글로브와 메르카토르는 같은 zoom 에서 축척이 다르다.
     메르카토르는 위도 φ 에서 1/cos φ 만큼 늘어난다 → 위도 36°에서 log2(1/cos36°)=0.306 레벨.
     전환 순간 그만큼 화면이 '펑' 튄다. 여기서는 (1) 전환 줌을 히스테리시스로 감싸고
     (2) 전환 직후 zoomBias 로 보정한다. 값은 app.js 가 계측해 HUD 에 띄운다. */
  let globe = true, lastSwitch = 0;
  const GLOBE_OFF = 5.9, GLOBE_ON = 5.4;
  function projection(zoom, lat) {
    const want = globe ? zoom < GLOBE_OFF : zoom < GLOBE_ON;
    if (want === globe) return globe;
    globe = want;
    lastSwitch = performance.now();
    try { map.setProjection({ type: globe ? 'globe' : 'mercator' }); } catch { /* 구버전 */ }
    return globe;
  }
  const mercatorBias = (lat) => Math.log2(1 / Math.max(0.2, Math.cos(lat * Math.PI / 180)));

  let terrain = false, terrainExag = 0;
  function setTerrain(on, exag) {
    const want = on && exag > 0.02;
    if (want === terrain && Math.abs(exag - terrainExag) < 0.05) return;
    terrain = want; terrainExag = exag;
    try { map.setTerrain(want ? { source: 'dem2', exaggeration: exag } : null); } catch { errs.push('terrain'); }
  }

  return {
    map, errors: errs,
    get isGlobe() { return globe; },
    get sinceSwitch() { return performance.now() - lastSwitch; },
    projection, mercatorBias, setTerrain,
    /* 결과 판 전환 — 판 하나만 켠다. raster-opacity-transition 이 크로스페이드를 맡는다. */
    showPlate(id) {
      for (const p of PLATES.slice(1)) {
        try { map.setPaintProperty(`o_${p.id}`, 'raster-opacity', p.id === id ? 1 : 0); } catch { /* 스타일 로딩 중 */ }
      }
    },
    PLATES,
    ready: () => new Promise((r) => (map.loaded() ? r() : map.once('load', r))),
    tilesReady: () => { try { return map.areTilesLoaded(); } catch { return true; } },
  };
}
