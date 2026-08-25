// 기법 3 — 볼류메트릭 레이마치 (저고도 관통의 최고 사실감, 최고 비용)
// 반해상도 RT 에 구름 슬래브(alt0..alt1)를 24–48 스텝으로 행진해 굽고, 원본 프레임 위에
// over-composite 한다. 밀도는 타일러블 3D 값노이즈 fbm, 조명은 6스텝 라이트마치
// (Beer–Lambert) + powder 항.
import * as THREE from 'three';

/* ── 타일러블 3D 값노이즈 (R: 저주파 형상, G: 고주파 디테일) ── */
function noise3D(N = 64) {
  const step = (s) => (s * 1664525 + 1013904223) >>> 0;
  const lat = (n, seed) => {
    const a = new Float32Array(n * n * n); let s = seed >>> 0;
    for (let i = 0; i < a.length; i++) { s = step(s); a[i] = s / 4294967296; }
    return a;
  };
  const sm = (t) => t * t * (3 - 2 * t);
  const smp = (g, n, x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const tx = sm(x - xi), ty = sm(y - yi), tz = sm(z - zi);
    const at = (a, b, c) => g[((((c % n) + n) % n) * n + (((b % n) + n) % n)) * n + (((a % n) + n) % n)];
    const l = (p, q, t) => p + (q - p) * t;
    const c00 = l(at(xi, yi, zi), at(xi + 1, yi, zi), tx);
    const c10 = l(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), tx);
    const c01 = l(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), tx);
    const c11 = l(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), tx);
    return l(l(c00, c10, ty), l(c01, c11, ty), tz);
  };
  const grids = (base, oct, seed) =>
    Array.from({ length: oct }, (_, o) => ({ n: base << o, g: lat(base << o, seed + o * 7919) }));
  const A = grids(4, 4, 1337), B = grids(8, 3, 9001);
  const data = new Uint8Array(N * N * N * 4);
  let k = 0;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = 0, ma = 0, b = 0, mb = 0;
    A.forEach(({ n, g }, o) => { const w = 1 / (1 << o); ma += w; a += w * smp(g, n, x / N * n, y / N * n, z / N * n); });
    B.forEach(({ n, g }, o) => { const w = 1 / (1 << o); mb += w; b += w * smp(g, n, x / N * n, y / N * n, z / N * n); });
    data[k++] = (a / ma) * 255; data[k++] = (b / mb) * 255; data[k++] = 0; data[k++] = 255;
  }
  const t = new THREE.Data3DTexture(data, N, N, N);
  t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping;
  t.needsUpdate = true;
  return t;
}

const VERT = `
out vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
precision highp sampler3D;
uniform sampler3D uNoise;
uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uToLocal;
uniform vec3 uCam; uniform vec3 uSun;
uniform float uTime; uniform float uAlt0; uniform float uAlt1;
uniform float uCoverage; uniform float uSteps; uniform float uKM; uniform float uDensity;
in vec2 vUv;
out vec4 fragColor;

float fbm(vec3 p){
  float lo = texture(uNoise, p * 0.5).r;
  float hi = texture(uNoise, p * 2.7).g;
  return clamp(lo * 0.80 + hi * 0.32 - 0.10, 0.0, 1.0);
}

// 고도 프로파일 — 바닥은 평평하고 정수리는 둥글게(적운)
float profile(float h){ return smoothstep(0.0, 0.14, h) * (1.0 - smoothstep(0.52, 1.0, h)); }

float density(vec3 lp){
  float h = (lp.y / uKM - uAlt0) / max(uAlt1 - uAlt0, 0.001);
  if (h < 0.0 || h > 1.0) return 0.0;
  vec3 q = vec3(lp.x, lp.y * 2.2, lp.z) / (uKM * 11.0);
  q += vec3(uTime * 0.0075, 0.0, uTime * 0.0026);
  float n = fbm(q);
  float d = (n - (1.0 - uCoverage)) * 3.0;
  return clamp(d, 0.0, 1.0) * profile(h) * uDensity;
}

void main(){
  // 뷰 레이 재구성 — 역투영 후 카메라 월드로
  vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
  vec3 rd = normalize(mat3(uCamWorld) * (v.xyz / v.w));
  vec3 lo = (uToLocal * vec4(uCam, 1.0)).xyz;
  vec3 ld = normalize((uToLocal * vec4(rd, 0.0)).xyz);

  float y0 = uAlt0 * uKM, y1 = uAlt1 * uKM;
  float tA, tB;
  if (abs(ld.y) < 1e-7) {
    if (lo.y < y0 || lo.y > y1) { fragColor = vec4(0.0); return; }
    tA = 0.0; tB = 120.0 * uKM;
  } else {
    float ta = (y0 - lo.y) / ld.y, tb = (y1 - lo.y) / ld.y;
    tA = min(ta, tb); tB = max(ta, tb);
  }
  tA = max(tA, 0.0);
  if (tB <= tA) { fragColor = vec4(0.0); return; }
  tB = min(tB, tA + 260.0 * uKM);

  float steps = uSteps;
  float dt = (tB - tA) / steps;
  vec3 L = normalize((uToLocal * vec4(uSun, 0.0)).xyz);
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float t = tA + dt * jit;

  float nl = clamp(dot(L, vec3(0.0, 1.0, 0.0)), -1.0, 1.0);
  float day = smoothstep(-0.16, 0.30, nl);
  vec3 sunCol = mix(vec3(1.0, 0.68, 0.44), vec3(1.0, 0.985, 0.95), clamp(nl * 2.2, 0.0, 1.0));
  vec3 amb = mix(vec3(0.11, 0.14, 0.21), vec3(0.58, 0.65, 0.79), day);
  float cosT = clamp(dot(ld, L), -1.0, 1.0);
  // Henyey-Greenstein 근사 — 전방산란 실버라이닝
  float g = 0.62;
  float hg = (1.0 - g * g) / (12.566 * pow(1.0 + g * g - 2.0 * g * cosT, 1.5));
  float phase = 0.55 + 2.6 * hg;

  float T = 1.0; vec3 acc = vec3(0.0);
  for (int i = 0; i < 48; i++) {
    if (float(i) >= steps || T < 0.012) break;
    vec3 p = lo + ld * t;
    float d = density(p);
    if (d > 0.002) {
      float ls = (y1 - y0) / 6.0 / max(abs(L.y), 0.28);
      float tl = 0.0, sh = 0.0;
      for (int j = 0; j < 6; j++) { tl += ls; sh += density(p + L * tl); }
      float Tl = exp(-sh * ls / uKM * 0.62);
      float powder = 1.0 - exp(-d * 3.6);
      vec3 S = (sunCol * Tl * phase * powder * 1.8 + amb) * day + amb * 0.22;
      float a = 1.0 - exp(-d * dt / uKM * 0.50);
      acc += T * a * S;
      T *= (1.0 - a);
    }
    t += dt;
  }
  float alpha = 1.0 - T;
  if (alpha < 0.003) { fragColor = vec4(0.0); return; }
  fragColor = vec4(acc / max(alpha, 1e-4), alpha);
}`;

export function createVolumetric(renderer, anchor, opt = {}) {
  const noise = noise3D(opt.n || 64);
  const rt = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false, type: THREE.HalfFloatType });
  rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;

  const mat = new THREE.RawShaderMaterial({
    uniforms: {
      uNoise: { value: noise },
      uInvProj: { value: new THREE.Matrix4() },
      uCamWorld: { value: new THREE.Matrix4() },
      uToLocal: { value: new THREE.Matrix4() },
      uCam: { value: new THREE.Vector3() },
      uSun: { value: new THREE.Vector3(1, 0, 0) },
      uTime: { value: 0 }, uAlt0: { value: 1.6 }, uAlt1: { value: 8.2 },
      uCoverage: { value: 0.52 }, uSteps: { value: 40 },
      uKM: { value: 1 }, uDensity: { value: 1 },
    },
    vertexShader: VERT, fragmentShader: FRAG,
    glslVersion: THREE.GLSL3, depthTest: false, depthWrite: false,
  });

  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  quad.frustumCulled = false;
  const rtScene = new THREE.Scene(); rtScene.add(quad);
  const rtCam = new THREE.Camera();

  const compMat = new THREE.MeshBasicMaterial({
    map: rt.texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false,
  });
  const comp = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compMat);
  comp.frustumCulled = false; comp.renderOrder = 850;

  let t = 0, scale = 0.5, on = false;

  return {
    comp, name: 'volumetric',
    setScale(s) { scale = s; },
    get resScale() { return scale; },
    update(altKm, dt, sun, cam, KM) {
      t += dt;
      on = altKm < 90;                       // 대류권 밖에서는 끈다
      comp.visible = on;
      if (!on) return;
      const u = mat.uniforms;
      u.uTime.value = t; u.uKM.value = KM;
      u.uSun.value.copy(sun);
      u.uCam.value.copy(cam.position);
      u.uInvProj.value.copy(cam.projectionMatrixInverse);
      u.uCamWorld.value.copy(cam.matrixWorld);
      u.uToLocal.value.copy(anchor.matrixWorld).invert();
      u.uSteps.value = altKm < 12 ? 48 : altKm < 40 ? 32 : 24;
      u.uCoverage.value = THREE.MathUtils.lerp(0.34, 0.56, THREE.MathUtils.smoothstep(altKm, 0.6, 9.0));
      u.uDensity.value = THREE.MathUtils.smoothstep(altKm, 92, 52);
    },
    render(w, h) {
      if (!on) return;
      const W = Math.max(2, Math.round(w * scale)), H = Math.max(2, Math.round(h * scale));
      if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(rt);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(rtScene, rtCam);
      renderer.setRenderTarget(prev);
    },
    fit(cam) {
      const d = cam.near * 40;
      const hh = 2 * Math.tan(cam.fov * Math.PI / 360) * d;
      comp.scale.set(hh * cam.aspect * 0.5, hh * 0.5, 1);
      comp.position.set(0, 0, -d);
      comp.quaternion.identity();
    },
    dispose() { rt.dispose(); mat.dispose(); compMat.dispose(); noise.dispose(); },
  };
}
