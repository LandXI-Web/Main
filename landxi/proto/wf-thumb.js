// 노드 썸네일 렌더러 — "결과 이미지가 UI 의 1급 시민" (Roboflow 체크 ①).
// 여기서 그리는 그림은 전부 실제 파일이다:
//   · 정사영상 = landxi/assets/tiles/<id>/{z}/{x}/{y}.webp (prepare-assets.py 산출)
//   · 검출 폴리곤 = 실제 GeoJSON 좌표를 타일 픽셀로 투영한 것
// 합성 이미지는 하나도 없다.

import { BASE, classColor, ko } from './wf-data.js';

/* ── Web Mercator 타일 산술 ───────────────────────────────────────────── */
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

const imgCache = new Map();
// cors:true 면 CORS 헤더가 필요하다(캔버스 readback 용). V-World 처럼 헤더가 없는 서버는
// 한 번 실패한 뒤 crossOrigin 없이 다시 시도한다 — 그리기는 되고 readback 만 막힌다.
function tileImage(src, cors = true) {
  const key = (cors ? 'c:' : 'n:') + src;
  if (imgCache.has(key)) return imgCache.get(key);
  const p = new Promise((res) => {
    const im = new Image();
    if (cors) im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = () => res(cors ? tileImage(src, false) : null);
    im.src = src;
  });
  imgCache.set(key, p);
  return p;
}

/* 도엽 중심에서 span×span 타일을 모자이크한다. 반환값은 그 모자이크의 지리 범위. */
export async function mosaic(ctx, imagery, { z, span = 3, center } = {}) {
  const b = imagery.bounds;
  const zoom = Math.min(z ?? imagery.maxzoom - 1, imagery.maxzoom);
  const c = center || [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  const x0 = Math.floor(lon2x(c[0], zoom)) - (span >> 1);
  const y0 = Math.floor(lat2y(c[1], zoom)) - (span >> 1);
  const size = ctx.canvas.width / span;
  const jobs = [];
  for (let i = 0; i < span; i++) {
    for (let j = 0; j < span; j++) {
      const src = BASE + imagery.tiles
        .replace('{z}', zoom).replace('{x}', x0 + i).replace('{y}', y0 + j);
      jobs.push(tileImage(src).then((im) => ({ im, i, j })));
    }
  }
  ctx.fillStyle = '#1C2127';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  let hit = 0;
  for (const { im, i, j } of await Promise.all(jobs)) {
    if (!im) continue;
    hit++;
    ctx.drawImage(im, i * size, j * size, size, size);
  }
  return {
    ok: hit > 0, tiles: hit, zoom,
    west: x2lon(x0, zoom), north: y2lat(y0, zoom),
    east: x2lon(x0 + span, zoom), south: y2lat(y0 + span, zoom),
  };
}

/* V-World 위성 타일 1장 크롭 — 여수 해안처럼 우리 정사영상이 없는 곳의 미니 크롭용. */
export async function satCrop(ctx, urlTpl, lng, lat, zoom = 17) {
  const fx = lon2x(lng, zoom), fy = lat2y(lat, zoom);
  const x = Math.floor(fx), y = Math.floor(fy);
  ctx.fillStyle = '#12202E'; ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const im = await tileImage(urlTpl.replace('{z}', zoom).replace('{x}', x).replace('{y}', y));
  const W = ctx.canvas.width;
  if (im) {
    // 검출 지점이 정중앙에 오도록 2배 확대해 그린다.
    const s = W / 128;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(im, (fx - x) * 256 - 64, (fy - y) * 256 - 64, 128, 128, 0, 0, W, W);
    return { ok: true, s };
  }
  ctx.fillStyle = '#5F6B7C'; ctx.font = '11px "IBM Plex Mono",monospace';
  ctx.textAlign = 'center'; ctx.fillText('타일 없음', W / 2, W / 2);
  return { ok: false };
}

/* ── 검출 폴리곤 그리기 ──────────────────────────────────────────────────
   supervision 의 기본 문법: 외곽 2px + 채움 22%, 클래스 고정색, 라벨은 모노. */
export function drawDets(ctx, box, feats, opt = {}) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const px = (lng) => ((lng - box.west) / (box.east - box.west)) * W;
  const py = (lat) => ((lat - box.north) / (box.south - box.north)) * H;
  const scale = opt.scale ?? 1;
  let drawn = 0, dimmed = 0;

  const path = (geom) => {
    const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
    ctx.beginPath();
    for (const ring of rings) {
      ring.forEach((c, i) => (i ? ctx.lineTo(px(c[0]), py(c[1])) : ctx.moveTo(px(c[0]), py(c[1]))));
      ctx.closePath();
    }
  };

  for (const f of feats) {
    const g = f.geometry; if (!g) continue;
    const ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0];
    let inside = false;
    for (const c of ring) {
      if (c[0] >= box.west && c[0] <= box.east && c[1] <= box.north && c[1] >= box.south) { inside = true; break; }
    }
    if (!inside) continue;
    const pass = opt.test ? opt.test(f) : true;
    const col = classColor(f.cls || 'other');
    path(g);
    if (pass) {
      drawn++;
      ctx.fillStyle = col; ctx.globalAlpha = 0.22; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = col; ctx.lineWidth = 2 * scale; ctx.stroke();
    } else {
      dimmed++;                                     // 필터는 삭제가 아니라 감쇠다 (Palantir P1)
      ctx.globalAlpha = 0.12; ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1 * scale; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // 라벨은 통과한 것 중 신뢰도 상위 몇 개만 — 겹쳐서 못 읽으면 없느니만 못하다.
  if (opt.labels) {
    const top = feats
      .filter((f) => (opt.test ? opt.test(f) : true) && f.conf != null)
      .sort((a, b) => b.conf - a.conf).slice(0, opt.labels);
    ctx.font = `500 ${11 * scale}px "IBM Plex Mono",monospace`;
    for (const f of top) {
      const ring = f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : f.geometry.coordinates[0][0];
      const x = px(ring[0][0]), y = py(ring[0][1]);
      if (x < 0 || x > W || y < 0 || y > H) continue;
      const t = f.conf.toFixed(2);
      const w = ctx.measureText(t).width + 8 * scale;
      ctx.fillStyle = classColor(f.cls || 'other');
      ctx.fillRect(x, y - 15 * scale, w, 14 * scale);
      ctx.fillStyle = '#0E1726';
      ctx.fillText(t, x + 4 * scale, y - 4.5 * scale);
    }
  }
  return { drawn, dimmed };
}

/* SAHI 슬라이스 격자 — 슬라이스 크기(px)와 중첩률에서 실제 지상 간격을 계산해 긋는다. */
export function drawSlices(ctx, box, { slice, overlap, gsd }) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const stepM = slice * gsd * (1 - overlap);                    // 지상 스텝(m)
  const spanM = (box.east - box.west) * 111320 * Math.cos((box.north * Math.PI) / 180);
  const stepPx = (stepM / spanM) * W;
  if (!(stepPx > 3)) return { stepM, cols: 0 };
  ctx.save();
  ctx.strokeStyle = 'rgba(15,169,160,.85)'; ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  for (let x = 0; x <= W; x += stepPx) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 0; y <= H; y += stepPx) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.setLineDash([]);
  // 첫 셀만 중첩 마진을 실제 비율로 칠해 "무엇이 겹치는가"를 보여준다.
  const ov = stepPx * (overlap / (1 - overlap));
  ctx.fillStyle = 'rgba(15,169,160,.20)';
  ctx.fillRect(stepPx, 0, ov, H); ctx.fillRect(0, stepPx, W, ov);
  ctx.restore();
  return { stepM, cols: Math.ceil(W / stepPx) };
}

/* 모델 블록 썸네일 — 추론 결과가 아니라 모델 자체의 초상. 가짜 성능 숫자를 그리지 않는다. */
export function drawModelCard(ctx, model, curve) {
  const W = ctx.canvas.width, H = ctx.canvas.height, u = W / 100;   // 100 등분 단위로 스케일 독립
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#252A31'); bg.addColorStop(1, '#141A21');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'left';

  // 상단 — 태스크와 클래스 수. 실제 메타에서만 온다.
  ctx.font = `600 ${5.6 * u}px "IBM Plex Mono",monospace`;
  ctx.fillStyle = '#EAF0F7';
  ctx.fillText(`${model.task.toUpperCase()}  ${model.classes.length}클래스`, 5 * u, 10 * u);
  ctx.font = `400 ${4.4 * u}px "IBM Plex Mono",monospace`;
  ctx.fillStyle = 'rgba(255,255,255,.46)';
  ctx.fillText(`${model.sizeMB} MB · ${model.trainedAt}`, 5 * u, 16.5 * u);

  // 클래스 고정색 스와치 — 이 블록이 무엇을 찾는지 색으로 먼저 말한다.
  let x = 5 * u;
  for (const c of model.classes.slice(0, 14)) {
    ctx.fillStyle = classColor(c);
    ctx.fillRect(x, 20 * u, 3.4 * u, 3.4 * u);
    x += 4.4 * u;
  }

  // 예시 학습 곡선 — 하단 절반. 반드시 라벨과 함께 그린다.
  const top = 30 * u, bot = H - 8 * u, left = 5 * u, right = W - 5 * u;
  ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) {
    const y = top + ((bot - top) * i) / 2;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }
  const plot = (arr, color, norm) => {
    ctx.beginPath();
    arr.forEach((v, i) => {
      const px = left + ((right - left) * i) / (arr.length - 1);
      const py = top + (bot - top) * (1 - norm(v));
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    });
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.4, 0.8 * u); ctx.stroke();
  };
  plot(curve.map50, '#0FA9A0', (v) => v);
  plot(curve.loss, '#F2622A', (v) => Math.min(1, v / 3));

  ctx.font = `500 ${4 * u}px "IBM Plex Mono",monospace`;
  ctx.fillStyle = '#0FA9A0'; ctx.fillText('mAP50', left, top - 1.6 * u);
  ctx.fillStyle = '#F2622A'; ctx.fillText('loss', left + 17 * u, top - 1.6 * u);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillText('예시 곡선 · 실 학습 로그 없음', right, top - 1.6 * u);
  ctx.textAlign = 'left';
  return { ok: true };
}

/* 지도 출력 블록 썸네일 — 실제 통과 검출을 격자로 집계한 밀도도.
   미리 구운 격자 파일이 아니라 지금 임계값을 통과한 것만 센다. 슬라이더를 끌면 이 그림도 바뀐다. */
export function drawGridMini(ctx, feats, bbox, test) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0B1420'); g.addColorStop(1, '#101C2A');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const [w, s, e, n] = bbox;
  const CELL = 0.012;
  const cells = new Map();
  let live = 0, max = 1;
  for (const f of feats) {
    const p = f.properties || f;
    if (test && !test(p)) continue;
    const c = p.c; if (!c) continue;
    live++;
    const k = Math.floor(c[0] / CELL) + ':' + Math.floor(c[1] / CELL);
    const v = (cells.get(k) || 0) + 1;
    cells.set(k, v); if (v > max) max = v;
  }
  const cw = Math.max(2, (CELL / (e - w)) * W), ch = Math.max(2, (CELL / (n - s)) * H);
  for (const [k, v] of cells) {
    const [ix, iy] = k.split(':').map(Number);
    const x = ((ix * CELL - w) / (e - w)) * W;
    const y = H - ((iy * CELL - s) / (n - s)) * H;
    const t = Math.min(1, Math.log(1 + v) / Math.log(1 + max));
    ctx.fillStyle = `rgba(${Math.round(15 + t * 120)},${Math.round(190 - t * 60)},${Math.round(190 - t * 30)},${0.35 + t * 0.6})`;
    ctx.fillRect(x, y - ch, cw, ch);
  }
  ctx.font = `500 ${Math.min(13, Math.round(W / 26))}px "IBM Plex Mono",monospace`;
  ctx.fillStyle = 'rgba(255,255,255,.68)';
  ctx.textAlign = 'left';
  ctx.fillText(`격자 ${cells.size.toLocaleString()}셀 · 검출 ${live.toLocaleString()}`, W * 0.03, H * 0.92);
  return { live, cells: cells.size };
}

export function label(ctx, text) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const fs = Math.min(13, Math.max(9, Math.round(W / 30)));
  const bh = Math.round(fs * 1.7);
  ctx.font = `500 ${fs}px "IBM Plex Mono",monospace`;
  ctx.textAlign = 'left';
  const w = ctx.measureText(text).width + fs;
  ctx.fillStyle = 'rgba(10,16,26,.76)';
  ctx.fillRect(0, H - bh, w, bh);
  ctx.fillStyle = '#DCE4EE';
  ctx.fillText(text, fs * 0.45, H - bh * 0.38);
}

export const KO = ko;
