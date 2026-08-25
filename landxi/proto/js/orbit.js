import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// 챕터 1 궤도 — MapLibre 글로브 위에 정렬된 three.js 오버레이 캔버스.
// 지도 GL 컨텍스트를 건드리지 않으므로 deck.gl / 지형과 상태 충돌이 없고,
// 무엇보다 "지구 뒤로 넘어간 궤도가 지구에 가려지는" 오클루전을 공짜로 얻는다(자체비평 #11).
// 위성은 장식이 아니라 데이터다: 이 페이지의 전지구 베이스맵이 Sentinel-2 이므로
// Sentinel-2 의 실제 궤도(고도 786 km · 경사 98.62° 태양동기 역행)를 그대로 쓴다.

export const SAT = { name: 'SENTINEL-2', altKm: 786, incDeg: 98.62, periodMin: 100.6 };
const EARTH_KM = 6371;
const D2R = Math.PI / 180;
const KOREA = [127.5, 36.2];

function panelTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#0B1B3A'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = 'rgba(120,180,255,.5)'; x.lineWidth = 1;
  for (let i = 0; i <= 128; i += 8) { x.beginPath(); x.moveTo(i + .5, 0); x.lineTo(i + .5, 64); x.stroke(); }
  for (let j = 0; j <= 64; j += 16) { x.beginPath(); x.moveTo(0, j + .5); x.lineTo(128, j + .5); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
  return t;
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(150,220,255,.8)');
  g.addColorStop(1, 'rgba(120,200,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.premultiplyAlpha = true;   // 투명 캔버스 위에서 검은 후광이 생기지 않게
  return t;
}

function buildSatellite() {
  const g = new THREE.Group();
  const foil = new THREE.MeshStandardMaterial({ color: 0xE8C275, metalness: 0.18, roughness: 0.42,
    emissive: 0x2A1E08, emissiveIntensity: 1 });
  const shell = new THREE.MeshStandardMaterial({ color: 0xDCE4EF, metalness: 0.12, roughness: 0.5,
    emissive: 0x12203A, emissiveIntensity: 1 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.5, 1.05), foil));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.16, 1.14), shell);
  cap.position.y = 0.82; g.add(cap);
  const pmat = new THREE.MeshStandardMaterial({
    map: panelTexture(), metalness: 0.1, roughness: 0.55,
    emissive: 0x16407F, emissiveIntensity: 1.5, side: THREE.DoubleSide,
  });
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.09), shell);
    arm.position.x = s * 0.8; g.add(arm);
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.05, 1.15), pmat);
    p.position.x = s * 2.55; p.rotation.x = 0.14 * s; g.add(p);
  }
  const dish = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), shell);
  dish.position.y = -1.05; dish.rotation.x = Math.PI; g.add(dish);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.5, 6), shell);
  boom.position.y = -0.95; g.add(boom);
  return g;
}

export function makeOrbit(canvas, assetsReady) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36.87, 1, 1, 1e8);

  // glb 의 금속 머티리얼(금색 MLI · 셀 패널)은 환경맵이 없으면 새까맣게 렌더된다.
  // three 의 대표적 함정 — PMREM 으로 구운 RoomEnvironment 를 씬 환경으로 준다.
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  } catch (e) { /* 환경맵 실패 시에도 조명만으로 렌더된다 */ }

  const sunLight = new THREE.DirectionalLight(0xFFF6E4, 3.4);
  scene.add(sunLight);
  scene.add(new THREE.AmbientLight(0x8AA8D8, 2.0));
  const fill = new THREE.DirectionalLight(0x9FC4FF, 1.1); fill.position.set(-30, 20, 60); scene.add(fill);

  const earth = new THREE.Group(); scene.add(earth);
  const occluder = new THREE.Mesh(
    new THREE.SphereGeometry(1, 48, 32),
    new THREE.MeshBasicMaterial({ colorWrite: false }));
  occluder.renderOrder = -1; earth.add(occluder);

  const inc = SAT.incDeg * D2R;
  const rOrb = 1 + SAT.altKm / EARTH_KM;

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.0034, 3, 260),
    new THREE.MeshBasicMaterial({ color: 0xB8ECFF, transparent: true, opacity: 0.58, depthWrite: false }));
  ring.matrixAutoUpdate = false;
  ring.matrix
    .makeRotationZ(inc)
    .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
    .multiply(new THREE.Matrix4().makeScale(rOrb, rOrb, rOrb));
  earth.add(ring);

  const N = 56;
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  // AdditiveBlending 은 투명 캔버스에서 알파까지 누적돼 검은 줄로 합성된다 — NormalBlending 을 쓴다.
  const trail = new THREE.Points(trailGeo, new THREE.PointsMaterial({
    size: 9, map: dotTexture(), transparent: true, depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    vertexColors: true, sizeAttenuation: false,
  }));
  earth.add(trail);

  const sat = buildSatellite(); earth.add(sat);

  // 병렬 작업물(assets/proto/models/satellite.glb)이 도착하면 절차적 메쉬를 대체한다.
  // 없으면 조용히 절차적 위성을 유지한다.
  const wings = [];
  Promise.resolve(assetsReady).then((a) => { if (!a || !a.satellite) return;
  new GLTFLoader().load('../assets/proto/models/satellite.glb', (g) => {
    const box = new THREE.Box3().setFromObject(g.scene);
    const size = box.getSize(new THREE.Vector3()).length() || 1;
    const k = 6 / size;
    g.scene.scale.setScalar(k);
    g.scene.position.sub(box.getCenter(new THREE.Vector3()).multiplyScalar(k));
    while (sat.children.length) sat.remove(sat.children[0]);
    sat.add(g.scene);
    for (const n of ['solar_l', 'solar_r']) {
      const w = g.scene.getObjectByName(n);
      if (w) wings.push(w);
    }
  }, undefined, () => { /* 로드 실패 — 절차적 위성 유지 */ }); });

  // 궤도상 위치 (지구 고정계, +Y = 북극)
  const orbitPos = (phase) => new THREE.Vector3(
    Math.cos(phase) * Math.cos(inc) * rOrb,
    Math.cos(phase) * Math.sin(inc) * rOrb,
    Math.sin(phase) * rOrb);

  const ecef = (lng, lat) => new THREE.Vector3(
    Math.cos(lat * D2R) * Math.sin(lng * D2R),
    Math.sin(lat * D2R),
    Math.cos(lat * D2R) * Math.cos(lng * D2R));

  const t0 = performance.now();
  const state = { lng: 0, lat: 0, altKm: SAT.altKm, distKm: 0, offX: 0, offY: 0, sunScreen: { x: 0, y: -1, z: 0 } };

  function resize(w, h, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function update(map, sun, opacity) {
    canvas.style.opacity = String(opacity);
    const tr = map.transform || {};
    const H = map.getCanvas().clientHeight || 800;
    const fovDeg = tr.fov || 36.87;
    const f = tr.cameraToCenterDistance || (0.5 * H / Math.tan(fovDeg * D2R / 2));
    const c = map.getCenter();
    // MapLibre 글로브의 픽셀 반지름은 worldSize/(2π·cos(lat)) 다(실측으로 확인).
    // cos(lat) 를 빼먹으면 three 쪽 구체가 실제 지구보다 작아져 오클루전 경계가 어긋난다.
    const R = (512 * Math.pow(2, map.getZoom())) / (2 * Math.PI * Math.cos(c.lat * D2R));

    camera.fov = fovDeg;
    camera.position.set(0, 0, f + R);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const cw = map.getCanvas().clientWidth || 1280;
    const cp = tr.centerPoint || map.project(c);
    const D = f + R;
    state.offX = cp.x - cw / 2; state.offY = cp.y - H / 2;
    earth.position.set(state.offX * D / f, -state.offY * D / f, 0);
    earth.scale.setScalar(R);
    earth.rotation.set(c.lat * D2R, -c.lng * D2R, -(map.getBearing() || 0) * D2R, 'XYZ');
    earth.updateMatrixWorld();

    // 태양 방향 — SunCalc 가 낸 실제 직하점. 조명과 터미네이터가 같은 값을 쓴다.
    const sv = ecef(sun.lng, sun.lat);
    const sw = sv.clone().applyEuler(earth.rotation);
    sunLight.position.copy(sw).multiplyScalar(R * 60);
    state.sunScreen = { x: sw.x, y: sw.y, z: sw.z };

    const el = (performance.now() - t0) / 1000;
    // 실제 주기 100.6분을 260배속으로 — 궤도가 눈에 보이되 "빙빙 도는 장식"은 되지 않게.
    const phase = 1.2 - el * (2 * Math.PI / (SAT.periodMin * 60)) * 260;
    const p3 = orbitPos(phase);
    sat.position.copy(p3);
    sat.scale.setScalar(0.085);
    // glb 규약: Y-up, 나디르(광학 탑재체) 방향은 -Y. lookAt 은 -Z 를 지구로 향하게 하므로
    // X 축 -90° 로 -Z → -Y 로 옮긴다.
    sat.lookAt(0, 0, 0);
    sat.rotateX(-Math.PI / 2);
    // 아주 느린 자세 드리프트 — 완전히 고정된 3D 오브젝트는 스티커로 읽힌다.
    sat.rotateZ(Math.sin(el * 0.13) * 0.09);
    sat.rotateY(Math.sin(el * 0.09 + 1.7) * 0.06);
    // 태양전지 요크는 실제 태양 방향(SunCalc)을 따라간다.
    const wing = Math.atan2(sw.y, Math.hypot(sw.x, sw.z)) + phase * 0.0;
    for (const w of wings) w.rotation.x = wing;

    const pa = trailGeo.getAttribute('position'), ca = trailGeo.getAttribute('color');
    for (let i = 0; i < N; i++) {
      const q = orbitPos(phase + i * 0.015);
      pa.setXYZ(i, q.x, q.y, q.z);
      const a = Math.pow(1 - i / N, 2.2);
      ca.setXYZ(i, 0.62 * a, 0.88 * a, a);
    }
    pa.needsUpdate = true; ca.needsUpdate = true;

    const v = p3.clone().normalize();
    state.lng = ((Math.atan2(v.x, v.z) / D2R) + 540) % 360 - 180;
    state.lat = Math.asin(Math.max(-1, Math.min(1, v.y))) / D2R;
    state.distKm = p3.clone().multiplyScalar(EARTH_KM)
      .sub(ecef(KOREA[0], KOREA[1]).multiplyScalar(EARTH_KM)).length();

    if (opacity > 0.002) renderer.render(scene, camera);
    return state;
  }

  return { update, resize, state };
}
