/* frame.js — V2 프레임 씌우기: 사각 드래그 · 폴리곤 · 읍면동 클릭(A11). 프레임 밖 --dim(saturate .2 · brightness .85 — Palantir 디밍).
   확정 즉시 견적 카드(elev-2 유리): 면적 · shard · 예상 GPU·s(null = 'bench 전 · —') · 할당 잔여 · 허용. 모델은 input 이 현재 층 kind 와 맞는 것만 활성. */
import { numHtml, prov } from './provenance.js';
import { panelIn, panelOut } from './glass.js';
import { chipText } from '../engine/sources.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function frameTool(ctx, { onFrame, emdGeometry }) {
  const { A, dimEl } = ctx;
  const S = { mode: null, pts: [], start: null, frame: null };
  A.addSource('frm', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  A.addLayer({ id: 'frm-halo', type: 'line', source: 'frm', layout: { 'line-join': 'miter' }, paint: { 'line-color': 'rgba(1,1,2,.35)', 'line-width': 3.5 } }, 'slot-overlay');
  A.addLayer({ id: 'frm-line', type: 'line', source: 'frm', layout: { 'line-join': 'miter' }, paint: { 'line-color': '#FFFFFF', 'line-width': 1.5 } }, 'slot-overlay');
  A.addLayer({ id: 'frm-pt', type: 'circle', source: 'frm', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 3, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#010102', 'circle-stroke-width': 1 } }, 'slot-overlay');
  const set = (feats) => A.getSource('frm').setData({ type: 'FeatureCollection', features: feats });
  const poly = (ring) => ({ type: 'Polygon', coordinates: [[...ring, ring[0]]] });
  const rectOf = (a, b) => { const w = Math.min(a.lng, b.lng), e = Math.max(a.lng, b.lng), s = Math.min(a.lat, b.lat), n = Math.max(a.lat, b.lat); return poly([[w, s], [e, s], [e, n], [w, n]]); };
  /* 디밍 — 프레임 구멍을 뚫은 evenodd path 로 backdrop-filter 층을 자른다(카메라가 움직일 때만 다시 계산) */
  const dim = () => {
    if (!S.frame) { dimEl.hidden = true; return; }
    const W = A.getContainer().clientWidth, H = A.getContainer().clientHeight;
    const rings = S.frame.type === 'Polygon' ? S.frame.coordinates : S.frame.coordinates.flat();
    const hole = rings.slice(0, 1).map((r) => 'M' + r.map((p) => { const q = A.project(p); return `${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join(' L') + ' Z').join(' ');
    dimEl.style.clipPath = `path(evenodd, "M0 0 H${W} V${H} H0 Z ${hole}")`;
    dimEl.hidden = false;
  };
  A.on('move', dim);
  const finish = (geom) => {
    S.frame = geom; stop(true);
    set([{ type: 'Feature', properties: {}, geometry: geom }]);
    dim();
    onFrame && onFrame(geom);
  };
  const md = (e) => { if (S.mode !== 'rect') return; e.preventDefault(); S.start = e.lngLat; A.dragPan.disable(); };
  const mm = (e) => {
    if (S.mode === 'rect' && S.start) set([{ type: 'Feature', properties: {}, geometry: rectOf(S.start, e.lngLat) }]);
    if (S.mode === 'poly' && S.pts.length) set([{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [...S.pts, e.lngLat.toArray()] } }, ...S.pts.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }))]);
  };
  const mu = (e) => {
    if (S.mode !== 'rect' || !S.start) return;
    const g = rectOf(S.start, e.lngLat); S.start = null; A.dragPan.enable();
    const a = A.project(g.coordinates[0][0]), b = A.project(g.coordinates[0][2]);
    if (Math.abs(a.x - b.x) < 12 || Math.abs(a.y - b.y) < 12) return;
    finish(g);
  };
  const click = async (e) => {
    if (S.mode === 'poly') { S.pts.push(e.lngLat.toArray()); mm(e); }
    if (S.mode === 'emd') { const g = await emdGeometry(e.lngLat); if (g) finish(g); }
  };
  const dbl = (e) => { if (S.mode === 'poly' && S.pts.length >= 3) { e.preventDefault(); finish(poly(S.pts)); } };
  const key = (e) => { if (e.key === 'Escape') stop(); if (e.key === 'Enter' && S.mode === 'poly' && S.pts.length >= 3) finish(poly(S.pts)); };
  function start(mode) {
    stop(); S.mode = mode; S.pts = []; clear(false);
    A.getCanvas().style.cursor = 'crosshair'; document.documentElement.dataset.tool = mode;
    if (mode === 'poly') A.doubleClickZoom.disable();
    A.on('mousedown', md); A.on('mousemove', mm); A.on('mouseup', mu); A.on('click', click); A.on('dblclick', dbl); window.addEventListener('keydown', key);
  }
  function stop(keep = false) {
    if (!S.mode) return;
    S.mode = null; S.start = null; A.dragPan.enable(); A.doubleClickZoom.enable();
    A.getCanvas().style.cursor = ''; delete document.documentElement.dataset.tool;
    A.off('mousedown', md); A.off('mousemove', mm); A.off('mouseup', mu); A.off('click', click); A.off('dblclick', dbl); window.removeEventListener('keydown', key);
    if (!keep && !S.frame) set([]);
  }
  function clear(all = true) { S.frame = null; set([]); dim(); if (all) stop(); }
  return { S, start, stop, clear, set: finish, get active() { return !!S.mode; } };
}

/** 견적 카드 — q = 계약 §4.4 응답(봉투). models = registry 목록. 반환 {el, model(), close()} */
export function quoteCard(el, { q, models, selected, layerKind, imagery, demoForced, canRun, onRun, onModel, onClose }) {
  const ok = (m) => (m.input || ['ortho']).some((k) => (layerKind === 'raster' ? ['ortho', 'aerial', 'drone'].includes(k) : k === layerKind));
  const first = models.find((m) => ok(m) && m.id === (selected || 'aerial25/best')) || models.find(ok);
  const reasonKo = { quota_exceeded: '할당 초과', demo_required: '영업 계정은 시연 실행만', imagery_forbidden: '원본 영상 권한 없음', model_input_mismatch: '모델 입력과 영상 종류 불일치', aoi_outside_footprint: '영상 범위 밖', aoi_too_large: '프레임이 너무 큼(> 5 km²)' };
  el.innerHTML = `
    <header><span class="xi-eyebrow">견적 · ${q._via === 'api' ? 'POST /jobs/quote' : '프론트 계산 · 서버 연결 없음'}</span><button class="xi-x" type="button" aria-label="닫기">×</button></header>
    <dl class="xi-q">
      <div><dt>면적</dt><dd>${numHtml(q.area_km2, { digits: 3 })}</dd></div>
      <div><dt>shard</dt><dd>${numHtml(q.shards_env)}<small>${esc(q.shards_env.note || '')}</small></dd></div>
      <div><dt>예상 GPU·s</dt><dd>${q.gpu_s.value == null ? '<span class="xi-bench">bench 전 · —</span>' : numHtml(q.gpu_s)}</dd></div>
      <div><dt>할당 잔여</dt><dd>${q.quota.remaining.value == null ? `<span class="xi-bench">${esc(q.quota.remaining.note || '—')}</span>` : numHtml(q.quota.remaining)}</dd></div>
      <div><dt>허용</dt><dd class="xi-allow" data-ok="${q.allowed ? 1 : 0}">${q.allowed ? '허용' : '불가'}${q.reasons.length ? ` · ${q.reasons.map((r) => reasonKo[r] || r).join(' · ')}` : ''}</dd></div>
    </dl>
    <label class="xi-field"><span>모델 → 영상 ${esc(imagery ? chipText(imagery) : '')}</span>
      <select class="xi-model">${models.map((m) => `<option value="${esc(m.id)}" ${ok(m) ? '' : 'disabled'} ${m === first ? 'selected' : ''}>${esc(m.id)} · ${esc((m.classes || []).join('·').slice(0, 28))}${ok(m) ? '' : ' — 입력 불일치'}</option>`).join('')}</select></label>
    ${demoForced ? '<p class="xi-demo-note"><b>시연</b> 영업 계정 · demo:true 강제(계약 §3)</p>' : ''}
    <p class="xi-qprov"></p>
    <footer><button class="xi-btn xi-btn--ink xi-run" type="button" ${q.allowed && canRun ? '' : 'disabled'}>이 프레임 분석 ›</button><button class="xi-btn xi-btn--br xi-cancel" type="button">프레임 지우기</button></footer>`;
  prov(el.querySelector('.xi-qprov'), q.area_km2, { label: '면적' });
  panelIn(el);
  el.querySelector('.xi-x').onclick = () => { panelOut(el); onClose && onClose(); };
  el.querySelector('.xi-cancel').onclick = () => { panelOut(el); onClose && onClose(true); };
  el.querySelector('.xi-model').onchange = (e) => onModel && onModel(e.target.value);
  el.querySelector('.xi-run').onclick = () => { const id = el.querySelector('.xi-model').value; onRun && onRun(models.find((m) => m.id === id)); };
  return { model: () => models.find((m) => m.id === el.querySelector('.xi-model').value), close: () => panelOut(el) };
}
