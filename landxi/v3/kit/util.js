/* util.js — 키트 내부 공용(화면도 써도 된다). 글자·DOM·모션 도우미 한 곳. */
import { API, api, session, isEnvelope, fmt } from '../../shared/api-v1.js';

export { API, api, session, isEnvelope, fmt };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** h('div.t-card', {attrs}, children…) — 작은 엘리먼트 공장 */
export function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  return el;
}

export const LS = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 창 */ } },
};

export const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const isDev = () => new URLSearchParams(location.search).get('dev') === '1';
export const isMobile = () => matchMedia('(max-width: 960px)').matches;

/** 법전 --e-cam(.16,1,.3,1) — JS 모션용 */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t, sy = (t) => ((ay * t + by) * t + cy) * t;
  return (x) => { if (x <= 0) return 0; if (x >= 1) return 1; let lo = 0, hi = 1, t = x; for (let i = 0; i < 22; i++) { const v = sx(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; } return sy(t); };
}
export const E_CAM = bezier(0.16, 1, 0.3, 1);
export const E_UI = bezier(0.22, 1, 0.36, 1);

/** 등장 — .t-enter 에 is-in 을 붙인다(뷰포트에 들어올 때). 스태거는 토큰 CSS 가 맡는다. */
export function enter(root = document) {
  const els = $$('.t-enter:not(.is-in)', root);
  if (RM() || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('is-in')); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { threshold: 0.12 });
  els.forEach((e) => io.observe(e));
}

/** 시각 HH:MM(로캘 무관 24h) */
export const hhmm = (d = new Date()) => { const x = new Date(d); return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`; };
/** 날짜 2026.09.24 */
export const ymd = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? `${m[1]}.${m[2]}.${m[3]}` : ''; };

/** GeoJSON bbox */
export function bboxOf(g) {
  let a = [180, 90, -180, -90];
  const walk = (c) => { if (typeof c[0] === 'number') a = [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[2], c[0]), Math.max(a[3], c[1])]; else c.forEach(walk); };
  if (!g) return null;
  if (g.type === 'FeatureCollection') g.features.forEach((f) => f.geometry && walk(f.geometry.coordinates));
  else if (g.type === 'Feature') walk(g.geometry.coordinates);
  else if (g.coordinates) walk(g.coordinates);
  return a[0] > a[2] ? null : a;
}

/* 서버에 경로가 있는가(신설 API 가 아직 없을 때 404 로 콘솔을 더럽히지 않게 · 게이트웨이 openapi 한 번 읽기) */
let ROUTES = null;
export async function hasRoute(path) {
  if (!ROUTES) ROUTES = fetch(API.prefix + '/openapi.json', { cache: 'force-cache' }).then((r) => (r.ok ? r.json() : null)).then((j) => (j ? Object.keys(j.paths || {}).map((p) => p.replace(/^\/api\/v1/, '')) : null)).catch(() => null);
  const list = await ROUTES;
  if (!list) return false;
  const want = path.split('?')[0];
  return list.some((p) => p === want || new RegExp('^' + p.replace(/\{[^}]+\}/g, '[^/]+') + '$').test(want));
}
