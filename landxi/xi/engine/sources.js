/* sources.js — LayerItem(F1-CONTRACT §4.1) → MapLibre 소스 정의. 소스 정의는 이 파일 한 곳에서만 만든다.
   z/x/y 순서 차이(GIBS {z}/{y}/{x} · xdworld {z}/{x}/{y})는 계약 템플릿에 이미 반영되어 있다(건드리지 않음).
   pmtiles 프로토콜 등록 · GIBS HLS 날짜 선택(DescribeDomains + 남원 타일 실측)도 여기. */
import { tileUrl, yesterdayUTC } from '../../shared/api-v1.js';

let protocol = null;
/** pmtiles:// 프로토콜을 한 번만 등록한다(4.5.0 사본 · landxi/xi/vendor/pmtiles). */
export const TILE_LOG = [];   // 테스트용 — 자체 래스터 타일 요청(공개 모드 0 단언)
let BLANK = null;
const blank = async () => (BLANK ||= await createImageBitmap(new ImageData(1, 1)));

/* ── 서비스 워커 없는 방패(2차 판정): 첫 방문(컨트롤러 대기)·SW 차단·시크릿 창에서도 외부 타일 5xx/404 가 콘솔 오류가 되지 않게
   외부 호스트(GIBS · V-World xdworld · EOX) 요청을 전용 Worker 의 fetch 로 받는다(Worker 안 fetch 의 실패 상태는 페이지 콘솔에 남지 않는다 · 실측).
   실패는 투명 1×1 + 결손 수(onMiss) — SW 방패(sw.js blank)와 같은 정직 표기. 모드는 xi.js 가 부팅 때 정한다(setExtMode). */
const EXT_HOSTS = /^https:\/\/(gibs\.earthdata\.nasa\.gov|xdworld\.vworld\.kr|tiles\.maps\.eox\.at)\//;
let EXT_MODE = 'sw', EW = null, ESEQ = 0; const EPEND = new Map();
export const EXT_MISS = { n: 0, last: null, onMiss: null };
export function setExtMode(m) { EXT_MODE = m === 'worker' ? 'worker' : 'sw'; return EXT_MODE; }
export const extMode = () => EXT_MODE;
function extWorker() {
  if (EW) return EW;
  const src = `onmessage = async (e) => { const { id, url } = e.data; try { const r = await fetch(url, { mode: 'cors' }); const b = r.ok ? await r.arrayBuffer() : null; postMessage({ id, ok: r.ok, status: r.status, b, ct: r.headers.get('content-type') || '' }, b ? [b] : []); } catch (x) { postMessage({ id, ok: false, status: 0 }); } };`;
  EW = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
  EW.onmessage = (e) => { const f = EPEND.get(e.data.id); if (f) { EPEND.delete(e.data.id); f(e.data); } };
  return EW;
}
const missed = (url, status) => { EXT_MISS.n++; EXT_MISS.last = { host: (/^https:\/\/([^/]+)/.exec(url) || [])[1], status }; EXT_MISS.onMiss?.(EXT_MISS); };
/** 외부 요청(fetch 와 같은 모양의 응답) — SW 모드면 그냥 fetch(방패가 받는다) · worker 모드면 Worker 가 받는다 */
export function extFetch(url, { signal } = {}) {
  if (EXT_MODE !== 'worker' || !EXT_HOSTS.test(url)) return fetch(url, { mode: 'cors', signal });
  return new Promise((res, rej) => {
    const id = ++ESEQ;
    EPEND.set(id, (d) => {
      if (!d.ok) missed(url, d.status);
      const b = d.b || new ArrayBuffer(0);
      res({ ok: d.ok, status: d.status, arrayBuffer: async () => b, blob: async () => new Blob([b], { type: d.ct }), text: async () => new TextDecoder().decode(b) });
    });
    extWorker().postMessage({ id, url });
    signal?.addEventListener('abort', () => { if (EPEND.delete(id)) rej(new DOMException('aborted', 'AbortError')); }, { once: true });
  });
}
export function registerPmtiles() {
  if (protocol || !window.pmtiles || !window.maplibregl) return protocol;
  protocol = new window.pmtiles.Protocol({ metadata: true });
  window.maplibregl.addProtocol('pmtiles', protocol.tile);
  /* 래스터 PMTiles 는 lxpm://<url>/{z}/{x}/{y} 로 — 성긴 타일셋의 빈 칸을 투명 비트맵으로 돌려준다
     (빈 바이트를 MapLibre 가 디코드하다 콘솔 오류를 내지 않게 · E0-S '요청' 1 과 같은 문제). */
  window.maplibregl.addProtocol('lxpm', async (params, ac) => {
    const m = /^lxpm:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)$/.exec(params.url);
    if (!m) return { data: await blank() };
    const [, u, z, x, y] = m;
    TILE_LOG.push(u.split('/').pop() + '/' + z + '/' + x + '/' + y); if (TILE_LOG.length > 5000) TILE_LOG.shift();
    const data = await pmBytes(u, +z, +x, +y, ac.signal);
    if (!data || !data.byteLength) return { data: await blank() };
    try { return { data: await createImageBitmap(new Blob([data])) }; } catch { return { data: await blank() }; }
  });
  /* 외부 위성 타일 중 궤도 밖 no-data 가 검은 픽셀(0,0,0 · 불투명)로 오는 층(GIBS HLS) — lxext://<host>/<path> 로 받아
     검은 no-data 픽셀을 투명으로 바꾼다(2차 판정: 하강 중 HLS 검은 사각 최대 15.6 % 화면). 검은 비율 > 90 % 인 타일은 통째로 투명(sw.js blank 와 같은 처리).
     fetch 는 페이지에서 하므로 서비스 워커 캐시(lx-ext-v2)를 그대로 탄다. 처리 수는 EXT_LOG 에(테스트·결과 문서). */
  window.maplibregl.addProtocol('lxext', async (params, ac) => {
    const url = 'https://' + params.url.slice('lxext://'.length);
    let r;
    try { r = await extFetch(url, { signal: ac.signal }); } catch { return { data: await blank() }; }
    if (!r.ok) return { data: await blank() };
    try { return { data: await clearNoData(await createImageBitmap(await r.blob()), url) }; } catch { return { data: await blank() }; }
  });
  /* lxw://<host>/<path> — SW 없는 창의 외부 타일(Worker fetch · 실패 = 투명 + 결손 수) */
  window.maplibregl.addProtocol('lxw', async (params, ac) => {
    const url = 'https://' + params.url.slice('lxw://'.length);
    let r;
    try { r = await extFetch(url, { signal: ac.signal }); } catch { return { data: await blank() }; }
    if (!r.ok) return { data: await blank() };
    try { return { data: await createImageBitmap(await r.blob()) }; } catch { return { data: await blank() }; }
  });
  return protocol;
}
export const EXT_LOG = { tiles: 0, blanked: 0, cleared: 0, px: 0 };
let CV = null;
async function clearNoData(bmp, url) {
  const w = bmp.width, h = bmp.height;
  CV ||= new OffscreenCanvas(w, h);
  if (CV.width !== w || CV.height !== h) { CV.width = w; CV.height = h; }
  const g = CV.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, w, h); g.drawImage(bmp, 0, 0);
  const im = g.getImageData(0, 0, w, h), a = im.data;
  let nd = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 0 && a[i] <= 6 && a[i + 1] <= 6 && a[i + 2] <= 6) { a[i + 3] = 0; nd++; }
  EXT_LOG.tiles++;
  const n = w * h;
  if (nd > 0.9 * n) { EXT_LOG.blanked++; bmp.close?.(); return blank(); }
  if (!nd) return bmp;
  EXT_LOG.cleared++; EXT_LOG.px += nd;
  g.putImageData(im, 0, 0); bmp.close?.();
  return createImageBitmap(CV);
}
/* 래스터 PMTiles 바이트 캐시(선적재 · 하강 경로 타일을 비행 전에 받아 둔다 — 하강 중 빈 칸 0).
   바이트(압축 webp/jpeg)만 보관 · 디코드는 요청 때. LRU 1,800칸(≈ 40 MB 상한). */
const BYTES = new Map();
const BYTES_MAX = 1800;
function pmBytes(u, z, x, y, signal) {
  const k = u + '|' + z + '|' + x + '|' + y;
  const hit = BYTES.get(k);
  if (hit) { BYTES.delete(k); BYTES.set(k, hit); return hit; }
  const p = pmtilesOf(u).getZxy(z, x, y, signal).then((r) => r?.data || null).catch(() => null);
  BYTES.set(k, p);
  p.then((d) => { if (!d && signal?.aborted) BYTES.delete(k); });
  while (BYTES.size > BYTES_MAX) BYTES.delete(BYTES.keys().next().value);
  return p;
}

/* ── 선적재: 카메라 경로(줌 표본)마다 화면을 덮는 타일을 미리 받는다 ──
   MapLibre 래스터(tileSize 256)는 타일 줌 = round(카메라 줌 + 1). 기울기(pitch)만큼 위쪽을 더 받는다.
   외부 타일(V-World · GIBS)은 fetch → 서비스 워커 캐시(sw.js) · 자체 PMTiles 는 위 바이트 캐시. */
const lon2x = (lng, n) => ((lng + 180) / 360) * n;
const lat2y = (lat, n) => { const s = Math.sin((lat * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
export function tilesFor(cam, tz, { W = innerWidth, H = innerHeight, bounds = null, far = 1 } = {}) {
  const n = 2 ** tz, ts = 256 * 2 ** (cam.zoom + 1 - tz), p = ((cam.pitch || 0) * Math.PI) / 180;
  const cx = lon2x(cam.center[0], n), cy = lat2y(cam.center[1], n);
  const hw = (W / 2 / ts) * (1 + 0.8 * Math.sin(p)) + 1, up = (H / 2 / ts) * (1 + 1.6 * far * Math.sin(p)) + 1, dn = H / 2 / ts + 1;
  let x0 = Math.floor(cx - hw), x1 = Math.floor(cx + hw), y0 = Math.floor(cy - up), y1 = Math.floor(cy + dn);
  if (bounds) { x0 = Math.max(x0, Math.floor(lon2x(bounds[0], n))); x1 = Math.min(x1, Math.floor(lon2x(bounds[2], n))); y0 = Math.max(y0, Math.floor(lat2y(bounds[3], n))); y1 = Math.min(y1, Math.floor(lat2y(bounds[1], n))); }
  const out = [];
  for (let y = Math.max(0, y0); y <= Math.min(n - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(n - 1, x1); x++) out.push([tz, x, y]);
  // 가운데부터(화면 중심이 먼저 채워진다)
  return out.sort((a, b) => Math.hypot(a[1] + 0.5 - cx, a[2] + 0.5 - cy) - Math.hypot(b[1] + 0.5 - cx, b[2] + 0.5 - cy));
}
export const PREWARM_LOG = [];
/**
 * prewarm(jobs, { concurrency }) — jobs = [{ item, params, cam, visible(z)→bool }] 를 차례로.
 * 반환 Promise<{ n, ms, ext, own }> · 이미 받은 타일은 다시 요청하지 않는다(세션 집합).
 */
const WARMED = new Set();
export async function prewarm(jobs, { concurrency = 12, signal } = {}) {
  const t0 = performance.now(); const q = [];
  for (const j of jobs) {
    const it = j.item; if (!it) continue;
    const spec = await sourceSpec(it, j.params || {});
    const tpl = spec.tiles?.[0]; if (!tpl) continue;
    const zMin = spec.minzoom ?? it.minzoom ?? 0, zMax = spec.maxzoom ?? it.maxzoom ?? 19;
    const tz = Math.max(zMin, Math.min(zMax, j.tz ?? Math.round(j.cam.zoom + 1)));
    for (const [z, x, y] of tilesFor(j.cam, tz, { bounds: it.bounds, far: j.far })) {
      const url = tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
      if (WARMED.has(url)) continue; WARMED.add(url); q.push(url);
    }
  }
  let ext = 0, own = 0, i = 0;
  const rec = { n: q.length, ext: 0, own: 0, ms: null, byZ: {} };
  for (const u of q) { const z = (/\/(\d+)\/\d+\/\d+(\.\w+)?$/.exec(u) || [])[1]; rec.byZ[z] = (rec.byZ[z] || 0) + 1; }
  PREWARM_LOG.push(rec);
  const one = async () => {
    while (i < q.length && !signal?.aborted) {
      const url = q[i++];
      const m = /^lxpm:\/\/(.+)\/(\d+)\/(\d+)\/(\d+)$/.exec(url);
      if (m) { own++; await pmBytes(m[1], +m[2], +m[3], +m[4]); }
      else { ext++; try { const r = await extFetch(url.replace(/^lx(ext|w):\/\//, 'https://')); await r.arrayBuffer(); } catch { /* 방패가 투명으로 */ } }
    }
  };
  await Promise.all(Array.from({ length: concurrency }, one));
  Object.assign(rec, { ext, own, ms: Math.round(performance.now() - t0) });
  return rec;
}
/** 같은 URL 의 PMTiles 인스턴스(크롭 · 직접 타일 읽기용). */
export function pmtilesOf(url) {
  registerPmtiles();
  const u = url.replace(/^pmtiles:\/\//, '');
  let p = protocol.get(u);
  if (!p) { p = new window.pmtiles.PMTiles(u); protocol.add(p); }
  return p;
}

/* ── GIBS HLS 날짜: 어제는 처리 지연으로 404 가 난다(2026-09-24 실측) → DescribeDomains 의 마지막 날부터
      남원 z10 타일을 받아 내용이 있는 날(> 20 KB)을 고른다. 결손 날짜는 요청하지 않으므로 콘솔 오류 0. ── */
const HLS_LAYER = 'HLS_S30_Nadir_BRDF_Adjusted_Reflectance';
const HLS_PROBE = [10, 874, 406];   // z, x, y — 남원 시가지 z10 타일
const dayAdd = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
async function hlsDomain() {
  const to = yesterdayUTC(), from = dayAdd(to, -40);
  const url = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/${HLS_LAYER}/default/GoogleMapsCompatible_Level12/all/${from}--${to}.xml`;
  const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 4000);
  try {
    const x = await (await extFetch(url, { signal: ac.signal })).text();
    const doms = [...x.matchAll(/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/P1D|(?<![\/\d])(\d{4}-\d{2}-\d{2})(?![\/\d-])/g)];
    const days = new Set();
    for (const m of doms) {
      if (m[1]) { for (let d = m[1]; d <= m[2]; d = dayAdd(d, 1)) days.add(d); } else if (m[3]) days.add(m[3]);
    }
    return [...days].filter((d) => d >= from && d <= to).sort().reverse();
  } catch { return []; } finally { clearTimeout(t); }
}
const hlsTile = (date, [z, x, y] = HLS_PROBE) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${HLS_LAYER}/default/${date}/GoogleMapsCompatible_Level12/${z}/${y}/${x}.png`;
async function tileBytes(url) { try { const r = await extFetch(url); return r.ok ? (await r.arrayBuffer()).byteLength : 0; } catch { return 0; } }
let hlsMemo = null;
/** { date, dates:[...최근 내용 있는 날], note } — 결손이면 date:null. sessionStorage 로 하루 보관. */
export function pickHls({ want = 1 } = {}) {
  if (hlsMemo && hlsMemo.dates.length >= want) return Promise.resolve(hlsMemo);
  try { const s = JSON.parse(sessionStorage.getItem('lx_hls') || 'null'); if (s && s.day === yesterdayUTC() && s.dates.length >= want) return Promise.resolve((hlsMemo = s)); } catch { /* */ }
  return (async () => {
    const days = await hlsDomain(), dates = [];
    for (const d of days.slice(0, 16)) {
      if (dates.length >= want) break;
      if ((await tileBytes(hlsTile(d))) > 20000) dates.push(d);
    }
    hlsMemo = { day: yesterdayUTC(), date: dates[0] || null, dates, note: dates.length ? `남원 z10 타일 실측으로 고른 날짜 · 최신 게시 ${days[0] || '—'}` : 'GIBS 날짜 목록을 받지 못함' };
    try { sessionStorage.setItem('lx_hls', JSON.stringify(hlsMemo)); } catch { /* */ }
    return hlsMemo;
  })();
}

/** 검은 no-data 를 투명으로 바꿔 받는 외부 층(lxext) */
const NO_DATA_BLACK = new Set(['gibs-hls-s30']);
/** LayerItem → MapLibre 소스 스펙. params 로 외부 템플릿 치환. */
export async function sourceSpec(item, params = {}) {
  const u = await tileUrl(item, params);
  if (item.kind === 'vector') return { type: 'vector', ...u, ...(item.promote_id ? { promoteId: item.promote_id } : {}), attribution: item.attribution || '' };
  if (item.kind === 'terrain') return { type: 'raster-dem', ...u, encoding: 'terrarium', tileSize: 256, attribution: item.attribution || '' };
  const t = u.url && u.url.startsWith('pmtiles://') ? { tiles: ['lxpm://' + u.url.slice('pmtiles://'.length) + '/{z}/{x}/{y}'] } : u;
  if (NO_DATA_BLACK.has(item.id) && t.tiles) t.tiles = t.tiles.map((x) => x.replace(/^https:\/\//, 'lxext://'));
  else if (EXT_MODE === 'worker' && t.tiles) t.tiles = t.tiles.map((x) => (EXT_HOSTS.test(x) ? x.replace(/^https:\/\//, 'lxw://') : x));
  const s = { type: 'raster', ...t, tileSize: 256, attribution: item.attribution || '' };
  if (t.tiles) { s.minzoom = item.minzoom ?? 0; s.maxzoom = item.maxzoom ?? 19; if (item.bounds) s.bounds = item.bounds; }
  return s;
}

/** 봉투 꼬리표가 붙은 출처 칩 문구(칩 = 사람이 읽는 층 이름 · gsd · 시점). */
export function chipText(item, date) {
  if (!item) return '';
  if (item.id === 'gibs-hls-s30') return `HLS 30m · ${date || '날짜 대기'}`;
  if (item.id === 'gibs-viirs-truecolor') return `VIIRS 위성 · ${date || yesterdayUTC()}`;
  if (item.id === 'xdworld-satellite') return 'V-World 위성';
  const pending = item.license === '확인 중' || item.rights_holder === '확인 중' ? ' · 권리 확인 중' : '';
  const g = item.gsd_m;
  if (item.role === 'imagery' && item.source !== 'external' && g) {
    const gs = g >= 1 ? `${g}m` : `${+(g * 100).toFixed(g < 0.1 ? 2 : 0)}cm`;
    return (g >= 0.2 && g < 1 ? `${item.epoch} ${gs} 항공` : `LX 드론 ${gs} ${item.epoch}`) + pending;
  }
  return (item.name?.ko || item.id) + pending;
}

/* ── 외부 래스터 표본 통계(F2-A · 1차 판정 must_fix 4) ──
   HLS 는 하루 궤도 띠라 하강 경로 화면의 대부분이 no-data 일 수 있다 — 조각 띠가 '고장 난 지도'로 읽히지 않게,
   하강 경로 카메라마다 화면 가운데 3×3 타일의 유효 픽셀 비율(= 커버리지)을 실측해 ≥ 70 % 이고 화면 중심이 유효할 때만 켠다.
   VIIRS 어제 영상은 한국 상공 타일의 밝기·구름 비율을 재어 글로브 첫 화면에 '어제 · 구름 n%' 칩으로 밝힌다(의도된 실영상). */
let SCV = null;
async function pixelsOf(url) {
  try {
    const r = await extFetch(url); if (!r.ok) return null;
    const bm = await createImageBitmap(await r.blob());
    SCV ||= new OffscreenCanvas(bm.width, bm.height);
    if (SCV.width !== bm.width || SCV.height !== bm.height) { SCV.width = bm.width; SCV.height = bm.height; }
    const g = SCV.getContext('2d', { willReadFrequently: true });
    g.clearRect(0, 0, bm.width, bm.height); g.drawImage(bm, 0, 0); bm.close?.();
    return g.getImageData(0, 0, SCV.width, SCV.height);
  } catch { return null; }
}
const tplOf = async (item, params) => { const s = await sourceSpec(item, params); return (s.tiles?.[0] || '').replace(/^lx(ext|w):\/\//, 'https://'); };
const fill = (tpl, z, x, y) => tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
/** 한 카메라의 화면 가운데 3×3 타일 유효 비율 · 중심 픽셀 유효 여부 */
export async function hlsCoverage(item, date, cams) {
  const tpl = await tplOf(item, { date });
  const out = [];
  for (const cam of cams) {
    const tz = Math.max(item.minzoom ?? 5, Math.min(item.maxzoom ?? 12, Math.round(cam.zoom + 1)));
    const n = 2 ** tz, cx = lon2x(cam.center[0], n), cy = lat2y(cam.center[1], n);
    const tx = Math.floor(cx), ty = Math.floor(cy);
    let valid = 0, total = 0, center = false;
    await Promise.all([-1, 0, 1].flatMap((dy) => [-1, 0, 1].map(async (dx) => {
      const im = await pixelsOf(fill(tpl, tz, tx + dx, ty + dy));
      if (!im) { total += 65536; return; }
      const a = im.data; let v = 0;
      for (let i = 0; i < a.length; i += 4) if (a[i + 3] > 0 && !(a[i] <= 6 && a[i + 1] <= 6 && a[i + 2] <= 6)) v++;
      valid += v; total += im.width * im.height;
      if (!dx && !dy) { const px = Math.floor((cx - tx) * im.width), py = Math.floor((cy - ty) * im.height), k = (py * im.width + px) * 4; center = a[k + 3] > 0 && !(a[k] <= 6 && a[k + 1] <= 6 && a[k + 2] <= 6); }
    })));
    out.push({ zoom: +cam.zoom.toFixed(2), tz, cov: total ? +(valid / total).toFixed(3) : 0, center });
  }
  const min = out.length ? Math.min(...out.map((o) => o.cov)) : 0;
  return { date, cams: out, min, ok: out.length > 0 && out.every((o) => o.cov >= 0.7 && o.center), at: new Date().toISOString() };
}
/** 지금 뷰포트의 HLS 실측 커버리지(3차 판정 · 공개 도착 뒤 자동 표시 판정) — 화면 32px 격자 점마다 unproject → 그 날 타일 픽셀.
    유효 = 궤도 안(불투명 · 검정 아님) 이고 구름 아님(min(RGB) < 200). 반환 { date, cov(유효/전체), orbit(궤도 안 비율), cloud, center, tiles, ok = cov ≥ .7 && center } */
export async function hlsViewCoverage(item, date, map, { step = 32, maxTiles = 24 } = {}) {
  const tpl = await tplOf(item, { date });
  const W = map.getCanvas().clientWidth, H = map.getCanvas().clientHeight;
  const tz = Math.max(item.minzoom ?? 5, Math.min(item.maxzoom ?? 12, Math.floor(map.getZoom()))), n = 2 ** tz;
  const pts = [];
  for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) { const ll = map.unproject([x, y]); pts.push({ fx: lon2x(ll.lng, n), fy: lat2y(ll.lat, n) }); }
  const c = map.getCenter(); pts.push({ fx: lon2x(c.lng, n), fy: lat2y(c.lat, n), center: true });
  const keys = [...new Set(pts.map((p) => `${Math.floor(p.fx)}/${Math.floor(p.fy)}`))].slice(0, maxTiles);
  const tiles = new Map(await Promise.all(keys.map(async (k) => { const [x, y] = k.split('/').map(Number); return [k, await pixelsOf(fill(tpl, tz, x, y))]; })));
  let ok = 0, orbit = 0, cloud = 0, tot = 0, center = false;
  for (const p of pts) {
    const tx = Math.floor(p.fx), ty = Math.floor(p.fy), im = tiles.get(`${tx}/${ty}`);
    let v = false, o = false, cl = false;
    if (im) {
      const px = Math.min(im.width - 1, Math.floor((p.fx - tx) * im.width)), py = Math.min(im.height - 1, Math.floor((p.fy - ty) * im.height)), k = (py * im.width + px) * 4, a = im.data;
      o = a[k + 3] > 0 && !(a[k] <= 6 && a[k + 1] <= 6 && a[k + 2] <= 6);
      cl = o && Math.min(a[k], a[k + 1], a[k + 2]) >= 200; v = o && !cl;
    }
    if (p.center) { center = v; continue; }
    tot++; if (o) orbit++; if (cl) cloud++; if (v) ok++;
  }
  const cov = tot ? +(ok / tot).toFixed(3) : 0;
  return { date, tz, zoom: +map.getZoom().toFixed(2), cov, orbit: tot ? +(orbit / tot).toFixed(3) : 0, cloud: tot ? +(cloud / tot).toFixed(3) : 0, center, tiles: keys.length, ok: cov >= 0.7 && center };
}
/** VIIRS 어제 · 한국 상공(z4 타일의 [124.5,33,131,38.7] 창) 밝기 평균 · 구름 비율(min(RGB) ≥ 180) */
export async function skyStats(item, date, bounds = [124.5, 33, 131, 38.7], z = 4) {
  const tpl = await tplOf(item, { date });
  const n = 2 ** z, x0 = lon2x(bounds[0], n), x1 = lon2x(bounds[2], n), y0 = lat2y(bounds[3], n), y1 = lat2y(bounds[1], n);
  let sum = 0, cnt = 0, cloud = 0;
  for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
    const im = await pixelsOf(fill(tpl, z, tx, ty)); if (!im) continue;
    const W = im.width, H = im.height, a = im.data;
    const px0 = Math.max(0, Math.floor((x0 - tx) * W)), px1 = Math.min(W, Math.ceil((x1 - tx) * W)), py0 = Math.max(0, Math.floor((y0 - ty) * H)), py1 = Math.min(H, Math.ceil((y1 - ty) * H));
    for (let py = py0; py < py1; py++) for (let px = px0; px < px1; px++) {
      const k = (py * W + px) * 4; if (!a[k + 3]) continue;
      const r = a[k], g = a[k + 1], b = a[k + 2];
      sum += (r + g + b) / 3; cnt++; if (Math.min(r, g, b) >= 180) cloud++;
    }
  }
  return cnt ? { date, mean: +(sum / cnt).toFixed(1), cloud: +((cloud / cnt) * 100).toFixed(0), px: cnt, z } : null;
}
