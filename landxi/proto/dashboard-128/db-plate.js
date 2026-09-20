// 판(plate) 12.8 — 대한민국 전도 한 판 + 토글 2 + 0.25° 그리드 + 등급 범례 + 셀 콜아웃.
// 조판 마스터: design-canvas/v2/B5-Dashboard.dc.html / B5-Dashboard-Data.dc.html (572×254, y 378–632)
// 근거: design-canvas/v2/NOTES.md §12.8
//
// 판은 위젯이 아니라 B9 백본이 만드는 것의 **증거 자리**다(§12.1 #4).
// 그래서 탐색하지 않는다 — interactive:false, 휠·드래그 없음. 셀 호버와 클릭(→ XI맵)만 산다.
// 셀 등급은 손 값이 아니라 db-data.js 의 bbox ∩ 셀 집계다.
import { EOX } from '../js/sources.js';
import {
  CELL, GRID, PLATE_BOUNDS, cellsFor, gradeOf, legendFor, calloutFor, cellBBox, loadFootprints,
} from './db-data.js';

const TEAL = '#0FA9A0';
const WHITE = '#FFFFFF';
const EMPTY = { type: 'FeatureCollection', features: [] };
export const fc = (features) => ({ type: 'FeatureCollection', features });
export const boxPoly = (b) => ({
  type: 'Polygon',
  coordinates: [[[b[0], b[3]], [b[2], b[3]], [b[2], b[1]], [b[0], b[1]], [b[0], b[3]]]],
});
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (v) => Math.round(v * 100) / 100;

/* ── 그래티큘 — 1° `.3` · 0.25° `.13` (§12.8) ────────────────────────── */
export function graticule(g = GRID) {
  const feats = [];
  const isDeg = (v) => Math.abs(v - Math.round(v)) < 1e-9;
  for (let x = g.w; x <= g.e + 1e-9; x = r2(x + CELL)) {
    feats.push({
      type: 'Feature',
      properties: { d: isDeg(x) ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: [[x, g.s], [x, g.n]] },
    });
  }
  for (let y = g.s; y <= g.n + 1e-9; y = r2(y + CELL)) {
    feats.push({
      type: 'Feature',
      properties: { d: isDeg(y) ? 1 : 0 },
      geometry: { type: 'LineString', coordinates: [[g.w, y], [g.e, y]] },
    });
  }
  return fc(feats);
}

/** 셀 → GeoJSON. 등급 계산에 쓰는 값(ai·data·plan)을 그대로 속성으로 싣는다. */
export function cellFC(cells) {
  return fc(cells.map((c, i) => ({
    type: 'Feature',
    id: i,
    properties: { i, ai: c.ai, data: c.data, plan: c.planned.length ? 1 : 0 },
    geometry: boxPoly(cellBBox(c)),
  })));
}

/* ── 등급 표현식 — 토글은 이 표현식만 갈아 끼운다(레이어 재생성 금지) ── */
export const FILL = {
  ai: {
    color: TEAL,
    opacity: ['case',
      ['>=', ['get', 'ai'], 3], 0.82,
      ['==', ['get', 'ai'], 2], 0.55,
      ['==', ['get', 'ai'], 1], 0.3,
      0],
  },
  data: {
    color: WHITE,
    opacity: ['case',
      ['>=', ['get', 'data'], 4], 0.78,
      ['>=', ['get', 'data'], 2], 0.5,
      ['==', ['get', 'data'], 1], 0.26,
      0],
  },
};
export const LINE = {
  ai: ['case', ['>=', ['get', 'ai'], 1], TEAL, 'rgba(255,255,255,0.45)'],
  data: ['case', ['>=', ['get', 'data'], 1], WHITE, 'rgba(255,255,255,0.45)'],
};

/* ── 판 ──────────────────────────────────────────────────────────────── */
export async function mountPlate(el, opts = {}) {
  const mode0 = opts.mode === 'data' ? 'data' : 'ai';
  const footprints = opts.footprints || await loadFootprints();
  const cells = opts.cells || cellsFor(footprints);

  const map = new maplibregl.Map({
    container: el,
    attributionControl: false,
    interactive: false,          // 판은 계기판이다. 탐색은 XI맵이 한다.
    fadeDuration: 0,
    style: {
      version: 8,
      // 위성만. 라벨·벡터 스타일 없음(§12.8).
      sources: { eox: { type: 'raster', tiles: [EOX], tileSize: 256, minzoom: 0, maxzoom: 14, attribution: '' } },
      layers: [
        { id: 'bg', type: 'background', paint: { 'background-color': '#010102' } },
        {
          id: 'eox',
          type: 'raster',
          source: 'eox',
          // 원판의 사진 처리 그대로 — saturate(.72) contrast(1.04).
          paint: { 'raster-saturation': -0.28, 'raster-contrast': 0.04, 'raster-fade-duration': 0 },
        },
      ],
    },
    bounds: [[PLATE_BOUNDS[0], PLATE_BOUNDS[1]], [PLATE_BOUNDS[2], PLATE_BOUNDS[3]]],
    fitBoundsOptions: { padding: 0, animate: false },
    bearing: 0,
    pitch: 0,
  });
  await new Promise((res) => (map.loaded() ? res() : map.on('load', res)));

  map.addSource('grat', { type: 'geojson', data: graticule() });
  map.addLayer({
    id: 'grat-025',
    type: 'line',
    source: 'grat',
    filter: ['==', ['get', 'd'], 0],
    paint: { 'line-color': 'rgba(255,255,255,0.13)', 'line-width': 1 },
  });
  map.addLayer({
    id: 'grat-1',
    type: 'line',
    source: 'grat',
    filter: ['==', ['get', 'd'], 1],
    paint: { 'line-color': 'rgba(255,255,255,0.3)', 'line-width': 1 },
  });

  map.addSource('cells', { type: 'geojson', data: cellFC(cells) });
  map.addLayer({
    id: 'cells-fill',
    type: 'fill',
    source: 'cells',
    filter: ['==', ['get', 'plan'], 0],
    paint: { 'fill-color': FILL[mode0].color, 'fill-opacity': FILL[mode0].opacity },
  });
  map.addLayer({
    id: 'cells-line',
    type: 'line',
    source: 'cells',
    filter: ['==', ['get', 'plan'], 0],
    paint: { 'line-color': LINE[mode0], 'line-width': 1 },
  });
  // 예정은 점선 고스트(§5) — 채우지 않는다.
  map.addLayer({
    id: 'cells-plan',
    type: 'line',
    source: 'cells',
    filter: ['==', ['get', 'plan'], 1],
    paint: { 'line-color': WHITE, 'line-width': 1, 'line-dasharray': [2, 2] },
  });

  const setMode = (m) => {
    const k = m === 'data' ? 'data' : 'ai';
    map.setPaintProperty('cells-fill', 'fill-color', FILL[k].color);
    map.setPaintProperty('cells-fill', 'fill-opacity', FILL[k].opacity);
    map.setPaintProperty('cells-line', 'line-color', LINE[k]);
    return k;
  };

  return { map, cells, footprints, setMode, project: (ll) => map.project(ll) };
}

/* ══ 판 위 계기 — 토글 · 범례 · 콜아웃 · 셀 히트영역 ══════════════════ */

/** 세그먼트 2 — 라운드 0, 흰 헤어라인. 선택 = 흰 채움·잉크 글자(§12.8). */
export function toggleHTML(mode) {
  const seg = (k, name) => `<button type="button" role="radio" class="pt-seg" data-mode="${k}"`
    + ` aria-checked="${mode === k ? 'true' : 'false'}" tabindex="${mode === k ? '0' : '-1'}">${esc(name)}</button>`;
  return seg('ai', 'AI 분석 결과') + '<i class="pt-gap"></i>' + seg('data', 'AI 학습데이터 구축 현황');
}

/** 범례 — 셀 수는 집계값이다. */
export function legendHTML(cells, mode) {
  const lg = legendFor(cells, mode);
  return `<div class="pl-h">${esc(lg.head)}</div>`
    + lg.rows.map((r) => `<div class="pl-r" data-g="${r.g}"><i class="sw sw--${r.g}"></i>${esc(r.name)} <span class="n">${r.n}셀</span></div>`).join('');
}

/** 콜아웃 244px — 흰 바탕 · 잉크 1px · 라운드 0. */
export function calloutHTML(cell, mode) {
  const c = calloutFor(cell, mode);
  const tag = (t) => (t ? `<i class="tag">${esc(t)}</i>` : '');
  return `<div class="pc-t">${esc(c.place)} <span class="n">${esc(c.coords)}</span></div>`
    + `<div class="pc-k pc-k--${c.headTone}">${c.head}</div>`
    + c.lines.map((l) => `<div class="pc-l n${l.tone === 'mute' ? ' is-mute' : ''}">${l.t}${tag(l.tag)}</div>`).join('');
}

/** 셀 히트영역 — 링크 그 자체다. 클릭하면 XI맵의 같은 범위로 간다. */
export function cellsHTML(cells, project) {
  return cells.map((c, i) => {
    const b = cellBBox(c);
    const a = project([b[0], b[3]]);
    const z = project([b[2], b[1]]);
    return `<a class="pcell" data-cell="${i}" href="ximap.html?bbox=${b.join(',')}"`
      + ` style="left:${a.x.toFixed(2)}px;top:${a.y.toFixed(2)}px;width:${(z.x - a.x).toFixed(2)}px;height:${(z.y - a.y).toFixed(2)}px"`
      + ` aria-label="${esc(calloutFor(c, 'ai').place || '셀')} ${esc(b.join(', '))} — XI맵에서 보기"></a>`;
  }).join('');
}

/**
 * 호버 표식 — 흰 브래킷 4(팔 5) + 셀 중앙 5px 점 + 직각 리더 → 콜아웃 우변.
 * 좌표는 전부 map.project() 로 구한다(판은 움직이지 않으므로 한 번 계산하면 그대로다).
 */
export function markHTML(cell, project, callout) {
  const b = cellBBox(cell);
  const a = project([b[0], b[3]]);
  const z = project([b[2], b[1]]);
  const A = 5;                       // 브래킷 팔
  const O = 3;                       // 셀 모서리에서 바깥으로
  const cx = (a.x + z.x) / 2;
  const cy = (a.y + z.y) / 2;
  const elbow = callout.top + callout.h - 14;
  const bk = [
    [a.x - O, a.y - O, 'tl'], [z.x + O - A, a.y - O, 'tr'],
    [a.x - O, z.y + O - A, 'bl'], [z.x + O - A, z.y + O - A, 'br'],
  ].map(([x, y, k]) => `<i class="pbk pbk--${k}" style="left:${x.toFixed(2)}px;top:${y.toFixed(2)}px"></i>`).join('');
  const svg = `<svg class="plead" width="572" height="254" viewBox="0 0 572 254" aria-hidden="true">`
    + `<polyline points="${cx.toFixed(2)},${cy.toFixed(2)} ${cx.toFixed(2)},${elbow} ${callout.right},${elbow}" fill="none" stroke="#FFFFFF" stroke-width="1"/>`
    + `<rect x="${(cx - 2.5).toFixed(2)}" y="${(cy - 2.5).toFixed(2)}" width="5" height="5" fill="#FFFFFF"/></svg>`;
  return bk + svg;
}

export { EMPTY, GRID, CELL, gradeOf };
