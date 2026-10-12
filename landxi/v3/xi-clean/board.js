/* XI맵 전국 결과(바퀴 8 · 원칙 218 10-12 12:45 '전국-결과-보기' — 빛나는 밀도 대신 실제 경작지 면 · 배경은 그대로 · 199 · 196 · 182) — 열자마자 지도에 바로.
   멀리서 = 전국 결과 자산(national.js — 분석을 마친 읍면동은 실제 결과 면 · 아직인 곳은 빗금 '분석 예정'). 빛나는 밀도 층은 걷었다.
   한 번 호출(GET /ximap/board — 서비스 결과 장부 + 시군구 전역 분석)로 시군구 × 서비스 → 찾은 객체 수 · 끝난 시각 · 영상 · 결과 층(가까이에서 객체).
   올리면 그 자리(읍면동) 요약, 누르면 그 자리로 날아간다. 시군구 칠하기 · 알약 · 점은 없다. 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { sourceSpec, tilesFor } from '../../xi/engine/sources.js';
import { API, signSet } from '../../shared/api-v1.js';
import { addResultLayers } from '../../xi/fx/arrive.js';
import { createNational, nationalPromise, NCOLOR } from './national.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const NEAR_Z = 9.5;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/* 서비스 색 — 화면 색일 뿐(자료 아님). 이름이 표에 없으면 남는 색을 차례로 */
const NAMED = { '경작·휴경': '#2E9E5B', 비닐하우스: '#F59F00', 건축물: '#3182F6', 주차장: '#8B5CF6', 곤포사일리지: '#B07A3A', 해양쓰레기: '#0FA9A0', 토지피복: '#5C8DA8' };
const SPARE = ['#E8590C', '#D6336C', '#1098AD', '#5C7CFA', '#74B816', '#AE3EC9'];
/* 객체(서비스 결과 조각)는 10(결과 조각이 오는 줌)부터 11.4까지 서서히 진해진다 */
const FADE = { o0: 10, o1: 11.4 };
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
  return { type: 'vector', tiles: [tpl], minzoom: L.minzoom ?? 10, maxzoom: L.maxzoom ?? 17, ...(L.bounds ? { bounds: L.bounds } : {}),
    ...(L.promote_id ? { promoteId: L.promote_id } : {}), attribution: L.attribution || '' };
}

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`;
const mix = (c, w, t) => { const [r, g, b] = hex(c); return `rgba(${[r, g, b].map((v) => Math.round(v + (255 - v) * t)).join(',')},${w})`; };

/** 시작하자마자 부른다(관문 · 지도와 함께) — 한 번 호출 */
export const boardPromise = (on) => (on ? api('/ximap/board').catch((e) => ({ error: e })) : null);
/** 전국 결과 자산 진행(판 번호 포함) — 첫 화면과 함께 출발 */
export { nationalPromise };

export function createBoard({ map, host, h, regionOf, onSets, onLoad, onFly }) {
  const B = { data: null, color: {}, off: new Set(), loaded: new Map(), sgg: new Map(), svcIdx: new Map() };
  const NAT = createNational({ map, h });
  const legend = h('section.xb-leg', { hidden: true, 'aria-label': '서비스' });
  host.append(legend);
  const tip = h('div.xb-tipcard', { hidden: true, role: 'status', 'aria-live': 'polite' });
  host.append(tip);

  function colors(services) {
    let k = 0;
    for (const s of services) B.color[s.id] = NAMED[s.name] || SPARE[k++ % SPARE.length];
    services.forEach((s, i) => B.svcIdx.set(s.id, i));
  }
  const val = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;

  function drawLegend() {
    const S = B.data.services;
    legend.replaceChildren(
      h('p.xb-leg-h', { text: '서비스' }),
      h('div.xb-leg-l', {}, ...S.map((s) => h('button.xb-chip', { type: 'button', 'aria-pressed': String(!B.off.has(s.id)), title: `결과가 있는 시군구 ${val(s.n_regions)}곳`,
        onclick: () => { if (B.off.has(s.id)) B.off.delete(s.id); else B.off.add(s.id); drawLegend(); syncSets(); hideTip(); } },
      h('i', { style: { background: B.color[s.id] } }), h('span', { text: s.name })))));
    legend.hidden = !S.length;
  }

  /* ── 객체 — 밀도와 같은 서비스 색 · 줌에 따라 서서히 진해짐 ── */
  function objectPaint(ids, c, landcover) {
    const set = (id, k, v) => { if (map.getLayer(id)) map.setPaintProperty(id, k, v); };
    for (const id of ids) {
      if (id.endsWith('-fill')) {
        // 토지피복은 분류마다 진하기만 다르게(넓은 경작지 면이 지도를 덮지 않게) · 색은 밀도와 같은 서비스 색
        const base = landcover ? ['match', ['get', 'cls'], '건물', 0.42, '비닐하우스', 0.42, '주차장', 0.3, 0.09] : 0.34;
        set(id, 'fill-color', c);
        set(id, 'fill-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0, 0, FADE.o1, ['case', FS_HOVER, 0.5, base], 15, ['case', FS_HOVER, 0.5, base], 17, ['case', FS_HOVER, 0.5, ['*', 0.6, base]]]);
      } else if (id.endsWith('-halo')) {
        set(id, 'line-color', rgba(c, 0.28));
        set(id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0, 0, FADE.o1, 0.9, 15, 0.6]);
      } else if (id.endsWith('-pt')) {
        set(id, 'circle-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0 - 1, 0, FADE.o1, 1]);
        set(id, 'circle-stroke-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0 - 1, 0, FADE.o1, 1]);
      } else {
        set(id, 'line-color', c);
        const lo = landcover ? ['match', ['get', 'cls'], '경작지', 0.22, 0.85] : 0.95;
        set(id, 'line-opacity', ['interpolate', ['linear'], ['zoom'], FADE.o0, 0, FADE.o1, lo, 16, ['*', 0.85, lo]]);
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

  /* ── 올리면 그 자리 요약 · 누르면 그 자리로 ── 
     요약 = 그 읍면동의 전국 결과 자산 칸(끝난 곳은 장부 숫자 · 아직인 곳은 '분석 예정' — 지어낸 숫자 0) */
  const around = (pt) => NAT.at(pt);
  function hideTip() { tip.hidden = true; B.tipAt = null; }
  function showTip(pt, p) {
    const sum = NAT.summary(p);
    tip.replaceChildren(...[
      h('p.xb-tc-k', { text: sum.k }),
      sum.rows.length ? h('ul.xb-tc-rows', {}, ...sum.rows.map((r) => h('li', {}, h('i', { style: { background: NCOLOR[r.c] } }), h('span', { text: r.c }), h('b', { text: r.text })))) : null,
      h('p.xb-tc-p', { text: sum.p }),
      h('p.xb-tc-tip', { text: '누르면 이 자리로 갑니다' })].filter(Boolean));
    tip.dataset.done = sum.done ? '1' : '0';
    tip.hidden = false;
    const W = host.clientWidth, w = tip.offsetWidth, hh = tip.offsetHeight;
    const x = pt.x + 18 + w > W - 96 ? pt.x - 18 - w : pt.x + 18, y = Math.max(8, Math.min(host.clientHeight - hh - 8, pt.y - hh / 2));
    tip.style.translate = `${Math.round(x)}px ${Math.round(y)}px`;
  }
  let raf = 0, lastPt = null;
  const busy = () => B.hidden || !B.data || (B.isBusy && B.isBusy());
  function onMove(e) {
    lastPt = e.point;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (busy() || map.isMoving()) { hideTip(); return; }
      const sum = around(lastPt);
      map.getCanvas().style.cursor = sum ? 'pointer' : '';
      if (sum) showTip(lastPt, sum); else hideTip();
    });
  }
  function onClick(e) {
    if (busy() || map.getZoom() >= NEAR_Z + 1) return;
    const sum = around(e.point);
    if (!sum) return;
    hideTip();
    const z = map.getZoom(), to = Math.min(12.5, Math.max(z + 3, 11.6));   // 결과 면과 객체가 함께 보이는 줌에 내려앉는다
    onFly?.();
    NAT.warm(e.lngLat, to);
    near(e.lngLat, to).then(() => warm(e.lngLat, to)).catch(() => {});
    if (RM()) map.jumpTo({ center: e.lngLat, zoom: to });
    else map.flyTo({ center: e.lngLat, zoom: to, speed: 1.1, curve: 1.42, essential: false });
  }

  async function load(p, np) {
    const [j] = await Promise.all([p, NAT.load(np || nationalPromise(true)).then(() => { B.natAt = Math.round(performance.now()); }).catch(() => null)]);
    if (!j || j.error) throw j?.error || new Error('board');
    B.data = j;
    for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    colors(j.services);
    drawLegend();
    map.on('moveend', () => { clearTimeout(nearT); nearT = setTimeout(near, 120); });
    map.on('movestart', hideTip);
    map.on('mousemove', onMove);
    map.on('mouseout', () => { hideTip(); });
    map.getCanvas().addEventListener('mouseleave', () => { hideTip(); map.getCanvas().style.cursor = ''; });
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
  function show(on) { B.hidden = !on; NAT.show(on); if (!on) hideTip(); legend.style.display = on ? '' : 'none'; }
  return { load, reload, near, bySource, show, legend, color: (svc) => B.color[svc], get data() { return B.data; }, region: (cd) => B.data?.regions.find((r) => r.sgg_cd === cd) || null, NEAR_Z,
    set busy(f) { B.isBusy = f; }, around: (pt) => around(pt), nat: NAT, hot, get natInfo() { return { layers: NAT.layers.filter((l) => map.getLayer(l)), at: B.natAt, asset: NAT.asset }; } };
}
