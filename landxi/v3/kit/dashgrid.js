/* K18 dashgrid.js — 개인별 맞춤 대시보드 칸 격자(10-17 원칙 280 · 283 · 263 — "단위 기능들을 배치를 서로 바꾸고 사이즈를 늘렸다 줄였다 커스텀").
   10-18 원칙 285: 크기를 바꿀 때 다른 칸은 고정(따라 움직이지 않음 · 막히면 거기까지) · 남은 빈 공간은 수정 중에 점선 자리로 보여 '기능 추가하기' · '옆 칸 늘리기' 중 고르게 ·
   칸의 크기 등급(s · m · l)은 실제 px 크기로 정해 칸마다 그 크기에 맞는 화면을 그린다 · 미리 만든 모양(presets) 고르기.
   LX 직원 대시보드가 먼저 쓰고, LX 관리자 · 기관 첫 화면도 같은 부품을 쓸 수 있다(공용 kit · CSS 는 kit/dashgrid.css · 처음 쓸 때 스스로 붙인다).

     import { dashgrid } from '../kit/dashgrid.js';
     const g = dashgrid(host, {
       screen: 'lx-console',                       // 저장 열쇠 → 사용자 설정 /me/prefs/dash.{screen}(계정별 · 서버) + 같은 값을 브라우저에도(바로 그리기)
       widgets: { id: { title, more, min: [w, h], max: [w, h], def: [w, h], views: [{ id, label }], render(body, ctx) } },
       defaults: [{ id, x, y, w, h, view }],       // 처음 모양
       presets: [{ id, label, items }],            // 고를 수 있는 다른 모양(선택)
       cols: 12, rowH: 60, gap: 12,                // 격자(열 12 · 줄 높이 · 틈) — 칸 크기는 격자 단위로만 바뀐다(내용 때문에 출렁이지 않는다 · 원칙 231)
     });
     g.toolbar  → 화면이 원하는 자리에 둔다('대시보드 수정하기' 단추 하나 · 수정 중엔 '기능 추가하기' · '모양 고르기' · '처음 모양으로' · '완료')

   render(body, ctx) — 칸 몸통을 그린다. ctx = { id, w, h, view, size('s'|'m'|'l' — 실제 px 로 정함), px: {w, h}, sub(node|text), refresh() }
     · 칸 크기(w · h · 크기 등급) 또는 보기 방식(view)이 바뀌면 다시 부른다(끌어 옮기기만 한 경우는 부르지 않는다).
     · 돌려주는 함수가 있으면 다음 그리기 전에 부른다(정리).
   수정 모드(edit) — 머리를 끌어 자리 바꾸기(빈자리면 놓고 · 한 칸과 겹치면 서로 바꾸고 · 그 밖엔 겹친 칸만 아래로) · 네 변 · 네 모서리 어디서든 끌어 크기(10-18 원칙 294 · 반대쪽 변은 고정 · 다른 칸은 고정 · 막히면 거기까지) · × 로 빼기 · 머리의 보기 방식 칩.
     빈 공간은 점선 자리로 보이고 '기능 추가하기'(그 크기에 맞는 칸만) · '옆 칸 늘리기'(붙은 칸을 그만큼 늘림). 평소에는 손잡이 · 빈 자리가 보이지 않는다.
   좁은 화면(760 미만)은 한 줄로 쌓고 수정 모드 없음(PC 에서 고른 순서 그대로).
   10-18 원칙 287 "똑같은 기능이여도 테마나 디자인을 조금 여러개 해서 선택할 수 있도록":
     · themes: [{ id, label, desc }] — 대시보드 전체 테마(모두 밝은 톤 · 검정 톤 없음 · 규칙 3-4). 수정 중 '테마' 단추 → 목록 위에 손을 올리면 바로 미리 보기, 누르면 저장. .dg[data-theme=id] 로 CSS 가 입힌다 · 칸은 ctx.theme 으로 안다.
     · widgets[id].styles: [{ id, label }] — 칸마다 표시 방식(예: 숫자만 · 숫자 + 막대). 수정 중 머리의 칩 · ctx.style 로 받는다 · 바뀌면 다시 그린다.
   저장 모양 { v: 1, theme, items: [{ id, x, y, w, h, view, style }] } — 모르는 칸 · 모르는 테마는 버리고, 크기는 min · max · 열 수 안으로 맞춘다. */
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

export function dashgrid(host, { screen, widgets, defaults = [], presets = [], themes = [], cols = 12, rowH = 64, gap = 12, stackBelow = 760, words = {} } = {}) {
  sheet();
  const W = { edit: '대시보드 수정하기', done: '완료', add: '기능 추가하기', none: '더할 칸이 없습니다', reset: '처음 모양으로', remove: '이 칸 빼기', move: '끌어서 자리 바꾸기',
    resize: '가장자리 · 모서리를 끌어 크기 바꾸기', view: '보기 방식', style: '표시 방식', saved: '대시보드를 저장했습니다', save_fail: '배치를 저장하지 못했습니다', reset_ok: '처음 모양으로 돌렸습니다',
    limit: '다른 칸이 있어 여기까지 늘릴 수 있습니다', gap: '빈 자리', gap_add: '기능 추가하기', gap_grow: '옆 칸 늘리기', gap_none: '여기에 맞는 칸이 없습니다', gap_nogrow: '늘릴 옆 칸이 없습니다',
    presets: '모양 고르기', preset_ok: '모양을 바꿨습니다', theme: '테마', theme_ok: '테마를 바꿨습니다', theme_now: '지금 테마', ...words };
  const KEY = 'dash.' + screen, LSK = `lx.dash.v1.${who()}.${screen}`;
  const el = h('div.dg', { role: 'list' });
  host.append(el);
  const ph = h('div.dg-ph', { hidden: true });
  const items = new Map();          // id → { it(배치), node, body, ctx, cleanup, drawn: {w,h,view,style,size,theme} }
  let layout = [], editing = false, saveT = 0, raf = 0, stack = false, cellW = 0, dragging = false;
  /* 테마 — 목록의 첫 것이 기본 · 모르는 값은 기본으로 */
  const THEME0 = themes[0]?.id || null;
  const themeOk = (t) => (themes.some((x) => x.id === t) ? t : THEME0);
  let theme = THEME0;
  function paintTheme(t) {                       // 화면에만 입힌다(미리 보기에도 씀) — 저장은 setTheme
    if (t) { el.dataset.theme = t; host.dataset.dgTheme = t; } else { delete el.dataset.theme; delete host.dataset.dgTheme; }
  }
  function setTheme(t, { quiet = false } = {}) {
    const next = themeOk(t);
    const changed = next !== theme;
    theme = next; paintTheme(theme);
    if (changed) for (const it of layout) draw(it, true);   // 테마마다 칸 안 여백 · 줄 수가 달라 다시 그린다
    if (!quiet) { save(); if (changed) toast(W.theme_ok); }
  }

  /* ── 배치 ─────────────────────────────────────────────── */
  const clampItem = (it) => {
    const d = widgets[it.id]; if (!d) return null;
    const [mw, mh] = d.min || [2, 2], [xw, xh] = d.max || [cols, 40];
    const w = Math.max(mw, Math.min(xw, cols, Math.round(+it.w || d.def?.[0] || mw)));
    const hh = Math.max(mh, Math.min(xh, Math.round(+it.h || d.def?.[1] || mh)));
    const x = Math.max(0, Math.min(cols - w, Math.round(+it.x || 0)));
    const view = d.views?.some((v) => v.id === it.view) ? it.view : (d.views?.[0]?.id || null);
    const style = d.styles?.some((v) => v.id === it.style) ? it.style : (d.styles?.[0]?.id || null);
    return { id: it.id, x, y: Math.max(0, Math.round(+it.y || 0)), w, h: hh, view, style };
  };
  const sanitize = (arr) => {
    const seen = new Set(), out = [];
    for (const it of Array.isArray(arr) ? arr : []) { if (!it || seen.has(it.id)) continue; const c = clampItem(it); if (c) { seen.add(c.id); out.push(c); } }
    return out;
  };
  /** 겹침만 푼다 — fixed(끌고 있는 칸)는 그대로, 겹친 칸만 아래로 내린다. 위로 · 왼쪽으로 당기지 않는다(원칙 285 "나머지는 따라서 움직이지 말고 고정"). */
  function settle(fixed = null) {
    const placed = fixed ? [fixed] : [];
    const rest = layout.filter((it) => it !== fixed).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const it of rest) { while (placed.some((o) => collides(o, it))) it.y++; placed.push(it); }
  }
  const rows = () => layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
  const px = (it) => stack
    ? { left: 0, top: 0, width: el.clientWidth, height: it.h * (rowH + gap) - gap }
    : { left: it.x * (cellW + gap), top: it.y * (rowH + gap), width: it.w * (cellW + gap) - gap, height: it.h * (rowH + gap) - gap };
  /** 크기 등급 — 실제 px 로(열 수가 같아도 1366 과 1920 은 다르다) */
  const sizeWord = (it) => { const p = px(it); return (p.width < 400 || p.height < 300) ? 's' : (p.width >= 720 && p.height >= 380) ? 'l' : 'm'; };
  /** 빈 공간 — 차지한 칸을 뺀 나머지를 직사각형으로 묶는다(위 · 왼쪽부터) */
  function gaps() {
    const R = rows(); if (!R) return [];
    const occ = Array.from({ length: R }, () => new Array(cols).fill(false));
    for (const it of layout) for (let y = it.y; y < Math.min(R, it.y + it.h); y++) for (let x = it.x; x < Math.min(cols, it.x + it.w); x++) occ[y][x] = true;
    const out = [];
    for (let y = 0; y < R; y++) for (let x = 0; x < cols; x++) {
      if (occ[y][x]) continue;
      let w = 0; while (x + w < cols && !occ[y][x + w]) w++;
      let hh = 1; while (y + hh < R && occ[y + hh].slice(x, x + w).every((v) => !v)) hh++;
      for (let yy = y; yy < y + hh; yy++) for (let xx = x; xx < x + w; xx++) occ[yy][xx] = true;
      out.push({ x, y, w, h: hh });
    }
    return out;
  }
  /** 빈 자리에 붙은 칸 중 그만큼 늘릴 수 있는 것(왼 · 위 · 오른 · 아래 순) → { it, next } */
  function grower(g) {
    for (const it of layout) {
      const d = widgets[it.id], [xw, xh] = d.max || [cols, 40];
      const rowsIn = it.y >= g.y && it.y + it.h <= g.y + g.h, colsIn = it.x >= g.x && it.x + it.w <= g.x + g.w;
      let next = null;
      if (it.x + it.w === g.x && rowsIn && it.w + g.w <= xw) next = { ...it, w: it.w + g.w };
      else if (it.y + it.h === g.y && colsIn && it.h + g.h <= xh) next = { ...it, h: it.h + g.h };
      else if (it.x === g.x + g.w && rowsIn && it.w + g.w <= xw) next = { ...it, x: g.x, w: it.w + g.w };
      else if (it.y === g.y + g.h && colsIn && it.h + g.h <= xh) next = { ...it, y: g.y, h: it.h + g.h };
      if (next && !layout.some((o) => o !== it && collides(o, next))) return { it, next };
    }
    return null;
  }
  const fits = (id, g) => { const d = widgets[id], [mw, mh] = d.min || [2, 2]; return mw <= g.w && mh <= g.h; };

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
      placeGaps();
      return;
    }
    el.style.height = Math.max(rowH, rows() * (rowH + gap) - gap) + 'px';
    for (const it of layout) {
      const n = items.get(it.id)?.node; if (!n || n.classList.contains('is-drag')) continue;
      const p = px(it);
      n.style.cssText = `left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`;
    }
    placeGaps();
  }
  /* 빈 자리 — 수정 중에만 · 끄는 동안은 그리지 않는다 */
  const gapNodes = [];
  function placeGaps() {
    for (const n of gapNodes) n.remove(); gapNodes.length = 0;
    if (!editing || stack || dragging) return;
    for (const g of gaps()) {
      const p = px(g);
      const can = Object.keys(widgets).filter((id) => !layout.some((it) => it.id === id) && fits(id, g));
      const gr = grower(g);
      const menu = h('div.dg-menu.dg-menu--gap', { hidden: true, role: 'menu' });
      const bAdd = h('button.dg-gap-b', { type: 'button', text: W.gap_add, disabled: !can.length, title: can.length ? '' : W.gap_none, 'aria-haspopup': 'true', 'aria-expanded': 'false',
        onclick: (e) => { e.stopPropagation(); const on = menu.hidden; closeMenus(); if (on) { menu.replaceChildren(...can.map((id) => h('button.dg-mi', { type: 'button', role: 'menuitem', text: widgets[id].title, onclick: () => { addAt(id, g); } }))); menu.hidden = false; bAdd.setAttribute('aria-expanded', 'true'); } } });
      const bGrow = h('button.dg-gap-b', { type: 'button', text: W.gap_grow, disabled: !gr, title: gr ? `${widgets[gr.it.id].title} 칸을 늘립니다` : W.gap_nogrow,
        onclick: (e) => { e.stopPropagation(); if (!gr) return; Object.assign(gr.it, gr.next); render(); save(); } });
      const n = h('div.dg-gap', { role: 'group', 'aria-label': W.gap, style: `left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`, class: g.w < 2 || g.h < 2 || p.width < 150 ? 'is-tiny' : '' },
        h('div.dg-gap-in', {}, bAdd, bGrow), menu);
      el.append(n); gapNodes.push(n);
    }
  }
  function ctxOf(it, rec) {
    const p = px(it);
    return { id: it.id, w: it.w, h: it.h, view: it.view, style: it.style, theme, size: sizeWord(it), px: { w: p.width, h: p.height },
      sub(x) { rec.sub.replaceChildren(...(x === null || x === undefined ? [] : [typeof x === 'string' ? document.createTextNode(x) : x])); rec.sub.hidden = !rec.sub.childNodes.length; },
      refresh: () => draw(it, true) };
  }
  function draw(it, force = false) {
    const rec = items.get(it.id); if (!rec) return;
    const d = rec.drawn, size = sizeWord(it);
    if (!force && d && d.w === it.w && d.h === it.h && d.view === it.view && d.style === it.style && d.size === size && d.theme === theme) return;
    if (typeof rec.cleanup === 'function') { try { rec.cleanup(); } catch { /* */ } }
    rec.cleanup = null;
    rec.drawn = { w: it.w, h: it.h, view: it.view, style: it.style, size, theme };
    rec.node.dataset.w = it.w; rec.node.dataset.h = it.h; rec.node.dataset.size = size; rec.node.dataset.view = it.view || ''; rec.node.dataset.style = it.style || '';
    rec.node.classList.toggle('is-narrow', px(it).width < 520);
    rec.body.className = 'dg-body'; rec.body.replaceChildren();
    for (const b of rec.views.children) b.setAttribute('aria-pressed', b.dataset.v === it.view ? 'true' : 'false');
    for (const b of rec.styles.children) b.setAttribute('aria-pressed', b.dataset.v === it.style ? 'true' : 'false');
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
    /* 표시 방식(칸마다 · 10-18 원칙 287) — 같은 기능을 다른 모양으로(예: 숫자만 · 숫자 + 막대) */
    const styles = h('div.dg-views.dg-styles', { role: 'group', 'aria-label': W.style }, ...(def.styles || []).map((v) => h('button.dg-v', { type: 'button', text: v.label, dataset: { v: v.id }, 'aria-pressed': 'false',
      onclick: () => { it.style = v.id; draw(it); save(); } })));
    const sub = h('small.dg-sub', { hidden: true });
    const body = h('div.dg-body');
    const node = h('section.dg-item.t-card', { role: 'listitem', dataset: { id: it.id }, 'aria-label': def.title },
      h('div.dg-hd', {},
        h('span.dg-grip', { html: GRIP, title: W.move, 'aria-hidden': 'true' }),
        h('div.dg-hd-t', {}, h('h2.dg-t', { text: def.title }), sub),
        more || null, (def.views || []).length > 1 ? views : null, (def.styles || []).length > 1 ? styles : null,
        h('button.dg-rm', { type: 'button', html: X, title: W.remove, 'aria-label': `${def.title} · ${W.remove}`, onclick: () => remove(it.id) })),
      body,
      ...['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'].map((d) => h('span.dg-rs', { dataset: { dir: d }, title: W.resize, 'aria-hidden': 'true' })),
      h('span.dg-limit', { text: W.limit, 'aria-hidden': 'true' }));
    items.set(it.id, { it, node, body, sub, views, styles, cleanup: null, drawn: null });
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
  const snapshot = () => ({ v: 1, theme, items: layout.map((it) => ({ id: it.id, x: it.x, y: it.y, w: it.w, h: it.h, view: it.view, style: it.style })) });
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
    theme = themeOk(local?.theme); paintTheme(theme);
    settle(); render();
    try {
      const j = await api('/me/prefs/' + encodeURIComponent(KEY));
      const srv = j?.options;
      if (srv && Array.isArray(srv.items)) {
        const next = sanitize(srv.items), nextTheme = themeOk(srv.theme), reTheme = nextTheme !== theme;
        if (reTheme) { theme = nextTheme; paintTheme(theme); }
        if (JSON.stringify(next) !== JSON.stringify(layout)) { layout = next; settle(); render(); }
        else if (reTheme) for (const it of layout) draw(it);   // 테마만 달라졌으면 칸만 다시(drawn.theme 비교)
        LS.set(LSK, snapshot());
      } else if (srv === null && local) {         // 서버엔 없고 브라우저에만 — 서버로 올린다(다른 PC 에서도 같은 모양)
        push();
      } else if (!srv && !local) { layout = sanitize(defaults); settle(); render(); }
    } catch { /* 서버에 못 물으면 브라우저 사본 · 처음 모양으로 */ }
    el.dataset.ready = '1';
  }

  /* ── 수정 모드 ─────────────────────────────────────────────── */
  const bar = h('div.dg-bar', { role: 'toolbar', 'aria-label': W.edit });
  const bEdit = h('button.t-btn.t-btn--2.dg-b.dg-b--edit', { type: 'button', text: W.edit, onclick: () => edit(true) });
  const addMenu = h('div.dg-menu', { hidden: true, role: 'menu' });
  const bAdd = h('button.t-btn.t-btn--2.dg-b.dg-b--add', { type: 'button', text: W.add, 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => toggleMenu() });
  const preMenu = h('div.dg-menu', { hidden: true, role: 'menu' });
  const bPre = h('button.t-btn.t-btn--2.dg-b.dg-b--pre', { type: 'button', text: W.presets, 'aria-haspopup': 'true', 'aria-expanded': 'false', hidden: !presets.length, onclick: () => togglePre() });
  const bReset = h('button.t-btn.t-btn--2.dg-b.dg-b--reset', { type: 'button', text: W.reset, onclick: () => reset() });
  const bDone = h('button.t-btn.dg-b.dg-b--done', { type: 'button', text: W.done, onclick: () => edit(false) });
  const addWrap = h('span.dg-addw', {}, bAdd, addMenu);
  const preWrap = h('span.dg-addw', { hidden: !presets.length }, bPre, preMenu);
  /* 테마 — '모양 고르기' 옆 · 목록 위에 손을 올리면(또는 초점) 그 테마가 바로 입혀져 미리 보고 · 누르면 저장 · 벗어나면 지금 테마로 */
  const thMenu = h('div.dg-menu.dg-menu--theme', { hidden: true, role: 'menu', onmouseleave: () => paintTheme(theme) });
  const bTheme = h('button.t-btn.t-btn--2.dg-b.dg-b--theme', { type: 'button', text: W.theme, 'aria-haspopup': 'true', 'aria-expanded': 'false', hidden: themes.length < 2, onclick: () => toggleTheme() });
  const thWrap = h('span.dg-addw', { hidden: themes.length < 2 }, bTheme, thMenu);
  bar.append(bEdit, addWrap, preWrap, thWrap, bReset, bDone);
  function toggleTheme(on = thMenu.hidden) {
    if (on) thMenu.replaceChildren(...themes.map((t) => h('button.dg-mi.dg-mi--theme', { type: 'button', role: 'menuitemradio', 'aria-checked': t.id === theme ? 'true' : 'false', dataset: { theme: t.id },
      onmouseenter: () => paintTheme(t.id), onfocus: () => paintTheme(t.id), onblur: () => paintTheme(theme),
      onclick: () => { setTheme(t.id); toggleTheme(false); } },
      h('span.dg-sw', { 'aria-hidden': 'true', dataset: { theme: t.id } }, h('i'), h('i'), h('i')),
      h('span.dg-mi-t', {}, h('b', { text: t.label }), t.desc ? h('small', { text: t.desc }) : null),
      t.id === theme ? h('span.dg-mi-now', { text: W.theme_now }) : null)));
    else paintTheme(theme);
    thMenu.hidden = !on; bTheme.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function closeMenus() {
    for (const n of gapNodes) { const m = n.querySelector('.dg-menu'); if (m) m.hidden = true; n.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); }
    if (!addMenu.hidden) toggleMenu(false);
    if (!preMenu.hidden) togglePre(false);
    if (!thMenu.hidden) toggleTheme(false);
  }
  function toggleMenu(on = addMenu.hidden) {
    if (on) {
      const free = Object.keys(widgets).filter((id) => !layout.some((it) => it.id === id));
      addMenu.replaceChildren(...(free.length ? free.map((id) => h('button.dg-mi', { type: 'button', role: 'menuitem', text: widgets[id].title, onclick: () => { add(id); toggleMenu(false); } }))
        : [h('span.dg-mi.is-none', { text: W.none })]));
    }
    addMenu.hidden = !on; bAdd.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  function togglePre(on = preMenu.hidden) {
    if (on) preMenu.replaceChildren(...presets.map((p) => h('button.dg-mi', { type: 'button', role: 'menuitem', text: p.label, onclick: () => { applyPreset(p.id); togglePre(false); } })));
    preMenu.hidden = !on; bPre.setAttribute('aria-expanded', on ? 'true' : 'false');
  }
  addEventListener('pointerdown', (e) => { if (!e.target.closest('.dg-addw, .dg-gap')) closeMenus(); });
  function edit(on) {
    if (on && stack) return;
    editing = !!on;
    el.classList.toggle('is-edit', editing);
    bar.classList.toggle('is-edit', editing);
    host.classList.toggle('dg-editing', editing);
    if (!editing) { closeMenus(); if (saveT) { clearTimeout(saveT); saveT = 0; push().then((ok) => ok && toast(W.saved)); } }
    else bAdd.focus();
    placeGaps();
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
    layout.push(c); render(); save();
    items.get(id)?.node.scrollIntoView({ block: 'nearest', behavior: RM() ? 'auto' : 'smooth' });
  }
  /** 빈 자리에 기능 추가하기 — 그 자리 크기까지(기본 크기보다 작게 들어갈 수 있다 · 최소는 지킨다) */
  function addAt(id, g) {
    const d = widgets[id]; if (!d || layout.some((it) => it.id === id)) return;
    const c = clampItem({ id, w: Math.min(g.w, d.def?.[0] || g.w), h: Math.min(g.h, d.def?.[1] || g.h), view: d.views?.[0]?.id });
    c.x = g.x; c.y = g.y;
    layout.push(c); render(); save();
  }
  function remove(id) { layout = layout.filter((it) => it.id !== id); render(); save(); }
  function applyPreset(id) {
    const p = presets.find((x) => x.id === id); if (!p) return;
    layout = sanitize(p.items); settle(); render(); save(); toast(W.preset_ok);
  }
  async function reset() {
    layout = sanitize(defaults); theme = THEME0; paintTheme(theme); settle(); render();   // render 가 테마 달라진 칸도 다시 그린다
    LS.set(LSK, null);
    try { localStorage.removeItem(LSK); } catch { /* */ }
    try { await api('/me/prefs/' + encodeURIComponent(KEY), { method: 'DELETE' }); toast(W.reset_ok); } catch { toast(W.save_fail); }
  }

  /* 끌어 옮기기 · 크기 바꾸기(포인터) */
  el.addEventListener('pointerdown', (e) => {
    if (!editing || stack || e.button !== 0) return;
    const node = e.target.closest('.dg-item'); if (!node) return;
    const rs = e.target.closest('.dg-rs'), dir = rs?.dataset.dir || '', hd = e.target.closest('.dg-hd');
    if (!rs && (!hd || e.target.closest('a,button,input,select,textarea'))) return;
    const it = layout.find((x) => x.id === node.dataset.id); if (!it) return;
    e.preventDefault();
    closeMenus();
    const start = { x: e.clientX, y: e.clientY, it: { ...it } }, def = widgets[it.id];
    const [mw, mh] = def.min || [2, 2], [xw, xh] = def.max || [cols, 40];
    const base = new Map(layout.filter((o) => o !== it).map((o) => [o, { x: o.x, y: o.y }]));   // 다른 칸의 시작 자리 — 끌 때마다 여기서 다시 계산(누적 밀림 0)
    node.classList.add(rs ? 'is-resize' : 'is-drag');
    dragging = true; placeGaps();
    el.append(ph); ph.hidden = false;
    const putPh = () => { const p = px(it); ph.style.cssText = `left:${p.left}px;top:${p.top}px;width:${p.width}px;height:${p.height}px`; };
    putPh();
    const p0 = px(start.it);
    let moved = false;
    const others = layout.filter((o) => o !== it);
    const hitAny = (t) => others.some((o) => collides(o, t));
    const onMove = (ev) => {
      const dx = ev.clientX - start.x, dy = ev.clientY - start.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
      if (rs) {
        /* 네 변 · 네 모서리 어디서든 — 끄는 쪽 변만 움직이고 반대쪽 변은 고정. 다른 칸은 고정 · 막히면 거기까지(가로 먼저 · 그다음 세로) */
        const cw = cellW + gap, rh = rowH + gap;
        const ox0 = start.it.x, ox1 = start.it.x + start.it.w, oy0 = start.it.y, oy1 = start.it.y + start.it.h;
        const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        let x0 = ox0, x1 = ox1, y0 = oy0, y1 = oy1;
        if (dir.includes('w')) x0 = cl(Math.round((p0.left + dx) / cw), Math.max(0, ox1 - xw), ox1 - mw);
        if (dir.includes('e')) x1 = cl(Math.round((p0.left + p0.width + dx + gap) / cw), ox0 + mw, Math.min(cols, ox0 + xw));
        if (dir.includes('n')) y0 = cl(Math.round((p0.top + dy) / rh), Math.max(0, oy1 - xh), oy1 - mh);
        if (dir.includes('s')) y1 = cl(Math.round((p0.top + p0.height + dy + gap) / rh), oy0 + mh, oy0 + xh);
        const wx0 = x0, wx1 = x1, wy0 = y0, wy1 = y1;
        const T = () => ({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const yLo = Math.max(oy0, wy0), yHi = Math.min(oy1, wy1);
        while (x0 < ox0 && hitAny({ x: x0, y: yLo, w: ox1 - x0, h: Math.max(1, yHi - yLo) })) x0++;
        while (x1 > ox1 && hitAny({ x: ox0, y: yLo, w: x1 - ox0, h: Math.max(1, yHi - yLo) })) x1--;
        while (y0 < oy0 && hitAny({ x: x0, y: y0, w: x1 - x0, h: oy1 - y0 })) y0++;
        while (y1 > oy1 && hitAny({ x: x0, y: oy0, w: x1 - x0, h: y1 - oy0 })) y1--;
        const limited = x0 !== wx0 || x1 !== wx1 || y0 !== wy0 || y1 !== wy1;
        node.classList.toggle('is-limit', limited); ph.classList.toggle('is-limit', limited);
        const t = T();
        if (t.x !== it.x || t.y !== it.y || t.w !== it.w || t.h !== it.h) { it.x = t.x; it.y = t.y; it.w = t.w; it.h = t.h; place(); putPh(); }
      } else {
        node.style.left = p0.left + dx + 'px'; node.style.top = p0.top + dy + 'px';
        const nx = Math.max(0, Math.min(cols - it.w, Math.round((p0.left + dx) / (cellW + gap))));
        const ny = Math.max(0, Math.round((p0.top + dy) / (rowH + gap)));
        if (nx !== it.x || ny !== it.y) {
          for (const [o, b] of base) { o.x = b.x; o.y = b.y; }
          it.x = nx; it.y = ny;
          const hits = others.filter((o) => collides(o, it));
          if (hits.length === 1) {                                   // 한 칸과 겹치면 서로 자리 바꾸기(그 칸이 내 자리에 들어가면)
            const o = hits[0], there = { x: Math.min(cols - o.w, start.it.x), y: start.it.y, w: o.w, h: o.h };
            if (!others.some((q) => q !== o && collides(q, there)) && !collides(there, it)) { o.x = there.x; o.y = there.y; }
          }
          settle(it);                                                // 그래도 겹치는 칸만 아래로 — 나머지는 고정
          place(); putPh();
        }
      }
    };
    const onUp = () => {
      removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp);
      node.classList.remove('is-drag', 'is-resize', 'is-limit'); ph.hidden = true; ph.classList.remove('is-limit');
      dragging = false;
      place();
      if (rs) draw(it);
      if (moved) save();
    };
    addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  });

  /* 창 크기 — 크기 등급(s · m · l)이 바뀐 칸만 다시 그린다 */
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const was = stack; place(); for (const it of layout) { const rec = items.get(it.id); if (was !== stack || (rec?.drawn && rec.drawn.size !== sizeWord(it))) draw(it, true); } }); });
  ro.observe(el);

  load();
  return {
    el, toolbar: bar, edit, editing: () => editing, layout: () => layout.map((it) => ({ ...it })), reset, add, remove, applyPreset,
    setLayout(items) { layout = sanitize(items); settle(); render(); save(); },
    refresh: (id) => { const it = layout.find((x) => x.id === id); if (it) draw(it, true); },
    setView: (id, v) => { const it = layout.find((x) => x.id === id); if (it) { it.view = v; draw(it); save(); } },
    setStyle: (id, v) => { const it = layout.find((x) => x.id === id); if (it) { it.style = v; draw(it); save(); } },
    theme: () => theme, setTheme, themes: () => themes.map((t) => ({ ...t })),
    ready: () => el.dataset.ready === '1',
    destroy() { ro.disconnect(); for (const r of items.values()) { if (typeof r.cleanup === 'function') { try { r.cleanup(); } catch { /* */ } } } el.remove(); bar.remove(); },
  };
}
