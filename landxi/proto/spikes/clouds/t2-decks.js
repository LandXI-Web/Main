// 기법 2 — 레이어드 빌보드 데크 (돌파 구간의 주력)
// 우리 webp 3매를 실제 고도(11/7/3.5 km)의 수평 평면으로 깔고 카메라가 그 사이를
// 관통한다. 시차는 원근에서 공짜로 나오고, 통과 순간엔 소프트 페이드 + 헤이즈 플래시.
import * as THREE from 'three';
import { KM } from './globe.js';

const ART = '../../../assets/proto/clouds/';
// tileKm = 텍스처 한 장이 덮는 지상 거리. 이게 구름 알갱이의 실제 크기를 정한다.
// 2048px / 70km = 34 m/px — 40km 상공에서는 충분하고, 2km 앞에서는 8배 확대되어 뭉갠다.
// (이 한 줄이 데크 기법의 고도 하한을 결정한다)
const DECKS = [
  { file: 'cloud_far.webp',  altKm: 10.6, span: 900, tileKm: 70, op: 0.66, wind: [0.0055, 0.0015] },
  { file: 'cloud_mid.webp',  altKm: 8.0,  span: 420, tileKm: 34, op: 0.92, wind: [0.0100, 0.0030] },
  { file: 'cloud_near.webp', altKm: 5.4,  span: 200, tileKm: 16, op: 0.86, wind: [0.0170, 0.0055] },
  { file: 'cloud_mid.webp',  altKm: 1.7,  span:  70, tileKm: 6.5, op: 0.62, wind: [0.0290, 0.0092] },
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
    // 관통 직전에만 한가운데가 갈라진다. uHole 은 구멍의 양(0=없음, 1=화면 전체).
    float hole = uHole < 0.002 ? 1.0 : smoothstep(uHole*0.34, uHole*1.10 + 0.14, rad);
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
        uOff: { value: new THREE.Vector2() }, uRep: { value: d.span / d.tileKm },
        uOpacity: { value: d.op }, uFade: { value: 0 }, uHole: { value: 1.4 },
        uCamW: { value: new THREE.Vector3() },
      },
      vertexShader: VS, fragmentShader: FS,
      transparent: true, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(d.span * KM, d.span * KM, 1, 1), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.y = d.altKm * KM;
    m.renderOrder = 30 + Math.round((12 - d.altKm) * 4);   // 낮은 데크가 나중에(앞에) 그려진다
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
        const dz = altKm - L.d.altKm;                 // + = 카메라가 데크 위
        const band = L.d.altKm > 4 ? 0.35 : 0.14;     // 낮은 데크일수록 얇게 지나간다
        // 위에 있으면 보이고, 관통하면 사라진다. 밑에서는 보이지 않는다(고개를 들지 않으므로)
        const vis = THREE.MathUtils.smoothstep(dz, -band, band);
        const far = 1.0 - THREE.MathUtils.smoothstep(altKm, 45, 130);   // 궤도에선 걷는다
        L.mat.uniforms.uFade.value = vis * far;
        // 관통 1.8km 안에서만 한가운데가 갈라진다
        L.mat.uniforms.uHole.value = (1 - THREE.MathUtils.smoothstep(Math.abs(dz), 0.06, 1.8)) * 1.25;
        flash = Math.max(flash, (1 - THREE.MathUtils.smoothstep(Math.abs(dz), 0.04, band * 2.6)) * L.d.op * far);
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
