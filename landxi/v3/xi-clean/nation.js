/* XI맵 — 사업 나라 고르기(바퀴 4 · XI맵-해외 '이대로 구현' · 원칙 190 · 191 · 시안 design-r19/ximap-board ?v=global)
   같은 XI맵 · 같은 메뉴 · 같은 지도에서 나라만 바꾼다(대한민국 · 키르기스스탄 — 사업 나라만, 나라가 늘면 NATIONS 에 하나 더).
   키르기스스탄 = 실제 결과: 2025 Sentinel-2(10 m) AI 토지피복의 경작지를 군 41곳마다 센 값(메인 화면 키르기스스탄 장면과 같은 파일 · 숫자 한 출처)
   · 군을 누르면 그 군으로 확대 · 판정 화소 그림이 있는 군(지금 Sokuluk)은 확대하면 AI가 경작지로 판정한 칸(약 40 m)이 보인다.
   XI맵 첫눈(전국 AI 현황판)은 다시 설계 중 — 여기는 나라 고르기와 해외 장면만. LX 계정만(기관 계정은 관할만 보므로 나라 고르기 없음). */
import * as K from '../kit/index.js';

const { h } = K;
const nf = (n) => Number(n).toLocaleString('ko-KR');
const km2 = (ha) => nf(Math.round(ha / 100));          // ha → ㎢(메인 화면과 같은 반올림)
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const DATA = new URL('../main/data/', import.meta.url);

/** 사업 나라 — 대한민국은 지금 XI맵 그대로, 나머지는 결과 파일 하나씩 */
const NATIONS = [
  { id: 'kr', name: '대한민국' },
  { id: 'kg', name: '키르기스스탄', file: 'kgz-crop-2025.json', box: [69.2, 39.1, 80.3, 43.3] },
];
const GREEN = '#2E9E5B';

export function mountNation({ map, host, onEnter, onLeave }) {
  const st = { id: 'kr', data: null, sel: null };
  const btns = NATIONS.map((n) => h('button.xn-b', { type: 'button', 'aria-pressed': String(n.id === 'kr'), onclick: () => go(n.id) }, n.name));
  const bar = h('div.xn-bar', { role: 'group', 'aria-label': '사업 나라' }, ...btns);
  const what = h('a.k-what.xn-what', { href: '../help-my/?tab=screens', text: '이 화면은?' });   // 세 화면 경계(바퀴 4)
  const hud = h('section.xn-hud', { hidden: true, 'aria-live': 'polite' });
  const leg = h('div.xn-leg', { hidden: true });
  const more = h('a.xn-more', { href: '../global/', hidden: true, text: '달별 변화 자세히 보기' });
  host.append(bar, hud, leg, what);
  hud.append(more);

  async function load(n) {
    if (st.data) return st.data;
    const r = await fetch(new URL(n.file, DATA));
    if (!r.ok) throw new Error('해외 결과를 불러오지 못했습니다');
    st.data = await r.json();
    return st.data;
  }
  function layers(d) {
    if (map.getSource('xn-kg')) return;
    map.addSource('xn-kg', { type: 'geojson', data: d.geojson, promoteId: 'name' });
    map.addLayer({ id: 'xn-kg-f', type: 'fill', source: 'xn-kg', maxzoom: 10.5,
      paint: { 'fill-color': GREEN, 'fill-opacity': ['interpolate', ['linear'], ['get', 'share'], 0, 0.1, 0.45, 0.82] } }, 'slot-overlay');
    map.addLayer({ id: 'xn-kg-l', type: 'line', source: 'xn-kg', paint: { 'line-color': '#FFFFFF', 'line-width': ['case', ['boolean', ['feature-state', 'sel'], false], 2.6, 0.9], 'line-opacity': 0.9 } }, 'slot-overlay');
    const f = d.focus;
    if (f?.png && f.bbox) {
      const [w, s, e, n] = f.bbox;
      map.addSource('xn-px', { type: 'image', url: new URL(f.png, DATA).href, coordinates: [[w, n], [e, n], [e, s], [w, s]] });
      map.addLayer({ id: 'xn-px', type: 'raster', source: 'xn-px', minzoom: 8.5, paint: { 'raster-opacity': 0.88, 'raster-resampling': 'nearest' } }, 'xn-kg-l');
    }
    map.on('click', 'xn-kg-f', (e) => { const p = e.features?.[0]; if (p && st.id !== 'kr') pick(p); });
    map.on('mouseenter', 'xn-kg-f', () => { if (st.id !== 'kr') map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', 'xn-kg-f', () => { map.getCanvas().style.cursor = ''; });
    map.on('zoomend', () => { if (st.id !== 'kr') legend(); });
  }
  const vis = (on) => { for (const id of ['xn-kg-f', 'xn-kg-l', 'xn-px']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
  const bboxOf = (g) => { const b = [180, 90, -180, -90]; const walk = (c) => (typeof c[0] === 'number' ? (b[0] = Math.min(b[0], c[0]), b[1] = Math.min(b[1], c[1]), b[2] = Math.max(b[2], c[0]), b[3] = Math.max(b[3], c[1])) : c.forEach(walk)); walk(g.coordinates); return b; };

  function card(d, f) {
    const n = NATIONS.find((x) => x.id === st.id);
    const foc = d.focus && f && f.name === d.focus.name;
    hud.replaceChildren(
      h('p.xn-k', { text: f ? `${n.name} · ${f.name} 군` : `${n.name} · 사업 나라` }),
      h('h2.xn-h', { text: f ? '경작지 판정' : '군별 경작지' }),
      f ? h('p.xn-p', {}, h('span', {}, '경작지 ', h('b', { text: `${km2(f.crop_ha)}㎢` }), ` · 군 면적의 ${Math.round(f.share * 100)}%`),
        h('span', { text: foc ? '청록 칸 = AI가 경작지로 판정한 곳(약 40 m 칸)' : '판정 칸 그림은 아직 이 군에 없습니다' }))
        : h('p.xn-p', {}, h('span', {}, `군 ${nf(d.n || d.geojson.features.length)}곳 · 경작지 `, h('b', { text: `${km2(d.total_ha)}㎢` })),
          h('span', { text: `${d.year}년 Sentinel-2 위성 영상(10 m)에서 AI가 경작지를 판정했습니다` }),
          h('span', { text: '군을 누르면 확대되고, 확대하면 실제 판정이 보입니다' })),
      more);
    more.hidden = false;
  }
  function legend() {
    const z = map.getZoom(), px = st.data?.focus && z >= 8.5;
    leg.replaceChildren(...(px ? [h('i.xn-sw', { style: 'background:#0FA9A0' }), h('span', { text: 'AI가 경작지로 판정한 칸' })]
      : [h('span', { text: '경작지 비율' }), h('i.xn-ramp'), h('span', { text: '높음' })]));
    leg.hidden = false;
  }
  /** 판정 칸 그림에서 경작지가 모인 범위(그림의 칠한 칸이 몰린 줄 · 열) — 확대할 곳을 자료가 정한다(지역 고정값 없음) */
  async function cropView(f) {
    if (st.view !== undefined) return st.view;
    st.view = null;
    try {
      const img = await createImageBitmap(await (await fetch(new URL(f.png, DATA))).blob());
      const k = 4, w = Math.ceil(img.width / k), hh = Math.ceil(img.height / k);
      const c = new OffscreenCanvas(w, hh), g = c.getContext('2d'); g.drawImage(img, 0, 0, w, hh);
      const a = g.getImageData(0, 0, w, hh).data, rows = new Array(hh).fill(0), cols = new Array(w).fill(0);
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (a[(y * w + x) * 4 + 3] > 40) { rows[y]++; cols[x]++; }
      const cut = (v) => { const m = Math.max(...v) * 0.25; const i = v.findIndex((n) => n >= m), j = v.length - 1 - [...v].reverse().findIndex((n) => n >= m); return [i, j]; };
      const [y0, y1] = cut(rows), [x0, x1] = cut(cols);
      const [W, S, E, N] = f.bbox;
      if (y0 >= 0 && x0 >= 0) st.view = [W + (E - W) * x0 / w, N - (N - S) * (y1 + 1) / hh, W + (E - W) * (x1 + 1) / w, N - (N - S) * y0 / hh];
    } catch { /* 그림을 못 읽으면 군 전체로 */ }
    return st.view;
  }
  async function pick(feat) {
    const p = feat.properties || {};
    if (st.sel != null) map.setFeatureState({ source: 'xn-kg', id: st.sel }, { sel: false });
    st.sel = p.name; map.setFeatureState({ source: 'xn-kg', id: p.name }, { sel: true });
    const full = st.data.geojson.features.find((x) => x.properties.name === p.name) || feat;
    const f = st.data.focus, foc = f && f.name === p.name;
    map.setFilter('xn-kg-f', foc ? ['!=', ['get', 'name'], p.name] : null);   // 판정 칸이 있는 군은 칠을 걷고 실제 판정을 보인다
    card(st.data, { name: p.name, crop_ha: +p.crop_ha, share: +p.share });
    const v = foc ? await cropView(f) : null;
    map.fitBounds(v || bboxOf(full.geometry), { padding: { top: 80, bottom: 220, left: 60, right: 60 }, maxZoom: v ? 12 : 11, duration: RM() ? 0 : 1400 });
  }

  async function go(id, { first = false, quiet = false } = {}) {
    if (id === st.id && !first) return;
    const n = NATIONS.find((x) => x.id === id) || NATIONS[0];
    st.id = n.id;
    btns.forEach((b, i) => b.setAttribute('aria-pressed', String(NATIONS[i].id === n.id)));
    host.dataset.nation = n.id === 'kr' ? '' : n.id;
    const u = new URL(location.href);
    if (n.id === 'kr') u.searchParams.delete('nation'); else u.searchParams.set('nation', n.id);
    history.replaceState(null, '', u);
    if (n.id === 'kr') {
      vis(false); hud.hidden = true; leg.hidden = true;
      if (st.sel != null) { map.setFeatureState({ source: 'xn-kg', id: st.sel }, { sel: false }); st.sel = null; }
      if (map.getLayer('xn-kg-f')) map.setFilter('xn-kg-f', null);
      if (!quiet) onLeave?.();
      return;
    }
    onEnter?.();
    try {
      const d = await load(n);
      if (st.id !== n.id) return;
      layers(d); vis(true); card(d, null); legend(); hud.hidden = false;
      map.fitBounds(n.box, { padding: { top: 80, bottom: 200, left: 40, right: 40 }, duration: first || RM() ? 0 : 1800 });
    } catch (e) {
      hud.replaceChildren(h('p.xn-p', { text: e.message || '해외 결과를 불러오지 못했습니다' })); hud.hidden = false;
    }
  }
  return { go, get id() { return st.id; } };
}
