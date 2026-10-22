/* XI맵 전국 분석 결과(원칙 211 · 218 · 229 · 237 · 10-14 XI맵 3차 구조) — 자산(농지 전수 · 하천 · 계곡)을 고르지 않고 모두 함께.
   분석을 마친 읍면동 = 실제 결과 면(줌 ≤7 약 200m 칸 · 8~10 약 80m 칸 · 11부터 객체 하나하나). 아직인 곳은 칠하지 않는다(올리면 '분석 예정').
   면 · 칸 지도 조각은 판 번호 주소(GET /tiles/national/{자산}/{연도}/{z}/{x}/{y}.pbf?v=판) — 작업기가 칸을 마칠 때마다 판이 바뀌어 다시 받는다(impl-20 방식).
   진행 장부(GET /national/progress)는 30초마다(탭이 보일 때만) 다시 읽는다 — 판이 바뀐 자산만 새 주소 · 지금 도는 칸(runner)은 지도 안 한 줄로.
   객체는 칸마다 결과 묶음 지도 조각(GET /national/sets → /tiles/mvt/{결과}/...?v=판 · 1년 보관)을 화면 안 것만 붙인다.
   숫자는 진행 장부 한 출처. 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { API } from '../../shared/api-v1.js';
import { tilesFor } from '../../xi/engine/sources.js';
import { farPaint } from '../../xi/fx/arrive.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NCOLOR = { 경작지: '#2E9E5B', 비닐하우스: '#F59F00', 건물: '#3182F6' };
/* 자산마다 보이는 분류 — 겹쳐 세지 않게 자산마다 한 분류씩(농지 = 경작지 · 비닐하우스, 하천 · 계곡 = 건물) · 합계 · 말풍선 · 말로 거르기 같은 규칙 */
export const NCLS = { farm: ['경작지', '비닐하우스'], river: ['건물'] };
const UNIT = { 경작지: '곳', 비닐하우스: '동', 건물: '동' };
const OBJ_Z = 11;
const POLL_MS = 30000;
const TEST = (() => { try { return new URLSearchParams(location.search).get('natTest') === '1'; } catch { return false; } })();

/* 연도 고르기(10-22 now21 시계열-연도고르기 ⓐ) — 전국 층을 해마다 따로 본다. 숫자도 그 해 장부 하나(연도가 다른 숫자를 더하지 않음).
   영상 빈 자리(시계열-접경영상없음 ⓐ · 빈조각2024 ⓐ) — 조각의 'nodata' 층: none = '영상 없음(공개 제한 지역)' 회색 · fill = 앞 해 영상으로 채운 자리(점선). */
export const NODATA = { none: '#9AA1AB', fill: '#2E9E5B' };
/** 진행(판 번호 포함) — 첫 화면과 함께 출발 */
export const nationalPromise = (on) => (on ? api('/national/progress').catch((e) => ({ error: e })) : null);

export function createNational({ map, before = 'slot-result' }) {
  const N = { assets: [], data: null, v: {}, year: null, pick: null, task: null, hidden: false, onData: null, off: new Set(), hide: new Map() };   // pick = 고른 해(없으면 기본 해)
  const PATH = () => '/national/progress' + (N.pick ? `?year=${N.pick}` : '');   // off = 끈 클래스 · hide = 묶음 → 고친 자리가 대신 그리는 객체 id
  const FS_HOVER = ['boolean', ['feature-state', 'hover'], false];
  const FID = ['case', ['has', 'id'], ['to-string', ['get', 'id']], ['to-string', ['id']]];
  // 서명(진행 장부가 준 exp · sig — 6시간 칸이라 다시 읽어도 같은 주소 · 10-22 옆문 닫기: 로그인 없이 받아지던 조각을 LX 세션 뒤로)
  const sigQ = () => (N.sig ? `&exp=${N.sig.exp}&sig=${N.sig.sig}` : '');
  const tpl = (a, v) => `${API.base}/tiles/national/${a}/${N.year}/{z}/{x}/{y}.pbf?v=${encodeURIComponent(v || '0')}${sigQ()}${TEST ? '&test=1' : ''}`;
  const src = (a) => 'xn-' + a;
  const clsColor = ['match', ['get', 'cls'], '경작지', NCOLOR.경작지, '비닐하우스', NCOLOR.비닐하우스, '건물', NCOLOR.건물, '#5C7CFA'];
  /** 업무 거르기 — 자산의 분류 중 그 업무만(없으면 그 자산은 비움) */
  const want = (a) => (N.task ? NCLS[a].filter((c) => c === N.task) : NCLS[a]).filter((c) => !N.off.has(c));
  const clsFilter = (a) => ['in', ['get', 'cls'], ['literal', want(a)]];
  /** 객체 층 거르기 = 분류 + 숨긴 객체(클래스 바꿈 · 수정 — 고친 자리 층이 새 색으로 대신 그린다) */
  const objFilter = (o) => { const hid = N.hide.get(o.set); return hid?.length ? ['all', clsFilter(o.asset), ['!', ['in', FID, ['literal', hid]]]] : clsFilter(o.asset); };

  function addLayers() {
    const B = map.getLayer(before) ? before : undefined;
    for (const a of N.assets) {
      if (map.getSource(src(a))) continue;
      map.addSource(src(a), { type: 'vector', tiles: [tpl(a, N.v[a])], minzoom: 4, maxzoom: 10, attribution: '국토지리정보원 항공 정사영상 · AI 분석 결과' });
      // 끝난 곳 — 실제 결과 면(낮은 줌용 단순화 조각). 객체가 오는 줌에서도 아래에 남아 날아간 뒤 빈 지도가 없게
      map.addLayer({ id: src(a) + '-face', type: 'fill', source: src(a), 'source-layer': 'faces', filter: clsFilter(a),
        paint: { 'fill-color': clsColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 9, 0.75, 11, 0.5, 13, 0.3, 15, 0.15] } }, B);
      // 올리면 요약 — 칸 전체(보이지 않는 면 · 끝난 곳 · 분석 예정 모두)
      map.addLayer({ id: src(a) + '-hit', type: 'fill', source: src(a), 'source-layer': 'cells', maxzoom: 12.5, paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, B);
    }
    // 영상 빈 자리 — 첫 자산 조각 하나에서만(두 자산 조각에 같은 면이 실려 온다 · 두 번 칠하지 않게)
    const a0 = N.assets[0];
    if (a0 && !map.getLayer('xn-nodata')) {
      map.addLayer({ id: 'xn-nodata', type: 'fill', source: src(a0), 'source-layer': 'nodata', filter: ['==', ['get', 'kind'], 'none'],
        paint: { 'fill-color': NODATA.none, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.75, 12, 0.5] } }, B);
      map.addLayer({ id: 'xn-nodata-l', type: 'line', source: src(a0), 'source-layer': 'nodata',
        paint: { 'line-color': ['match', ['get', 'kind'], 'none', '#6B7280', NODATA.fill], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 12, 1.6],
          'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } }, B);
    }
  }
  const layers = () => [...N.assets.flatMap((a) => [src(a) + '-face', src(a) + '-hit']), 'xn-nodata', 'xn-nodata-l'];
  const hitLayers = () => N.assets.map((a) => src(a) + '-hit').filter((id) => map.getLayer(id));
  function show(on) {
    N.hidden = !on;
    for (const id of layers()) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    for (const o of OBJ.values()) for (const id of o.ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  }
  function setTask(t) {
    N.task = t || null;
    for (const a of N.assets) if (map.getLayer(src(a) + '-face')) map.setFilter(src(a) + '-face', clsFilter(a));
    for (const o of OBJ.values()) for (const id of o.ids) if (map.getLayer(id)) map.setFilter(id, objFilter(o));
  }
  /** 끈 클래스(체크박스 · 10-15) — 면 · 객체 층 모두 */
  function setOff(list) { N.off = new Set(list || []); setTask(N.task); }
  /** 묶음 하나의 숨길 객체 id(고친 자리 층이 대신 그림) — 빈 목록 = 다시 보임. 층이 아직 없으면 올라올 때 적용 */
  function hide(set, fids) {
    if (fids?.length) N.hide.set(set, fids.map(String)); else N.hide.delete(set);
    for (const o of OBJ.values()) if (o.set === set) for (const id of o.ids) if (map.getLayer(id)) map.setFilter(id, objFilter(o));
  }

  /* ── 객체(줌 11부터) — 화면 안 끝난 칸의 결과 묶음 지도 조각(판 번호 주소)을 붙인다 ── */
  const OBJ = new Map();
  let objT = 0, objSeq = 0;
  const objTpl = (o) => `${API.base}/tiles/mvt/${o.set}/{z}/{x}/{y}.pbf?v=${o.v}${o.q ? '&' + o.q : ''}`;   // q = 묶음 서명(10-22 옆문 닫기 2차)
  async function objects(at, to) {
    if (!N.assets.length || !map.getSource(src(N.assets[0]))) return;
    const z = to ?? map.getZoom();
    if (z < OBJ_Z - 0.5) return;
    let b;
    if (at) { const c = map.getCanvas(), d = (px) => (px / (512 * 2 ** z)) * 360; const dx = d(c.clientWidth / 2), dy = d(c.clientHeight / 2) * Math.cos((at.lat * Math.PI) / 180); b = [at.lng - dx, at.lat - dy, at.lng + dx, at.lat + dy]; }
    else { const g = map.getBounds(); b = [g.getWest(), g.getSouth(), g.getEast(), g.getNorth()]; }
    const my = ++objSeq;
    const got = await Promise.all(N.assets.map((asset) => api(`/national/sets?asset=${asset}&year=${N.year}&bbox=${b.map((v) => v.toFixed(4)).join(',')}${TEST ? '&test=1' : ''}`)
      .then((j) => ({ asset, j }), () => ({ asset, j: null }))));
    if (my !== objSeq && !at) return;
    const B = map.getLayer('slot-result') ? 'slot-result' : undefined;
    for (const { asset, j } of got) for (const o of j?.sets || []) {
      const sid = 'xn-o-' + o.set.replace(/[^\w-]/g, '_');
      if (OBJ.has(sid) || map.getSource(sid)) continue;
      map.addSource(sid, { type: 'vector', tiles: [objTpl(o)], minzoom: 10, maxzoom: 17, bounds: o.bounds, promoteId: 'id' });
      const vis = N.hidden ? 'none' : 'visible';
      const ob = { ids: [sid + '-f', sid + '-l'], asset, set: o.set, tpl: objTpl(o), bounds: o.bounds };
      // 멀리서도 보이게(원칙 267) — 공용 그리기 규칙(arrive.js farPaint): 객체가 오는 줌(11)부터 작은 객체 2px 테두리 · 진한 채움 · 가까이(14~)는 원래 모양
      const P = farPaint('result', { color: clsColor, fade: [OBJ_Z - 0.5, OBJ_Z + 0.5],
        near: { fill: [14, ['case', FS_HOVER, 0.55, 0.28]], width: [15, 1.4], lineOp: [14, 0.95] } });
      map.addLayer({ id: sid + '-f', type: 'fill', source: sid, 'source-layer': 'results', minzoom: OBJ_Z - 0.5, filter: objFilter(ob), layout: { visibility: vis },
        paint: P.fill }, B);   // 올리면 떠오름(손가락 · 10-15)
      map.addLayer({ id: sid + '-l', type: 'line', source: sid, 'source-layer': 'results', minzoom: OBJ_Z - 0.5, filter: objFilter(ob), layout: { visibility: vis },
        paint: P.line }, B);
      OBJ.set(sid, ob);
    }
  }

  /* ── 진행 장부 다시 읽기 — 판이 바뀐 자산만 새 주소 ── */
  function take(j) {
    N.data = j; N.v = j.v || {}; N.year = j.year; N.sigOld = N.sig; N.sig = j.tile_sig || null; N.sigYear = j.year;
    N.assets = Object.entries(j.assets || {}).filter(([, a]) => a && a.on !== false).map(([k]) => k);
  }
  async function refresh() {
    const want = N.pick;
    const j = await api(PATH()).catch(() => null);
    if (!j?.assets || want !== N.pick) return;          // 그사이 해를 바꿨으면 버린다
    const old = N.v;
    take(j);
    const resign = N.sig?.exp !== N.sigOld?.exp;      // 서명 칸이 넘어가면(6시간) 모든 자산 새 주소
    for (const a of N.assets) if ((resign || j.v?.[a] !== old[a]) && map.getSource(src(a))) map.getSource(src(a)).setTiles([tpl(a, N.v[a])]);   // 칸이 끝나 판이 바뀌면 새 주소로
    N.onData?.(j);
  }
  let pollT = 0;
  function poll() {
    clearTimeout(pollT);
    pollT = setTimeout(async () => { if (!document.hidden) await refresh(); poll(); }, POLL_MS);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && N.data) { refresh(); poll(); } });
  map.on('moveend', () => { clearTimeout(objT); objT = setTimeout(() => objects(), 150); });
  async function load(p) {
    const j = await p;
    if (!j || j.error || !j.assets) throw j?.error || new Error('national');
    take(j);
    // 지도 모양(바탕)이 준비되면 층을 올린다 — 올라간 뒤에 끝남(첫 화면 기록 · 시험이 '층이 있다'를 볼 수 있게)
    // 모양 문서만 읽혔으면 바로(바탕 영상 조각이 다 오기를 기다리지 않는다 — 열자마자 결과 면)
    const styled = () => !!(map.style && map.style._loaded) || map.isStyleLoaded();
    await new Promise((res) => {
      const go = () => { addLayers(); res(); };
      if (styled()) go();
      else { const f = () => { if (styled()) { map.off('styledata', f); map.off('idle', f); go(); } }; map.on('styledata', f); map.on('idle', f); }
    });
    N.onData?.(j);
    poll();
    return j;
  }

  /** 해 고르기 — 그 해 진행 장부를 다시 읽고 면 · 칸 · 빈 자리 조각과 객체 묶음을 그 해 것으로 바꾼다(다른 해 숫자 · 객체를 섞지 않음) */
  async function setYear(y) {
    const base = N.data?.base?.year ?? N.data?.year;
    N.pick = y && +y !== +base ? +y : null;
    const j = await api(PATH());
    if (!j?.assets) return null;
    take(j);
    for (const a of N.assets) if (map.getSource(src(a))) map.getSource(src(a)).setTiles([tpl(a, N.v[a])]);
    for (const [sid, o] of OBJ) { for (const id of o.ids) if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(sid)) map.removeSource(sid); }
    OBJ.clear(); WARM.clear();
    objects();
    N.onData?.(j);
    return j.year;
  }
  /** 고를 수 있는 해(끝난 칸이 있는 해 · 새 해가 먼저) — [{year, pct, complete}] */
  const years = () => (N.data?.years || []).slice().sort((p, q) => q.year - p.year);

  /** 지금 분석 중인 칸 — 작업기가 실제로 돌 때만(진행 장부 runner · 고른 해가 작업기가 도는 해일 때만) */
  function running() {
    const ry = N.data?.running_year?.year;
    if (ry && N.year && +ry !== +N.year) return null;
    const r = N.data?.runner;
    if (!r || r.state !== 'running' || !r.cd || !r.asset) return null;
    const f = map.getSource(src(r.asset)) ? map.querySourceFeatures(src(r.asset), { sourceLayer: 'cells', filter: ['==', ['get', 'cd'], r.cd] })[0] : null;
    const nx = N.data.assets?.[r.asset]?.next;
    const label = f ? `${f.properties.sgg || ''} ${f.properties.name || ''}`.trim() : nx ? `${nx.sgg} ${nx.emd}` : null;
    return { asset: r.asset, cd: r.cd, label };
  }

  /* ── 올리면 그 자리 요약 ── */
  function at(pt) {
    const ls = hitLayers();
    if (!ls.length || map.getZoom() >= 12.5) return null;
    const fs = map.queryRenderedFeatures([[pt.x - 2, pt.y - 2], [pt.x + 2, pt.y + 2]], { layers: ls });
    if (!fs.length) return null;
    const f = fs.find((x) => x.properties.done) || fs[0];
    return { ...f.properties, asset: f.layer.id.slice(3, -4) };
  }
  /** 칸 하나의 업무 숫자(진행 장부가 칸에 쓴 값 그대로 · 자산마다 보이는 분류만) */
  function rows(p) {
    if (!p.done) return [];
    const out = [];
    for (const c of NCLS[p.asset] || []) {
      const n = c === '경작지' ? p.n1 : c === '비닐하우스' ? p.n2 : p.n3;
      if (n) out.push({ c, n, unit: UNIT[c] });
    }
    return out;
  }
  /** 같은 읍면동의 다른 자산 칸도 함께(농지 · 하천 칸이 겹친 곳) */
  function cellRows(p) {
    const all = [...rows(p)];
    for (const a of N.assets) {
      if (a === p.asset || !map.getSource(src(a))) continue;
      const o = map.querySourceFeatures(src(a), { sourceLayer: 'cells', filter: ['==', ['get', 'cd'], p.cd] })[0];
      if (o) for (const r of rows({ ...o.properties, asset: a })) if (!all.some((x) => x.c === r.c)) all.push(r);
    }
    return all;
  }
  /** 칸 도형(지금 받은 조각에서) — 누르면 그 칸으로 날아가기 */
  function cellGeom(asset, cd) {
    if (!map.getSource(src(asset))) return null;
    const fs = map.querySourceFeatures(src(asset), { sourceLayer: 'cells', filter: ['==', ['get', 'cd'], cd] });
    return fs.length ? fs.map((f) => f.geometry) : null;
  }
  /** 날아가기 전 — 내려앉을 화면의 객체 묶음을 붙이고 그 조각을 미리 받아 둔다(브라우저 보관) */
  const WARM = new Set();
  async function warm(c, to) {
    await objects(c, to);
    const tz = Math.max(OBJ_Z, Math.min(17, Math.floor(to))), cv = map.getCanvas();
    for (const o of OBJ.values()) {
      for (const [z, x, y] of tilesFor({ center: [c.lng, c.lat], zoom: to }, tz, { W: cv.clientWidth, H: cv.clientHeight, bounds: o.bounds })) {
        const u = o.tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        if (WARM.has(u)) continue;
        WARM.add(u);
        fetch(u, { priority: 'high' }).then((r) => r.arrayBuffer()).catch(() => {});
      }
    }
  }
  return { load, refresh, show, at, rows, cellRows, cellGeom, warm, setTask, setOff, hide, running, nf, setYear, years,
    get year() { return N.year; }, get baseYear() { return N.data?.base?.year ?? N.data?.year; }, get ngii() { return N.data?.ngii || []; },
    /** 지금 켜진 자산의 분류(체크박스 목록) · 묶음 → 그 묶음의 층 */
    classes: () => [...new Set(N.assets.flatMap((a) => NCLS[a] || []))], setLayers: (set) => [...OBJ.values()].find((o) => o.set === set)?.ids || null,
    get data() { return N.data; }, get assets() { return N.assets; }, get task() { return N.task; },
    set onData(f) { N.onData = f; },
    get layers() { return layers(); }, hitLayers, src, get objects() { return [...OBJ.keys()]; }, RM,
    /** 객체 층(줌 11+) — 누르면 그 자리 고치기(원칙 243 · 서비스 결과와 같은 칸) */
    objLayers: () => [...OBJ.values()].filter(() => !N.hidden).map((o) => o.ids[0]).filter((id) => map.getLayer(id)),
    bySource: (sid) => { const o = OBJ.get(sid); return o ? { set: o.set, asset: o.asset } : null; }, OBJ_Z };
}
