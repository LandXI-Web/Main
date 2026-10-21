/* XI맵 전국 결과(원칙 218 · 229 · 233 · 237 · 10-14 XI맵 3차 구조) — 열자마자 서버에 있는 모든 결과가 함께(특정 업무 기본 선택 없음 · 범례 표 없음).
   멀리서 = 서비스 결과 · 시군구 전역 분석(전국 결과 객체를 약 2km 칸으로 센 실제 결과 칸 · GET /ximap/density) + 전국 분석 결과 면(national.js · 농지 전수 · 하천 · 계곡).
   한 번 호출(GET /ximap/board — 서비스 결과 장부 + 시군구 전역 분석)로 시군구 × 서비스 → 찾은 객체 수 · 끝난 시각 · 영상 · 결과 층(가까이에서 객체).
   올리면 — 멀리선 그 시군구, 가까이선 그 읍면동이 떠오르며 여러 업무 숫자(지도 안 말풍선). 누르면 그곳으로 내려가 객체로 펼친다.
   업무 거르기(말풍선 업무 줄 · XI ChatGEO '○○만 보여 줘') = 그 업무 결과만 · '원래대로'. 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { sourceSpec, tilesFor } from '../../xi/engine/sources.js';
import { API, signSet } from '../../shared/api-v1.js';
import { addResultLayers, farPaint, FAR_MIN_Z } from '../../xi/fx/arrive.js';
import { createNational, nationalPromise, NCOLOR, NCLS } from './national.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const NEAR_Z = 9.5;
const CELL_Z = 8.6;                                    // 이보다 멀면 시군구 · 가까우면 읍면동이 떠오른다
/* 업무 이름 — 서버 서비스 이름을 같은 업무로 묶는 것만(새 이름 0) */
export const TASK_OF = { '경작·휴경': '경작지', 경작: '경작지', 건축물: '건물' };
export const taskOf = (n) => TASK_OF[n] || n;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/* 서비스 색 — 화면 색일 뿐(자료 아님). 이름이 표에 없으면 남는 색을 차례로 */
const NAMED = { '경작·휴경': '#2E9E5B', 비닐하우스: '#F59F00', 건축물: '#3182F6', 주차장: '#8B5CF6', 곤포사일리지: '#B07A3A', 해양쓰레기: '#0FA9A0', 토지피복: '#5C8DA8' };
const SPARE = ['#E8590C', '#D6336C', '#1098AD', '#5C7CFA', '#74B816', '#AE3EC9'];
/* 객체(서비스 결과 조각)는 칸 지도가 걷히는 9.5 부터 10 까지 서서히 진해진다(원칙 267 — 멀리서도 객체 · 전에는 10 ~ 11.4) */
const FADE = { o0: 9.5, o1: 10 };
const FS_HOVER = ['boolean', ['feature-state', 'hover'], false];

/* 결과 지도 조각 — 서버가 조각 하나를 한 요청으로(GET /tiles/mvt/{set}/{z}/{x}/{y}.pbf?v=판) 내준다. 판 = 결과 파일 지문(board 가 줌) —
   파일이 바뀌면 주소가 바뀌어 옛 조각을 보이지 않고, 같으면 브라우저가 보관해 다시 올 때 바로 그린다(impl-20 ximap-speed).
   판이 없는 묶음은 예전처럼 PMTiles. 그 자리 고치기는 조각을 바꾸지 않는다(고친 자리 층 = /ximap/edits). */
async function objSpec(L) {
  if (!L.v || !L.set || L.source !== 'pmtiles') return sourceSpec({ ...L, kind: 'vector' });
  let tpl = `${API.base}/tiles/mvt/${L.set}/{z}/{x}/{y}.pbf?v=${L.v}`;
  if (L.signed) {
    const u = new URL(await signSet(L.set));
    tpl = `${u.origin}/tiles/mvt/${L.set}/{z}/{x}/{y}.pbf?v=${L.v}&exp=${u.searchParams.get('exp')}&sig=${u.searchParams.get('sig')}`;
  }
  return { type: 'vector', tiles: [tpl], minzoom: Math.min(L.minzoom ?? 10, FAR_MIN_Z), maxzoom: L.maxzoom ?? 17, ...(L.bounds ? { bounds: L.bounds } : {}),
    ...(L.promote_id ? { promoteId: L.promote_id } : {}), attribution: L.attribution || '' };
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`;
const mix = (c, w, t) => { const [r, g, b] = hex(c); return `rgba(${[r, g, b].map((v) => Math.round(v + (255 - v) * t)).join(',')},${w})`; };

/** 시작하자마자 부른다(관문 · 지도와 함께) — 한 번 호출 */
export const boardPromise = (on) => (on ? api('/ximap/board').catch((e) => ({ error: e })) : null);
/** 전국 결과 자산 진행(판 번호 포함) — 첫 화면과 함께 출발 */
export { nationalPromise };

export function createBoard({ map, host, h, regionOf, onSets, onLoad, onFly, sgg, regionRows, onRegion, onCell, onMiss }) {
  const B = { data: null, color: {}, off: new Set(), offCls: new Set(), loaded: new Map(), sgg: new Map(), svcIdx: new Map(), task: null };   // offCls = 끈 클래스(체크박스 · 10-15)
  const NAT = createNational({ map });
  const tip = h('div.xb-tipcard', { hidden: true, role: 'status', 'aria-live': 'polite' });
  host.append(tip);

  function colors(services) {
    let k = 0;
    for (const s of services) B.color[s.id] = NAMED[s.name] || SPARE[k++ % SPARE.length];
    services.forEach((s, i) => B.svcIdx.set(s.id, i));
  }
  const val = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;

  /* ── 객체 — 밀도와 같은 서비스 색 · 줌에 따라 서서히 진해짐 ── */
  function objectPaint(ids, c, landcover) {
    const set = (id, k, v) => { if (map.getLayer(id)) map.setPaintProperty(id, k, v); };
    // 멀리서도 보이게(원칙 267) — 공용 그리기 규칙(arrive.js farPaint) · 색은 밀도와 같은 서비스 색 · 칸 지도(줌 9.6 까지)에서 객체로 바로 넘어온다
    // 가까이(줌 14~)는 원래 모양: 토지피복은 분류마다 진하기만 다르게(넓은 경작지 면이 지도를 덮지 않게)
    const base = landcover ? ['match', ['get', 'cls'], '건물', 0.42, '비닐하우스', 0.42, '주차장', 0.3, 0.09] : 0.34;
    const lo = landcover ? ['match', ['get', 'cls'], '경작지', 0.22, 0.85] : 0.95;
    const P = farPaint(landcover ? 'landcover' : 'result', { color: c, haloColor: rgba(c, 0.28), fade: [FADE.o0, FADE.o1],
      near: { fill: [15, ['case', FS_HOVER, 0.5, base], 17, ['case', FS_HOVER, 0.5, ['*', 0.6, base]]], lineOp: [14, lo, 16, ['*', 0.85, lo]], haloOp: [14, 0.9, 15, 0.6] } });
    for (const id of ids) {
      if (id.endsWith('-fill')) {
        set(id, 'fill-color', c);
        set(id, 'fill-opacity', P.fill['fill-opacity']);
      } else if (id.endsWith('-halo')) {
        for (const [k, v] of Object.entries(P.halo)) set(id, k, v);
      } else if (id.endsWith('-pt')) {
        set(id, 'circle-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0 - 1, 0, FADE.o1, 1]);
        set(id, 'circle-stroke-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0 - 1, 0, FADE.o1, 1]);
      } else {
        set(id, 'line-color', c);
        set(id, 'line-width', P.line['line-width']);
        set(id, 'line-opacity', P.line['line-opacity']);
      }
    }
  }
  /* 가까이 — 화면 안 시군구의 결과 층(그 시군구 · 서비스 지금 결과 하나) · 객체가 진해지기 전에 미리 불러 둔다 */
  let nearT = 0;
  async function near(at, to) {
    if (!B.data) return;
    const z = map.getZoom();
    if (z < NEAR_Z && !at) return;
    // at = 날아갈 자리(누르면 날아감 — 내려앉을 자리의 결과 층을 출발 전에 불러 둔다 · 도착했을 때 빈 지도가 보이지 않게)
    // at · to = 내려앉을 자리와 줌 — 그때 화면이 덮을 범위(가장자리 시군구 결과까지 · 내려앉은 뒤 늦게 붙지 않게)
    const c = map.getCanvas(), deg = (px) => (px / (512 * 2 ** (to ?? map.getZoom()))) * 360;
    const dx = deg(c.clientWidth / 2), dy = at ? deg(c.clientHeight / 2) * Math.cos((at.lat * Math.PI) / 180) : 0;
    const b = map.getBounds(), vb = at ? [at.lng - dx, at.lat - dy, at.lng + dx, at.lat + dy] : [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], mc = at || map.getCenter();
    // 화면 안 시군구 중 화면 가운데에 가까운 넷(먼저 보는 곳부터)
    const box = (r) => B.sgg.get(r.sgg_cd)?.bbox || r.bbox;
    const dist = (x) => Math.hypot(Math.max(x[0] - mc.lng, 0, mc.lng - x[2]), Math.max(x[1] - mc.lat, 0, mc.lat - x[3]));
    const inView = B.data.regions.filter((r) => { const x = box(r); return x && !(x[2] < vb[0] || x[0] > vb[2] || x[3] < vb[1] || x[1] > vb[3]); })
      .sort((p, q) => dist(box(p)) - dist(box(q))).slice(0, 4);
    let added = false;
    // 서명 · 주소를 한꺼번에(차례로 기다리지 않게)
    const todo = inView.flatMap((r) => r.items.map((it) => ({ r, it, id: 'xb-r-' + String(it.layer.id || it.layer.set).replace(/[^\w-]/g, '_') }))).filter((x) => !B.loaded.has(x.id));
    const specs = await Promise.all(todo.map((x) => objSpec(x.it.layer).catch(() => null)));
    for (let k = 0; k < todo.length; k++) {
      const { r, it, id } = todo[k], L = it.layer, spec = specs[k];
      if (!spec || B.loaded.has(id) || map.getSource(id)) continue;
      map.addSource(id, spec);
      const c = B.color[it.svc] || '#0FA9A0', lc = it.style === 'landcover';
      const ids = addResultLayers(map, id, id, { kind: lc ? 'landcover' : 'result', sourceLayer: L.layer, visible: false });
      map.addLayer({ id: id + '-pt', type: 'circle', source: id, 'source-layer': L.layer, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' },
        paint: { 'circle-color': c, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } }, 'slot-result');
      ids.push(id + '-pt');
      objectPaint(ids, c, lc);
      B.loaded.set(id, { id, sid: id, ids, set: L.set, svc: it.svc, sgg: r.sgg_cd, region: r.name, name: { ko: `${r.name} ${it.name}` }, item: it, tpl: spec.tiles?.[0] || null, bounds: L.bounds });
      added = true;
    }
    if (added) syncSets();
  }
  /* 날아가기 전 미리 부르기 — 내려앉을 화면(줌 to)을 덮는 결과 조각을 지금 받아 둔다(브라우저 보관 → 지도가 같은 주소를 부르면 바로).
     켜진 서비스 · 그 자리에 걸치는 묶음만 · 판 번호 주소(tiles)인 것만 */
  const WARM = new Set();
  function warm(at, to) {
    const tz = Math.floor(to), cam = { center: [at.lng, at.lat], zoom: to }, c = map.getCanvas();
    for (const x of B.loaded.values()) {
      if (!x.tpl || B.off.has(x.svc)) continue;
      const mz = x.item?.layer?.minzoom ?? 10, Mz = x.item?.layer?.maxzoom ?? 17;
      const z = Math.max(mz, Math.min(Mz, tz));
      for (const [zz, tx, ty] of tilesFor(cam, z, { W: c.clientWidth, H: c.clientHeight, bounds: x.bounds })) {
        const u = x.tpl.replace('{z}', zz).replace('{x}', tx).replace('{y}', ty);
        if (WARM.has(u)) continue;
        WARM.add(u);
        fetch(u, { credentials: 'same-origin', priority: 'high' }).then((r) => r.arrayBuffer()).catch(() => {});
      }
    }
  }
  function syncSets() { onSets([...B.loaded.values()].map((x) => ({ ...x, off: B.off.has(x.svc) }))); }

  /* ── 멀리서 보이는 서비스 결과 칸 — 전국 결과 객체를 약 2km 칸으로 센 실제 칸(칸 합 = 결과 수 · GET /ximap/density) ──
     시군구 줌(8.6~9.5)에서 옅어지고 가까이는 객체가 맡는다. 빛 · 흐림 없이 결과가 있는 칸만 그 서비스 색으로 */
  const gridFilter = () => (B.task ? ['==', ['get', 'k'], B.task] : B.offCls.size ? ['!', ['in', ['get', 'k'], ['literal', [...B.offCls]]]] : null);
  async function grid() {
    const d = await api('/ximap/density?g=0').catch(() => null);
    if (!d?.cells?.length || map.getSource('xb-grid')) return;
    const g = d.g, fs = [], c = d.cells;
    for (let i = 0; i + 3 < c.length; i += 4) {
      const st = d.sets[c[i + 2]]; if (!st) continue;
      const x0 = c[i] * g, y0 = c[i + 1] * g;
      fs.push({ type: 'Feature', properties: { k: taskOf(st.name), svc: st.svc, n: c[i + 3], lc: st.svc === 'landcover' ? 1 : 0 },
        geometry: { type: 'Polygon', coordinates: [[[x0, y0], [x0 + g, y0], [x0 + g, y0 + g], [x0, y0 + g], [x0, y0]]] } });
    }
    map.addSource('xb-grid', { type: 'geojson', data: { type: 'FeatureCollection', features: fs }, maxzoom: 9 });
    const col = ['match', ['get', 'svc'], ...Object.entries(B.color).flat(), '#5C7CFA'];
    map.addLayer({ id: 'xb-grid', type: 'fill', source: 'xb-grid', maxzoom: 9.6, ...(gridFilter() ? { filter: gridFilter() } : {}), layout: { visibility: B.hidden || B.tint === false ? 'none' : 'visible' },
      paint: { 'fill-color': col, 'fill-antialias': false,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, ['case', ['==', ['get', 'lc'], 1], 0.35, 0.85], 7.5, ['case', ['==', ['get', 'lc'], 1], 0.3, 0.75], 8.6, ['case', ['==', ['get', 'lc'], 1], 0.12, 0.35], 9.5, 0] } },
    map.getLayer('slot-result') ? 'slot-result' : undefined);
  }

  /* ── 시군구 경계(떠오르기 · 누르기) — 지도 경계 geojson(지역 고정값 없음) ── */
  const NONE = ['==', ['get', 'code'], '__'];
  const NOCELL = ['==', ['get', 'cd'], '__'];
  function sggLayers() {
    const B0 = map.getLayer('slot-reference') ? 'slot-reference' : undefined;
    if (sgg?.features?.length && !map.getSource('xb-sg')) {
      map.addSource('xb-sg', { type: 'geojson', data: sgg });
      map.addLayer({ id: 'xb-sg-veil', type: 'fill', source: 'xb-sg', maxzoom: CELL_Z, filter: NONE, paint: { 'fill-color': '#0E1622', 'fill-opacity': 0.38 } }, B0);
      map.addLayer({ id: 'xb-sg-hit', type: 'fill', source: 'xb-sg', maxzoom: CELL_Z, paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, B0);
      map.addLayer({ id: 'xb-sg-hot-sh', type: 'line', source: 'xb-sg', maxzoom: CELL_Z, filter: NONE, paint: { 'line-color': '#000', 'line-opacity': 0.35, 'line-width': 10, 'line-blur': 8, 'line-translate': [4, 7] } }, B0);
      map.addLayer({ id: 'xb-sg-hot-f', type: 'fill', source: 'xb-sg', maxzoom: CELL_Z, filter: NONE, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.14 } }, B0);
      map.addLayer({ id: 'xb-sg-hot-l', type: 'line', source: 'xb-sg', maxzoom: CELL_Z, filter: NONE, paint: { 'line-color': '#FFFFFF', 'line-width': 2.4, 'line-opacity': 0.95 } }, B0);
    }
    // 읍면동 칸(전국 분석 칸) 떠오르기 — 자산마다 같은 모양 한 벌
    for (const a of NAT.assets) {
      const s = NAT.src(a);
      if (!map.getSource(s) || map.getLayer(`xb-cell-${a}-f`)) continue;
      map.addLayer({ id: `xb-cell-${a}-f`, type: 'fill', source: s, 'source-layer': 'cells', filter: NOCELL, paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.16 } }, B0);
      map.addLayer({ id: `xb-cell-${a}-l`, type: 'line', source: s, 'source-layer': 'cells', filter: NOCELL, paint: { 'line-color': '#FFFFFF', 'line-width': 2.2, 'line-opacity': 0.95 } }, B0);
    }
  }
  let HOT = null;
  function setHot(x) {                                // x = {kind:'sg', code} | {kind:'cell', cd} | null
    const key = x ? x.kind + (x.code || x.cd) : null;
    if (key === HOT) return; HOT = key;
    const sg = x?.kind === 'sg' ? ['==', ['get', 'code'], x.code] : NONE;
    for (const id of ['xb-sg-hot-sh', 'xb-sg-hot-f', 'xb-sg-hot-l']) if (map.getLayer(id)) map.setFilter(id, sg);
    if (map.getLayer('xb-sg-veil')) map.setFilter('xb-sg-veil', x?.kind === 'sg' ? ['!=', ['get', 'code'], x.code] : NONE);
    const cf = x?.kind === 'cell' ? ['==', ['get', 'cd'], x.cd] : NOCELL;
    for (const a of NAT.assets) for (const id of [`xb-cell-${a}-f`, `xb-cell-${a}-l`]) if (map.getLayer(id)) map.setFilter(id, cf);
  }

  /* ── 올리면 그 자리 말풍선 · 누르면 그 자리로 ── 숫자 = 서비스 결과 장부 + 전국 분석 진행 장부(지어낸 숫자 0) */
  const UNIT = { 경작지: '곳', 비닐하우스: '동', 건물: '동', 주차장: '곳', 곤포사일리지: '개', 토지피복: '개', '국토 변화': '곳', 해양쓰레기: '개' };
  const baseColorOf = (k) => NCOLOR[k] || Object.entries(NAMED).find(([n]) => taskOf(n) === k)?.[1] || '#5C7CFA';
  let userColor = null;                                                                   // 사람이 바꾼 클래스 색(색 바꾸기 · 원칙 264) — 말풍선 · 업무 줄 점도 같은 색
  const colorOf = (k) => userColor?.(k) || baseColorOf(k);
  function rowEls(rows) {
    return h('ul.xb-tc-rows', {}, ...rows.map((r) => h('li', {}, h('i', { style: { background: colorOf(r.k) } }), h('span', { text: r.name || r.k }), h('b', { text: `${nf(r.n)}${r.unit || UNIT[r.k] || '개'}` }))));
  }
  function hideTip() { tip.hidden = true; }
  function placeTip(pt) {
    const W = host.clientWidth, w = tip.offsetWidth, hh = tip.offsetHeight;
    const x = pt.x + 18 + w > W - 96 ? pt.x - 18 - w : pt.x + 18, y = Math.max(8, Math.min(host.clientHeight - hh - 8, pt.y - hh / 2));
    tip.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
  }
  function tipCell(pt, p) {
    const rows = NAT.cellRows(p).map((r) => ({ k: r.c, n: r.n, unit: r.unit }));
    tip.replaceChildren(...[h('p.xb-tc-k', {}, h('b', { text: p.name || '' }), h('small', { text: p.sgg || '' })),
      rows.length ? rowEls(rows) : h('p.xb-tc-p', { text: '분석 예정' })]);
    tip.dataset.done = p.done ? '1' : '0';
    tip.hidden = false; placeTip(pt);
  }
  function tipRegion(pt, f) {
    const { rows, wait } = regionRows(f.properties.code);
    tip.replaceChildren(...[h('p.xb-tc-k', {}, h('b', { text: f.properties.name })),
      rows.length ? rowEls(rows) : null, wait ? h('p.xb-tc-p', { text: '불러오는 중' }) : !rows.length ? h('p.xb-tc-p', { text: '분석 예정' }) : null].filter(Boolean));
    tip.dataset.done = rows.length ? '1' : '0';
    tip.hidden = false; placeTip(pt);
  }
  function region(pt) {
    if (!map.getLayer('xb-sg-hit') || map.getZoom() >= CELL_Z) return null;
    return map.queryRenderedFeatures([pt.x, pt.y], { layers: ['xb-sg-hit'] })[0] || null;
  }
  const cellAt = (pt) => (map.getZoom() >= CELL_Z ? NAT.at(pt) : null);
  let raf = 0, lastPt = null;
  const busy = () => B.hidden || !B.data || (B.isBusy && B.isBusy());
  function hover(pt) {
    if (busy() || map.isMoving()) { hideTip(); setHot(null); return; }
    const c = cellAt(pt);
    if (c) { setHot({ kind: 'cell', cd: c.cd }); map.getCanvas().style.cursor = 'pointer'; tipCell(pt, c); return; }
    const f = region(pt);
    if (f) { setHot({ kind: 'sg', code: f.properties.code }); map.getCanvas().style.cursor = 'pointer'; tipRegion(pt, f); return; }
    setHot(null); hideTip();
    if (map.getZoom() < NEAR_Z) map.getCanvas().style.cursor = '';
  }
  function onMove(e) {
    if (e.originalEvent && e.originalEvent.target !== map.getCanvas()) { hideTip(); setHot(null); return; }   // 말풍선 · 칸 위에서는 지도 말풍선을 띄우지 않는다
    lastPt = e.point;
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; hover(lastPt); });
  }
  function onClick(e) {
    if (busy() || map.getZoom() >= NEAR_Z + 1 || (e.originalEvent && e.originalEvent.target !== map.getCanvas())) return;
    const c = cellAt(e.point);
    const f = c ? null : region(e.point);
    if (!c && !f) { onMiss?.(); return; }
    hideTip(); setHot(null);
    if (f) { onRegion?.(f.properties.code); return; }
    const z = map.getZoom(), to = Math.min(12.5, Math.max(z + 3, 11.6));   // 결과 면과 객체가 함께 보이는 줌에 내려앉는다
    onFly?.();
    NAT.warm(e.lngLat, to);
    near(e.lngLat, to).then(() => warm(e.lngLat, to)).catch(() => {});
    const land = () => onCell?.(c, e.lngLat);
    if (RM()) { map.jumpTo({ center: e.lngLat, zoom: to }); land(); }
    else { map.flyTo({ center: e.lngLat, zoom: to, speed: 1.1, curve: 1.42, essential: false }); map.once('moveend', land); }
  }

  /* ── 업무 거르기 — 그 업무 결과만(서비스 결과 · 시군구 전역 분석 · 전국 분석) · null = 원래대로 ── */
  function setTask(k) {
    B.task = k || null;
    // 꺼지는 서비스 = 업무 거르기에 안 맞는 것 + 그 서비스의 업무(클래스)를 체크박스로 끈 것(토지피복처럼 여러 클래스인 서비스는 층 거르기가 맡는다)
    B.off = new Set((B.data?.services || []).filter((s) => (B.task && taskOf(s.name) !== B.task) || B.offCls.has(taskOf(s.name))).map((s) => s.id));
    syncSets();
    if (map.getLayer('xb-grid')) map.setFilter('xb-grid', gridFilter());
    NAT.setTask(B.task);
    hideTip();
  }
  /** 끈 클래스(체크박스) — 서비스 결과 · 전국 결과 모두 */
  function setOffCls(list) { B.offCls = new Set(list || []); NAT.setOff(list || []); setTask(B.task); }
  /** 지금 지도에 결과가 있는 업무 이름(서버 서비스 + 전국 분석 분류) — 말로 거르기 · 말풍선 */
  function tasks() {
    const t = new Set((B.data?.services || []).map((s) => taskOf(s.name)));
    for (const a of NAT.assets) for (const c of NCLS[a] || []) t.add(c);
    return [...t];
  }

  async function load(p, np) {
    const [j] = await Promise.all([p, NAT.load(np || nationalPromise(true)).then(() => { B.natAt = Math.round(performance.now()); }).catch(() => null)]);
    if (!j || j.error) throw j?.error || new Error('board');
    B.data = j;
    for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    colors(j.services);
    sggLayers();
    grid();
    map.on('moveend', () => { clearTimeout(nearT); nearT = setTimeout(near, 120); });
    map.on('movestart', hideTip);
    map.on('mousemove', onMove);
    map.on('mouseout', () => { hideTip(); setHot(null); });
    map.getCanvas().addEventListener('mouseleave', () => { hideTip(); setHot(null); map.getCanvas().style.cursor = ''; });
    map.on('click', onClick);
    near();
    onLoad?.(j);
    return j;
  }
  async function reload() {
    const j = await api('/ximap/board?fresh=1').catch(() => null);
    if (!j?.regions) return;
    B.data = j; for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    // 결과 파일이 다시 구워졌으면(판이 바뀜) 이미 그린 층의 조각 주소를 새 판으로 — 옛 조각이 보관에서 나오지 않게
    for (const r of j.regions) for (const it of r.items) {
      const x = B.loaded.get('xb-r-' + String(it.layer.id || it.layer.set).replace(/[^\w-]/g, '_'));
      if (!x?.tpl || !it.layer.v || x.tpl.includes('v=' + it.layer.v)) continue;
      objSpec(it.layer).then((sp) => { if (sp.tiles && map.getSource(x.sid)?.setTiles) { map.getSource(x.sid).setTiles(sp.tiles); x.tpl = sp.tiles[0]; x.item = it; } }).catch(() => {});
    }
    NAT.refresh();
    onLoad?.(j);
  }
  /** 결과 객체가 가장 많은 시군구의 가운데(시험 · 증거용 — 자리 고정값 없이 결과 장부에서 고른다) */
  function hot() {
    let best = null, n = -1;
    for (const r of B.data?.regions || []) { const t = r.items.reduce((a, x) => a + val(x.n), 0); if (r.center && t > n) { n = t; best = r.center; } }
    return best;
  }
  /** 지도에 그려진 결과 층 → 그 층의 묶음(누른 객체가 어느 결과인지) */
  const bySource = (sid) => B.loaded.get(sid) || null;
  function show(on) {
    B.hidden = !on; NAT.show(on); if (!on) { hideTip(); setHot(null); }
    gridVis();
  }
  /** 멀리서 밀도 칸 — 보이기(show) 와 색칠 켜고 끄기(10-21 원칙 298)가 모두 켜졌을 때만 */
  const gridVis = () => { if (map.getLayer('xb-grid')) map.setLayoutProperty('xb-grid', 'visibility', !B.hidden && B.tint !== false ? 'visible' : 'none'); };
  function setTint(on) { B.tint = !!on; gridVis(); }
  return { load, reload, near, bySource, show, setTint, get hasGrid() { return !!map.getLayer('xb-grid'); }, color: (svc) => B.color[svc], colorOf, baseColorOf, set userColor(f) { userColor = f; }, UNIT, get data() { return B.data; }, region: (cd) => B.data?.regions.find((r) => r.sgg_cd === cd) || null, NEAR_Z, CELL_Z,
    set busy(f) { B.isBusy = f; }, nat: NAT, hot, setTask, setOffCls, tasks, get task() { return B.task; }, get offCls() { return [...B.offCls]; }, rehover: () => { if (!tip.hidden && lastPt) hover(lastPt); },
    setLayers: (set) => [...B.loaded.values()].find((x) => x.set === set) || null,
    get natInfo() { return { layers: NAT.layers.filter((l) => map.getLayer(l)), at: B.natAt, assets: NAT.assets }; } };
}
