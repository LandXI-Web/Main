/* panes.js — 나뉜 칸 크기 조절(원칙 263 · 10-15 사용자: "창을 조율할 수 있는 유연한 UI/UX · 모든 영역").
   칸 하나(pane)의 한 가장자리에 끄는 손잡이를 붙인다. 나머지 칸은 남는 자리를 쓴다.
     import { panes } from '/landxi/v3/kit/panes.js';   // CSS: kit/panes.css
     const p = panes(sideEl, { edge: 'right', key: 'lx-map.side', min: 280, max: 640, otherMin: 420, map });
   edge     손잡이 자리 — 'right'(왼쪽 칸) · 'left'(오른쪽 칸) · 'bottom'(위 칸) · 'top'(아래 칸)
   key      화면 안에서 칸 이름(저장 열쇠 = 사람 · 화면 · 칸). 없으면 저장하지 않음
   cssVar   그리드 화면: 칸 폭을 이 CSS 변수로 넘김(varHost 에 · 기본 부모). CSS 는 var(--x, 기본값) 로 쓴다.
            없으면 칸 자체의 width/height 를 정한다(flex · 지도 위 떠 있는 카드)
   min · max · otherMin   칸 최소 · 최대(≤ 1 이면 비율) · 나머지 칸 최소(px · null = 제한 없음)
   map      크기가 바뀌면 resize() 할 지도(또는 지도를 돌려주는 함수 · 배열)
   collapse 접기 · 펼치기 단추(기본 true)   below  이 화면 폭 미만에서는 손잡이 없음 · 화면 기본 배치(기본 760)
   host     손잡이를 붙일 칸(기본 부모 · 위치 기준)   label  손잡이 이름(title · aria)
   fixed    화면에 붙은 칸(position:fixed 서랍 등) — 손잡이도 화면 기준 · 범위 = 창 폭   z  손잡이 겹침 순서(기본 6)
   기본 크기 = 화면 CSS 그대로(저장한 값이 없을 때). 두 번 누르기 = 기본 크기. 키보드 ← → (위아래 칸은 ↑ ↓) · Shift 크게 · Home/End · Enter 접기.
   → { el, size(), set(px), reset(), collapse(), expand(), toggle(), collapsed(), refresh(), destroy() } */

const MEM = new Map();   // 저장이 막힌 창
const H = 10;            // 손잡이 두께(눈에 보이는 선은 2)
const CHEV = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 5l5 5-5 5"/></svg>';

function who() {
  try {
    const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
    if (s) return String(s.user_id || s.username || s.user?.id || s.login || [s.realm, s.tenant_id || s.role].filter(Boolean).join('.') || 'me');
  } catch { /* */ }
  return 'me';
}
const skey = (k) => `lx.panes.v1.${who()}.${location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '')}.${k}`;
function load(k) {
  if (!k) return null;
  const key = skey(k);
  try { const v = localStorage.getItem(key); if (v !== null) return JSON.parse(v); } catch { /* */ }
  return MEM.get(key) || null;
}
function save(k, v) {
  if (!k) return;
  const key = skey(k);
  MEM.set(key, v);
  try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 불가 창 — 이번 방문 동안만 */ }
}

export function panes(pane, opts = {}) {
  if (!pane) return null;
  const o = { edge: 'right', min: 200, max: Infinity, otherMin: 320, collapse: true, below: 760, label: '칸 크기', ...opts };
  const horiz = o.edge === 'left' || o.edge === 'right';
  const sign = o.edge === 'right' || o.edge === 'bottom' ? 1 : -1;
  const fixed = !!o.fixed;
  const host0 = fixed ? document.body : (o.host || pane.parentElement);
  const varHost = o.varHost || pane.parentElement;
  const container = o.container || (fixed ? document.documentElement : pane.parentElement);
  /* 손잡이 위치 기준 — 붙은 뒤에 한 번 본다(붙기 전 칸은 위치를 알 수 없음). 기준이 없는 칸이면 relative 를 주되,
     그 안에 바깥을 기준으로 떠 있던 요소가 있으면 relative 를 주지 않고 가까운 기준 칸으로 옮긴다(기존 배치 그대로) */
  let host = host0, hostOk = fixed;
  function ensureHost() {
    if (hostOk || !host0.isConnected) return hostOk;
    hostOk = true;
    if (getComputedStyle(host0).position !== 'static') return true;
    const floats = [...host0.querySelectorAll('*')].some((d) => d !== el && !el.contains(d) && getComputedStyle(d).position === 'absolute' && !host0.contains(d.offsetParent));
    if (!floats) { host0.style.position = 'relative'; host0.dataset.pnRel = '1'; return true; }
    let a = host0.parentElement; while (a && a !== document.body && getComputedStyle(a).position === 'static') a = a.parentElement;
    host = a || document.body; host.append(el);
    document.addEventListener('scroll', onSc, { capture: true, passive: true });
    return true;
  }
  const gapOf = () => { if (o.container || fixed) return 0; const cs = getComputedStyle(container); return /grid|flex/.test(cs.display) ? (parseFloat(horiz ? cs.columnGap : cs.rowGap) || 0) : 0; };

  const el = document.createElement('div');
  el.className = `pn-h pn-h--${horiz ? 'x' : 'y'} pn-h--${o.edge}`;
  el.setAttribute('role', 'separator');
  el.setAttribute('aria-orientation', horiz ? 'vertical' : 'horizontal');
  el.setAttribute('tabindex', '0');
  el.setAttribute('aria-label', o.label);
  el.title = o.label;
  if (fixed) el.style.position = 'fixed';
  if (o.z !== undefined) el.style.zIndex = String(o.z);
  else { const z = parseInt(getComputedStyle(pane).zIndex, 10); if (z >= 6) el.style.zIndex = String(z + 1); }   // 떠 있는 칸보다 위
  el.innerHTML = '<i class="pn-line" aria-hidden="true"></i><i class="pn-grip" aria-hidden="true"></i>';   // 선(올리면) + 가운데 작은 손잡이(늘 보임 · 10-17 칸조절 2 — 끌 수 있는 자리가 보이게)
  let btn = null;
  if (o.collapse) {
    btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'pn-fold'; btn.innerHTML = CHEV;
    el.append(btn);
  }
  host.append(el);
  pane.classList.add('pn-pane', `pn-pane--${horiz ? 'x' : 'y'}`);

  let st = load(o.key) || {};        // { px, c } — 저장한 크기 · 접힘
  let live = false;                  // 화면 폭이 below 이상인가

  const rectOf = (n) => n.getBoundingClientRect();
  const cur = () => { const r = rectOf(pane); return horiz ? r.width : r.height; };
  const room = () => { if (fixed) return horiz ? innerWidth : innerHeight; const r = rectOf(container); return horiz ? r.width : r.height; };
  let def = 0;   // 화면 CSS 기본 크기(넓은 화면에서 max 보다 클 수 있음 — 그때는 기본까지 허용)
  const mx = () => (o.max > 0 && o.max <= 1 ? o.max * room() : o.max);   // max ≤ 1 = 나뉜 칸 전체의 비율
  const maxNow = () => Math.max(o.min, def, o.otherMin === null ? mx() : Math.min(mx(), room() - o.otherMin));   // otherMin:null = 나머지 칸 제한 없음(세로로 긴 화면)
  const clamp = (v) => Math.round(Math.min(maxNow(), Math.max(o.min, v)));
  const maps = () => { const m = typeof o.map === 'function' ? o.map() : o.map; return (Array.isArray(m) ? m : [m]).filter((x) => x && typeof x.resize === 'function'); };

  const P = horiz ? ['width', 'maxWidth'] : ['height', 'maxHeight'];
  const orig = { [P[0]]: pane.style[P[0]], [P[1]]: pane.style[P[1]], flex: pane.style.flex, bs: pane.style.boxSizing, v: o.cssVar ? varHost.style.getPropertyValue(o.cssVar) : '' };
  function put(px) {   // px = null → 화면 CSS 기본(붙이기 전 그대로)
    pane.classList.toggle('pn-sized', px !== null);
    if (o.cssVar) { if (px !== null) varHost.style.setProperty(o.cssVar, px + 'px'); else if (orig.v) varHost.style.setProperty(o.cssVar, orig.v); else varHost.style.removeProperty(o.cssVar); return; }
    if (px === null) { pane.style[P[0]] = orig[P[0]]; pane.style[P[1]] = orig[P[1]]; pane.style.flex = orig.flex; pane.style.boxSizing = orig.bs; return; }
    pane.style[P[0]] = px + 'px'; pane.style[P[1]] = 'none'; pane.style.flex = '0 0 auto'; pane.style.boxSizing = 'border-box';   // px = 보이는 크기
  }
  let rq = 0;
  function after() {
    cancelAnimationFrame(rq);
    rq = requestAnimationFrame(() => { place(); for (const m of maps()) { try { m.resize(); } catch { /* */ } } o.onChange?.(api.size(), !!st.c); pane.dispatchEvent(new CustomEvent('panes:resize', { bubbles: true, detail: { size: api.size(), collapsed: !!st.c } })); });
  }
  function apply() {
    live = innerWidth >= o.below;
    pane.classList.toggle('pn-collapsed', live && !!st.c);
    if (!live) put(null);
    else if (st.c) put(0);
    else if (st.px) put(clamp(st.px));
    else put(null);
    el.hidden = !live;
    if (btn) {
      const open = !st.c;
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? '접기' : '펼치기');
      btn.title = open ? '접기' : '펼치기';
      el.classList.toggle('is-folded', !open);
    }
    after();
  }
  function place() {
    if (!ensureHost()) return;
    if (!live) return;
    const pr = rectOf(pane), hr = fixed ? { left: 0, top: 0 } : rectOf(host);
    const xr = o.container || fixed ? pr : rectOf(container);   // 손잡이 길이 = 나뉜 칸 전체(그리드 · flex 부모)
    const cs = getComputedStyle(pane);
    const shown = pane.isConnected && cs.display !== 'none' && (st.c || (cs.visibility !== 'hidden' && pr.width > 0 && pr.height > 0));
    el.hidden = !shown;
    if (!shown) return;
    const l = pr.left - hr.left + (fixed ? 0 : host.scrollLeft - host.clientLeft), t = pr.top - hr.top + (fixed ? 0 : host.scrollTop - host.clientTop);
    const g = st.c ? 0 : gapOf() / 2;   // 칸 사이 틈이 있으면 틈 가운데
    el.classList.toggle('is-short', (horiz ? xr.height : xr.width) < 140 && !st.c);   // 짧은 손잡이는 끌기만(접기는 Enter)
    if (horiz) {
      const x = o.edge === 'right' ? l + pr.width + g : l - g;
      const ty = xr.top - hr.top + (fixed ? 0 : host.scrollTop - host.clientTop);
      Object.assign(el.style, { left: Math.round(x - H / 2) + 'px', top: Math.round(ty) + 'px', height: Math.round(xr.height) + 'px', width: H + 'px' });
    } else {
      const y = o.edge === 'bottom' ? t + pr.height + g : t - g;
      const lx = xr.left - hr.left + (fixed ? 0 : host.scrollLeft - host.clientLeft);
      Object.assign(el.style, { top: Math.round(y - H / 2) + 'px', left: Math.round(lx) + 'px', width: Math.round(xr.width) + 'px', height: H + 'px' });
    }
    const s = Math.round(cur());
    if (!st.px && !st.c && !drag) def = s;
    el.setAttribute('aria-valuenow', String(st.c ? 0 : s));
    el.setAttribute('aria-valuemin', String(o.min));
    el.setAttribute('aria-valuemax', String(Math.round(maxNow())));
  }
  function setPx(px, keep = true) {
    st = { px: clamp(px), c: false };
    if (keep) save(o.key, st);
    apply();
  }

  /* 끌기 — 마우스 · 터치 · 펜 */
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (!live || (btn && btn.contains(e.target)) || e.button > 0) return;
    e.preventDefault();
    const start = st.c ? 0 : cur();
    drag = { id: e.pointerId, p0: horiz ? e.clientX : e.clientY, s0: start, moved: false };
    try { el.setPointerCapture(e.pointerId); } catch { /* */ }
    el.classList.add('is-drag'); document.documentElement.classList.add(horiz ? 'pn-dragging-x' : 'pn-dragging-y');
  });
  let mq = 0, last = null;
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = ((horiz ? e.clientX : e.clientY) - drag.p0) * sign;
    if (!drag.moved && Math.abs(d) < 3) return;
    drag.moved = true; last = drag.s0 + d;
    if (mq) return;
    mq = requestAnimationFrame(() => {
      mq = 0;
      if (last === null) return;
      st = { px: clamp(last), c: false };
      pane.classList.remove('pn-collapsed'); el.classList.remove('is-folded');
      put(st.px); after();
    });
  });
  const end = (e) => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const moved = drag.moved; drag = null; last = null;
    el.classList.remove('is-drag'); document.documentElement.classList.remove('pn-dragging-x', 'pn-dragging-y');
    if (moved) { save(o.key, st); apply(); }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('dblclick', (e) => { if (btn && btn.contains(e.target)) return; api.reset(); });

  /* 키보드 */
  el.addEventListener('keydown', (e) => {
    if (!live) return;
    const inc = horiz ? (o.edge === 'right' ? 'ArrowRight' : 'ArrowLeft') : (o.edge === 'bottom' ? 'ArrowDown' : 'ArrowUp');
    const dec = horiz ? (o.edge === 'right' ? 'ArrowLeft' : 'ArrowRight') : (o.edge === 'bottom' ? 'ArrowUp' : 'ArrowDown');
    const step = e.shiftKey ? 64 : 16;
    const base = st.c ? o.min : cur();
    if (e.key === inc) setPx(base + step);
    else if (e.key === dec) { if (st.c) return; setPx(base - step); }
    else if (e.key === 'Home') setPx(o.min);
    else if (e.key === 'End') setPx(maxNow());
    else if ((e.key === 'Enter' || e.key === ' ') && e.target === el && o.collapse) api.toggle();
    else return;
    e.preventDefault();
  });
  btn?.addEventListener('click', (e) => { e.stopPropagation(); api.toggle(); });

  /* 화면 · 칸 크기 변화 → 손잡이 자리 · 범위 다시 */
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (!drag) { if (live !== innerWidth >= o.below) apply(); else if (st.px && !st.c && live) { const c = clamp(st.px); put(c); } place(); } }) : null;
  ro?.observe(pane); if (container !== pane) ro?.observe(container); if (host !== container) ro?.observe(host);
  const onWin = () => { if (live !== innerWidth >= o.below) apply(); else place(); };
  addEventListener('resize', onWin);
  const onSc = () => place();
  if (!fixed) host.addEventListener('scroll', onSc, { passive: true });   // 칸이 스크롤 판 안에 있을 때
  const onTr = (e) => { if (e.target === pane) place(); };   // 열리는 움직임(transform) 뒤 자리
  pane.addEventListener('transitionend', onTr);

  const api = {
    el, pane,
    size: () => (st.c ? 0 : Math.round(cur())),
    set: (px) => setPx(px),
    reset() { st = {}; save(o.key, null); apply(); },
    // keep=false → 화면이 단계를 바꾸며 접고 펴는 것(사람의 기억으로 남기지 않음) · 손잡이 단추 · 끌기 · 키보드는 늘 기억
    collapse(keep = true) { if (!o.collapse) return; st = { ...st, c: true }; if (keep) save(o.key, st); apply(); },
    expand(keep = true) { st = { ...st, c: false }; if (keep) save(o.key, st); apply(); },
    toggle() { st.c ? api.expand() : api.collapse(); },
    collapsed: () => !!st.c,
    remembered: () => load(o.key),   // 사람이 직접 끌거나 접고 편 기억({ px, c }) · 없으면 null — 화면이 기본 배치를 정할 때 기억이 먼저(10-17 원칙 273)
    refresh: () => apply(),
    destroy() { ro?.disconnect(); removeEventListener('resize', onWin); pane.removeEventListener('transitionend', onTr); host.removeEventListener('scroll', onSc); document.removeEventListener('scroll', onSc, { capture: true }); el.remove(); put(null); pane.classList.remove('pn-pane', 'pn-pane--x', 'pn-pane--y', 'pn-collapsed'); },
  };
  apply();
  return api;
}
