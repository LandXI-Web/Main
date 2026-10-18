/* label-map.js — 학습데이터 구축 · 지도 위에서 라벨링(10-18 사용자 "왼쪽에 실제 지도에 라벨링 하는 영상이 보여야 이쁠거 같은데. 그런 기능이 없나?").
   왼쪽 = 실제 지도(프로젝트 영상을 원래 해상도로 · 둘레는 옅은 바탕 · 대상 지역 테두리) · 오른쪽 = 클래스 · 그린 모양 · 라벨 완료한 곳 · 진행.
   그리기 문법은 그림 보기(label.js) · XI맵 그 자리 고치기와 같다 — 다각형 · 사각형 · 꼭짓점 끌기 · 변 가운데 점 = 꼭짓점 더하기 · 꼭짓점 두 번 누르기 = 빼기 ·
   옮기기 · 클래스 바꾸기 · 삭제 · 되돌리기 · 다시 하기.
   저장 = 영상마다 모양(경위도). '이 화면 라벨 완료' = 화면 안에 다 들어오는 영상 격자 칸을 서버가 512 화소 그림으로 잘라 모양을 다각형 라벨로 넣는다
   → 그림 보기와 같은 학습데이터 묶음(한 길 · server/landxi_api/labeling.py). 'AI 결과 자리'로 라벨할 곳을 건너간다.
   화면 글에 경로 · id · 좌표를 쓰지 않는다. */
import { h, api } from '../kit/util.js';
import { primeSign } from '../../shared/api-v1.js';
import { toast } from '../kit/toast.js';
import { stageHref } from '../lx-project/context.js';

const HERE = import.meta.url;
const MAPLIBRE = new URL('../../proto/vendor/maplibre/', HERE).href;
const PMTILES = new URL('../../xi/vendor/pmtiles/pmtiles.js', HERE).href;
const TOOLS = [['select', '선택', 'V'], ['poly', '다각형', 'P'], ['box', '사각형', 'R']];
const COLORS = ['#0FA9A0', '#FF7A45', '#3182F6', '#F04452', '#8C5EFF', '#FFC400', '#00B85C', '#FF5CB8'];
const HIT = 10;
const EMPTY = { type: 'FeatureCollection', features: [] };
const clone = (x) => JSON.parse(JSON.stringify(x));
const tm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const nf = (n) => Number(n || 0).toLocaleString('ko-KR');

/* 지도 엔진 — 라벨링 칸이 열리기 전에 미리 받기 시작한다(app.js).
   화면 HTML 이 남는 시간에 미리 받아 둔 판 번호 주소(link prefetch · 공개 관문)를 그대로 써서 브라우저 보관본에서 바로 읽는다 · 둘을 함께 받는다. */
const vurl = (u) => {
  const path = new URL(u).pathname;
  const el = [...document.querySelectorAll('link[href],script[src]')].find((x) => new URL(x.href || x.src, location.href).pathname === path && /[?&]v=/.test(x.href || x.src));
  return el ? (el.href || el.src) : u;
};
const loadScript = (src) => new Promise((ok, no) => {
  const s = document.querySelector(`script[src="${src}"]`);
  if (s && s.dataset.done) return ok();
  const el = s || h('script', { src });
  el.addEventListener('load', () => { el.dataset.done = '1'; ok(); }, { once: true });
  el.addEventListener('error', () => no(new Error('지도를 불러오지 못했습니다')), { once: true });
  if (!s) document.head.append(el);
});
let libs = null;
export function warmMap() {
  for (const f of [vurl(MAPLIBRE + 'maplibre-gl.css'), new URL('../kit/stage.css', HERE).href]) {
    if (!document.querySelector(`link[rel="stylesheet"][href="${f}"]`)) document.head.append(h('link', { rel: 'stylesheet', href: f }));
  }
  libs ||= (async () => {
    const stage = import('../kit/stage.js');
    const src = import('../../xi/engine/sources.js');
    const ml = window.maplibregl ? null : loadScript(vurl(MAPLIBRE + 'maplibre-gl.js'));
    const pm = window.pmtiles ? null : loadScript(vurl(PMTILES)).catch(() => null);
    await ml; await pm;
    return { ...(await stage), ...(await src) };
  })().catch((e) => { libs = null; throw e; });
  return libs;
}

/** 지도 라벨링 칸 — data = GET /projects/{id}/labeling/map(미리 받은 것) · toggle = '지도 | 그림' 단추 */
export async function labelMap({ host, pid, data, toggle, onReload }) {
  const T0 = performance.now();
  const M = {
    set: data.set, imagery: data.imagery || [], maps: data.maps || {}, areas: data.areas || [], chips: data.chips || [], outline: data.outline,
    can: !!data.can_edit, start: data.start_classes || [], areaMax: data.params?.area_max || 40, maxImages: data.params?.max_images || 200,
    iid: null, shapes: [], at: null, tool: 'select', cls: 0, sel: -1, dirty: false, hist: [], redo: [], spots: [], spotI: -1,
  };
  const SPOTS = new Map(data.pick ? [[data.pick, Promise.resolve({ spots: data.spots || [] })]] : []);   // 처음 영상의 AI 결과 자리는 같이 받아 온다(왕복 한 번 덜기)
  const P = { id: pid };
  primeSign(data.pick_sign);

  /* ── 뼈대 ── */
  const prog = h('div.lb-prog');
  const toTrain = h('a.t-btn.t-btn--2.lb-totrain', { href: stageHref(P, 'train'), text: '학습으로' });
  const top = h('div.lb-top', {}, prog, h('div.lb-top-act', {}, toggle || '', toTrain));
  const toolbar = h('div.lm-tools', { role: 'toolbar', 'aria-label': '그리기 도구' });
  const mapEl = h('div.lm-map', { 'aria-label': '라벨 그리는 지도' });
  const zoomIn = h('button.lm-z', { type: 'button', 'aria-label': '확대', text: '+' });
  const zoomOut = h('button.lm-z', { type: 'button', 'aria-label': '축소', text: '−' });
  const wait = h('p.lm-wait', { role: 'status', text: '지도를 여는 중' });
  const stageBox = h('div.lm-stage', {}, mapEl, toolbar, h('div.lm-zoom', {}, zoomIn, zoomOut), wait);
  const saveMsg = h('span.lb-save', { role: 'status', 'aria-live': 'polite' });
  const spotBtn = h('button.t-btn.t-btn--2', { type: 'button', hidden: true });
  const doneBtn = h('button.t-btn', { type: 'button', text: '이 화면 라벨 완료' });
  const foot = h('div.lb-foot', {}, saveMsg, h('div.lb-foot-act', {}, spotBtn, M.can ? doneBtn : ''));
  const hint = h('p.lb-hint');
  const center = h('section.lb-center.lm-center', {}, stageBox, foot, hint);
  const imgBox = h('div.lm-img');
  const clsBox = h('div.lb-cls');
  const shBox = h('div.lm-list');
  const arBox = h('div.lm-list');
  const right = h('aside.lb-right.lm-right', {}, imgBox, clsBox, shBox, arBox);
  const body = h('div.lm-body', {}, center, right);
  const card = h('section.lb.lm.t-card', { 'aria-label': '지도 라벨링' }, top, body);
  host.replaceChildren(card);

  /* ── 진행 ── */
  function drawProg() {
    const total = M.set?.total?.value ?? 0, done = M.set?.done?.value ?? 0;
    let nShapes = M.shapes.length;
    for (const [k, v] of Object.entries(M.maps)) if (k !== M.iid) nShapes += (v.shapes || []).length;
    prog.replaceChildren(
      h('p.lb-prog-t', {}, h('b.num', { text: nf(done) }), h('span', { text: ` / ${nf(total)}장 라벨 완료` }), h('em', { text: ` · 지도에 그린 모양 ${nf(nShapes)}개` })),
      h('div.t-progress.lb-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-valuenow': done, 'aria-label': '라벨 완료' },
        h('i', { style: { width: total ? `${(done / total) * 100}%` : '0' } })));
    toTrain.hidden = !done;
  }

  /* ── 클래스 ── */
  const classes = () => M.set?.classes || M.start.map((name, i) => ({ name, color: COLORS[i % COLORS.length] }));
  const colorOf = (c) => classes()[c]?.color || COLORS[0];
  let manage = false;
  function drawCls() {
    const cs = classes();
    const used = new Map(); for (const s of M.shapes) used.set(s.c, (used.get(s.c) || 0) + 1);
    const head = h('div.lb-cls-h', {}, h('h3', { text: '클래스' }),
      M.can ? h('button.lb-link', { type: 'button', text: manage ? '닫기' : '고치기', onclick: () => { manage = !manage; drawCls(); } }) : '');
    if (!manage) {
      clsBox.replaceChildren(head, h('ul.lb-cls-l', {}, ...cs.map((c, i) => h('li', {}, h('button.lb-cls-r', { type: 'button', 'aria-pressed': String(i === M.cls),
        onclick: () => setCls(i) }, h('i', { style: { background: c.color } }), h('span', { text: c.name }),
        used.get(i) ? h('small', { text: `${used.get(i)}개` }) : '', i < 9 ? h('kbd', { text: String(i + 1), title: `글쇠 ${i + 1}` }) : '')))));
      return;
    }
    const rows = cs.map((c, i) => h('li.lb-cls-e', {}, h('input.lb-col', { type: 'color', value: c.color, 'aria-label': '클래스 색' }),
      h('input.t-input', { value: c.name, maxlength: '40', 'aria-label': '클래스 이름' }),
      cs.length > 1 ? h('button.lb-link.lb-drop', { type: 'button', text: '빼기', onclick: () => saveCls({ drop: i }) }) : ''));
    const add = h('input.t-input', { placeholder: '새 클래스 이름', maxlength: '40', 'aria-label': '새 클래스 이름' });
    const ok = h('button.t-btn', { type: 'button', text: '저장', onclick: () => {
      const names = rows.map((r) => r.querySelector('input:not([type=color])').value.trim());
      const colors = rows.map((r) => r.querySelector('input[type=color]').value);
      if (add.value.trim()) { names.push(add.value.trim()); colors.push(COLORS[names.length % COLORS.length]); }
      saveCls({ names, colors });
    } });
    clsBox.replaceChildren(head, h('ul.lb-cls-l', {}, ...rows), h('div.lb-cls-add', {}, add), ok, h('p.lb-note', { text: '쓴 클래스는 뺄 수 없습니다 · 이름을 바꿔 쓰세요' }));
  }
  async function saveCls(b) {
    try {
      await flush();
      const j = await api(`/projects/${encodeURIComponent(pid)}/labeling/classes`, { method: 'PATCH', body: b });
      M.set = j.set; manage = false; M.cls = Math.min(M.cls, classes().length - 1);
      if (b.drop != null) return onReload?.();             // 클래스 번호가 당겨졌다 — 지도 모양도 서버 것으로 다시
      drawCls(); paint(); toast('클래스를 저장했습니다');
    } catch (e) { toast(e?.message || '클래스를 저장하지 못했습니다'); }
  }
  function setCls(i) {
    if (i < 0 || i >= classes().length) return;
    M.cls = i;
    if (M.sel >= 0 && M.can && M.shapes[M.sel] && M.shapes[M.sel].c !== i) { push(); M.shapes[M.sel].c = i; changed(); return; }
    drawCls(); paint();
  }

  /* ── 오른쪽 목록: 영상 · 그린 모양 · 라벨 완료한 곳 ── */
  function drawImg() {
    if (M.imagery.length < 2) { imgBox.replaceChildren(h('h3.lm-h', { text: '영상' }), h('p.lm-imgname', { text: cur()?.name || '' })); return; }
    const sel = h('select.t-input', { 'aria-label': '영상' }, ...M.imagery.map((x) => h('option', { value: x.id, text: x.name, selected: x.id === M.iid })));
    sel.addEventListener('change', () => pick(sel.value, true));
    imgBox.replaceChildren(h('h3.lm-h', { text: '영상' }), sel);
  }
  const KW = { poly: '다각형', box: '사각형' };
  function drawShapes() {
    const cs = classes();
    const rows = M.shapes.map((s, i) => h('li', {}, h('button.lm-row', { type: 'button', 'aria-current': i === M.sel ? 'true' : null, onclick: () => { selectShape(i); flyShape(i); } },
      h('i', { style: { background: colorOf(s.c) } }), h('span', { text: `${cs[s.c]?.name || ''} · ${KW[s.k] || '다각형'}` }))));
    shBox.replaceChildren(h('h3.lm-h', {}, '그린 모양', h('small.num', { text: ` ${nf(M.shapes.length)}개` })),
      rows.length ? h('ol.lm-rows', { 'aria-label': '그린 모양' }, ...rows.reverse()) : h('p.lb-note', { text: M.can ? '지도 위에 다각형 · 사각형을 그립니다' : '아직 그린 모양이 없습니다' }));
    shBox.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function drawAreas() {
    const mine = M.areas.filter((a) => a.imagery_id === M.iid);
    const rows = mine.map((a, k) => {
      const n = M.chips.filter((c) => c.area === a.id).length;
      return h('li.lm-ar', {}, h('button.lm-row', { type: 'button', onclick: () => flyArea(a.id) }, h('i.lm-ar-i'),
        h('span', {}, h('b', { text: `${k + 1}번째 자리 · 그림 ${nf(n)}장` }), h('small', { text: [a.by, tm(a.at)].filter(Boolean).join(' · ') }))),
        M.can ? h('button.lb-link.lb-drop', { type: 'button', text: '풀기', onclick: () => undoArea(a.id) }) : '');
    });
    arBox.replaceChildren(h('h3.lm-h', { text: '라벨 완료한 곳' }),
      rows.length ? h('ul.lm-rows', {}, ...rows) : h('p.lb-note', { text: '다 그린 화면에서 ‘이 화면 라벨 완료’를 누르면 그 자리가 학습 그림이 됩니다' }));
  }

  /* ── 도구 ── */
  function drawTools() {
    const b = (k, w, key) => h('button.lb-tool', { type: 'button', 'aria-pressed': String(M.tool === k), title: `${w} (${key})`, onclick: () => setTool(k) }, h('span', { text: w }), h('kbd', { text: key }));
    const ub = h('button.lb-tool', { type: 'button', title: '되돌리기 (Ctrl+Z)', disabled: !M.hist.length, onclick: undo, text: '되돌리기' });
    const rb = h('button.lb-tool', { type: 'button', title: '다시 하기 (Ctrl+Shift+Z)', disabled: !M.redo.length, onclick: redo, text: '다시 하기' });
    const db = h('button.lb-tool', { type: 'button', title: '삭제 (Delete)', disabled: M.sel < 0, onclick: delSel, text: '삭제' });
    const close = D.pts.length >= 3 ? h('button.lb-tool.lb-close', { type: 'button', onclick: finishPoly, text: '다각형 닫기' }) : '';
    const fit = h('button.lb-tool', { type: 'button', title: '영상 전체 (F)', onclick: fitImagery, text: '영상 전체' });
    toolbar.replaceChildren(...(M.can ? [...TOOLS.map(([k, w, key]) => b(k, w, key)), h('i.lb-sep'), ub, rb, db, close, h('i.lb-sep')] : []), fit);
    const tip = !M.can ? '보기만 할 수 있습니다 · 라벨링은 프로젝트장 · 구성원이 합니다'
      : M.tool === 'poly' ? '눌러 꼭짓점을 찍고, 첫 점 · 두 번 누르기 · Enter 로 닫습니다 · 끌면 지도가 움직입니다'
      : M.tool === 'box' ? '끌어서 사각형을 그립니다 · 지도를 옮길 때는 스페이스를 누른 채 끕니다'
      : '모양을 눌러 고르고 꼭짓점을 끕니다 · 변 가운데 점 = 꼭짓점 더하기 · 두 번 누르기 = 빼기';
    hint.replaceChildren(h('span', { text: tip }), h('span.lb-keys', { text: M.can ? 'V 선택 · P 다각형 · R 사각형 · 1–9 클래스 · Ctrl+Z 되돌리기 · D 이 화면 라벨 완료' : '휠 확대 · 끌어서 이동' }));
  }
  function setTool(k) { if (!M.can) return; cancelPoly(); M.tool = k; if (k !== 'select') M.sel = -1; drawTools(); drawShapes(); paint(); cursor(); }

  /* ── 지도 ── */
  let L, map = null;
  const D = { pts: [], hover: null };
  let drag = null;
  let tLibs = 0, tStage = 0;
  try {
    L = await warmMap();
    tLibs = Math.round(performance.now() - T0);
    const st = L.createStage(mapEl, { interactive: true, scale: true, worldCredit: false, padding: 40 });
    await st.ready;
    tStage = Math.round(performance.now() - T0);
    map = st.map;
  } catch (e) { wait.textContent = e?.message || '지도를 불러오지 못했습니다'; return; }
  map.doubleClickZoom.disable();
  map.dragRotate.disable(); map.touchZoomRotate.disableRotation(); map.keyboard.disable();
  map.setMaxZoom(22);
  new ResizeObserver(() => { try { map.resize(); } catch { /* 닫힘 */ } }).observe(mapEl);
  // 둘레는 옅게 — 프로젝트 영상이 또렷이 앞으로(영상 크게 보기와 같은 판)
  for (const id of ['k-world', 'k-vw']) if (map.getLayer(id)) { map.setPaintProperty(id, 'raster-opacity', 0.45); map.setPaintProperty(id, 'raster-saturation', -0.85); map.setPaintProperty(id, 'raster-brightness-min', 0.5); }
  const before = map.getLayer('slot-overlay') ? 'slot-overlay' : undefined;
  map.addSource('lm-out', { type: 'geojson', data: M.outline || EMPTY });
  map.addLayer({ id: 'lm-out', type: 'line', source: 'lm-out', paint: { 'line-color': '#1C1F25', 'line-width': 1.6, 'line-opacity': 0.55, 'line-dasharray': [3, 2] } }, before);
  map.addSource('lm-chip', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'lm-chip-f', type: 'fill', source: 'lm-chip', filter: ['==', ['get', 'area'], true], paint: { 'fill-color': '#FFFFFF', 'fill-opacity': 0.08 } }, before);
  map.addLayer({ id: 'lm-chip-l', type: 'line', source: 'lm-chip', paint: { 'line-color': ['case', ['get', 'area'], '#FFFFFF', '#B0B8C1'], 'line-width': ['case', ['get', 'area'], 1.6, 1.2], 'line-dasharray': [2, 2] } }, before);
  map.addSource('lm-spot', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'lm-spot', type: 'circle', source: 'lm-spot', minzoom: 11, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 1.5, 15, 3, 18, 6], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': '#0FA9A0', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.9 } }, before);   // AI 결과 자리 = 청록 고리(꼭짓점 손잡이 · 모양과 다르게)
  map.addSource('lm-sh', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'lm-sh-f', type: 'fill', source: 'lm-sh', paint: { 'fill-color': ['get', 'col'], 'fill-opacity': ['case', ['get', 'sel'], 0.36, 0.24] } }, before);
  map.addLayer({ id: 'lm-sh-w', type: 'line', source: 'lm-sh', filter: ['get', 'sel'], paint: { 'line-color': '#FFFFFF', 'line-width': 4.5 } }, before);
  map.addLayer({ id: 'lm-sh-l', type: 'line', source: 'lm-sh', paint: { 'line-color': ['get', 'col'], 'line-width': 2 } }, before);
  map.addSource('lm-dr', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'lm-dr-l', type: 'line', source: 'lm-dr', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': ['get', 'col'], 'line-width': 2, 'line-dasharray': [3, 2] } }, before);
  map.addLayer({ id: 'lm-dr-p', type: 'circle', source: 'lm-dr', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': ['case', ['get', 'first'], 6, 3.5], 'circle-color': ['case', ['get', 'first'], '#FFFFFF', ['get', 'col']], 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': 2 } }, before);
  map.addSource('lm-vx', { type: 'geojson', data: EMPTY });
  map.addLayer({ id: 'lm-mid', type: 'circle', source: 'lm-vx', filter: ['==', ['get', 'mid'], true], paint: { 'circle-radius': 4, 'circle-color': '#FFFFFF', 'circle-opacity': 0.92, 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': 1.5 } }, before);
  map.addLayer({ id: 'lm-vtx', type: 'circle', source: 'lm-vx', filter: ['!=', ['get', 'mid'], true], paint: { 'circle-radius': 5.5, 'circle-color': '#FFFFFF', 'circle-stroke-color': ['get', 'col'], 'circle-stroke-width': 2.2 } }, before);
  zoomIn.addEventListener('click', () => map.zoomIn({ duration: 250 }));
  zoomOut.addEventListener('click', () => map.zoomOut({ duration: 250 }));

  const cur = () => M.imagery.find((x) => x.id === M.iid) || null;
  const nativeZ = (x, lat) => Math.log2(78271.517 * Math.cos(lat * Math.PI / 180) / Math.max(0.1, x?.gsd_m || 0.25));   // 지도 엔진 줌(512 화소 조각) — 화면 한 점 = 영상 한 점
  const ring = (g) => [...g, g[0]];
  const feat = (g, props) => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring(g)] } });

  function paint() {
    if (!map) return;
    map.getSource('lm-sh').setData({ type: 'FeatureCollection', features: M.shapes.map((s, i) => feat(s.g, { i, col: colorOf(s.c), sel: i === M.sel })) });
    const s = M.shapes[M.sel];
    const vx = [];
    if (s && M.can && M.tool === 'select') {
      const col = colorOf(s.c);
      s.g.forEach((q) => vx.push({ type: 'Feature', properties: { col }, geometry: { type: 'Point', coordinates: q } }));
      if (s.k !== 'box') s.g.forEach((q, j) => { const r = s.g[(j + 1) % s.g.length]; vx.push({ type: 'Feature', properties: { col, mid: true }, geometry: { type: 'Point', coordinates: [(q[0] + r[0]) / 2, (q[1] + r[1]) / 2] } }); });
    }
    map.getSource('lm-vx').setData({ type: 'FeatureCollection', features: vx });
    const col = colorOf(M.cls), dr = [];
    if (D.pts.length) {
      dr.push({ type: 'Feature', properties: { col }, geometry: { type: 'LineString', coordinates: D.hover ? [...D.pts, D.hover] : D.pts.length > 1 ? D.pts : [D.pts[0], D.pts[0]] } });
      D.pts.forEach((q, j) => dr.push({ type: 'Feature', properties: { col, first: j === 0 }, geometry: { type: 'Point', coordinates: q } }));
    }
    if (drag?.kind === 'box' && drag.b) dr.push({ type: 'Feature', properties: { col }, geometry: { type: 'LineString', coordinates: ring(boxOf(drag.a, drag.b)) } });
    map.getSource('lm-dr').setData({ type: 'FeatureCollection', features: dr });
  }
  function paintChips() {
    map.getSource('lm-chip').setData({ type: 'FeatureCollection', features: M.chips.filter((c) => c.imagery_id === M.iid && c.ring)
      .map((c) => ({ type: 'Feature', properties: { area: !!c.area }, geometry: { type: 'Polygon', coordinates: [c.ring] } })) });
  }
  function paintSpots() {
    map.getSource('lm-spot').setData({ type: 'FeatureCollection', features: M.spots.map(([x, y]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [x, y] } })) });
    const left = openSpots().length;
    spotBtn.hidden = !M.spots.length;
    spotBtn.textContent = left ? `다음 AI 결과 자리 · ${nf(left)}곳` : 'AI 결과 자리 · 모두 라벨함';
    spotBtn.disabled = !left;
  }
  const boxOf = (a, b) => { const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); return [[x0, y1], [x1, y1], [x1, y0], [x0, y0]]; };

  /* 화면 자리 ↔ 경위도 */
  const pos = (e) => { const r = map.getCanvasContainer().getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const toS = (q) => { const p = map.project(q); return [p.x, p.y]; };
  const toG = (xy) => { const l = map.unproject(xy); return [l.lng, l.lat]; };
  const near = (a, b, r = HIT) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const hitShape = (xy) => { for (let i = M.shapes.length - 1; i >= 0; i--) if (inside(xy, M.shapes[i].g.map(toS))) return i; return -1; };
  const mids = (pts) => pts.map((p, j) => { const q = pts[(j + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });

  /* 고치기 기록 — 영상마다 */
  function push() { M.hist.push(clone(M.shapes)); if (M.hist.length > 100) M.hist.shift(); M.redo = []; }
  function undo() { if (!M.hist.length) return; M.redo.push(clone(M.shapes)); M.shapes = M.hist.pop(); M.sel = -1; changed(); }
  function redo() { if (!M.redo.length) return; M.hist.push(clone(M.shapes)); M.shapes = M.redo.pop(); M.sel = -1; changed(); }
  function delSel() { if (M.sel < 0) return; push(); M.shapes.splice(M.sel, 1); M.sel = -1; changed(); }
  function changed() { M.dirty = true; drawTools(); drawCls(); drawShapes(); drawProg(); paint(); later(); }
  const newId = () => 's' + Math.random().toString(36).slice(2, 10);
  function finishPoly() {
    if (D.pts.length < 3) return;
    push(); M.shapes.push({ id: newId(), c: M.cls, k: 'poly', g: D.pts.slice() }); D.pts = []; D.hover = null;
    M.sel = M.shapes.length - 1; changed();
  }
  function cancelPoly() { if (D.pts.length) { D.pts = []; D.hover = null; drawTools(); paint(); } }
  function selectShape(i) { if (M.tool !== 'select' && M.can) { cancelPoly(); M.tool = 'select'; drawTools(); } M.sel = i; if (M.shapes[i]) M.cls = M.shapes[i].c; drawTools(); drawCls(); drawShapes(); paint(); }

  /* 누르기 · 끌기 — 지도가 먼저 끌기를 받지 않게 잡을 때만 지도 끌기를 잠시 끈다 */
  const cont = map.getCanvasContainer();
  let space = false, downAt = null;
  const take = () => map.dragPan.disable();
  const release = () => { if (!map.dragPan.isEnabled()) map.dragPan.enable(); };
  function cursor(xy) {
    const c = map.getCanvas();
    if (!M.can || space) { c.style.cursor = ''; return; }
    if (M.tool !== 'select') { c.style.cursor = 'crosshair'; return; }
    if (!xy) { c.style.cursor = ''; return; }
    const s = M.shapes[M.sel];
    if (s) { const pts = s.g.map(toS); if (pts.some((p) => near(p, xy)) || (s.k !== 'box' && mids(pts).some((p) => near(p, xy)))) { c.style.cursor = 'crosshair'; return; } }
    c.style.cursor = hitShape(xy) >= 0 ? 'move' : '';
  }
  cont.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !M.can || space || !e.isPrimary) return;
    const xy = pos(e);
    downAt = { xy, t: Date.now() };
    if (M.tool === 'poly') return;                       // 누르고 떼면 점 · 끌면 지도 이동(떼는 때 판정)
    if (M.tool === 'box') { take(); drag = { kind: 'box', a: toG(xy), b: null }; cont.setPointerCapture?.(e.pointerId); return; }
    const s = M.shapes[M.sel];
    if (s) {
      const pts = s.g.map(toS);
      const vi = pts.findIndex((p) => near(p, xy));
      if (vi >= 0) { take(); push(); drag = { kind: 'vtx', i: vi, moved: false }; return; }
      if (s.k !== 'box') { const mi = mids(pts).findIndex((p) => near(p, xy)); if (mi >= 0) { take(); push(); s.g.splice(mi + 1, 0, toG(xy)); drag = { kind: 'vtx', i: mi + 1, moved: true }; paint(); return; } }
    }
    const hi = hitShape(xy);
    if (hi >= 0) { take(); selectShape(hi); push(); drag = { kind: 'move', from: toG(xy), orig: clone(M.shapes[hi].g), moved: false }; return; }
    if (M.sel >= 0) { M.sel = -1; drawTools(); drawShapes(); paint(); }
  }, true);
  addEventListener('pointermove', (e) => {
    if (!card.isConnected) return;
    if (!map) return;
    const r = cont.getBoundingClientRect();
    const xy = [e.clientX - r.left, e.clientY - r.top];
    const over = xy[0] >= 0 && xy[1] >= 0 && xy[0] <= r.width && xy[1] <= r.height;
    if (!drag) {
      if (over && M.tool === 'poly' && D.pts.length) { D.hover = toG(xy); paint(); }
      if (over) cursor(xy);
      return;
    }
    if (drag.kind === 'box') { drag.b = toG(xy); paint(); return; }
    const s = M.shapes[M.sel];
    if (!s) return;
    if (drag.kind === 'vtx') {
      const u = toG(xy);
      if (s.k === 'box') {                               // 사각형은 사각형으로 — 맞은편 꼭짓점을 고정
        const o = s.g[(drag.i + 2) % 4];
        s.g = boxOf(o, u);
        drag.i = s.g.findIndex((q) => q[0] === u[0] && q[1] === u[1]); if (drag.i < 0) drag.i = 0;
      } else s.g[drag.i] = u;
      drag.moved = true; paint(); return;
    }
    if (drag.kind === 'move') {
      const u = toG(xy), dx = u[0] - drag.from[0], dy = u[1] - drag.from[1];
      s.g = drag.orig.map(([a, b]) => [a + dx, b + dy]);
      drag.moved = drag.moved || Math.hypot(...toS(u).map((v, k) => v - toS(drag.from)[k])) > 2; paint();
    }
  });
  function up(e) {
    if (!card.isConnected || !map) return;
    const r = cont.getBoundingClientRect();
    const xy = [e.clientX - r.left, e.clientY - r.top];
    const d0 = downAt; downAt = null;
    if (drag?.kind === 'box') {
      const g = drag.b ? boxOf(drag.a, drag.b) : null;
      drag = null; release();
      if (g) { const [p, q] = [toS(g[0]), toS(g[2])]; if (Math.abs(p[0] - q[0]) > 4 && Math.abs(p[1] - q[1]) > 4) { push(); M.shapes.push({ id: newId(), c: M.cls, k: 'box', g }); M.sel = M.shapes.length - 1; changed(); return; } }
      paint(); return;
    }
    if (drag) { const moved = drag.moved; drag = null; release(); if (moved) changed(); else { M.hist.pop(); paint(); } return; }
    if (M.tool === 'poly' && d0 && M.can && Math.hypot(xy[0] - d0.xy[0], xy[1] - d0.xy[1]) < 5 && e.target && cont.contains(e.target)) {
      if (D.pts.length >= 3 && near(xy, toS(D.pts[0]), 12)) { finishPoly(); return; }
      D.pts.push(toG(xy)); drawTools(); paint();
    }
  }
  addEventListener('pointerup', up);
  addEventListener('pointercancel', () => { if (drag) { drag = null; release(); paint(); } downAt = null; });
  cont.addEventListener('dblclick', (e) => {
    if (!M.can) return;
    e.preventDefault();
    const xy = pos(e);
    if (M.tool === 'poly') {                             // 두 번 누르기 = 닫기(두 번째 누름이 찍은 같은 자리 점은 뺀다)
      const a = D.pts[D.pts.length - 1], b = D.pts[D.pts.length - 2];
      if (a && b && near(toS(a), toS(b), 6)) D.pts.pop();
      finishPoly(); return;
    }
    if (M.tool === 'select' && M.sel >= 0) {
      const s = M.shapes[M.sel];
      if (s.k === 'box' || s.g.length <= 3) return;
      const vi = s.g.map(toS).findIndex((p) => near(p, xy));
      if (vi >= 0) { push(); s.g.splice(vi, 1); changed(); }
    }
  });
  cont.addEventListener('contextmenu', (e) => e.preventDefault());

  /* 글쇠 */
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  function onKey(e) {
    if (!card.isConnected) { removeEventListener('keydown', onKey); return; }
    if (typing(e) || e.altKey) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === ' ' && M.can && (stageBox.contains(document.activeElement) || document.activeElement === document.body)) { e.preventDefault(); if (!space) { space = true; release(); cursor(); } return; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); flush(true); return; }
    if (mod) return;
    if (k === 'Enter' && D.pts.length) { e.preventDefault(); finishPoly(); return; }
    if (k === 'Escape') { if (D.pts.length) cancelPoly(); else if (M.sel >= 0) { M.sel = -1; drawTools(); drawShapes(); paint(); } return; }
    if (k === 'Backspace' && D.pts.length) { e.preventDefault(); D.pts.pop(); drawTools(); paint(); return; }
    if ((k === 'Delete' || k === 'Backspace') && M.sel >= 0 && M.can) { e.preventDefault(); delSel(); return; }
    if (k === 'f' || k === 'F') { fitImagery(); return; }
    if (k === 'v' || k === 'V') return setTool('select');
    if (k === 'p' || k === 'P') return setTool('poly');
    if (k === 'r' || k === 'R') return setTool('box');
    if ((k === 'd' || k === 'D') && M.can) { e.preventDefault(); markArea(); return; }
    if ((k === 'n' || k === 'N') && M.spots.length) { nextSpot(); return; }
    if (/^[1-9]$/.test(k)) setCls(+k - 1);
  }
  addEventListener('keydown', onKey);
  addEventListener('keyup', (e) => { if (e.key === ' ' && space) { space = false; if (M.tool === 'box' && drag) take(); cursor(); } });

  /* ── 저장 ── */
  let timer = null, saving = null;
  function later() { clearTimeout(timer); saveMsg.textContent = '저장 전'; timer = setTimeout(() => flush(), 1500); }
  async function flush(say = false) {
    clearTimeout(timer);
    if (saving) await saving.catch(() => {});
    if (!M.dirty || !M.can || !M.iid) { if (say) toast('저장했습니다'); return true; }
    M.dirty = false;
    saveMsg.textContent = '저장 중';
    const iid = M.iid, sent = clone(M.shapes);
    saving = api(`/projects/${encodeURIComponent(pid)}/labeling/map/${encodeURIComponent(iid)}`, { method: 'PUT', body: { shapes: sent, at: M.at } });
    try {
      const j = await saving;
      took(j);
      if (M.iid === iid) { M.at = j.maps?.[iid]?.at || M.at; if (!M.dirty) M.shapes = (j.maps?.[iid]?.shapes || sent).map((s) => ({ ...s })); }
      who(); drawProg(); drawAreas(); paintChips(); paint(); drawShapes();
      if (say) toast('저장했습니다');
      return true;
    } catch (e) {
      M.dirty = true;
      saveMsg.textContent = '저장하지 못함';
      toast(e?.status === 409 ? '다른 사람이 먼저 이 영상의 라벨을 고쳤습니다 — 다시 불러옵니다' : (e?.message || '저장하지 못했습니다'));
      if (e?.status === 409) setTimeout(() => onReload?.(), 1200);
      return false;
    } finally { saving = null; }
  }
  function took(j) {
    if (j.set) M.set = j.set;
    if (j.maps) M.maps = j.maps;
    if (j.areas) M.areas = j.areas;
    if (j.chips) M.chips = j.chips;
  }
  function who() {
    const m = M.maps[M.iid];
    saveMsg.textContent = m?.at ? `저장됨 ${tm(m.at)}${m.by ? ` · ${m.by}` : ''}` : '';
  }
  addEventListener('beforeunload', () => { if (M.dirty) flush(); });

  /* ── 이 화면 라벨 완료 · 풀기 ── */
  async function markArea() {
    if (!M.can || !M.iid) return;
    if (D.pts.length >= 3) finishPoly();
    if (!(await flush())) return;
    const b = map.getBounds();
    doneBtn.disabled = true; doneBtn.textContent = '그림 만드는 중';
    try {
      const j = await api(`/projects/${encodeURIComponent(pid)}/labeling/map/${encodeURIComponent(M.iid)}/areas`, { method: 'POST', body: { bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] } });
      took(j);
      const made = M.chips.filter((c) => c.area === M.areas[M.areas.length - 1]?.id);
      const objs = made.reduce((a, c) => a + (c.n || 0), 0);
      toast(`그림 ${nf(j.added?.value)}장을 라벨 완료했습니다 · 모양 ${nf(objs)}개${j.skipped?.value ? ` · 이미 있는 그림 ${nf(j.skipped.value)}장은 그대로` : ''}`);
      drawProg(); drawAreas(); paintChips(); paintSpots();
    } catch (e) {
      // 화면이 그림 한 장보다 좁으면 한 단계 넓혀 보여 준다 — 가장자리까지 그렸는지 보고 다시 누르게
      if (e?.detail?.wider) { map.easeTo({ zoom: map.getZoom() - 1, duration: 400 }); toast('그림 한 장 넓이가 보이도록 지도를 넓혔습니다 · 가장자리까지 그렸는지 보고 다시 누르세요'); }
      else toast(e?.message || '라벨 완료하지 못했습니다');
    }
    finally { doneBtn.disabled = false; doneBtn.textContent = '이 화면 라벨 완료'; }
  }
  doneBtn.addEventListener('click', markArea);
  async function undoArea(aid) {
    try {
      await flush();
      const j = await api(`/projects/${encodeURIComponent(pid)}/labeling/map/areas/${encodeURIComponent(aid)}`, { method: 'DELETE' });
      took(j); drawProg(); drawAreas(); paintChips(); paintSpots(); toast('라벨 완료를 풀었습니다 · 그린 모양은 그대로입니다');
    } catch (e) { toast(e?.message || '풀지 못했습니다'); }
  }

  /* ── 자리 옮기기 ── */
  const bboxOf = (pts) => pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [180, 90, -180, -90]);
  const zFit = () => Math.min(22, nativeZ(cur(), map.getCenter().lat) + 0.5);
  function flyShape(i) { const s = M.shapes[i]; if (s) map.fitBounds(bboxOf(s.g), { padding: 120, maxZoom: zFit(), duration: 500 }); }
  function flyArea(aid) { const pts = M.chips.filter((c) => c.area === aid).flatMap((c) => c.ring); if (pts.length) map.fitBounds(bboxOf(pts), { padding: 40, duration: 500 }); }
  function fitImagery() { const b = cur()?.item?.bounds; if (b) map.fitBounds(b, { padding: 32, duration: 400 }); }
  const inChip = (x, y) => M.chips.some((c) => c.imagery_id === M.iid && c.ring && inside([x, y], c.ring));
  const openSpots = () => M.spots.filter(([x, y]) => !inChip(x, y));
  function nextSpot() {
    const open = openSpots();
    if (!open.length) return;
    M.spotI = (M.spotI + 1) % open.length;
    const [x, y] = open[M.spotI];
    map.flyTo({ center: [x, y], zoom: Math.max(16, nativeZ(cur(), y) - 1.2), duration: 700 });
  }
  spotBtn.addEventListener('click', nextSpot);

  /* ── 영상 고르기 ── */
  let ready = false;
  async function pick(iid, fly) {
    if (iid === M.iid) return;
    if (M.iid) await flush();
    cancelPoly();
    M.iid = iid; M.sel = -1; M.hist = []; M.redo = []; M.dirty = false; M.spots = []; M.spotI = -1;
    const x = cur();
    M.shapes = clone(M.maps[iid]?.shapes || []);
    M.at = M.maps[iid]?.at || null;
    for (const id of ['lm-img']) { if (map.getLayer(id)) map.removeLayer(id); if (map.getSource(id)) map.removeSource(id); }
    const it = x.item;
    const spec = await L.sourceSpec(it);
    map.addSource('lm-img', { ...spec, tileSize: 256, bounds: it.bounds, minzoom: Math.max(0, (it.minzoom ?? 0) - 3), maxzoom: it.maxzoom ?? 19 });
    map.addLayer({ id: 'lm-img', type: 'raster', source: 'lm-img', paint: { 'raster-fade-duration': 0 } }, 'lm-out');
    drawImg(); drawCls(); drawShapes(); drawAreas(); drawTools(); drawProg(); who(); paint(); paintChips(); paintSpots();
    if (!SPOTS.has(iid)) SPOTS.set(iid, api(`/projects/${encodeURIComponent(pid)}/labeling/map/spots?imagery=${encodeURIComponent(iid)}`).catch(() => ({ spots: [] })));
    const sp = SPOTS.get(iid);
    const apply = (j) => { if (M.iid !== iid) return; M.spots = j?.spots || []; paintSpots(); };
    if (fly === false) { sp.then(apply); return; }
    if (M.shapes.length) { sp.then(apply); firstView(); return; }
    apply(await sp);                                      // 모양이 아직 없으면 AI 결과가 있는 자리부터(라벨할 대상이 바로 보이게)
    if (M.iid !== iid) return;
    firstView();
  }
  function firstView() {
    const x = cur();
    if (M.shapes.length) { map.fitBounds(bboxOf(M.shapes.flatMap((s) => s.g)), { padding: 80, maxZoom: zFit(), duration: 0 }); return; }
    const open = openSpots();
    if (open.length) { M.spotI = 0; map.jumpTo({ center: open[0].slice(0, 2), zoom: Math.max(16, nativeZ(x, open[0][1]) - 1.2) }); return; }
    const b = x?.item?.bounds;
    if (b) map.fitBounds(b, { padding: 32, duration: 0 });
  }

  /* 처음 영상 — 모양이 가장 많은 영상 → 항공 해상도(0.05–0.5 m) 중 가장 최근 → 첫 영상 */
  const most = M.imagery.map((x) => [x, (M.maps[x.id]?.shapes || []).length]).sort((a, b) => b[1] - a[1])[0];
  const first = M.imagery.find((x) => x.id === data.pick) || (most && most[1] ? most[0] : null) || M.imagery.find((x) => x.gsd_m >= 0.05 && x.gsd_m <= 0.5) || M.imagery[0];
  await pick(first.id, true);
  /* 준비 = 영상 조각이 처음 그려진 때(점검용 시간 기록 · '지도를 여는 중' 걷기) */
  const tPick = Math.round(performance.now() - T0);
  await new Promise((ok) => {                            // 첫 그리기로 조각을 부른 뒤, 프로젝트 영상 조각이 다 도착하면(바탕 위성은 기다리지 않는다)
    let armed = false;
    const to = setTimeout(done, 8000);
    function done() { clearTimeout(to); map.off('render', on); ok(); }
    function on() { if (!armed) { armed = true; return; } if (map.getSource('lm-img') && map.isSourceLoaded('lm-img') && !map.isMoving()) done(); }
    map.on('render', on); map.triggerRepaint();
  });
  wait.hidden = true;
  ready = true;
  mapEl.dataset.ready = '1';
  window.__lmTiming = { ms: Math.round(performance.now() - T0), nav: Math.round(performance.now()), libs: tLibs, stage: tStage, pick: tPick, at: Date.now() };
  document.documentElement.dataset.labelMapReady = '1';
  cursor();
  return { flush, ready: () => ready, destroy: () => { removeEventListener('keydown', onKey); removeEventListener('pointerup', up); try { map.remove(); } catch { /* 닫힘 */ } } };
}
