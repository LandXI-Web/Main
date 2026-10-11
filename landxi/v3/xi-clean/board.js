/* XI맵 전국 결과(바퀴 5 · 원칙 196 10-11 18:52 고침 · 191 · 182 · 설계 20차 ximap-board-2) — 열자마자 지도에 바로.
   한 번 호출(GET /ximap/board — 서비스 결과 장부 + 시군구 전역 분석)로 시군구 × 서비스 → 찾은 객체 수 · 끝난 시각 · 영상 · 결과 층.
   멀리서는 시군구를 서비스 색으로 칠하고(진하기 = 면적당 객체 · 숫자로 쓰지 않음) 알약에 '시군구 · 수'. 가까이(줌 9.5↑)는 화면 안 시군구의
   결과 층을 불러 객체를 그린다(그 시군구 · 서비스의 지금 결과 하나 — 알약 수와 같은 묶음 · 숫자 한 출처). 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { addResultLayers } from '../../xi/fx/arrive.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const NEAR_Z = 9.5;
/* 서비스 색 — 화면 색일 뿐(자료 아님). 이름이 표에 없으면 남는 색을 차례로 */
const NAMED = { '경작·휴경': '#2E9E5B', 비닐하우스: '#FFB633', 건축물: '#3182F6', 주차장: '#8B5CF6', 곤포사일리지: '#B07A3A', 해양쓰레기: '#0FA9A0', 토지피복: '#6B8FA3' };
const SPARE = ['#E8590C', '#D6336C', '#1098AD', '#5C7CFA', '#74B816', '#AE3EC9'];

/** 시작하자마자 부른다(관문 · 지도와 함께) — 한 번 호출 */
export const boardPromise = (on) => (on ? api('/ximap/board').catch((e) => ({ error: e })) : null);

export function createBoard({ map, host, h, regionOf, onRegion, onSets, onLoad }) {
  const B = { data: null, color: {}, off: new Set(), loaded: new Map(), pills: [], sgg: new Map() };
  const legend = h('section.xb-leg', { hidden: true, 'aria-label': '서비스' });
  host.append(legend);

  function colors(services) {
    let k = 0;
    for (const s of services) B.color[s.id] = NAMED[s.name] || SPARE[k++ % SPARE.length];
  }
  const val = (e) => (e && typeof e === 'object' ? e.value : e) ?? 0;
  /** 시군구의 지금 보이는 서비스(범례에서 끈 것 빼고) */
  const shown = (r) => r.items.filter((x) => !B.off.has(x.svc));

  function fc() {
    const feats = [];
    const ds = B.data.regions.map((r) => val(r.density)).filter((d) => d > 0).sort((a, b) => a - b);
    const rank = (d) => (ds.length < 2 ? 1 : ds.findIndex((x) => x >= d) / (ds.length - 1));
    for (const r of B.data.regions) {
      const g = B.sgg.get(r.sgg_cd)?.geometry; if (!g) continue;
      const on = shown(r); if (!on.length) continue;
      feats.push({ type: 'Feature', geometry: g, properties: { cd: r.sgg_cd, color: B.color[on[0].svc], d: rank(val(r.density)) } });
    }
    return { type: 'FeatureCollection', features: feats };
  }
  function layers() {
    if (map.getSource('xb-sgg')) { map.getSource('xb-sgg').setData(fc()); return; }
    map.addSource('xb-sgg', { type: 'geojson', data: fc() });
    // 멀리서 = 서비스 색 · 진하기 = 면적당 객체 순위(0.32~0.78) · 가까이 가면 객체가 들어오며 칠이 빠진다
    map.addLayer({ id: 'xb-sgg-f', type: 'fill', source: 'xb-sgg', maxzoom: 11,
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 8.6, ['+', 0.32, ['*', 0.46, ['get', 'd']]], 10.4, 0] } }, 'slot-overlay');
    map.addLayer({ id: 'xb-sgg-l', type: 'line', source: 'xb-sgg', layout: { 'line-join': 'round' },
      paint: { 'line-color': ['get', 'color'], 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.2, 11, 2.4], 'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.95, 12, 0.6] } }, 'slot-overlay');
    // 시군구 누르기는 XI맵의 시군구 층이 받는다(같은 동작 한 곳) — 여기서는 손가락 모양만
    map.on('mouseenter', 'xb-sgg-f', () => { if (map.getZoom() < NEAR_Z) map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'xb-sgg-f', () => { map.getCanvas().style.cursor = ''; });
  }

  /* 알약 — '시군구 · 수'(보이는 서비스의 합 · 색 점은 서비스). 겹치면 수가 큰 쪽만 */
  function pills() {
    for (const p of B.pills) p.m.remove();
    B.pills = [];
    for (const r of B.data.regions) {
      const reg = B.sgg.get(r.sgg_cd); const on = shown(r);
      if (!reg || !on.length) continue;
      const n = on.reduce((a, x) => a + val(x.n), 0);
      const c = r.center || [(reg.bbox[0] + reg.bbox[2]) / 2, (reg.bbox[1] + reg.bbox[3]) / 2];
      const el = h('button.xb-pill', { type: 'button', title: on.map((x) => `${x.name} ${nf(val(x.n))}개`).join(' · '), 'aria-label': `${r.name} · ${on.map((x) => `${x.name} ${nf(val(x.n))}개`).join(' · ')}` },
        h('span.xb-dots', {}, ...on.slice(0, 3).map((x) => h('i', { style: { background: B.color[x.svc] } }))), h('b', { text: r.name }), h('span.num', { text: nf(n) }));
      for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'dblclick']) el.addEventListener(t, (e) => e.stopPropagation());   // 지도 누르기와 겹치지 않게
      el.addEventListener('click', (e) => { e.stopPropagation(); onRegion(r, reg); });
      const m = new window.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(c).addTo(map);
      B.pills.push({ m, el, n, r });
    }
    place();
  }
  function place() {
    const far = map.getZoom() < NEAR_Z + 0.6;
    const kept = [];
    for (const p of [...B.pills].sort((a, b) => b.n - a.n)) {
      p.el.hidden = !far;
      if (!far) continue;
      p.el.hidden = false;
      const q = p.el.getBoundingClientRect();
      const hit = kept.some((k) => !(q.right + 4 < k.left || q.left - 4 > k.right || q.bottom + 2 < k.top || q.top - 2 > k.bottom));
      p.el.hidden = hit;
      if (!hit) kept.push(q);
    }
  }

  function drawLegend() {
    const S = B.data.services;
    legend.replaceChildren(
      h('p.xb-leg-h', { text: '서비스' }),
      h('div.xb-leg-l', {}, ...S.map((s) => h('button.xb-chip', { type: 'button', 'aria-pressed': String(!B.off.has(s.id)), title: `결과가 있는 시군구 ${val(s.n_regions)}곳`,
        onclick: () => { if (B.off.has(s.id)) B.off.delete(s.id); else B.off.add(s.id); drawLegend(); layers(); pills(); syncSets(); } },
      h('i', { style: { background: B.color[s.id] } }), h('span', { text: s.name })))));
    legend.hidden = !S.length;
  }

  /* 가까이 — 화면 안 시군구의 결과 층(그 시군구 · 서비스 지금 결과 하나) */
  let nearT = 0;
  async function near() {
    if (!B.data) return;
    const z = map.getZoom();
    if (z < NEAR_Z) return;
    const b = map.getBounds(), vb = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const inView = B.data.regions.filter((r) => { const x = B.sgg.get(r.sgg_cd)?.bbox || r.bbox; return x && !(x[2] < vb[0] || x[0] > vb[2] || x[3] < vb[1] || x[1] > vb[3]); }).slice(0, 4);
    let added = false;
    for (const r of inView) for (const it of r.items) {
      const L = it.layer, id = 'xb-r-' + String(L.id || L.set).replace(/[^\w-]/g, '_');
      if (B.loaded.has(id)) continue;
      let spec;
      try { spec = await sourceSpec({ ...L, kind: 'vector' }); } catch { continue; }
      if (map.getSource(id)) continue;
      map.addSource(id, spec);
      const ids = addResultLayers(map, id, id, { kind: it.style === 'landcover' ? 'landcover' : 'result', sourceLayer: L.layer, visible: false });
      map.addLayer({ id: id + '-pt', type: 'circle', source: id, 'source-layer': L.layer, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' },
        paint: { 'circle-color': B.color[it.svc] || '#0FA9A0', 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } }, 'slot-result');
      ids.push(id + '-pt');
      B.loaded.set(id, { id, sid: id, ids, set: L.set, svc: it.svc, sgg: r.sgg_cd, region: r.name, name: { ko: `${r.name} ${it.name}` }, item: it });
      added = true;
    }
    if (added) syncSets();
  }
  function syncSets() { onSets([...B.loaded.values()].map((x) => ({ ...x, off: B.off.has(x.svc) }))); }

  async function load(p) {
    const j = await p;
    if (!j || j.error) throw j?.error || new Error('board');
    B.data = j;
    for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    colors(j.services);
    layers(); pills(); drawLegend();
    map.on('zoom', () => place());
    map.on('moveend', () => { place(); clearTimeout(nearT); nearT = setTimeout(near, 120); });
    near();
    onLoad?.(j);
    return j;
  }
  async function reload() {
    const j = await api('/ximap/board?fresh=1').catch(() => null);
    if (!j?.regions) return;
    B.data = j; for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    layers(); pills(); onLoad?.(j);
  }
  /** 지도에 그려진 결과 층 → 그 층의 묶음(누른 객체가 어느 결과인지) */
  const bySource = (sid) => B.loaded.get(sid) || null;
  function show(on) { for (const id of ['xb-sgg-f', 'xb-sgg-l']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); for (const p of B.pills) p.el.style.display = on ? '' : 'none'; legend.style.display = on ? '' : 'none'; }
  return { load, reload, near, bySource, show, legend, color: (svc) => B.color[svc], get data() { return B.data; }, region: (cd) => B.data?.regions.find((r) => r.sgg_cd === cd) || null, NEAR_Z };
}
