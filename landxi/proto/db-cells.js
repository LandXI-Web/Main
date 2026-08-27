// 대한민국 전도 0.25° 그리드 — 셀 = 실제 데이터(results.js · change.js · imagery.js · services.js)의 위치.
// 순수 함수(브라우저·node 공용). 지어내지 않는다: 결과는 camera.center(없으면 bbox 중심), 변화지수는 bounds 중심,
// 정사영상은 bounds 가 겹치는 모든 셀(footprint), 조사 예정은 결과·영상이 없는 real 서비스의 lnglat.
import { merc, unmerc } from './db-geo.js';

export const STEP = 0.25;
/** 판이 담는 범위 — 한반도 남부·제주(결과가 있는 곳)를 넉넉히. */
export const PLATE_BOUNDS = [125.0, 33.0, 130.2, 38.7];

export const cellKey = (x0, y0) => `${x0.toFixed(2)},${y0.toFixed(2)}`;
export const cellOf = (lon, lat) => [Math.floor(lon / STEP) * STEP, Math.floor(lat / STEP) * STEP];
const short = {
  farmland: '농지이용', greenhouse: '비닐하우스', marine: '해양쓰레기', pothole: '도로안전', change: '변화탐지',
};
const regionShort = (s) => (s || '').replace(/^(전북|전남|경북|경남|충북|충남|강원|경기|제주)\s*/, '').replace(/[시군구]$/, '');
const labelShort = (s) => (s || '').split(/\s*[·(]\s*/)[0].replace(/\s*(농경지|드론|항공|전역|정사영상|토지형질).*$/, '').trim();

/**
 * @returns Map<key, cell> — cell = { x0, y0, name, results[], change[], imagery[], planned[] }
 */
export function buildCells({ RESULTS = [], CHANGE = [], IMAGERY = [], SERVICES = [] }) {
  const cells = new Map();
  const get = (lon, lat) => {
    const [x0, y0] = cellOf(lon, lat); const k = cellKey(x0, y0);
    if (!cells.has(k)) cells.set(k, { key: k, x0, y0, names: [], results: [], change: [], imagery: [], planned: [] });
    return cells.get(k);
  };
  for (const r of RESULTS) {
    const c = r.camera && r.camera.center ? r.camera.center : [(r.stats.bbox[0] + r.stats.bbox[2]) / 2, (r.stats.bbox[1] + r.stats.bbox[3]) / 2];
    const cell = get(c[0], c[1]);
    const objTotal = r.stats.objTotal || null;
    cell.results.push({ id: r.id, name: short[r.service] || r.title, sensor: r.sensor, count: r.stats.count, unit: r.unit, objTotal, year: r.year });
    const n = regionShort(r.region); if (n && !cell.names.includes(n)) cell.names.push(n);
  }
  // 변화지수 — 쌍이 4개지만 자산은 하나(같은 bounds). 총 폴리곤 수를 한 항목으로.
  if (CHANGE.length) {
    const b = CHANGE[0].bounds; const cell = get((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
    cell.change.push({ id: 'namwon-change', name: '변화지수', count: CHANGE.reduce((a, c) => a + c.stats.n, 0), unit: '폴리곤', pairs: CHANGE.length, method: '비지도', from: CHANGE[0].fromDate, to: CHANGE[CHANGE.length - 1].toDate });
    if (!cell.names.includes('남원')) cell.names.push('남원');
  }
  for (const i of IMAGERY) {
    const b = i.bounds;
    const [xa, ya] = cellOf(b[0], b[1]); const [xb, yb] = cellOf(b[2] - 1e-9, b[3] - 1e-9);
    for (let x = xa; x <= xb + 1e-9; x += STEP) for (let y = ya; y <= yb + 1e-9; y += STEP) {
      const cell = get(x + STEP / 2, y + STEP / 2);
      cell.imagery.push({ id: i.id, label: i.label, captured: i.captured, gsd: i.gsd, kind: i.kind, city: i.coverage === 'city' });
      const n = labelShort(i.label); if (n && !cell.names.includes(n)) cell.names.push(n);
    }
  }
  for (const s of SERVICES) {
    if (!s.real || (s.results && s.results.length) || !s.lnglat) continue;
    const cell = get(s.lnglat[0], s.lnglat[1]);
    if (cell.results.length || cell.change.length || cell.imagery.length) continue;         // 이미 실자산이 있는 셀은 그대로
    cell.planned.push({ id: s.id, name: s.name });
  }
  for (const c of cells.values()) c.name = c.names[0] || '';
  return cells;
}

/** 셀 등급(결과 모드): 3 = 결과 3건 이상 · 2 · 1 · 'train' = 학습데이터만 · 'plan' = 조사 예정 · null */
export function gradeResult(cell) {
  const n = cell.results.length + cell.change.length;
  if (n >= 3) return 3; if (n === 2) return 2; if (n === 1) return 1;
  if (cell.imagery.length) return 'train';
  if (cell.planned.length) return 'plan';
  return null;
}
/** 셀 등급(학습데이터 모드): 시점 수 4+ / 2–3 / 1 · 'res' = 결과만(영상 미등록) · null */
export function gradeTrain(cell) {
  const n = new Set(cell.imagery.map((i) => i.captured + i.id.replace(/_\d{4}$/, ''))).size;
  if (n >= 4) return 3; if (n >= 2) return 2; if (n === 1) return 1;
  if (cell.results.length || cell.change.length) return 'res';
  return null;
}

/** 판 투영 — bounds 를 w×h 에 맞춘다(MapLibre 카메라와 같은 수식: 세계 = 512·2^z px). */
export function fitProjector(bounds, w, h, pad = 0) {
  const [x0, y0] = merc([bounds[0], bounds[3]]), [x1, y1] = merc([bounds[2], bounds[1]]);   // z19 px
  const s = Math.min((w - pad * 2) / (x1 - x0), (h - pad * 2) / (y1 - y0));                 // 판 px / z19 px
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const proj = (ll) => { const [x, y] = merc(ll); return [(x - cx) * s + w / 2, (y - cy) * s + h / 2]; };
  proj.inv = ([px, py]) => unmerc([(px - w / 2) / s + cx, (py - h / 2) / s + cy]);
  proj.center = unmerc([cx, cy]);
  proj.zoom = Math.log2((s * 256 * 2 ** 19) / 512);                                          // maplibre zoom(세계 512px)
  proj.scale = s;
  return proj;
}

/** 판 안에 그릴 그리드 선 — 0.25° 마다, 1° 는 진하게. */
export function gridLines(proj, w, h) {
  const [lonA, latA] = proj.inv([0, h]), [lonB, latB] = proj.inv([w, 0]);
  const out = [];
  for (let lon = Math.floor(lonA / STEP) * STEP; lon <= lonB; lon += STEP) {
    const [x] = proj([lon, latA]); out.push({ d: 'v', p: x, major: Math.abs(lon - Math.round(lon)) < 1e-9 });
  }
  for (let lat = Math.floor(latA / STEP) * STEP; lat <= latB; lat += STEP) {
    const [, y] = proj([lonA, lat]); out.push({ d: 'h', p: y, major: Math.abs(lat - Math.round(lat)) < 1e-9 });
  }
  return out;
}

/** 셀 사각형(판 px) */
export function cellRect(cell, proj) {
  const [x0, y0] = proj([cell.x0, cell.y0 + STEP]), [x1, y1] = proj([cell.x0 + STEP, cell.y0]);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
export const cellRange = (cell) => ({
  e: `${cell.x0.toFixed(2)}–${(cell.x0 + STEP).toFixed(2)} E`,
  n: `${cell.y0.toFixed(2)}–${(cell.y0 + STEP).toFixed(2)} N`,
});
