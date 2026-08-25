import { EOX, DEM, OFM, GLYPHS } from './sources.js';
import { sidoGeoJSON } from './places.js';

const T = '../assets/tiles';
export const AOI = {
  namwon: [127.3481, 35.5276, 127.3567, 35.5347],
  kuksan: [126.973996, 35.825613, 126.992145, 35.838284],
  jeju:   [126.81996, 33.504972, 126.82504, 33.510028],
  jeju20: [126.894965, 33.514975, 126.900035, 33.520024], // 불법건축물 검출 도엽
  namwonCity: [127.182606, 35.302858, 127.637309, 35.561786], // 남원시 전역 정사영상
};
const ortho = (id, bounds, minzoom = 12) => ({
  type: 'raster', tiles: [`${T}/${id}/{z}/{x}/{y}.webp`],
  tileSize: 256, minzoom, maxzoom: 19, bounds, attribution: 'LX 정사영상',
});

// 신뢰도 램프 — 파랑 계열은 연안 수면 위에서 사라진다. 저채도 위성영상 위에서
// 유일하게 살아남는 축이 채도이므로 호박 → 주홍 → 적색으로 잡는다.
export const CONF_RAMP = ['#FFD166', '#F7A93B', '#F2622A', '#DC3B22', '#B3191C'];
// 클래스 → 색 고정 매핑 (Roboflow 체크리스트 #14). 화면이 바뀌어도 같은 클래스는 같은 색.
export const CLS = { veg_gain: '#40DE8A', veg_loss: '#F2622A', built_new: '#863AFF', other: '#6675FF' };
// 표기 규칙: built_new 는 대부분 정지된 나지다 — '신축'으로 부르지 않는다.
export const CLS_KO = { veg_gain: '식생 증가', veg_loss: '식생 감소', built_new: '나지/정지 변화', other: '기타' };
const confColor = (key) => [
  'interpolate', ['linear'], ['get', key],
  0.50, CONF_RAMP[0], 0.62, CONF_RAMP[1], 0.72, CONF_RAMP[2], 0.85, CONF_RAMP[3], 1.0, CONF_RAMP[4],
];

const LIT  = ['coalesce', ['feature-state', 'lit'], 0];
const RING = ['coalesce', ['feature-state', 'ring'], 0];
const DIM  = ['coalesce', ['feature-state', 'dim'], 1];
const HOT  = ['coalesce', ['feature-state', 'hot'], 0];
// 결과 리빌 — 스캔선이 지나간 뒤에만 남는다(0=미노출, 1=노출).
export const SHOWN = ['coalesce', ['feature-state', 'shown'], 1];
const RAIN = ['coalesce', ['feature-state', 'grow'], 1];

export const ORTHO_LAYERS = [
  'o_namwon_2504', 'o_namwon_2506', 'o_namwon_2508', 'o_namwon_2510',
  'o_kuksan_a68', 'o_kuksan_a71', 'o_namwon_city', 'o_jeju_2020', 'o_jeju_2022', 'o_jeju_land',
];

export function buildStyle(v) {
  return {
    version: 8,
    // deck.gl 9.3 은 표현식 투영을 해석하지 못한다("Unsupported projection").
    // 그래서 투영은 명시적으로 잡고, globe→mercator 전환은 dive.js 가 성층운 화이트아웃
    // 정점(p≈0.26)에서 setProjection 으로 수행한다 — 전환이 구름에 가려 보이지 않는다.
    projection: { type: 'globe' },
    glyphs: GLYPHS,
    sources: {
      eox:  { type: 'raster', tiles: [EOX], tileSize: 256, maxzoom: 14, attribution: 'Sentinel-2 cloudless © EOX' },
      vsat: { type: 'raster', tiles: [v.sat], tileSize: 256, minzoom: v.minzoom, maxzoom: v.maxzoom, attribution: '© V-World · 국토교통부' },
      // bounds 를 국토로 제한한다 — 동해 먼바다의 z7 타일은 Mapterhorn 에 없어 404 가 난다.
      // encoding:'terrarium' 명시는 필수(기본값 'mapbox' 로 해석되면 조용히 틀린 고도가 나온다).
      dem:  { type: 'raster-dem', tiles: [DEM], tileSize: 512, maxzoom: 12, encoding: 'terrarium',
              bounds: [124.0, 32.5, 132.0, 39.5], attribution: '© Mapterhorn' },
      // MapLibre 는 hillshade 와 3D terrain 이 같은 소스를 쓰면 품질 저하를 경고한다 — 분리한다.
      dem2: { type: 'raster-dem', tiles: [DEM], tileSize: 512, maxzoom: 12, encoding: 'terrarium',
              bounds: [124.0, 32.5, 132.0, 39.5] },
      ofm:  { type: 'vector', url: OFM },
      sido: { type: 'geojson', data: sidoGeoJSON() },
      outline: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      sidoline: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      change: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      svc:  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      grid: { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, maxzoom: 11 },
      det:  { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, maxzoom: 13 },
      jeju_det: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      extent: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      rain: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      res0: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      res1: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      res2: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      o_namwon_2504: ortho('namwon_2504', AOI.namwon),
      o_namwon_2506: ortho('namwon_2506', AOI.namwon),
      o_namwon_2508: ortho('namwon_2508', AOI.namwon),
      o_namwon_2510: ortho('namwon_2510', AOI.namwon),
      o_kuksan_a68: ortho('kuksan_a68', AOI.kuksan, 13),
      o_kuksan_a71: ortho('kuksan_a71', AOI.kuksan, 13),
      o_namwon_city: { type: 'raster', tiles: [`${T}/namwon_city_2510/{z}/{x}/{y}.webp`],
                       tileSize: 256, minzoom: 11, maxzoom: 17, bounds: AOI.namwonCity,
                       attribution: 'LX 정사영상' },
      o_jeju_2020:  ortho('jeju_2020', AOI.jeju20, 13),
      o_jeju_2022:  ortho('jeju_2022', AOI.jeju, 13),
      o_jeju_land:  ortho('jeju_landcover', AOI.jeju, 13),
    },
    sky: {
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 3.2, 0.72, 5.6, 0.28, 9, 0.14],
      'sky-color': '#0A1A3C', 'horizon-color': '#88B3E2', 'fog-color': '#B7CFE8',
      'fog-ground-blend': 0.92, 'horizon-fog-blend': 0.88, 'sky-horizon-blend': 0.9,
    },
    light: { anchor: 'map', position: [1.4, 120, 62], color: '#FFF6E6', intensity: 0.42 },
    layers: [
      // 우주 구간(globe)에서는 배경을 비워 뒤의 별밭 캔버스가 보이게 하고,
      // 국토 구간에서는 지평선 위를 채우는 하늘색이 된다(비우면 고피치에서 검은 쐐기가 남는다).
      { id: 'bg', type: 'background', paint: {
        'background-color': ['interpolate', ['linear'], ['zoom'],
          5.2, 'rgba(2,8,22,0)', 6.4, 'rgba(24,44,74,1)', 11, 'rgba(74,104,144,1)'] } },

      { id: 'eox', type: 'raster', source: 'eox', paint: {
        // 페이드를 두면 새 타일이 도착해도 흐린 부모 타일이 남아 강하 중 뭉개져 보인다.
        'raster-fade-duration': 0,
        // EOX 는 z14.5 까지 밑에 깔아둔다. V-World 타일이 늦게 도착해도 배경색 구멍이 생기지 않는다.
        // EOX 는 우리 정사영상이 화면을 덮을 때까지 밑에 깔아둔다. V-World 는 그 위에 불투명하게
        // 얹히므로 평소엔 보이지 않고, 타일이 늦게 오는 순간에만 배경색 구멍 대신 이 영상이 보인다.
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 16.4, 1, 17.6, 0],
        'raster-saturation': 0.1, 'raster-contrast': 0.06 } },

      { id: 'vsat', type: 'raster', source: 'vsat', paint: {
        'raster-fade-duration': 0,
        'raster-opacity': ['interpolate', ['linear'], ['zoom'], 9.6, 0, 11.2, 1],
        'raster-saturation': 0.06, 'raster-contrast': 0.04 } },

      // minzoom 8.8: 저줌에서 바다 위 DEM 타일 경계가 검은 쐐기로 남는다(실측).
      { id: 'hillshade', type: 'hillshade', source: 'dem', minzoom: 8.8, layout: { visibility: 'none' }, paint: {
        'hillshade-illumination-direction': 315, 'hillshade-illumination-anchor': 'map',
        'hillshade-exaggeration': 0.55,
        'hillshade-shadow-color': 'rgba(18,30,64,0.5)',
        'hillshade-highlight-color': 'rgba(255,242,208,0.38)',
        'hillshade-accent-color': 'rgba(8,14,44,0.42)' } },

      // 우리 정사영상 — 전부 opacity 0 으로 깔아두고 장면이 켠다.
      // 선택적 채도(취향 프로필 §4 영상 처리): 정사영상은 사진처럼 눌러 둔다 —
      // 채도 −45%, 그림자를 들어올려 밝은 아틀라스 판으로 만든다.
      // 색이 다시 사는 곳은 (a) AI 폴리곤 안, (b) "Acquired" z18 크롭 두 곳뿐이다.
      ...ORTHO_LAYERS.map(id => ({
        id, type: 'raster', source: id,
        paint: { 'raster-opacity': 0, 'raster-fade-duration': 200, 'raster-resampling': 'linear',
                 'raster-saturation': -0.35, 'raster-contrast': 0.06, 'raster-brightness-min': 0.02 },
      })),

      // 국토의 실루엣 — 우리 실제 해안선(korea-outline.geojson)을 링 → 라인으로 변환해 쓴다.
      // OFM water 폴리곤을 line 으로 그리면 타일 클립 모서리가 바다 한가운데 곧은 흰 선으로
      // 남는다(실측 확인). 자체 라인 소스에는 그 문제가 없다.
      { id: 'coast-glow', type: 'line', source: 'outline', maxzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#8CDFFF', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 2.4, 9, 6],
                 'line-blur': 5, 'line-opacity': 0 } },
      { id: 'coast', type: 'line', source: 'outline', maxzoom: 12,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#E8F6FF', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.5],
                 'line-opacity': 0 } },

      // 시도 경계 — OFM 대신 우리 sido.geojson(17개, 실경계)을 쓴다.
      // OFM boundary 는 국외(규슈·산둥) 경계까지 함께 그려 화면 구석이 지저분해진다.
      { id: 'boundary', type: 'line', source: 'sidoline',
        paint: { 'line-color': '#9FDBFF',
                 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.5, 8, 1.1, 12, 1.5],
                 'line-blur': 0.4, 'line-opacity': 0, 'line-dasharray': [3, 2.4] } },

      // 도로 — 영상 위에서는 중성 회색. 폭과 명도로만 위계를 준다.
      { id: 'road-case', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 11,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 11, '#2B3444', 15, '#3E4A5E'],
                 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 2.2, 16, 9],
                 'line-opacity': 0 } },
      { id: 'road', type: 'line', source: 'ofm', 'source-layer': 'transportation', minzoom: 11,
        filter: ['match', ['get', 'class'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'], true, false],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['interpolate', ['linear'], ['zoom'], 11, '#9AA6B6', 15, '#CFD8E3'],
                 'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 11, 0.9, 16, 5],
                 'line-opacity': 0 } },

      // 조사 범위(실데이터가 아직 없는 서비스용)
      { id: 'extent-fill', type: 'fill', source: 'extent',
        paint: { 'fill-color': '#006DF7', 'fill-opacity': 0 } },
      { id: 'extent-line', type: 'line', source: 'extent',
        paint: { 'line-color': '#8FD3FF', 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0 } },

      // 탐지 격자(9,032셀) — count 로 솟는다.
      { id: 'grid-dim', type: 'fill-extrusion', source: 'grid', maxzoom: 13.2, paint: {
        'fill-extrusion-color': '#59657A', 'fill-extrusion-height': ['*', ['sqrt', ['to-number', ['coalesce', ['get', 'count'], 0]]], 640],
        'fill-extrusion-opacity': 0 } },
      { id: 'grid-3d', type: 'fill-extrusion', source: 'grid', maxzoom: 13.2, paint: {
        'fill-extrusion-color': confColor('mean_conf'),
        'fill-extrusion-height': ['*', ['sqrt', ['to-number', ['coalesce', ['get', 'count'], 0]]], 640],
        'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0,
        'fill-extrusion-vertical-gradient': true } },

      // 탐지 폴리곤(5,000) — confidence 로 솟는다. 필터 밖은 삭제가 아니라 디밍.
      { id: 'det-dim', type: 'fill-extrusion', source: 'det', minzoom: 11, paint: {
        'fill-extrusion-color': '#6F7C8E', 'fill-extrusion-height': 4,
        'fill-extrusion-opacity': 0 } },
      { id: 'det-3d', type: 'fill-extrusion', source: 'det', minzoom: 11, paint: {
        'fill-extrusion-color': confColor('confidence'),
        'fill-extrusion-height': ['+', 5, ['*', ['-', ['to-number', ['coalesce', ['get', 'confidence'], 0.5]], 0.5], 58]],
        'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0,
        'fill-extrusion-vertical-gradient': true } },

      // 남원 변화 지수(비지도) — 클래스 고정색 + 높이 = score.
      { id: 'change-3d', type: 'fill-extrusion', source: 'change', paint: {
        'fill-extrusion-color': ['match', ['get', 'cls'],
          'veg_gain', CLS.veg_gain, 'veg_loss', CLS.veg_loss, 'built_new', CLS.built_new, CLS.other],
        'fill-extrusion-height': ['+', 1.5, ['*', ['-', ['to-number', ['coalesce', ['get', 'score'], 0.7]], 0.7], 62]],
        'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': true } },
      { id: 'change-edge', type: 'line', source: 'change', paint: {
        'line-color': ['match', ['get', 'cls'],
          'veg_gain', CLS.veg_gain, 'veg_loss', CLS.veg_loss, 'built_new', CLS.built_new, CLS.other],
        'line-width': 1.1, 'line-opacity': 0 } },

      // 데이터 레인 — 탐지 객체마다 지면에서 솟는 얇은 필라멘트. 밀도 자체가 코로플레스가 된다.
      { id: 'rain-3d', type: 'fill-extrusion', source: 'rain', paint: {
        'fill-extrusion-color': '#0FA9A0',
        'fill-extrusion-height': ['*', ['coalesce', ['get', '_h'], 8], RAIN],
        'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0,
        'fill-extrusion-vertical-gradient': false } },

      // 범용 결과 슬롯 — 실제 AI 산출물(results.js)이 도착하면 서비스별로 여기에 얹는다.
      ...[0, 1, 2].flatMap((i) => [
        { id: `res${i}-3d`, type: 'fill-extrusion', source: `res${i}`, paint: {
          'fill-extrusion-color': ['coalesce', ['get', '_color'], '#F2622A'],
          'fill-extrusion-height': ['coalesce', ['get', '_h'], 4],
          'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': true } },
        // 엣지 아웃라인 — 글로우 이중 스트로크로 "기계가 본 윤곽"을 만든다.
        { id: `res${i}-glow`, type: 'line', source: `res${i}`, paint: {
          'line-color': '#4FC3FF', 'line-width': 4, 'line-blur': 2.4, 'line-opacity': 0 } },
        { id: `res${i}-line`, type: 'line', source: `res${i}`, paint: {
          'line-color': ['coalesce', ['get', '_color'], '#FFE9C9'], 'line-width': 1.2, 'line-opacity': 0 } },
        { id: `res${i}-dot`, type: 'circle', source: `res${i}`,
          filter: ['==', ['geometry-type'], 'Point'], paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 11, 2.4, 15, 5, 18, 9],
          'circle-color': ['coalesce', ['get', '_color'], '#F2622A'],
          'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 0.7,
          'circle-opacity': 0, 'circle-stroke-opacity': 0 } },
      ]),

      { id: 'jeju-det-3d', type: 'fill-extrusion', source: 'jeju_det', paint: {
        'fill-extrusion-color': CLS.built_new, 'fill-extrusion-height': 8.5,
        'fill-extrusion-opacity': 0, 'fill-extrusion-vertical-gradient': true } },
      { id: 'jeju-det-edge', type: 'line', source: 'jeju_det', paint: {
        'line-color': '#D9C2FF', 'line-width': 1.4, 'line-opacity': 0 } },

      // 서비스 지점 — lit / ring / dim 은 feature-state 로 굴린다(재타일링 없음).
      { id: 'svc-halo', type: 'circle', source: 'svc', paint: {
        'circle-radius': ['*', LIT, ['+', 11, ['*', RING, 54]]],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 1.1, 9, 2.2],
        'circle-stroke-opacity': ['*', LIT, ['*', 0.85, ['-', 1, RING]]] } },
      { id: 'svc-dot', type: 'circle', source: 'svc', paint: {
        'circle-radius': ['*', LIT, ['*', ['case', ['get', 'real'], 8, 5], ['+', 1, ['*', 0.5, HOT]]]],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#FFFFFF',
        'circle-stroke-width': ['+', 1.2, ['*', 1.2, HOT]],
        'circle-opacity': ['*', LIT, ['*', DIM, ['case', ['get', 'real'], 1, 0.12]]],
        'circle-stroke-opacity': ['*', LIT, ['*', 0.92, DIM]] } },

      // 라벨 — 영상 위이므로 흰 글자 + 어두운 반투명 헤일로.
      { id: 'label-sido', type: 'symbol', source: 'sido', minzoom: 4.6, maxzoom: 10.5,
        filter: ['<=', ['get', 'rank'], ['step', ['zoom'], 0, 5.6, 1, 6.4, 2, 7.2, 3]],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
                  'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 15],
                  'text-letter-spacing': 0.08, 'text-anchor': 'center' },
        paint: { 'text-color': '#F2F7FF', 'text-halo-color': 'rgba(2,8,20,0.78)', 'text-halo-width': 1.3,
                 'text-opacity': 0 } },
      { id: 'label-place', type: 'symbol', source: 'ofm', 'source-layer': 'place', minzoom: 10.5,
        filter: ['step', ['zoom'],
          ['==', ['get', 'class'], 'city'], 12.6,
          ['match', ['get', 'class'], ['city', 'town'], true, false], 14.6,
          ['match', ['get', 'class'], ['city', 'town', 'village'], true, false], 16.2,
          ['match', ['get', 'class'], ['city', 'town', 'village', 'suburb', 'hamlet'], true, false]],
        layout: { 'text-field': ['coalesce', ['get', 'name:ko'], ['get', 'name']],
                  'text-font': ['Noto Sans Regular'], 'text-padding': 6,
                  'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11.5, 15, 14] },
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(0,0,0,0.75)', 'text-halo-width': 1.2,
                 'text-opacity': 0 } },
      { id: 'svc-label', type: 'symbol', source: 'svc', minzoom: 5,
        filter: ['==', ['get', 'labeled'], true],
        layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'],
                  'text-size': 12, 'text-offset': [0, -2.6], 'text-anchor': 'bottom',
                  'text-letter-spacing': 0.02 },
        // 라벨은 **가리킬 때만** 나온다. 13개를 한꺼번에 얹으면 판이 목록이 된다.
        paint: { 'text-color': '#FFFFFF', 'text-halo-color': 'rgba(2,8,20,0.82)', 'text-halo-width': 1.4,
                 'text-opacity': ['*', LIT, HOT] } },
    ],
  };
}
