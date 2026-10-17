/* K18 dashgrid.js — 개인별 맞춤 대시보드 칸 격자(10-17 원칙 280 · 283 · 263 — "단위 기능들을 배치를 서로 바꾸고 사이즈를 늘렸다 줄였다 커스텀").
   LX 직원 대시보드가 먼저 쓰고, LX 관리자 · 기관 첫 화면도 같은 부품을 쓸 수 있다(공용 kit · CSS 는 kit/dashgrid.css · 처음 쓸 때 스스로 붙인다).

     import { dashgrid } from '../kit/dashgrid.js';
     const g = dashgrid(host, {
       screen: 'lx-console',                       // 저장 열쇠 → 사용자 설정 /me/prefs/dash.{screen}(계정별 · 서버) + 같은 값을 브라우저에도(바로 그리기)
       widgets: { id: { title, more, min: [w, h], max: [w, h], def: [w, h], views: [{ id, label }], render(body, ctx) } },
       defaults: [{ id, x, y, w, h, view }],       // 처음 모양
       cols: 12, rowH: 60, gap: 12,                // 격자(열 12 · 줄 높이 · 틈) — 칸 크기는 격자 단위로만 바뀐다(내용 때문에 출렁이지 않는다 · 원칙 231)
     });
     g.toolbar  → 화면이 원하는 자리에 둔다('대시보드 수정하기' 단추 하나 · 수정 중엔 '칸 더하기' · '처음 모양으로' · '완료')

   render(body, ctx) — 칸 몸통을 그린다. ctx = { id, w, h, view, size('s'|'m'|'l'), px: {w, h}, sub(node|text), refresh() }
     · 칸 크기(w · h) 또는 보기 방식(view)이 바뀌면 다시 부른다(끌어 옮기기만 한 경우는 부르지 않는다).
     · 돌려주는 함수가 있으면 다음 그리기 전에 부른다(정리).
   수정 모드(edit) — 머리를 끌어 자리 바꾸기 · 오른쪽 아래 모서리로 크기 · × 로 빼기 · 머리의 보기 방식 칩. 평소에는 손잡이가 보이지 않는다.
   좁은 화면(760 미만)은 한 줄로 쌓고 수정 모드 없음(PC 에서 고른 순서 그대로).
   저장 모양 { v: 1, items: [{ id, x, y, w, h, view }] } — 모르는 칸은 버리고, 크기는 min · max · 열 수 안으로 맞춘다. */
import { h, api, LS } from './util.js';
import { toast } from './toast.js';

const CSS = new URL('./dashgrid.css', import.meta.url).href;
function sheet() {
  if (document.querySelector('link[data-k-dashgrid]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-dashgrid': '' }));
}
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const GRIP = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="7" cy="5" r="1.6"/><circle cx="13" cy="5" r="1.6"/><circle cx="7" cy="10" r="1.6"/><circle cx="13" cy="10" r="1.6"/><circle cx="7" cy="15" r="1.6"/><circle cx="13" cy="15" r="1.6"/></svg>';
const X = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>';

function who() {
  try {
    const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
    if (s) return String(s.user_id || s.user?.id || s.login || s.user?.login || [s.realm, s.tenant_id || s.role].filter(Boolean).join('.') || 'me');
  } catch { /* */ }
  return 'me';
}
const collides = (a, b) => a !== b && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);

export function dashgrid(host, { screen, widgets, defaults = [], cols = 12, rowH = 64, gap = 12, stackBelow = 760, words = {} } = {}) {
  sheet();
  const W = { edit: '대시보드 수정하기', done: '완료', add: '칸 더하기', none: '더할 칸이 없습니다', reset: '처음 모양으로', remove: '이 칸 빼기', move: '끌어서 자리 바꾸기',
    resize: '모서리를 끌어 크기 바꾸기', view: '보기 방식', saved: '대시보드를 저장했습니다', save_fail: '배치를 저장하지 못했습니다', reset_ok: '처음 모양으로 돌렸습니다', ...words };
  const KEY = 'dash.' + screen, LSK = `lx.dash.v1.${who()}.${screen}`;
  const el = h('div.dg', { role: 'list' });
  host.append(el);
  const ph = h('div.dg-ph', { hidden: true });
  const items = new Map();          // id → { it(배치), node, body, ctx, cleanup, drawn: {w,h,view} }
  let layout = [], editing = false, saveT = 0, raf = 0, stack = false, cellW = 0;

  /* ── 배치 ─────────────────────────────────────────────── */
  const clampItem = (it) => {
    const d = widgets[it.id]; if (!d) return null;
    const [mw, mh] = d.min || [2, 2], [xw, xh] = d.max || [cols, 40];
    const w = Math.max(mw, Math.min(xw, cols, Math.round(+it.w || d.def?.[0] || mw)));
    const hh = Math.max(mh, Math.min(xh, Math.round(+it.h || d.def?.[1] || mh)));
    const x = Math.max(0, Math.min(cols - w, Math.round(+it.x || 0)));
    const view = d.views?.some((v) => v.id === it.view) ? it.view : (d.views?.[0]?.id || null);
    return { id: it.id, x, y: Math.max(0, Math.round(+it.y || 0)), w, h: hh, view };
  };
  const sanitize = (arr) => {
    const seen = new Set(), out = [];
    for (const it of Array.isArray(arr) ? arr : []) { if (!it || seen.has(it.id)) continue; const c = clampItem(it); if (c) { seen.add(c.id); out.push(c); } }
    return out;
  };
  /** 겹침 풀기 — fixed(끌고 있는 칸)는 그대로, 나머지는 위에서부터 겹치지 않는 가장 위 줄로 */
  function compact(fixed = null) {
    const placed = fixed ? [fixed] : [];
    const rest = layout.filter((it) => it !== fixed).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of rest) {
      while (placed.some((o) => collides(o, it))) it.y++;
      while (it.y > 0) { it.y--; if (placed.some((o) => collides(o, it))) { it.y++; break; } }
      placed.push(it);
    }
  }
  const rows = () => layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const px = (it) => ({ left: it.x * (cellW + gap), top: it.y * (rowH + gap), width: it.w * (cellW + gap) - gap, height: it.h * (rowH + gap) - gap });

  /* ── 그리기 ─────────────────────────────────────────────── */
  function place() {
    stack = el.clientWidth < stackBelow;
    el.classList.toggle('is-stack', stack);
    if (stack && editing) edit(false);
    cellW = (el.clientWidth - gap * (cols - 1)) / cols;
    if (stack) {
      el.style.height = '';
      const order = layout.slice().sort((a, b) => a.y - b.y || a.x - b.x);
      for (const [i, it] of order.entries()) {
        const n = items.get(it.id)?.node; if (!n) continue;
        n.style.cssText = `order:${i};height:${it.h * (rowH + gap) - gap}px`;
      }
      return;
    }
    el.style.height = Math.max(rowH, rows() * (rowH + gap) - gap) + 'px';
    for (const it of layout) {
      const n = items.get(it.id)?.node; if (!n || n.classList.contains('is-drag')) continue;
      const p = px(it);
      n.style.cssText = `left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`;
    }
  }
  const sizeWord = (it) => (it.w <= 3 ? 's' : it.w <= 6 ? 'm' : 'l');
  function ctxOf(it, rec) {
    const p = px(it);
    return { id: it.id, w: it.w, h: it.h, view: it.view, size: sizeWord(it), px: { w: p.width, h: p.height },
      sub(x) { rec.sub.replaceChildren(...(x === null || x === undefined ? [] : [typeof x === 'string' ? document.createTextNode(x) : x])); rec.sub.hidden = !rec.sub.childNodes.length; },
      refresh: () => draw(it, true) };
  }
  function draw(it, force = false) {
    const rec = items.get(it.id); if (!rec) return;
    const d = rec.drawn;
    if (!force && d && d.w === it.w && d.h === it.h && d.view === it.view) return;
    if (typeof rec.cleanup === 'function') { try { rec.cleanup(); } catch { /* */ } }
    rec.cleanup = null;
    rec.drawn = { w: it.w, h: it.h, view: it.view };
    rec.node.dataset.w = it.w; rec.node.dataset.h = it.h; rec.node.dataset.size = sizeWord(it); rec.node.dataset.view = it.view || '';
    rec.body.replaceChildren();
    for (const b of rec.views.children) b.setAttribute('aria-pressed', b.dataset.v === it.view ? 'true' : 'false');
    const def = widgets[it.id];
    const tok = rec.drawn;
    try {
      const r = def.render(rec.body, ctxOf(it, rec));
      if (r && typeof r.then === 'function') r.then((c) => { if (rec.drawn === tok) rec.cleanup = typeof c === 'function' ? c : null; }).catch(() => {});
      else if (typeof r === 'function') rec.cleanup = r;
    } catch { /* 칸 하나의 오류가 대시보드를 멈추지 않는다 */ }
  }
  function mount(it) {
    const def = widgets[it.id];
    const more = typeof def.more === 'function' ? def.more() : def.more && (def.more.href
      ? h('a.dg-more', { href: def.more.href, text: def.more.text })
      : h('button.dg-more', { type: 'button', text: def.more.text, onclick: def.more.onClick }));
    const views = h('div.dg-views', { role: 'group', 'aria-label': W.view }, ...(def.views || []).map((v) => h('button.dg-v', { type: 'button', text: v.label, dataset: { v: v.id }, 'aria-pressed': 'false',
      onclick: () => { it.view = v.id; draw(it); save(); } })));
    const sub = h('small.dg-sub', { hidden: true });
    const body = h('div.dg-body');
    const node = h('section.dg-item.t-card', { role: 'listitem', dataset: { id: it.id }, 'aria-label': def.title },
      h('div.dg-hd', {},
        h('span.dg-grip', { html: GRIP, title: W.move, 'aria-hidden': 'true' }),
        h('div.dg-hd-t', {}, h('h2.dg-t', { text: def.title }), sub),
        more || null, (def.views || []).length > 1 ? views : null,
        h('button.dg-rm', { type: 'button', html: X, title: W.remove, 'aria-label': `${def.title} · ${W.remove}`, onclick: () => remove(it.id) })),
      body,
      h('span.dg-rs', { title: W.resize, 'aria-hidden': 'true' }));
    items.set(it.id, { it, node, body, sub, views, cleanup: null, drawn: null });
    el.append(node);
    if (!RM()) { node.classList.add('is-new'); requestAnimationFrame(() => requestAnimationFrame(() => node.classList.remove('is-new'))); }
  }
  function render() {
    for (const [id, rec] of [...items]) if (!layout.some((it) => it.id === id)) { if (typeof rec.cleanup === 'function') { try { rec.cleanup(); } catch { /* */ } } rec.node.remove(); items.delete(id); }
    for (const it of layout) { if (!items.has(it.id)) mount(it); else items.get(it.id).it = it; }
    place();
    for (const it of layout) draw(it);
  }

  /* ── 저장(서버 사용자 설정 + 브라우저 사본) ─────────────────────── */
  const snapshot = () => ({ v: 1, items: layout.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, view: it.view })) });
  async function push() {
    const s = snapshot();
    LS.set(LSK, s);
    try { await api('/me/prefs/' + encodeURIComponent(KEY), { method: 'PUT', body: s }); return true; }
    catch { toast(W.save_fail); return false; }
  }
  function save(now = false) {
    clearTimeout(saveT);
    if (now) return push();
    saveT = setTimeout(push, 700);
    return null;
  }
  async function load() {
    const local = LS.get(LSK);
    layout = sanitize(local?.items);
    if (!layout.length && !local) layout = sanitize(defaults);
    compact(); render();
    try {
      const j = await api('/me/prefs/' + encodeURIComponent(KEY));
      const srv = j?.options;
      if (srv && Array.isArray(srv.items)) {
        const next = sanitize(srv.items);
        if (JSON.stringify(next) !== JSON.stringify(layout)) { layout = next; compact(); render(); }
        LS.set(LSK, snapshot());
      } else if (srv === null && local) {         // 서버엔 없고 브라우저에만 — 서버로 올린다(다른 PC 에서도 같은 모양)
        push();
      } else if (!srv && !local) { layout = sanitize(defaults); compact(); render(); }
    } catch { /* 서버에 못 물으면 브라우저 사본 · 처음 모양으로 */ }
    el.dataset.ready = '1';
  }

  /* ── 수정 모드 ─────────────────────────────────────────────── */
  const bar = h('div.dg-bar', { role: 'toolbar', 'aria-label': W.edit });
  const bEdit = h('button.t-btn.t-btn--2.dg-b.dg-b--edit', { type: 'button', text: W.edit, onclick: () => edit(true) });
  const addMenu = h('div.dg-menu', { hidden: true, role: 'menu' });
  const bAdd = h('button.t-btn.t-btn--2.dg-b.dg-b--add', { type: 'button', text: W.add, 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => toggleMenu() });
  const bReset = h('button.t-btn.t-btn--2.dg-b.dg-b--reset', { type: 'button', text: W.reset, onclick: () => reset() });
  const bDone = h('button.t-btn.dg-b.dg-b--done', { type: 'button', text: W.done, onclick: () => edit(false) });
  const addWrap = h('span.dg-addw', {}, bAdd, addMenu);
  bar.append(bEdit, addWrap, bReset, bDone);
  function toggleMenu(on = addMenu.hidden) {
    if (on) {
      const free = Object.keys(widgets).filter((id) => !layout.some((it) => it.id === id));
      addMenu.replaceChildren(...(free.length ? free.map((id) => h('button.dg-mi', { type: 'button', role: 'menuitem', text: widgets[id].title, onclick: () => { add(id); toggleMenu(false); } }))
        : [h('span.dg-mi.is-none', { text: W.none })]));
    }
    addMenu.hidden = !on; bAdd.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  addEventListener('pointerdown', (e) => { if (!addMenu.hidden && !addWrap.contains(e.target)) toggleMenu(false); });
  function edit(on) {
    if (on && stack) return;
    editing = !!on;
    el.classList.toggle('is-edit', editing);
    bar.classList.toggle('is-edit', editing);
    host.classList.toggle('dg-editing', editing);
    if (!editing) { toggleMenu(false); if (saveT) { clearTimeout(saveT); saveT = 0; push().then((ok) => ok && toast(W.saved)); } }
    else bAdd.focus();
  }
  function freeSpot(w, hh) {
    for (let y = 0; y < 200; y++) for (let x = 0; x + w <= cols; x++) {
      const t = { x, y, w, h: hh };
      if (!layout.some((o) => collides(o, t))) return { x, y };
    }
    return { x: 0, y: rows() };
  }
  function add(id) {
    const d = widgets[id]; if (!d || layout.some((it) => it.id === id)) return;
    const c = clampItem({ id, w: d.def?.[0], h: d.def?.[1], view: d.views?.[0]?.id });
    Object.assign(c, freeSpot(c.w, c.h));
    layout.push(c); compact(); render(); save();
    items.get(id)?.node.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  }
  function remove(id) { layout = layout.filter((it) => it.id !== id); compact(); render(); save(); }
  async function reset() {
    layout = sanitize(defaults); compact(); render();
    LS.set(LSK, null);
    try { localStorage.removeItem(LSK); } catch { /* */ }
    try { await api('/me/prefs/' + encodeURIComponent(KEY), { method: 'DELETE' }); toast(W.reset_ok); } catch { toast(W.save_fail); }
  }

  /* 끌어 옮기기 · 크기 바꾸기(포인터) */
  el.addEventListener('pointerdown', (e) => {
    if (!editing || stack || e.button !== 0) return;
    const node = e.target.closest('.dg-item'); if (!node) return;
    const rs = e.target.closest('.dg-rs'), hd = e.target.closest('.dg-hd');
    if (!rs && (!hd || e.target.closest('a,button,input,select,textarea'))) return;
    const it = layout.find((x) => x.id === node.dataset.id); if (!it) return;
    e.preventDefault();
    const start = { x: e.clientX, y: e.clientY, it: { ...it } }, def = widgets[it.id];
    const [mw, mh] = def.min || [2, 2], [xw, xh] = def.max || [cols, 40];
    node.classList.add(rs ? 'is-resize' : 'is-drag');
    el.append(ph); ph.hidden = false;
    const putPh = () => { const p = px(it); ph.style.cssText = `left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`; };
    putPh();
    const p0 = px(start.it);
    let moved = false;
    const onMove = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (rs) {
        const wpx = Math.max(mw * (cellW + gap) - gap, p0.width + dx), hpx = Math.max(mh * (rowH + gap) - gap, p0.height + dy);
        node.style.width = wpx + 'px'; node.style.height = hpx + 'px';
        const nw = Math.max(mw, Math.min(xw, cols - it.x, Math.round((wpx + gap) / (cellW + gap))));
        const nh = Math.max(mh, Math.min(xh, Math.round((hpx + gap) / (rowH + gap))));
        if (nw !== it.w || nh !== it.h) { it.w = nw; it.h = nh; compact(it); place(); putPh(); }
      } else {
        node.style.left = p0.left + dx + 'px'; node.style.top = p0.top + dy + 'px';
        const nx = Math.max(0, Math.min(cols - it.w, Math.round((p0.left + dx) / (cellW + gap))));
        const ny = Math.max(0, Math.round((p0.top + dy) / (rowH + gap)));
        if (nx !== it.x || ny !== it.y) { it.x = nx; it.y = ny; compact(it); place(); putPh(); }
      }
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
      node.classList.remove('is-drag', 'is-resize'); ph.hidden = true;
      compact(); place();
      if (rs) draw(it);
      if (moved) save();
    };
    addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  });

  /* 창 크기 */
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const was = stack; place(); if (was !== stack) for (const it of layout) draw(it, true); }); });
  ro.observe(el);

  load();
  return {
    el, toolbar: bar, edit, editing: () => editing, layout: () => layout.map((it) => ({ ...it })), reset, add, remove,
    refresh: (id) => { const it = layout.find((x) => x.id === id); if (it) draw(it, true); },
    setView: (id, v) => { const it = layout.find((x) => x.id === id); if (it) { it.view = v; draw(it); save(); } },
    ready: () => el.dataset.ready === '1',
    destroy() { ro.disconnect(); for (const r of items.values()) { if (typeof r.cleanup === 'function') { try { r.cleanup(); } catch { /* */ } } } el.remove(); bar.remove(); },
  };
}
