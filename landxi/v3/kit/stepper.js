/* K8 stepper.js — 공정 스텝퍼(스펙시먼 H). 가로 .t-steps / 세로 .t-steps--v(콘솔 6단 레일).
   완료 = 잉크 채움 · 현재 = 액센트 채움 · 대기 = 헤어라인. 단 이름은 화면이 준다.
   const s = stepper(el, [{ t: '반입', d: '3건' }, …], { current: 1, vertical: false, onPick: (i) => {} }); s.go(2) */
import { esc } from './util.js';

export function stepper(el, steps, { current = 0, vertical = false, onPick, done } = {}) {
  el.classList.add('t-steps', 'k-steps'); el.classList.toggle('t-steps--v', vertical);
  el.style.setProperty('--n', steps.length);
  el.setAttribute('role', 'list');
  let at = current;
  const st = (i) => (done ? (done.includes(i) ? 'done' : i === at ? 'now' : 'wait') : i < at ? 'done' : i === at ? 'now' : 'wait');
  const draw = () => {
    el.innerHTML = steps.map((s, i) => {
      const tag = onPick ? 'button' : 'div';
      return `<${tag} class="t-step" role="listitem" data-st="${st(i)}" data-i="${i}"${onPick ? ' type="button"' : ''}${i === at ? ' aria-current="step"' : ''}>
        <span class="n">${st(i) === 'done' ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>' : i + 1}</span>
        <span class="k-step-tx"><span class="t">${esc(s.t)}</span>${s.d ? `<span class="d">${esc(s.d)}</span>` : ''}</span></${tag}>`;
    }).join('');
  };
  if (onPick) el.addEventListener('click', (e) => { const b = e.target.closest('.t-step'); if (b) onPick(+b.dataset.i); });
  draw();
  return { el, go(i) { at = i; draw(); }, set(s) { steps = s; el.style.setProperty('--n', s.length); draw(); }, get current() { return at; } };
}
