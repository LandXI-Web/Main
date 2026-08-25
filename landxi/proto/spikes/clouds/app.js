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
const WHEN = new Date();

/* ── 고도 곡선 — p 를 km 로. 0.3 에서 대류권계면(10km)을 지난다 ── */
const A_TOP = 12000, A_MID = 10, A_GND = 0.35;
export function altitudeKm(p) {
  p = clamp01(p);
  return p < 0.3
    ? A_TOP * Math.pow(A_MID / A_TOP, p / 0.3)
    : A_MID * Math.pow(A_GND / A_MID, (p - 0.3) / 0.7);
}
const pitchDeg = (p) => lerp(8, 66, smooth(p, 0.18, 0.92));
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
{
  const P = llToVec(TARGET.lon, TARGET.lat, R);
  const up = P.clone().normalize();
  const north = new THREE.Vector3(0, 1, 0).sub(up.clone().multiplyScalar(up.y)).normalize();
  const east = north.clone().cross(up).normalize();
  const m = new THREE.Matrix4().makeBasis(east, up, north.clone().negate());
  anchor.quaternion.setFromRotationMatrix(m);
  anchor.position.copy(P);
}
scene.add(anchor);
anchor.updateMatrixWorld(true);

/* ── 태양 (SunCalc) ───────────────────────────────────────── */
const sunWorld = new THREE.Vector3(1, 0, 0);
let sunElev = 0;
function updateSun() {
  const s = window.SunCalc.getPosition(WHEN, TARGET.lat, TARGET.lon);
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
  const z = Math.log2(156543.03392 * Math.cos(TARGET.lat * Math.PI / 180) / mpp);
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
function seek(p) {
  P = clamp01(p);
  altKm = altitudeKm(P);
  const pitch = pitchDeg(P), bearing = bearingDeg(P);

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
  const mz = zoomForAltitude(altKm, pitch);
  map.jumpTo({ center: [TARGET.lon, TARGET.lat], zoom: mz, pitch: Math.min(80, pitch), bearing });

  // 배경 크로스페이드: 글로브 → 지도 (p 0.26 → 0.365)
  const k = smooth(P, 0.255, 0.365);
  mapEl.style.opacity = String(k);
  earthGroup.visible = k < 0.995;
  if (earth) earth.material.opacity = 1 - k;
  if (atmo) atmo.material.uniforms.strength.value = (1 - k) * 1.0 + 0.0;

  // 헤이즈
  hazeMat.uniforms.uK.value = smooth(altKm, 60, 3.0) * 0.55;
  hazeMat.uniforms.uSun.value = 1 - clamp01(sunElev / 0.5);
  hazeMat.uniforms.uPitch.value = smooth(pitch, 10, 60);

  $('#h-p').textContent = P.toFixed(3);
  $('#h-alt').textContent = altKm >= 100 ? Math.round(altKm) + ' km' : altKm.toFixed(2) + ' km';
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

let frames = 0;
function loop() {
  const dt = fps.tick();
  frames++;

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
  {
    const d = camera.near * 30;
    const hh = 2 * Math.tan(camera.fov * Math.PI / 360) * d;
    haze.scale.set(hh * camera.aspect * 0.5, hh * 0.5, 1);
    haze.position.set(0, 0, -d);
  }
  if (current === 3 && tech[3]) tech[3].render(innerWidth * DPR, innerHeight * DPR);

  renderer.render(scene, camera);

  if ((frames & 15) === 0) {
    const s = fps.stats();
    if (s) $('#h-fps').textContent = s.fps.toFixed(0) + ' fps · ' + s.medms.toFixed(1) + 'ms';
  }
  requestAnimationFrame(loop);
}

/* ── 부팅 ─────────────────────────────────────────────────── */
const note = $('#note');
async function boot() {
  note.textContent = 'EOX 타일 재투영…';
  const { tex, credit } = await earthTexture((i, n) => { if (i % 8 === 0) note.textContent = `EOX 타일 ${i}/${n}`; });
  earthCredit = credit;
  earth = makeEarth(tex);
  earth.material.transparent = true;
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
  for (const back of [1, 2, 3]) {
    try {
      const g = await bakeGibs(LAYERS.modis, gibsDate(back), 2,
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
  resize();
  seek(0.1);
  note.textContent = '';
  document.body.dataset.ready = '1';
  loop();
}

/* ── UI ───────────────────────────────────────────────────── */
$('#scrub').addEventListener('input', (e) => seek(+e.target.value));
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
};

boot().catch((e) => { note.textContent = '부팅 실패: ' + e.message; console.error(e); });
