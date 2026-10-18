/* v3 global — 월별 NDVI 타일(값 그대로 · 회색조)을 지역 한 장으로 모은다.
   - 표시: RdYlGn 으로 칠하고 지역 폴리곤 밖은 투명(사각형 번짐 0) → MapLibre image 소스
   - 작황 하락(HUD): 경작지(우리 해외 모델 경작지 바탕 · 없으면 ESA WorldCover 2021 class 40 — 10-17 바퀴 16) 중 이번 계절 평균 NDVI 가 전년 같은 계절 평균보다 DROP 이상 낮은 화소 면적
     (지역 안 · 두 해 모두 유효한 달이 1개 이상인 화소만 · 계절 안 녹화/갈변 같은 계절 변동은 세지 않는다)
   타일 = 카탈로그 pc-ndvi-mosaic 템플릿에서 색표만 뺀 것(rescale −0.2…0.8 → 0…255 · nodata 투명). */
const TS = 256, RAD = Math.PI / 180, EARTH = 2 * Math.PI * 6378137;
export const Z = 11;
export const DROP = 0.1;
/* 10-18 정확도 점검(원칙 287) — 예전 규칙(계절 평균만 0.1 낮으면 하락)은 이식아타 147.5㎢ 중 74%가 두 달 중 한 달만 낮은 칸(수확 시기 차이)이었다.
   지금 규칙(RULE r2): ① 계절 평균이 DROP 이상 낮고 ② 계절 달 대부분(2달이면 둘 다 · 3달이면 둘 이상)에서 같은 달 전년보다 DROP 이상 낮고
   ③ 전년 같은 계절에 푸르렀던 밭(NDVI ≥ 0.3)이 ④ 25% 이상 덜 푸르고 ⑤ 이웃 칸과 함께(외톨이 한 칸은 세지 않음). 같은 영상 · 같은 바탕이면 값이 같다. */
export const RULE = 'r2';
const PREV_MIN = 0.3, REL_MIN = 0.25;
const SPAN = 1.0;   // rescale −0.2…0.8
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z * TS;
const lat2y = (lat, z) => ((1 - Math.asinh(Math.tan(lat * RAD)) / Math.PI) / 2) * 2 ** z * TS;
const x2lon = (x, z) => (x / (2 ** z * TS)) * 360 - 180;
const y2lat = (y, z) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / (2 ** z * TS)))) / RAD;

/** 지역 bbox → 타일 격자(전역 화소 좌표) */
export function gridOf(bbox, z = Z) {
  const tx0 = Math.floor(lon2x(bbox[0], z) / TS), tx1 = Math.floor(lon2x(bbox[2], z) / TS);
  const ty0 = Math.floor(lat2y(bbox[3], z) / TS), ty1 = Math.floor(lat2y(bbox[1], z) / TS);
  const W = (tx1 - tx0 + 1) * TS, H = (ty1 - ty0 + 1) * TS;
  const X0 = tx0 * TS, Y0 = ty0 * TS;
  const coords = [[x2lon(X0, z), y2lat(Y0, z)], [x2lon(X0 + W, z), y2lat(Y0, z)], [x2lon(X0 + W, z), y2lat(Y0 + H, z)], [x2lon(X0, z), y2lat(Y0 + H, z)]];
  return { z, tx0, tx1, ty0, ty1, W, H, X0, Y0, coords, key: `${z}/${tx0}/${ty0}/${tx1}/${ty1}` };
}

/** 지역 폴리곤 마스크(1 = 지역 안) */
export function maskOf(grid, geometry) {
  const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d');
  const polys = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  g.beginPath();
  for (const p of polys) for (const r of p) r.forEach(([lon, lat], i) => { const x = lon2x(lon, grid.z) - grid.X0, y = lat2y(lat, grid.z) - grid.Y0; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
  g.fillStyle = '#fff'; g.fill('evenodd');
  const d = g.getImageData(0, 0, grid.W, grid.H).data, m = new Uint8Array(grid.W * grid.H);
  for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
  return m;
}

/* 타일 받기 — 화면이 서버 중계(로그인 머리 · 30일 보관)로 바꿔 끼운다 · 실패하면 조금 쉬고 다시(최대 4번) */
let FETCH = (u) => fetch(u);
export const useFetch = (f) => { FETCH = f; };
const PAUSE = [0, 400, 1200, 2400];
/** u → Blob(자료 있음) · null(자료 없음 204) · 'miss'(끝내 못 받음) */
async function getTile(u) {
  for (let a = 0; a < PAUSE.length; a++) {
    if (PAUSE[a]) await new Promise((r) => setTimeout(r, PAUSE[a]));
    try {
      const r = await FETCH(u);
      if (r.status === 204) return null;
      if (r.ok) return await r.blob();
      if (r.status === 404) return null;
    } catch { /* 다시 */ }
  }
  return 'miss';
}

const cache = new Map();
/** 한 달 → { v: Uint8Array(값 0…255), ok: Uint8Array(유효) } · 같은 달·격자는 한 번만 받는다 */
export function monthOf(template, searchid, grid) {
  const key = searchid + '|' + grid.key;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const base = template.replace('{searchid}', searchid).replace(/&colormap_name=[^&]*/, '');
    const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d', { willReadFrequently: true });
    const jobs = [];
    for (let ty = grid.ty0; ty <= grid.ty1; ty++) for (let tx = grid.tx0; tx <= grid.tx1; tx++) jobs.push([tx, ty]);
    let i = 0;
    const one = async () => {
      while (i < jobs.length) {
        const [tx, ty] = jobs[i++];
        const u = base.replace('{z}', grid.z).replace('{x}', tx).replace('{y}', ty);
        const b = await getTile(u);
        if (b === 'miss') { miss++; continue; }
        if (!b) continue;
        try { const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); g.drawImage(bmp, (tx - grid.tx0) * TS, (ty - grid.ty0) * TS); bmp.close?.(); } catch { miss++; }
      }
    };
    let miss = 0;
    await Promise.all(Array.from({ length: 8 }, one));
    const d = g.getImageData(0, 0, grid.W, grid.H).data, n = grid.W * grid.H;
    const v = new Uint8Array(n), ok = new Uint8Array(n);
    for (let k = 0; k < n; k++) { v[k] = d[k * 4]; ok[k] = d[k * 4 + 3] > 127 ? 1 : 0; }
    return { v, ok, miss };
  })();
  cache.set(key, p);
  p.then((x) => { if (x.miss) cache.delete(key); }, () => cache.delete(key));
  return p;
}

/* RdYlGn(−0.2…0.8) */
const RAMP = ['#a50026', '#d73027', '#f46d43', '#fdae61', '#fee08b', '#ffffbf', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850', '#006837'].map((x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16)));
const LUT = new Uint8Array(256 * 3);
for (let k = 0; k < 256; k++) { const t = (k / 255) * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(t)), f = t - i; for (let c = 0; c < 3; c++) LUT[k * 3 + c] = Math.round(RAMP[i][c] + (RAMP[i + 1][c] - RAMP[i][c]) * f); }

async function toUrl(c) { return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' })); }

/** 지역 안만 칠한 NDVI 한 장 */
export async function paintNdvi(month, mask, grid) {
  const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d'), img = g.createImageData(grid.W, grid.H), d = img.data;
  for (let k = 0; k < mask.length; k++) {
    if (!mask[k] || !month.ok[k]) continue;
    const j = month.v[k] * 3; d[k * 4] = LUT[j]; d[k * 4 + 1] = LUT[j + 1]; d[k * 4 + 2] = LUT[j + 2]; d[k * 4 + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  return toUrl(c);
}

/** 경작지 마스크(1 = 값 40) — 원값 타일(색표 없음) · 항목 범위와 겹치는 타일만 받는다(404 0).
 *  items = null 이면 격자 안 타일 전부(우리 해외 모델 경작지 바탕 /global/crop-tiles · 경작지 = 40 · 그 밖 투명) */
const cropCache = new Map();
export function cropOf(template, items, grid) {
  if (cropCache.has(grid.key)) return cropCache.get(grid.key);
  const p = (async () => {
    const base = template.replace(/&colormap_name=[^&]*/, '');
    const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d', { willReadFrequently: true });
    const boxes = (items || []).map((it) => { const m = /N(\d+)E(\d+)/.exec(it); return m ? { it, b: [+m[2], +m[1], +m[2] + 3, +m[1] + 3] } : null; }).filter(Boolean);
    const jobs = [];
    for (let ty = grid.ty0; ty <= grid.ty1; ty++) for (let tx = grid.tx0; tx <= grid.tx1; tx++) {
      const tb = [x2lon(tx * TS, grid.z), y2lat((ty + 1) * TS, grid.z), x2lon((tx + 1) * TS, grid.z), y2lat(ty * TS, grid.z)];
      if (!items) { jobs.push([tx, ty, '']); continue; }
      for (const { it, b } of boxes) if (tb[0] < b[2] && tb[2] > b[0] && tb[1] < b[3] && tb[3] > b[1]) jobs.push([tx, ty, it]);
    }
    let i = 0, got = 0;
    const one = async () => {
      while (i < jobs.length) {
        const [tx, ty, it] = jobs[i++];
        const u = base.replace('{item}', it).replace('{z}', grid.z).replace('{x}', tx).replace('{y}', ty);
        const b = await getTile(u);
        if (b === 'miss') { miss++; continue; }
        if (!b) continue;
        try { const bmp = await createImageBitmap(b, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); g.drawImage(bmp, (tx - grid.tx0) * TS, (ty - grid.ty0) * TS); bmp.close?.(); got++; } catch { miss++; }
      }
    };
    let miss = 0;
    await Promise.all(Array.from({ length: 6 }, one));
    if (!got) return null;
    const d = g.getImageData(0, 0, grid.W, grid.H).data, n = grid.W * grid.H, m = items ? new Uint8Array(n) : new Float32Array(n);
    // 우리 모델 바탕(items = null)은 G = 화소 안 경작지 비율(1–255) — 면적을 비율만큼 센다 · WorldCover 는 0/1
    for (let k = 0; k < n; k++) m[k] = d[k * 4 + 3] > 127 && d[k * 4] === 40 ? (items ? 1 : d[k * 4 + 1] / 255) : 0;
    m.miss = miss;   // 못 받은 타일 수(0 이어야 보관)
    return m;
  })();
  cropCache.set(grid.key, p);
  p.then((x) => { if (!x || x.miss) cropCache.delete(grid.key); }, () => cropCache.delete(grid.key));
  return p;
}

/** 화소별 계절 평균(유효한 달만) → { sum: Float32Array, n: Uint8Array } */
function seasonMean(months, N) {
  const sum = new Float32Array(N), n = new Uint8Array(N);
  for (const mo of months) for (let k = 0; k < N; k++) if (mo.ok[k]) { sum[k] += mo.v[k]; n[k]++; }
  return { sum, n };
}

/** 작황 하락 — 경작지 중 전년 같은 계절보다 덜 푸른 화소 면적(km² · 규칙 RULE 위 주석)
 *  cur · prev = 같은 차례의 달(이번 해 · 전년) · coverage = 지역 안 경작지 화소 중 두 해 모두 값이 있는 비율 · url = 하락 화소만 칠한 그림 */
export async function dropOf(cur, prev, mask, crop, grid, drop = DROP, aligned = true) {
  const N = grid.W * grid.H, A = seasonMean(cur, N), B = seasonMean(prev, N);
  const W = grid.W, c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d'), img = g.createImageData(grid.W, grid.H), d = img.data;
  let inN = 0, okN = 0, m2 = 0, cropM2 = 0;
  const lim = (drop / SPAN) * 255, base = (0.2 / SPAN) * 255, prevMin = ((PREV_MIN + 0.2) / SPAN) * 255;
  const pairs = aligned && cur.length === prev.length ? cur.map((a, i) => [a, prev[i]]) : [];
  const hit = new Uint8Array(N), area = new Float32Array(N);
  for (let y = 0; y < grid.H; y++) {
    const lat = y2lat(grid.Y0 + y + 0.5, grid.z), px = (EARTH * Math.cos(lat * RAD)) / (2 ** grid.z * TS), pa = px * px;
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (!mask[k] || !crop[k]) continue;
      const w = crop[k];   // 1(WorldCover) 또는 화소 안 경작지 비율(우리 모델 바탕)
      inN += w; cropM2 += pa * w;
      if (!A.n[k] || !B.n[k]) continue;
      okN += w;
      const a = A.sum[k] / A.n[k], b = B.sum[k] / B.n[k];
      if (b - a < lim || b < prevMin || (b - a) / (b - base) < REL_MIN) continue;
      let n = 0, down = 0;
      for (const [ma, mb] of pairs) if (ma.ok[k] && mb.ok[k]) { n++; if (mb.v[k] - ma.v[k] >= lim) down++; }
      if (n && down < Math.max(1, Math.ceil((2 * n) / 3))) continue;
      hit[k] = 1; area[k] = pa * w;
    }
  }
  // 외톨이 한 칸은 빼고(이웃 8칸 중 하나라도 하락이면 남김) 센다 · 칠한다
  for (let y = 0; y < grid.H; y++) for (let x = 0; x < W; x++) {
    const k = y * W + x;
    if (!hit[k]) continue;
    let nb = 0;
    for (let dy = -1; dy <= 1 && !nb; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const yy = y + dy, xx = x + dx;
      if (yy >= 0 && xx >= 0 && yy < grid.H && xx < W && hit[yy * W + xx]) { nb = 1; break; }
    }
    if (!nb) continue;
    m2 += area[k]; d[k * 4] = 15; d[k * 4 + 1] = 169; d[k * 4 + 2] = 160; d[k * 4 + 3] = 230;
  }
  g.putImageData(img, 0, 0);
  return { km2: m2 / 1e6, cropKm2: cropM2 / 1e6, coverage: inN ? okN / inN : 0, url: await toUrl(c) };
}

/* ── 작황 하락 화소를 줌에 맞는 한 장으로(바퀴 17 원칙 281 — 멀리서도 · 줌 인을 계속해도 보이게) ──
   결과 한 장은 z11 격자(지도 z11 에서 1 화소 = 1 화면 화소). 그보다 멀면 화면 1 화소에 여러 칸이 겹쳐 흩어진 칸이 지워졌다(흐릿) —
   멀리선 2 · 4칸을 묶어 하나라도 있으면 칠(진하기는 묶음 안 비율), 가까이(z11.5↑)는 두 배로 키워 한 빨강(10-18: 경계 선 없앰 — 좁은 밭에서 선이 칸을 덮었다). 값(면적)은 그대로 — 그림만.
   색 = 하락(붉은색 · 경작지 청록과 구별). 보관해 둔 예전 그림(청록)도 알파만 읽어 같은 색으로 다시 칠한다. */
export const DROP_RGB = [240, 68, 82];
export function levelsOf(url, base = Z) {
  const memo = new Map();
  let src = null;
  const load = () => (src ||= (async () => {
    const bm = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(bm.width, bm.height), g = c.getContext('2d'); g.drawImage(bm, 0, 0);
    const d = g.getImageData(0, 0, bm.width, bm.height).data, W = bm.width, H = bm.height, on = new Uint8Array(W * H);
    for (let k = 0; k < on.length; k++) on[k] = d[k * 4 + 3] > 20 ? 1 : 0;
    return { W, H, on };
  })());
  const [R, G, B] = DROP_RGB;
  async function make(k) {
    const { W, H, on } = await load();
    if (k > 1) {                                           // 멀리: k×k 묶음
      const w = Math.ceil(W / k), hh = Math.ceil(H / k), c = new OffscreenCanvas(w, hh), g = c.getContext('2d'), img = g.createImageData(w, hh), o = img.data;
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        let n = 0, t = 0;
        for (let j = 0; j < k; j++) { const yy = y * k + j; if (yy >= H) break; for (let i = 0; i < k; i++) { const xx = x * k + i; if (xx >= W) break; t++; n += on[yy * W + xx]; } }
        if (!n) continue;
        const q = (y * w + x) * 4; o[q] = R; o[q + 1] = G; o[q + 2] = B; o[q + 3] = Math.round(175 + 70 * (n / t));
      }
      g.putImageData(img, 0, 0); return toUrl(c);
    }
    const f = k === 1 ? 1 : -k, w = W * f, hh = H * f, c = new OffscreenCanvas(w, hh), g = c.getContext('2d'), img = g.createImageData(w, hh), o = img.data;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
      if (!on[Math.floor(y / f) * W + Math.floor(x / f)]) continue;
      const q = (y * w + x) * 4;
      o[q] = R; o[q + 1] = G; o[q + 2] = B; o[q + 3] = 225;   // 10-18: 가장자리 선 없음(흰 · 진한 선 모두 좁은 밭에서 칸을 다 덮어 어수선) — 한 빨강
    }
    g.putImageData(img, 0, 0); return toUrl(c);
  }
  return {
    /** 지도 줌 → 묶음 단계(4 · 2 · 1 · -2) */
    level(zoom) { const d = zoom - base; return d < -1.5 ? 4 : d < -0.5 ? 2 : d < 0.5 ? 1 : -2; },
    url(k) { if (!memo.has(k)) memo.set(k, make(k)); return memo.get(k); },
  };
}
