// 기법 2 — 레이어드 빌보드 데크 (돌파 구간의 주력)
// 우리 webp 3매를 실제 고도(11/7/3.5 km)의 수평 평면으로 깔고 카메라가 그 사이를
// 관통한다. 시차는 원근에서 공짜로 나오고, 통과 순간엔 소프트 페이드 + 헤이즈 플래시.
import * as THREE from 'three';
import { KM } from './globe.js';

const ART = '../../../assets/proto/clouds/';
const DECKS = [
  { file: 'cloud_far.webp',  altKm: 11.0, span: 1300, rep: 3.0, op: 0.72, wind: [0.0060, 0.0016] },
  { file: 'cloud_mid.webp',  altKm: 7.0,  span:  820, rep: 3.4, op: 0.95, wind: [0.0104, 0.0031] },
  { file: 'cloud_near.webp', altKm: 3.4,  span:  420, rep: 3.8, op: 0.88, wind: [0.0182, 0.0058] },
];

const VS = `varying vec2 vUv; varying vec3 vW;
  void main(){ vUv=uv; vW=(modelMatrix*vec4(position,1.0)).xyz;
    gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;

const FS = `
  uniform sampler2D map; uniform vec3 sun; uniform vec2 uOff; uniform float uRep;
  uniform float uOpacity; uniform float uFade; uniform float uHole; uniform vec3 uCamW;
  varying vec2 vUv; varying vec3 vW;
  void main(){
    vec4 t = texture2D(map, vUv*uRep + uOff);
    // 지평선 쪽으로 갈수록 광학두께가 길어져 하얗게 뭉개진다(에어리얼 퍼스펙티브)
    float rad = length(vUv - 0.5) * 2.0;
    float horizon = smoothstep(1.02, 0.34, rad);
    // 데크 한가운데가 먼저 갈라진다 — 카메라가 뚫고 나갈 구멍
    float hole = smoothstep(uHole*0.45, uHole + 0.30, rad);
    float nl = clamp(dot(normalize(sun), vec3(0.0,1.0,0.0)) , -1.0, 1.0);
    float day = smoothstep(-0.15, 0.30, nl);
    vec3 lit = mix(vec3(0.70,0.75,0.84), vec3(1.0,0.995,0.98), clamp(nl*1.6,0.0,1.0));
    vec3 col = t.rgb * lit * (0.52 + 0.70*max(nl,0.0));
    col = mix(col*0.30 + vec3(0.05,0.07,0.12), col, day);
    // 태양 쪽 가장자리에 따뜻한 실버라이닝
    vec3 V = normalize(uCamW - vW);
    col += vec3(1.0,0.86,0.66) * pow(clamp(dot(V,-normalize(sun)),0.0,1.0), 5.0) * 0.35 * day;
    float a = t.a * uOpacity * uFade * horizon * hole;
    if (a < 0.004) discard;
    gl_FragColor = vec4(col, a);
  }`;

function tex(url) {
  const t = new THREE.TextureLoader().load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

export function createDecks(anchor) {
  const g = new THREE.Group();
  const layers = DECKS.map((d) => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: tex(ART + d.file) }, sun: { value: new THREE.Vector3(1, 0, 0) },
        uOff: { value: new THREE.Vector2() }, uRep: { value: d.rep },
        uOpacity: { value: d.op }, uFade: { value: 0 }, uHole: { value: 1.4 },
        uCamW: { value: new THREE.Vector3() },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.span * KM, d.span * KM, 1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = d.altKm * KM;
    m.renderOrder = 30 + (12 - d.altKm);   // 낮은 데크가 나중에(앞에) 그려진다
    g.add(m);
    return { d, m, mat };
  });

  // 관통 정점의 화이트아웃 — 카메라 앞에 붙는 스크린 스페이스 판
  const hazeMat = new THREE.MeshBasicMaterial({
    map: new THREE.TextureLoader().load(ART + 'haze.webp'),
    transparent: true, depthTest: false, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: 0,
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), hazeMat);
  haze.renderOrder = 900; haze.frustumCulled = false;

  anchor.add(g);
  let t = 0;
  return {
    group: g, haze, name: 'billboard-decks',
    update(altKm, dt, sun, cam) {
      t += dt;
      let flash = 0;
      for (const L of layers) {
        L.mat.uniforms.sun.value.copy(sun);
        L.mat.uniforms.uCamW.value.copy(cam.position);
        L.mat.uniforms.uOff.value.set(t * L.d.wind[0], t * L.d.wind[1]);
        const dz = altKm - L.d.altKm;
        // 접근하면 차오르고(위에서), 통과 직전 0.35km 안에서 급히 빠진다
        const above = THREE.MathUtils.smoothstep(dz, 0.0, 6.0);
        const near = THREE.MathUtils.smoothstep(Math.abs(dz), 0.10, 0.95);
        const below = 1.0 - THREE.MathUtils.smoothstep(-dz, 0.4, 3.0);
        const far = 1.0 - THREE.MathUtils.smoothstep(altKm, 60, 160);   // 궤도에선 걷는다
        L.mat.uniforms.uFade.value = above * near * Math.max(below, 0.0) * far;
        // 통과가 가까울수록 구멍이 커진다
        L.mat.uniforms.uHole.value = THREE.MathUtils.lerp(0.10, 1.45,
          THREE.MathUtils.smoothstep(Math.abs(dz), 0.0, 4.0));
        flash = Math.max(flash, (1 - THREE.MathUtils.smoothstep(Math.abs(dz), 0.05, 0.62)) * L.d.op * far);
      }
      hazeMat.opacity = flash * 0.85;
      haze.visible = hazeMat.opacity > 0.01;
      if (haze.visible) {
        // 카메라 앞 1 근처에 고정 — 화면을 꽉 채운다
        const dist = cam.near * 40;
        const h = 2 * Math.tan(cam.fov * Math.PI / 360) * dist;
        haze.scale.set(h * cam.aspect * 0.5, h * 0.5, 1);
        haze.position.set(0, 0, -dist);
        haze.quaternion.identity();
      }
    },
    dispose() { layers.forEach((L) => { L.mat.dispose(); L.m.geometry.dispose(); }); hazeMat.dispose(); },
  };
}
