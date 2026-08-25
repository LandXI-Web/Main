/* wf-thumb.js — 액자 렌더러 (D1: 노드는 카드가 아니라 액자다)
   노드 본체의 70% 이상은 "지금 그 단계가 실제로 보고 있는 픽셀"이어야 한다.
   여기서 그리는 그림은 전부 실제 파일이다:
     · 정사영상 = landxi/assets/tiles/<id>/{z}/{x}/{y}.webp
     · 탐지     = 실제 GeoJSON 좌표를 타일 픽셀 좌표로 투영한 것
   합성 이미지는 하나도 없다. 없으면 무채색으로 "없음"을 쓴다.
*/

import { BASE, C, classColor, ko } from './wf-data.js';

/* ── Web Mercator ─────────────────────────────────────────────────────── */
export const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
export const lat2y = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
export const x2lon = (x, z) => (x / 2 ** z) * 360 - 180;
export const y2lat = (y, z) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};
export const metersPerPx = (lat, z) => (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** z;

/* ── 타일 이미지 캐시 ─────────────────────────────────────────────────── */
const imgCache = new Map();
let tilesFetched = 0;
export const tileCount = () => tilesFetched;
export const isCached = (src) => imgCache.has('c:' + src) || imgCache.has('n:' + src);

// 성긴 타일셋의 빈 칸은 개발 서버가 투명 1×1 PNG 로 돌려준다(200 OK).
// 그것을 "타일이 있다"고 세면 액자가 새까맣게 비면서 목업처럼 보인다. 크기로 걸러 낸다.
const REAL = (im) => !!im && im.naturalWidth >= 32;
export { REAL as realTile };

function tileImage(src, cors = true) {
  const key = (cors ? 'c:' : 'n:') + src;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = new Promise((res) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => { tilesFetched++; res(REAL(im) ? im : null); };
    im.onerror = () => res(cors ? tileImage(src, false) : null);
    im.src = src;
  });
  imgCache.set(key, p);
  return p;
}
export { tileImage };

/* ── 정사영상 크롭 ────────────────────────────────────────────────────────
   캔버스를 정확히 덮을 만큼의 타일만 읽어 붙인다. 반환값은 그 크롭의 지리 범위.
   selective desaturation: 영상은 무채에 가깝게 눌러 두고, 채도는 탐지 폴리곤에만 준다. */
export async function orthoCrop(ctx, imagery, center, z, opt = {}) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const zoom = Math.max(imagery.minzoom, Math.min(z, imagery.maxzoom));
  const cx = lon2x(center[0], zoom) * 256, cy = lat2y(center[1], zoom) * 256;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const tx0 = Math.floor(x0 / 256), ty0 = Math.floor(y0 / 256);
  const tx1 = Math.floor((x0 + W - 1) / 256), ty1 = Math.floor((y0 + H - 1) / 256);

  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const src = BASE + imagery.tiles.replace('{z}', zoom).replace('{x}', tx).replace('{y}', ty);
      jobs.push(tileImage(src).then((im) => ({ im, tx, ty })));
    }
  }
  ctx.save();
  ctx.fillStyle = '#08090B';
  ctx.fillRect(0, 0, W, H);
  ctx.filter = opt.filter ?? 'saturate(0.28) contrast(1.1) brightness(0.92)';
  let hit = 0;
  for (const { im, tx, ty } of await Promise.all(jobs)) {
    if (!im) continue;
    hit++;
    ctx.drawImage(im, tx * 256 - x0, ty * 256 - y0, 256, 256);
  }
  ctx.restore();

  return {
    ok: hit > 0, tiles: hit, zoom, x0, y0,
    west: x2lon(x0 / 256, zoom), north: y2lat(y0 / 256, zoom),
    east: x2lon((x0 + W) / 256, zoom), south: y2lat((y0 + H) / 256, zoom),
    mpp: metersPerPx(center[1], zoom),
  };
}

/* 우리 정사영상이 없는 해안(여수)용 — V-World 위성 타일 크롭. */
export async function satCrop(ctx, tpl, center, z, opt = {}) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const cx = lon2x(center[0], z) * 256, cy = lat2y(center[1], z) * 256;
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const jobs = [];
  for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W - 1) / 256); tx++)
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H - 1) / 256); ty++)
      jobs.push(tileImage(tpl.replace('{z}', z).replace('{x}', tx).replace('{y}', ty)).then((im) => ({ im, tx, ty })));
  ctx.save();
  ctx.fillStyle = '#08090B'; ctx.fillRect(0, 0, W, H);
  ctx.filter = opt.filter ?? 'saturate(0.3) contrast(1.08) brightness(0.9)';
  let hit = 0;
  for (const { im, tx, ty } of await Promise.all(jobs)) { if (!im) continue; hit++; ctx.drawImage(im, tx * 256 - x0, ty * 256 - y0, 256, 256); }
  ctx.restore();
  if (!hit) missing(ctx, '타일 없음 — 오프라인');
  return { ok: hit > 0, tiles: hit, zoom: z, x0, y0,
    west: x2lon(x0 / 256, z), north: y2lat(y0 / 256, z),
    east: x2lon((x0 + W) / 256, z), south: y2lat((y0 + H) / 256, z), mpp: metersPerPx(center[1], z) };
}

/* 정사영상 도엽 밖이면 검은 액자가 아니라 위성 크롭으로 대체하고, 그 사실을 캡션에 쓴다.
   "없는 것을 만들지 않는다"와 "액자 안에는 픽셀이 있어야 한다"를 동시에 지키는 유일한 방법. */
export async function crop(ctx, imagery, satUrl, center, z, opt = {}) {
  if (imagery) {
    const b = imagery.bounds;
    const inside = center[0] >= b[0] && center[0] <= b[2] && center[1] >= b[1] && center[1] <= b[3];
    if (inside) {
      const box = await orthoCrop(ctx, imagery, center, z, opt);
      // 타일이 200 으로 돌아와도 그 시점의 촬영 풋프린트 밖이면 내용이 비어 있다
      // (2025-04 전역 정사영상의 고해상 코어는 10월 것과 범위가 다르다).
      // "타일이 있다"가 아니라 "픽셀이 있다"로 판정한다.
      if (box.tiles > 0 && hasPixels(ctx)) return { ...box, src: imagery.label, ortho: true };
    }
  }
  const box = await satCrop(ctx, satUrl, center, z, opt);
  return { ...box, src: 'V-World 위성(이 시점 고해상 도엽 없음)', ortho: false };
}

function hasPixels(ctx) {
  try {
    const c = ctx.canvas;
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    let sum = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 401) { seen.add(`${d[i] >> 4},${d[i + 1] >> 4},${d[i + 2] >> 4}`); sum += d[i]; n++; }
    return seen.size >= 8 && sum / n >= 30;
  } catch { return true; }   // CORS 로 읽을 수 없으면 그린 것을 믿는다
}

/* ── 결손 표기 — 무채, 점선. 가짜 그림을 그리지 않는다. ─────────────────── */
export function missing(ctx, text) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  ctx.save();
  ctx.fillStyle = '#0B0C0E'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
  ctx.strokeRect(8.5, 8.5, W - 17, H - 17);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,255,255,.42)';
  ctx.font = '400 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, W / 2, H / 2 + 4);
  ctx.restore();
}

/* ── 탐지 폴리곤 ──────────────────────────────────────────────────────────
   supervision 문법 + 우리 규칙: 통과=채도 복원(청록), 탈락=감쇠(삭제 아님). */
export function drawDets(ctx, box, feats, opt = {}) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const px = (lng) => ((lng - box.west) / (box.east - box.west)) * W;
  const py = (lat) => ((lat - box.north) / (box.south - box.north)) * H;
  let drawn = 0, dimmed = 0;
  const path = (geom) => {
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    ctx.beginPath();
    for (const ring of rings) {
      for (let i = 0; i < ring.length; i++) {
        const x = px(ring[i][0]), y = py(ring[i][1]);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    }
  };
  for (const f of feats) {
    const p = f.properties || f;
    const b = p.bb;
    if (b && (b[2] < box.west || b[0] > box.east || b[3] < box.south || b[1] > box.north)) continue;
    const pass = opt.test ? opt.test(p) : true;
    const col = classColor(p.cls);
    path(f.geometry);
    if (pass) {
      drawn++;
      ctx.globalAlpha = opt.fill ?? 0.2; ctx.fillStyle = col; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = opt.lw ?? 1.25; ctx.stroke();
    } else {
      dimmed++;
      ctx.globalAlpha = 0.1; ctx.fillStyle = '#FFFFFF'; ctx.fill();
      ctx.globalAlpha = 0.32; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.75; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  // 최상위 1건에만 코너 브래킷 — "AI가 방금 판단했다"의 표식. 라벨 도배는 하지 않는다.
  if (opt.bracket) {
    const top = feats.filter((f) => (opt.test ? opt.test(f.properties || f) : true))
      .sort((a, b) => (b.properties || b).conf - (a.properties || a).conf)[0];
    if (top) {
      const b = (top.properties || top).bb;
      bracketRect(ctx, px(b[0]) - 3, py(b[3]) - 3, px(b[2]) - px(b[0]) + 6, py(b[1]) - py(b[3]) + 6,
        opt.bracketColor || C.amber, 7);
    }
  }
  return { drawn, dimmed };
}

export function bracketRect(ctx, x, y, w, h, color, len = 8, lw = 1.4) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.beginPath();
  const L = Math.min(len, w / 2, h / 2);
  ctx.moveTo(x, y + L); ctx.lineTo(x, y); ctx.lineTo(x + L, y);
  ctx.moveTo(x + w - L, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + L);
  ctx.moveTo(x + w, y + h - L); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - L, y + h);
  ctx.moveTo(x + L, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - L);
  ctx.stroke(); ctx.restore();
}

/* ── SAHI 슬라이스 격자 — 슬라이스 px·중첩률·GSD 에서 지상 간격을 계산해 긋는다 */
export function drawSlices(ctx, box, { slice, overlap, srcGsd }) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const g = srcGsd || box.mpp;
  const stepPx = (slice * (1 - overlap) * g) / box.mpp;
  const out = { stepM: slice * g * (1 - overlap), cols: 0, rows: 0, stepPx };
  if (!(stepPx > 6)) return out;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.30)'; ctx.lineWidth = 1;
  for (let x = stepPx / 2; x <= W; x += stepPx) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, H); ctx.stroke(); }
  for (let y = stepPx / 2; y <= H; y += stepPx) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(W, Math.round(y) + .5); ctx.stroke(); }
  // 첫 셀만 중첩 마진을 실제 비율로 칠해 "무엇이 겹치는가"를 보여준다.
  const ov = stepPx * (overlap / (1 - overlap));
  ctx.fillStyle = 'rgba(15,169,160,.22)';
  ctx.fillRect(stepPx / 2, 0, ov, H);
  ctx.fillRect(0, stepPx / 2, W, ov);
  ctx.restore();
  out.cols = Math.ceil(W / stepPx); out.rows = Math.ceil(H / stepPx);
  return out;
}

/* 처리 진행 — 슬라이스 셀이 순서대로 "읽힌" 상태를 실제 진행률로 칠한다. */
export function drawSliceProgress(ctx, box, { slice, overlap, srcGsd }, p) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const stepPx = (slice * (1 - overlap) * (srcGsd || box.mpp)) / box.mpp;
  if (!(stepPx > 6)) return;
  const cols = Math.ceil(W / stepPx), rows = Math.ceil(H / stepPx);
  const total = cols * rows, done = Math.floor(total * Math.max(0, Math.min(1, p)));
  ctx.save();
  ctx.fillStyle = 'rgba(15,169,160,.16)';
  for (let i = 0; i < done; i++) {
    const cx = i % cols, cy = (i / cols) | 0;
    ctx.fillRect(cx * stepPx, cy * stepPx, stepPx, stepPx);
  }
  if (done < total) {
    const cx = done % cols, cy = (done / cols) | 0;
    bracketRect(ctx, cx * stepPx, cy * stepPx, stepPx, stepPx, C.amber, 6, 1.2);
  }
  ctx.restore();
}

/* 원본 GSD 를 모르는 자료(위성 크롭)에서는 실제 웹 타일 경계를 긋는다 — 지어내지 않는다. */
export function drawTileGrid(ctx, box) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  const ox = -(box.x0 % 256), oy = -(box.y0 % 256);
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,.34)'; ctx.lineWidth = 1;
  for (let x = ox; x <= W; x += 256) { ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, H); ctx.stroke(); }
  for (let y = oy; y <= H; y += 256) { ctx.beginPath(); ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(W, Math.round(y) + .5); ctx.stroke(); }
  ctx.restore();
  return { cols: Math.ceil(W / 256), rows: Math.ceil(H / 256), stepPx: 256 };
}

/* ── 모델 카드 — 추론 결과가 아니라 모델 자체의 초상. 가짜 성능 숫자 금지. */
export function drawModelCard(ctx, mdl, classes) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  ctx.save();
  ctx.fillStyle = '#0A0B0D'; ctx.fillRect(0, 0, W, H);
  if (!mdl) {
    ctx.restore();
    missing(ctx, '학습 모델 파일 없음');
    return { ok: false };
  }
  // 파일 크기를 세로 막대의 실제 길이로 쓴다 — 장식이 아니라 값이다(최대 249.2MB = best(Road)).
  const frac = Math.min(1, mdl.sizeMB / 249.2);
  ctx.fillStyle = 'rgba(255,255,255,.06)';
  ctx.fillRect(0, H - 4, W, 4);
  ctx.fillStyle = C.teal;
  ctx.fillRect(0, H - 4, W * frac, 4);

  ctx.font = '400 10px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.46)';
  ctx.textAlign = 'left';
  ctx.fillText(mdl.task.toUpperCase() + ' · ' + mdl.trainedAt + ' 학습', 12, 20);

  ctx.font = '400 40px Inter, system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  const numTxt = mdl.sizeMB.toFixed(1);
  ctx.fillText(numTxt, 12, 62);
  const nw = ctx.measureText(numTxt).width;
  ctx.font = '400 11px Inter, system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.46)';
  ctx.fillText('MB · 가중치 파일 크기', 16 + nw, 62);


  // 클래스 스와치 — 이 모델이 무엇을 찾는지 색으로 먼저 말한다.
  let x = 12, y = H - 26;
  ctx.font = '400 10px Inter, system-ui, sans-serif';
  for (const c of mdl.classes.slice(0, 4)) {
    ctx.fillStyle = classColor(c);
    ctx.fillRect(x, y - 7, 7, 7);
    ctx.fillStyle = 'rgba(255,255,255,.72)';
    const t = ko(c);
    ctx.fillText(t, x + 11, y);
    x += 11 + ctx.measureText(t).width + 12;
    if (x > W - 30) break;
  }
  if (mdl.classes.length > 4) {
    ctx.fillStyle = 'rgba(255,255,255,.4)';
    ctx.fillText('+' + (mdl.classes.length - 4), x, y);
  }
  ctx.restore();
  return { ok: true };
}

/* ── 지도 출력 액자 — 실제 통과 검출의 격자 밀도(청록 단일 계열) ────────── */
export function drawTerritory(ctx, cells, box, test, maxObj) {
  const W = ctx.canvas.width / (ctx.__s || 1), H = ctx.canvas.height / (ctx.__s || 1);
  ctx.save();
  ctx.fillStyle = '#08090B'; ctx.fillRect(0, 0, W, H);
  const [w, s, e, n] = box;
  const cw = Math.max(3, (0.005 / (e - w)) * W), ch = Math.max(3, (0.005 / (n - s)) * H);
  let live = 0;
  for (const c of cells) {
    if (test && !test(c)) continue;
    live += c.obj;
    const x = ((c.c[0] - w) / (e - w)) * W;
    const y = H - ((c.c[1] - s) / (n - s)) * H;
    const t = Math.min(1, Math.log(1 + c.obj) / Math.log(1 + (maxObj || 300)));
    ctx.globalAlpha = 0.25 + t * 0.7;
    ctx.fillStyle = C.teal;
    ctx.fillRect(x - cw / 2, y - ch / 2, cw, ch);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  return { live, cells: cells.length };
}
