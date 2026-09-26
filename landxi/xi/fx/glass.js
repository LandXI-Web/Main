/* glass.js — elev-2 유리 부품 도우미(영상 무대 · 면적 ≤ 15 %). 라운드 0 · 그림자는 토큰 · 글로우 0.
   D = 법전 모션 사다리(system-v2 §3) — 이 파일 밖에서 지속값을 새로 만들지 않는다(fx/·ui/ 는 D 만 쓴다). */
export const D = { d40: 40, d60: 60, d80: 80, d120: 120, d180: 180, d380: 380, d500: 500, d750: 750, d1000: 1000, d1250: 1250, d1600: 1600, d2400: 2400,
  lockGrow: 180, lockAmber: 80, lockSettle: 120 };
export const EASE = { ui: 'cubic-bezier(.22,1,.36,1)', arrive: 'cubic-bezier(.15,1,.3,1)', cam: 'cubic-bezier(.16,1,.3,1)' };
const RM = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 텍스트 인(translateY 20 → 0 · 500 · e-arrive) — 자식 조각 60 스태거 */
export function textIn(el, { stagger = true } = {}) {
  if (RM()) return Promise.resolve();
  const kids = stagger && el.children.length ? [...el.children] : [el];
  return Promise.all(kids.map((k, i) => k.animate([{ transform: 'translateY(20px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: D.d500, delay: i * D.d60, easing: EASE.arrive, fill: 'backwards' }).finished.catch(() => {})));
}
/** 이미지 현상 clip-path inset(100% 0 0) → inset(0) · 1000 */
export function clipIn(el, delay = 0) {
  if (RM()) return Promise.resolve();
  return el.animate([{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: D.d1000, delay, easing: EASE.arrive, fill: 'backwards' }).finished.catch(() => {});
}
/** 유리 패널 열기 — 380 · e-ui (4px 아래에서) */
export function panelIn(el) {
  el.hidden = false;
  if (RM()) return Promise.resolve();
  return el.animate([{ transform: 'translateY(4px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: D.d380, easing: EASE.ui }).finished.catch(() => {});
}
export function panelOut(el) {
  if (el.hidden) return Promise.resolve();
  if (RM()) { el.hidden = true; return Promise.resolve(); }
  return el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: D.d180, easing: EASE.ui }).finished.catch(() => {}).then(() => { el.hidden = true; });
}

/** 지도 위 한 점에 카드를 붙인다(화면 밖이면 안쪽으로 접는다). 반환 detach() */
export function anchor(el, map, lngLat, { dx = 18, dy = -24, avoid = [] } = {}) {
  const place = () => {
    const p = map.project(lngLat), W = window.innerWidth, H = window.innerHeight;
    const w = el.offsetWidth || 380, h = el.offsetHeight || 300;
    let x = p.x + dx, y = p.y + dy;
    if (x + w > W - 16) x = p.x - dx - w;
    for (const r of avoid) { const b = r.getBoundingClientRect?.(); if (b && b.width && x + w > b.left - 12 && x < b.right && y < b.bottom) x = Math.min(x, b.left - 12 - w); }
    x = Math.max(16, Math.min(W - w - 16, x)); y = Math.max(16, Math.min(H - h - 112, y));
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  place();
  map.on('move', place);
  const ro = new ResizeObserver(place); ro.observe(el);
  return () => { map.off('move', place); ro.disconnect(); };
}

/** 토스트 한 줄(유리 · 3.0s 뒤 걷힘 — 걷힘은 180). basis 가 있으면 꼬리표. */
export function toast(msg, { basis = null, ms = 3000 } = {}) {
  let host = document.getElementById('xi-toasts');
  if (!host) { host = document.createElement('div'); host.id = 'xi-toasts'; host.setAttribute('aria-live', 'polite'); document.body.appendChild(host); }
  const t = document.createElement('p');
  t.className = 'cw-glass xi-toast';
  t.innerHTML = `${basis ? `<b data-basis="${basis}">${basis === 'demo' ? '시연' : basis}</b>` : ''}<span></span>`;
  t.lastChild.textContent = msg;
  host.appendChild(t);
  panelIn(t);
  setTimeout(() => panelOut(t).then(() => t.remove()), ms);
  return t;
}
