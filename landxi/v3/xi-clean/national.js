/* XI맵 전국 결과 자산(원칙 211 · 218 · 10-12 12:45 확인 '전국-결과-보기' — 빛나는 밀도 대신 실제 경작지 면 · 배경은 그대로).
   분석을 마친 읍면동 = 실제 결과 면(줌 ≤7 약 200m 칸 · 8~10 약 80m 칸 · 11부터 객체 하나하나) · 아직인 곳 = 빗금 '분석 예정'(숫자 없음).
   면 · 칸 지도 조각은 판 번호 주소(GET /tiles/national/{자산}/{연도}/{z}/{x}/{y}.pbf?v=판) — 작업기가 칸을 마칠 때마다 판이 바뀌어 다시 받는다(impl-20 방식).
   객체는 칸마다 결과 묶음 지도 조각(GET /national/sets → /tiles/mvt/{결과}/...?v=판 · 1년 보관)을 화면 안 것만 붙인다.
   진행 숫자는 GET /national/progress 한 출처. 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { API } from '../../shared/api-v1.js';
import { tilesFor } from '../../xi/engine/sources.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const ev = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const NCOLOR = { 경작지: '#2E9E5B', 비닐하우스: '#F59F00', 건물: '#3182F6' };
const LEG = { farm: ['경작지', '비닐하우스'], river: ['건물', '경작지', '비닐하우스'] };
const UNIT = { 경작지: '곳', 비닐하우스: '동', 건물: '동' };
const SPAN = { farm: '전국 농지 범위', river: '전국 하천 띠' };
const OBJ_Z = 11;
const TEST = (() => { try { return new URLSearchParams(location.search).get('natTest') === '1'; } catch { return false; } })();

/** 진행(판 번호 포함) — 첫 화면과 함께 출발 */
export const nationalPromise = (on) => (on ? api('/national/progress').catch((e) => ({ error: e })) : null);

export function createNational({ map, h, before = 'slot-result' }) {
  const N = { asset: 'farm', data: null, v: {}, year: null, el: null, onChange: null };
  const tpl = (a, v) => `${API.base}/tiles/national/${a}/${N.year}/{z}/{x}/{y}.pbf?v=${encodeURIComponent(v || '0')}${TEST ? '&test=1' : ''}`;

  function hatch() {
    if (map.hasImage('xn-hatch')) return;
    const s = 10, c = document.createElement('canvas'); c.width = c.height = s;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.62)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, s); g.lineTo(s, 0); g.moveTo(-s / 2, s / 2); g.lineTo(s / 2, -s / 2); g.moveTo(s / 2, s * 1.5); g.lineTo(s * 1.5, s / 2); g.stroke();
    map.addImage('xn-hatch', g.getImageData(0, 0, s, s), { pixelRatio: 1 });
  }
  const clsColor = ['match', ['get', 'cls'], '경작지', NCOLOR.경작지, '비닐하우스', NCOLOR.비닐하우스, '건물', NCOLOR.건물, '#5C7CFA'];

  function addLayers() {
    hatch();
    const v = N.v[N.asset];
    map.addSource('xn', { type: 'vector', tiles: [tpl(N.asset, v)], minzoom: 4, maxzoom: 10, attribution: '국토지리정보원 항공 정사영상 · AI 분석 결과' });
    const B = map.getLayer(before) ? before : undefined;
    // 분석 예정 — 아직 끝나지 않은 읍면동(분석할 범위가 있는 곳만) 빗금 · 가까이 갈수록 옅게
    map.addLayer({ id: 'xn-hatch', type: 'fill', source: 'xn', 'source-layer': 'cells', filter: ['==', ['get', 'done'], 0],
      paint: { 'fill-pattern': 'xn-hatch', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.85, 8, 0.55, 10, 0.35, 12.5, 0] } }, B);
    // 끝난 곳 — 실제 결과 면(낮은 줌용 단순화 조각). 객체가 오는 줌에서도 아래에 남아 날아간 뒤 빈 지도가 없게
    map.addLayer({ id: 'xn-face', type: 'fill', source: 'xn', 'source-layer': 'faces',
      paint: { 'fill-color': clsColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.9, 9, 0.75, 11, 0.5, 13, 0.3, 15, 0.15] } }, B);
    // 올리면 요약 — 칸 전체(보이지 않는 면 · 끝난 곳 · 분석 예정 모두)
    map.addLayer({ id: 'xn-hit', type: 'fill', source: 'xn', 'source-layer': 'cells', maxzoom: 12.5, paint: { 'fill-color': '#000', 'fill-opacity': 0 } }, B);
  }
  function setTiles() {
    const v = N.v[N.asset];
    map.getSource('xn')?.setTiles([tpl(N.asset, v)]);
    for (const o of OBJ.values()) for (const id of o.ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', o.asset === N.asset && !N.hidden ? 'visible' : 'none');
    objects();
  }
  const LAYERS = ['xn-hatch', 'xn-face', 'xn-hit'];
  function show(on) {
    N.hidden = !on;
    for (const id of LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    for (const o of OBJ.values()) for (const id of o.ids) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on && o.asset === N.asset ? 'visible' : 'none');
  }

  /* ── 객체(줌 11부터) — 화면 안 끝난 칸의 결과 묶음 지도 조각(판 번호 주소)을 붙인다 ── */
  const OBJ = new Map();
  let objT = 0, objSeq = 0;
  const objTpl = (o) => `${API.base}/tiles/mvt/${o.set}/{z}/{x}/{y}.pbf?v=${o.v}`;
  async function objects(at, to) {
    if (!map.getSource('xn')) return;
    const z = to ?? map.getZoom();
    if (z < OBJ_Z - 0.5) return;
    let b;
    if (at) { const c = map.getCanvas(), d = (px) => (px / (512 * 2 ** z)) * 360; const dx = d(c.clientWidth / 2), dy = d(c.clientHeight / 2) * Math.cos((at.lat * Math.PI) / 180); b = [at.lng - dx, at.lat - dy, at.lng + dx, at.lat + dy]; }
    else { const g = map.getBounds(); b = [g.getWest(), g.getSouth(), g.getEast(), g.getNorth()]; }
    const my = ++objSeq, asset = N.asset;
    const j = await api(`/national/sets?asset=${asset}&year=${N.year}&bbox=${b.map((v) => v.toFixed(4)).join(',')}${TEST ? '&test=1' : ''}`).catch(() => null);
    if (!j?.sets || my !== objSeq && !at) return;
    for (const o of j.sets) {
      const sid = 'xn-o-' + o.set.replace(/[^\w-]/g, '_');
      if (OBJ.has(sid) || map.getSource(sid)) continue;
      map.addSource(sid, { type: 'vector', tiles: [objTpl(o)], minzoom: 10, maxzoom: 17, bounds: o.bounds, promoteId: 'id' });
      const B = map.getLayer('slot-result') ? 'slot-result' : undefined;
      map.addLayer({ id: sid + '-f', type: 'fill', source: sid, 'source-layer': 'results', minzoom: OBJ_Z - 0.5, filter: ['in', ['get', 'cls'], ['literal', LEG[asset]]],
        paint: { 'fill-color': clsColor, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], OBJ_Z - 0.5, 0, OBJ_Z + 0.5, 0.28] } }, B);
      map.addLayer({ id: sid + '-l', type: 'line', source: sid, 'source-layer': 'results', minzoom: OBJ_Z - 0.5, filter: ['in', ['get', 'cls'], ['literal', LEG[asset]]],
        paint: { 'line-color': clsColor, 'line-width': ['interpolate', ['linear'], ['zoom'], OBJ_Z, 0.6, 15, 1.4],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], OBJ_Z - 0.5, 0, OBJ_Z + 0.5, 0.95] } }, B);
      OBJ.set(sid, { ids: [sid + '-f', sid + '-l'], asset, tpl: objTpl(o), bounds: o.bounds });
    }
  }

  async function refresh() {
    const j = await api('/national/progress').catch(() => null);
    if (!j?.assets) return;
    const changed = j.v?.[N.asset] !== N.v[N.asset];
    N.data = j; N.v = j.v || {};
    if (changed && map.getSource('xn')) setTiles();      // 칸이 끝나 판이 바뀌면 새 주소로 다시 받는다
    paint();
  }
  map.on('moveend', () => { clearTimeout(objT); objT = setTimeout(() => objects(), 150); });
  async function load(p) {
    const j = await p;
    if (!j || j.error || !j.assets) throw j?.error || new Error('national');
    N.data = j; N.v = j.v || {}; N.year = j.year;
    paint();
    // 지도 모양(바탕)이 준비되면 층을 올린다 — 올라간 뒤에 끝남(첫 화면 기록 · 시험이 '층이 있다'를 볼 수 있게)
    await new Promise((res) => {
      const go = () => { if (!map.getSource('xn')) addLayers(); res(); };
      if (map.isStyleLoaded()) go();
      else { const f = () => { if (map.isStyleLoaded()) { map.off('styledata', f); map.off('idle', f); go(); } }; map.on('styledata', f); map.on('idle', f); }
    });
    setInterval(refresh, 60000);
    return j;
  }

  /* ── HUD 안 '전국 결과 자산' 칸 ── */
  N.el = h('section.xna-card', { 'aria-label': '전국 결과 자산' });
  function paint() {
    const j = N.data; if (!j) return;
    const A = j.assets[N.asset];
    const chip = (a) => h('button.xna-chip', { type: 'button', 'aria-pressed': String(a === N.asset), text: a === 'farm' ? `${j.assets.farm.name} · ${j.year}` : j.assets[a].name,
      onclick: () => { if (a === N.asset) return; N.asset = a; setTiles(); paint(); N.onChange?.(a); } });
    const pct = ev(A.pct), done = ev(A.done);
    const run = j.runner || {}, t = j.tonight || {}, nx = A.next;
    const at = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
    const where = nx ? `${nx.sido} · ${nx.sgg}` : null;
    let when;
    if (!j.enabled) when = '멈춤 — 관리자가 다시 켜면 이어서 분석합니다';
    else if (!nx) when = '모든 칸 분석 끝';
    else if (t.quiet?.now && run.state === 'running') when = `지금 분석 중 · ${where}`;
    else if (t.quiet?.now && run.state === 'yield') when = `학습 장비가 다른 일을 하는 동안 기다립니다 · ${where}부터`;
    else when = t.quiet?.now ? `쉬는 시간 · ${where}부터 차례로` : `${new Date(t.starts_at).getDate() === new Date().getDate() ? '오늘' : '다음'} 쉬는 시간 ${at(t.starts_at)}부터 · ${where}부터`;
    N.el.replaceChildren(
      h('p.xna-h', { text: '전국 결과 자산' }),
      h('div.xna-chips', { role: 'group', 'aria-label': '결과 자산' }, chip('farm'), chip('river')),
      h('p.xna-p', {}, '분석 끝 읍면동 ', h('b', { text: `${nf(done)}곳` }), ` · ${SPAN[N.asset]}의 `, h('b', { text: `${pct < 1 && pct > 0 ? pct.toFixed(1) : nf(Math.floor(pct))}%` })),
      h('div.xna-bar', { role: 'img', 'aria-label': `${SPAN[N.asset]} ${pct}% 분석 끝` }, h('i', { style: { width: `${Math.max(pct > 0 ? 1.5 : 0, Math.min(100, pct))}%` } })),
      h('p.xna-s', { text: when }),
      h('ul.xna-leg', {}, ...LEG[N.asset].map((c) => h('li', {}, h('i', { style: { background: NCOLOR[c] } }), h('span', { text: c }))),
        h('li', {}, h('i.xna-hatch'), h('span', { text: '분석 예정' }))),
      h('p.xna-src', { text: `영상 국토지리정보원 항공 ${j.year} · 영상은 저장하지 않고 결과만 쌓습니다` }));
  }

  /* ── 올리면 그 자리 요약 · 누르면 그 자리로 ── */
  function at(pt) {
    if (!map.getLayer('xn-hit') || map.getZoom() >= 12.5) return null;
    const f = map.queryRenderedFeatures([[pt.x - 2, pt.y - 2], [pt.x + 2, pt.y + 2]], { layers: ['xn-hit'] })[0];
    return f ? f.properties : null;
  }
  function summary(p) {
    const rows = [];
    if (p.done) {
      for (const c of LEG[N.asset]) {
        const n = c === '경작지' ? p.n1 : c === '비닐하우스' ? p.n2 : p.n3;
        if (n != null) rows.push({ c, text: `${nf(n)}${UNIT[c]}${c === '경작지' && p.a1 != null ? ` · ${Number(p.a1).toFixed(2)}㎢` : ''}` });
      }
    }
    return { k: [p.sido, `${p.sgg || ''} ${p.name || ''}`.trim()].filter(Boolean).join(' · '), done: !!p.done, rows,
      p: p.done ? `${N.year}년 항공 영상 · 25cm · AI 분석 결과` : '분석 예정 — 학습 장비 쉬는 시간에 차례로 분석합니다' };
  }
  /** 날아가기 전 — 내려앉을 화면의 객체 묶음을 붙이고 그 조각을 미리 받아 둔다(브라우저 보관) */
  const WARM = new Set();
  async function warm(c, to) {
    await objects(c, to);
    const tz = Math.max(OBJ_Z, Math.min(17, Math.floor(to))), cv = map.getCanvas();
    for (const o of OBJ.values()) {
      if (o.asset !== N.asset) continue;
      for (const [z, x, y] of tilesFor({ center: [c.lng, c.lat], zoom: to }, tz, { W: cv.clientWidth, H: cv.clientHeight, bounds: o.bounds })) {
        const u = o.tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
        if (WARM.has(u)) continue;
        WARM.add(u);
        fetch(u, { priority: 'high' }).then((r) => r.arrayBuffer()).catch(() => {});
      }
    }
  }
  return { load, refresh, show, at, summary, warm, get el() { return N.el; }, get asset() { return N.asset; }, get data() { return N.data; },
    set onChange(f) { N.onChange = f; }, layers: LAYERS, get objects() { return [...OBJ.keys()]; }, RM };
}
