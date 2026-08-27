// 결과 지오메트리 → 판 좌표 투영 (순수 함수, 브라우저·node 공용).
// 크롭(crops.js)은 tools/crops/make_crops.py 가 Web Mercator 타일을 스티칭해 중심 lnglat 기준
// 가로 window_m 미터 창을 640×420 으로 리샘플한 것이다(lib.Render). window_m 은 crops.js 에 없지만
// 규칙이 결정적이다 — 결과 크롭: 앵커 피처 bbox 의 긴 변 × 배율을 clamp(WINDOW_RULE),
// 시계열 크롭(namwon-epoch 90 m · kuksan 80 m): 고정 창. 그래서 결과 GeoJSON(EPSG:4326)을
// 같은 창으로 투영하면 크롭 사진 위 실제 위치에 폴리곤이 앉는다 — 손으로 옮긴 좌표가 아니다.
export const CROP_W = 640;
export const CROP_H = 420;
const Z = 19;
const R = 256 * 2 ** Z;
const D2R = Math.PI / 180;

/** lnglat → z19 픽셀(전역). */
export function merc([lon, lat]) {
  const x = ((lon + 180) / 360) * R;
  const s = Math.sin(lat * D2R);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * R;
  return [x, y];
}
/** z19 픽셀(전역) → lnglat. */
export function unmerc([x, y]) {
  const lon = (x / R) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / R;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return [lon, lat];
}
/** z19 해상도(m/px). */
export const resAt = (lat) => (156543.03392 * Math.cos(lat * D2R)) / 2 ** Z;

/** make_crops.py 의 창 규칙 — 데이터셋별 (배율, 최소 m, 최대 m) 또는 고정 창 m. */
export const WINDOW_RULE = {
  'namwon-farmland-2025': { mult: 2.0, lo: 70, hi: 120 },
  'namwon-greenhouse-2025': { mult: 2.0, lo: 70, hi: 120 },
  'yeosu-marine-2025-aerial': { mult: 8, lo: 20, hi: 70 },
  'yeosu-marine-2026-drone': { mult: 8, lo: 20, hi: 70 },
  'namwon-epoch': 90,
  'kuksan-change': 80,
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** 지오메트리 bbox 의 미터 폭·높이(make_crops.bbox_m 과 같은 식). */
export function bboxM(g) {
  const b = bboxOfGeom(g); const lat0 = (b[1] + b[3]) / 2;
  return [Math.abs((b[2] - b[0]) * 111320 * Math.cos(lat0 * D2R)), Math.abs((b[3] - b[1]) * 111320)];
}
/** 크롭의 앵커 피처 — 대표점(crop.lnglat)이 bbox 안에 드는 것 중 가장 작은 bbox. */
export function anchorFeature(fc, lnglat) {
  let best = null, bestA = Infinity;
  for (const f of fc.features) {
    if (!f.geometry) continue;
    const b = bboxOfGeom(f.geometry);
    if (lnglat[0] < b[0] || lnglat[0] > b[2] || lnglat[1] < b[1] || lnglat[1] > b[3]) continue;
    const a = (b[2] - b[0]) * (b[3] - b[1]);
    if (a < bestA) { bestA = a; best = f; }
  }
  return best;
}
/** 크롭의 가로 창(m). rule 이 숫자면 고정 창, 객체면 앵커 피처에서 계산. */
export function windowM(rule, anchor) {
  if (typeof rule === 'number') return rule;
  if (!rule || !anchor) return CROP_W * 0.2432;                                  // 규칙 없음 → z19 1:1
  const [w, h] = bboxM(anchor.geometry);
  return clamp(Math.max(w, h) * rule.mult, rule.lo, rule.hi);
}

/** 크롭 하나의 투영기: lnglat → 크롭 픽셀(0..640, 0..420). winM = 크롭 가로 창(m). */
export function projector(crop, winM = CROP_W * (crop.gsd || resAt(crop.lnglat[1])), w = CROP_W, h = CROP_H) {
  const c = merc(crop.lnglat);
  const k = (winM / w) / resAt(crop.lnglat[1]);                                  // 크롭 1px 가 z19 몇 px 인가
  const proj = (ll) => { const p = merc(ll); return [(p[0] - c[0]) / k + w / 2, (p[1] - c[1]) / k + h / 2]; };
  const inv = ([px, py]) => unmerc([(px - w / 2) * k + c[0], (py - h / 2) * k + c[1]]);
  const sw = inv([0, h]), ne = inv([w, 0]);
  proj.bounds = [sw[0], sw[1], ne[0], ne[1]];                  // [w, s, e, n]
  proj.k = k;
  return proj;
}

/** GeoJSON 지오메트리의 lnglat bbox. */
export function bboxOfGeom(g) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const eat = (c) => { if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(eat); };
  eat(g.coordinates);
  return b;
}
export const intersects = (a, b) => !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);

/** 크롭 범위와 겹치는 피처만. */
export function featuresIn(fc, bounds) {
  return fc.features.filter((f) => f.geometry && intersects(bboxOfGeom(f.geometry), bounds));
}

/** 폴리곤/멀티폴리곤 → SVG path d (크롭 픽셀). */
export function toPath(g, proj, dp = 1) {
  const ring = (r) => r.map((c, i) => { const [x, y] = proj(c); return (i ? 'L' : 'M') + x.toFixed(dp) + ' ' + y.toFixed(dp); }).join('') + 'Z';
  if (g.type === 'Polygon') return g.coordinates.map(ring).join('');
  if (g.type === 'MultiPolygon') return g.coordinates.map((p) => p.map(ring).join('')).join('');
  return '';
}

/** 피처 픽셀 bbox 의 면적이 작으면 점 표식(5×5) 으로 그린다. */
export function pixelBox(g, proj) {
  const b = bboxOfGeom(g);
  const [x0, y0] = proj([b[0], b[3]]), [x1, y1] = proj([b[2], b[1]]);
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

/**
 * 결과 FeatureCollection 을 크롭 위 SVG 마크업으로. 반환: { svg, n, emd }.
 * n = 판 위에 실제로 선 피처 수, emd = 판 안 최빈 읍면동(결과 속성에 있을 때만).
 */
export function drapeSvg(fc, crop, { rule = null, dot = 5, minPx = 36, maxN = 400 } = {}) {
  const win = windowM(rule, typeof rule === 'object' && rule ? anchorFeature(fc, crop.lnglat) : null);
  const proj = projector(crop, win);
  const fs = featuresIn(fc, proj.bounds).slice(0, maxN);
  const tally = {};
  const parts = fs.map((f) => {
    if (f.properties && f.properties.emd) tally[f.properties.emd] = (tally[f.properties.emd] || 0) + 1;
    const pb = pixelBox(f.geometry, proj);
    if (pb.w * pb.h < minPx) {
      return `<rect x="${(pb.x + pb.w / 2 - dot / 2).toFixed(1)}" y="${(pb.y + pb.h / 2 - dot / 2).toFixed(1)}" width="${dot}" height="${dot}"/>`;
    }
    return `<path d="${toPath(f.geometry, proj)}"/>`;
  });
  const emd = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  return { svg: parts.join(''), n: fs.length, emd: emd ? emd[0] : null, bounds: proj.bounds, winM: win };
}
