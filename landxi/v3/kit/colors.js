/* colors.js — 지도 층 색 바꾸기 공용 부품(원칙 264 · 2026-10-15 사용자 "지도 시각화는 색상을 사용자가 좀 조정할 수 있도록 … 색상 커스텀도 유연하게").
   층(또는 클래스)마다: 준비된 색 묶음 고르기(법전 팔레트 기반 · 색약에도 구분되는 한 벌 포함) · 색 직접 고르기(색 칸 · 최근 색 · 직접) · 투명도 ·
   값 척도(신뢰도 · 밀도 · 비율 등)는 색 띠(연속 · 단계 · 발산) · '기본 색으로'. 사람 · 화면 · 층별로 브라우저에 기억(저장이 막혀도 그 방문 동안 동작). 바꾸면 onChange → 지도에 즉시.

     import { colors, colorState, paintLayers } from '/landxi/v3/kit/colors.js';     // CSS: kit/colors.css(kit.css 가 부름)
     const st = colorState('층이름', { classes: { 경작지: '#0FA9A0', 건물: '#010102' } });   // 저장된 값 + 기본
     paintLayers(map, layerIds, st, { prop: 'cls', value: { prop: 'conf', min: 0, max: 1 } }); // 층에 칠하기(기본이면 원래 모양 그대로)
     colors(dotButton, { key: '층이름', title: '비닐하우스 · 남원시', classes: [{ k: '경작지', color: '#0FA9A0' }, …],
       scale: { label: '신뢰도', lo: '0%', hi: '100%' }, onChange: (st) => paintLayers(map, layerIds, st, …) });

   상태 st = { mode: 'cls'|'scale', cls: { 클래스: '#RRGGBB' }(바꾼 것만), op: 0~1(1 = 원래 진하기 · 투명도 = 1 − op), ramp: 띠 id, step: 단계 여부, custom: 바꾼 것이 있는가 } */

const MEM = new Map();
function who() {
  try {
    const s = JSON.parse(localStorage.getItem('lx_api_session') || 'null');
    if (s) return String(s.user_id || s.username || s.user?.id || s.login || [s.realm, s.tenant_id || s.role].filter(Boolean).join('.') || 'me');
  } catch { /* */ }
  return 'me';
}
const page = () => location.pathname.replace(/\/index\.html$/, '/').replace(/\/+$/, '');
const skey = (k) => `lx.colors.v1.${who()}.${page()}.${k}`;
const rkey = () => `lx.colors.v1.${who()}.recent`;
function load(key) {
  try { const v = localStorage.getItem(key); if (v !== null) return JSON.parse(v); } catch { /* */ }
  return MEM.get(key) ?? null;
}
function save(key, v) {
  MEM.set(key, v);
  try { if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v)); } catch { /* 저장 불가 창 — 이번 방문 동안만 */ }
}

/* ── 색 묶음(클래스 순서대로 입힌다) — 첫 벌 '기본' 은 화면이 준 색 그대로 ── */
export const PALETTES = [
  { id: 'base', name: '기본', colors: null },
  { id: 'law', name: '선명', colors: ['#0FA9A0', '#006DF7', '#FFB633', '#F04452', '#1C1F25', '#8F99A8', '#07706A', '#7C5CFA'] },          // 법전 §1 색(AI 청록 · 액센트 · 앰버 · 경고 · 잉크 · 회)
  { id: 'cvd', name: '색약 구분', colors: ['#0072B2', '#E69F00', '#009E73', '#D55E00', '#CC79A7', '#56B4E9', '#F0E442', '#000000'] },     // Okabe–Ito(적록 색약에도 구분)
  { id: 'calm', name: '차분', colors: ['#3F8F88', '#C08A2E', '#5B7DB1', '#B0624A', '#7D6AA6', '#6E7F80', '#9AA64B', '#4E535C'] },
];
/* 색 칸(직접 고르기) — 법전 잉크 · 회 · AI 청록 · 액센트 · 앰버 · 경고 + 지도 위에서 잘 보이는 색 */
export const SWATCHES = ['#0FA9A0', '#07706A', '#006DF7', '#1B64DA', '#7C5CFA', '#CC79A7', '#F04452', '#D55E00', '#FFB633', '#F0E442', '#5EC962', '#009E73', '#1C1F25', '#4E535C', '#8F99A8', '#FFFFFF'];
/* 색 띠 — kind: seq(연속 값) · div(가운데 기준 양쪽) */
export const RAMPS = [
  { id: 'teal', name: '청록', kind: 'seq', stops: ['#E3F6F4', '#8FD8D2', '#0FA9A0', '#07706A', '#03403C'] },
  { id: 'blue', name: '파랑', kind: 'seq', stops: ['#E8F1FE', '#9CC3FB', '#3C8BF8', '#006DF7', '#0B2E66'] },
  { id: 'heat', name: '주황', kind: 'seq', stops: ['#FFF4DE', '#FFD27A', '#FFB633', '#E0702A', '#9C2F12'] },
  { id: 'viridis', name: '색약 구분', kind: 'seq', stops: ['#440154', '#3B528B', '#21918C', '#5EC962', '#FDE725'] },
  { id: 'div', name: '발산', kind: 'div', stops: ['#D7303F', '#F28E8E', '#F4F5F7', '#7FB0F8', '#1B5FD0'] },
];
const rampOf = (id) => RAMPS.find((r) => r.id === id) || RAMPS[0];
const HEX = /^#[0-9a-f]{6}$/i;

/** 저장된 값 + 기본 → 지금 상태. def = { classes: {k: 기본색}, ramp?, step?, mode? } */
export function colorState(key, def = {}) {
  const s = load(skey(key)) || {};
  const cls = {};
  for (const [k, v] of Object.entries(s.cls || {})) if (HEX.test(v)) cls[k] = v;
  const st = {
    mode: s.mode === 'scale' ? 'scale' : def.mode || 'cls',
    cls, op: typeof s.op === 'number' ? Math.min(1, Math.max(0.05, s.op)) : 1,
    ramp: s.ramp && RAMPS.some((r) => r.id === s.ramp) ? s.ramp : def.ramp || RAMPS[0].id,
    step: typeof s.step === 'boolean' ? s.step : !!def.step,
  };
  st.custom = !!(Object.keys(cls).length || st.op !== 1 || st.mode !== (def.mode || 'cls') || s.ramp || typeof s.step === 'boolean');
  st.colorOf = (k) => cls[k] || def.classes?.[k] || null;
  return st;
}
export function resetColors(key) { save(skey(key), null); }
const recent = () => (load(rkey()) || []).filter((c) => HEX.test(c)).slice(0, 8);
function pushRecent(c) { save(rkey(), [c, ...recent().filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8)); }

/* ── MapLibre 식 ── */
/** 클래스 → 색 match 식 */
export function classExpr(prop, map, fallback) {
  const pairs = Object.entries(map || {}).flatMap(([k, v]) => [k, v]);
  return pairs.length ? ['match', ['to-string', ['get', prop]], ...pairs, fallback] : fallback;
}
/** 값 → 색 띠 식(연속 = interpolate · 단계 = step 다섯 칸) */
export function rampExpr(prop, min, max, rampId, step = false) {
  const r = rampOf(rampId), n = r.stops.length, v = ['to-number', ['get', prop], min];
  const at = (i) => min + ((max - min) * i) / (n - 1);
  if (step) { const out = ['step', v, r.stops[0]]; for (let i = 1; i < n; i++) out.push(min + ((max - min) * i) / n, r.stops[i]); return out; }
  const out = ['interpolate', ['linear'], v]; r.stops.forEach((c, i) => out.push(at(i), c)); return out;
}
/** 진하기 곱하기 — 줌 interpolate/step 은 맨 바깥이어야 하므로 출력값마다 곱한다 */
export function scaleOpacity(expr, k) {
  if (k === 1 || expr == null) return expr ?? k;
  if (typeof expr === 'number') return +(expr * k).toFixed(3);
  if (Array.isArray(expr) && (expr[0] === 'interpolate' || expr[0] === 'interpolate-hcl' || expr[0] === 'interpolate-lab') && Array.isArray(expr[2]) && expr[2][0] === 'zoom') {
    return [...expr.slice(0, 3), ...expr.slice(3).map((x, i) => (i % 2 ? scaleOpacity(x, k) : x))];
  }
  if (Array.isArray(expr) && expr[0] === 'step' && Array.isArray(expr[1]) && expr[1][0] === 'zoom') {
    return [expr[0], expr[1], scaleOpacity(expr[2], k), ...expr.slice(3).map((x, i) => (i % 2 ? scaleOpacity(x, k) : x))];
  }
  return ['*', k, expr];
}
const ORIG = new WeakMap();   // map → Map(층 id → 원래 칠)
const PROPS = { fill: ['fill-color', 'fill-opacity', 'fill-outline-color'], line: ['line-color', 'line-opacity'], circle: ['circle-color', 'circle-opacity', 'circle-stroke-opacity'] };
/** 층들에 상태를 칠한다. 바꾼 것이 없으면 원래 칠로 되돌린다.
    o = { prop: 'cls'(클래스 속성), value: { prop, min, max }(척도), base: 클래스 기본색 {k: 색}, fallback, single: 한 색 층의 클래스 키, halo: 색은 두고 진하기만 바꿀 층 id } */
export function paintLayers(map, ids, st, o = {}) {
  const reg = ORIG.get(map) || new Map(); ORIG.set(map, reg);
  for (const id of ids) {
    const L = map.getLayer(id); if (!L) continue;
    const keys = PROPS[L.type]; if (!keys) continue;
    if (!reg.has(id)) reg.set(id, Object.fromEntries(keys.map((k) => [k, map.getPaintProperty(id, k)])));
    const orig = reg.get(id);
    const [cK, oK] = keys;
    if (!st || !st.custom) { for (const k of keys) map.setPaintProperty(id, k, orig[k]); continue; }
    let col;
    if (st.mode === 'scale' && o.value) col = rampExpr(o.value.prop, o.value.min ?? 0, o.value.max ?? 1, st.ramp, st.step);
    else if (o.single) col = st.cls?.[o.single] || orig[cK];                                       // 한 색 층(행정 자료 등)
    else col = Object.keys(st.cls || {}).length ? classExpr(o.prop || 'cls', { ...(o.base || {}), ...st.cls }, o.fallback || '#0FA9A0') : orig[cK];
    const isHalo = (o.halo || []).includes(id);                                                       // 헤일로(옅은 테두리)는 색은 그대로 · 진하기만
    map.setPaintProperty(id, cK, isHalo ? orig[cK] : col);
    map.setPaintProperty(id, oK, scaleOpacity(orig[oK] ?? 1, st.op));
    if (L.type === 'fill' && orig['fill-outline-color'] != null) map.setPaintProperty(id, 'fill-outline-color', orig['fill-outline-color']);
    if (L.type === 'circle') map.setPaintProperty(id, 'circle-stroke-opacity', scaleOpacity(orig['circle-stroke-opacity'] ?? 1, st.op));
  }
}

/* ── 고르기 칸 ── */
let OPEN = null;
export function closeColors() { OPEN?.close(); }
const el = (tag, attrs = {}, ...kids) => {
  const [t, ...cl] = tag.split('.');
  const e = document.createElement(t || 'div');
  if (cl.length) e.className = cl.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
const strip = (cs) => el('span.kc-strip', { 'aria-hidden': 'true', style: { background: `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${(i / cs.length) * 100}% ${((i + 1) / cs.length) * 100}%`).join(', ')})` } });
const grad = (cs) => el('span.kc-strip', { 'aria-hidden': 'true', style: { background: `linear-gradient(90deg, ${cs.join(', ')})` } });
const steps = (cs) => strip(cs);

/** 색 고르기 칸을 anchor 옆에 연다.
    o = { key, title, classes: [{k, label, color}], scale: { label, lo, hi } | null, ramp(기본 띠), defMode, beside(이 요소 오른쪽에 붙여 연다), onChange(st), onClose } */
export function colors(anchor, o) {
  if (OPEN?.anchor === anchor) { OPEN.close(); return null; }
  OPEN?.close();
  const key = skey(o.key);
  const base = Object.fromEntries((o.classes || []).map((c) => [c.k, c.color]));
  const def = { classes: base, ramp: o.ramp, mode: o.defMode || 'cls' };
  const raw = () => load(key) || {};
  const put = (patch, quiet) => { const s = { ...raw(), ...patch }; for (const k of Object.keys(s)) if (s[k] == null) delete s[k]; save(key, Object.keys(s).length ? s : null); emit(quiet); };
  const emit = (quiet) => {
    const st = colorState(o.key, def); o.onChange?.(st);
    if (!quiet) draw(); else { const b = box.querySelector('.kc-reset'); if (b) b.disabled = !st.custom; }   // 투명도 끄는 중에는 칸을 다시 그리지 않는다(끌기가 끊기지 않게)
  };

  const box = el('div.kc.t-card.t-card--map', { role: 'dialog', 'aria-label': `${o.title || ''} 색`.trim() });
  const multi = (o.classes || []).length > 1;
  let openCls = null;
  function draw() {
    const st = colorState(o.key, def);
    const kids = [];
    kids.push(el('header.kc-h', {}, el('b', { text: '색' }), o.title ? el('span', { text: o.title }) : null,
      el('button.kc-x', { type: 'button', 'aria-label': '닫기', text: '×', onclick: () => close() })));
    if (o.scale) {
      kids.push(el('div.kc-seg', { role: 'radiogroup' },
        ...[['cls', o.clsLabel || '분류'], ['scale', o.scale.label || '값']].map(([m, t]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(st.mode === m), text: t,
          onclick: () => put({ mode: m === (o.defMode || 'cls') ? null : m }) }))));
    }
    if (st.mode === 'scale' && o.scale) {
      kids.push(el('div.kc-ramps', { role: 'radiogroup', 'aria-label': '색 띠' }, ...RAMPS.map((r) => el('button.kc-ramp', { type: 'button', role: 'radio', 'aria-checked': String(st.ramp === r.id), title: r.name, 'aria-label': r.name,
        onclick: () => put({ ramp: r.id }) }, st.step ? steps(r.stops) : grad(r.stops)))));
      kids.push(el('div.kc-seg', { role: 'radiogroup' }, ...[[false, '연속'], [true, '단계']].map(([v, t]) => el('button', { type: 'button', role: 'radio', 'aria-checked': String(st.step === v), text: t, onclick: () => put({ step: v }) }))));
      const r = rampOf(st.ramp);
      kids.push(el('div.kc-key', {}, st.step ? steps(r.stops) : grad(r.stops), el('span.num', { text: o.scale.lo ?? '' }), el('span.num', { text: o.scale.hi ?? '' })));
    } else {
      if (multi) {
        kids.push(el('div.kc-sets', { role: 'radiogroup', 'aria-label': '색 묶음' }, ...PALETTES.map((p) => {
          const cs = p.colors || o.classes.map((c) => c.color);
          const on = p.id === 'base' ? !Object.keys(st.cls).length : o.classes.every((c, i) => (st.cls[c.k] || '').toLowerCase() === cs[i % cs.length].toLowerCase());
          return el('button.kc-set', { type: 'button', role: 'radio', 'aria-checked': String(on), title: p.name, 'aria-label': p.name,
            onclick: () => { if (p.id === 'base') put({ cls: null }); else put({ cls: Object.fromEntries(o.classes.map((c, i) => [c.k, cs[i % cs.length]])) }); } }, strip(o.classes.map((c, i) => cs[i % cs.length])));
        })));
      }
      const rows = (o.classes || []).map((c) => {
        const cur = st.cls[c.k] || c.color;
        const row = el('div.kc-row', { 'data-k': c.k },
          el('button.kc-c', { type: 'button', 'aria-expanded': String(openCls === c.k || !multi), 'aria-label': `${c.label || c.k} 색`, onclick: () => { openCls = openCls === c.k ? null : c.k; draw(); } },
            el('i', { style: { background: cur } }), el('span', { text: c.label || c.k })));
        if (openCls === c.k || !multi) {
          const pick = (v) => { pushRecent(v); put({ cls: { ...raw().cls, [c.k]: v } }); };
          const rc = recent();
          const inp = el('input.kc-in', { type: 'color', value: cur, 'aria-label': `${c.label || c.k} 색 직접 고르기`, onchange: (e) => pick(e.target.value) });
          row.append(...[el('div.kc-grid', { role: 'listbox', 'aria-label': '색 칸' }, ...SWATCHES.map((s) => el('button.kc-sw', { type: 'button', role: 'option', 'aria-selected': String(s.toLowerCase() === cur.toLowerCase()), title: s, 'aria-label': s, style: { background: s }, onclick: () => pick(s) }))),
            rc.length ? el('div.kc-rc', {}, el('span', { text: '최근' }), ...rc.map((s) => el('button.kc-sw', { type: 'button', title: s, 'aria-label': `최근 ${s}`, 'aria-selected': String(s.toLowerCase() === cur.toLowerCase()), style: { background: s }, onclick: () => pick(s) }))) : null,
            el('label.kc-own', {}, inp, el('span', { text: '직접' }))].filter(Boolean));
        }
        return row;
      });
      kids.push(el('div.kc-rows', {}, ...rows));
    }
    const pct = Math.round((1 - st.op) * 100);
    const rg = el('input.kc-op', { type: 'range', min: '0', max: '90', step: '5', value: String(pct), 'aria-label': '투명도',
      oninput: (e) => { const v = +e.target.value; val.textContent = `${v}%`; put({ op: v ? +(1 - v / 100).toFixed(2) : null }, true); } });
    const val = el('span.num', { text: `${pct}%` });
    kids.push(el('label.kc-opr', {}, el('span', { text: '투명도' }), rg, val));
    kids.push(el('footer.kc-f', {}, el('button.kc-reset', { type: 'button', disabled: !st.custom, text: '기본 색으로', onclick: () => { save(key, null); openCls = null; emit(); } })));
    const focusKey = document.activeElement && box.contains(document.activeElement) ? (document.activeElement.getAttribute('aria-label') || document.activeElement.textContent) : null;
    box.replaceChildren(...kids);
    if (focusKey) [...box.querySelectorAll('button,input')].find((b) => (b.getAttribute('aria-label') || b.textContent) === focusKey)?.focus({ preventScroll: true });
    place();
  }
  function place() {
    const r = anchor.getBoundingClientRect(), W = innerWidth, H = innerHeight, bw = box.offsetWidth || 312, bh = box.offsetHeight || 360;
    let x = (o.beside ? o.beside.getBoundingClientRect().right : r.right) + 8, y = r.top - 12;   // beside = 이 칸 바로 옆에(목록 칸을 가리지 않게)
    if (x + bw > W - 8) x = Math.max(8, r.left - bw - 8);
    if (y + bh > H - 8) y = Math.max(8, H - bh - 8);
    box.style.left = `${Math.round(x)}px`; box.style.top = `${Math.round(y)}px`;
  }
  const onDoc = (e) => { if (!box.contains(e.target) && !anchor.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); anchor.focus?.(); } };
  function close() {
    if (OPEN?.box !== box) return;
    OPEN = null; box.remove(); anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onDoc, true); document.removeEventListener('keydown', onKey, true); removeEventListener('resize', place);
    o.onClose?.();
  }
  document.body.append(box);
  anchor.setAttribute('aria-expanded', 'true');
  OPEN = { anchor, box, close, redraw: draw };
  draw();
  requestAnimationFrame(() => { box.classList.add('in'); box.querySelector('button:not(.kc-x),input')?.focus({ preventScroll: true }); });
  document.addEventListener('pointerdown', onDoc, true); document.addEventListener('keydown', onKey, true); addEventListener('resize', place);
  return { close, redraw: draw, el: box };
}
/** 점(색 표시) — 클래스 색 여럿이면 나눠 칠한다 */
export function dotStyle(cs) {
  const c = cs.filter(Boolean);
  if (c.length <= 1) return `background:${c[0] || '#0FA9A0'}`;
  return `background:conic-gradient(${c.slice(0, 4).map((x, i, a) => `${x} ${(i / a.length) * 360}deg ${((i + 1) / a.length) * 360}deg`).join(', ')})`;
}
export const rampColors = (id) => rampOf(id).stops.slice();
