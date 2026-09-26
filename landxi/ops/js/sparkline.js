/* 스파크라인 — 24px 데이터 잉크 · 60s 창(2s × 30). 값이 바뀔 때만 다시 그린다(같은 점열이면 no-op).
 * spark(host, {width, height:24, max:100, goal}) → { draw(points[{t,v}]) } */
const NS = 'http://www.w3.org/2000/svg';
const el = (t, a = {}) => { const e = document.createElementNS(NS, t); for (const [k, v] of Object.entries(a)) e.setAttribute(k, v); return e; };

export function spark(host, { width = 240, height = 24, max = 100, goal = null, windowMs = 60000, label = '' } = {}) {
  const svg = el('svg', { class: 'og-spark', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': label });
  const base = el('line', { class: 'sp-base', x1: 0, x2: width, y1: height - 0.5, y2: height - 0.5 });
  const area = el('path', { class: 'sp-area' }); const line = el('path', { class: 'sp-line' }); const dot = el('rect', { class: 'sp-dot', width: 3, height: 3 });
  svg.append(base, area);
  if (goal != null) { const y = height - (goal / max) * (height - 2) - 1; svg.append(el('line', { class: 'sp-goal', x1: 0, x2: width, y1: y, y2: y })); }
  svg.append(line, dot); host.append(svg);
  let sig = '';
  return {
    el: svg,
    draw(points = []) {
      const pts = points.filter((p) => p.v != null);
      const s = pts.map((p) => p.t + ':' + p.v).join(',');
      if (s === sig) return false; sig = s;
      if (!pts.length) { line.setAttribute('d', ''); area.setAttribute('d', ''); dot.setAttribute('opacity', 0); return true; }
      const t1 = pts[pts.length - 1].t; const t0 = t1 - windowMs;
      const X = (t) => Math.max(0, ((t - t0) / windowMs) * (width - 4)); const Y = (v) => height - (Math.min(max, Math.max(0, v)) / max) * (height - 2) - 1;
      const d = pts.filter((p) => p.t >= t0).map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)} ${Y(p.v).toFixed(1)}`).join(' ');
      line.setAttribute('d', d);
      const first = pts.find((p) => p.t >= t0) || pts[0];
      area.setAttribute('d', `${d} L${X(t1).toFixed(1)} ${height} L${X(first.t).toFixed(1)} ${height} Z`);
      const last = pts[pts.length - 1]; dot.setAttribute('x', (X(last.t) - 1.5).toFixed(1)); dot.setAttribute('y', (Y(last.v) - 1.5).toFixed(1)); dot.setAttribute('opacity', 1);
      svg.dataset.caution = goal != null && last.v > goal ? '1' : '0';
      return true;
    },
  };
}
