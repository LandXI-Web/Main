/* XI맵 그 자리 고치기(바퀴 5 · 원칙 182 · 191 · 196 · 설계 20차 ximap-board-2 c4~c6) — 객체를 누르면 그 자리에 작은 칸.
   지우기 · 분류 바꾸기 · 모양 고치기(꼭짓점 끌기 · 변 가운데 점 = 꼭짓점 더하기 · 꼭짓점 두 번 누르기 = 빼기) · 새로 그리기 · 메모.
   고친 것은 서버가 원래 모양과 함께 남긴다(POST /ximap/edits — 누가 · 언제 · 영상 · 모델 판) → 학습 자료.
   칸 아래 한 줄 = 이 서비스에서 고친 것 n건 → 그 프로젝트 학습으로(단추만 · 학습 실행은 하지 않는다).
   모양 고치기 · 새로 그리기는 분석한 영상 위에서(끝나면 보던 영상으로 되돌린다). 시험 고치기 = 주소에 test=1. */
import { api } from '../kit/util.js';

const nf = (n) => Number(n).toLocaleString('ko-KR');
const val = (e) => (e && typeof e === 'object' ? e.value : e);
const TEST = new URLSearchParams(location.search).get('test') === '1';
const md = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')}`; };
const EMPTY = { type: 'FeatureCollection', features: [] };
const ACT = { delete: '지움', reclass: '분류 바꿈', reshape: '모양 고침', add: '새로 그림', memo: '메모' };

export function createEditor({ map, host, h, K, canEdit, onEdited, setImagery }) {
  const E = { card: null, at: null, sel: null, mode: null, sets: [] };
  const card = h('section.xe-card.t-card.t-card--map', { hidden: true, role: 'dialog', 'aria-label': '객체 고치기' });
  const bar = h('div.xe-bar', { hidden: true, role: 'toolbar', 'aria-label': '모양 고치기' });
  host.append(card, bar);

  /* ── 지도 층: 고른 객체 · 고친 자리 · 편집 꼭짓점 ── */
  function layers() {
    if (map.getSource('xe-sel')) return;
    map.addSource('xe-live', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xe-live-del', type: 'fill', source: 'xe-live', filter: ['all', ['==', ['get', 'action'], 'delete'], ['==', ['get', 'part'], 'now']], paint: { 'fill-color': '#F04452', 'fill-opacity': 0.22 } }, 'slot-overlay');
    map.addLayer({ id: 'xe-live-dl', type: 'line', source: 'xe-live', filter: ['all', ['==', ['get', 'action'], 'delete'], ['==', ['get', 'part'], 'now']], paint: { 'line-color': '#F04452', 'line-width': 1.6, 'line-dasharray': [2, 2] } }, 'slot-overlay');
    map.addLayer({ id: 'xe-live-before', type: 'line', source: 'xe-live', filter: ['==', ['get', 'part'], 'before'], paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-dasharray': [2, 2], 'line-opacity': 0.9 } }, 'slot-overlay');
    map.addLayer({ id: 'xe-live-now', type: 'line', source: 'xe-live', filter: ['all', ['!=', ['get', 'action'], 'delete'], ['!=', ['get', 'action'], 'memo'], ['==', ['get', 'part'], 'now']], paint: { 'line-color': '#FFFFFF', 'line-width': 2.4 } }, 'slot-overlay');
    map.addSource('xe-sel', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xe-sel-f', type: 'fill', source: 'xe-sel', paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.18 } }, 'slot-overlay');
    map.addLayer({ id: 'xe-sel-l', type: 'line', source: 'xe-sel', paint: { 'line-color': '#FFFFFF', 'line-width': 2.6 } }, 'slot-overlay');
    map.addSource('xe-orig', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xe-orig', type: 'line', source: 'xe-orig', paint: { 'line-color': '#FFFFFF', 'line-width': 1.4, 'line-dasharray': [2, 2] } });
    map.addSource('xe-shape', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xe-shape-f', type: 'fill', source: 'xe-shape', paint: { 'fill-color': '#0FA9A0', 'fill-opacity': 0.22 } });
    map.addLayer({ id: 'xe-shape-l', type: 'line', source: 'xe-shape', paint: { 'line-color': '#0FA9A0', 'line-width': 2.4 } });
    map.addSource('xe-vtx', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'xe-mid', type: 'circle', source: 'xe-vtx', filter: ['==', ['get', 'mid'], true], paint: { 'circle-radius': 3.5, 'circle-color': '#FFFFFF', 'circle-opacity': 0.85, 'circle-stroke-color': '#0FA9A0', 'circle-stroke-width': 1 } });
    map.addLayer({ id: 'xe-vtx', type: 'circle', source: 'xe-vtx', filter: ['!=', ['get', 'mid'], true], paint: { 'circle-radius': 6, 'circle-color': ['case', ['boolean', ['get', 'on'], false], '#191F28', '#FFFFFF'], 'circle-stroke-color': '#0FA9A0', 'circle-stroke-width': 2 } });
  }
  const src = (id) => map.getSource(id);

  /** 지금 보이는 결과 묶음의 고친 자리(되돌린 것 뺌) */
  async function live(sets = E.sets) {
    E.sets = sets;
    layers();
    if (!sets.length) { src('xe-live').setData(EMPTY); return; }
    try { src('xe-live').setData(await api('/ximap/edits?' + new URLSearchParams({ sets: sets.join(',') }))); } catch { /* 그대로 */ }
  }

  /* ── 칸 위치: 누른 자리 옆(지도를 움직이면 따라간다) ── */
  function place() {
    if (card.hidden || !E.at) return;
    const p = map.project(E.at), W = host.clientWidth, H = host.clientHeight, w = card.offsetWidth || 320, hh = card.offsetHeight || 300;
    let x = p.x + 18, y = p.y - 40;
    if (x + w > W - 92) x = p.x - w - 18;               // 오른쪽 도구 줄과 겹치지 않게
    x = Math.max(12, Math.min(x, W - w - 12)); y = Math.max(76, Math.min(y, H - hh - 12));
    card.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px)`;
  }
  map.on('move', place);

  function close() {
    card.hidden = true; E.sel = null; E.at = null;
    if (map.getSource('xe-sel')) src('xe-sel').setData(EMPTY);
    stopShape(); stopDraw();
  }

  /** 객체 하나 열기 — L = 결과 층 묶음({set, svc, item}) · fid · lngLat(누른 자리) */
  async function open(L, fid, at) {
    layers(); stopShape(); stopDraw();
    E.at = at; E.L = L;
    card.hidden = false; card.replaceChildren(h('p.xe-wait', { text: '불러오는 중' })); place();
    let f;
    try { f = await api('/ximap/feature?' + new URLSearchParams({ set: L.set, fid })); }
    catch { card.replaceChildren(h('p.xe-wait', { text: '이 객체를 불러오지 못했습니다' })); return; }
    E.sel = f;
    src('xe-sel').setData({ type: 'Feature', geometry: f.geometry, properties: {} });
    render();
  }

  async function cardCount() {
    try { const j = await api('/ximap/edits/summary'); return j.items || []; } catch { return []; }
  }

  function render(note) {
    const f = E.sel, p = f.properties, m = f.meta || {};
    const conf = p.conf != null ? Math.round(p.conf * 100) : null;
    const lines = [
      ['서비스', m.service || E.L?.item?.name || '—'],
      ['영상', m.imagery || '—'],
      ['모델', m.model || (m.version ? `서비스 ${m.version}판` : '—')],
      ['분석', m.finished_at ? md(m.finished_at) : '—'],
    ];
    const state = p.edit_state === 'deleted' ? '지움' : p.edit_state === 'added' ? '새로 그림' : p.edit_state === 'edited' ? '고침' : null;
    const head = h('header.xe-h', {},
      h('div', {}, h('h3', { text: p.cls || '객체' }), h('p.xe-sub', { text: [conf != null ? `신뢰도 ${conf}%` : null, p.area_m2 != null ? `${nf(Math.round(p.area_m2))}㎡` : null].filter(Boolean).join(' · ') })),
      state ? h('span.t-chip.xe-st', { text: state }) : null,
      h('button.xa-x', { type: 'button', 'aria-label': '닫기', html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>', onclick: close }));
    const dl = h('dl.xe-dl', {}, ...lines.map(([k, v]) => h('div', {}, h('dt', { text: k }), h('dd', { text: v }))));
    const kids = [head, dl];
    if (note) kids.push(note);
    if (canEdit && !note) {
      const del = p.edit_state === 'deleted';
      kids.push(h('div.xe-act', {},
        h('button.t-btn.t-btn--2', { type: 'button', text: '지우기', disabled: del || undefined, onclick: askDelete }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '분류 바꾸기', disabled: del || undefined, onclick: pickClass }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '모양 고치기', disabled: del || undefined, onclick: startShape }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '새로 그리기', onclick: startDraw }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '메모', onclick: writeMemo })));
    }
    const hist = (f.history || []).filter((x) => !x.undone).slice(0, 2);
    if (hist.length) kids.push(h('ul.xe-hist', {}, ...hist.map((x) => h('li', {}, h('span', { text: `${md(x.at)} ${x.who} · ${ACT[x.action] || x.action}${x.action === 'reclass' && x.cls_after ? ` → ${x.cls_after}` : ''}${x.memo ? ` · ${x.memo}` : ''}${x.test ? ' · 시험' : ''}` }),
      x.mine ? h('button.xe-undo', { type: 'button', text: '되돌리기', onclick: () => undo(x.id) }) : null))));
    const foot = h('p.xe-foot');
    kids.push(foot);
    card.replaceChildren(...kids);
    place();
    retrainLine(foot);
  }
  /** 고친 것 n건 → 그 서비스 프로젝트 학습으로(단추만) */
  async function retrainLine(foot) {
    const items = await cardCount();
    const m = E.sel?.meta || {};
    const it = items.find((x) => x.service === (m.service || '토지피복'));
    const n = val(it?.n) || 0;
    if (!n) { foot.replaceChildren(h('span', { text: '고친 것은 원래 모양과 함께 학습 자료로 쌓입니다' })); place(); return; }
    foot.replaceChildren(h('span', {}, `이 서비스에서 고친 것 `, h('b.num', { text: `${nf(n)}건` })),
      it.project ? h('a.xe-train', { href: new URL(`../lx-train/?${new URLSearchParams({ project: it.project.id, stage: 'train', flow: '1' })}`, import.meta.url).href, text: `${it.project.name} 학습으로` })
        : h('span.xe-sub', { text: ' · 학습 자료로 쌓임' }));
    place();                                              // 아래 줄이 늦게 붙어 칸이 길어지면 화면 안으로 다시 맞춤
  }

  /* ── 고치기 보내기 ── */
  async function send(body, done) {
    try {
      const j = await api('/ximap/edits', { method: 'POST', body: { set: E.L.set, ...body, ...(TEST ? { test: true } : {}) } });
      if (j.feature?.geometry && E.sel && body.action !== 'add') { E.sel.geometry = j.feature.geometry; E.sel.properties = { ...E.sel.properties, ...(j.feature.properties || {}) }; src('xe-sel').setData({ type: 'Feature', geometry: j.feature.geometry, properties: {} }); }
      (E.sel.history ||= []).unshift({ id: j.edit.id, action: body.action, cls_after: body.cls, memo: body.memo, at: j.edit.at, who: '나', test: j.edit.test, mine: true });
      K.toast(done, { ms: 8000, action: { label: '되돌리기', onClick: () => undo(j.edit.id) } });
      onEdited?.(j);
      live();
      render();
      return j;
    } catch (e) { K.toast(e?.message && /[가-힣]/.test(e.message) ? e.message : '고치지 못했습니다'); return null; }
  }
  async function undo(id) {
    try {
      const j = await api(`/ximap/edits/${encodeURIComponent(id)}/undo`, { method: 'POST', body: {} });
      if (j.feature && E.sel && E.sel.id === j.feature.id) { E.sel.geometry = j.feature.geometry; E.sel.properties = { ...E.sel.properties, ...j.feature.properties }; src('xe-sel').setData({ type: 'Feature', geometry: j.feature.geometry, properties: {} }); }
      const hx = (E.sel?.history || []).find((x) => x.id === id); if (hx) hx.undone = true;
      K.toast('되돌렸습니다');
      onEdited?.(j); live();
      if (!card.hidden && E.sel) render();
    } catch (e) { K.toast(e?.message && /[가-힣]/.test(e.message) ? e.message : '되돌리지 못했습니다'); }
  }

  function askDelete() {
    render(h('div.xe-ask', {}, h('p', { text: '이 객체를 지울까요? 원래 모양은 기록에 남습니다.' }),
      h('div.xe-act', {}, h('button.t-btn', { type: 'button', text: '지우기', onclick: () => send({ fid: E.sel.id, action: 'delete' }, '지웠습니다 · 학습 자료로 쌓입니다') }),
        h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: () => render() }))));
  }
  /* ── 클래스 고르기(원칙 205 · 217 · 223) — 질문 문장 없이 클래스 목록(서버 한 곳 · GET /classes/pick)에서 고르고, 없으면 이름을 새로 써서 더한다.
     이름을 새로 쓰면 새 클래스(10-13 데이터-개념 ⓐ — 승인 대기 · 비슷한 클래스 먼저 없음). 관리자는 배포 신청 승인 때 모델 클래스로 본다. */
  async function classList() {
    try { return await api('/classes/pick?' + new URLSearchParams({ set: E.L.set })); } catch { return null; }
  }
  /** 클래스 고르기 칸을 만든다. onPick(클래스, 새로 더했나) · onBack() */
  async function classPicker(onPick, onBack, { except = null } = {}) {
    const box = h('div.xe-ask.xe-pk', {});
    const L = await classList();
    if (!L) { box.append(h('p', { text: '클래스 목록을 불러오지 못했습니다' }), h('div.xe-act', {}, h('button.t-btn.t-btn--2', { type: 'button', text: '닫기', onclick: onBack }))); return box; }
    const chip = (c) => h('button.xe-chip', { type: 'button', onclick: () => onPick(c, false) }, c.name);
    const not = (xs) => xs.filter((c) => c.name !== except && !(c.aliases || []).includes(except));
    const group = (t, xs) => (not(xs).length ? [h('p.xe-pk-t', { text: t }), h('div.xe-chips', {}, ...not(xs).map(chip))] : []);
    const q = h('input.xe-in', { type: 'search', placeholder: '클래스 찾기', 'aria-label': '클래스 찾기' });
    const hits = h('div.xe-chips');
    const all = [...L.finds, ...L.model, ...L.others];
    q.addEventListener('input', () => {
      const k = q.value.trim().toLowerCase();
      hits.replaceChildren(...(k ? not(all).filter((c) => c.name.toLowerCase().includes(k) || (c.aliases || []).some((a) => a.toLowerCase().includes(k))).slice(0, 12).map(chip) : []));
      place();
    });
    const addB = h('button.t-btn.t-btn--2', { type: 'button', text: '새 클래스 더하기',
      onclick: () => { const f = addForm(L, onPick, () => { f.replaceWith(box); place(); }); box.replaceWith(f); place(); } });
    box.append(
      ...group(`${L.service ? `${L.service} 서비스` : '이 서비스'}가 찾는 것`, L.finds),
      ...group('같은 모델의 다른 클래스', L.model),
      q, hits,
      h('div.xe-act', {}, addB, h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: onBack })));
    return box;
  }
  /** 새 클래스 더하기 — 이름 · 세부(위 클래스) / 새 물체. 같은 이름이 이미 있으면 그 클래스로 바꾼다(서버). */
  function addForm(L, onPick, onBack) {
    const name = h('input.xe-in', { type: 'text', maxlength: 40, placeholder: '예: 연동 비닐하우스', 'aria-label': '새 클래스 이름' });
    let kind = 'detail';
    const seen = new Set();
    const ups = [...L.finds, ...L.model, ...L.others].filter((c) => c.status === 'approved' && !c.parent && !seen.has(c.id) && seen.add(c.id));
    const cur = E.sel?.properties?.cls;
    const curId = ups.find((c) => c.name === cur || (c.aliases || []).includes(cur))?.id;
    const up = h('select.xe-in', { 'aria-label': '위 클래스' }, ...ups.map((c) => h('option', { value: c.id, text: c.name, selected: c.id === curId || undefined })));
    const upRow = h('label.xe-pk-row', {}, h('span', { text: '위 클래스' }), up);
    const seg = h('div.xe-seg', { role: 'group', 'aria-label': '구분' });
    const segs = [['detail', '세부(위 클래스 있음)'], ['object', '새 물체']].map(([k, t]) => h('button', { type: 'button', 'aria-pressed': String(k === kind), text: t,
      onclick: () => { kind = k; segs.forEach((x, i) => x.setAttribute('aria-pressed', String(['detail', 'object'][i] === k))); upRow.hidden = k !== 'detail'; place(); } }));
    seg.append(...segs);
    const go = async () => {
      const nm = name.value.trim();
      if (!nm) { name.focus(); return; }
      try {
        const j = await api('/classes', { method: 'POST', body: { name: nm, kind, parent_id: kind === 'detail' ? up.value : null, set: E.L.set, ...(TEST ? { test: true } : {}) } });
        onPick(j.class, !j.existing);
      } catch (e) { K.toast(e?.message && /[가-힣]/.test(e.message) ? e.message : '더하지 못했습니다'); place(); }
    };
    const f = h('div.xe-ask.xe-pk', {}, h('p.xe-pk-t', { text: '새 클래스' }), name, seg, upRow,
      h('div.xe-act', {}, h('button.t-btn', { type: 'button', text: '더하기', onclick: go }), h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: onBack })));
    setTimeout(() => name.focus(), 30);
    return f;
  }
  const doneWord = (c, added) => (added ? `'${c.name}' 클래스를 더해 바꿨습니다 · 학습 데이터로 쌓입니다` : `${c.name}(으)로 바꿨습니다 · 학습 데이터로 쌓입니다`);
  async function pickClass() {
    const now = E.sel.properties.cls;
    render(h('p.xe-wait', { text: '불러오는 중' }));
    const box = await classPicker((c, added) => send({ fid: E.sel.id, action: 'reclass', cls_id: c.id, cls: c.name }, doneWord(c, added)), () => render(), { except: now });
    render(box);
  }
  function writeMemo() {
    const ta = h('textarea.xe-memo', { rows: 3, maxlength: 500, placeholder: '예: 현장 사진으로는 창고 — 다음 판에서 확인', 'aria-label': '메모' });
    render(h('div.xe-ask', {}, ta, h('div.xe-act', {},
      h('button.t-btn', { type: 'button', text: '저장', onclick: () => { const v = ta.value.trim(); if (v) send({ fid: E.sel.id, action: 'memo', memo: v }, '메모를 남겼습니다'); } }),
      h('button.t-btn.t-btn--2', { type: 'button', text: '취소', onclick: () => render() }))));
    setTimeout(() => ta.focus(), 30);
  }

  /* ── 모양 고치기 — 편집용 단순화 모양(서버 · 허용치 1.5m)의 꼭짓점을 끈다 ── */
  const S = { ring: null, rest: [], hist: [], drag: -1, img: null };
  function ringOf(g) {
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    let best = 0, area = -1;
    polys.forEach((p, i) => { const r = p[0]; let a = 0; for (let k = 0; k < r.length - 1; k++) a += r[k][0] * r[k + 1][1] - r[k + 1][0] * r[k][1]; if (Math.abs(a) > area) { area = Math.abs(a); best = i; } });
    return { ring: polys[best][0].slice(0, -1).map((c) => [...c]), holes: polys[best].slice(1), rest: polys.filter((_, i) => i !== best) };
  }
  function shapeGeom() {
    const r = [...S.ring, S.ring[0]];
    const main = [r, ...(S.holes || [])];
    return S.rest.length ? { type: 'MultiPolygon', coordinates: [main, ...S.rest] } : { type: 'Polygon', coordinates: main };
  }
  function drawShape() {
    src('xe-shape').setData({ type: 'Feature', geometry: shapeGeom(), properties: {} });
    const pts = S.ring.map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { i, on: i === S.drag } }));
    const mids = S.ring.map((c, i) => { const d = S.ring[(i + 1) % S.ring.length]; return { type: 'Feature', geometry: { type: 'Point', coordinates: [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2] }, properties: { i, mid: true } }; });
    src('xe-vtx').setData({ type: 'FeatureCollection', features: [...mids, ...pts] });
  }
  function startShape() {
    const g = E.sel.edit?.geometry || E.sel.geometry;
    const r = ringOf(g);
    Object.assign(S, { ring: r.ring, holes: r.holes, rest: r.rest, hist: [], drag: -1 });
    E.mode = 'shape';
    S.img = setImagery?.('analyzed');
    src('xe-orig').setData({ type: 'Feature', geometry: E.sel.geometry, properties: {} });
    src('xe-sel').setData(EMPTY);
    drawShape();
    const nv = val(E.sel.edit?.n_vertices), ne = val(E.sel.edit?.n_vertices_edit);
    bar.replaceChildren(h('span.xe-bar-t', { text: nv && ne && nv > ne ? `꼭짓점 ${ne}개로 단순화해 열었습니다(원래 ${nv}개)` : '꼭짓점을 끌어 모양을 고치세요' }),
      h('button.t-btn.t-btn--2', { type: 'button', text: '되돌리기', onclick: () => { const x = S.hist.pop(); if (x) { S.ring = x; drawShape(); } } }),
      h('button.t-btn', { type: 'button', text: '다 고침', onclick: async () => { const geometry = shapeGeom(); stopShape(); await send({ fid: E.sel.id, action: 'reshape', geometry }, '모양을 고쳤습니다 · 원래 모양과 함께 학습 자료로 쌓입니다'); } }),
      h('button.t-btn.t-btn--text', { type: 'button', text: '그만', onclick: () => { stopShape(); render(); } }));
    bar.hidden = false;
    card.hidden = true;
  }
  function stopShape() {
    if (E.mode !== 'shape') return;
    E.mode = null; bar.hidden = true; card.hidden = !E.sel;
    for (const id of ['xe-shape', 'xe-vtx', 'xe-orig']) src(id)?.setData(EMPTY);
    if (E.sel) src('xe-sel').setData({ type: 'Feature', geometry: E.sel.geometry, properties: {} });
    setImagery?.(S.img);
    place();
  }
  map.on('mousedown', 'xe-vtx', (e) => { if (E.mode !== 'shape') return; e.preventDefault(); S.hist.push(S.ring.map((c) => [...c])); S.drag = e.features[0].properties.i; map.dragPan.disable(); });
  map.on('mousedown', 'xe-mid', (e) => { if (E.mode !== 'shape') return; e.preventDefault(); S.hist.push(S.ring.map((c) => [...c])); const i = e.features[0].properties.i; S.ring.splice(i + 1, 0, [e.lngLat.lng, e.lngLat.lat]); S.drag = i + 1; map.dragPan.disable(); drawShape(); });
  map.on('dblclick', 'xe-vtx', (e) => { if (E.mode !== 'shape' || S.ring.length <= 3) return; e.preventDefault(); S.hist.push(S.ring.map((c) => [...c])); S.ring.splice(e.features[0].properties.i, 1); drawShape(); });
  map.on('mousemove', (e) => { if (E.mode === 'shape' && S.drag >= 0) { S.ring[S.drag] = [e.lngLat.lng, e.lngLat.lat]; drawShape(); } if (E.mode === 'draw') drawLine(e.lngLat); });
  map.on('mouseup', () => { if (S.drag >= 0) { S.drag = -1; map.dragPan.enable(); drawShape(); } });
  map.on('mouseenter', 'xe-vtx', () => { if (E.mode === 'shape') map.getCanvas().style.cursor = 'move'; });
  map.on('mouseleave', 'xe-vtx', () => { if (E.mode === 'shape') map.getCanvas().style.cursor = ''; });

  /* ── 새로 그리기 — 눌러 꼭짓점 · 첫 점을 누르거나 두 번 누르면 끝 → 분류 고르기 ── */
  const D = { pts: [] };
  function drawLine(cur) {
    const pts = cur ? [...D.pts, [cur.lng, cur.lat]] : D.pts;
    src('xe-shape').setData(pts.length >= 3 ? { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[...pts, pts[0]]] }, properties: {} } : pts.length === 2 ? { type: 'Feature', geometry: { type: 'LineString', coordinates: pts }, properties: {} } : EMPTY);
    src('xe-vtx').setData({ type: 'FeatureCollection', features: D.pts.map((c, i) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: { i, on: i === 0 } })) });
  }
  function startDraw() {
    stopShape(); D.pts = []; E.mode = 'draw';
    S.img = setImagery?.('analyzed');
    map.doubleClickZoom.disable(); map.getCanvas().style.cursor = 'crosshair';
    bar.replaceChildren(h('span.xe-bar-t', { text: '지도를 눌러 꼭짓점을 찍고, 첫 점을 누르면 끝납니다' }),
      h('button.t-btn.t-btn--2', { type: 'button', text: '되돌리기', onclick: () => { D.pts.pop(); drawLine(); } }),
      h('button.t-btn.t-btn--text', { type: 'button', text: '그만', onclick: () => { stopDraw(); if (E.sel) render(); } }));
    bar.hidden = false; card.hidden = true;
  }
  function stopDraw() {
    if (E.mode !== 'draw') return;
    E.mode = null; bar.hidden = true; map.getCanvas().style.cursor = '';
    setTimeout(() => map.doubleClickZoom.enable(), 300);
    for (const id of ['xe-shape', 'xe-vtx']) src(id)?.setData(EMPTY);
    setImagery?.(S.img);
  }
  function finishDraw() {
    const ring = [...D.pts, D.pts[0]], geometry = { type: 'Polygon', coordinates: [ring] };
    const at = { lng: D.pts[0][0], lat: D.pts[0][1] };
    stopDraw();
    E.at = at; card.hidden = false;
    src('xe-shape').setData({ type: 'Feature', geometry, properties: {} });
    const pick = (c) => api('/ximap/edits', { method: 'POST', body: { set: E.L.set, action: 'add', cls_id: c.id, cls: c.name, geometry, ...(TEST ? { test: true } : {}) } }).then((j) => {
      src('xe-shape').setData(EMPTY);
      K.toast(`${c.name} 하나를 새로 그렸습니다 · 학습 데이터로 쌓입니다`, { ms: 8000, action: { label: '되돌리기', onClick: () => undo(j.edit.id) } });
      onEdited?.(j); live();
      if (E.sel) render(); else close();
    }, (e) => K.toast(e?.message && /[가-힣]/.test(e.message) ? e.message : '그리지 못했습니다'));
    const cancel = () => { src('xe-shape').setData(EMPTY); if (E.sel) render(); else close(); };
    const wait = h('p.xe-wait', { text: '불러오는 중' });
    card.replaceChildren(h('header.xe-h', {}, h('div', {}, h('h3', { text: '새로 그린 객체' }), h('p.xe-sub', { text: E.L?.item?.name || '' }))), wait);
    place();
    classPicker((c) => pick(c), cancel).then((box) => { wait.replaceWith(box); place(); });
  }
  map.on('click', (e) => {
    if (E.mode !== 'draw') return;
    const first = D.pts[0];
    if (first && D.pts.length >= 3) { const a = map.project(first); if (Math.hypot(a.x - e.point.x, a.y - e.point.y) < 12) { finishDraw(); return; } }
    D.pts.push([e.lngLat.lng, e.lngLat.lat]); drawLine();
  });
  map.on('dblclick', (e) => { if (E.mode === 'draw' && D.pts.length >= 3) { e.preventDefault(); finishDraw(); } });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (E.mode === 'shape') { stopShape(); render(); } else if (E.mode === 'draw') stopDraw(); else if (!card.hidden) close(); } });

  return { open, close, live, get busy() { return !!E.mode; }, get open_() { return !card.hidden; }, undo };
}
