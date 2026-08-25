// 성층운 돌파 (p 0.20–0.32)
// 절차적 값노이즈로 구름 텍스처를 그 자리에서 굽고, 서로 다른 속도로 부풀어 오르는
// 3장의 판 + 화이트아웃 헤이즈로 "통과"를 만든다. 크로스페이드가 아니라 통과여야 한다.

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (x) => Math.max(0, Math.min(1, x));

function lattice(n, seed) {
  const g = new Float32Array(n * n);
  let s = seed >>> 0;
  for (let i = 0; i < g.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; g[i] = s / 4294967296; }
  return g;
}
function sample(g, n, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const tx = smooth(x - xi), ty = smooth(y - yi);
  const i = (a, b) => g[((b % n) + n) % n * n + ((a % n) + n) % n];
  return lerp(lerp(i(xi, yi), i(xi + 1, yi), tx), lerp(i(xi, yi + 1), i(xi + 1, yi + 1), tx), ty);
}
function fbm(size, octaves, seed) {
  const grids = [];
  for (let o = 0; o < octaves; o++) grids.push({ n: 4 << o, g: lattice(4 << o, seed + o * 7919) });
  const out = new Float32Array(size * size);
  let max = 0;
  for (let o = 0; o < octaves; o++) max += 1 / (1 << o);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let v = 0;
    for (let o = 0; o < octaves; o++) {
      const { n, g } = grids[o];
      v += sample(g, n, x / size * n, y / size * n) / (1 << o);
    }
    out[y * size + x] = v / max;
  }
  return out;
}

// 두 개의 fbm 을 써서 밀도(알파)와 음영(명도)을 따로 만든다 — 평평한 흰 얼룩이 되지 않게.
export function cloudTexture(size = 512, seed = 11, cut = 0.46, gain = 2.3) {
  const dens = fbm(size, 6, seed);
  const shade = fbm(size, 4, seed + 4241);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const a = clamp01((dens[i] - cut) * gain);
    const s = shade[i];
    const lit = clamp01(0.55 + s * 0.7);
    img.data[i * 4 + 0] = Math.round(lerp(178, 255, lit));
    img.data[i * 4 + 1] = Math.round(lerp(198, 253, lit));
    img.data[i * 4 + 2] = Math.round(lerp(224, 248, lit));
    img.data[i * 4 + 3] = Math.round(clamp01(a * a * (3 - 2 * a)) * 255);
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}

const DECKS = [
  // in/out: p 구간, s0/s1: 스케일, op: 최대 불투명도, depth: 커서 시차 계수
  { in: 0.178, out: 0.262, s0: 1.00, s1: 4.20, op: 0.80, blur: 1.4, depth: 7,  spin: -3.2 },
  { in: 0.200, out: 0.300, s0: 1.20, s1: 9.00, op: 1.00, blur: 0,   depth: 15, spin: 2.6 },
  { in: 0.236, out: 0.328, s0: 0.82, s1: 6.20, op: 0.90, blur: 2.4, depth: 24, spin: -1.8 },
];

// 병렬 작업물(assets/proto/clouds/*.webp)이 있으면 그것을, 없으면 절차적 텍스처를 쓴다.
const ART = ['../assets/proto/clouds/cloud_far.webp', '../assets/proto/clouds/cloud_mid.webp', '../assets/proto/clouds/cloud_near.webp'];

export function makeClouds(host, assetsReady) {
  const tex = [cloudTexture(512, 11, 0.42, 3.1), cloudTexture(512, 73, 0.38, 2.7), cloudTexture(512, 907, 0.46, 3.3)];
  const planes = DECKS.map((d, i) => {
    const el = document.createElement('div');
    el.className = 'cloud-deck';
    el.style.backgroundImage = `url(${tex[i]})`;
    el.style.filter = d.blur ? `blur(${d.blur}px)` : '';
    host.appendChild(el);
    Promise.resolve(assetsReady).then((a) => {
      if (a && a.clouds) el.style.backgroundImage = `url(${ART[i]})`;
    });
    return el;
  });
  const haze = document.createElement('div');
  haze.className = 'cloud-haze';
  host.appendChild(haze);

  let mx = 0, my = 0, cx = 0, cy = 0;
  addEventListener('pointermove', (e) => {
    mx = (e.clientX / innerWidth - 0.5) * 2;
    my = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  return {
    update(p) {
      cx = lerp(cx, mx, 0.06); cy = lerp(cy, my, 0.06);
      let any = 0;
      DECKS.forEach((d, i) => {
        const t = clamp01((p - d.in) / (d.out - d.in));
        const alive = p > d.in - 0.02 && p < d.out + 0.02;
        const el = planes[i];
        if (!alive) { el.style.opacity = '0'; return; }
        // 들어올 때 빠르게 차오르고 통과하며 빠진다.
        const fade = t < 0.28 ? t / 0.28 : 1 - smooth((t - 0.28) / 0.72);
        const sc = lerp(d.s0, d.s1, t * t * (3 - 2 * t));
        const ox = cx * d.depth, oy = cy * d.depth - t * 40;
        el.style.opacity = String(fade * d.op);
        el.style.transform =
          `translate3d(${ox}px, ${oy}px, 0) scale(${sc}) rotate(${d.spin * t}deg)`;
        // 가운데가 먼저 뚫린다 — 판이 갈라지는 느낌.
        const hole = Math.round(lerp(0, 62, clamp01((t - 0.35) / 0.65)));
        el.style.maskImage = el.style.webkitMaskImage =
          `radial-gradient(circle at 50% 46%, rgba(0,0,0,0) ${hole * 0.55}%, rgba(0,0,0,1) ${hole + 24}%)`;
        any += fade * d.op;
      });
      const h = clamp01(1 - Math.abs(p - 0.258) / 0.062);
      haze.style.opacity = String(smooth(h) * 0.94);
      return any;
    },
  };
}
