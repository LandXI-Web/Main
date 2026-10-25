/* swipe.js — 카드 그림 원본 ↔ AI 결과 밀어 보기(10-25 원칙 339 · 분석 서비스 갤러리 · 자세히 · 서비스 카드 관리 · 배포 신청 승인).
   같은 틀 두 장을 포갠 한 그림. 처음 보일 때 한 번: 원본에서 오른쪽으로 넘어가며 결과(1.5 s) · 결과에서 멈춤.
   그 뒤 끌기 · 마우스를 따라 움직이고, 마우스가 나가면 결과로. 움직임 줄이기 설정이면 결과를 바로. 키보드 ← → (범위 입력). CSS: kit/swipe.css */
import { h, API } from './util.js';

export function absSrc(u) { return String(u || '').startsWith('/api/') ? API.base + u : u; }
/** scene = {src(결과), swipe:{before(원본), labels:[둘], legend:[[색, 말]…]}} → 밀어 보기 상자(부모가 position 을 가진 칸 · 상자는 inset 0) */
export function swipePic(scene, onerror) {
  const sw = scene.swipe;
  const labels = (sw.labels && sw.labels.length === 2) ? sw.labels : ['원본', 'AI 결과'];
  const base = h('img.la-swp-b', { src: absSrc(sw.before), alt: '', loading: 'lazy', decoding: 'async', onerror });
  const res = h('img.la-swp-r', { src: absSrc(scene.src), alt: '', decoding: 'async', onerror });   // 지연 읽기 없음 — 처음엔 다 가려져 있어 브라우저가 영영 안 읽는다
  const lab = h('span.la-swp-lab', {}, h('b.l', { text: labels[0] }), h('i', { 'aria-hidden': 'true' }), h('b.r', { text: labels[1] }));
  const leg = (sw.legend || []).length ? h('span.la-swp-leg', {}, ...sw.legend.map(([c, w]) => h('span', {}, h('i', { style: { background: c } }), w))) : null;
  const range = h('input.la-swp-in', { type: 'range', min: '0', max: '100', step: '1', value: '0', 'aria-label': `${labels[0]}과 ${labels[1]} 밀어 보기` });
  const box = h('div.la-swp', { dataset: { side: 'l' } }, base, res, h('span.la-swp-bar', { 'aria-hidden': 'true' }), lab, leg, range);
  let v = 0, raf = 0, played = false, auto = false, hand = false;     // auto = 처음 한 번 넘어가는 중 · hand = 사람이 움직인 뒤
  const set = (x) => { v = Math.max(0, Math.min(100, x)); box.style.setProperty('--v', v + '%'); box.dataset.side = v >= 50 ? 'r' : 'l'; range.value = String(Math.round(v)); };
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const glide = (to, ms, done) => { cancelAnimationFrame(raf); const from = v, t0 = performance.now();
    const step = (now) => { const t = Math.min(1, (now - t0) / ms); set(from + (to - from) * ease(t)); if (t < 1) raf = requestAnimationFrame(step); else done?.(); }; raf = requestAnimationFrame(step); };
  const ready = () => Promise.all([base, res].map((im) => (im.complete && im.naturalWidth ? Promise.resolve() : im.decode().catch(() => {}))));
  box.play = () => { if (played) return; played = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { set(100); box.dataset.done = '1'; return; }
    ready().then(() => { if (hand) return; auto = true; glide(100, 1500, () => { auto = false; box.dataset.done = '1'; }); }); };
  const take = () => { played = true; hand = true; auto = false; cancelAnimationFrame(raf); box.dataset.done = '1'; };
  range.addEventListener('input', () => { take(); set(+range.value); });
  box.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' || auto) return;          // 처음 한 번 넘어가는 동안은 마우스를 따르지 않는다
    take(); const r = box.getBoundingClientRect(); set(((e.clientX - r.left) / r.width) * 100); });
  box.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && hand) glide(100, 350); });   // 나가면 결과로
  set(0);
  if (!('IntersectionObserver' in window)) box.play();
  else {
    const io = swipePic.io || (swipePic.io = new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { swipePic.io.unobserve(en.target); en.target.play?.(); } }), { threshold: 0.4 }));
    io.observe(box);
  }
  return box;
}

