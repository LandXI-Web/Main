/* K13 toast.js — 하단 중앙 흰 카드 8 · 3.5s · 동시에 1개 · 행동 링크 ≤ 1. 문구는 화면이 준다(형식 `{동작}했습니다`).
   toast('저장했습니다') · toast('반입했습니다', { action: { label: '열기', href } | { label, onClick } }) */
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
  /* 좁은 화면(≤ 960) — 머리줄 바로 아래(11-01 원칙 309 · 아래 가운데는 본문 단추를 덮음). 거기서도 단추 · 입력을 덮으면 머리줄 위(위쪽 여백)에 겹쳐 띄운다.
     반투명 없이 · 시간은 그대로. PC 는 예전처럼 아래 가운데. */
  if (matchMedia('(max-width: 960px)').matches) {
    const mast = document.querySelector('.k-mast')?.getBoundingClientRect();
    el.style.bottom = 'auto';
    el.style.top = Math.round((mast && mast.height ? mast.bottom : 0) + 8) + 'px';
    const r0 = el.getBoundingClientRect(), top0 = parseFloat(el.style.top);
    const a = { left: r0.left, right: r0.right, top: top0, bottom: top0 + el.offsetHeight };   // 들어오는 움직임(위로 12px) 전의 마지막 자리로 잰다
    const covers = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[role=tab]')].some((x) => {
      if (el.contains(x) || x.closest('.k-mast,[hidden]')) return false;
      const r = x.getBoundingClientRect();
      return r.width > 1 && Math.min(a.right, r.right) - Math.max(a.left, r.left) > 4 && Math.min(a.bottom, r.bottom) - Math.max(a.top, r.top) > 4;
    });
    if (covers) el.style.top = '6px';
  }
  /* 업로드 상태 창과 겹치면 그 창 위로 올린다(11-01 — 알림 문구가 업로드 창을 덮음 · 원칙 309) · PC */
  const up = document.querySelector('#k-up');
  if (!matchMedia('(max-width: 960px)').matches && up && !up.hidden && getComputedStyle(up).display !== 'none') {
    const a = up.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0 && Math.min(a.bottom, b.bottom + 40) - Math.max(a.top, b.top) > 0) el.style.bottom = Math.round(innerHeight - a.top + 12) + 'px';
  }
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
  const hide = () => { if (cur !== el) return; el.classList.remove('is-in'); setTimeout(() => el.remove(), 380); cur = null; };
  timer = setTimeout(hide, ms);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(hide, 1500); });
  return { close: hide };
}
