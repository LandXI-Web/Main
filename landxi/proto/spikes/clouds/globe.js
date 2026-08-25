// 지구 본체 + 프레넬 대기림(rim) — p<0.3 구간의 배경.
// 텍스처는 EOX s2cloudless z3 타일(웹메르카토르)을 등장방형(equirect)으로 재투영해 굽는다.
import * as THREE from 'three';

export const R = 100;            // 지구 반경(월드 단위). 1 unit = 63.71 km
export const KM = R / 6371;      // km → 월드 단위

const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg';
const MERC_LAT = 85.0511287798;

function loadImg(url) {
  return new Promise((res, rej) => {
    const i = new Image(); i.crossOrigin = 'anonymous';
    i.onload = () => res(i); i.onerror = rej; i.src = url;
  });
}

// EOX z=Z 타일을 한 장의 메르카토르 캔버스로 모은 뒤 행 단위로 등장방형에 재매핑한다.
// (등장방형의 y는 위도 선형, 메르카토르의 y는 ln(tan+sec) — 행마다 1픽셀씩 늘려 그리면 끝난다)
export async function bakeEarthTexture(Z = 3, onTile) {
  const n = 1 << Z, S = n * 256;
  const mc = document.createElement('canvas'); mc.width = mc.height = S;
  const mx = mc.getContext('2d');
  mx.fillStyle = '#08192e'; mx.fillRect(0, 0, S, S);   // 결측 타일은 심해색으로
  let got = 0;
  await Promise.all(Array.from({ length: n * n }, async (_, k) => {
    const x = k % n, y = (k / n) | 0;
    const url = EOX.replace('{z}', Z).replace('{x}', x).replace('{y}', y);
    for (let a = 0; a < 2; a++) {                       // 한 번 재시도 — 검은 사각형 방지
      try { mx.drawImage(await loadImg(a ? url + '?r=1' : url), x * 256, y * 256); got++; break; }
      catch { /* 재시도 */ }
    }
    onTile && onTile(k + 1, n * n);
  }));
  if (got < n * n * 0.5) throw new Error('EOX 타일 수신 실패');

  const W = S, H = S / 2;
  const ec = document.createElement('canvas'); ec.width = W; ec.height = H;
  const ex = ec.getContext('2d');
  ex.fillStyle = '#0a1522'; ex.fillRect(0, 0, W, H);
  for (let j = 0; j < H; j++) {
    let lat = 90 - ((j + 0.5) / H) * 180;
    lat = Math.max(-MERC_LAT + 1e-4, Math.min(MERC_LAT - 1e-4, lat));
    const r = lat * Math.PI / 180;
    const sy = (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * S;
    ex.drawImage(mc, 0, Math.min(S - 1, Math.max(0, sy)), S, 1, 0, j, W, 1);
  }
  return ec;
}

export async function earthTexture(onTile) {
  let src, credit;
  try { src = await bakeEarthTexture(3, onTile); credit = 'Sentinel-2 cloudless © EOX'; }
  catch { src = await loadImg('./tex/earth_day_2k.jpg'); credit = 'Earth daymap © Solar System Scope (CC BY 4.0)'; }
  const t = new THREE.Texture(src);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true;
  return { tex: t, credit };
}

// 태양광을 받는 지표. 낮/밤 터미네이터와 약한 스펙큘러만 — 구름이 주인공이므로 절제한다.
export function makeEarth(tex) {
  const m = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, sun: { value: new THREE.Vector3(1, 0, 0) }, uOpacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
        vW=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    transparent: true, depthWrite: true,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float uOpacity;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 c = texture2D(map, vUv).rgb;
        // Sentinel-2 cloudless 의 바다는 거의 검다. 그대로 두면 낮인데도 밤처럼 읽힌다.
        // 어두운 화소를 심해 블루로 끌어올리고 전체를 살짝 감마 리프트한다.
        float lum = dot(c, vec3(0.299,0.587,0.114));
        float water = 1.0 - smoothstep(0.035, 0.16, lum);
        c = mix(pow(c, vec3(0.80)) * 1.18, vec3(0.055,0.135,0.265) + c*1.6, water);
        float nl = dot(normalize(vN), normalize(sun));
        float day = smoothstep(-0.22, 0.30, nl);
        vec3 night = c*0.055 + vec3(0.012,0.018,0.035);
        vec3 lit = c * (0.35 + 0.85*max(nl,0.0));
        // 터미네이터 부근 붉은 산란
        vec3 dusk = vec3(1.0,0.55,0.32) * (1.0-abs(nl*3.0)) * smoothstep(0.0,0.35,day) * 0.22;
        // 바다의 태양 글린트 — 지구가 '살아 있는 물체'로 읽히게 하는 값싼 한 줄
        vec3 V = normalize(cameraPosition - vW);
        vec3 Hv = normalize(normalize(sun) + V);
        lit += vec3(1.0,0.97,0.90) * pow(max(dot(normalize(vN), Hv), 0.0), 220.0) * water * 1.5;
        gl_FragColor = vec4(mix(night, lit, day) + max(dusk,0.0), uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 96), m);
  mesh.renderOrder = 0;
  return mesh;
}

// 프레넬 대기림 — 뒷면을 그린 큰 구. 시선과 법선이 이루는 각으로 두께를 근사한다.
export function makeAtmosphere(scale = 1.055) {
  const m = new THREE.ShaderMaterial({
    uniforms: { sun: { value: new THREE.Vector3(1, 0, 0) }, power: { value: 3.1 }, strength: { value: 1.0 } },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vN=normalize(mat3(modelMatrix)*normal);
        vW=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 sun; uniform float power; uniform float strength;
      varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 V = normalize(cameraPosition - vW);
        float f = pow(clamp(1.0 - abs(dot(normalize(vN), V)), 0.0, 1.0), power);
        float nl = clamp(dot(normalize(-vN), normalize(sun)), 0.0, 1.0);
        // 레일리 근사 — 정면은 시안, 태양 쪽 가장자리는 따뜻하게
        vec3 col = mix(vec3(0.24,0.47,0.92), vec3(0.85,0.86,1.0), nl*nl);
        col += vec3(0.9,0.45,0.22) * pow(nl, 6.0) * 0.55;
        gl_FragColor = vec4(col, f * strength * (0.30 + 0.85*nl));
      }`,
    side: THREE.BackSide, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R * scale, 96, 64), m);
  mesh.renderOrder = 20;
  return mesh;
}

// 위경도 → 월드 좌표 (텍스처 u=0 이 경도 -180 이 되도록 맞춘다)
export function llToVec(lonDeg, latDeg, r = R) {
  const phi = (90 - latDeg) * Math.PI / 180;
  const theta = (lonDeg + 180) * Math.PI / 180;
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta));
}
