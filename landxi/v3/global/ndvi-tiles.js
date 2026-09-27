/* v3 global — 월별 NDVI 타일(값 그대로 · 회색조)을 지역 한 장으로 모은다.
   - 표시: RdYlGn 으로 칠하고 지역 폴리곤 밖은 투명(사각형 번짐 0) → MapLibre image 소스
   - 작황 하락(HUD): 경작지(ESA WorldCover 2021 class 40) 중 이번 계절 평균 NDVI 가 전년 같은 계절 평균보다 DROP 이상 낮은 화소 면적
     (지역 안 · 두 해 모두 유효한 달이 1개 이상인 화소만 · 계절 안 녹화/갈변 같은 계절 변동은 세지 않는다)
   타일 = 카탈로그 pc-ndvi-mosaic 템플릿에서 색표만 뺀 것(rescale −0.2…0.8 → 0…255 · nodata 투명). */
const TS = 256, RAD = Math.PI / 180, EARTH = 2 * Math.PI * 6378137;
export const Z = 11;
export const DROP = 0.1;
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
        for (let a = 0; a < 2; a++) {
          try {
            const r = await fetch(u);
            if (r.status === 204) break;
            if (!r.ok) continue;
            const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            g.drawImage(bmp, (tx - grid.tx0) * TS, (ty - grid.ty0) * TS); bmp.close?.();
            break;
          } catch { /* 한 번 더 */ }
        }
      }
    };
    await Promise.all(Array.from({ length: 8 }, one));
    const d = g.getImageData(0, 0, grid.W, grid.H).data, n = grid.W * grid.H;
    const v = new Uint8Array(n), ok = new Uint8Array(n);
    for (let k = 0; k < n; k++) { v[k] = d[k * 4]; ok[k] = d[k * 4 + 3] > 127 ? 1 : 0; }
    return { v, ok };
  })();
  cache.set(key, p);
  p.catch(() => cache.delete(key));
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

/** 경작지 마스크(1 = WorldCover class 40) — 원값 타일(색표 없음) · 항목 범위와 겹치는 타일만 받는다(404 0) */
const cropCache = new Map();
export function cropOf(template, items, grid) {
  if (cropCache.has(grid.key)) return cropCache.get(grid.key);
  const p = (async () => {
    const base = template.replace(/&colormap_name=[^&]*/, '');
    const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d', { willReadFrequently: true });
    const boxes = items.map((it) => { const m = /N(\d+)E(\d+)/.exec(it); return m ? { it, b: [+m[2], +m[1], +m[2] + 3, +m[1] + 3] } : null; }).filter(Boolean);
    const jobs = [];
    for (let ty = grid.ty0; ty <= grid.ty1; ty++) for (let tx = grid.tx0; tx <= grid.tx1; tx++) {
      const tb = [x2lon(tx * TS, grid.z), y2lat((ty + 1) * TS, grid.z), x2lon((tx + 1) * TS, grid.z), y2lat(ty * TS, grid.z)];
      for (const { it, b } of boxes) if (tb[0] < b[2] && tb[2] > b[0] && tb[1] < b[3] && tb[3] > b[1]) jobs.push([tx, ty, it]);
    }
    let i = 0, got = 0;
    const one = async () => {
      while (i < jobs.length) {
        const [tx, ty, it] = jobs[i++];
        const u = base.replace('{item}', it).replace('{z}', grid.z).replace('{x}', tx).replace('{y}', ty);
        for (let a = 0; a < 2; a++) {
          try {
            const r = await fetch(u);
            if (r.status === 204) break;
            if (!r.ok) continue;
            const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
            g.drawImage(bmp, (tx - grid.tx0) * TS, (ty - grid.ty0) * TS); bmp.close?.(); got++;
            break;
          } catch { /* 한 번 더 */ }
        }
      }
    };
    await Promise.all(Array.from({ length: 6 }, one));
    if (!got) return null;
    const d = g.getImageData(0, 0, grid.W, grid.H).data, n = grid.W * grid.H, m = new Uint8Array(n);
    for (let k = 0; k < n; k++) m[k] = d[k * 4 + 3] > 127 && d[k * 4] === 40 ? 1 : 0;
    return m;
  })();
  cropCache.set(grid.key, p);
  p.catch(() => cropCache.delete(grid.key));
  return p;
}

/** 화소별 계절 평균(유효한 달만) → { sum: Float32Array, n: Uint8Array } */
function seasonMean(months, N) {
  const sum = new Float32Array(N), n = new Uint8Array(N);
  for (const mo of months) for (let k = 0; k < N; k++) if (mo.ok[k]) { sum[k] += mo.v[k]; n[k]++; }
  return { sum, n };
}

/** 작황 하락 — 경작지 중 (전년 같은 계절 평균 − 이번 계절 평균) ≥ DROP 인 화소 면적(km²)
 *  coverage = 지역 안 경작지 화소 중 두 해 모두 값이 있는 비율 · url = 하락 화소만 칠한 그림 */
export async function dropOf(cur, prev, mask, crop, grid, drop = DROP) {
  const N = grid.W * grid.H, A = seasonMean(cur, N), B = seasonMean(prev, N);
  const c = new OffscreenCanvas(grid.W, grid.H), g = c.getContext('2d'), img = g.createImageData(grid.W, grid.H), d = img.data;
  let inN = 0, okN = 0, m2 = 0, cropM2 = 0;
  const lim = (drop / SPAN) * 255;
  for (let y = 0; y < grid.H; y++) {
    const lat = y2lat(grid.Y0 + y + 0.5, grid.z), px = (EARTH * Math.cos(lat * RAD)) / (2 ** grid.z * TS), pa = px * px;
    for (let x = 0; x < grid.W; x++) {
      const k = y * grid.W + x;
      if (!mask[k] || !crop[k]) continue;
      inN++; cropM2 += pa;
      if (!A.n[k] || !B.n[k]) continue;
      okN++;
      if (B.sum[k] / B.n[k] - A.sum[k] / A.n[k] >= lim) { m2 += pa; d[k * 4] = 15; d[k * 4 + 1] = 169; d[k * 4 + 2] = 160; d[k * 4 + 3] = 230; }
    }
  }
  g.putImageData(img, 0, 0);
  return { km2: m2 / 1e6, cropKm2: cropM2 / 1e6, coverage: inN ? okN / inN : 0, url: await toUrl(c) };
}
