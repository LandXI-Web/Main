/* 카드 발행 관리 — 라벨링 모드(검토자가 라벨 품질을 직접 본다). 원본 admin-publish.html enterLabelingMode + page-ai-labeling-core.js.
   도구: 사각형 · 원형 · 폴리곤 · 도형 복사 · 실행 취소 · 저장 · 닫기 · 줌 · GSD · 클래스/라벨 탭 · 전체 선택 · 클래스 일괄 변경 (n건) 모달.
   캔버스 = MapLibre(V-World 위성, 라벨 풀의 원본 좌표). 라벨 도형은 그 권역의 **실 결과 필지**(GeoJSON)에서 가져온다 — 원본의 라벨 도형은 없다.
   실 도형이 없는 과제는 빈 캔버스로 열리고 그렇게 말한다. 그리기는 포인터 작업, 나머지(선택 · 일괄 변경 · 삭제 · 저장)는 키보드로 된다. */
import { say, openModal, esc, $, $$, icon } from './shell.js';
import * as D from './publish-data.js';
import * as M from './publish-map.js';
import { ico, stWord, DEMO } from './publish-ui.js';

const ACC = '#006DF7';
const SHAPE = { rect: '사각형', circle: '원형', polygon: '폴리곤' };
const KM_LABELS = 1.0, MAX_LABELS = 40;

export function openLabeling(host, { req, idx, onClose }) {
  const pj = D.PROJECTS[req.pid], item = D.LABELING[req.pid][idx], real = pj.real ? D.REAL[pj.real] : null;
  const classes = pj.classes, key = `${req.pid}:${idx}`;
  let labels = [], undo = [], tool = '', active = 0, tab = 'labels', map = null, z0 = 16, seq = 0, draft = null, dead = false;

  host.innerHTML = `
<div class="lm" data-labeling>
  <div class="lm-bar" role="toolbar" aria-label="라벨링 도구">
    ${['rect', 'circle', 'polygon'].map((t) => `<button type="button" class="lm-t" data-tool="${t}" aria-pressed="false">${ico(t)}${SHAPE[t]}</button>`).join('')}
    <button type="button" class="lm-t" data-tool="copy" aria-pressed="false" disabled>${ico('copy')}도형 복사</button>
    <span class="lm-sep"></span>
    <button type="button" class="lm-u" id="lm-undo" disabled>${ico('undo')}실행 취소</button>
    <button type="button" class="btn" id="lm-save">저장</button>
    <button type="button" class="lm-u" id="lm-close">${icon('x', 14)}닫기</button>
  </div>
  <div class="lm-cv" id="lm-cv">
    <div class="lm-map" id="lm-map" role="region" aria-label="라벨링 캔버스 — ${esc(item.name)}"></div>
    <p class="lm-tag">${esc(item.name)} · <span class="n">${esc(item.file || '')}</span></p>
    <p class="lm-gap" id="lm-gap" hidden></p>
    <div class="lm-zoom"><button type="button" id="lm-zo" aria-label="축소">${ico('minus', 14)}</button><span class="n" id="lm-zv">100 %</span><button type="button" id="lm-zi" aria-label="확대">${ico('plus', 14)}</button><i></i><button type="button" id="lm-zr" aria-label="100%로">${ico('refresh', 14)}</button><span class="n g">GSD ${esc((item.gsd || '').replace('cm/px', ' cm/px'))}</span></div>
    <p class="lm-hint" id="lm-hint">우클릭 드래그로 화면 이동</p>
  </div>
  <aside class="lm-side" aria-label="클래스 · 라벨">
    <div class="lm-cur"><div class="t"><b>${esc(item.name)}</b>${item.labels > 0 ? '<span class="st st--acc">라벨링됨</span>' : '<span class="st st--dim">미작업</span>'}</div>
      <div class="s"><span>라벨</span><span class="n" style="color:var(--ink)">${item.labels}</span>${DEMO}<span class="n">${esc(item.last)}</span></div></div>
    <div class="tabs" role="tablist" aria-label="클래스 · 라벨"><button type="button" role="tab" id="lm-tab-classes" data-tab="classes" aria-controls="lm-list">클래스<span class="n">${classes.length}</span></button><button type="button" role="tab" id="lm-tab-labels" data-tab="labels" aria-controls="lm-list">라벨<span class="n" id="lm-n">0</span></button></div>
    <div class="lm-list" id="lm-list" role="tabpanel"></div>
    <div class="lm-f" id="lm-f"><label class="ck"><input type="checkbox" id="lm-all">전체 선택</label><button type="button" class="btn btn--l" id="lm-batch" disabled>클래스 일괄 변경</button></div>
  </aside>
</div>`;
  const root = host.firstElementChild, cv = $('#lm-cv', root), list = $('#lm-list', root);

  /* ── 상태 → 화면 ── */
  const fc = () => ({ type: 'FeatureCollection', features: labels.map((l) => ({ type: 'Feature', properties: { id: l.id, sel: l.sel ? 1 : 0, dash: classes.indexOf(l.cls) > 0 ? 1 : 0 }, geometry: { type: 'Polygon', coordinates: [l.ring] } })) });
  function sync() {
    map?.getSource('lab')?.setData(fc());
    const n = labels.filter((l) => l.sel).length;
    $('#lm-n', root).textContent = labels.length;
    $('#lm-undo', root).disabled = !undo.length;
    $('[data-tool="copy"]', root).disabled = n === 0;
    if (n === 0 && tool === 'copy') setTool('');
    const b = $('#lm-batch', root); b.disabled = n === 0; b.textContent = n ? `클래스 일괄 변경 (${n}건)` : '클래스 일괄 변경';
    const all = $('#lm-all', root); all.checked = labels.length > 0 && n === labels.length; all.indeterminate = n > 0 && n < labels.length;
  }
  function drawList() {
    $$('[role="tab"]', root).forEach((t) => { const on = t.dataset.tab === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; });
    list.setAttribute('aria-labelledby', `lm-tab-${tab}`);
    $('#lm-f', root).hidden = tab !== 'labels';
    if (tab === 'classes') {
      list.innerHTML = classes.map((c, i) => `<button type="button" class="lm-c" data-ci="${i}" aria-pressed="${i === active}"><i class="sw sw--s${i ? ' sw--d' : ''}"></i>${esc(c)}<span class="n">${labels.filter((l) => l.cls === c).length}</span></button>`).join('')
        + '<p class="lm-note">고른 클래스로 새 도형이 그려집니다. 클래스 등록 · 삭제는 프로젝트의 라벨링 화면에서 합니다.</p>';
    } else {
      list.innerHTML = labels.length ? labels.map((l) => `<div class="lm-l" data-id="${l.id}"><label class="ck"><input type="checkbox" ${l.sel ? 'checked' : ''} aria-label="${esc(l.name)} 선택"><i class="sw sw--s${classes.indexOf(l.cls) > 0 ? ' sw--d' : ''}"></i><span>${esc(l.name)}</span></label><span class="shape">${l.shape}</span><button type="button" class="del" aria-label="${esc(l.name)} 삭제">${icon('x', 12)}</button></div>`).join('')
        + (real ? `<p class="lm-note">도형 = ${esc(real.place)} 권역의 실 결과 필지 ${labels.filter((l) => l.real).length}건 — 원본에 라벨 도형이 없어 결과 GeoJSON 에서 가져왔습니다. 라벨 수 ${item.labels} 은 시드 값입니다.</p>` : '')
        : '<div class="empty empty--s" style="margin-top:10px">라벨이 없습니다. 도형을 그려주세요.</div>';
    }
    sync();
  }
  const snap = () => { undo.push(JSON.stringify(labels)); if (undo.length > 40) undo.shift(); };
  const nameOf = (cls) => `${cls} #${++seq}`;

  /* ── 도구 ── */
  function setTool(t) {
    tool = tool === t ? '' : t; draft = null; drawDraft();
    $$('.lm-t', root).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    if (tool) cv.dataset.tool = tool; else delete cv.dataset.tool;
    if (map) { if (tool) { map.dragPan.disable(); map.doubleClickZoom.disable(); } else { map.dragPan.enable(); map.doubleClickZoom.enable(); } }
    $('#lm-hint', root).textContent = tool === 'polygon' ? '클릭으로 꼭짓점 · 더블클릭(Enter)으로 닫기 · Esc 취소' : tool === 'copy' ? '놓을 자리를 클릭하세요' : tool ? '끌어서 그리기 · 우클릭 드래그로 화면 이동' : '우클릭 드래그로 화면 이동';
  }
  function drawDraft() {
    const src = map?.getSource('draft'); if (!src) return;
    src.setData({ type: 'FeatureCollection', features: draft?.ring?.length > 1 ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: draft.ring } }] : [] });
  }
  function commit(ring, shape) {
    if (ring.length < 3) return;
    snap(); const cls = classes[active];
    labels.push({ id: `n${Date.now()}${labels.length}`, cls, name: nameOf(cls), shape, ring: [...ring, ring[0]], sel: false });
    draft = null; drawDraft(); drawList();
  }
  const rectRing = (a, b) => [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]];
  function circleRing(c, e) {
    const pc = map.project(c), pe = map.project(e), r = Math.hypot(pe.x - pc.x, pe.y - pc.y), out = [];
    for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2, p = map.unproject([pc.x + Math.cos(a) * r, pc.y + Math.sin(a) * r]); out.push([p.lng, p.lat]); }
    return out;
  }
  function bindMap() {
    let drag = null, pan = null;
    const ll = (e) => [e.lngLat.lng, e.lngLat.lat];
    map.on('mousedown', (e) => {
      if (e.originalEvent.button === 2) { pan = e.point; return; }
      if (tool === 'rect' || tool === 'circle') { drag = { a: ll(e), p: e.point }; e.preventDefault(); }
    });
    map.on('mousemove', (e) => {
      if (pan) { map.panBy([pan.x - e.point.x, pan.y - e.point.y], { animate: false }); pan = e.point; return; }
      if (drag) { const r = tool === 'rect' ? rectRing(drag.a, ll(e)) : circleRing(drag.a, ll(e)); draft = { ring: [...r, r[0]] }; drawDraft(); }
      else if (tool === 'polygon' && draft?.pts?.length) { draft.ring = [...draft.pts, ll(e)]; drawDraft(); }
    });
    map.on('mouseup', (e) => {
      if (pan) { pan = null; return; }
      if (!drag) return;
      const d = drag; drag = null;
      if (Math.hypot(e.point.x - d.p.x, e.point.y - d.p.y) < 6) { draft = null; drawDraft(); return; }
      commit(tool === 'rect' ? rectRing(d.a, ll(e)) : circleRing(d.a, ll(e)), SHAPE[tool]);
    });
    map.on('click', (e) => {
      if (tool === 'polygon') { draft = draft?.pts ? draft : { pts: [] }; draft.pts.push(ll(e)); draft.ring = [...draft.pts]; drawDraft(); return; }
      if (tool === 'copy') {
        const src = labels.find((l) => l.sel); if (!src) { say('선택 도구로 복사할 도형을 먼저 선택하세요.'); return; }
        const c = src.ring.slice(0, -1).reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0]).map((v) => v / (src.ring.length - 1)), to = ll(e);
        snap(); labels.push({ ...src, id: `n${Date.now()}`, name: nameOf(src.cls), real: false, sel: false, ring: src.ring.map((p) => [p[0] + to[0] - c[0], p[1] + to[1] - c[1]]) });
        drawList(); say('선택한 도형을 복사했습니다.'); return;
      }
      if (tool) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: ['lab-fill'] })[0]; if (!hit) return;
      const l = labels.find((x) => x.id === hit.properties.id); if (l) { l.sel = !l.sel; if (tab !== 'labels') tab = 'labels'; drawList(); $(`.lm-l[data-id="${l.id}"]`, root)?.scrollIntoView({ block: 'nearest' }); }
    });
    map.on('dblclick', (e) => { if (tool === 'polygon' && draft?.pts?.length >= 3) { e.preventDefault(); draft.pts.pop(); commit(draft.pts, SHAPE.polygon); } });
    map.on('zoom', () => { $('#lm-zv', root).textContent = `${Math.round(100 * 2 ** (map.getZoom() - z0))} %`; });
    map.getCanvas().addEventListener('contextmenu', (e) => e.preventDefault());
  }
  function onKey(e) {
    if (dead || document.body.hasAttribute('data-modal')) return;
    if (tool === 'polygon' && e.key === 'Enter' && draft?.pts?.length >= 3) { e.preventDefault(); commit(draft.pts, SHAPE.polygon); }
    else if (e.key === 'Escape' && (draft || tool)) { e.preventDefault(); if (draft) { draft = null; drawDraft(); } else setTool(''); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && undo.length && !/^(input|textarea|select)$/i.test(e.target.tagName)) { e.preventDefault(); doUndo(); }
  }
  function doUndo() { const s = undo.pop(); if (!s) return; labels = JSON.parse(s); drawList(); }

  /* ── 클래스 일괄 변경 모달 ── */
  function batchModal() {
    const picked = labels.filter((l) => l.sel); if (!picked.length) return;
    const names = picked.map((l) => `#${l.name.split('#')[1]}`);
    const m = openModal({ title: '클래스 일괄 변경', width: 400,
      content: `<p class="pick-note">선택한 라벨 ${picked.length}건의 클래스를 바꿉니다</p><div role="radiogroup" aria-label="바꿀 클래스">${classes.map((c, i) => `<label class="opt"><input type="radio" name="bc" value="${i}"><i class="sw sw--s${i ? ' sw--d' : ''}"></i>${esc(c)}</label>`).join('')}</div><p class="err" id="bc-e" role="alert" hidden>변경할 클래스를 선택해 주세요.</p><p class="opt-after" id="bc-after" aria-live="polite"></p>`,
      actions: [{ label: '취소', kind: 'bracket' }, { label: '저장', kind: 'primary', onClick: () => {
        const v = $('input[name="bc"]:checked', m.el);
        if (!v) { $('#bc-e', m.el).hidden = false; $('input[name="bc"]', m.el).focus(); return false; }
        const cls = classes[+v.value]; snap();
        picked.forEach((l) => { l.cls = cls; l.name = `${cls} #${l.name.split('#')[1]}`; });       // 바뀐 라벨은 선택된 채로 남는다 — 무엇이 바뀌었는지 보인다
        drawList(); say(`${picked.length}건의 클래스를 변경했습니다.`);
      } }] });
    m.el.addEventListener('change', (e) => {
      if (e.target.name !== 'bc') return; $('#bc-e', m.el).hidden = true;
      $('#bc-after', m.el).textContent = `저장하면 라벨 ${names.slice(0, 4).join(' · ')}${names.length > 4 ? ` 외 ${names.length - 4}건` : ''} 이(가) ${classes[+e.target.value]}(으)로 바뀝니다`;
    });
  }

  /* ── 이벤트 ── */
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.lm-t'); if (t && !t.disabled) { setTool(t.dataset.tool); return; }
    const tb = e.target.closest('.lm-side [role="tab"]'); if (tb) { tab = tb.dataset.tab; drawList(); tb.focus(); return; }
    const c = e.target.closest('.lm-c'); if (c) { active = +c.dataset.ci; drawList(); $(`.lm-c[data-ci="${active}"]`, root)?.focus(); return; }
    const del = e.target.closest('.lm-l .del'); if (del) { const id = del.closest('.lm-l').dataset.id, i = labels.findIndex((l) => l.id === id); snap(); labels.splice(i, 1); drawList(); ($$('.lm-l .del', root)[Math.min(i, labels.length - 1)] || $('#lm-tab-labels', root)).focus(); return; }
    if (e.target.closest('#lm-undo')) doUndo();
    if (e.target.closest('#lm-save')) { D.patchLabels(key, { saved: labels.map(({ sel, ...l }) => l), seq }); undo = []; sync(); say('라벨링을 저장했습니다.'); }
    if (e.target.closest('#lm-close')) onClose();
    if (e.target.closest('#lm-batch')) batchModal();
    if (e.target.closest('#lm-zi')) map?.zoomTo(map.getZoom() + 0.5); if (e.target.closest('#lm-zo')) map?.zoomTo(map.getZoom() - 0.5);
    if (e.target.closest('#lm-zr')) map?.easeTo({ center: [item.lng, item.lat], zoom: z0 });
  });
  root.addEventListener('change', (e) => {
    if (e.target.id === 'lm-all') { labels.forEach((l) => { l.sel = e.target.checked; }); drawList(); $('#lm-all', root).focus(); return; }
    const row = e.target.closest('.lm-l'); if (row) { const l = labels.find((x) => x.id === row.dataset.id); l.sel = e.target.checked; row.classList.toggle('on', l.sel); sync(); }
  });
  $('.lm-side .tabs', root).addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); tab = tab === 'labels' ? 'classes' : 'labels'; drawList(); $(`#lm-tab-${tab}`, root).focus(); } });
  document.addEventListener('keydown', onKey);

  /* ── 열기 ── */
  (async () => {
    drawList();
    const gap = $('#lm-gap', root);
    if (!M.hasGL()) { gap.hidden = false; gap.textContent = '지도 라이브러리를 불러오지 못했습니다 — 캔버스 없이 목록만 봅니다'; }
    const saved = D.labelOverrides(key);
    try {
      if (saved.saved) { labels = saved.saved.map((l) => ({ ...l, sel: false })); seq = saved.seq || labels.length; }
      else if (real) {
        const geo = await M.loadGeo(real.url), c = [item.lng, item.lat];
        const lab = Object.fromEntries(real.classes.map((k, i) => [k.key, classes[i]]));
        labels = M.near(geo, c, KM_LABELS).map((f) => ({ f, km: M.kmBetween(M.centroid(f), c) })).sort((a, b) => a.km - b.km).slice(0, MAX_LABELS)
          .map(({ f }) => { const g = f.geometry, ring = g.type === 'Polygon' ? g.coordinates[0] : g.coordinates[0][0], cls = lab[f.properties.cls] || classes[0]; return { id: f.properties.id.slice(0, 10), cls, name: nameOf(cls), shape: SHAPE.polygon, ring, real: true, sel: false }; });
      } else { gap.hidden = false; gap.textContent = '라벨 도형 없음 — 이 과제는 실 결과 GeoJSON 이 없습니다(원본은 임의 배치). 도구로 직접 그려 볼 수 있습니다.'; }
    } catch { gap.hidden = false; gap.textContent = '결과 GeoJSON 을 읽지 못했습니다 — 도형 없이 엽니다'; }
    if (dead) return; drawList();
    if (!M.hasGL()) return;
    try {
      map = await M.mountPlate($('#lm-map', root), { center: [item.lng, item.lat], zoom: 15.2 });
      if (dead) { map.remove(); return; }
      const mine = labels.filter((l) => l.real).slice(0, 4); if (mine.length) { const b = M.bboxOf(mine.map((l) => ({ geometry: { coordinates: [l.ring] } }))); map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 56, duration: 0, maxZoom: 17.4 }); }
      z0 = map.getZoom(); window.__pubLabel = { map, get labels() { return labels; } };
      map.addSource('lab', { type: 'geojson', data: fc() }); map.addSource('draft', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({ id: 'lab-fill', type: 'fill', source: 'lab', paint: { 'fill-color': ['case', ['==', ['get', 'sel'], 1], ACC, M.TEAL], 'fill-opacity': ['case', ['==', ['get', 'sel'], 1], 0.22, 0.16] } });
      map.addLayer({ id: 'lab-line', type: 'line', source: 'lab', filter: ['any', ['==', ['get', 'sel'], 1], ['==', ['get', 'dash'], 0]], paint: { 'line-color': ['case', ['==', ['get', 'sel'], 1], ACC, M.TEAL], 'line-width': ['case', ['==', ['get', 'sel'], 1], 3.2, 2.2] } });
      map.addLayer({ id: 'lab-dash', type: 'line', source: 'lab', filter: ['all', ['==', ['get', 'sel'], 0], ['==', ['get', 'dash'], 1]], paint: { 'line-color': M.TEAL, 'line-width': 2.2, 'line-dasharray': [3, 2] } });
      map.addLayer({ id: 'draft', type: 'line', source: 'draft', paint: { 'line-color': ACC, 'line-width': 2, 'line-dasharray': [2, 2] } });
      bindMap(); root.dataset.ready = '';
    } catch { gap.hidden = false; gap.textContent = '지도를 열 수 없습니다 — 이 브라우저가 WebGL 을 지원하지 않습니다'; }
  })();

  return { destroy() { dead = true; document.removeEventListener('keydown', onKey); try { map?.remove(); } catch { /* 이미 닫힘 */ } delete window.__pubLabel; } };
}
export { stWord };
