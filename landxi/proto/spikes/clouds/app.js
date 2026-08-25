// 구름/대기 기법 비교 스파이크 — 하나의 하강(seek 0→1)에 네 기법을 갈아끼운다.
// 배경: p<0.3 three.js EOX 글로브 / p>0.3 MapLibre V-World 위성. 카메라는 하나의
// 고도 곡선(12,000km → 0.35km)을 따르고 각 기법은 같은 고도를 받아 스스로를 갱신한다.
import * as THREE from 'three';
import { R, KM, earthTexture, makeEarth, makeAtmosphere, llToVec } from './globe.js';
import { createCloudSphere } from './t1-sphere.js';
import { createDecks } from './t2-decks.js';
import { createVolumetric } from './t3-volumetric.js';
import { bakeGibs, createGibsSphere, gibsDate, G3857, LAYERS } from './t4-gibs.js';

const $ = (s) => document.querySelector(s);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = THREE.MathUtils.smoothstep;

/* ── 목표 지점 · 시각 ─────────────────────────────────────── */
const TARGET = { lon: 127.3524, lat: 35.5311, name: '남원' };   // dive.js 와 같은 AOI
// 태양 위치용 시각. 기본값은 한국 표준시 오전 10:30 (구름 입체감이 가장 잘 읽히는 각도).
let WHEN = kstDate(10.5);
function kstDate(hourKst) {
  const d = new Date();
  // KST = UTC+9
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(),
    Math.floor(hourKst) - 9, Math.round((hourKst % 1) * 60)));
}

/* ── 고도 곡선 — p 를 km 로. 세 구간의 지수 보간.
   0.00 궤도 40,800km · 0.10 ≈ 6,000km(지구 한 알) · 0.22 600km · 0.28 ≈ 28km(성층권)
   0.30 대류권계면 10km · 0.32 ≈ 9km(데크 관통) · 0.60 ≈ 2.4km · 1.00 350m ── */
const BANDS = [[0, 40800], [0.22, 600], [0.30, 10], [1, 0.35]];
export function altitudeKm(p) {
  p = clamp01(p);
  for (let i = 1; i < BANDS.length; i++) {
    const [p0, a0] = BANDS[i - 1], [p1, a1] = BANDS[i];
    if (p <= p1 || i === BANDS.length - 1)
      return a0 * Math.pow(a1 / a0, (p - p0) / (p1 - p0));
  }
  return 0.35;
}
const pitchDeg = (p) => lerp(4, 66, smooth(p, 0.24, 0.92));
const bearingDeg = (p) => lerp(-24, 18, smooth(p, 0.0, 1.0));

/* ── 렌더러 ───────────────────────────────────────────────── */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
const DPR = Math.min(1.5, devicePixelRatio || 1);
renderer.setPixelRatio(DPR);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setClearColor(0x000000, 0);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.00004, 9000);
scene.add(camera);

/* ── 앵커 프레임 — X=동, Y=상, Z=남 ───────────────────────── */
const anchor = new THREE.Group();
let ANCHOR = { lon: TARGET.lon, lat: TARGET.lat };
function placeAnchor(lon, lat) {
  ANCHOR = { lon, lat };
  const P = llToVec(lon, lat, R);
  const up = P.clone().normalize();
  const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  const east = north.clone().cross(up).normalize();
  const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  anchor.quaternion.setFromRotationMatrix(m);
  anchor.position.copy(P);
  anchor.updateMatrixWorld(true);
}
scene.add(anchor);
placeAnchor(TARGET.lon, TARGET.lat);

/* ── 태양 (SunCalc) ───────────────────────────────────────── */
const sunWorld = new THREE.Vector3(1, 0, 0);
let sunElev = 0;
function updateSun() {
  if (!window.SunCalc) return;
  const s = window.SunCalc.getPosition(WHEN, ANCHOR.lat, ANCHOR.lon);
  sunElev = s.altitude;
  const ce = Math.cos(s.altitude);
  const east = -ce * Math.sin(s.azimuth);
  const north = -ce * Math.cos(s.azimuth);
  const up = Math.sin(s.altitude);
  sunWorld.set(east, up, -north).applyQuaternion(anchor.quaternion).normalize();
}
updateSun();

/* ── 지평선 헤이즈 — 저고도의 에어리얼 퍼스펙티브 ─────────── */
const hazeMat = new THREE.ShaderMaterial({
  uniforms: { uK: { value: 0 }, uSun: { value: 0 }, uPitch: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `uniform float uK; uniform float uSun; uniform float uPitch; varying vec2 vUv;
    void main(){
      // 화면 아래쪽(가까운 지면)은 맑고 지평선 쪽으로 갈수록 뿌예진다
      float h = smoothstep(0.18, 0.92, vUv.y);
      vec3 cool = vec3(0.72,0.79,0.88);
      vec3 warm = vec3(0.98,0.86,0.74);
      vec3 c = mix(cool, warm, clamp(uSun,0.0,1.0));
      float a = pow(h, 1.7) * uK * mix(0.35, 1.0, uPitch);
      gl_FragColor = vec4(c, a);
    }`,
  transparent: true, depthTest: false, depthWrite: false,
});
const haze = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hazeMat);
haze.frustumCulled = false; haze.renderOrder = 25;
camera.add(haze);

/* ── 배경: 지구 + 대기림 ──────────────────────────────────── */
const earthGroup = new THREE.Group();
scene.add(earthGroup);
let earth = null, atmo = null, earthCredit = '';

/* ── MapLibre 배경 (p>0.3) ───────────────────────────────── */
const mapEl = $('#map');
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8, glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      eox: { type: 'raster', tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'], tileSize: 256, maxzoom: 14 },
      vsat: { type: 'raster', tiles: ['https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg'], tileSize: 256, minzoom: 5, maxzoom: 19 },
      gibs: { type: 'raster', tiles: [G3857(LAYERS.modis, gibsDate(1))], tileSize: 256, maxzoom: 9 },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b1420' } },
      { id: 'eox', type: 'raster', source: 'eox', paint: { 'raster-opacity': 1 } },
      { id: 'vsat', type: 'raster', source: 'vsat', minzoom: 5, paint: { 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 7, 1] } },
      { id: 'gibs', type: 'raster', source: 'gibs', paint: { 'raster-opacity': 0 } },
    ],
  },
  center: [TARGET.lon, TARGET.lat], zoom: 5, pitch: 0, bearing: 0,
  attributionControl: false, fadeDuration: 0, maxPitch: 85, antialias: false,
});
for (const h of ['scrollZoom', 'dragPan', 'dragRotate', 'doubleClickZoom', 'touchZoomRotate', 'keyboard', 'boxZoom'])
  map[h] && map[h].disable();
if (map.setPixelRatio) map.setPixelRatio(DPR);
map.on('error', () => {});

// 고도 → MapLibre zoom (같은 지상 폭을 보도록)
function zoomForAltitude(altKm, pitch) {
  const vh = 2 * Math.tan(camera.fov * Math.PI / 360) * altKm * 1000;       // 지상 세로 폭(m)
  const widen = 1 / Math.max(0.30, Math.cos(pitch * Math.PI / 180));         // 기울이면 더 멀리 본다
  const mpp = (vh * widen) / (innerHeight || 900);
  const z = Math.log2(156543.03392 * Math.cos(ANCHOR.lat * Math.PI / 180) / mpp);
  return Math.max(1.2, Math.min(19, z));
}

/* ── 기법 인스턴스 ────────────────────────────────────────── */
const tech = { 1: null, 2: null, 3: null, 4: null };
let current = 2;
const TECH_NAME = { 1: '① 구름 구 (cloud sphere)', 2: '② 빌보드 데크', 3: '③ 볼류메트릭 레이마치', 4: '④ 실사 GIBS' };

function setTech(n) {
  current = n;
  for (const [k, t] of Object.entries(tech)) {
    if (!t) continue;
    const on = +k === n;
    if (t.group) t.group.visible = on;
    if (t.comp) t.comp.visible = on;
    if (t.haze) t.haze.visible = false;
  }
  map.setPaintProperty('gibs', 'raster-opacity', n === 4 ? 0.62 : 0);
  document.querySelectorAll('#tech button').forEach((b) => b.classList.toggle('on', +b.dataset.t === n));
  $('#h-tech').textContent = TECH_NAME[n];
  fps.reset();
}

/* ── FPS ──────────────────────────────────────────────────── */
const fps = (() => {
  const ring = []; let last = performance.now();
  return {
    tick() {
      const n = performance.now(); const dt = n - last; last = n;
      if (dt > 0 && dt < 500) { ring.push(dt); if (ring.length > 180) ring.shift(); }
      return Math.min(0.1, dt / 1000);
    },
    reset() { ring.length = 0; last = performance.now(); },
    stats() {
      if (ring.length < 8) return null;
      const s = [...ring].sort((a, b) => a - b);
      const q = (f) => s[Math.min(s.length - 1, Math.floor(s.length * f))];
      return { n: s.length, fps: +(1000 / q(0.5)).toFixed(1), p95ms: +q(0.95).toFixed(2), medms: +q(0.5).toFixed(2) };
    },
  };
})();

/* ── seek ─────────────────────────────────────────────────── */
let P = 0.1, altKm = altitudeKm(P);

// 고도·자세·지도 중심을 한 번에 못 박는다. seek() 와 film() 이 함께 쓴다.
function apply(alt, pitch, bearing, center, zoomOverride) {
  altKm = alt;
  // three.js 카메라 — 앵커 로컬에서 (뒤로 물러난 만큼) 기울여 내려본다
  const h = altKm * KM;
  const back = h * Math.tan(pitch * Math.PI / 180);
  const yaw = bearing * Math.PI / 180;
  const local = new THREE.Vector3(Math.sin(yaw) * back, h, Math.cos(yaw) * back);
  camera.position.copy(local.clone().applyQuaternion(anchor.quaternion).add(anchor.position));
  const look = anchor.localToWorld(new THREE.Vector3(0, 0, 0));
  const upW = anchor.position.clone().normalize();
  camera.up.copy(upW);
  camera.lookAt(look);
  // 근/원 평면은 고도에 맞춰 움직인다(z-fighting 회피)
  camera.near = Math.max(0.000015, h * 0.004);
  camera.far = Math.max(R * 12, h * 400);
  camera.updateProjectionMatrix();

  // MapLibre
  const mz = zoomOverride != null ? zoomOverride : zoomForAltitude(altKm, pitch);
  map.jumpTo({ center: center || [ANCHOR.lon, ANCHOR.lat], zoom: mz, pitch: Math.min(80, pitch), bearing });

  // 배경 크로스페이드: 글로브 → 지도. p 가 아니라 고도로 건다 —
  // 필름 타임라인과 스크럽이 같은 규칙을 쓰게 하려면 이게 유일한 기준이어야 한다.
  const k = 1 - smooth(altKm, 190, 900);
  mapEl.style.opacity = String(k);
  earthGroup.visible = k < 0.995;
  if (earth) earth.material.uniforms.uOpacity.value = 1 - k;
  if (atmo) atmo.material.uniforms.strength.value = 1 - k;

  // 헤이즈
  hazeMat.uniforms.uK.value = smooth(altKm, 60, 3.0) * 0.55;
  hazeMat.uniforms.uSun.value = 1 - clamp01(sunElev / 0.5);
  hazeMat.uniforms.uPitch.value = smooth(pitch, 10, 60);

  $('#h-alt').textContent = altKm >= 100 ? Math.round(altKm) + ' km' : altKm.toFixed(2) + ' km';
}

function seek(p) {
  P = clamp01(p);
  apply(altitudeKm(P), pitchDeg(P), bearingDeg(P));
  $('#h-p').textContent = P.toFixed(3);
  $('#scrub').value = String(P);
}

/* ── 루프 ─────────────────────────────────────────────────── */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  map.resize();
  seek(P);
}
addEventListener('resize', resize);

let frames = 0, SYNC = false;

// 한 프레임 — rAF 루프와 오프라인 벤치가 같은 코드를 쓴다.
function frame(dt) {
  if (earth) earth.material.uniforms.sun.value.copy(sunWorld);
  if (atmo) atmo.material.uniforms.sun.value.copy(sunWorld);

  const t = tech[current];
  if (t) {
    if (current === 1) t.update(altKm, dt, sunWorld);
    else if (current === 2) t.update(altKm, dt, sunWorld, camera);
    else if (current === 3) { t.update(altKm, dt, sunWorld, camera, KM); t.fit(camera); }
    else if (current === 4) { t.setSun(sunWorld); t.update(altKm, dt); }
  }
  // 헤이즈 판을 카메라 앞에 맞춘다
  const d = camera.near * 30;
  const hh = 2 * Math.tan(camera.fov * Math.PI / 360) * d;
  haze.scale.set(hh * camera.aspect * 0.5, hh * 0.5, 1);
  haze.position.set(0, 0, -d);

  if (current === 3 && tech[3]) tech[3].render(innerWidth * DPR, innerHeight * DPR);
  renderer.render(scene, camera);
}

function loop() {
  const dt = fps.tick();
  frames++;
  frame(dt);
  // 벤치 모드: GPU 가 실제로 프레임을 끝낼 때까지 기다린다. 이걸 켜지 않으면 JS 는
  // 커맨드 제출 시간만 재게 되어 0.1ms 같은 무의미한 값이 나온다.
  if (SYNC) { const g = renderer.getContext(); g.readPixels(0, 0, 1, 1, g.RGBA, g.UNSIGNED_BYTE, new Uint8Array(4)); }
  if ((frames & 15) === 0) {
    const s = fps.stats();
    if (s) $('#h-fps').textContent = s.fps.toFixed(0) + ' fps · ' + s.medms.toFixed(1) + 'ms';
  }
  requestAnimationFrame(loop);
}

// 오프라인 벤치 — rAF(창이 가려지면 30Hz 로 묶인다)를 우회해 실제 프레임 비용을 잰다.
// n 프레임을 연속으로 그리고 gl.finish() 로 GPU 완료까지 기다린 뒤 평균/분위수를 낸다.
function benchFrames(n = 90) {
  const gl = renderer.getContext();
  const px = new Uint8Array(4);
  // ANGLE/D3D11 에서 gl.finish() 는 실제로 동기화하지 않는다(0.0ms 가 나온다).
  // 1픽셀 readPixels 는 강제로 GPU 왕복을 발생시켜 프레임이 끝났음을 보장한다.
  const sync = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); };
  for (let i = 0; i < 12; i++) frame(1 / 60);       // 워밍업(셰이더 컴파일·타일 업로드)
  sync();
  const t = [];
  for (let i = 0; i < n; i++) {
    const a = performance.now();
    frame(1 / 60);
    sync();
    t.push(performance.now() - a);
  }
  t.sort((a, b) => a - b);
  const q = (f) => t[Math.min(t.length - 1, Math.floor(t.length * f))];
  const med = Math.max(q(0.5), 0.01);
  return { n, medms: +med.toFixed(2), p95ms: +q(0.95).toFixed(2), fps: +(1000 / med).toFixed(1) };
}


/* ── 필름 레그 "성층운 돌파" — 5초 결정론적 타임라인 ───────────
   프레임을 시각(t, 0..1)만으로 못 박는다. dt 를 쓰지 않으므로 몇 번을 렌더해도
   같은 그림이 나온다(스크럽 인코딩의 전제).
   0.00  EOX 글로브 위의 한반도 (첫 프레임 — 다른 레그의 우주 컷과 이어붙인다)
   0.55  데크가 화면으로 밀려 올라온다
   0.66  화이트아웃 정점 — 고도 불연속을 이 흰 섬광이 덮는다
   1.00  구름 없는 V-World 서남해안 z8.0 (마지막 프레임 — 다음 레그의 지역 컷)   */
const FILM = {
  sec: 5, fps: 25,
  from: [127.55, 36.60],          // 한반도 중부
  to:   [126.35, 34.75],          // 서남해안(신안·목포 앞바다)
  endZoom: 8.0,
};
const ease = (t) => t * t * (3 - 2 * t);
const expo = (a, b, t) => a * Math.pow(b / a, t);

function filmState(t) {
  t = clamp01(t);
  // 고도: 궤도 → 성층권 → 데크 관통. 0.72 이후는 흰 섬광 뒤에서 지역 고도로 넘어간다.
  const alt = t < 0.72
    ? expo(6400, 7.2, ease(t / 0.72))
    : expo(7.2, 372, ease((t - 0.72) / 0.28));      // 372km ≈ MapLibre z8
  const pitch = lerp(2, 16, ease(smooth(t, 0.30, 0.80)));
  const bearing = lerp(-16, 4, ease(t));
  const g = ease(smooth(t, 0.12, 0.96));
  const center = [lerp(FILM.from[0], FILM.to[0], g), lerp(FILM.from[1], FILM.to[1], g)];
  // 마지막 15% 는 지도 줌을 z8.0 으로 정확히 눌러 다음 레그와 이음매를 맞춘다.
  const lock = ease(smooth(t, 0.86, 1.0));
  return { alt, pitch, bearing, center, lock };
}

function film(t) {
  const st = filmState(t);
  placeAnchor(st.center[0], st.center[1]);
  updateSun();
  const zPhys = zoomForAltitude(st.alt, st.pitch);
  const z = lerp(zPhys, FILM.endZoom, st.lock);
  apply(st.alt, st.pitch, st.bearing, st.center, z);
  // 기법은 시각으로 결정론적으로 갱신한다(누적 dt 금지)
  const T = t * FILM.sec;
  if (tech[2]) tech[2].updateAt(st.alt, T, sunWorld, camera);
  if (tech[3]) { tech[3].updateAt(st.alt, T, sunWorld, camera, KM); tech[3].fit(camera); }
  if (tech[1]) tech[1].updateAt(st.alt, T, sunWorld);
  P = t;
  $('#h-p').textContent = t.toFixed(3);
}

function clean(on) { $('#ui').style.display = on ? 'none' : ''; }

/* ── 부팅 ─────────────────────────────────────────────────── */
const note = $('#note');
async function boot() {
  note.textContent = 'EOX 타일 재투영…';
  const { tex, credit } = await earthTexture((i, n) => { if (i % 8 === 0) note.textContent = `EOX 타일 ${i}/${n}`; });
  earthCredit = credit;
  earth = makeEarth(tex);
  earthGroup.add(earth);
  atmo = makeAtmosphere(1.052);
  earthGroup.add(atmo);

  note.textContent = '구름맵 로드…';
  const loader = new THREE.TextureLoader();
  const cloudTex = await new Promise((res) => loader.load('./tex/earth_clouds_8k.jpg', res,
    undefined, () => loader.load('./tex/earth_clouds_2k.jpg', res)));

  tech[1] = createCloudSphere(cloudTex);
  earthGroup.add(tech[1].group);

  tech[2] = createDecks(anchor);
  camera.add(tech[2].haze);

  note.textContent = '3D 노이즈 굽는 중…';
  await new Promise((r) => setTimeout(r, 0));
  tech[3] = createVolumetric(renderer, anchor, { n: 64 });
  camera.add(tech[3].comp);

  note.textContent = 'NASA GIBS 수신…';
  let gibsInfo = null;
  for (const back of [1, 2, 3, 4]) {
    try {
      const g = await bakeGibs(LAYERS.modis, gibsDate(back), 3,
        (i, n) => { if (i % 8 === 0) note.textContent = `GIBS 타일 ${i}/${n}`; });
      tech[4] = createGibsSphere(g.canvas);
      earthGroup.add(tech[4].group);
      gibsInfo = g; break;
    } catch { /* 하루 전으로 */ }
  }

  $('#credits').textContent =
    `${earthCredit} · 구름맵 © Solar System Scope (CC BY 4.0) · 실사 구름: NASA EOSDIS GIBS ` +
    (gibsInfo ? `${gibsInfo.layer} ${gibsInfo.date}` : '(수신 실패)') +
    ' · V-World 국토교통부 · 구름 데크 텍스처 © LX Land-XI';

  setTech(2);
  setHour(10.5);
  resize();
  seek(0.1);
  note.textContent = '';
  document.body.dataset.ready = '1';
  loop();
}

/* ── UI ───────────────────────────────────────────────────── */
$('#scrub').addEventListener('input', (e) => seek(+e.target.value));
function setHour(h) {
  WHEN = kstDate(h); updateSun();
  $('#h-sun').textContent = (sunElev * 180 / Math.PI).toFixed(1) + '° · ' + h.toFixed(1) + '시';
  $('#hour').value = String(h);
  seek(P);
}
$('#hour').addEventListener('input', (e) => setHour(+e.target.value));
document.querySelectorAll('#tech button').forEach((b) =>
  b.addEventListener('click', () => setTech(+b.dataset.t)));
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') setTech(+e.key);
  if (e.key === 'ArrowRight') seek(P + 0.01);
  if (e.key === 'ArrowLeft') seek(P - 0.01);
});

window.__spike = {
  seek, setTech, altitudeKm,
  get p() { return P; },
  get altKm() { return altKm; },
  get tech() { return current; },
  fps: () => fps.stats(),
  resetFps: () => fps.reset(),
  sunElevDeg: () => sunElev * 180 / Math.PI,
  setHour: (h) => setHour(h),
  setSync: (v) => { SYNC = !!v; fps.reset(); },
  benchFrames,
  film, filmState, clean, placeAnchor,
  FILM,
  renderOnce: () => { if (current === 3 && tech[3]) tech[3].render(innerWidth * DPR, innerHeight * DPR); renderer.render(scene, camera); },
};

boot().catch((e) => { note.textContent = '부팅 실패: ' + e.message; console.error(e); });
