// Land-XI SPIKE — 순수 three.js 스크롤 글로브 → 실사 정사영상 착지
// 구조: 두 개의 씬(우주 스케일 globe / 미터 스케일 local)을 한 컴포저에서 겹쳐 렌더하고
//       고도 ~30 km 부근에서 크로스페이드한다. 스크롤 진행도 p∈[0,1] 하나가 전부를 구동한다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const BASE = './';
// 필름 모드: 스크롤 대신 window.__spike.setLeg()/seek() 로 결정론적 프레임을 낸다.
// (스크롤 데모와 같은 씬을 쓰되 Lenis/ScrollTrigger 와 로컬 지면 씬은 끈다.)
const FILM = new URLSearchParams(location.search).has('film');
const R_EARTH = 6371;                     // km. globe 씬에서 반지름 1 = 6371 km
const TARGET = { lon: 127.305, lat: 35.335, name: '남원 금지면' };   // 비닐하우스 397 동의 실제 중심
const D2R = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// 위경도 → 구면 좌표(등장방형 uv 규약과 일치)
function ll2v(lat, lon, r = 1, out = new THREE.Vector3()) {
  const B = lat * D2R, L = lon * D2R, cb = Math.cos(B);
  return out.set(-cb * Math.cos(L) * r, Math.sin(B) * r, cb * Math.sin(L) * r);
}
// 웹 머케이터 미터 (로컬 씬 원점 = TARGET)
const MPD = 111319.49;
const m2x = (lon) => (lon - TARGET.lon) * MPD * Math.cos(TARGET.lat * D2R);
const m2z = (lat) => -(lat - TARGET.lat) * MPD;

/* ───────────────────────── 렌더러 ───────────────────────── */
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(FILM ? 1 : Math.min(devicePixelRatio, 1.5));   // DPR 상한 1.5 (필름은 1 고정)
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.autoClear = false;

const pmrem = new THREE.PMREMGenerator(renderer);
const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);

/* ───────────────────────── 로더 ───────────────────────── */
const loadMgr = new THREE.LoadingManager();
const bar = document.querySelector('#loader .bar i');
loadMgr.onProgress = (_u, a, t) => { bar.style.width = Math.round(a / t * 100) + '%'; };
const texLoader = new THREE.TextureLoader(loadMgr);
const tex = (f, srgb = true) => {
  const t = texLoader.load(BASE + 'tex/' + f);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
};
const json = (f) => fetch(BASE + f).then(r => r.ok ? r.json() : null).catch(() => null);

/* ───────────────────────── GLOBE 씬 ───────────────────────── */
const gScene = new THREE.Scene();
const gCam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.0008, 400);
const sunDir = ll2v(8, 143).normalize();   // 태양 방향 — 시작 화면은 낮, 왼쪽 림에 터미네이터

const earthUniforms = {
  dayMap: { value: tex('earth_day.jpg') },
  nightMap: { value: tex('earth_night.jpg') },
  bumpMap: { value: tex('earth_bump.jpg', false) },
  specMap: { value: tex('earth_spec.jpg', false) },
  cloudMap: { value: tex('earth_clouds.png') },
  koreaMap: { value: tex('korea_z8.jpg') },
  korea2Map: { value: tex('korea_z10.jpg') },
  uKorea2Bounds: { value: new THREE.Vector4(124.8046875, 32.84267363, 130.078125, 37.16031655) },
  uKorea2Blend: { value: 0 },
  uKoreaBounds: { value: new THREE.Vector4(122, 32, 133, 40) },
  uKoreaBlend: { value: 0 },
  uSun: { value: sunDir.clone() },
  uCloudRot: { value: 0 },
  uRimK: { value: 1 },
  uTime: { value: 0 },
};

const EARTH_VS = `
  varying vec3 vP; varying vec3 vW;
  void main(){
    vP = position;
    vW = (modelMatrix * vec4(position,1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
  }`;

const EARTH_FS = `
  precision highp float;
  uniform sampler2D dayMap,nightMap,bumpMap,specMap,cloudMap,koreaMap,korea2Map;
  uniform vec4 uKoreaBounds,uKorea2Bounds; uniform float uKoreaBlend,uKorea2Blend,uCloudRot,uTime,uRimK;
  uniform vec3 uSun;
  varying vec3 vP; varying vec3 vW;
  const float PI = 3.14159265359;
  vec2 sph2uv(vec3 n){ return vec2(atan(n.z,-n.x)/(2.0*PI)+0.5, asin(clamp(n.y,-1.0,1.0))/PI+0.5); }
  float lum(vec3 c){ return dot(c, vec3(0.2126,0.7152,0.0722)); }
  // 저해상 원본의 '색'을 지키고 고해상 패치의 '휘도 디테일'만 얹는다.
  // (V-World 타일은 타일마다 색이 튀어서 그대로 섞으면 체크무늬가 생긴다)
  vec3 detailTransfer(vec3 base, vec3 hi, float landK){
    float g = clamp(lum(hi) / max(lum(base), 0.035), 0.60, 1.70);
    vec3 lumOnly = base * g;
    vec3 d = mix(lumOnly, hi, 0.62);
    return mix(base, d, landK);        // 바다에서는 원본 그대로 — 타일 체크무늬 제거
  }
  void main(){
    vec3 n = normalize(vP);
    vec2 uv = sph2uv(n);
    float lon = (uv.x-0.5)*360.0, lat = (uv.y-0.5)*180.0;

    vec3 base = texture2D(dayMap, uv).rgb;
    float oceanMask = texture2D(specMap, uv).r;      // 1 = 바다
    float landK = 1.0 - smoothstep(0.22, 0.55, oceanMask);

    // 한반도 고해상 패치를 접근할수록 섞는다
    if(uKoreaBlend > 0.001){
      vec2 kb = vec2((lon-uKoreaBounds.x)/(uKoreaBounds.z-uKoreaBounds.x),
                     (uKoreaBounds.w-lat)/(uKoreaBounds.w-uKoreaBounds.y));
      if(kb.x>0.0 && kb.x<1.0 && kb.y>0.0 && kb.y<1.0){
        float edge = smoothstep(0.0,0.07,kb.x)*smoothstep(1.0,0.93,kb.x)
                   * smoothstep(0.0,0.07,kb.y)*smoothstep(1.0,0.93,kb.y);
        vec3 k = texture2D(koreaMap, kb).rgb;
        float kv = smoothstep(0.02, 0.09, max(max(k.r,k.g),k.b));   // 무데이터 타일
        k = mix(base, k, kv);
        base = mix(base, detailTransfer(base, k, landK), edge*uKoreaBlend*kv);
      }
    }

    if(uKorea2Blend > 0.001){
      vec2 kb = vec2((lon-uKorea2Bounds.x)/(uKorea2Bounds.z-uKorea2Bounds.x),
                     (uKorea2Bounds.w-lat)/(uKorea2Bounds.w-uKorea2Bounds.y));
      if(kb.x>0.0 && kb.x<1.0 && kb.y>0.0 && kb.y<1.0){
        float edge = smoothstep(0.0,0.05,kb.x)*smoothstep(1.0,0.95,kb.x)
                   * smoothstep(0.0,0.05,kb.y)*smoothstep(1.0,0.95,kb.y);
        vec3 k2 = texture2D(korea2Map, kb).rgb;
        float k2v = smoothstep(0.02, 0.09, max(max(k2.r,k2.g),k2.b));
        k2 = mix(base, k2, k2v);
        base = mix(base, detailTransfer(base, k2, landK), edge*uKorea2Blend*k2v);
      }
    }

    // 범프에서 법선 섭동 — 저고도에서 산악 음영이 살아난다
    float e = 1.0/4096.0;
    float hL=texture2D(bumpMap,uv-vec2(e,0.0)).r, hR=texture2D(bumpMap,uv+vec2(e,0.0)).r;
    float hD=texture2D(bumpMap,uv-vec2(0.0,e)).r, hU=texture2D(bumpMap,uv+vec2(0.0,e)).r;
    vec3 tang  = normalize(vec3(-n.z, 0.0, n.x));
    vec3 bitan = cross(n, tang);
    vec3 nb = normalize(n + (tang*(hL-hR) + bitan*(hD-hU)) * 16.0);

    float ndl  = dot(nb, uSun);
    float ndl0 = dot(n,  uSun);
    float day  = smoothstep(-0.14, 0.26, ndl0);          // 터미네이터 폭

    // 구름 그림자 (구름 구체와 같은 회전값)
    vec2 cuv = vec2(fract(uv.x + uCloudRot), uv.y);
    float cl = texture2D(cloudMap, cuv).a;
    float clShadow = 1.0 - cl*0.5*day;

    vec3 lit = base * (0.045 + 1.06*max(ndl,0.0)) * clShadow;
    float rim = smoothstep(0.34,-0.02,ndl0)*smoothstep(-0.24,0.05,ndl0);
    lit += base * vec3(1.0,0.42,0.16) * rim * 0.55;      // 새벽/황혼 산란

    vec3 night = texture2D(nightMap, uv).rgb;
    night = pow(night, vec3(1.25)) * vec3(1.0,0.86,0.62) * 2.6;
    vec3 col = mix(night*(1.0-cl*0.75), lit, day);
    col += vec3(0.012,0.026,0.055)*(1.0-day);

    vec3 V = normalize(cameraPosition - vW);
    float ocean = oceanMask;
    vec3 H = normalize(uSun + V);
    col += vec3(1.0,0.97,0.9) * pow(max(dot(n,H),0.0),420.0) * ocean * day * 0.42;

    float fres = pow(1.0 - max(dot(n,V),0.0), 3.2);
    col += vec3(0.24,0.47,0.95) * fres * (0.30 + 0.62*day) * uRimK;

    col = mix(col, mix(vec3(lum(col)) * vec3(0.86,0.96,1.10), col, 0.55), ocean*0.55);
    gl_FragColor = vec4(col, 1.0);
  }`;

const earth = new THREE.Mesh(
  new THREE.SphereGeometry(1, 192, 128),
  new THREE.ShaderMaterial({ uniforms: earthUniforms, vertexShader: EARTH_VS, fragmentShader: EARTH_FS })
);
gScene.add(earth);

// 움직이는 구름 구체 2겹
function cloudShell(r, opacity, tint) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(r, 128, 84),
    new THREE.MeshLambertMaterial({
      map: earthUniforms.cloudMap.value, transparent: true, opacity,
      depthWrite: false, color: tint, alphaTest: 0.004,
    })
  );
  m.renderOrder = 2; return m;
}
const cloudA = cloudShell(1.0045, 0.95, 0xffffff);
const cloudB = cloudShell(1.0105, 0.42, 0xdfe9ff);
gScene.add(cloudA, cloudB);
const gSun = new THREE.DirectionalLight(0xffffff, 3.1);
gSun.position.copy(sunDir).multiplyScalar(30);
gScene.add(gSun, new THREE.AmbientLight(0x2a3a5c, 0.6));

// 대기 (backside fresnel)
const ATMO_FS = `
  varying vec3 vP; varying vec3 vW; uniform vec3 uSun; uniform float uFade;
  void main(){
    vec3 n = normalize(vP);
    vec3 V = normalize(cameraPosition - vW);
    float f = pow(clamp(1.0-abs(dot(n,V)),0.0,1.0), 5.0);
    float sun = clamp(dot(n,uSun)*0.5+0.5, 0.0, 1.0);
    vec3 c = mix(vec3(0.14,0.30,0.78), vec3(0.62,0.80,1.0), sun);
    c += vec3(1.0,0.55,0.25)*pow(sun,6.0)*0.5;
    gl_FragColor = vec4(c, clamp(f*(0.10+1.5*sun),0.0,1.0)*uFade);
  }`;
const atmo = new THREE.Mesh(
  new THREE.SphereGeometry(1.055, 96, 64),
  new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: sunDir.clone() }, uFade: { value: 1 } },
    vertexShader: EARTH_VS, fragmentShader: ATMO_FS,
  })
);
atmo.renderOrder = 3; gScene.add(atmo);

// 저고도 지평선 밴드 — 대기 구체 안쪽에 들어와도 림이 남게 한다
const limb = new THREE.Mesh(
  new THREE.SphereGeometry(1.0135, 256, 128),
  new THREE.ShaderMaterial({
    transparent: true, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: sunDir.clone() }, uFade: { value: 0 } },
    vertexShader: EARTH_VS,
    fragmentShader: `
      varying vec3 vP; varying vec3 vW; uniform vec3 uSun; uniform float uFade;
      void main(){
        vec3 n = normalize(vP);
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(clamp(1.0-abs(dot(n,V)),0.0,1.0), 10.0);
        float sun = clamp(dot(n,uSun)*0.5+0.5, 0.0, 1.0);
        vec3 c = mix(vec3(0.30,0.52,0.92), vec3(0.72,0.86,1.0), sun);
        gl_FragColor = vec4(c, clamp(f*(0.15+1.7*sun),0.0,1.0)*uFade);
      }`,
  })
);
limb.renderOrder = 4; gScene.add(limb);

// 별
{
  const N = 5200, pos = new Float32Array(N * 3), sz = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u), r = 90 + Math.random() * 60;
    pos[i * 3] = s * Math.cos(th) * r; pos[i * 3 + 1] = u * r; pos[i * 3 + 2] = s * Math.sin(th) * r;
    sz[i] = Math.pow(Math.random(), 3.2) * 1.5 + 0.16;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1));
  gScene.add(new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 } },
    vertexShader: `attribute float aSize; varying float vS; uniform float uT;
      void main(){ vS=aSize; vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize=aSize*(220.0/-mv.z)*(0.8+0.35*sin(uT*1.7+aSize*40.0));
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vS;
      void main(){ float d=length(gl_PointCoord-0.5);
        gl_FragColor=vec4(vec3(0.86,0.91,1.0), smoothstep(0.5,0.0,d)*clamp(vS,0.0,1.0)); }`,
  })));
}

/* 글로브 공간 구름 덱 — 지구 반지름 1 기준으로 고도 h km 에 접평면 빌보드를 깐다.
   레그 2 "cloud-break" 에서 카메라가 이 층들을 실제로 통과한다. */
const gDecks = [];
{
  const DECK_VS = `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
  const DECK_FS = `
    varying vec2 vUv; uniform sampler2D map; uniform vec2 uOff; uniform float uScale,uOpacity;
    uniform vec3 uTint;
    void main(){
      float a = texture2D(map, vUv*uScale + uOff).a;
      float r = length(vUv-0.5)*2.0;
      a *= smoothstep(1.0, 0.18, r);
      gl_FragColor = vec4(uTint, pow(clamp(a,0.0,1.0),0.8)*uOpacity);
    }`;
  // [고도 km, 폭(도), 진하기]
  const TIERS = [[300, 5.4, 0.26], [215, 4.4, 0.34], [150, 3.5, 0.42],
                 [105, 2.7, 0.50], [76, 2.1, 0.58], [56, 1.7, 0.62]];
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  TIERS.forEach(([h, span, op], ti) => {
    for (let k = 0; k < 3; k++) {
      const lat = 35.3 + (rnd() - 0.5) * 3.0 - ti * 0.10, lon = 127.9 + (rnd() - 0.5) * 3.2 - ti * 0.04;
      const r = 1 + h / R_EARTH;
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          map: { value: earthUniforms.cloudMap.value },
          uOff: { value: new THREE.Vector2(rnd() * 0.8, 0.28 + rnd() * 0.4) },
          uScale: { value: 0.09 + rnd() * 0.05 },
          uOpacity: { value: 0 },
          uTint: { value: new THREE.Color(ti < 2 ? 0xeef4ff : 0xffffff) },
        },
        vertexShader: DECK_VS, fragmentShader: DECK_FS,
      });
      const w = span * Math.PI / 180;                       // 도 → 구면 단위
      const q = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.72), m);
      ll2v(lat, lon, r, q.position);
      q.lookAt(0, 0, 0);                                    // 접평면
      q.rotateZ(rnd() * Math.PI);
      q.renderOrder = 10 + (TIERS.length - ti);
      q.userData = { h, op };
      gDecks.push(q); gScene.add(q);
    }
  });
}

// 궤도 위성
let sat = null;
new GLTFLoader(loadMgr).load('../../../assets/proto/models/satellite.glb', (g) => {
  sat = g.scene;
  const box = new THREE.Box3().setFromObject(sat);
  const s = (FILM ? 0.115 : 0.022) / Math.max(...box.getSize(new THREE.Vector3()).toArray());
  sat.scale.setScalar(s);
  sat.traverse(o => {
    if (o.isMesh && o.material) { o.material.envMap = envRT.texture; o.material.envMapIntensity = 1.2; o.castShadow = true; }
  });
  gScene.add(sat);
}, undefined, () => { /* 모델 없으면 생략 */ });

/* ───────────────────────── LOCAL 씬 (미터) ───────────────────────── */
const lScene = new THREE.Scene();
const lCam = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 1, 300000);
lScene.fog = new THREE.FogExp2(0xa8bed6, 0.000021);

const lSunDir = new THREE.Vector3(0.42, 0.58, 0.70).normalize();
const lSun = new THREE.DirectionalLight(0xfff2dc, 2.2);
lSun.position.copy(lSunDir).multiplyScalar(9000);
lSun.castShadow = true;
lSun.shadow.mapSize.set(2048, 2048);
lSun.shadow.camera.left = -1600; lSun.shadow.camera.right = 1600;
lSun.shadow.camera.top = 1600; lSun.shadow.camera.bottom = -1600;
lSun.shadow.camera.near = 100; lSun.shadow.camera.far = 24000;
lSun.shadow.bias = -0.0006; lSun.shadow.normalBias = 0.6;
lScene.add(lSun, lSun.target);
lScene.add(new THREE.HemisphereLight(0xbcd6f2, 0x40403a, 0.55));
lScene.environment = envRT.texture;

// 하늘 돔
const sky = new THREE.Mesh(new THREE.SphereGeometry(240000, 48, 32), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, transparent: true,
  uniforms: {
    uHi: { value: new THREE.Color(0x04070f) }, uLo: { value: new THREE.Color(0xc3d6e8) },
    uK: { value: 0 }, uOp: { value: 0 }, uSun: { value: lSunDir.clone() },
  },
  vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec3 vP; uniform vec3 uHi,uLo; uniform float uK,uOp;
    uniform vec3 uSun;
    void main(){ vec3 n=normalize(vP); float h=clamp(n.y*0.5+0.5,0.0,1.0);
      vec3 c = mix(uLo, mix(uHi, vec3(0.05,0.13,0.34), 1.0-uK), pow(h, 0.80-0.42*uK));
      float s = max(dot(n,normalize(uSun)),0.0);
      c += vec3(1.0,0.86,0.66)*pow(s,42.0)*0.9 + vec3(1.0,0.92,0.80)*pow(s,5.0)*0.14;
      c = mix(c, vec3(0.86,0.90,0.93), pow(1.0-abs(n.y),16.0)*0.55);       // 지평선 헤이즈
      gl_FragColor = vec4(c, uOp); }`,
}));
sky.renderOrder = -1;
lScene.add(sky);

const localGroup = new THREE.Group(); lScene.add(localGroup);
const fadeMats = [];       // 크로스페이드 대상

function groundPlane(file, boundsFile, y, order) {
  json('data/' + boundsFile).then(b => {
    if (!b) return;
    const w = m2x(b[2]) - m2x(b[0]), h = m2z(b[1]) - m2z(b[3]);
    const t = tex(file); t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: .96, metalness: 0, transparent: true, opacity: 0 });
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <alphamap_fragment>',
        `#include <alphamap_fragment>
         vec2 _e = abs(vMapUv - 0.5) * 2.0;
         diffuseColor.a *= 1.0 - smoothstep(0.74, 0.998, max(_e.x, _e.y));`);
    };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 1), m);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((m2x(b[0]) + m2x(b[2])) / 2, y, (m2z(b[1]) + m2z(b[3])) / 2);
    mesh.receiveShadow = true; mesh.renderOrder = order;
    localGroup.add(mesh); fadeMats.push(m);
  });
}
groundPlane('ortho_z13.jpg', 'ortho_z13-bounds.json', -1.4, 0);   // 광역 46 km
groundPlane('ortho_z15.jpg', 'ortho_z15-bounds.json', -0.7, 1);   // 근접 16 km
groundPlane('ortho_z17.jpg', 'ortho_z17-bounds.json', 0, 2);      // 최근접 4 km · 약 1 m/px

/* 구름 빌보드 덱 — 하강하며 갈라진다.
   프로젝트의 clouds/*.webp 는 알파가 없어 흰 다각형으로 보인다 → NASA 구름 맵을 무작위 크롭해 쓴다. */
const decks = [];
const DECK_FS = `
  varying vec2 vUv; uniform sampler2D map; uniform vec2 uOff; uniform float uScale,uOpacity;
  uniform vec3 uTint;
  void main(){
    float a = texture2D(map, vUv*uScale + uOff).a;
    float r = length(vUv-0.5)*2.0;
    a *= smoothstep(1.0, 0.20, r);                 // 사각 테두리를 지운다
    a = pow(clamp(a,0.0,1.0), 0.85);
    gl_FragColor = vec4(uTint, a*uOpacity);
  }`;
{
  const alt = [8200, 3900, 1650], scale = [52000, 30000, 15000], op = [0.44, 0.55, 0.66];
  for (let i = 0; i < 3; i++) {
    for (let k = 0; k < 4; k++) {
      const m = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
        uniforms: {
          map: { value: earthUniforms.cloudMap.value },
          uOff: { value: new THREE.Vector2(Math.random() * 0.8, 0.30 + Math.random() * 0.36) },
          uScale: { value: 0.10 + Math.random() * 0.05 },
          uOpacity: { value: 0 },
          uTint: { value: new THREE.Color(i === 0 ? 0xf4f8ff : i === 1 ? 0xffffff : 0xfdfbf6) },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: DECK_FS,
      });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(scale[i], scale[i] * 0.66), m);
      q.rotation.x = -Math.PI / 2; q.rotation.z = Math.random() * Math.PI;
      const a = (k / 4) * Math.PI * 2 + i * 0.9;
      q.position.set(Math.cos(a) * scale[i] * 0.34, alt[i], Math.sin(a) * scale[i] * 0.34 - 2400);
      q.renderOrder = 20 - i;
      q.userData = { base: q.position.clone(), i, op: op[i] * (k === 0 ? 1 : 0.66) };
      decks.push(q); localGroup.add(q);
    }
  }
}

/* 최소 지오메트리 병합 (BufferGeometryUtils 없이) */
function mergeGeoms(list) {
  let vc = 0, ic = 0;
  list.forEach(g => { if (!g.index) g = g.toNonIndexed(); vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; });
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  list.forEach(g => {
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const n = g.attributes.position.count;
    if (g.index) { const gi = g.index.array; for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo; io += gi.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = i + vo; io += n; }
    vo += n; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* 건물·비닐하우스 압출 + 검출 발광 쿼드 */
const detectMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(0x5fd8ff) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform float uOpacity; uniform vec3 uColor;
    void main(){
      vec2 d = abs(vUv-0.5)*2.0;
      float edge = max(d.x,d.y);
      float ring = smoothstep(0.72,0.94,edge) * smoothstep(1.0,0.96,edge);  // 테두리
      float fill = (1.0-smoothstep(0.55,1.0,edge)) * 0.20;
      gl_FragColor = vec4(uColor, (ring*1.6+fill)*uOpacity);
    }`,
});
const structGroup = new THREE.Group(); localGroup.add(structGroup);

function ringShape(ring) {
  const s = new THREE.Shape();
  ring.forEach((c, i) => { const x = m2x(c[0]), z = m2z(c[1]); i ? s.lineTo(x, -z) : s.moveTo(x, -z); });
  return s;
}
Promise.all([json('data/buildings.json'), json('data/greenhouse.json'), json('data/farmland.json')])
  .then(([bl, gh, fl]) => {
    const geos = [];
    const push = (ring, h) => {
      if (!ring || ring.length < 4) return;
      try {
        const g = new THREE.ExtrudeGeometry(ringShape(ring), { depth: h, bevelEnabled: false, curveSegments: 1, steps: 1 });
        g.rotateX(-Math.PI / 2);
        if (g.attributes.position.count) geos.push(g);
      } catch { /* 자기교차 링은 건너뛴다 */ }
    };
    (bl?.feats || []).forEach(f => push(f.r, f.h || (4.5 + Math.random() * 4)));
    (gh || []).forEach(f => push(f.r, 4.6));                    // 비닐하우스 4.6 m
    if (geos.length) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9a9384, roughness: 0.86, metalness: 0.0, transparent: true, opacity: 0, flatShading: true,
      });
      const mesh = new THREE.Mesh(mergeGeoms(geos), mat);
      mesh.castShadow = true; mesh.receiveShadow = true;
      structGroup.add(mesh); fadeMats.push(mat);
      window.__spikeStructs = geos.length;
    }
    const quads = [];
    (gh || []).forEach(f => {
      const s = clamp(Math.sqrt(Math.max(f.a || 300, 150)) * 1.35, 20, 90);
      const g = new THREE.PlaneGeometry(s, s);
      g.rotateX(-Math.PI / 2);
      g.translate(m2x(f.c[0]), 6.2, m2z(f.c[1]));
      quads.push(g);
    });
    if (quads.length) {
      const dm = new THREE.Mesh(mergeGeoms(quads), detectMat);
      dm.renderOrder = 30; localGroup.add(dm);
      window.__spikeDetects = quads.length;
    }
  });

/* ───────────────────────── 컴포저 ───────────────────────── */
const composer = new EffectComposer(renderer);
const gPass = new RenderPass(gScene, gCam);
const lPass = new RenderPass(lScene, lCam);
lPass.clear = false; lPass.clearDepth = true;
composer.addPass(gPass); composer.addPass(lPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.72, 0.86);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uGrain: { value: 0.032 }, uVig: { value: 1.0 }, uCA: { value: 0.9 }, uSat: { value: 1.0 }, uWarm: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uT,uGrain,uVig,uCA,uSat,uWarm;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d = vUv-0.5; float r2 = dot(d,d);
      float ca = uCA*0.0018*r2;
      vec3 c;
      c.r = texture2D(tDiffuse, vUv + d*ca).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - d*ca).b;
      float l = dot(c, vec3(0.2126,0.7152,0.0722));
      c = mix(vec3(l), c, uSat);                              // 채도
      c *= mix(vec3(1.0), vec3(1.075,1.015,0.945), uWarm);    // 저고도 웜 그레이드
      c = (c-0.5)*1.045 + 0.5;                                // 미세 대비
      c *= mix(1.0, 1.0-1.05*r2, uVig);
      c += (h(vUv*vec2(1920.0,1080.0)+uT)-0.5)*uGrain;
      gl_FragColor = vec4(c,1.0);
    }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

/* ───────────────────────── 카메라 경로 ───────────────────────── */
// globe: [p, altKm, lat, lon, tiltDeg]
const GKEYS = [
  [0.00, 17000, 8, 52, 0],
  [0.14, 13500, 16, 78, 0],
  [0.30, 7200, 26, 106, 6],
  [0.46, 2600, 33.2, 121.0, 16],
  [0.58, 420, 34.92, 126.62, 24],
  [0.66, 62, 35.25, 127.17, 30],
  [0.72, 21, 35.30, 127.262, 38],
  [0.80, 6.5, 35.327, 127.300, 46],
];
// local: [p, altM, offsetX, offsetZ, pitchDeg, lookZ]
const LKEYS = [
  [0.58, 420000, 0, 943000, 66, 0],
  [0.66, 62000, 0, 35800, 60, 0],
  [0.72, 21000, 0, 26900, 38, 0],
  [0.80, 6500, 0, 6270, 46, 0],
  [0.90, 900, -120, 1690, 28, -260],
  [1.00, 120, 60, 481, 14, -900],
];
/* ── 필름 레그 ────────────────────────────────────────────────────────────
   씸 규칙: orbit-korea 의 마지막 상태 SEAM 이 cloud-break 의 첫 상태와 동일해야 한다. */
const SEAM = [460, 36.05, 127.95, 18];          // [altKm, lat, lon, tiltDeg] — 한반도가 프레임을 채운다
const LEGS = {
  'orbit-korea': {
    seconds: 5.6,
    keys: [
      [0.00, 15000, 13.0, 60.0, 0],
      [0.30, 9200, 21.0, 88.0, 4],
      [0.62, 3400, 29.0, 112.0, 11],
      [0.84, 1500, 34.2, 124.0, 13],
      [1.00, ...SEAM],
    ],
  },
  'cloud-break': {
    seconds: 5.0,
    keys: [
      [0.00, ...SEAM],
      [0.32, 350, 35.76, 127.96, 28],
      [0.65, 260, 35.30, 127.90, 38],
      [0.87, 190, 35.06, 127.84, 44],
      [1.00, 132, 34.96, 127.80, 48],          // 여수 남해안 · 수평선 + 대기 밴드
    ],
  },
};
let LEG = null, vTime = 0;

function sampleKeys(keys, p) {
  const last = keys.length - 1;
  if (p <= keys[0][0]) return keys[0].slice(1);
  if (p >= keys[last][0]) {
    const a = keys[last - 1], b = keys[last], t = (p - a[0]) / (b[0] - a[0]);
    return b.slice(1).map((v, i) => lerp(a[i + 1], v, t));
  }
  let i = 0; while (keys[i + 1][0] < p) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smooth(a[0], b[0], p);
  return b.slice(1).map((v, i2) => lerp(a[i2 + 1], v, t));
}

const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
const camDir = new THREE.Vector3(), camRight = new THREE.Vector3(), camUp = new THREE.Vector3();
function placeGlobeCam(p) {
  const [alt, lat, lon, tilt] = sampleKeys(LEG ? LEG.keys : GKEYS, p);
  const r = 1 + alt / R_EARTH;
  ll2v(lat, lon, r, tmpA);
  const up = tmpA.clone().normalize();
  const north = new THREE.Vector3(0, 1, 0).addScaledVector(up, -up.y).normalize();
  gCam.position.copy(tmpA).addScaledVector(north, -Math.tan(tilt * D2R) * (alt / R_EARTH));
  gCam.up.copy(up);
  ll2v(lat, lon, 1, tmpB);
  if (alt > 2600) gCam.lookAt(0, 0, 0); else gCam.lookAt(tmpB);
  gCam.near = Math.max(0.00012, (alt / R_EARTH) * 0.05);
  gCam.updateProjectionMatrix();
  return alt;
}
const lookAtPt = new THREE.Vector3();
function placeLocalCam(p) {
  const [alt, ox, oz, pitch, lookZ] = sampleKeys(LKEYS, p);
  lCam.position.set(ox, alt, oz);
  const d = Math.max(alt / Math.tan(pitch * D2R), 60);
  lCam.up.set(0, 1, 0);
  lookAtPt.set(ox * 0.22, 0, oz - d + lookZ);
  lCam.lookAt(lookAtPt);
  // 그림자 프러스텀을 시선 목표에 붙이고 고도에 따라 좁힌다
  const half = clamp(alt * 1.9, 500, 2400);
  lSun.shadow.camera.left = -half; lSun.shadow.camera.right = half;
  lSun.shadow.camera.top = half; lSun.shadow.camera.bottom = -half;
  lSun.shadow.camera.updateProjectionMatrix();
  lSun.target.position.copy(lookAtPt);
  lSun.target.updateMatrixWorld();
  lSun.position.copy(lookAtPt).addScaledVector(lSunDir, 9000);
  lCam.near = Math.max(1, alt * 0.02);
  lCam.updateProjectionMatrix();
  return alt;
}

/* ───────────────────────── 상태 갱신 ───────────────────────── */
let P = 0, tNow = 0;
const $alt = document.getElementById('alt'), $coord = document.getElementById('coord'), $fps = document.getElementById('fps');

function apply(p) {
  P = p;
  const gAlt = placeGlobeCam(p);
  if (FILM) return applyFilm(p, gAlt);
  const lAlt = placeLocalCam(p);

  earthUniforms.uKoreaBlend.value = smooth(0.28, 0.50, p);

  // 크로스페이드 — 지구 표면 텍스처 → 우리 정사영상 평면 (고도 ≈ 40 km → 5 km)
  const handoff = smooth(0.615, 0.695, p);
  for (const m of fadeMats) m.opacity = handoff;
  detectMat.uniforms.uOpacity.value = smooth(0.83, 0.95, p);
  localGroup.visible = handoff > 0.001;
  sky.visible = handoff > 0.02;
  sky.material.uniforms.uOp.value = handoff;
  sky.material.uniforms.uK.value = 1 - smooth(0.70, 0.96, p);
  lScene.fog.density = lerp(0.0000042, 0.0000002, smooth(1500, 25000, lAlt));

  decks.forEach(q => {
    const b = q.userData.base, i = q.userData.i;
    const near = smooth(0.64 + i * 0.045, 0.86 + i * 0.04, p);
    q.position.set(b.x * (1 + near * 2.4), b.y * (1 - near * 0.5) + near * 260, b.z * (1 + near * 2.2) + near * 7000);
    q.material.uniforms.uOpacity.value = q.userData.op * smooth(0.62, 0.70, p) * (1 - smooth(0.82 + i * 0.035, 0.93, p)) * handoff;
  });

  const rot = tNow * 0.0016 + p * 0.02;
  cloudA.rotation.y = rot; cloudB.rotation.y = rot * 1.6 + 0.4;
  earthUniforms.uCloudRot.value = -rot / (Math.PI * 2);

  gScene.visible = handoff < 0.995;
  bloom.strength = lerp(0.62, 0.24, smooth(0.6, 0.9, p));
  atmo.material.uniforms.uFade.value = 1 - smooth(0.58, 0.70, p);
  grade.uniforms.uGrain.value = lerp(0.034, 0.018, smooth(0.55, 0.95, p));
  grade.uniforms.uSat.value = lerp(1.0, 1.30, smooth(0.62, 0.95, p));
  renderer.toneMappingExposure = lerp(1.02, 1.16, smooth(0.6, 1, p));

  const altKm = handoff > 0.5 ? lAlt / 1000 : gAlt;
  $alt.textContent = altKm > 999 ? Math.round(altKm).toLocaleString() + ' km'
    : altKm >= 1 ? altKm.toFixed(1) + ' km' : Math.round(altKm * 1000) + ' m';
  const gk = sampleKeys(GKEYS, p);
  $coord.textContent = p < 0.62 ? `${gk[1].toFixed(2)}°N ${gk[2].toFixed(2)}°E`
    : `${TARGET.lat.toFixed(3)}°N ${TARGET.lon.toFixed(3)}°E`;
}

/* 필름 모드 상태 — 시간까지 p 에서 결정된다(같은 p → 같은 프레임). */
function applyFilm(p, gAlt) {
  vTime = (LEG ? LEG.t0 : 0) + p * (LEG ? LEG.seconds : 1);
  localGroup.visible = false; sky.visible = false;
  gScene.visible = true;

  earthUniforms.uKoreaBlend.value = 1 - smooth(900, 4200, gAlt);
  earthUniforms.uKorea2Blend.value = 0.55 * (1 - smooth(90, 900, gAlt));

  const rot = vTime * 0.0022;
  cloudA.rotation.y = rot; cloudB.rotation.y = rot * 1.6 + 0.4;
  earthUniforms.uCloudRot.value = -rot / (Math.PI * 2);
  // 저고도에서는 구름 셸을 걷어 한반도가 보이게 한다(빌보드 덱이 그 역할을 이어받는다)
  const shell = 0.30 + 0.70 * smooth(420, 2600, gAlt);
  cloudA.material.opacity = 0.95 * shell;
  cloudB.material.opacity = 0.42 * shell;

  // 구름 덱 — 카메라가 다가오면 켜지고, 통과하면 꺼진다
  for (const q of gDecks) {
    const h = q.userData.h;
    const fin = 1 - smooth(h * 2.4, h * 7.5, gAlt);
    const fout = smooth(h * 0.5, h * 1.06, gAlt);
    q.material.uniforms.uOpacity.value = q.userData.op * fin * fout;
  }

  atmo.material.uniforms.uFade.value = smooth(140, 800, gAlt);
  limb.material.uniforms.uFade.value = 1 - smooth(220, 1100, gAlt);
  earthUniforms.uRimK.value = 0.12 + 0.88 * smooth(200, 1800, gAlt);

  bloom.strength = lerp(0.62, 0.30, 1 - smooth(60, 3000, gAlt));
  grade.uniforms.uGrain.value = 0.028;
  grade.uniforms.uSat.value = lerp(1.0, 1.02, 1 - smooth(120, 2500, gAlt));
  grade.uniforms.uWarm.value = 1 - smooth(150, 2200, gAlt);
  renderer.toneMappingExposure = lerp(1.02, 1.30, 1 - smooth(120, 2500, gAlt));

  // 위성 — 레그 1 초반에 프레임을 가로지른다
  if (sat) {
    // 카메라 로컬 프레임에 놓아 프레이밍을 보장한다(레그 1 도입부의 주인공).
    gCam.getWorldDirection(camDir);
    camRight.crossVectors(camDir, gCam.up).normalize();
    camUp.crossVectors(camRight, camDir).normalize();
    const u = vTime * 0.30 - 0.62;
    sat.position.copy(gCam.position)
      .addScaledVector(camDir, 0.92)
      .addScaledVector(camRight, u * 0.50)
      .addScaledVector(camUp, 0.155 - u * 0.06);
    sat.lookAt(0, 0, 0); sat.rotateX(Math.PI / 2); sat.rotateZ(vTime * 0.18);
    sat.visible = gAlt > 5200 && u < 0.95;
  }
}

/* ───────────────────────── 스크롤 ───────────────────────── */
const CAPS = [
  [0.00, '지구를 하나의 데이터셋으로', 'Land-XI 는 위성·항공·드론 관측을 하나의 좌표계 위에 겹쳐 놓는다.'],
  [0.24, '한반도로 내려간다', 'Sentinel-2 무운 모자이크 위로 V-World 위성 영상이 겹쳐 붙는다.'],
  [0.44, '대기권을 지난다', '움직이는 구름층 — NASA 구름 맵이 돌고, 실촬영 구름 덱이 갈라진다.'],
  [0.62, '남원, 금지면', '고도 40 km 아래에서 구면 텍스처를 우리 정사영상으로 넘긴다.'],
  [0.82, '마을이 서 있다', '건물·비닐하우스 발자국을 압출해 실제 그림자를 받는다.'],
  [0.94, '검출된 것들', '2025년 비닐하우스·농지 검출 결과가 지면 위에서 빛난다.'],
];
const capEl = document.getElementById('cap');
let capIdx = -1;
function setCap(p) {
  let i = 0; for (let k = 0; k < CAPS.length; k++) if (p >= CAPS[k][0]) i = k;
  if (i === capIdx) return; capIdx = i;
  const h = capEl.querySelector('h2'), q = capEl.querySelector('p');
  gsap.to([h, q], {
    opacity: 0, y: -10, duration: .26, stagger: .04, onComplete: () => {
      h.textContent = CAPS[i][1]; q.textContent = CAPS[i][2];
      gsap.fromTo([h, q], { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: .6, stagger: .07, ease: 'power3.out' });
    },
  });
}

let lenis = null;
if (!FILM) {
gsap.registerPlugin(ScrollTrigger);
lenis = new Lenis({ duration: 1.15, smoothWheel: true });
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((t) => lenis.raf(t * 1000));
gsap.ticker.lagSmoothing(0);

ScrollTrigger.create({
  trigger: '#scroll', start: 'top top', end: 'bottom bottom', scrub: true,
  onUpdate: (self) => { apply(self.progress); setCap(self.progress); },
});
const cue = document.querySelector('.scrollcue');
ScrollTrigger.create({ trigger: '#scroll', start: 'top top-=40', onEnter: () => cue.style.opacity = 0, onLeaveBack: () => cue.style.opacity = 1 });
}

/* ───────────────────────── 루프 ───────────────────────── */
const times = [];
function frame(ms) {
  if (FILM) return;                       // 필름은 seek() 가 동기 렌더한다
  requestAnimationFrame(frame);
  tNow = ms / 1000;
  earthUniforms.uTime.value = tNow;
  grade.uniforms.uT.value = tNow;
  if (sat) {
    const a = tNow * 0.09;
    sat.position.set(Math.cos(a) * 1.34, Math.sin(a * 0.6) * 0.44, Math.sin(a) * 1.34);
    sat.lookAt(0, 0, 0); sat.rotateX(Math.PI / 2);
  }
  apply(P);
  composer.render();
  times.push(ms); if (times.length > 90) times.shift();
  if (times.length > 30) $fps.textContent = Math.round(1000 * (times.length - 1) / (times.at(-1) - times[0]));
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  gCam.aspect = lCam.aspect = innerWidth / innerHeight;
  gCam.updateProjectionMatrix(); lCam.updateProjectionMatrix();
});

loadMgr.onLoad = () => {
  document.getElementById('loader').classList.add('gone');
  if (!FILM) setCap(0);
  window.__spikeLoaded = true;
};
setTimeout(() => document.getElementById('loader').classList.add('gone'), 12000);

/* 디버그 훅 — 스크린샷 러너용 */
window.__spike = {
  // 필름: 레그 선택 → seek(p) 가 그 레그 안의 진행도(0..1)를 뜻한다
  setLeg(name) {
    const l = LEGS[name];
    if (!l) throw new Error('unknown leg ' + name);
    // 씸 규칙: 레그의 가상 시각이 이어져야 구름 회전이 프레임 단위로 맞는다.
    const ORDER = ['orbit-korea', 'cloud-break'];
    let t0 = 0;
    for (const k of ORDER) { if (k === name) break; t0 += LEGS[k].seconds; }
    LEG = l; LEG.t0 = t0;
    return { name, seconds: l.seconds, frames: Math.round(l.seconds * 25) };
  },
  legs: () => Object.fromEntries(Object.entries(LEGS).map(([k, v]) => [k, v.seconds])),
  render(p) { apply(clamp(p, 0, 1)); composer.render(); return p; },
  loaded: () => !!window.__spikeLoaded,
  seek(p) {
    p = clamp(p, 0, 1);
    const el = document.getElementById('scroll');
    const y = (el.scrollHeight - innerHeight) * p;
    lenis.scrollTo(y, { immediate: true, force: true });
    scrollTo(0, y);
    apply(p); setCap(p);
    return { p, alt: $alt.textContent };
  },
  fps: () => +$fps.textContent,
  structs: () => window.__spikeStructs || 0,
  detects: () => window.__spikeDetects || 0,
};
window.lenisInstance = lenis;
if (FILM) { document.getElementById('hud').style.display = 'none'; document.getElementById('scroll').style.display = 'none'; }
apply(0);
