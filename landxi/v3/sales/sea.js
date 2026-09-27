/* sea.js — 사례·히어로 지도의 바다를 한 빛으로 고른다(조각보 0).
   V-World 는 바다 칸 상당수가 '데이터 없음' 단색 남청(≈ rgb 60,82,113 · JPEG 로 보라·남색 쪽으로 흔들림)이고,
   영상이 있는 바다 칸도 촬영마다 청록·남색·밝기가 달라 칸 경계가 격자로 보인다(3차 판정 지적).
   처리(모든 타일에 같은 함수 → 이웃 타일끼리 이어진다):
   · 물 가중치 w(0~1) = 픽셀이 물빛(파랑 > 빨강, 너무 밝지 않음)인 정도. 육지·도시·갯벌은 w≈0 → 그대로
   · '데이터 없음' 단색(넓힌 허용 범위) → w = 1, 그 둘레 8px(상자 블러)의 푸른 번짐 픽셀도 물로
   · 색 = 바다색 한 빛 + '잔물결'(밝기 − 물 안쪽 8px 평균)만 60 % — 타일마다 다른 밝기 단(段)은 지우고 물결 결만 남긴다
   · 결과 = mix(원래, 위 색, 0.92·w)
   외부 타일은 엔진 extFetch(Worker fetch · 실패 = 투명, 콘솔 오류 0)로 받는다.
   키트 K3 에 같은 처리가 들어오면 이 파일은 지운다(보고서 '키트 요청' 2). */
import { extFetch } from '../../xi/engine/sources.js';

export const SEA_LOG = { tiles: 0, touched: 0, nd: 0 };
const SEA = [8, 86, 102];            // V-World 남해안 바다 중앙값 근처(청록 남색)
const K = 0.92, TEX = 0.6, R = 8;
let BLANK = null, CV = null;
const blank = async () => (BLANK ||= await createImageBitmap(new ImageData(1, 1)));
const cl = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

/* '데이터 없음' 단색(JPEG 흔들림 포함 · 보라 쪽 번짐까지) */
const isND = (r, g, b) => r >= 34 && r <= 80 && g >= 54 && g <= 98 && b >= 86 && b <= 130 && b - g >= 18 && b - g <= 50 && g - r >= -4 && g - r <= 34;
/* 물빛 정도 */
const water = (r, g, b) => cl((b - r - 18) / 24) * cl((g - r - 6) / 20) * cl((175 - Math.max(r, g, b)) / 45);

/* 분리형 상자 블러(반경 R) */
function blur(src, w, h) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), n = 2 * R + 1;
  for (let y = 0; y < h; y++) {
    let s = 0; const o = y * w;
    for (let x = -R; x <= R; x++) s += src[o + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[o + x] = s / n;
      s += src[o + Math.min(w - 1, x + R + 1)] - src[o + Math.max(0, x - R)];
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -R; y <= R; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += tmp[Math.min(h - 1, y + R + 1) * w + x] - tmp[Math.max(0, y - R) * w + x];
    }
  }
  return out;
}

async function evenSea(bmp) {
  const w = bmp.width, hh = bmp.height, n = w * hh;
  CV ||= new OffscreenCanvas(w, hh);
  if (CV.width !== w || CV.height !== hh) { CV.width = w; CV.height = hh; }
  const g = CV.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, hh); g.drawImage(bmp, 0, 0);
  const im = g.getImageData(0, 0, w, hh), a = im.data;
  const W = new Float32Array(n), N = new Float32Array(n), L = new Float32Array(n);
  let any = 0, nd = 0;
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    const r = a[i], gg = a[i + 1], b = a[i + 2];
    if (isND(r, gg, b)) { W[p] = 1; N[p] = 1; nd++; any = 1; continue; }
    const v = water(r, gg, b); W[p] = v; if (v > 0) any = 1;
  }
  SEA_LOG.tiles++;
  if (!any) return bmp;
  // 단색 칸 둘레 8px 안의 푸른 번짐(JPEG 보라·남색 테두리)도 물로
  const NB = nd ? blur(N, w, hh) : null;
  if (nd) {
    for (let p = 0, i = 0; p < n; p++, i += 4) if (!N[p] && NB[p] > 0.02 && a[i + 2] > a[i] + 15) W[p] = Math.max(W[p], cl(NB[p] * 4));
  }
  // 잔물결 = 밝기 − 물 안쪽 평균 밝기(물 가중 평균이라 해안 육지 밝기가 섞이지 않는다 · 단색 칸은 결 0)
  const WL = new Float32Array(n), WT = new Float32Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) { L[p] = lum(a[i], a[i + 1], a[i + 2]); const t = N[p] ? 0 : W[p]; WT[p] = t; WL[p] = L[p] * t; }
  const bWL = blur(WL, w, hh), bWT = blur(WT, w, hh);
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    if (W[p] <= 0) continue;
    let tex;
    if (N[p]) tex = (((p * 2654435761) >>> 0) % 5) - 2;          // 단색 칸: 결정적 미세 결(±2)
    else tex = bWT[p] > 0.05 ? TEX * (L[p] - bWL[p] / bWT[p]) : 0;
    // 단색 칸 둘레 8px: 결을 0 으로 · 바다색으로 끝까지 당긴다(칸 테두리 선 0)
    const near = NB ? cl(NB[p] * 3) : 0;
    if (!N[p]) tex *= 1 - near;
    tex = tex < -12 ? -12 : tex > 12 ? 12 : tex;
    const k = N[p] ? 1 : Math.max(K * W[p], near * W[p]);
    const r = a[i], gg = a[i + 1], b = a[i + 2];
    a[i] = r + (SEA[0] + tex - r) * k;
    a[i + 1] = gg + (SEA[1] + tex - gg) * k;
    a[i + 2] = b + (SEA[2] + tex - b) * k;
  }
  SEA_LOG.touched++; SEA_LOG.nd += nd;
  g.putImageData(im, 0, 0); bmp.close?.();
  return createImageBitmap(CV);
}

let on = false;
function register() {
  if (on || !window.maplibregl) return on;
  window.maplibregl.addProtocol('slvw', async (params, ac) => {
    const url = 'https://' + params.url.slice('slvw://'.length);
    let r;
    try { r = await extFetch(url, { signal: ac.signal }); } catch { return { data: await blank() }; }
    if (!r.ok) return { data: await blank() };
    try { return { data: await evenSea(await createImageBitmap(await r.blob())) }; } catch { return { data: await blank() }; }
  });
  return (on = true);
}

/** 무대(K3)를 만든 직후(ready 전) 부른다 — V-World 층이 추가될 때 주소를 slvw:// 로 바꿔 넣는다.
   ready 뒤 setTiles 로 바꾸면 이미 나간 요청이 취소되며 콘솔에 AbortError 가 남으므로, 추가 시점에 가로챈다. */
export function seaSafe(st) {
  if (!register()) return;
  const map = st.map, add = map.addSource.bind(map);
  map.addSource = (id, spec) => {
    if (id === 'k-vw' && spec?.tiles) spec = { ...spec, tiles: spec.tiles.map((u) => 'slvw://' + u.replace(/^[a-z]+:\/\//, '')) };
    return add(id, spec);
  };
}
