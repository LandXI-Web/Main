// Land-XI SPIKE — Google Photorealistic 3D Tiles 실현 가능성 실험대
import { KEY, PLACES, railAt, cloudSprite } from './rail.js';

const $ = (id) => document.getElementById(id);
const GEO = '/landxi/assets/data/geo/results/';

// ── 뷰어 ────────────────────────────────────────────────────────────────────
// Ion 은 쓰지 않는다(토큰 필요 · CDN only 원칙). 바탕은 Esri World Imagery, 지형은 타원체.
const viewer = new Cesium.Viewer('cesium', {
  baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    maximumLevel: 18, credit: 'Esri, Maxar, Earthstar Geographics',
  })),
  terrainProvider: new Cesium.EllipsoidTerrainProvider(),
  baseLayerPicker: false, geocoder: false, homeButton: false, sceneModePicker: false,
  navigationHelpButton: false, animation: false, timeline: false, fullscreenButton: false,
  infoBox: false, selectionIndicator: false,
});
const scene = viewer.scene, camera = viewer.camera;
window.__v = viewer;
scene.globe.enableLighting = true;
scene.globe.showGroundAtmosphere = true;
scene.skyAtmosphere.show = true;
scene.fog.enabled = true;
scene.screenSpaceCameraController.enableCollisionDetection = false;
// 한국 시간 오전 11:30 — 그림자가 살아나는 각도
viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2026-08-26T02:30:00Z');

// ── Google Photorealistic 3D Tiles ─────────────────────────────────────────
let tileset = null, rootReqs = 0, source = 'Esri World Imagery (폴백)';

async function attachGoogle() {
  if (!KEY) return;
  const url = 'https://tile.googleapis.com/v1/3dtiles/root.json?key=' + KEY;
  try {
    rootReqs++;                                  // 과금 단위 = root tileset 요청
    tileset = await Cesium.Cesium3DTileset.fromUrl(url, {
      showCreditsOnScreen: true,                 // ToS: 데이터 제공자 크레딧 상시 노출
      maximumScreenSpaceError: 16,
      cacheBytes: 768 * 1024 * 1024,
    });
    scene.primitives.add(tileset);
    scene.globe.show = false;                    // 구글 타일이 지구 전체를 덮는다
    source = 'Google Photorealistic 3D Tiles';
  } catch (e) {
    source = 'Google 실패 → Esri 폴백';
    console.error('[spike] Google 3D Tiles 실패:', e);
  }
}

// ── 구름: ~8 km 상공 스프라이트 덱 ──────────────────────────────────────────
const clouds = scene.primitives.add(
  new Cesium.BillboardCollection({ blendOption: Cesium.BlendOption.TRANSLUCENT }));
const puffs = [];

function buildClouds(lon, lat) {
  clouds.removeAll(); puffs.length = 0;
  const sprites = [cloudSprite(), cloudSprite(), cloudSprite(), cloudSprite(), cloudSprite()];
  for (let i = 0; i < 130; i++) {
    const dx = (Math.random() - 0.5) * 0.46, dy = (Math.random() - 0.5) * 0.34;
    const h = 6800 + Math.random() * 2600;                  // 적운 층: 약 6.8 ~ 9.4 km
    const w = 1400 + Math.random() * 2600;                  // 실제 폭 1.4 ~ 4.0 km
    const b = clouds.add({
      image: sprites[i % 5],
      position: Cesium.Cartesian3.fromDegrees(lon + dx, lat + dy, h),
      sizeInMeters: true, width: w, height: w * 0.62,       // 미터 단위 = 고도에 따라 자연히 커지고 작아진다
      color: Cesium.Color.WHITE.withAlpha(0.30 + Math.random() * 0.28),
      translucencyByDistance: new Cesium.NearFarScalar(4e3, 1.0, 9e5, 0.0),
    });
    puffs.push({ b, lon: lon + dx, lat: lat + dy, h, v: 8.5e-6 + Math.random() * 8.5e-6 });
  }
}
scene.preRender.addEventListener(() => {              // 서→동 표류
  for (const p of puffs) {
    p.lon += p.v;
    const c = place.zlon ?? place.lon;
    if (p.lon > c + 0.22) p.lon = c - 0.22;
    p.b.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, p.h);
  }
});

// ── 우리 실제 탐지 결과 드레이프 ────────────────────────────────────────────
const sources = [];
const TINT = { '비닐하우스_단동': '#ffd24a', '비닐하우스_연동': '#ff9d3d' };
const flatFirst = (c) => (typeof c[0] === 'number' ? c : flatFirst(c[0]));

async function drape(p) {
  for (const s of sources) viewer.dataSources.remove(s, true);
  sources.length = 0;
  for (const name of p.data) {
    try {
      const raw = await (await fetch(GEO + name + '.geojson')).json();
      // 스파이크 부하 관리: 시점 반경 안쪽만, 최대 700개
      const alon = p.zlon ?? p.lon, alat = p.zlat ?? p.lat;
      const near = raw.features.filter((f) => {
        const c = flatFirst(f.geometry.coordinates);
        return Math.abs(c[0] - alon) < 0.05 && Math.abs(c[1] - alat) < 0.04;
      }).slice(0, 900);
      const ds = await Cesium.GeoJsonDataSource.load(
        { type: 'FeatureCollection', features: near }, { clampToGround: true, strokeWidth: 2 });
      for (const ent of ds.entities.values) {
        if (!ent.polygon) continue;
        const cls = ent.properties && ent.properties.cls && ent.properties.cls.getValue();
        const hex = TINT[cls] || '#4ad6ff';
        ent.polygon.material = Cesium.Color.fromCssColorString(hex).withAlpha(0.42);
        ent.polygon.outlineColor = Cesium.Color.fromCssColorString(hex);
        ent.polygon.classificationType = Cesium.ClassificationType.BOTH; // 지형 + 3D 타일 위로 투영
      }
      viewer.dataSources.add(ds); sources.push(ds);
      console.log('[spike] drape', name, near.length, '건');
    } catch (e) { console.warn('[spike] geojson 실패', name, e); }
  }
}

// ── 스크롤 레일 ─────────────────────────────────────────────────────────────
let place = PLACES.namwon, progress = 0;

function apply(t) {
  const r = railAt(t);
  const lon = place.lon + ((place.zlon ?? place.lon) - place.lon) * r.aim;
  const lat = place.lat + ((place.zlat ?? place.lat) - place.lat) * r.aim;
  camera.lookAt(
    Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    new Cesium.HeadingPitchRange(
      Cesium.Math.toRadians(r.heading), Cesium.Math.toRadians(r.pitch), r.h));
  camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  $('stage').textContent = r.stage;
  $('pct').textContent = Math.round(t * 100) + '%';
  $('alt').textContent = r.h > 1000 ? Math.round(r.h / 1000) + ' km' : Math.round(r.h) + ' m';
  clouds.show = r.h < 260000;   // 하강 구간(약 30 km → 8 km)에서 구름층을 통과한다
}

// ── 장소 전환 ───────────────────────────────────────────────────────────────
function setPlace(key) {
  place = PLACES[key];
  $('placeLabel').textContent = place.label;
  for (const b of $('places').children) b.setAttribute('aria-current', String(b.dataset.k === key));
  buildClouds(place.zlon ?? place.lon, place.zlat ?? place.lat);
  drape(place);
  apply(progress);
}
$('places').innerHTML = Object.entries(PLACES)
  .map(([k, p]) => '<button data-k="' + k + '">' + p.name + '</button>').join('');
$('places').addEventListener('click', (e) => {
  const k = e.target.dataset && e.target.dataset.k; if (k) setPlace(k);
});

const lenis = new Lenis({ lerp: 0.075, wheelMultiplier: 0.9 });
let locked = false;   // 자동 촬영 중에는 관성 스크롤이 레일을 밀지 못하게 잠근다
lenis.on('scroll', ({ scroll, limit }) => {
  if (locked) return;
  progress = limit ? scroll / limit : 0; apply(progress);
});
(function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(0);
gsap.ticker.lagSmoothing(0);   // 타일 로딩으로 프레임이 튈 때 레일이 점프하지 않게

// 스크린샷 자동화용 훅
window.__spikeSeek = (t) => {
  locked = true;
  lenis.scrollTo(t * (document.body.scrollHeight - innerHeight), { immediate: true, force: true });
  progress = t; apply(t);
};
window.__spikeUnlock = () => { locked = false; };
window.__spikePlace = setPlace;

// ── 계측 ────────────────────────────────────────────────────────────────────
let frames = 0, last = performance.now();
const fpsHist = [];
scene.postRender.addEventListener(() => {
  frames++; const now = performance.now();
  if (now - last >= 1000) {
    const f = Math.round(frames * 1000 / (now - last));
    fpsHist.push(f); $('fps').textContent = f; frames = 0; last = now;
    if (tileset) {
      $('tiles').textContent = tileset.statistics.numberOfLoadedTilesTotal;
      $('pending').textContent = tileset.statistics.numberOfPendingRequests;
    }
    $('reqs').textContent = rootReqs;
  }
});
window.__spikeStats = () => ({
  key: !!KEY, source, place: place.name, progress,
  altitude: Math.round(railAt(progress).h),
  fpsMedian: fpsHist.length ? fpsHist.slice().sort((a, b) => a - b)[fpsHist.length >> 1] : null,
  fpsSamples: fpsHist.length,
  tilesLoaded: tileset ? tileset.statistics.numberOfLoadedTilesTotal : 0,
  tilesMemMB: tileset ? Math.round(tileset.totalMemoryUsageInBytes / 1e6) : 0,
  rootGeometricError: tileset ? tileset.root && tileset.root.geometricError : null,
  credits: [...document.querySelectorAll('.cesium-credit-textContainer, .cesium-widget-credits')]
    .map((n) => n.textContent.trim()).join(' | ').slice(0, 400),
});

// ── 판정 배너 ───────────────────────────────────────────────────────────────
$('verdict').innerHTML = KEY
  ? '<b>KEY 감지됨</b> — Google 3D Tiles 로드 시도 중. 핵심 관전 포인트: 한국 상공에서 ' +
    '<b>메시(집 모양·처마 그림자)</b>가 서는가, 아니면 <b>평평한 정사영상</b>만 깔리는가.'
  : '<b class="bad">GOOGLE_MAPS_KEY 없음</b> — Esri 정사영상 폴백으로 레일 · 구름 · 탐지 드레이프만 시연 중.<br>' +
    '키 주입: <code>?key=…</code> 또는 콘솔 <code>localStorage.GOOGLE_MAPS_KEY=\'…\'</code>.<br>' +
    '발급: Cloud Console → 결제 계정 연결 → <b>Map Tiles API</b> 사용 설정 → 사용자 인증 정보 → ' +
    'API 키 → <b>HTTP 리퍼러 제한 + Map Tiles API 한정</b>.';

// ── 부팅 ────────────────────────────────────────────────────────────────────
await attachGoogle();
$('src').textContent = 'source: ' + source;
setPlace('namwon');
