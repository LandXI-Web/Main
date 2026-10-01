/* K17 modal.js — 가운데 창. 화면 가운데 흰 카드 16(법전 §3 · 모달 --elev-3 · 바탕 --dim-modal) · 휴대폰(≤ 640)은 거의 전체 화면.
   닫기 = Esc · 바깥(어두운 바탕) 누르기 · × . 열린 동안 뒤 화면은 스크롤·초점이 막힌다(초점은 창 안에서 돈다). 닫으면 연 자리로 초점을 돌려준다.
   const m = modal({ title: '계정 찾기 · 신청', body: node|html, onClose, size: 'md'|'lg', label });
   m.set(body) · m.title('…') · m.close() · m.el(창) · m.body(몸통)
   스타일은 같은 폴더 modal.css — 처음 열 때 스스로 붙인다(화면이 따로 <link> 하지 않아도 된다).
   서랍(K5)과 함께 열려 있으면 Esc 는 가운데 창이 먼저 받는다. */
import { h } from './util.js';
import { t } from './i18n.js';

const CSS = new URL('./modal.css', import.meta.url).href;
const STACK = [];
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function sheet() {
  if (document.querySelector('link[data-k-modal]')) return;
  document.head.append(h('link', { rel: 'stylesheet', href: CSS, 'data-k-modal': '' }));
}

/* Esc · Tab — 창을 먼저(잡기 단계 · 서랍의 Esc 보다 앞) */
addEventListener('keydown', (e) => {
  const top = STACK[STACK.length - 1];
  if (!top) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); top.close(); return; }
  if (e.key !== 'Tab') return;
  const f = [...top.el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
  if (!f.length) { e.preventDefault(); top.el.focus(); return; }
  const first = f[0], last = f[f.length - 1];
  if (!top.el.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}, true);

let seq = 0;
export function modal({ title = '', body = '', onClose, size = 'md', label } = {}) {
  sheet();
  const opener = document.activeElement;
  const tid = 'k-md-t' + (++seq);
  const x = h('button.k-md-x', { type: 'button', 'aria-label': t('panel.close'), html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>' });
  const head = h('div.k-md-h', {}, h('h2.k-md-t', { id: tid, text: title }), x);
  const main = h('div.k-md-b');
  const el = h('div.k-md', { role: 'dialog', 'aria-modal': 'true', tabindex: '-1', dataset: { size }, ...(label ? { 'aria-label': label } : { 'aria-labelledby': tid }) }, head, main);
  const bg = h('div.k-md-bg', {}, el);
  document.body.append(bg);
  document.documentElement.classList.add('k-md-open');

  let closed = false;
  const api = {
    el, body: main, bg,
    set(b) { main.innerHTML = ''; if (typeof b === 'string') main.innerHTML = b; else if (b) main.append(b); return api; },
    title(s) { head.querySelector('.k-md-t').textContent = s; return api; },
    close(silent = false) {
      if (closed) return; closed = true;
      const i = STACK.indexOf(api); if (i >= 0) STACK.splice(i, 1);
      bg.classList.remove('is-open'); bg.classList.add('is-closing');
      setTimeout(() => bg.remove(), RM() ? 0 : 380);
      if (!STACK.length) document.documentElement.classList.remove('k-md-open');
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
      if (!silent) onClose?.();
      document.dispatchEvent(new CustomEvent('kit:modal', { detail: { open: STACK.length } }));
    },
  };
  api.set(body);
  x.addEventListener('click', () => api.close());
  /* 바깥 누르기 — 누르기와 떼기가 둘 다 바깥일 때만(창 안에서 끌다가 바깥에서 뗀 것은 닫지 않는다) */
  let down = false;
  bg.addEventListener('pointerdown', (e) => { down = e.target === bg; });
  bg.addEventListener('click', (e) => { if (down && e.target === bg) api.close(); down = false; });
  STACK.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => bg.classList.add('is-open')));
  const first = main.querySelector('[autofocus]') || main.querySelector('input:not([type=hidden]),select,textarea') || x;
  setTimeout(() => (first || el).focus({ preventScroll: true }), 0);
  document.dispatchEvent(new CustomEvent('kit:modal', { detail: { open: STACK.length } }));
  return api;
}
export const openModals = () => STACK.length;
