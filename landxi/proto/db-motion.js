// 모션 유틸 — 이징 하나, 지속 사다리 하나(§4 모션).
// 숫자는 글자별로 현상되고, 값은 카운트업으로 도착한다. 감소 모션에서는 즉시 최종 상태.

export const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = (t) => 1 - Math.pow(1 - t, 3);          // cubic-bezier(0.15,1,0.3,1) 근사

/** 글자별 35~50ms 스태거 현상. 숫자·기호를 각각 span 으로 쪼갠다. */
export function develop(el, text) {
  const s = String(text);
  if (el.dataset.shown === s) return;
  el.dataset.shown = s;
  el.textContent = '';
  const frag = document.createDocumentFragment();
  [...s].forEach((ch, i) => {
    const sp = document.createElement('span');
    sp.className = 'ch';
    sp.textContent = ch;
    sp.style.setProperty('--i', i);
    frag.append(sp);
  });
  el.append(frag);
  if (REDUCED()) el.classList.add('is-in');
  else { el.classList.remove('is-in'); requestAnimationFrame(() => el.classList.add('is-in')); }
}

/**
 * 0 → target 카운트업. 도착하면 글자별 현상으로 마무리한다.
 * @returns {Promise<void>}
 */
export function countUp(el, target, { dur = 1000, fmt = (n) => new Intl.NumberFormat('ko-KR').format(n) } = {}) {
  el.dataset.target = String(target);
  if (REDUCED()) { develop(el, fmt(target)); el.dataset.done = '1'; return Promise.resolve(); }
  return new Promise((res) => {
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const v = Math.round(EASE(p) * target);
      el.textContent = fmt(v);
      if (p < 1) requestAnimationFrame(step);
      else { el.dataset.shown = ''; develop(el, fmt(target)); el.dataset.done = '1'; res(); }
    };
    requestAnimationFrame(step);
  });
}

/** 한 번만 실행되는 뷰포트 진입 관찰자. */
export function onceInView(el, fn, rootMargin = '0px 0px -20% 0px') {
  if (!('IntersectionObserver' in window)) { fn(); return; }
  const io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) { io.disconnect(); fn(); }
  }, { rootMargin, threshold: 0.15 });
  io.observe(el);
}
