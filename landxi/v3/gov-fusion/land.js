/* 육지 마스크 바탕 — V-World 위성은 육지(시군구 경계 폴리곤) 안에만, 바다는 단일 바다색.
   gfland://{z}/{x}/{y} : 시군구 PMTiles(z5–11) 조상 타일을 풀어 육지 마스크를 그리고, V-World 타일에 destination-in 으로 씌운다.
   육지가 없는 타일은 V-World 를 부르지 않고 투명으로 끝낸다(먼바다 단색 타일 · 저줌 남색 · 직사각 경계가 생길 자리가 없다).
   처리한 타일은 메모리에 남겨 warm()(카메라 전 미리 받기)과 지도가 같은 결과를 쓴다. */
import { extFetch, registerPmtiles, setExtMode } from '../../xi/engine/sources.js';
import { api } from '../kit/util.js';

const VW = 'https://xdworld.vworld.kr/2d/Satellite/service/{z}/{x}/{y}.jpeg';
const MZ = 11, MINZ = 5;          // 시군구 PMTiles 줌 범위
let PM = null;
const paths = new Map();          // 'z/x/y' → Promise<Path2D|null>
const tiles = new Map();          // 'z/x/y' → Promise<ImageBitmap>
let EMPTY = null;
const empty = async () => (EMPTY ||= await createImageBitmap(new ImageData(1, 1)));

export function landSetup(maskUrl) {
  if (PM) return PM;
  setExtMode('worker');           // 외부 타일은 워커로(실패가 콘솔 오류가 되지 않게 · 키트 무대와 같은 방식)
  PM = new window.pmtiles.PMTiles(maskUrl);
  registerPmtiles()?.add(PM);     // 지도의 시군구 층(pmtiles://)도 같은 인스턴스 · 같은 캐시
  window.maplibregl.addProtocol('gfland', async (params, ac) => {
    const m = /^gfland:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) return { data: await empty() };
    try { return { data: await landTile(+m[1], +m[2], +m[3]) }; } catch { return { data: await empty() }; }
  });
  return PM;
}

/* ── 시군구 MVT → Path2D(타일 좌표) ── */
function ancestorPath(z, x, y) {
  const k = z + '/' + x + '/' + y;
  if (!paths.has(k)) paths.set(k, PM.getZxy(z, x, y).then((r) => (r && r.data ? mvtPath(new Uint8Array(r.data)) : null)).catch(() => { paths.delete(k); return null; }));
  return paths.get(k);
}
function mvtPath(u8) {
  const P = new Pbf(u8); const path = new Path2D(); let n = 0, extent = 4096;
  while (P.pos < P.end) {
    const tag = P.varint(), f = tag >> 3, w = tag & 7;
    if (f === 3 && w === 2) {
      const len = P.varint(), end = P.pos + len;
      const feats = [];
      while (P.pos < end) {
        const t = P.varint(), ff = t >> 3, ww = t & 7;
        if (ff === 2 && ww === 2) { const l = P.varint(); feats.push([P.pos, P.pos + l]); P.pos += l; }
        else if (ff === 5) extent = P.varint();
        else P.skip(ww);
      }
      for (const [s, e] of feats) {
        P.pos = s; let type = 0, g = null;
        while (P.pos < e) {
          const t = P.varint(), ff = t >> 3, ww = t & 7;
          if (ff === 3) type = P.varint();
          else if (ff === 4) { const l = P.varint(); g = [P.pos, P.pos + l]; P.pos += l; }
          else P.skip(ww);
        }
        if (type !== 3 || !g) continue;
        P.pos = g[0]; let x = 0, y = 0, cmd = 0, cnt = 0;
        while (P.pos < g[1]) {
          if (!cnt) { const ci = P.varint(); cmd = ci & 7; cnt = ci >> 3; if (cmd === 7) { path.closePath(); cnt = 0; continue; } }
          cnt--;
          x += zz(P.varint()); y += zz(P.varint());
          if (cmd === 1) path.moveTo(x, y); else path.lineTo(x, y);
          n++;
        }
      }
      P.pos = end;
    } else P.skip(w);
  }
  return n ? { path, extent } : null;
}

/* 이 타일의 육지 마스크(256 · 알파) — 육지가 한 픽셀도 없으면 null · 온전히 육지면 { full:true }
   ① 시군구 경계(z11 해상도 · 해안선이 1–2km 마디로 거칠다)로 바다/육지/해안 타일을 가른다(여유 1km).
   ② 해안 타일 · 타일 z ≥ 11 → V-World 읍면동 경계(해안선 마디 ~10m)로 정밀 마스크(z10 칸 단위로 한 번 받는다).
   ③ 타일 z ≤ 10 → 거친 경계 안에서 영상의 물빛(짙은 청록 · 남색) 덩어리를 걷어 해안선을 영상에 맞춘다. */
const MPX = (z) => 128240 / 2 ** z;               // 위도 35° 부근 m/px(256 타일)
function coarseCanvas(P, z, x, y, ax, ay, s, m) {
  const k = (256 * s) / P.extent, W = 256 + 2 * m;
  const cv = new OffscreenCanvas(W, W); const g = cv.getContext('2d', { willReadFrequently: true });
  g.setTransform(k, 0, 0, k, -(x - ax * s) * 256 + m, -(y - ay * s) * 256 + m);
  g.fillStyle = '#000'; g.fill(P.path);
  return { cv, g, W };
}
function coverage(g, x0, y0, w, hh) {
  const a = g.getImageData(x0, y0, w, hh).data; let any = false, full = true;
  for (let i = 3; i < a.length; i += 4) { if (a[i] > 8) any = true; if (a[i] < 250) full = false; if (any && !full) break; }
  return { any, full };
}
async function maskFor(z, x, y) {
  if (z < MINZ) return null;
  const az = Math.min(z, MZ), d = z - az, s = 2 ** d;
  const ax = x >> d, ay = y >> d;
  const P = await ancestorPath(az, ax, ay);
  if (!P) return null;
  const m = Math.min(256, Math.max(2, Math.round(1000 / MPX(z))));      // 거친 경계의 오차 여유 ≈ 1km
  const C = coarseCanvas(P, z, x, y, ax, ay, s, m);
  const wide = coverage(C.g, 0, 0, C.W, C.W);
  if (!wide.any) return null;                                              // 1km 안에 육지 없음 → 바다
  if (wide.full) return { full: true };                                    // 1km 여유까지 육지 → 내륙
  if (z >= 11) { const det = await detailMask(z, x, y).catch(() => null); if (det !== undefined && det !== false) return det; }
  // 저줌(또는 정밀 경계를 못 받은 칸) — 거친 경계를 조금 넓혀 쓰고, 물빛 걷기는 합성 단계에서
  const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d');
  g.drawImage(C.cv, m, m, 256, 256, 0, 0, 256, 256);
  const dil = Math.max(1, Math.min(12, Math.round(600 / MPX(z))));
  g.filter = `blur(${Math.min(4, dil / 2)}px)`; g.drawImage(cv, 0, 0); g.filter = 'none';
  return { cv, carve: true };
}

/* ── 정밀 해안선: V-World 읍면동 경계(LT_C_ADEMD_INFO) · z10 칸 단위 캐시 · 칸 안 좌표(0..1)로 Path2D ── */
const cells = new Map();
const lon2m = (lon) => (lon + 180) / 360;
const lat2m = (lat) => { const r = (lat * Math.PI) / 180; return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2; };
const m2lon = (mx) => mx * 360 - 180;
const m2lat = (my) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * my))) * 180) / Math.PI;
function cellPath(cx, cy) {
  const k = cx + '/' + cy;
  if (cells.has(k)) return cells.get(k);
  const n = 2 ** 10;
  const b = [m2lon(cx / n), m2lat((cy + 1) / n), m2lon((cx + 1) / n), m2lat(cy / n)];
  const qs = new URLSearchParams({ service: 'data', request: 'GetFeature', data: 'LT_C_ADEMD_INFO', format: 'json', size: '1000', page: '1', geometry: 'true', attribute: 'false', crs: 'EPSG:4326', geomFilter: `BOX(${b.map((v) => v.toFixed(6)).join(',')})` });
  const p = (async () => {
    const j = await api('/proxy/vworld/data?' + qs.toString());
    const fs = j?.response?.result?.featureCollection?.features;
    if (!Array.isArray(fs)) { if (j?.response?.status === 'NOT_FOUND') return { path: null, n: 0 }; throw new Error('vw'); }
    const path = new Path2D(); let cnt = 0;
    const ring = (c) => { c.forEach(([lo, la], i) => { const px = lon2m(lo) * n - cx, py = lat2m(la) * n - cy; if (i) path.lineTo(px, py); else path.moveTo(px, py); cnt++; }); path.closePath(); };
    for (const f of fs) {
      const g = f.geometry; if (!g) continue;
      const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : [];
      for (const poly of polys) for (const r of poly) ring(r);
    }
    return { path: cnt ? path : null, n: cnt };
  })().catch(() => { cells.delete(k); return false; });
  cells.set(k, p);
  return p;
}
async function detailMask(z, x, y) {
  const d = z - 10, s = 2 ** d, cx = x >> d, cy = y >> d;
  const c = await cellPath(cx, cy);
  if (c === false || c === null) return false;                 // 받지 못함 → 거친 경계로
  if (!c.path) return null;                                     // 이 칸에 육지 경계 없음 → 바다
  const k = 256 * s;
  const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d', { willReadFrequently: true });
  g.setTransform(k, 0, 0, k, -(x - cx * s) * 256, -(y - cy * s) * 256);
  g.fillStyle = '#000'; g.fill(c.path, 'nonzero');
  g.lineWidth = 1.2 / k; g.strokeStyle = '#000'; g.stroke(c.path);
  g.setTransform(1, 0, 0, 1, 0, 0);
  const cov = coverage(g, 0, 0, 256, 256);
  if (!cov.any) return null;
  return cov.full ? { full: true } : { cv };
}

/* 물빛 걷기(저줌) — 짙은 청록 · 남색(b > r+20 · b > g+6 · 어두움)이 4×4 칸의 절반 넘게 차면 바다로, 부드럽게 */
function carveWater(g) {
  const im = g.getImageData(0, 0, 256, 256), a = im.data;
  const B = 4, N = 256 / B; const frac = new Float32Array(N * N);
  for (let by = 0; by < N; by++) for (let bx = 0; bx < N; bx++) {
    let w = 0;
    for (let yy = 0; yy < B; yy++) for (let xx = 0; xx < B; xx++) {
      const i = ((by * B + yy) * 256 + bx * B + xx) * 4; const r = a[i], gg = a[i + 1], bb = a[i + 2];
      if (bb > r + 20 && bb > gg + 6 && r + gg + bb < 300) w++;
    }
    frac[by * N + bx] = w / (B * B);
  }
  const sm = new OffscreenCanvas(N, N); const sg = sm.getContext('2d'); const si = sg.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const f = frac[i]; si.data[i * 4 + 3] = f >= 0.5 ? 255 : f >= 0.3 ? Math.round(((f - 0.3) / 0.2) * 255) : 0; }
  sg.putImageData(si, 0, 0);
  g.save(); g.globalCompositeOperation = 'destination-out'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; g.drawImage(sm, 0, 0, 256, 256); g.restore();
}

export function landTile(z, x, y) {
  const key = z + '/' + x + '/' + y;
  if (tiles.has(key)) return tiles.get(key);
  const p = (async () => {
    const m = await maskFor(z, x, y);
    if (!m) return empty();
    const r = await extFetch(VW.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    if (!r.ok) { tiles.delete(key); return empty(); }
    const bmp = await createImageBitmap(await r.blob());
    if (m.full) return bmp;
    const cv = new OffscreenCanvas(256, 256); const g = cv.getContext('2d', { willReadFrequently: !!m.carve });
    g.drawImage(bmp, 0, 0, 256, 256); bmp.close?.();
    if (m.carve) carveWater(g);
    g.globalCompositeOperation = 'destination-in'; g.drawImage(m.cv, 0, 0);
    return createImageBitmap(cv);
  })().catch(() => { tiles.delete(key); return empty(); });
  tiles.set(key, p);
  if (tiles.size > 1600) tiles.delete(tiles.keys().next().value);
  return p;
}

/** 미리 받기 — [[z,x,y]…] 를 같은 파이프라인으로(동시 n) · budget ms 안에 */
export async function warmTiles(list, { n = 10, budget = 2500 } = {}) {
  const q = list.slice(); let done = 0;
  const one = async () => { while (q.length) { const [z, x, y] = q.shift(); await landTile(z, x, y); done++; } };
  await Promise.race([Promise.all(Array.from({ length: n }, one)), new Promise((r) => setTimeout(r, budget))]);
  return { done, total: list.length };
}
/** bbox 를 덮는 타일 목록(z) */
export function tilesIn(b, z) {
  const t = (lon, lat) => { const n = 2 ** z, r = (lat * Math.PI) / 180; return [Math.floor(((lon + 180) / 360) * n), Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n)]; };
  const [x0, y0] = t(b[0], b[3]), [x1, y1] = t(b[2], b[1]);
  const out = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  return out;
}

const zz = (n) => (n >>> 1) ^ -(n & 1);
class Pbf {
  constructor(u8) { this.u8 = u8; this.pos = 0; this.end = u8.length; }
  varint() { let r = 0, s = 0, b; do { b = this.u8[this.pos++]; if (s < 28) r |= (b & 0x7f) << s; else r += (b & 0x7f) * 2 ** s; s += 7; } while (b >= 0x80); return r; }
  skip(w) { if (w === 0) this.varint(); else if (w === 1) this.pos += 8; else if (w === 2) { const l = this.varint(); this.pos += l; } else if (w === 5) this.pos += 4; }
}
