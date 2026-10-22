/* label.js — 학습데이터 구축 · 플랫폼 안 수동 라벨링(10-18 · 원칙 55 · 74 · 확인 L-1 · 라벨-1 '1차 수동' · 질문 12 ⓐ 플랫폼 안 그리기).
   그림 목록(n / N장 라벨 완료) · 그리는 판(확대 · 이동 · 다각형 · 사각형 · 꼭짓점 고치기 · 옮기기 · 삭제 · 되돌리기) · 클래스(더하기 · 이름 · 색).
   꼭짓점 고치기 문법은 XI맵 그 자리 고치기(xi-clean/edit.js)와 같다 — 꼭짓점 끌기 · 변 가운데 점 끌기 = 꼭짓점 더하기 · 꼭짓점 두 번 누르기 = 빼기.
   저장 = 서버 학습데이터 묶음(올린 묶음과 같은 모양) — '라벨 완료' 그림만 학습에 들어간다(server/landxi_api/labeling.py).
   화면 글에 경로 · id · 좌표를 쓰지 않는다. */
import { h, api } from '../kit/util.js';
import { toast } from '../kit/toast.js';
import { empty } from '../kit/empty.js';
import { stageHref } from '../lx-project/context.js';

const WORD = { todo: '라벨 안 함', done: '라벨 완료', check: '확인 필요' };
const TOOLS = [['select', '선택', 'V'], ['poly', '다각형', 'P'], ['box', '사각형', 'R']];
const HIT = 9;                       // 꼭짓점 잡는 거리(화면 px)
const tm = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const clone = (x) => JSON.parse(JSON.stringify(x));
const blobs = new Map();
async function imgUrl(src) {
  if (blobs.has(src)) return blobs.get(src);
  const p = api(src, { raw: true }).then(async (r) => { if (!r.ok) throw new Error(String(r.status)); return URL.createObjectURL(await r.blob()); });
  blobs.set(src, p);
  p.catch(() => blobs.delete(src));
  return p;
}

export async function labelWork({ host, project, toggle }) {
  const P = project;
  const L = { set: null, images: [], imagery: [], can: false, i: -1, filter: 'all', tool: 'select', cls: 0, sel: -1, dirty: false, at: null, hist: [], redo: [] };
  const wait = h('div.lb-wait'); host.replaceChildren(wait);
  empty(wait, { kind: 'loading' });
  try { Object.assign(L, pick(await api(`/projects/${encodeURIComponent(P.id)}/labeling`))); }
  catch { wait.replaceChildren(); empty(wait, { kind: 'error', title: '라벨링 목록을 불러오지 못했습니다', onRetry: () => labelWork({ host, project, toggle }) }); return; }
  /* 지도에서 라벨 완료한 그림(area)은 여기서는 보기만 — 고치기는 지도에서(한 자리 한 출처) */
  const ed = () => L.can && !L.images[L.i]?.area;
  function pick(j) { return { set: j.set, images: j.images || [], imagery: j.imagery || [], can: !!j.can_edit, start: j.start_classes || [], addMax: j.params?.add_max || 20, maxImages: j.params?.max_images || 200 }; }

  /* ── 뼈대 ── */
  const prog = h('div.lb-prog');
  const addBtn = h('button.t-btn.t-btn--2.lb-add', { type: 'button', text: '그림 더하기' });
  const toTrain = h('a.t-btn.t-btn--2.lb-totrain', { href: stageHref(P, 'train'), text: '학습으로' });
  /* 라벨 미리 보기 격자(10-22 now21 제안-라벨미리보기격자 — "그림 여러 장의 라벨을 격자로 한꺼번에") — 누르면 그 그림을 한 장씩 보기로 */
  const gridBtn = h('button.t-btn.t-btn--2.lb-gridb', { type: 'button', text: '격자로 보기', 'aria-pressed': 'false' });
  const top = h('div.lb-top', {}, prog, h('div.lb-top-act', {}, toggle || '', gridBtn, toTrain, addBtn));
  const tabs = h('div.lb-tabs', { role: 'tablist', 'aria-label': '그림 거르기' });
  const list = h('ol.lb-list', { 'aria-label': '라벨링할 그림' });
  const left = h('aside.lb-left', {}, tabs, list);
  const toolbar = h('div.lb-tools', { role: 'toolbar', 'aria-label': '그리기 도구' });
  const cv = h('canvas.lb-cv', { tabindex: '0', 'aria-label': '라벨 그리는 판' });
  const stageEl = h('div.lb-stage', {}, cv);
  const hint = h('p.lb-hint');
  const saveMsg = h('span.lb-save', { role: 'status', 'aria-live': 'polite' });
  const checkBtn = h('button.t-btn.t-btn--2', { type: 'button', text: '확인 필요' });
  const doneBtn = h('button.t-btn', { type: 'button', text: '라벨 완료 · 다음' });
  const foot = h('div.lb-foot', {}, saveMsg, h('div.lb-foot-act', {}, checkBtn, doneBtn));
  const center = h('section.lb-center', {}, toolbar, stageEl, foot, hint);
  const clsBox = h('div.lb-cls');
  const meta = h('p.lb-meta');
  const right = h('aside.lb-right', {}, clsBox, meta);
  const body = h('div.lb-body', {}, left, center, right);
  const card = h('section.lb.t-card', { 'aria-label': '라벨링' }, top, body);
  host.replaceChildren(card);

  /* ── 진행 · 목록 ── */
  function counts() { const c = { done: 0, check: 0, todo: 0 }; for (const x of L.images) c[x.state]++; return c; }
  function drawProg() {
    const c = counts(), n = L.images.length;
    prog.replaceChildren(
      h('p.lb-prog-t', {}, h('b.num', { text: c.done.toLocaleString('ko-KR') }), h('span', { text: ` / ${n.toLocaleString('ko-KR')}장 라벨 완료` }),
        c.check ? h('em', { text: ` · 확인 필요 ${c.check}장` }) : ''),
      h('div.t-progress.lb-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': n, 'aria-valuenow': c.done, 'aria-label': '라벨 완료' },
        h('i', { style: { width: n ? `${(c.done / n) * 100}%` : '0' } })));
    toTrain.hidden = !c.done;
    addBtn.hidden = !L.can || n >= L.maxImages;
  }
  const FILTERS = [['all', '전체'], ['todo', '라벨 안 함'], ['check', '확인 필요']];
  function drawTabs() {
    const c = counts();
    tabs.replaceChildren(...FILTERS.map(([k, w]) => h('button.lb-tab', { type: 'button', role: 'tab', 'aria-selected': String(L.filter === k),
      text: k === 'all' ? w : `${w} ${c[k]}`, onclick: () => { L.filter = k; drawTabs(); drawList(); } })));
  }
  const shown = () => L.images.map((x, i) => [x, i]).filter(([x]) => L.filter === 'all' || x.state === L.filter);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); thumb(e.target); } }), { root: list, rootMargin: '200px' }) : null;
  function thumb(img) { imgUrl(img.dataset.src).then((u) => { img.src = u; }).catch(() => { img.dataset.err = '1'; }); }
  function drawList() {
    const rows = shown();
    if (!rows.length) { list.replaceChildren(h('li.lb-none', { text: L.images.length ? '이 상태의 그림이 없습니다' : '아직 그림이 없습니다' })); return; }
    list.replaceChildren(...rows.map(([x, i]) => {
      const im = h('img', { alt: '', dataset: { src: `${x.src}?size=112` } });
      const li = h('li', {}, h('button.lb-row', { type: 'button', 'aria-current': i === L.i ? 'true' : null, dataset: { st: x.state }, onclick: () => go(i) },
        im, h('span.lb-row-t', {}, h('b', { text: x.shapes?.length ? `${x.seq}번 · ${x.shapes.length}개` : `${x.seq}번` }), h('small', { text: x.area ? '라벨 완료 · 지도' : WORD[x.state] }))));
      if (io) io.observe(im); else thumb(im);
      return li;
    }));
    list.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  /* ── 클래스 ── */
  const classes = () => L.set?.classes || L.start.map((name, i) => ({ name, color: ['#0FA9A0', '#FF7A45', '#3182F6', '#F04452'][i % 4] }));
  const colorOf = (c) => classes()[c]?.color || '#0FA9A0';
  let manage = false;
  function drawCls() {
    const cs = classes();
    const cur = L.images[L.i];
    const used = new Map(); for (const s of cur?.shapes || []) used.set(s.c, (used.get(s.c) || 0) + 1);
    const head = h('div.lb-cls-h', {}, h('h3', { text: '클래스' }),
      L.can ? h('button.lb-link', { type: 'button', text: manage ? '닫기' : '고치기', onclick: () => { manage = !manage; drawCls(); } }) : '');
    if (!manage) {
      clsBox.replaceChildren(head, h('ul.lb-cls-l', {}, ...cs.map((c, i) => h('li', {}, h('button.lb-cls-r', { type: 'button', 'aria-pressed': String(i === L.cls),
        onclick: () => setCls(i) }, h('i', { style: { background: c.color } }), h('span', { text: c.name }),
        used.get(i) ? h('small', { text: `${used.get(i)}개` }) : '', i < 9 ? h('kbd', { text: String(i + 1), title: `글쇠 ${i + 1}` }) : '')))));
      return;
    }
    const rows = cs.map((c, i) => {
      const nm = h('input.t-input', { value: c.name, maxlength: '40', 'aria-label': '클래스 이름' });
      const col = h('input.lb-col', { type: 'color', value: c.color, 'aria-label': '클래스 색' });
      const drop = cs.length > 1 ? h('button.lb-link.lb-drop', { type: 'button', text: '빼기', onclick: () => saveCls({ drop: i }) }) : '';
      return h('li.lb-cls-e', {}, col, nm, drop);
    });
    const add = h('input.t-input', { placeholder: '새 클래스 이름', maxlength: '40', 'aria-label': '새 클래스 이름' });
    const ok = h('button.t-btn', { type: 'button', text: '저장', onclick: () => {
      const names = rows.map((r) => r.querySelector('input:not([type=color])').value.trim());
      const colors = rows.map((r) => r.querySelector('input[type=color]').value);
      if (add.value.trim()) { names.push(add.value.trim()); colors.push(['#0FA9A0', '#FF7A45', '#3182F6', '#F04452', '#8C5EFF', '#FFC400', '#00B85C', '#FF5CB8'][names.length % 8]); }
      saveCls({ names, colors });
    } });
    clsBox.replaceChildren(head, h('ul.lb-cls-l', {}, ...rows), h('div.lb-cls-add', {}, add), ok,
      h('p.lb-note', { text: '쓴 클래스는 뺄 수 없습니다 · 이름을 바꿔 쓰세요' }));
  }
  async function saveCls(body) {
    try {
      await flush();
      Object.assign(L, pick(await api(`/projects/${encodeURIComponent(P.id)}/labeling/classes`, { method: 'PATCH', body })));
      manage = false; L.cls = Math.min(L.cls, classes().length - 1); drawCls(); paint(); toast('클래스를 저장했습니다');
    } catch (e) { toast(e?.message || '클래스를 저장하지 못했습니다'); }
  }
  function setCls(i) {
    if (i < 0 || i >= classes().length) return;
    L.cls = i;
    const cur = L.images[L.i];
    if (cur && L.sel >= 0 && ed() && cur.shapes[L.sel].c !== i) { push(); cur.shapes[L.sel].c = i; changed(); }
    drawCls(); paint();
  }

  /* ── 도구 ── */
  function drawTools() {
    const b = (k, w, key) => h('button.lb-tool', { type: 'button', 'aria-pressed': String(L.tool === k), title: `${w} (${key})`, onclick: () => setTool(k) }, h('span', { text: w }), h('kbd', { text: key }));
    const ub = h('button.lb-tool', { type: 'button', title: '되돌리기 (Ctrl+Z)', disabled: !L.hist.length, onclick: undo, text: '되돌리기' });
    const rb = h('button.lb-tool', { type: 'button', title: '다시 하기 (Ctrl+Shift+Z)', disabled: !L.redo.length, onclick: redo, text: '다시 하기' });
    const db = h('button.lb-tool', { type: 'button', title: '삭제 (Delete)', disabled: L.sel < 0, onclick: delSel, text: '삭제' });
    const fit = h('button.lb-tool', { type: 'button', title: '맞춤 (F)', onclick: () => { fitView(); paint(); }, text: '맞춤' });
    const close = D.pts.length >= 3 ? h('button.lb-tool.lb-close', { type: 'button', onclick: finishPoly, text: '다각형 닫기' }) : '';
    toolbar.replaceChildren(...(ed() ? [...TOOLS.map(([k, w, key]) => b(k, w, key)), h('i.lb-sep'), ub, rb, db, close] : []), h('i.lb-sp'), fit);
    const tip = L.can && L.images[L.i]?.area ? '지도에서 라벨 완료한 그림입니다 · 고치기는 지도에서 합니다'
      : !ed() ? '보기만 할 수 있습니다 · 라벨링은 프로젝트장 · 구성원이 합니다'
      : L.tool === 'poly' ? '눌러 꼭짓점을 찍고, 첫 점 · 두 번 누르기 · Enter 로 닫습니다'
      : L.tool === 'box' ? '끌어서 사각형을 그립니다'
      : '모양을 눌러 고르고 꼭짓점을 끕니다 · 변 가운데 점 = 꼭짓점 더하기 · 두 번 누르기 = 빼기';
    hint.replaceChildren(h('span', { text: tip }), h('span.lb-keys', { text: ed() ? '← → 그림 넘기기 · D 라벨 완료 · 1–9 클래스 · Ctrl+Z 되돌리기' : '← → 그림 넘기기 · 휠 확대' }));
  }
  function setTool(k) { if (!ed()) return; cancelPoly(); L.tool = k; if (k !== 'select') L.sel = -1; drawTools(); paint(); }

  /* ── 판(캔버스) ── */
  const ctx = cv.getContext('2d');
  const V = { s: 1, ox: 0, oy: 0, W: 512, H: 512 };
  let IMG = null;
  const D = { pts: [], hover: null };          // 그리는 중인 다각형
  let drag = null;                             // {kind:'pan'|'vtx'|'mid'|'move'|'box', …}
  const dpr = () => window.devicePixelRatio || 1;
  function size() {
    const r = stageEl.getBoundingClientRect();
    cv.width = Math.max(1, Math.round(r.width * dpr())); cv.height = Math.max(1, Math.round(r.height * dpr()));
    cv.style.width = `${r.width}px`; cv.style.height = `${r.height}px`;
  }
  function fitView() {
    const r = stageEl.getBoundingClientRect();
    const s = Math.min(r.width / V.W, r.height / V.H) * 0.96;
    V.s = s; V.ox = (r.width - V.W * s) / 2; V.oy = (r.height - V.H * s) / 2;
  }
  const toS = ([u, v]) => [u * V.W * V.s + V.ox, v * V.H * V.s + V.oy];
  const toU = (x, y) => [(x - V.ox) / (V.s * V.W), (y - V.oy) / (V.s * V.H)];
  const clamp01 = (q) => [Math.min(1, Math.max(0, q[0])), Math.min(1, Math.max(0, q[1]))];
  function paint() {
    const k = dpr();
    ctx.setTransform(k, 0, 0, k, 0, 0);
    const w = cv.width / k, hh = cv.height / k;
    ctx.clearRect(0, 0, w, hh);
    ctx.fillStyle = '#E5E8EB'; ctx.fillRect(0, 0, w, hh);
    if (!IMG) return;
    ctx.imageSmoothingEnabled = V.s < 2;
    ctx.drawImage(IMG, V.ox, V.oy, V.W * V.s, V.H * V.s);
    const cur = L.images[L.i];
    (cur?.shapes || []).forEach((s, i) => {
      const col = colorOf(s.c);
      const pts = s.p.map(toS);
      ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
      ctx.globalAlpha = i === L.sel ? 0.34 : 0.22; ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = 1;
      if (i === L.sel) { ctx.lineWidth = 4; ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); }
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke();
      if (i === L.sel && ed()) {
        if (s.k !== 'box') for (const m of mids(pts)) { ctx.beginPath(); ctx.arc(m[0], m[1], 4, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = col; ctx.stroke(); }
        for (const [x, y] of pts) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x - 4.5, y - 4.5, 9, 9); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.strokeRect(x - 4.5, y - 4.5, 9, 9); }
      }
    });
    if (D.pts.length) {                         // 그리는 중
      const col = colorOf(L.cls);
      const pts = D.pts.map(toS);
      ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      if (D.hover) ctx.lineTo(...toS(D.hover));
      ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.stroke(); ctx.setLineDash([]);
      pts.forEach(([x, y], j) => { ctx.beginPath(); ctx.arc(x, y, j ? 3.5 : 6, 0, 7); ctx.fillStyle = j ? col : '#FFFFFF'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.stroke(); });
    }
    if (drag?.kind === 'box' && drag.b) {
      const [a, b] = [toS(drag.a), toS(drag.b)];
      ctx.lineWidth = 2; ctx.strokeStyle = colorOf(L.cls); ctx.setLineDash([6, 4]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
    }
  }
  const mids = (pts) => pts.map((p, j) => { const q = pts[(j + 1) % pts.length]; return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; });
  const near = (a, b, r = HIT) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  function inside(pt, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function hitShape(xy) {
    const sh = L.images[L.i]?.shapes || [];
    for (let i = sh.length - 1; i >= 0; i--) if (inside(xy, sh[i].p.map(toS))) return i;
    return -1;
  }
  const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

  /* 고치기 기록(되돌리기 · 다시 하기) — 그림마다 */
  function push() { const cur = L.images[L.i]; if (!cur) return; L.hist.push(clone(cur.shapes)); if (L.hist.length > 100) L.hist.shift(); L.redo = []; }
  function undo() { const cur = L.images[L.i]; if (!cur || !L.hist.length) return; L.redo.push(clone(cur.shapes)); cur.shapes = L.hist.pop(); L.sel = -1; changed(); }
  function redo() { const cur = L.images[L.i]; if (!cur || !L.redo.length) return; L.hist.push(clone(cur.shapes)); cur.shapes = L.redo.pop(); L.sel = -1; changed(); }
  function delSel() { const cur = L.images[L.i]; if (!cur || L.sel < 0) return; push(); cur.shapes.splice(L.sel, 1); L.sel = -1; changed(); }
  function changed() { L.dirty = true; drawTools(); drawCls(); paint(); later(); }

  function finishPoly() {
    const cur = L.images[L.i];
    if (!cur || D.pts.length < 3) return;
    push(); cur.shapes.push({ c: L.cls, k: 'poly', p: D.pts.map(clamp01) }); D.pts = []; D.hover = null; L.sel = cur.shapes.length - 1; changed();
  }
  function cancelPoly() { if (D.pts.length) { D.pts = []; D.hover = null; drawTools(); paint(); } }

  /* 손가락 둘 = 확대(390 보기) */
  const touches = new Map();
  let pinch = null;
  cv.addEventListener('pointerdown', (e) => {
    cv.focus({ preventScroll: true });
    const xy = pos(e);
    touches.set(e.pointerId, xy);
    if (touches.size === 2) { const [a, b] = [...touches.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: V.s, ox: V.ox, oy: V.oy, c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; drag = null; return; }
    cv.setPointerCapture(e.pointerId);
    const cur = L.images[L.i];
    if (!cur || !IMG) return;
    const panKey = e.button === 1 || e.button === 2 || space;
    if (panKey || !ed()) { drag = { kind: 'pan', x: xy[0], y: xy[1], ox: V.ox, oy: V.oy }; return; }
    if (L.tool === 'poly') {
      const u = toU(...xy);
      if (D.pts.length >= 3 && near(xy, toS(D.pts[0]), 12)) { finishPoly(); return; }
      D.pts.push(clamp01(u)); drawTools(); paint(); return;
    }
    if (L.tool === 'box') { drag = { kind: 'box', a: clamp01(toU(...xy)), b: null }; return; }
    // 선택 — 고른 모양의 꼭짓점 · 가운데 점 먼저
    if (L.sel >= 0) {
      const s = cur.shapes[L.sel], pts = s.p.map(toS);
      const vi = pts.findIndex((p) => near(p, xy));
      if (vi >= 0) { push(); drag = { kind: 'vtx', i: vi, moved: false }; return; }
      if (s.k !== 'box') { const mi = mids(pts).findIndex((p) => near(p, xy)); if (mi >= 0) { push(); s.p.splice(mi + 1, 0, clamp01(toU(...xy))); drag = { kind: 'vtx', i: mi + 1, moved: true }; paint(); return; } }
    }
    const hi = hitShape(xy);
    if (hi >= 0) { L.sel = hi; L.cls = cur.shapes[hi].c; push(); drag = { kind: 'move', from: toU(...xy), orig: clone(cur.shapes[hi].p), moved: false }; drawTools(); drawCls(); paint(); return; }
    if (L.sel >= 0) { L.sel = -1; drawTools(); drawCls(); paint(); }
    drag = { kind: 'pan', x: xy[0], y: xy[1], ox: V.ox, oy: V.oy };
  });
  cv.addEventListener('pointermove', (e) => {
    const xy = pos(e);
    if (touches.has(e.pointerId)) touches.set(e.pointerId, xy);
    if (pinch && touches.size === 2) {
      const [a, b] = [...touches.values()];
      const k = Math.hypot(a[0] - b[0], a[1] - b[1]) / (pinch.d || 1);
      const s = Math.min(40, Math.max(0.2, pinch.s * k));
      V.ox = pinch.c[0] - (pinch.c[0] - pinch.ox) * (s / pinch.s); V.oy = pinch.c[1] - (pinch.c[1] - pinch.oy) * (s / pinch.s); V.s = s; paint(); return;
    }
    const cur = L.images[L.i];
    if (L.tool === 'poly' && D.pts.length && !drag) { D.hover = clamp01(toU(...xy)); paint(); return; }
    if (!drag) {
      if (ed() && L.tool === 'select' && cur && L.sel >= 0) {
        const pts = cur.shapes[L.sel].p.map(toS);
        cv.style.cursor = pts.some((p) => near(p, xy)) || mids(pts).some((p) => near(p, xy)) ? 'crosshair' : hitShape(xy) >= 0 ? 'move' : 'grab';
      } else cv.style.cursor = L.tool === 'select' || !ed() ? 'grab' : 'crosshair';
      return;
    }
    if (drag.kind === 'pan') { V.ox = drag.ox + xy[0] - drag.x; V.oy = drag.oy + xy[1] - drag.y; paint(); return; }
    if (drag.kind === 'box') { drag.b = clamp01(toU(...xy)); paint(); return; }
    const s = cur?.shapes[L.sel];
    if (!s) return;
    if (drag.kind === 'vtx') {
      const u = clamp01(toU(...xy));
      if (s.k === 'box') {                        // 사각형은 사각형으로 — 맞은편 꼭짓점을 고정
        const o = s.p[(drag.i + 2) % 4];
        const x0 = Math.min(o[0], u[0]), x1 = Math.max(o[0], u[0]), y0 = Math.min(o[1], u[1]), y1 = Math.max(o[1], u[1]);
        s.p = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
        drag.i = s.p.findIndex((q) => q[0] === u[0] && q[1] === u[1]); if (drag.i < 0) drag.i = 2;
      } else s.p[drag.i] = u;
      drag.moved = true; paint(); return;
    }
    if (drag.kind === 'move') {
      const u = toU(...xy);
      let dx = u[0] - drag.from[0], dy = u[1] - drag.from[1];
      const xs = drag.orig.map((q) => q[0]), ys = drag.orig.map((q) => q[1]);
      dx = Math.min(1 - Math.max(...xs), Math.max(-Math.min(...xs), dx)); dy = Math.min(1 - Math.max(...ys), Math.max(-Math.min(...ys), dy));
      s.p = drag.orig.map(([a, b]) => [a + dx, b + dy]); drag.moved = drag.moved || Math.abs(dx) + Math.abs(dy) > 1e-4; paint();
    }
  });
  function up(e) {
    touches.delete(e.pointerId);
    if (pinch) { if (touches.size < 2) pinch = null; return; }
    const cur = L.images[L.i];
    if (drag?.kind === 'box' && drag.b && cur) {
      const [a, b] = [drag.a, drag.b];
      const [sa, sb] = [toS(a), toS(b)];
      if (Math.abs(sa[0] - sb[0]) > 4 && Math.abs(sa[1] - sb[1]) > 4) {
        push();
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        cur.shapes.push({ c: L.cls, k: 'box', p: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] }); L.sel = cur.shapes.length - 1; drag = null; changed(); return;
      }
    }
    if (drag && (drag.kind === 'vtx' || drag.kind === 'move')) { if (drag.moved) changed(); else L.hist.pop(); }
    drag = null; paint();
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('dblclick', (e) => {
    const cur = L.images[L.i];
    if (!cur || !ed()) return;
    const xy = pos(e);
    if (L.tool === 'poly') {                      // 두 번 누르기 = 닫기(두 번째 누름이 찍은 같은 자리 점은 뺀다)
      const last = D.pts[D.pts.length - 1], prev = D.pts[D.pts.length - 2];
      if (last && prev && near(toS(last), toS(prev), 6)) D.pts.pop();
      finishPoly(); return;
    }
    if (L.tool === 'select' && L.sel >= 0) {
      const s = cur.shapes[L.sel];
      if (s.k === 'box' || s.p.length <= 3) return;
      const vi = s.p.map(toS).findIndex((p) => near(p, xy));
      if (vi >= 0) { push(); s.p.splice(vi, 1); changed(); }
    }
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [x, y] = pos(e);
    const s = Math.min(40, Math.max(0.2, V.s * Math.exp(-e.deltaY * 0.0015)));
    V.ox = x - (x - V.ox) * (s / V.s); V.oy = y - (y - V.oy) * (s / V.s); V.s = s; paint();
  }, { passive: false });

  /* 글쇠 — 판에 초점이 있거나 입력 칸 밖일 때 */
  let space = false;
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  function onKey(e) {
    if (!card.isConnected) { removeEventListener('keydown', onKey); return; }
    if (typing(e) || e.altKey) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (k === ' ') { space = true; if (e.target === cv) e.preventDefault(); return; }
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
    if (mod && (k === 's' || k === 'S')) { e.preventDefault(); flush(true); return; }
    if (mod) return;
    if (k === 'Enter' && D.pts.length) { e.preventDefault(); finishPoly(); return; }
    if (k === 'Escape') { if (D.pts.length) cancelPoly(); else if (L.sel >= 0) { L.sel = -1; drawTools(); paint(); } return; }
    if (k === 'Backspace' && D.pts.length) { e.preventDefault(); D.pts.pop(); drawTools(); paint(); return; }
    if ((k === 'Delete' || k === 'Backspace') && L.sel >= 0 && ed()) { e.preventDefault(); delSel(); return; }
    if (k === 'ArrowRight' || k === 'n' || k === 'N') { e.preventDefault(); step(1); return; }
    if (k === 'ArrowLeft' || k === 'b' || k === 'B') { e.preventDefault(); step(-1); return; }
    if (k === 'f' || k === 'F' || k === '0') { fitView(); paint(); return; }
    if (k === 'v' || k === 'V') return setTool('select');
    if (k === 'p' || k === 'P') return setTool('poly');
    if (k === 'r' || k === 'R') return setTool('box');
    if ((k === 'd' || k === 'D') && ed()) { e.preventDefault(); mark('done', true); return; }
    if (/^[1-9]$/.test(k)) setCls(+k - 1);
  }
  addEventListener('keydown', onKey);
  addEventListener('keyup', (e) => { if (e.key === ' ') space = false; });
  new ResizeObserver(() => { size(); fitView(); paint(); }).observe(stageEl);

  /* ── 저장 ── */
  let timer = null, saving = null;
  function later() { clearTimeout(timer); saveMsg.textContent = '저장 전'; timer = setTimeout(() => flush(), 1500); }
  async function flush(say = false) {
    clearTimeout(timer);
    if (saving) await saving.catch(() => {});
    const cur = L.images[L.i];
    if (!cur || !L.dirty || !ed()) { if (say && cur) toast('저장했습니다'); return; }
    return save(cur, cur.state, say);
  }
  async function save(cur, state, say = false) {
    L.dirty = false;
    saveMsg.textContent = '저장 중';
    saving = api(`/labeling/images/${encodeURIComponent(cur.id)}`, { method: 'PUT', body: { shapes: cur.shapes, state, at: cur.at || null } });
    try {
      const j = await saving;
      Object.assign(cur, { ...j.image, shapes: cur === L.images[L.i] && L.dirty ? cur.shapes : j.image.shapes });
      L.set = j.set;
      who(); drawProg(); drawTabs(); drawList();
      if (say) toast('저장했습니다');
      return true;
    } catch (e) {
      L.dirty = true;
      saveMsg.textContent = '저장하지 못함';
      toast(e?.status === 409 ? '다른 사람이 먼저 이 그림을 고쳤습니다 — 다시 불러옵니다' : (e?.message || '저장하지 못했습니다'));
      if (e?.status === 409) setTimeout(() => labelWork({ host, project, toggle }), 1200);
      return false;
    } finally { saving = null; }
  }
  function who() {
    const cur = L.images[L.i];
    if (!cur) { saveMsg.textContent = ''; meta.textContent = ''; return; }
    saveMsg.textContent = cur.at ? `저장됨 ${tm(cur.at)}` : '';
    meta.textContent = cur.done_at ? `라벨 완료 · ${cur.done_by || 'LX'} · ${tm(cur.done_at)}` : cur.at ? `${WORD[cur.state]} · ${cur.by || 'LX'} · ${tm(cur.at)}` : WORD[cur.state];
    checkBtn.textContent = cur.state === 'check' ? '확인 필요 풀기' : '확인 필요';
    doneBtn.textContent = cur.state === 'done' ? '다음 그림' : '라벨 완료 · 다음';
  }
  async function mark(state, next = false) {
    const cur = L.images[L.i];
    if (!cur || !ed()) return;
    if (D.pts.length >= 3) finishPoly();
    clearTimeout(timer);
    if (saving) await saving.catch(() => {});
    if (state === 'done' && !cur.shapes.length && cur.state !== 'done') toast('모양 없이 완료 — 대상이 없는 그림으로 학습합니다');
    if (cur.state !== state || L.dirty) { if (!(await save(cur, state))) return; }
    if (next) step(1, true);
  }
  doneBtn.addEventListener('click', () => mark('done', true));
  checkBtn.addEventListener('click', () => { const cur = L.images[L.i]; if (cur) mark(cur.state === 'check' ? 'todo' : 'check'); });

  /* ── 그림 넘기기 ── */
  async function go(i) {
    if (i < 0 || i >= L.images.length) return;
    if (i !== L.i) await flush();
    cancelPoly();
    L.i = i; L.sel = -1; L.hist = []; L.redo = []; L.dirty = false; drag = null;
    const cur = L.images[i];
    IMG = null; delete cv.dataset.ready; paint(); drawList(); drawTools(); drawCls(); who(); foot.hidden = !ed();
    try {
      const u = await imgUrl(cur.src);
      const im = new Image(); im.src = u; await im.decode();
      if (L.images[L.i] !== cur) return;
      IMG = im; V.W = im.naturalWidth || 512; V.H = im.naturalHeight || 512; size(); fitView(); paint(); cv.dataset.ready = '1';
    } catch { if (L.images[L.i] === cur) { saveMsg.textContent = '그림을 불러오지 못했습니다'; } }
    // 다음 그림을 미리 받아 둔다
    const nx = L.images[i + 1]; if (nx) imgUrl(nx.src).catch(() => {});
  }
  function step(d, wantTodo = false) {
    if (!L.images.length) return;
    if (wantTodo) {                                // 다음 '라벨 안 함' 그림으로(없으면 그냥 다음)
      for (let k = 1; k <= L.images.length; k++) { const j = (L.i + k) % L.images.length; if (L.images[j].state === 'todo') return go(j); }
    }
    go(Math.min(L.images.length - 1, Math.max(0, L.i + d)));
  }

  /* ── 그림 더하기 ── */
  function addForm(inline = false) {
    if (!L.imagery.length) {
      return h('div.lb-addf', {}, h('p.lb-note', { text: '이 프로젝트 대상 지역에 영상이 없습니다 · 데이터 올리기에서 영상을 등록합니다' }),
        h('a.t-btn.t-btn--2', { href: stageHref(P, 'ingest'), text: '데이터 올리기' }));
    }
    /* 처음 고른 영상 = 항공 해상도(0.05–0.5 m) 중 가장 최근 — 2 m 위성 · 1 cm 드론보다 라벨에 알맞다(목록 순서는 서버 그대로) */
    const fit = L.imagery.find((x) => x.gsd_m >= 0.05 && x.gsd_m <= 0.5) || L.imagery[0];
    const sel = h('select.t-input', { 'aria-label': '영상' }, ...L.imagery.map((x) => h('option', { value: x.id, text: x.name, selected: x === fit })));
    const room = L.maxImages - L.images.length;
    const n = h('select.t-input.lb-n', { 'aria-label': '장 수' }, ...[5, 10, 20].filter((k) => k <= Math.max(5, Math.min(L.addMax, room))).map((k) => h('option', { value: String(k), text: `${k}장`, selected: k === 10 })));
    const go1 = h('button.t-btn', { type: 'button', text: '그림 더하기' });
    const msg = h('p.lb-note', { text: '영상 범위 안에서 고르게 잘라 옵니다' });
    go1.addEventListener('click', async () => {
      go1.disabled = true; go1.textContent = '그림 만드는 중'; msg.textContent = '영상에서 그림을 자르고 있습니다';
      try {
        const keep = L.images[L.i]?.id;
        await flush();
        const j = await api(`/projects/${encodeURIComponent(P.id)}/labeling/images`, { method: 'POST', body: { imagery_id: sel.value, n: +n.value } });
        Object.assign(L, pick(j));
        toast(j.added?.value ? `그림 ${j.added.value}장을 더했습니다` : '이 영상에서 더 자를 자리를 찾지 못했습니다');
        pop?.remove(); pop = null;
        start(keep);
      } catch (e) { msg.textContent = e?.message || '그림을 더하지 못했습니다'; go1.disabled = false; go1.textContent = '그림 더하기'; }
    });
    return h(`div.lb-addf${inline ? '.is-inline' : ''}`, {}, h('label.t-label', { text: '영상' }), sel, h('div.lb-addf-r', {}, n, go1), msg);
  }
  let pop = null;
  addBtn.addEventListener('click', () => {
    if (pop) { pop.remove(); pop = null; return; }
    pop = h('div.lb-pop', { role: 'dialog', 'aria-label': '그림 더하기' }, addForm());
    top.append(pop);
  });

  /* ── 라벨 미리 보기 격자 ── */
  const grid = h('section.lb-grid', { 'aria-label': '라벨 미리 보기 격자', hidden: true });
  card.append(grid);
  const gio = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { gio.unobserve(e.target); thumb(e.target); } }), { rootMargin: '300px' }) : null;
  function drawGrid() {
    const rows = shown();
    const gtabs = h('div.lb-tabs.lb-gtabs', { role: 'tablist', 'aria-label': '그림 거르기' }, ...FILTERS.map(([k, w]) => h('button.lb-tab', { type: 'button', role: 'tab', 'aria-selected': String(L.filter === k),
      text: k === 'all' ? w : `${w} ${counts()[k]}`, onclick: () => { L.filter = k; drawTabs(); drawList(); drawGrid(); } })));
    const legend = h('ul.lb-glegend', { 'aria-label': '클래스' }, ...classes().map((c) => h('li', {}, h('i', { style: { background: c.color } }), c.name)));
    const tiles = rows.map(([x, i]) => {
      const im = h('img', { alt: '', dataset: { src: `${x.src}?size=256` } });
      /* 모양 꼭짓점은 그림 크기에 대한 비율(0~1 · 그리는 판과 같은 값) — 그림 위에 같은 비율로 겹친다 */
      const svg = `<svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">${(x.shapes || []).map((sh) => {
        const col = colorOf(sh.c);
        return `<polygon points="${sh.p.map(([a, b]) => `${a},${b}`).join(' ')}" fill="${col}" fill-opacity=".28" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
      }).join('')}</svg>`;
      const b = h('button.lb-gt', { type: 'button', dataset: { st: x.state }, 'aria-label': `${x.seq}번 그림 열기`, onclick: () => showGrid(false, i) },
        h('span.lb-gt-im', {}, im, h('span.lb-gt-sv', { html: svg })),
        h('span.lb-gt-t', {}, h('b', { text: `${x.seq}번` }), h('small', { text: [x.shapes?.length ? `${x.shapes.length}개` : '라벨 없음', x.area ? '라벨 완료 · 지도' : WORD[x.state]].join(' · ') })));
      if (gio) gio.observe(im); else thumb(im);
      return b;
    });
    grid.replaceChildren(h('div.lb-ghead', {}, gtabs, legend),
      tiles.length ? h('div.lb-gl', {}, ...tiles) : h('p.lb-none', { text: L.images.length ? '이 상태의 그림이 없습니다' : '아직 그림이 없습니다' }));
  }
  async function showGrid(on, at) {
    if (on) await flush();
    gridBtn.setAttribute('aria-pressed', String(on));
    gridBtn.textContent = on ? '한 장씩 보기' : '격자로 보기';
    body.hidden = on; grid.hidden = !on;
    if (on) drawGrid();
    else { size(); if (at !== undefined && at !== L.i) go(at); else paint(); }
  }
  gridBtn.addEventListener('click', () => showGrid(grid.hidden));

  /* ── 시작 ── */
  function start(keepId) {
    drawProg(); drawTabs(); drawTools(); drawCls();
    if (!L.images.length) {
      list.replaceChildren(h('li.lb-none', { text: '아직 그림이 없습니다' }));
      stageEl.replaceChildren(h('div.lb-first', {}, h('h3', { text: '라벨링할 그림을 먼저 더합니다' }),
        L.can ? addForm(true) : h('p.lb-note', { text: '프로젝트장 · 구성원이 그림을 더하면 여기서 볼 수 있습니다' })));
      foot.hidden = true; addBtn.hidden = true; toolbar.hidden = true; hint.hidden = true; tabs.hidden = true; gridBtn.hidden = true;
      return;
    }
    if (!stageEl.contains(cv)) stageEl.replaceChildren(cv);
    toolbar.hidden = false; hint.hidden = false; tabs.hidden = false; gridBtn.hidden = false;
    foot.hidden = !L.can;
    size();
    const at = keepId ? L.images.findIndex((x) => x.id === keepId) : -1;
    const first = at >= 0 ? at : Math.max(0, L.images.findIndex((x) => x.state === 'todo'));
    L.i = -1; go(first);
  }
  addEventListener('beforeunload', () => { if (L.dirty) flush(); });
  start();
  document.documentElement.dataset.labelReady = '1';
  return { flush };
}

/* ── 학습데이터 구축 칸 — 지도 | 그림 두 보기(10-18 사용자 "왼쪽에 실제 지도에 라벨링 하는 영상이 보여야" · 원칙 223 단추 하나) ──
   영상이 있는 프로젝트는 지도가 먼저(지도 위에 그리고 '이 화면 라벨 완료' → 서버가 그림으로 잘라 같은 묶음에). 그림 보기는 512 화소 조각을 한 장씩.
   고른 보기는 주소(?view=)와 이 브라우저에 남긴다. pre = 화면이 열릴 때 미리 받기 시작한 자료 · 모듈(app.js). */
const VIEW_KEY = 'lx-label-view';
export async function labelStage({ host, pid, pre = {} }) {
  const q = new URLSearchParams(location.search).get('view');
  let saved = null;
  try { saved = localStorage.getItem(VIEW_KEY); } catch { /* 보관함 없음 */ }
  let view = q === 'chip' || q === 'map' ? q : saved === 'chip' ? 'chip' : 'map';
  let mapData = pre.map || null, handle = null, noMap = false;
  const toggle = (now) => noMap ? '' : h('div.lb-view', { role: 'tablist', 'aria-label': '라벨링 보기' },
    ...[['map', '지도'], ['chip', '그림']].map(([v, w]) => h('button.lb-view-b', { type: 'button', role: 'tab', 'aria-selected': String(now === v), text: w,
      onclick: () => { if (v !== view) mount(v, true); } })));
  async function mount(v, keep = false) {
    try { await handle?.flush?.(); } catch { /* 저장은 각 보기가 알린다 */ }
    try { handle?.destroy?.(); } catch { /* 이미 닫힘 */ }
    handle = null; view = v;
    if (keep) {
      try { localStorage.setItem(VIEW_KEY, v); } catch { /* 보관함 없음 */ }
      const u = new URL(location.href); u.searchParams.set('view', v); history.replaceState(history.state, '', u);
    }
    if (v === 'map') {
      const wait = h('div.lb-wait'); host.replaceChildren(wait);
      empty(wait, { kind: 'loading' });
      let d = null;
      try { d = await (mapData || api(`/projects/${encodeURIComponent(pid)}/labeling/map`)); } catch { d = null; }
      mapData = null;
      if (!d) { wait.replaceChildren(); empty(wait, { kind: 'error', title: '라벨링 지도를 불러오지 못했습니다', onRetry: () => mount('map') }); return; }
      if (!d.imagery?.length) { noMap = true; return mount('chip'); }      // 지도에 펼칠 영상이 없는 프로젝트 = 그림 보기(영상 등록 안내)
      const { labelMap } = await (pre.mod || import('./label-map.js'));
      handle = await labelMap({ host, pid, data: d, toggle: toggle('map'), onReload: () => mount('map') });
      return;
    }
    handle = await labelWork({ host, project: { id: pid }, toggle: toggle('chip') });
  }
  await mount(view);
}
