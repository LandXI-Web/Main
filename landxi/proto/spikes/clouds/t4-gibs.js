// 기법 4 — 실사 구름 (NASA GIBS WMTS, 어제 관측)
// 글로브(p<0.3): EPSG:4326 `250m` 타일매트릭스를 등장방형 캔버스로 이어붙인 뒤,
//   트루컬러에서 "희고 밝은" 화소만 알파로 키잉해 구름만 남긴 구를 지구 위에 얹는다.
// 지도(p>0.3): EPSG:3857 타일을 MapLibre raster 레이어로 반투명하게 얹는다(키잉 불가).
// 출처: NASA EOSDIS GIBS / Worldview. 이미지는 퍼블릭 도메인, 출처 표기 요청.
import * as THREE from 'three';
import { R } from './globe.js';

export const LAYERS = {
  modis: 'MODIS_Terra_CorrectedReflectance_TrueColor',
  viirs: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
};
const TMS = '250m';
const G4326 = (l, d, z, y, x) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/${l}/default/${d}/${TMS}/${z}/${y}/${x}.jpg`;
export const G3857 = (l, d) =>
  `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${l}/default/${d}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`;

// GIBS 는 당일 자료가 늦다. UTC 기준 어제부터 뒤로 훑는다.
export function gibsDate(back = 1) {
  const d = new Date(Date.now() - back * 864e5);
  return d.toISOString().slice(0, 10);
}

const img = (u) => new Promise((res, rej) => {
  const i = new Image(); i.crossOrigin = 'anonymous';
  i.onload = () => res(i); i.onerror = rej; i.src = u;
});

// GIBS EPSG:4326 `250m` 타일매트릭스는 정사각 격자가 아니다. 화소 크기는 레벨 8 에서
// 0.002197°, 위로 갈수록 두 배 — 레벨 z 의 타일 한 변은 288/2^z 도다.
//   z=2 → 72°/타일 → 5×3 (아래 한 줄이 잘린다)
//   z=3 → 36°/타일 → 10×5 = 5120×2560, 정확히 2:1 등장방형 ← 이걸 쓴다
// 격자 밖 좌표는 404 가 아니라 400 을 돌려주므로 범위를 정확히 맞춰야 한다.
export const tileDeg = (z) => 288 / Math.pow(2, z);
export async function bakeGibs(layer = LAYERS.modis, date = gibsDate(1), z = 3, onTile) {
  const deg = tileDeg(z), S = 512;
  const nx = Math.ceil(360 / deg), ny = Math.ceil(180 / deg);
  const c = document.createElement('canvas');
  c.width = Math.round(360 / deg * S); c.height = Math.round(180 / deg * S);
  const x2 = c.getContext('2d', { willReadFrequently: true });
  x2.fillStyle = '#000'; x2.fillRect(0, 0, c.width, c.height);
  let got = 0;
  await Promise.all(Array.from({ length: nx * ny }, async (_, k) => {
    const x = k % nx, y = (k / nx) | 0;
    try { x2.drawImage(await img(G4326(layer, date, z, y, x)), x * S, y * S); got++; } catch { /* 결측 */ }

    onTile && onTile(k + 1, nx * ny);
  }));
  if (got < nx * ny * 0.8) throw new Error(`GIBS 타일 부족 ${got}/${nx * ny} (${date})`);

  // 트루컬러 → 구름 알파 키잉: 밝고(V 높음) 채도 낮은(S 낮음) 화소가 구름.
  const im = x2.getImageData(0, 0, c.width, c.height);
  const p = im.data;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i] / 255, g = p[i + 1] / 255, b = p[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const sat = mx <= 0 ? 0 : (mx - mn) / mx;
    let a = Math.max(0, (mx - 0.46) / 0.44) * Math.max(0, 1 - sat / 0.30);
    a = Math.min(1, a); a = a * a * (3 - 2 * a);
    // 눈/사막의 밝은 지표도 걸린다 — 완전 불투명까지는 밀지 않는다
    p[i + 3] = Math.round(a * 246);
    const w = 0.86 + mx * 0.14;
    p[i] = Math.round(255 * w); p[i + 1] = Math.round(253 * w); p[i + 2] = Math.round(250 * w);
  }
  x2.putImageData(im, 0, 0);
  // 5120x2560 은 GPU 에 52MB. 4096x2048 로 줄여도 글로브 스케일에선 차이가 없다.
  const o = document.createElement('canvas'); o.width = 4096; o.height = 2048;
  o.getContext('2d').drawImage(c, 0, 0, o.width, o.height);
  return { canvas: o, date, layer, tiles: got, grid: `${nx}x${ny}` };
}

export function createGibsSphere(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: t }, sun: { value: new THREE.Vector3(1, 0, 0) },
      uOpacity: { value: 1 }, uOff: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal);
        vW=(modelMatrix*vec4(position,1.0)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 sun; uniform float uOpacity; uniform float uOff;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 c = texture2D(map, vec2(fract(vUv.x+uOff), vUv.y));
        vec3 N=normalize(vN), V=normalize(cameraPosition-vW), L=normalize(sun);
        float nl = dot(N,L);
        float day = smoothstep(-0.16,0.28,nl);
        vec3 col = c.rgb * (0.44 + 0.72*max(nl,0.0));
        col = mix(vec3(0.04,0.06,0.10), col, day);
        col += vec3(1.0,0.87,0.70)*pow(clamp(dot(V,-L),0.0,1.0),6.0)*0.4*day;
        float rim = 1.0 + 1.4*pow(1.0-abs(dot(N,V)),2.4);
        gl_FragColor = vec4(col, clamp(c.a*rim,0.0,1.0)*uOpacity);
      }`,
    transparent: true, depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, 128, 96), mat);
  mesh.renderOrder = 12;
  const g = new THREE.Group(); g.add(mesh);
  let off = 0;
  return {
    group: g, name: 'gibs-real',
    update(altKm, dt) {
      // 실측 구름은 "오늘의 하늘"이므로 회전은 아주 느리게(관측 시각 유지)
      off = (off + dt * 0.0011) % 1;
      mat.uniforms.uOff.value = off;
      const vis = THREE.MathUtils.smoothstep(altKm, 40, 300);
      g.visible = vis > 0.01;
      mat.uniforms.uOpacity.value = vis;
    },
    setSun(s) { mat.uniforms.sun.value.copy(s); },
    dispose() { mat.dispose(); t.dispose(); },
  };
}
