export function countUp(el, { duration = 1200 } = {}) {
  const raw = Number(el.dataset.n); const n = Number.isFinite(raw) ? raw : 0; const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = el.querySelector('.kpi__num') || el; const t0 = performance.now(); const d = reduce ? 0 : duration;
  const fmt = (v) => Math.round(v).toLocaleString('ko-KR');
  if (!n) { text.textContent = fmt(0); return; }
  (function tick(now) { const p = d ? Math.min(1, (now - t0) / d) : 1; text.textContent = fmt(n * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(t0);
}
export function countUpAll(root = document) { root.querySelectorAll('[data-n]').forEach(el => countUp(el)); }
