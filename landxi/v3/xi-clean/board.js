/* XI맵 전국 결과(바퀴 6 · 원칙 204 10-12 답 '빛나는 밀도 → 실제 객체' · 199 · 196 · 191 · 182) — 열자마자 지도에 바로.
   한 번 호출(GET /ximap/board — 서비스 결과 장부 + 시군구 전역 분석)로 시군구 × 서비스 → 찾은 객체 수 · 끝난 시각 · 영상 · 결과 층.
   멀리서는 AI 가 찾은 객체가 서비스 색으로 은은히 빛나는 밀도(GET /ximap/density — 서버가 객체 중심을 격자로 센 칸 · 칸 합 = 결과 수).
   확대할수록(줌 9~11.5) 밀도가 옅어지고 실제 객체(결과 지도 조각의 도형)가 같은 색으로 진해진다. 올리면 그 자리 요약, 누르면 그 자리로 날아간다.
   시군구 칠하기 · 알약 · 점은 없다(사용자 10-12 "난 저 폴리곤도 싫다"). 지역 문자열 하드코딩 0. */
import { api } from '../kit/util.js';
import { sourceSpec } from '../../xi/engine/sources.js';
import { addResultLayers } from '../../xi/fx/arrive.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const NEAR_Z = 9.5;
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
/* 서비스 색 — 화면 색일 뿐(자료 아님). 이름이 표에 없으면 남는 색을 차례로 */
const NAMED = { '경작·휴경': '#2E9E5B', 비닐하우스: '#F59F00', 건축물: '#3182F6', 주차장: '#8B5CF6', 곤포사일리지: '#B07A3A', 해양쓰레기: '#0FA9A0', 토지피복: '#5C8DA8' };
const SPARE = ['#E8590C', '#D6336C', '#1098AD', '#5C7CFA', '#74B816', '#AE3EC9'];
/* 밀도 ↔ 객체 크로스페이드(줌) — 객체는 10(결과 조각이 오는 줌)부터 11.4까지 진해지고, 밀도는 10.4에서 옅어지기 시작해 12에서 사라진다(둘이 겹쳐 끊김 없이) */
const FADE = { d0: 10.4, d1: 12, o0: 10, o1: 11.4 };
const FS_HOVER = ['boolean', ['feature-state', 'hover'], false];

const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${hex(c).join(',')},${a})`;
const mix = (c, w, t) => { const [r, g, b] = hex(c); return `rgba(${[r, g, b].map((v) => Math.round(v + (255 - v) * t)).join(',')},${w})`; };

/** 시작하자마자 부른다(관문 · 지도와 함께) — 한 번 호출 */
export const boardPromise = (on) => (on ? api('/ximap/board').catch((e) => ({ error: e })) : null);
/** 밀도 격자(0 = 멀리 약 2km 칸 · 1 = 가까이 약 400m 칸) */
export const densityPromise = (on, g = 0) => (on ? api('/ximap/density?g=' + g).catch((e) => ({ error: e })) : null);

export function createBoard({ map, host, h, regionOf, onSets, onLoad, onFly }) {
  const B = { data: null, color: {}, off: new Set(), loaded: new Map(), sgg: new Map(), dens: [null, null], svcIdx: new Map(), glow: [] };
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

  /* ── 밀도 칸 → 지도 점(가중치 = 서비스마다 그 서비스 칸의 상위 10% 수로 나눔 — 객체가 적은 서비스도 보이고 · 많은 곳과 적은 곳이 갈리게.
     숫자는 칸의 실제 수 · 가중치는 빛 세기에만) ── */
  function densFC(d) {
    const sv = d.sets.map((s) => B.svcIdx.get(s.svc) ?? -1);
    const per = new Map();
    for (let i = 0; i < d.cells.length; i += 4) { const k = sv[d.cells[i + 2]]; (per.get(k) || per.set(k, []).get(k)).push(d.cells[i + 3]); }
    const p90 = new Map([...per].map(([k, a]) => { a.sort((x, y) => x - y); return [k, a[Math.floor(a.length * 0.9)] || 1]; }));
    const feats = [];
    for (let i = 0; i < d.cells.length; i += 4) {
      const k = sv[d.cells[i + 2]], n = d.cells[i + 3];
      feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [(d.cells[i] + 0.5) * d.g, (d.cells[i + 1] + 0.5) * d.g] },
        properties: { s: k, w: Math.round(Math.min(1, n / p90.get(k)) ** 0.6 * 1000) / 1000 } });
    }
    return { type: 'FeatureCollection', features: feats };
  }
  /* 빛 — 가장자리는 투명 → 서비스 색 → 가운데는 흰빛이 섞인 밝은 색(밝은 지도 위에서도 '빛나게' · 네온 · 어두운 바탕 없음) */
  const ramp = (c) => ['interpolate', ['linear'], ['heatmap-density'], 0, rgba(c, 0), 0.1, rgba(c, 0.16), 0.35, rgba(c, 0.46), 0.65, rgba(c, 0.74), 0.9, mix(c, 0.86, 0.18), 1, mix(c, 0.94, 0.4)];
  /* 칸 크기에 맞춘 반경(줌이 깊어질수록 넓게 · 400m 칸이 이어져 보이게) */
  const RADIUS = { 0: ['interpolate', ['exponential', 1.6], ['zoom'], 4, 6, 6, 11, 8, 20, 10, 40], 1: ['interpolate', ['exponential', 1.5], ['zoom'], 6, 5, 8, 8, 10, 14, 12, 26] };
  /* 세기 — 가까이 갈수록 칸이 촘촘히 겹치므로 낮춘다(겹친 빛이 한 덩어리로 뭉개지지 않게) */
  const INTENS = { 0: ['interpolate', ['linear'], ['zoom'], 4, 0.5, 7, 0.75, 10, 0.6], 1: ['interpolate', ['linear'], ['zoom'], 7, 0.7, 9, 0.5, 12, 0.36] };
  /* 어느 격자가 어느 줌을 맡는지(가까이 격자가 오면 7~8 사이에서 넘겨받음) — 모두 FADE.d1 에서 사라진다 */
  /* 객체 조각이 아직 오지 않았으면(먼 연결) 빛을 지우지 않고 붙들어 둔다 — 도착했을 때 빈 지도가 보이지 않게(B.hold) */
  const opa = (g, a = 1) => {
    const d1 = B.hold ? HOLD_Z : FADE.d1, d0 = B.hold ? HOLD_Z - 0.5 : FADE.d0;
    if (g === 0 && !B.dens[1]) return ['interpolate', ['linear'], ['zoom'], 3, 0.92 * a, d0, 0.92 * a, d1, 0];
    if (g === 0) return ['interpolate', ['linear'], ['zoom'], 3, 0.92 * a, 7, 0.92 * a, 8, 0];
    return ['interpolate', ['linear'], ['zoom'], 7, 0, 8, 0.92 * a, d0, B.hold ? 0.7 * a : 0.92 * a, d1, 0];
  };
  const HOLD_Z = 13.5;
  function holdCheck() {
    if (!B.glow.length) return;
    const z = map.getZoom();
    let hold = false;
    if (z >= FADE.d0 && z < HOLD_Z) {
      const ls = [...B.loaded.values()].filter((x) => !B.off.has(x.svc)).flatMap((x) => x.ids.filter((l) => /-(fill|pt)$/.test(l))).filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none');
      hold = !ls.length || map.queryRenderedFeatures({ layers: ls }).length === 0;
    }
    if (hold === !!B.hold) return;
    B.hold = hold;
    for (const L of B.glow) if (map.getLayer(L.id)) map.setPaintProperty(L.id, 'heatmap-opacity', opa(L.g));
  }
  function glowLayers(g) {
    const src = 'xb-dens' + g, d = B.dens[g];
    if (map.getSource(src)) map.getSource(src).setData(densFC(d));
    else map.addSource(src, { type: 'geojson', data: densFC(d), buffer: 64, tolerance: 0 });
    for (const s of B.data.services) {
      const id = `xb-glow${g}-${B.svcIdx.get(s.id)}`, c = B.color[s.id];
      if (map.getLayer(id)) continue;
      map.addLayer({ id, type: 'heatmap', source: src, maxzoom: HOLD_Z + 0.1, filter: ['==', ['get', 's'], B.svcIdx.get(s.id)],
        layout: { visibility: B.off.has(s.id) ? 'none' : 'visible' },
        paint: { 'heatmap-weight': ['get', 'w'], 'heatmap-radius': RADIUS[g], 'heatmap-color': ramp(c),
          'heatmap-intensity': INTENS[g],
          'heatmap-opacity': opa(g, 0), 'heatmap-opacity-transition': { duration: RM() ? 0 : 1100, delay: 0 } } }, 'slot-result');
      B.glow.push({ id, g, svc: s.id });
    }
    // 빛이 서서히 켜진다(움직임 줄이기면 바로) — 다음 그림에서 진짜 값으로 바꿔 전환이 걸리게
    requestAnimationFrame(() => { for (const L of B.glow) if (map.getLayer(L.id)) map.setPaintProperty(L.id, 'heatmap-opacity', opa(L.g)); });
  }
  function glowVis() {
    for (const L of B.glow) if (map.getLayer(L.id)) map.setLayoutProperty(L.id, 'visibility', B.off.has(L.svc) || B.hidden ? 'none' : 'visible');
  }

  function drawLegend() {
    const S = B.data.services;
    legend.replaceChildren(
      h('p.xb-leg-h', { text: '서비스' }),
      h('div.xb-leg-l', {}, ...S.map((s) => h('button.xb-chip', { type: 'button', 'aria-pressed': String(!B.off.has(s.id)), title: `결과가 있는 시군구 ${val(s.n_regions)}곳`,
        onclick: () => { if (B.off.has(s.id)) B.off.delete(s.id); else B.off.add(s.id); drawLegend(); glowVis(); syncSets(); hideTip(); } },
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
  /* 가까이 — 화면 안 시군구의 결과 층(그 시군구 · 서비스 지금 결과 하나) · 크로스페이드가 시작되기 전에 미리 불러 둔다 */
  let nearT = 0;
  async function near(at) {
    if (!B.data) return;
    const z = map.getZoom();
    if (z < NEAR_Z && !at) return;
    // at = 날아갈 자리(누르면 날아감 — 내려앉을 자리의 결과 층을 출발 전에 불러 둔다 · 도착했을 때 빈 지도가 보이지 않게)
    const b = map.getBounds(), vb = at ? [at.lng, at.lat, at.lng, at.lat] : [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()], mc = at || map.getCenter();
    // 화면 안 시군구 중 화면 가운데에 가까운 넷(먼저 보는 곳부터)
    const box = (r) => B.sgg.get(r.sgg_cd)?.bbox || r.bbox;
    const dist = (x) => Math.hypot(Math.max(x[0] - mc.lng, 0, mc.lng - x[2]), Math.max(x[1] - mc.lat, 0, mc.lat - x[3]));
    const inView = B.data.regions.filter((r) => { const x = box(r); return x && !(x[2] < vb[0] || x[0] > vb[2] || x[3] < vb[1] || x[1] > vb[3]); })
      .sort((p, q) => dist(box(p)) - dist(box(q))).slice(0, 4);
    let added = false;
    for (const r of inView) for (const it of r.items) {
      const L = it.layer, id = 'xb-r-' + String(L.id || L.set).replace(/[^\w-]/g, '_');
      if (B.loaded.has(id)) continue;
      let spec;
      try { spec = await sourceSpec({ ...L, kind: 'vector' }); } catch { continue; }
      if (map.getSource(id)) continue;
      map.addSource(id, spec);
      const c = B.color[it.svc] || '#0FA9A0', lc = it.style === 'landcover';
      const ids = addResultLayers(map, id, id, { kind: lc ? 'landcover' : 'result', sourceLayer: L.layer, visible: false });
      map.addLayer({ id: id + '-pt', type: 'circle', source: id, 'source-layer': L.layer, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility: 'none' },
        paint: { 'circle-color': c, 'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 2, 14, 4.5], 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 1 } }, 'slot-result');
      ids.push(id + '-pt');
      objectPaint(ids, c, lc);
      B.loaded.set(id, { id, sid: id, ids, set: L.set, svc: it.svc, sgg: r.sgg_cd, region: r.name, name: { ko: `${r.name} ${it.name}` }, item: it });
      added = true;
    }
    if (added) syncSets();
  }
  function syncSets() { onSets([...B.loaded.values()].map((x) => ({ ...x, off: B.off.has(x.svc) }))); }

  /* ── 올리면 그 자리 요약 · 누르면 그 자리로 ── */
  const R_PX = 24;
  /* 그 자리 요약 — 커서 둘레의 밀도 칸으로 '어느 시군구의 빛인지'를 고르고(칸 수가 가장 많은 시군구), 수는 그 시군구의 전국 결과 수 그대로
     (HUD · 시군구 칸과 같은 값 — 숫자 한 출처. 커서 둘레만 센 부분 합은 화면에 쓰지 않는다) */
  function around(pt) {
    const z = map.getZoom();
    const d = B.dens[1] && z >= 7.5 ? B.dens[1] : B.dens[0];
    if (!d || z >= FADE.d1) return null;
    const a = map.unproject([pt.x - R_PX, pt.y + R_PX]), b = map.unproject([pt.x + R_PX, pt.y - R_PX]);
    const x0 = a.lng / d.g - 0.5, x1 = b.lng / d.g - 0.5, y0 = a.lat / d.g - 0.5, y1 = b.lat / d.g - 0.5;
    const reg = new Map();
    for (let i = 0; i < d.cells.length; i += 4) {
      const x = d.cells[i], y = d.cells[i + 1];
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      const s = d.sets[d.cells[i + 2]];
      if (B.off.has(s.svc)) continue;
      reg.set(s.region, (reg.get(s.region) || 0) + d.cells[i + 3]);
    }
    if (!reg.size) return null;
    const name = [...reg].sort((p, q) => q[1] - p[1])[0][0];
    const r = B.data.regions.find((x) => x.name === name);
    const rows = (r?.items || []).filter((x) => !B.off.has(x.svc)).map((x) => ({ svc: x.svc, name: x.name, n: val(x.n), imagery: x.imagery }));
    if (!rows.length) return null;
    return { name, sido: r.sido, rows, imagery: [...new Set(rows.map((x) => x.imagery).filter(Boolean))] };
  }
  function hideTip() { tip.hidden = true; B.tipAt = null; }
  function showTip(pt, sum) {
    tip.replaceChildren(
      h('p.xb-tc-k', { text: [sum.sido, sum.name].filter(Boolean).join(' · ') }),
      h('ul.xb-tc-rows', {}, ...sum.rows.slice(0, 4).map((r) => h('li', {}, h('i', { style: { background: B.color[r.svc] } }), h('span', { text: r.name }), h('b', { text: `${nf(r.n)}개` })))),
      sum.imagery.length ? h('p.xb-tc-p', { text: sum.imagery.slice(0, 2).join(' · ') }) : null,
      h('p.xb-tc-tip', { text: '누르면 이 자리로 갑니다' }));
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
    const z = map.getZoom(), to = Math.min(12.5, Math.max(z + 3, 11.6));   // 빛과 객체가 함께 보이는 줌에 내려앉는다
    onFly?.();
    near(e.lngLat);
    if (RM()) map.jumpTo({ center: e.lngLat, zoom: to });
    else map.flyTo({ center: e.lngLat, zoom: to, speed: 1.1, curve: 1.42, essential: false });
  }

  async function load(p, dp) {
    const [j, d0] = await Promise.all([p, dp || densityPromise(true, 0)]);
    if (!j || j.error) throw j?.error || new Error('board');
    B.data = j;
    for (const r of j.regions) { const reg = regionOf(r); if (reg) B.sgg.set(r.sgg_cd, reg); }
    colors(j.services);
    drawLegend();
    if (d0 && !d0.error) { B.dens[0] = d0; glowLayers(0); }
    B.glowAt = Math.round(performance.now());
    // 가까이 격자(약 400m 칸)는 첫 화면 뒤에 받는다 — 받으면 7~8 줌에서 넘겨받는다
    const later = () => densityPromise(true, 1).then((d1) => { if (d1 && !d1.error) { B.dens[1] = d1; glowLayers(1); for (const L of B.glow) if (L.g === 0 && map.getLayer(L.id)) map.setPaintProperty(L.id, 'heatmap-opacity', opa(0)); glowVis(); } });
    (window.requestIdleCallback || ((f) => setTimeout(f, 300)))(later, { timeout: 1500 });
    map.on('moveend', () => { clearTimeout(nearT); nearT = setTimeout(near, 120); });
    map.on('movestart', hideTip);
    let holdT = 0;
    const holdSoon = () => { clearTimeout(holdT); holdT = setTimeout(holdCheck, 150); };
    map.on('idle', holdCheck);
    map.on('moveend', holdSoon);
    map.on('sourcedata', (e) => { if (/^xb-r-/.test(e.sourceId || '') && e.isSourceLoaded) holdSoon(); });
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
    for (const g of [0, 1]) if (B.dens[g]) api('/ximap/density?g=' + g).then((d) => { if (d?.cells) { B.dens[g] = d; map.getSource('xb-dens' + g)?.setData(densFC(d)); } }).catch(() => {});
    onLoad?.(j);
  }
  /** 객체가 가장 많이 모인 멀리 격자 칸의 가운데(시험 · 증거용 — 자리 고정값 없이 빛나는 곳을 고른다) */
  function hot() {
    const d = B.dens[0]; if (!d) return null;
    let k = -1;
    for (let i = 0; i < d.cells.length; i += 4) if (k < 0 || d.cells[i + 3] > d.cells[k + 3]) k = i;
    return k < 0 ? null : [(d.cells[k] + 0.5) * d.g, (d.cells[k + 1] + 0.5) * d.g];
  }
  /** 지도에 그려진 결과 층 → 그 층의 묶음(누른 객체가 어느 결과인지) */
  const bySource = (sid) => B.loaded.get(sid) || null;
  function show(on) { B.hidden = !on; glowVis(); if (!on) hideTip(); legend.style.display = on ? '' : 'none'; }
  return { load, reload, near, bySource, show, legend, color: (svc) => B.color[svc], get data() { return B.data; }, region: (cd) => B.data?.regions.find((r) => r.sgg_cd === cd) || null, NEAR_Z,
    set busy(f) { B.isBusy = f; }, around: (pt) => around(pt), get glow() { return { layers: B.glow.map((L) => L.id), at: B.glowAt, fine: !!B.dens[1], hot: hot() }; } };
}
