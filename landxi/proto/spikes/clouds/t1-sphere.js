// 기법 1 — 구름 구(cloud sphere)
// NASA/BMNG 계열 등장방형 구름맵을 지구보다 살짝 큰 구에 입히고 천천히 자전시킨다.
// 그림자 구(shadow sphere)를 지표 바로 위에 한 겹 더 깔아 태양 반대쪽으로 UV 를 밀어
// 구름이 땅에 드리우는 그림자를 근사한다. 궤도~성층권(>200km)에서만 성립한다.
import * as THREE from 'three';
import { R } from './globe.js';

const VS = `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
    vW=(modelMatrix*vec4(position,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

const FS = `
  uniform sampler2D map; uniform vec3 sun; uniform float uOff; uniform float uOpacity;
  uniform float uCut; uniform float uGain;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vec2 uv = vec2(fract(vUv.x + uOff), vUv.y);
    float d = texture2D(map, uv).r;                    // 구름맵은 그레이스케일 = 밀도
    float a = clamp((d - uCut) * uGain, 0.0, 1.0);
    a = a*a*(3.0-2.0*a);
    vec3 N = normalize(vN); vec3 L = normalize(sun);
    vec3 V = normalize(cameraPosition - vW);
    float nl = dot(N, L);
    float day = smoothstep(-0.18, 0.28, nl);
    // 전방산란(실버라이닝) — 태양이 구름 뒤에 있을 때 가장자리가 밝게 탄다
    float fwd = pow(clamp(dot(V, -L), 0.0, 1.0), 6.0);
    // 자기그림자 — 밀도가 높을수록 아래쪽이 어둡다
    vec3 base = mix(vec3(0.62,0.66,0.74), vec3(1.0,0.99,0.97), clamp(nl*1.4,0.0,1.0));
    vec3 col = base * (0.42 + 0.72*max(nl,0.0)) * mix(0.86, 1.0, 1.0-d);
    col += vec3(1.0,0.88,0.72) * fwd * 0.55 * day;
    col = mix(vec3(0.03,0.05,0.09), col, day);
    // 시선각이 얕을수록(림) 광학두께가 길어진다 — 알파를 키운다
    float rim = 1.0 + 1.9 * pow(1.0 - abs(dot(N, V)), 2.2);
    gl_FragColor = vec4(col, clamp(a*rim,0.0,1.0) * uOpacity);
  }`;

const SHADOW_FS = `
  uniform sampler2D map; uniform vec3 sun; uniform float uOff; uniform float uOpacity;
  uniform float uCut; uniform float uGain; uniform vec2 uShift;
  varying vec2 vUv; varying vec3 vN; varying vec3 vW;
  void main(){
    vec2 uv = vec2(fract(vUv.x + uOff + uShift.x), clamp(vUv.y + uShift.y, 0.0, 1.0));
    float d = texture2D(map, uv).r;
    float a = clamp((d - uCut) * uGain, 0.0, 1.0);
    float nl = dot(normalize(vN), normalize(sun));
    float day = smoothstep(0.0, 0.35, nl);
    gl_FragColor = vec4(vec3(0.20,0.26,0.36), a*a*(3.0-2.0*a) * uOpacity * day);
  }`;

export function createCloudSphere(tex, opt = {}) {
  const cut = opt.cut ?? 0.20, gain = opt.gain ?? 1.55;
  tex.wrapS = THREE.RepeatWrapping; tex.colorSpace = THREE.NoColorSpace;

  const uni = () => ({
    map: { value: tex }, sun: { value: new THREE.Vector3(1, 0, 0) },
    uOff: { value: 0 }, uOpacity: { value: 1 },
    uCut: { value: cut }, uGain: { value: gain },
  });

  const cloudMat = new THREE.ShaderMaterial({
    uniforms: uni(), vertexShader: VS, fragmentShader: FS,
    transparent: true, depthWrite: false, side: THREE.FrontSide,
  });
  const shadowUni = uni(); shadowUni.uShift = { value: new THREE.Vector2(0.004, 0.004) };
  const shadowMat = new THREE.ShaderMaterial({
    uniforms: shadowUni, vertexShader: VS, fragmentShader: SHADOW_FS,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });

  const g = new THREE.Group();
  // 구름층 고도 12km → R*1.0019. 눈에 보이려면 과장이 필요하다(실측 대비 ×4).
  const cloud = new THREE.Mesh(new THREE.SphereGeometry(R * 1.008, 128, 96), cloudMat);
  const shadow = new THREE.Mesh(new THREE.SphereGeometry(R * 1.0012, 96, 64), shadowMat);
  cloud.renderOrder = 12; shadow.renderOrder = 4;
  g.add(shadow, cloud);

  let off = 0;
  function core(altKm, offset, sun) {
      off = offset;
      const vis = THREE.MathUtils.smoothstep(altKm, 60, 420);
      g.visible = vis > 0.01;
      for (const m of [cloudMat, shadowMat]) {
        m.uniforms.uOff.value = off;
        m.uniforms.sun.value.copy(sun);
      }
      cloudMat.uniforms.uOpacity.value = vis;
      shadowMat.uniforms.uOpacity.value = vis * 0.55;
      // 그림자는 태양 반대편으로 밀린다 — 고도가 낮을수록 크게 어긋난다
      shadowUni.uShift.value.set(-sun.x * 0.010, sun.y * 0.006);
  }
  let acc = 0;
  return {
    group: g, name: 'cloud-sphere',
    // 구름층 회전 ≈ 0.21 회전/분 (지구 자전 ×300 과장). 200km 아래로 내려가면 걷어낸다.
    update(altKm, dt, sun) { acc = (acc + dt * 0.0035) % 1; core(altKm, acc, sun); },
    updateAt(altKm, T, sun) { core(altKm, (T * 0.0035) % 1, sun); },
    dispose() { cloudMat.dispose(); shadowMat.dispose(); g.clear(); },
  };
}
