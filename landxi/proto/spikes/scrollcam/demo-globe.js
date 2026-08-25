/* 데모 (b) — three.js 0.185.1. 같은 레일, 같은 키프레임, 다른 렌더러.
   레일이 지도에만 붙는 물건이 아니라는 것을 증명하는 것이 목적이다.

   카메라 매핑은 눈대중이 아니라 MapLibre 의 정의를 그대로 옮긴 것이다:
     mpp(z, φ) = 78271.517 · cos φ / 2^z      (512px 타일 기준)
     dist      = (H/2) / tan(fov/2) · mpp     (fov 36.87° = MapLibre 기본값)
   따라서 같은 zoom 에서 지도와 구는 지면을 같은 배율로 본다. */

import * as THREE from 'three';

const R = 6371008.8;                 // m
const U = 1 / R;                     // 1 유닛 = 지구 반지름
const D2R = Math.PI / 180;
const FOV = 36.87;
const MPP0 = 78271.516964;

const NAMWON = [127.3524, 35.5311];
const EOX = (z, x, y) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`;
const ORTHO = (z, x, y) => `../../assets/tiles/namwon_city_2510/${z}/${x}/${y}.webp`;

const lng2x = (l, z) => Math.floor((l + 180) / 360 * 2 ** z);
const lat2y = (a, z) => Math.floor((1 - Math.log(Math.tan(a * D2R) + 1 / Math.cos(a * D2R)) / Math.PI) / 2 * 2 ** z);
const x2lng = (x, z) => x / 2 ** z * 360 - 180;
const y2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };

function loadImg(src) {
  return new Promise((res) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
  });
}

/* EOX 메르카토르 타일 → 등장방형(equirect) 캔버스.
   구에 씌우려면 메르카토르를 위도로 되풀어야 한다. 행 단위 리샘플이면 충분하다. */
async function earthTexture(z = 3) {
  const n = 2 ** z, TS = 256, W = n * TS;
  const merc = document.createElement('canvas'); merc.width = W; merc.height = W;
  const mc = merc.getContext('2d');
  mc.fillStyle = '#06122A'; mc.fillRect(0, 0, W, W);
  const jobs = [];
  for (let x = 0; x < n; x++) for (let y = 0; y < n; y++)
    jobs.push(loadImg(EOX(z, x, y)).then((im) => { if (im) mc.drawImage(im, x * TS, y * TS, TS, TS); }));
  await Promise.all(jobs);

  const H = W / 2;
  const eq = document.createElement('canvas'); eq.width = W; eq.height = H;
  const ec = eq.getContext('2d');
  ec.fillStyle = '#06122A'; ec.fillRect(0, 0, W, H);
  for (let j = 0; j < H; j++) {
    const lat = 90 - (j + 0.5) / H * 180;
    const la = Math.max(-85.0511, Math.min(85.0511, lat)) * D2R;
    const sy = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * W;
    ec.drawImage(merc, 0, Math.max(0, Math.min(W - 1, sy)), W, 1, 0, j, W, 1);
  }
  const t = new THREE.CanvasTexture(eq);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/* 우리 정사영상 패치 — 구의 3km 짜리 접평면 한 장. 착지 구간에서만 켜진다. */
async function orthoPatch(z = 16, span = 8) {
  const cx = lng2x(NAMWON[0], z), cy = lat2y(NAMWON[1], z);
  const x0 = cx - span / 2, y0 = cy - span / 2, TS = 256;
  const cv = document.createElement('canvas'); cv.width = cv.height = span * TS;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#2A2F26'; ctx.fillRect(0, 0, cv.width, cv.height);
  let hit = 0;
  await Promise.all(Array.from({ length: span * span }, (_, i) => {
    const dx = i % span, dy = (i / span) | 0;
    return loadImg(ORTHO(z, x0 + dx, y0 + dy)).then((im) => {
      if (im && im.width > 1) { ctx.drawImage(im, dx * TS, dy * TS, TS, TS); hit++; }
    });
  }));
  if (hit < 4) return null;
  const west = x2lng(x0, z), east = x2lng(x0 + span, z);
  const north = y2lat(y0, z), south = y2lat(y0 + span, z);
  const midLat = (north + south) / 2, midLng = (west + east) / 2;
  const w = (east - west) * D2R * R * Math.cos(midLat * D2R);
  const h = (north - south) * D2R * R;
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return { tex: t, w: w * U, h: h * U, lng: midLng, lat: midLat };
}

const basis = (lng, lat) => {
  const a = lng * D2R, b = lat * D2R, c = Math.cos(b);
  const N = new THREE.Vector3(c * Math.cos(a), Math.sin(b), c * Math.sin(a));
  const east = N.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const north = east.clone().cross(N).normalize();
  return { N, east, north };
};

export async function createGlobeDemo(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, alpha: true });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(FOV, 1, 1e-5, 60);

  // 별 — 궤도 구간에만 보인다.
  const sg = new THREE.BufferGeometry();
  const sp = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(28 + Math.random() * 10);
    sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z;
  }
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xE8EEF8, size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.9 }));
  scene.add(stars);

  // 지구 — 직접 UV 를 계산한다(SphereGeometry 의 UV 관례에 의존하지 않는다).
  const earthMat = new THREE.ShaderMaterial({
    uniforms: { map: { value: null }, sun: { value: new THREE.Vector3(0.55, 0.42, 0.72).normalize() }, amb: { value: 0.42 } },
    vertexShader: `varying vec3 vN; void main(){ vN = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform vec3 sun; uniform float amb; varying vec3 vN;
      const float PI = 3.14159265359;
      void main(){
        vec3 n = normalize(vN);
        float u = atan(n.z, n.x) / (2.0*PI) + 0.5;
        float v = 1.0 - (asin(clamp(n.y,-1.0,1.0)) / PI + 0.5);
        vec3 c = texture2D(map, vec2(u, v)).rgb;
        float d = max(dot(n, normalize(sun)), 0.0);
        gl_FragColor = vec4(c * (amb + (1.0-amb) * pow(d, 0.6)), 1.0);
      }`,
  });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMat);
  scene.add(earth);

  // 대기 — 그레이징 앵글에서 밝아지는 뒷면 실드(Cerebrium 문법).
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(1.022, 96, 64),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { k: { value: 1 } },
      vertexShader: `varying vec3 vN; varying vec3 vP;
        void main(){ vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vP=mv.xyz;
        gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `varying vec3 vN; varying vec3 vP; uniform float k;
        void main(){ float f=pow(1.0-abs(dot(normalize(vN),normalize(-vP))),2.2);
        gl_FragColor=vec4(vec3(0.42,0.62,0.95)*f*1.5*k, f*k); }`,
    }));
  scene.add(atmo);

  // 정사영상 패치
  const patchMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
  const patch = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), patchMat);
  patch.visible = false;
  scene.add(patch);

  // 착지점 표식
  const pin = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xF2622A }));
  pin.visible = false; scene.add(pin);

  // 텍스처는 비동기로 도착한다 — 도착 전에도 레일은 돈다.
  let ready = false;
  earthTexture(3).then((t) => { earthMat.uniforms.map.value = t; ready = true; render(); });
  orthoPatch().then((o) => {
    if (!o) return;
    patchMat.map = o.tex; patchMat.needsUpdate = true;
    patch.geometry.dispose(); patch.geometry = new THREE.PlaneGeometry(o.w, o.h);
    const { N, east, north } = basis(o.lng, o.lat);
    patch.position.copy(N).multiplyScalar(1 + 4e-7);
    patch.matrixAutoUpdate = false;
    const m = new THREE.Matrix4().makeBasis(east, north, N);
    m.setPosition(patch.position);
    patch.matrix.copy(m);
    patch.visible = true;
    const b2 = basis(NAMWON[0], NAMWON[1]);
    pin.position.copy(b2.N).multiplyScalar(1.00002);
    pin.scale.setScalar(3e-6); pin.visible = true;
    render();
  });

  let W = 1, H = 1;
  function resize() {
    W = canvas.clientWidth || innerWidth; H = canvas.clientHeight || innerHeight;
    renderer.setSize(W, H, false);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    render();
  }
  const tanHalf = Math.tan(FOV / 2 * D2R);
  const render = () => renderer.render(scene, cam);

  /* 레일 상태 → three 카메라 */
  function apply(s) {
    const [lng, lat] = s.center;
    const mpp = MPP0 * Math.cos(lat * D2R) / Math.pow(2, s.zoom);
    const dist = (H / 2) / tanHalf * mpp * U;      // 지표면으로부터의 거리(유닛)
    const t = s.pitch * D2R, b = s.bearing * D2R;
    const { N, east, north } = basis(lng, lat);
    // 화면 위쪽이 향하는 수평 방향(= 방위각 bearing)
    const up = north.clone().multiplyScalar(Math.cos(b)).addScaledVector(east, Math.sin(b));
    const target = N.clone();                       // 지표면 위의 목표점
    cam.position.copy(target)
      .addScaledVector(N, dist * Math.cos(t))
      .addScaledVector(up, -dist * Math.sin(t));
    cam.up.copy(N).multiplyScalar(Math.sin(t)).addScaledVector(up, Math.cos(t)).normalize();
    cam.lookAt(target);
    cam.near = Math.max(1e-6, dist * 0.02);
    cam.far = Math.max(4, dist * 6 + 40);
    cam.updateProjectionMatrix();

    atmo.material.uniforms.k.value = Math.max(0, Math.min(1, (7.4 - s.zoom) / 2.6));
    stars.visible = s.zoom < 5.6;
    stars.material.opacity = Math.max(0, Math.min(0.9, (5.6 - s.zoom) / 1.6));
    patchMat.opacity = Math.max(0, Math.min(1, (s.zoom - 12.4) / 1.6));
    pin.visible = s.zoom > 8 && s.zoom < 15.5;
    render();
  }

  addEventListener('resize', resize);
  resize();
  return { apply, render, resize, renderer, isReady: () => ready };
}
