/* K5 panel.js — 흰 카드 · 서랍 · 시트.
   서랍 = 우측 392 흰 카드(지도 위 --elev-map) · 모바일(≤640) = 하단 시트 · 스택: 동시 ≤ 3장,
   같은 자리(slot)에 새 서랍이 열리면 이전 것은 닫힘 · Esc = 최상단 닫기.
   const d = drawer({ title: '필지', body: node|html, host: stageEl, slot: 'right', onClose }); d.set(body); d.close();
   card({ title, body, map:true }) → .t-card 엘리먼트 */
import { h } from './util.js';
import { t } from './i18n.js';

const STACK = [];
const MAX = 3;

addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !STACK.length) return;
  const ae = document.activeElement;
  if (ae && /input|textarea|select/i.test(ae.tagName) && ae.value) return;   // 입력 중 Esc 는 입력이 먼저
  e.preventDefault(); STACK[STACK.length - 1].close();
});

export function drawer({ title = '', body = '', host = document.body, slot = 'right', onClose, width, label } = {}) {
  for (const d of [...STACK]) if (d.slot === slot) d.close(true);
  while (STACK.length >= MAX) STACK[0].close(true);
  const head = h('div.k-dr-h', {}, h('h2.k-dr-t', { text: title }), h('button.k-dr-x', { type: 'button', 'aria-label': t('panel.close'), html: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>' }));
  const main = h('div.k-dr-b');
  const el = h('aside.k-drawer', { role: 'dialog', 'aria-label': label || title || t('panel.close'), dataset: { slot } }, h('div.k-dr-grip', { 'aria-hidden': 'true' }), head, main);
  if (width) el.style.setProperty('--k-dr-w', typeof width === 'number' ? width + 'px' : width);
  if (host !== document.body) { el.classList.add('k-drawer--in'); if (getComputedStyle(host).position === 'static') host.style.position = 'relative'; }
  host.appendChild(el);
  const api = {
    el, slot, body: main,
    set(b) { main.innerHTML = ''; if (typeof b === 'string') main.innerHTML = b; else if (b) main.append(b); return api; },
    title(s) { head.querySelector('.k-dr-t').textContent = s; return api; },
    close(silent = false) {
      const i = STACK.indexOf(api); if (i < 0) return; STACK.splice(i, 1);
      el.classList.remove('is-open'); el.classList.add('is-closing');
      setTimeout(() => el.remove(), 380);
      if (!silent) onClose?.();
      document.dispatchEvent(new CustomEvent('kit:drawer', { detail: { open: STACK.length } }));
    },
  };
  api.set(body);
  head.querySelector('.k-dr-x').addEventListener('click', () => api.close());
  STACK.push(api);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
  document.dispatchEvent(new CustomEvent('kit:drawer', { detail: { open: STACK.length } }));
  return api;
}
export const openDrawers = () => STACK.length;
export const closeAll = () => [...STACK].forEach((d) => d.close(true));

/** 흰 카드(.t-card) — map:true 면 지도 위 그림자 */
export function card({ title, body, map = false, hero = false, cls = '' } = {}) {
  const el = h('section.t-card', { class: [map && 't-card--map', hero && 't-card--hero', cls].filter(Boolean).join(' ') });
  if (title) el.append(h('h3.k-card-t', { text: title }));
  if (typeof body === 'string') el.insertAdjacentHTML('beforeend', body); else if (body) el.append(body);
  return el;
}
