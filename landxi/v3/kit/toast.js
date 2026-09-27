/* K13 toast.js — 하단 중앙 흰 카드 8 · 3.5s · 동시에 1개 · 행동 링크 ≤ 1. 문구는 화면이 준다(형식 `{동작}했습니다`).
   toast('배정했습니다') · toast('반입했습니다', { action: { label: '열기', href } | { label, onClick } }) */
import { h } from './util.js';

let cur = null, timer = 0;
export function toast(text, { action, ms = 3500 } = {}) {
  if (cur) { cur.remove(); clearTimeout(timer); }
  const el = h('div.k-toast', { role: 'status', 'aria-live': 'polite' }, h('span', { text }));
  if (action) {
    const a = action.href ? h('a.k-toast-a', { href: action.href, text: action.label }) : h('button.k-toast-a', { type: 'button', text: action.label, onclick: () => { action.onClick?.(); hide(); } });
    el.append(a);
  }
  document.body.appendChild(el); cur = el;
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  const hide = () => { if (cur !== el) return; el.classList.remove('is-in'); setTimeout(() => el.remove(), 380); cur = null; };
  timer = setTimeout(hide, ms);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(hide, 1500); });
  return { close: hide };
}
